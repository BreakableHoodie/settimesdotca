import { Lucia, TimeSpan } from "lucia";
import { D1Adapter } from "@lucia-auth/adapter-sqlite";

export const SESSION_CONFIG = {
  // Absolute maximum session lifetime
  absoluteTimeout: 30 * 24 * 60 * 60 * 1000,

  // Idle timeout (no activity)
  idleTimeout: 30 * 60 * 1000,

  // Refresh threshold (extend session if within this time of expiry)
  refreshThreshold: 15 * 60 * 1000,

  // Admin sessions have shorter timeouts
  adminIdleTimeout: 15 * 60 * 1000,
  adminAbsoluteTimeout: 8 * 60 * 60 * 1000,
};

export function isDevRequest(request, env = null) {
  // SECURITY: Trust env.ENVIRONMENT over request headers — the Origin header
  // is attacker-controlled and must not influence security-sensitive decisions.
  if (env?.ENVIRONMENT === "production") return false;
  if (env?.ENVIRONMENT && env.ENVIRONMENT !== "production") return true;
  // Fallback for local dev without ENVIRONMENT set: check server-controlled headers only.
  if (!request) return false;
  const host = request.headers.get("Host") || "";
  const url = request.url || "";
  return host.includes("localhost") || url.includes("localhost");
}

export function initializeLucia(DB, request = null, env = null) {
  const isDev = request ? isDevRequest(request, env) : false;
  const adapter = new D1Adapter(DB, {
    user: "users",
    session: "lucia_sessions",
  });

  return new Lucia(adapter, {
    sessionCookie: {
      name: "session_token",
      expires: false,
      attributes: {
        secure: !isDev,
        sameSite: isDev ? "Lax" : "Strict",
        path: "/",
        httpOnly: true,
      },
    },
    sessionExpiresIn: new TimeSpan(30, "d"),
    getUserAttributes: (attributes) => ({
      email: attributes.email,
      role: attributes.role,
      name: attributes.name,
      firstName: attributes.first_name,
      lastName: attributes.last_name,
      isActive: attributes.is_active,
    }),
  });
}
