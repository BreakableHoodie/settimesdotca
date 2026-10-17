import { hashPassword } from "../../../utils/crypto.js";
import { isValidEmail, validatePassword, FIELD_LIMITS } from "../../../utils/validation.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";
import { isEmailConfigured, sendEmail } from "../../../utils/email.js";
import { buildActivationEmail } from "../../../utils/emailTemplates.js";
import {
  AUTH_ATTEMPT_TYPES,
  checkAuthRateLimit,
  toSqliteDateTime,
  writeAuthAttempt,
} from "../../../utils/authAttempts.js";
import { logger } from "../../../utils/logger.js";
import { getPublicBaseUrl } from "../../../utils/publicUrl.js";
import { auditLog } from "../_middleware.js";
import { hashInviteCode } from "../../../utils/inviteCodes.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Invite code is required for signup" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const { email: rawEmail, password, name, firstName, lastName, role, inviteCode } = body;
    // login.js lowercases the email it looks up, so an account stored as typed
    // ("Jay@Example.com") could never sign in. Normalise the same way here.
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;

    // SECURITY: Require invite code for all signups
    if (!inviteCode) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invite code is required for signup",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validation
    if (!email || !password) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Email and password are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Email format validation
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid email format",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check rate limit
    const rateCheck = await checkAuthRateLimit(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.signup,
      email,
      ipAddress,
      scope: "email-or-ip",
    });
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many attempts",
          message: `Too many failed signup attempts. Please try again in ${rateCheck.remainingMinutes} minutes.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Password strength validation
    const passwordCheck = validatePassword(password, {
      minLength: FIELD_LIMITS.password.min,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecial: true,
    });
    if (!passwordCheck.valid) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: passwordCheck.errors[0],
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // SECURITY: invite codes are stored as digests (#1334), so every lookup
    // below binds the hash. A submitted `sha256:...` or `retired:<id>` is hashed
    // like any other string and matches nothing.
    const inviteCodeHash = await hashInviteCode(inviteCode);

    // SECURITY: Validate invite code
    const invite = await DB.prepare(
      `
      SELECT * FROM invite_codes
      WHERE code = ?
      AND is_active = 1
      AND expires_at > datetime('now')
      AND used_by_user_id IS NULL
      AND used_at IS NULL
    `,
    )
      .bind(inviteCodeHash)
      .first();

    if (!invite) {
      // Log failed signup attempt
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.signup,
        email,
        failureReason: "invalid_invite_code",
        ipAddress,
        success: false,
        userAgent: request.headers.get("User-Agent") || "unknown",
      });

      return new Response(
        JSON.stringify({
          error: "Invalid invite code",
          message: "The invite code is invalid, expired, or has already been used",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // If invite is email-restricted, verify email matches
    if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.signup,
        email,
        failureReason: "email_mismatch",
        ipAddress,
        success: false,
        userAgent: request.headers.get("User-Agent") || "unknown",
      });

      return new Response(
        JSON.stringify({
          error: "Email mismatch",
          message: "This invite code is restricted to a different email address",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // SECURITY: Use role from invite code, not from request
    // This prevents privilege escalation
    const userRole = invite.role;

    // Ignore any role parameter passed by client to prevent privilege escalation
    if (role === "admin") {
      console.warn(`Signup attempt with admin role blocked for email: ${email}`);
    }

    // Check if user already exists
    const existingUser = await DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();

    if (existingUser) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "Email already registered",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const fallbackName = name !== undefined && name !== null ? String(name).trim() : "";
    let resolvedFirstName = firstName !== undefined && firstName !== null ? String(firstName).trim() : "";
    let resolvedLastName = lastName !== undefined && lastName !== null ? String(lastName).trim() : "";

    if ((!resolvedFirstName || !resolvedLastName) && fallbackName) {
      const parts = fallbackName.split(/\s+/).filter(Boolean);
      if (!resolvedFirstName) {
        resolvedFirstName = parts[0] || "";
      }
      if (!resolvedLastName) {
        resolvedLastName = parts.slice(1).join(" ");
      }
    }

    if (!resolvedFirstName || !resolvedLastName) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "First name and last name are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const resolvedName = `${resolvedFirstName} ${resolvedLastName}`.trim();

    // Hash password
    const passwordHash = await hashPassword(password);

    const activationToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    // SEC-F1 class (#670): must be space-separated to compare correctly
    // against D1's datetime('now') in activate.js's SQL expiry guard.
    const activationExpires = toSqliteDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000));

    // Create the user AND claim the invite as ONE atomic step (#1255).
    //
    // The SELECT above validated the invite, but between it and here sits an
    // awaited hash, so two signups racing one code could both pass it. The old
    // claim (`UPDATE ... WHERE code = ?`, result unchecked) then let both create
    // an account at the invite's role, which can be admin.
    //
    // Now the INSERT only fires while the invite is STILL unclaimed (the same
    // predicate as the validation SELECT), and the claim UPDATE fires exactly
    // when the INSERT did, because it requires the user that INSERT created.
    // "Unused" means used_by_user_id IS NULL AND used_at IS NULL: deleting the
    // user SETs used_by_user_id NULL (FK), which alone would reopen the invite.
    // A claim keyed only on `used_by_user_id IS NULL` stamped used_at on an
    // invite that closed mid-request, with no user behind it. D1 runs a batch
    // as one transaction and serialises writers, so of two racing batches only
    // the first inserts anyone; the second inserts nothing and reports
    // changes === 0.
    const INVITE_STILL_OPEN = `EXISTS (
      SELECT 1 FROM invite_codes
      WHERE code = ? AND is_active = 1 AND expires_at > datetime('now') AND used_by_user_id IS NULL AND used_at IS NULL
    )`;
    const [created, claimed] = await DB.batch([
      DB.prepare(
        `INSERT INTO users (email, password_hash, name, first_name, last_name, role, is_active, activation_token, activation_token_expires_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${INVITE_STILL_OPEN}`,
      ).bind(
        email,
        passwordHash,
        resolvedName || null,
        resolvedFirstName || null,
        resolvedLastName || null,
        userRole,
        0,
        activationToken,
        activationExpires,
        inviteCodeHash,
      ),
      // The claim is keyed on the user THIS batch inserted (found by this
      // request's fresh activation token), not on a second clock check. D1
      // keeps datetime('now') stable within a statement, not across them: an
      // invite expiring between the two would let the INSERT commit while the
      // claim matched nothing, returning 201 with the invite still open.
      DB.prepare(
        `UPDATE invite_codes
         SET used_by_user_id = (SELECT id FROM users WHERE activation_token = ?), used_at = datetime('now')
         WHERE code = ? AND used_by_user_id IS NULL AND used_at IS NULL
           AND EXISTS (SELECT 1 FROM users WHERE activation_token = ?)`,
      ).bind(activationToken, inviteCodeHash, activationToken),
    ]);

    // Only an EXPLICIT changes === 0 means "lost the race" (CLAUDE.md: an
    // absent meta must not turn a committed write into a false failure).
    if (created?.meta?.changes === 0) {
      await writeAuthAttempt(DB, {
        attemptType: AUTH_ATTEMPT_TYPES.signup,
        email,
        failureReason: "invite_already_used",
        ipAddress,
        success: false,
        userAgent: request.headers.get("User-Agent") || "unknown",
      });
      return new Response(
        JSON.stringify({
          error: "Invalid invite code",
          message: "The invite code is invalid, expired, or has already been used",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const user = await DB.prepare("SELECT id, email, name, first_name, last_name, role FROM users WHERE email = ?")
      .bind(email)
      .first();
    if (!user) {
      throw new Error("signup: user row missing after a committed create");
    }

    // The claim fires exactly when the INSERT did, so this should be
    // unreachable. The batch has committed and cannot be rolled back; make a
    // reusable invite loud rather than silent. (Never log the code itself:
    // an unclaimed invite is a live credential.)
    if (claimed?.meta?.changes === 0) {
      console.error(`signup: user ${user.id} created but their invite was not claimed; deactivate it by hand`);
    }

    // Also an audit row, not just an auth attempt (#1143). An admin creating a
    // user via users.js writes `user.created`; a self-signup through an invite
    // code wrote only to auth_attempts, so the same event was recorded in two
    // different places depending on the route taken. Attributed to the new user
    // themselves -- they are the actor; there is no session yet.
    await auditLog(env, user.id, "user.created", "user", user.id, { email, via: "invite_signup" }, ipAddress);

    // Log successful signup
    await writeAuthAttempt(DB, {
      attemptType: AUTH_ATTEMPT_TYPES.signup,
      email,
      ipAddress,
      success: true,
      userAgent: request.headers.get("User-Agent") || "unknown",
      userId: user.id,
    });

    const baseUrl = getPublicBaseUrl(env);
    const activationUrl = new URL("/activate", baseUrl);
    activationUrl.searchParams.set("token", activationToken);

    let emailResult = { delivered: false, reason: "not_configured" };
    logger.debug("checking email configuration for activation email", {
      userId: user.id,
    });

    if (isEmailConfigured(env)) {
      logger.debug("email configured, sending activation email", {
        userId: user.id,
      });
      const emailPayload = buildActivationEmail({
        activationUrl: activationUrl.toString(),
        recipientName: resolvedName || null,
      });

      emailResult = await sendEmail(env, {
        to: email,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
      });
      logger.debug("activation email delivery attempted", { userId: user.id });
    } else {
      console.warn("[Signup] Email not configured; activation email was not sent.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account created. Please check your email to activate your account.",
        requiresActivation: true,
        email: { delivered: !!emailResult?.delivered },
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to create account",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
