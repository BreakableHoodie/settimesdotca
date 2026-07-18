/**
 * Shared image upload validation
 *
 * Magic-byte MIME detection + size-cap logic, extracted from
 * functions/api/admin/bands/photos.js (#616) so the event poster upload
 * endpoint (functions/api/admin/events/posters.js) can reuse the exact same
 * validation instead of duplicating it. Behaviour is unchanged from the
 * original band-photo implementation.
 */

// Maximum file size: 5MB — shared backstop for band photos and event posters.
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types, verified via magic bytes below (never the
// client-supplied Content-Type, which is attacker-controlled).
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Detect the true MIME type from the file's magic bytes.
 * Rejects client-supplied Content-Type and validates the actual file header.
 * @param {File} file
 * @returns {Promise<string|null>} Detected MIME type or null if unrecognised.
 */
export async function detectImageMimeType(file) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const length = header.length;

  // JPEG: FF D8 FF
  if (length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A (full 8-byte signature)
  if (
    length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF87a / GIF89a: 47 49 46 38 37|39 61 (full 6-byte signature)
  if (
    length >= 6 &&
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38 &&
    (header[4] === 0x37 || header[4] === 0x39) &&
    header[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: RIFF (52 49 46 46) + 4-byte length + WEBP (57 45 42 50)
  if (
    length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}
