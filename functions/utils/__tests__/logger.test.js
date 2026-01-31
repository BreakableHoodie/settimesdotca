import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, createRequestLogger, logger, logError } from '../logger.js';

describe('Structured Logger', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with all log methods', () => {
      const log = createLogger();

      expect(log.debug).toBeInstanceOf(Function);
      expect(log.info).toBeInstanceOf(Function);
      expect(log.warn).toBeInstanceOf(Function);
      expect(log.error).toBeInstanceOf(Function);
      expect(log.child).toBeInstanceOf(Function);
      expect(log.getRequestId).toBeInstanceOf(Function);
    });

    it('should log messages with structured format', () => {
      const log = createLogger();
      log.info('Test message');

      expect(consoleSpy.info).toHaveBeenCalled();
      const logOutput = consoleSpy.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Test message');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.requestId).toBeDefined();
    });

    it('should include metadata in log output', () => {
      const log = createLogger();
      log.error('Error occurred', { userId: 123, action: 'login' });

      const logOutput = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.userId).toBe(123);
      expect(parsed.action).toBe('login');
    });

    it('should generate consistent request ID', () => {
      const log = createLogger();
      const requestId = log.getRequestId();

      log.info('First log');
      log.error('Second log');

      const log1 = JSON.parse(consoleSpy.info.mock.calls[0][0]);
      const log2 = JSON.parse(consoleSpy.error.mock.calls[0][0]);

      expect(log1.requestId).toBe(requestId);
      expect(log2.requestId).toBe(requestId);
    });

    it('should create child logger with module context', () => {
      const log = createLogger();
      const childLog = log.child({ module: 'auth' });

      childLog.info('Auth message');

      const logOutput = consoleSpy.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.module).toBe('auth');
    });

    it('should respect log level from environment', () => {
      const log = createLogger({ env: { LOG_LEVEL: 'error' } });

      log.debug('Debug message');
      log.info('Info message');
      log.warn('Warn message');
      log.error('Error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('createRequestLogger', () => {
    it('should extract module from request URL', () => {
      const context = {
        request: new Request('https://example.com/api/admin/users'),
        env: {},
      };

      const log = createRequestLogger(context);
      log.info('Test');

      const logOutput = consoleSpy.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.module).toBe('/api/admin/users');
    });
  });

  describe('logger (module-level)', () => {
    it('should provide static logging methods', () => {
      logger.info('Static log');

      expect(consoleSpy.info).toHaveBeenCalled();
      const logOutput = consoleSpy.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.message).toBe('Static log');
    });
  });

  describe('logError', () => {
    it('should serialize Error objects', () => {
      const error = new Error('Test error');
      logError('Something failed', error);

      expect(consoleSpy.error).toHaveBeenCalled();
      const logOutput = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.error.name).toBe('Error');
      expect(parsed.error.message).toBe('Test error');
      expect(parsed.error.stack).toBeDefined();
    });

    it('should work with logger instance', () => {
      const log = createLogger();
      const error = new Error('Instance error');

      logError(log, error, { context: 'test' });

      const logOutput = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.message).toBe('Instance error');
      expect(parsed.context).toBe('test');
    });
  });

  describe('error serialization', () => {
    it('should handle circular references in metadata', () => {
      const log = createLogger();
      const circular = { name: 'test' };
      circular.self = circular;

      // Should not throw
      expect(() => log.info('Circular test', circular)).not.toThrow();
    });

    it('should handle Request objects in metadata', () => {
      const log = createLogger();
      const request = new Request('https://example.com/test', { method: 'POST' });

      log.info('Request log', { request });

      const logOutput = consoleSpy.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.request.url).toBe('https://example.com/test');
      expect(parsed.request.method).toBe('POST');
    });
  });
});
