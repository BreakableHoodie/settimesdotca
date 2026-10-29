const MIN_SECRET_LENGTH = 32;

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function isAuthorized(request, env) {
  const secret = env?.SHARED_SECRET;
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    globalThis.console.error("MCP authorization is unavailable: SHARED_SECRET is missing or too short");
    return false;
  }

  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) return false;

  const encoder = new globalThis.TextEncoder();
  const [tokenDigest, secretDigest] = await Promise.all([
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(match[1])),
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const tokenBytes = new Uint8Array(tokenDigest);
  const secretBytes = new Uint8Array(secretDigest);

  if (typeof globalThis.crypto.subtle.timingSafeEqual === "function") {
    return globalThis.crypto.subtle.timingSafeEqual(tokenBytes, secretBytes);
  }
  return constantTimeEqual(tokenBytes, secretBytes);
}
