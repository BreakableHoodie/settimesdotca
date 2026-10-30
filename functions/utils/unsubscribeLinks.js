// Unsubscribe links are derived from the row id, which is an AUTOINCREMENT
// primary key and is never reused. They therefore need no expiry: a link must
// keep working for the life of its follow. (A D1 Time Travel restore rolls the
// id counter back, so ids can be reissued after one.)
//
// Rotating CSRF_SECRET invalidates every link already sent (#1427).

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

function secretForBuild(env) {
  const secret = env?.CSRF_SECRET;
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("CSRF_SECRET is required to build unsubscribe links");
  }
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
  const secret = secretForBuild(env);
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

  const secret = env?.CSRF_SECRET;
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("CSRF_SECRET is required to verify unsubscribe links");
  }

  const key = await getDerivedKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, signature, macInput(kind, id));
  if (!valid) {
    // Well-formed but wrong: a forgery, or a link signed before a key rotation.
    // The id alone, never the token.
    logger.warn("unsubscribe MAC mismatch", { kind, id });
    return null;
  }
  return id;
}

export function isDerivedUnsubscribeToken(token) {
  return typeof token === "string" && token.startsWith("u1.");
}
