/**
 * Band Photo Upload API
 * POST /api/admin/bands/photos
 *
 * Handles photo uploads to R2 bucket for band profiles.
 * Supports image validation, optimization, and secure file storage.
 */

import { checkPermission } from "../_middleware.js";

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Detect the true MIME type from the file's magic bytes.
 * Rejects client-supplied Content-Type and validates the actual file header.
 * @param {File} file
 * @returns {Promise<string|null>} Detected MIME type or null if unrecognised.
 */
async function detectMimeType(file) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const length = header.length;

  // JPEG: FF D8 FF
  if (length >= 3 &&
      header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A (full 8-byte signature)
  if (length >= 8 &&
      header[0] === 0x89 && header[1] === 0x50 &&
      header[2] === 0x4E && header[3] === 0x47 &&
      header[4] === 0x0D && header[5] === 0x0A &&
      header[6] === 0x1A && header[7] === 0x0A) {
    return "image/png";
  }
  // GIF87a / GIF89a: 47 49 46 38 37|39 61 (full 6-byte signature)
  if (length >= 6 &&
      header[0] === 0x47 && header[1] === 0x49 &&
      header[2] === 0x46 && header[3] === 0x38 &&
      (header[4] === 0x37 || header[4] === 0x39) &&
      header[5] === 0x61) {
    return "image/gif";
  }
  // WebP: RIFF (52 49 46 46) + 4-byte length + WEBP (57 45 42 50)
  if (length >= 12 &&
      header[0] === 0x52 && header[1] === 0x49 &&
      header[2] === 0x46 && header[3] === 0x46 &&
      header[8] === 0x57 && header[9] === 0x45 &&
      header[10] === 0x42 && header[11] === 0x50) {
    return "image/webp";
  }

  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const permCheck = await checkPermission(context, "editor");
    if (permCheck.error) {
      return permCheck.response;
    }
    const { user } = permCheck;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("photo");
    const bandId = formData.get("band_id"); // Optional: associate with band

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No photo file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: `File too large. Maximum size is ${
            MAX_FILE_SIZE / 1024 / 1024
          }MB`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate MIME type via magic bytes — ignores attacker-controlled file.type.
    const detectedType = await detectMimeType(file);
    if (!detectedType || !ALLOWED_TYPES.includes(detectedType)) {
      return new Response(
        JSON.stringify({
          error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .toLowerCase();
    const filename = `band-photos/${timestamp}-${sanitizedName}`;

    // Upload to R2 bucket — use the server-verified type, not the client-supplied one.
    await env.BAND_PHOTOS.put(filename, file.stream(), {
      httpMetadata: {
        contentType: detectedType,
      },
      customMetadata: {
        uploadedBy: user.email,
        uploadedAt: new Date().toISOString(),
        originalName: file.name,
        ...(bandId && { bandId: bandId.toString() }),
      },
    });

    // Generate public URL (assumes R2 bucket has public access configured)
    // In production, you'll configure a custom domain or use R2 public URL
    const publicUrl = `https://band-photos.settimes.ca/${filename}`;

    // If band_id provided, update the band profile record
    if (bandId) {
      const bandIdValue = bandId.toString();
      let bandProfileId = null;

      if (bandIdValue.startsWith("profile_")) {
        bandProfileId = Number(bandIdValue.replace("profile_", ""));
      } else if (!Number.isNaN(Number(bandIdValue))) {
        const performance = await env.DB.prepare(
          "SELECT band_profile_id FROM performances WHERE id = ?"
        )
          .bind(Number(bandIdValue))
          .first();

        bandProfileId = performance?.band_profile_id ?? null;
        if (!bandProfileId) {
          const profile = await env.DB.prepare(
            "SELECT id FROM band_profiles WHERE id = ?"
          )
            .bind(Number(bandIdValue))
            .first();
          bandProfileId = profile?.id ?? null;
        }
      }

      if (bandProfileId) {
        await env.DB.prepare("UPDATE band_profiles SET photo_url = ? WHERE id = ?")
          .bind(publicUrl, bandProfileId)
          .run();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        filename,
        size: file.size,
        type: detectedType,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Photo upload error:", error);
    return new Response(
      JSON.stringify({
        error: "Photo upload failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
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
    const permCheck = await checkPermission(context, "editor");
    if (permCheck.error) {
      return permCheck.response;
    }

    // Extract filename from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const encodedSegment = pathParts[pathParts.length - 1];
    if (!encodedSegment || encodedSegment === "photos") {
      return new Response(JSON.stringify({ error: "Filename required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const objectKey = decodeURIComponent(encodedSegment);
    if (!objectKey.startsWith("band-photos/")) {
      return new Response(JSON.stringify({ error: "Invalid key" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete from R2 bucket
    await env.BAND_PHOTOS.delete(objectKey);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Photo deletion error:", error);
    return new Response(
      JSON.stringify({
        error: "Photo deletion failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
