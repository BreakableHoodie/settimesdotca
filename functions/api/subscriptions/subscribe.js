// Subscription endpoint
// POST /api/subscriptions/subscribe

import { generateToken } from '../../utils/tokens.js';
import { sendEmail, isEmailConfigured } from '../../utils/email.js';
import { isValidEmail } from '../../utils/validation.js';

const FREQUENCY_OPTIONS = new Set(['daily', 'weekly', 'monthly']);
const MAX_EMAIL_LENGTH = 320;
const MAX_CITY_LENGTH = 100;
const MAX_GENRE_LENGTH = 100;
const MAX_FREQUENCY_LENGTH = 20;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function verifyTurnstile(request, env, token) {
  const secret = env?.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return true;
  }

  if (!token || typeof token !== 'string') {
    return false;
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const formData = new URLSearchParams();
  formData.set('secret', secret);
  formData.set('response', token);
  if (ip) {
    formData.set('remoteip', ip);
  }

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      }
    );

    const result = await response.json().catch(() => ({}));
    return Boolean(result?.success);
  } catch (_error) {
    return false;
  }
}

// Build a JSON Response, merging an optional verificationUrl when email
// delivery was skipped so local/dev environments can verify without email.
function subscriptionResponse(body, status, emailResult) {
  const payload =
    !emailResult.delivered && emailResult.reason === 'not_configured'
      ? { ...body, verificationUrl: emailResult.verifyUrl }
      : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const genre = typeof body.genre === 'string' ? body.genre.trim() : '';
    const frequency =
      typeof body.frequency === 'string'
        ? body.frequency.trim().toLowerCase()
        : '';
    const turnstileToken = body.turnstileToken;

    // Validation
    if (!email || email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!city || !genre || !frequency) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (
      city.length > MAX_CITY_LENGTH ||
      genre.length > MAX_GENRE_LENGTH ||
      frequency.length > MAX_FREQUENCY_LENGTH
    ) {
      return new Response(
        JSON.stringify({ error: 'One or more fields exceed maximum length' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!FREQUENCY_OPTIONS.has(frequency)) {
      return new Response(
        JSON.stringify({ error: 'Invalid frequency value' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const turnstileValid = await verifyTurnstile(request, env, turnstileToken);
    if (!turnstileValid) {
      return new Response(
        JSON.stringify({ error: 'Bot verification failed' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate tokens
    const verificationToken = generateToken();
    const unsubscribeToken = generateToken();

    // Check if subscription already exists
    const { results: existing } = await env.DB.prepare(
      `
      SELECT id, verified, verification_token FROM email_subscriptions
      WHERE email = ? AND city = ? AND genre = ?
    `
    )
      .bind(email, city, genre)
      .all();

    if (existing.length > 0) {
      if (existing[0].verified) {
        return new Response(
          JSON.stringify({
            error: 'You are already subscribed to this feed',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } else {
        // Re-send verification email
        const emailResult = await sendVerificationEmail(
          env,
          email,
          city,
          genre,
          existing[0].verification_token
        );

        if (!emailResult.delivered && emailResult.reason === 'not_configured') {
          return subscriptionResponse(
            {
              message:
                'Email delivery is not configured. Use the link below to verify your subscription.',
            },
            200,
            emailResult
          );
        }

        return new Response(
          JSON.stringify({
            message: 'Verification email sent. Please check your inbox.',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Create subscription
    let result;
    try {
      result = await env.DB.prepare(
        `
        INSERT INTO email_subscriptions (email, city, genre, frequency, verification_token, unsubscribe_token)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
        .bind(email, city, genre, frequency, verificationToken, unsubscribeToken)
        .run();
    } catch (insertError) {
      if (insertError?.message?.includes('UNIQUE constraint failed')) {
        return new Response(
          JSON.stringify({ error: 'You are already subscribed to this feed' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw insertError;
    }

    // Send verification email
    const emailResult = await sendVerificationEmail(env, email, city, genre, verificationToken);

    if (!emailResult.delivered && emailResult.reason === 'not_configured') {
      return subscriptionResponse(
        {
          message:
            'Subscription created. Email delivery is not configured; use the link below to verify your subscription.',
        },
        201,
        emailResult
      );
    }

    return new Response(
      JSON.stringify({
        message: 'Subscription created. Please check your email to verify.',
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Subscription error:', error);
    return new Response(JSON.stringify({ error: 'Subscription failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function sendVerificationEmail(env, email, city, genre, token) {
  const baseUrl = env.PUBLIC_URL || 'http://localhost:5173';
  const verifyUrl = `${baseUrl}/verify?token=${token}`;
  const subject = 'Confirm your SetTimes subscription';
  const safeCity = escapeHtml(city);
  const safeGenre = escapeHtml(genre);
  const text = `Please confirm your subscription.\n\nVerify: ${verifyUrl}\n\nCity: ${city}\nGenre: ${genre}`;
  const html = `
    <p>Please confirm your subscription.</p>
    <p><a href="${verifyUrl}">Verify your email</a></p>
    <p>City: ${safeCity}<br/>Genre: ${safeGenre}</p>
  `.trim();

  if (isEmailConfigured(env)) {
    const emailResult = await sendEmail(env, {
      to: email,
      subject,
      text,
      html,
    });
    return { ...emailResult, verifyUrl };
  } else {
    console.warn(
      '[Subscribe] Email not configured; verification email was not sent.'
    );
    return { delivered: false, reason: 'not_configured', verifyUrl };
  }
}
