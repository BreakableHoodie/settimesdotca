// Structured logging utility for Cloudflare Workers
// Provides consistent log formatting with metadata for production debugging

import { isDevRequest } from "./auth.js";

/**
 * Log levels with numeric priority
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Keys that should be redacted from logs (exact case-insensitive match).
// camelCase keys are normalised to lowercase before lookup, so e.g.
// 'ipAddress' → 'ipaddress' and 'userAgent' → 'useragent'.
// Common compound/snake_case variants are listed explicitly so that
// credential-bearing keys like 'password_hash' and 'totp_secret' are
// also redacted without falling back to substring matching (which would
// over-redact unrelated keys such as 'emailDelivered').
const SENSITIVE_KEYS = new Set([
  // Password variants
  "password",
  "password_hash",
  "passwordhash", // camelCase 'passwordHash'

  // Token variants
  "token",
  "access_token",
  "accesstoken", // camelCase 'accessToken'
  "refresh_token",
  "refreshtoken", // camelCase 'refreshToken'
  "verification_token",
  "verificationtoken", // camelCase 'verificationToken'
  "reset_token",
  "resettoken", // camelCase 'resetToken'
  "invite_token",
  "invitetoken", // camelCase 'inviteToken'
  "api_token",
  "apitoken", // camelCase 'apiToken'

  // Secret variants
  "secret",
  "totp_secret",
  "totpsecret", // camelCase 'totpSecret'
  "client_secret",
  "clientsecret", // camelCase 'clientSecret'

  // Key variants
  "key",
  "api_key",
  "apikey", // camelCase 'apiKey'
  "private_key",
  "privatekey", // camelCase 'privateKey'
  "encryption_key",
  "encryptionkey", // camelCase 'encryptionKey'

  // Auth headers / cookies
  "authorization",
  "cookie",
  "bearer",

  // Email (exact only – avoids over-redacting 'emailDelivered' etc.)
  "email",
  "user_email",
  "useremail", // camelCase 'userEmail'

  // IP address variants
  "ip",
  "ipaddress", // camelCase 'ipAddress'
  "ip_address",

  // User-agent variants
  "useragent", // camelCase 'userAgent'
  "user_agent",
]);

/**
 * Get current log level from environment
 * Defaults to 'debug' only in a known dev environment, 'info' everywhere else
 * (#1273: production ran with ENVIRONMENT unset, which read as non-production)
 */
function getLogLevel(env) {
  if (env?.LOG_LEVEL && LOG_LEVELS[env.LOG_LEVEL] !== undefined) {
    return env.LOG_LEVEL;
  }
  return isDevRequest(null, env) ? "debug" : "info";
}

/**
 * Generate a short request ID for tracing
 */
function generateRequestId() {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Safely stringify error objects
 */
function serializeError(error) {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"), // First 5 lines
    };
  }

  if (typeof error === "object") {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return String(error);
    }
  }

  return String(error);
}

/**
 * Safely stringify metadata, handling circular references
 */
function serializeMetadata(meta) {
  if (!meta || typeof meta !== "object") return meta;

  try {
    // Handle common non-serializable types
    const cleaned = {};
    for (const [key, value] of Object.entries(meta)) {
      // Redact sensitive keys
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        cleaned[key] = "[REDACTED]";
        continue;
      }

      if (value instanceof Request) {
        cleaned[key] = { url: value.url, method: value.method };
      } else if (value instanceof Response) {
        cleaned[key] = { status: value.status, statusText: value.statusText };
      } else if (value instanceof Error) {
        cleaned[key] = serializeError(value);
      } else if (typeof value === "function") {
        cleaned[key] = "[Function]";
      } else {
        cleaned[key] = value;
      }
    }
    return JSON.parse(JSON.stringify(cleaned));
  } catch {
    return "[Unserializable]";
  }
}

/**
 * Format log entry as structured JSON
 */
function formatLogEntry(level, message, meta = {}) {
  let metadata = {};
  if (meta && typeof meta === "object" && Object.keys(meta).length > 0) {
    const serialized = serializeMetadata(meta);
    if (serialized && typeof serialized === "object") {
      metadata = serialized;
    }
  }

  // The entry's own fields go LAST, so metadata can add context but never
  // overwrite timestamp, level or message (#1247, code scanning #37). With
  // Object.assign(entry, meta) a meta key named `level` or `message` rewrote
  // the line: an error could be logged as "debug", or say something else.
  // Spread defines own properties, so a `__proto__` key stays plain data.
  return JSON.stringify({
    ...metadata,
    timestamp: new Date().toISOString(),
    level,
    message,
  });
}

/**
 * Create a logger instance
 * Can be scoped to a request or module
 */
export function createLogger(options = {}) {
  const { env = {}, requestId = generateRequestId(), module = null } = options;

  // `??`, not `||`: debug is level 0, and `0 || info` silently made debug
  // logging unreachable everywhere.
  const minLevel = LOG_LEVELS[getLogLevel(env)] ?? LOG_LEVELS.info;

  const log = (level, message, meta = {}) => {
    if (LOG_LEVELS[level] < minLevel) return;

    const enrichedMeta = {
      ...meta,
      requestId,
      ...(module && { module }),
    };

    const formatted = formatLogEntry(level, message, enrichedMeta);

    // Use appropriate console method
    switch (level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
      default:
        console.log(formatted);
    }
  };

  return {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),

    // Create a child logger with additional context
    child: (childOptions) =>
      createLogger({
        env,
        requestId,
        module: childOptions.module || module,
        ...childOptions,
      }),

    // Get the request ID for correlation
    getRequestId: () => requestId,
  };
}

/**
 * Create a logger from a request context
 * Extracts useful metadata from the request
 */
export function createRequestLogger(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  return createLogger({
    env,
    module: url.pathname.split("/").slice(0, 4).join("/"),
  });
}

/**
 * Simple module-level logger for utilities
 * Use when you don't have request context
 */
export const logger = {
  debug: (message, meta) => console.debug(formatLogEntry("debug", message, meta)),
  info: (message, meta) => console.info(formatLogEntry("info", message, meta)),
  warn: (message, meta) => console.warn(formatLogEntry("warn", message, meta)),
  error: (message, meta) => console.error(formatLogEntry("error", message, meta)),
};

/**
 * Log an error with full context
 * Convenience function for catch blocks
 */
export function logError(loggerOrMessage, errorOrMeta, metaOrUndefined) {
  // Handle both (logger, error, meta) and (message, error) signatures
  if (typeof loggerOrMessage === "object" && loggerOrMessage.error) {
    // Called as logError(logger, error, meta)
    const log = loggerOrMessage;
    const error = errorOrMeta;
    const meta = metaOrUndefined || {};
    log.error(error?.message || "Unknown error", {
      ...meta,
      error: serializeError(error),
    });
  } else {
    // Called as logError(message, error)
    const message = loggerOrMessage;
    const error = errorOrMeta;
    logger.error(message, { error: serializeError(error) });
  }
}
