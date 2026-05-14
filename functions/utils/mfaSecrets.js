const ENCRYPTED_TOTP_SECRET_PREFIX = "enc-v1";
const IV_LENGTH = 12;

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function hasTotpEncryptionKey(env) {
  return Boolean(env?.MFA_TOTP_ENCRYPTION_KEY?.trim());
}

function resolveEncryptionKeyMaterial(env) {
  const configured = env?.MFA_TOTP_ENCRYPTION_KEY?.trim();
  if (configured) {
    return configured;
  }

  throw new Error("MFA_TOTP_ENCRYPTION_KEY environment variable is required");
}

async function importEncryptionKey(env) {
  const keyMaterial = resolveEncryptionKeyMaterial(env);
  const encoded = new TextEncoder().encode(keyMaterial);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export function isEncryptedTotpSecret(value) {
  return (
    typeof value === "string" &&
    value.startsWith(`${ENCRYPTED_TOTP_SECRET_PREFIX}:`)
  );
}

export async function loadTotpSecret(storedSecret, env) {
  const normalizedSecret = String(storedSecret || "").trim();
  if (!normalizedSecret) {
    return {
      secret: null,
      encryptedSecret: null,
      shouldPersist: false,
    };
  }

  if (isEncryptedTotpSecret(normalizedSecret)) {
    return {
      secret: await decryptTotpSecret(normalizedSecret, env),
      encryptedSecret: normalizedSecret,
      shouldPersist: false,
    };
  }

  if (!hasTotpEncryptionKey(env)) {
    return {
      secret: normalizedSecret,
      encryptedSecret: null,
      shouldPersist: false,
    };
  }

  return {
    secret: normalizedSecret,
    encryptedSecret: await encryptTotpSecret(normalizedSecret, env),
    shouldPersist: true,
  };
}

export async function encryptTotpSecret(secret, env) {
  const normalizedSecret = String(secret || "").trim();
  if (!normalizedSecret) {
    return null;
  }

  if (isEncryptedTotpSecret(normalizedSecret)) {
    return normalizedSecret;
  }

  const key = await importEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const payload = new TextEncoder().encode(normalizedSecret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    payload,
  );

  return `${ENCRYPTED_TOTP_SECRET_PREFIX}:${toBase64(iv)}:${toBase64(
    new Uint8Array(encrypted),
  )}`;
}

export async function decryptTotpSecret(storedSecret, env) {
  const normalizedSecret = String(storedSecret || "").trim();
  if (!normalizedSecret) {
    return null;
  }

  if (!isEncryptedTotpSecret(normalizedSecret)) {
    return normalizedSecret;
  }

  const [, ivBase64, encryptedBase64] = normalizedSecret.split(":");
  if (!ivBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted TOTP secret format");
  }

  const key = await importEncryptionKey(env);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivBase64) },
    key,
    fromBase64(encryptedBase64),
  );

  return new TextDecoder().decode(decrypted);
}