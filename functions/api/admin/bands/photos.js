/**
 * Band Photo Upload API
 * POST /api/admin/bands/photos
 *
 * Handles photo uploads to R2 bucket for band profiles.
 * Supports image validation, optimization, and secure file storage.
 */

import { checkPermission } from '../_middleware.js';

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
];

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const permCheck = await checkPermission(request, env, 'editor');
    if (permCheck.error) {
      return permCheck.response;
    }
    const { user } = permCheck;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('photo');
    const bandId = formData.get('band_id'); // Optional: associate with band

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'No photo file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .toLowerCase();
    const filename = `band-photos/${timestamp}-${sanitizedName}`;

    // Upload to R2 bucket
      await env.BAND_PHOTOS.put(filename, file.stream(), {
      httpMetadata: {
        contentType: file.type
      },
      customMetadata: {
          uploadedBy: user.email,
        uploadedAt: new Date().toISOString(),
        originalName: file.name,
        ...(bandId && { bandId: bandId.toString() })
      }
    });

    // Generate public URL (assumes R2 bucket has public access configured)
    // In production, you'll configure a custom domain or use R2 public URL
    const publicUrl = `https://band-photos.settimes.ca/${filename}`;

    // If band_id provided, update the band record
    if (bandId) {
      await env.DB.prepare(
        'UPDATE bands SET photo_url = ? WHERE id = ?'
      ).bind(publicUrl, Number(bandId)).run();
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        filename,
        size: file.size,
        type: file.type
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Photo upload error:', error);
    return new Response(
      JSON.stringify({
        error: 'Photo upload failed',
        details: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * DELETE /api/admin/bands/photos/:filename
 * Delete a photo from R2 bucket
 */
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    const permCheck = await checkPermission(request, env, 'editor');
    if (permCheck.error) {
      return permCheck.response;
    }

    // Extract filename from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const encodedSegment = pathParts[pathParts.length - 1];
    if (!encodedSegment || encodedSegment === 'photos') {
      return new Response(
        JSON.stringify({ error: 'Filename required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const objectKey = decodeURIComponent(encodedSegment);
    if (!objectKey.startsWith('band-photos/')) {
      return new Response(
        JSON.stringify({ error: 'Invalid key' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete from R2 bucket
    await env.BAND_PHOTOS.delete(objectKey);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Photo deletion error:', error);
    return new Response(
      JSON.stringify({
        error: 'Photo deletion failed',
        details: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
