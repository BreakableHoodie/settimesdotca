// Unsubscribe links are derived from the row id, which is an AUTOINCREMENT
// primary key and is never reused. Tokens carry no expiry; a link verifies
// while the key that signed it is the current or the previous one. (A D1 Time
// Travel restore rolls the id counter back, so ids can be reissued after one.)
//
// Keyed by UNSUBSCRIBE_LINK_SECRET, never CSRF_SECRET, so a CSRF rotation
// leaves sent links working (#1427). To rotate this key, move the current value
// to UNSUBSCRIBE_LINK_SECRET_PREVIOUS and set a new one: links signed with the
// previous key still verify. Keep the previous key at least 60 days (CASL), so
// never rotate twice inside that window. If the key LEAKED, set a new one and
// leave _PREVIOUS unset: sent links stop working, but the leaked key can no
// longer unsubscribe everyone.

import { logger } from "./logger.js";

const DERIVATION_INFO = new TextEncoder().encode("settimes unsubscribe link v1");
const derivedKeys = new Map();

export const UNSUBSCRIBE_KINDS = {
  bandFollow: "band_follow",
  subscription: "email_subscription",
};

async function getDerivedKey(secret) {
  let keyPromise = derivedKeys.get(secret);
  if (!keyPromise) {
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, [
      "deriveKey",
    ]);
    keyPromise = crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: DERIVATION_INFO },
      keyMaterial,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign", "verify"],
    );
    keyPromise.catch(() => derivedKeys.delete(secret));
    derivedKeys.set(secret, keyPromise);
  }
  return keyPromise;
}

function requireId(id) {
  const value = typeof id === "number" || typeof id === "string" ? Number(id) : NaN;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Unsubscribe row id must be a positive safe integer");
  return value;
}

// The salt is empty, so the key is only as strong as the secret: anyone holding
// one real link can test guesses offline. Generate with `openssl rand -hex 32`.
const MIN_SECRET_LENGTH = 32;

function isSecret(value) {
  return typeof value === "string" && value.length >= MIN_SECRET_LENGTH;
}

function currentSecret(env, purpose) {
  const secret = env?.UNSUBSCRIBE_LINK_SECRET;
  if (!isSecret(secret))
    throw new Error(
      `UNSUBSCRIBE_LINK_SECRET (${MIN_SECRET_LENGTH}+ characters) is required to ${purpose} unsubscribe links`,
    );
  return secret;
}

// One home for the MAC input, so building and verifying cannot drift. The kind
// is part of it: a band-follow link must not unsubscribe subscription row N.
function macInput(kind, id) {
  return new TextEncoder().encode(`unsubscribe|${kind}|${id}`);
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const decoded = atob(padded);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function unsubscribeToken(env, kind, id) {
  const value = requireId(id);
  const secret = currentSecret(env, "build");
  const key = await getDerivedKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, macInput(kind, value));
  return `u1.${value}.${base64Url(new Uint8Array(signature))}`;
}

// Returns the row id, or null for a token that is malformed or does not
// verify. Throws when it cannot verify at all (no key, a failed derivation), so
// the handler answers 500 instead of treating a valid link as a forged one.
export async function verifyUnsubscribeToken(env, kind, token) {
  const match = typeof token === "string" && /^u1\.([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;

  const id = Number(match[1]);
  const signature = decodeBase64Url(match[2]);
  if (!Number.isSafeInteger(id) || signature === null) return null;

  const secrets = [currentSecret(env, "verify")];
  const previous = env.UNSUBSCRIBE_LINK_SECRET_PREVIOUS;
  if (isSecret(previous)) secrets.push(previous);
  else if (previous) logger.error("UNSUBSCRIBE_LINK_SECRET_PREVIOUS is too short and is ignored");

  for (const secret of secrets) {
    const key = await getDerivedKey(secret);
    if (await crypto.subtle.verify("HMAC", key, signature, macInput(kind, id))) return id;
  }
  // Well-formed but wrong: a forgery, or a link signed before the previous key.
  // The id alone, never the token.
  logger.warn("unsubscribe MAC mismatch", { kind, id });
  return null;
}

export function isDerivedUnsubscribeToken(token) {
  return typeof token === "string" && token.startsWith("u1.");
}
