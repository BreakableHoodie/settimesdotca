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

export function isDevRequest(request) {
  if (!request) return false;
  const origin = request.headers.get("Origin") || "";
  const host = request.headers.get("Host") || "";
  const url = request.url || "";
  return (
    origin.includes("localhost") ||
    host.includes("localhost") ||
    url.includes("localhost") ||
    host.endsWith(".pages.dev") ||
    origin.includes(".pages.dev")
  );
}

export function initializeLucia(DB, request = null) {
  const isDev = request ? isDevRequest(request) : false;
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
