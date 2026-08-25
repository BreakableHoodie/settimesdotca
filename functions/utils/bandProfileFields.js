import { FIELD_LIMITS, sanitizeBandSocialLinks, sanitizeOptionalHttpUrl, sanitizeString } from "./validation.js";
import { normalizeBandName } from "./bandName.js";
import { parseOrigin } from "./parseOrigin.js";

export async function findDuplicateBandProfile(DB, name, bandProfileId) {
  const nameNormalized = normalizeBandName(name);
  return DB.prepare(`SELECT id FROM band_profiles WHERE name_normalized = ? AND id != ?`)
    .bind(nameNormalized, bandProfileId)
    .first();
}

export async function findVenue(DB, venueId) {
  return DB.prepare(
    `
    SELECT id FROM venues WHERE id = ?
  `,
  )
    .bind(venueId)
    .first();
}

export async function prepareBandProfileFields(DB, body, bandProfileId, resolvedPhotoUrl) {
  const {
    name,
    url,
    description,
    genre,
    origin,
    origin_city,
    origin_region,
    contact_email,
    is_active,
    photo_url,
    photo_alt_text,
    social_links,
  } = body;
  const profileUpdates = [];
  const profileParams = [];

  if (name !== undefined) {
    profileUpdates.push("name = ?");
    profileUpdates.push("name_normalized = ?");
    const sanitizedName = sanitizeString(name);
    profileParams.push(sanitizedName);
    profileParams.push(normalizeBandName(sanitizedName));
  }

  if (description !== undefined) {
    profileUpdates.push("description = ?");
    profileParams.push(sanitizeString(description) || null);
  }
  if (genre !== undefined) {
    profileUpdates.push("genre = ?");
    profileParams.push(sanitizeString(genre) || null);
  }
  const parsedOrigin = origin !== undefined ? parseOrigin(origin) : { city: null, region: null };
  const resolvedOriginCity = origin_city !== undefined ? origin_city : parsedOrigin.city;
  const resolvedOriginRegion = origin_region !== undefined ? origin_region : parsedOrigin.region;
  // Recompose `origin` whenever a COMPONENT field is supplied, not only when the
  // recomposition is non-empty. Clearing both components sends "" for each, the
  // join is "", and a trailing `|| undefined` would make this read as "nothing
  // supplied" — skipping the `origin = ?` update while origin_city and
  // origin_region are set to NULL, so the composite column keeps the value the
  // admin just deleted and the UI shows it again (#954).
  const computedOrigin =
    origin !== undefined
      ? origin
      : origin_city !== undefined || origin_region !== undefined
        ? [resolvedOriginCity, resolvedOriginRegion].filter(Boolean).join(", ")
        : undefined;

  if (origin !== undefined || origin_city !== undefined) {
    profileUpdates.push("origin_city = ?");
    profileParams.push(resolvedOriginCity || null);
  }
  if (origin !== undefined || origin_region !== undefined) {
    profileUpdates.push("origin_region = ?");
    profileParams.push(resolvedOriginRegion || null);
  }
  if (computedOrigin !== undefined) {
    profileUpdates.push("origin = ?");
    profileParams.push(computedOrigin || null);
  }
  if (contact_email !== undefined) {
    profileUpdates.push("contact_email = ?");
    profileParams.push(contact_email || null);
  }
  if (is_active !== undefined) {
    profileUpdates.push("is_active = ?");
    profileParams.push(Number(is_active) === 1 ? 1 : 0);
  }
  if (photo_url !== undefined) {
    profileUpdates.push("photo_url = ?");
    profileParams.push(resolvedPhotoUrl || null);
  }
  if (photo_alt_text !== undefined) {
    profileUpdates.push("photo_alt_text = ?");
    const cleanedAlt = sanitizeString(photo_alt_text);
    profileParams.push(cleanedAlt ? cleanedAlt.slice(0, 250) : null);
  }

  let newSocialLinks = null;
  let shouldUpdateSocialLinks = false;
  if (social_links !== undefined) {
    shouldUpdateSocialLinks = true;
    try {
      newSocialLinks = sanitizeBandSocialLinks(social_links);
    } catch (error) {
      return { error };
    }
  } else if (url !== undefined) {
    shouldUpdateSocialLinks = true;
    let existingLinks = {};
    try {
      const profile = await DB.prepare("SELECT social_links FROM band_profiles WHERE id = ?")
        .bind(bandProfileId)
        .first();
      existingLinks = JSON.parse(profile.social_links || "{}");
    } catch (_e) {
      /* ignore malformed JSON — existingLinks stays {} */
    }
    try {
      existingLinks.website = sanitizeOptionalHttpUrl(url, FIELD_LIMITS.bandUrl.max, "Website URL");
      newSocialLinks = sanitizeBandSocialLinks(existingLinks);
    } catch (error) {
      return { error };
    }
  }

  if (shouldUpdateSocialLinks) {
    profileUpdates.push("social_links = ?");
    profileParams.push(newSocialLinks);
  }

  const profileStatement =
    profileUpdates.length > 0
      ? DB.prepare(`UPDATE band_profiles SET ${profileUpdates.join(", ")} WHERE id = ?`).bind(
          ...profileParams,
          bandProfileId,
        )
      : undefined;

  return { profileUpdates, profileParams, profileStatement };
}
