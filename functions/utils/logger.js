// Structured logging utility for Cloudflare Workers
// Provides consistent log formatting with metadata for production debugging

/**
 * Log levels with numeric priority
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Keys that should be redacted from logs
const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'key',
  'access_token',
  'refresh_token',
];

/**
 * Get current log level from environment
 * Defaults to 'info' in production, 'debug' in development
 */
function getLogLevel(env) {
  if (env?.LOG_LEVEL && LOG_LEVELS[env.LOG_LEVEL] !== undefined) {
    return env.LOG_LEVEL;
  }
  return env?.ENVIRONMENT === 'production' ? 'info' : 'debug';
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
      stack: error.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines
    };
  }

  if (typeof error === 'object') {
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
  if (!meta || typeof meta !== 'object') return meta;

  try {
    // Handle common non-serializable types
    const cleaned = {};
    for (const [key, value] of Object.entries(meta)) {
      // Redact sensitive keys
      if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
        cleaned[key] = '[REDACTED]';
        continue;
      }

      if (value instanceof Request) {
        cleaned[key] = { url: value.url, method: value.method };
      } else if (value instanceof Response) {
        cleaned[key] = { status: value.status, statusText: value.statusText };
      } else if (value instanceof Error) {
        cleaned[key] = serializeError(value);
      } else if (typeof value === 'function') {
        cleaned[key] = '[Function]';
      } else {
        cleaned[key] = value;
      }
    }
    return JSON.parse(JSON.stringify(cleaned));
  } catch {
    return '[Unserializable]';
  }
}

/**
 * Format log entry as structured JSON
 */
function formatLogEntry(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  // Add metadata if present
  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
    const serialized = serializeMetadata(meta);
    if (serialized && typeof serialized === 'object') {
      Object.assign(entry, serialized);
    }
  }

  return JSON.stringify(entry);
}

/**
 * Create a logger instance
 * Can be scoped to a request or module
 */
export function createLogger(options = {}) {
  const {
    env = {},
    requestId = generateRequestId(),
    module = null,
  } = options;

  const minLevel = LOG_LEVELS[getLogLevel(env)] || LOG_LEVELS.info;

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
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
      default:
        console.log(formatted);
    }
  };

  return {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),

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
    module: url.pathname.split('/').slice(0, 4).join('/'),
  });
}

/**
 * Simple module-level logger for utilities
 * Use when you don't have request context
 */
export const logger = {
  debug: (message, meta) => console.debug(formatLogEntry('debug', message, meta)),
  info: (message, meta) => console.info(formatLogEntry('info', message, meta)),
  warn: (message, meta) => console.warn(formatLogEntry('warn', message, meta)),
  error: (message, meta) => console.error(formatLogEntry('error', message, meta)),
};

/**
 * Log an error with full context
 * Convenience function for catch blocks
 */
export function logError(loggerOrMessage, errorOrMeta, metaOrUndefined) {
  // Handle both (logger, error, meta) and (message, error) signatures
  if (typeof loggerOrMessage === 'object' && loggerOrMessage.error) {
    // Called as logError(logger, error, meta)
    const log = loggerOrMessage;
    const error = errorOrMeta;
    const meta = metaOrUndefined || {};
    log.error(error?.message || 'Unknown error', {
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
