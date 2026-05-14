import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkRateLimit,
  rateLimitHeaders,
  rateLimitResponse,
} from '../rateLimit.js';

// Mock the caches global (Cache API, used for non-sensitive endpoints)
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
};

global.caches = {
  default: mockCache,
};

// Mock D1 database (used for fail-closed endpoints: /api/auth/*, /api/subscriptions)
function makeMockDB({ count = 1, window_start = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const row = { count, window_start: window_start ?? now };
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({}),
        first: vi.fn().mockResolvedValue(row),
      }),
    }),
  };
}

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.match.mockResolvedValue(null);
    mockCache.put.mockResolvedValue(undefined);
  });

  describe('checkRateLimit — Cache API path (non-sensitive endpoints)', () => {
    it('should allow requests under the limit', async () => {
      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 - 1
    });

    it('non-auth admin routes have a generous rate limit, not completely skipped', async () => {
      const request = new Request('https://example.com/api/admin/users', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(100); // high limit for legitimate CRUD traffic
    });

    it('should skip rate limiting for non-API routes', async () => {
      const request = new Request('https://example.com/about', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });

    it('should block requests over the limit', async () => {
      const cachedData = JSON.stringify({ count: 60, windowStart: Math.floor(Date.now() / 1000) });
      mockCache.match.mockResolvedValue(new Response(cachedData));

      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset after window expires', async () => {
      const oldWindowStart = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
      const cachedData = JSON.stringify({ count: 100, windowStart: oldWindowStart });
      mockCache.match.mockResolvedValue(new Response(cachedData));

      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // Window reset, so 60 - 1
    });

    it('should fall back to Cache API for subscriptions when DB is unavailable', async () => {
      // No env.DB provided — falls back to Cache API (local dev)
      const request = new Request('https://example.com/api/subscriptions', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 10 - 1 for subscriptions
    });

    it('should fail open if Cache API errors (non-sensitive endpoint)', async () => {
      mockCache.match.mockRejectedValue(new Error('Cache error'));

      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
    });
  });

  describe('checkRateLimit — D1 path (fail-closed endpoints)', () => {
    it('should allow auth requests under the limit using D1', async () => {
      const db = makeMockDB({ count: 3 }); // well under the limit
      const env = { DB: db };
      const request = new Request('https://example.com/api/auth/activate', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7); // 10 - 3
      expect(db.prepare).toHaveBeenCalled();
    });

    it('should block auth requests over the limit using D1', async () => {
      const db = makeMockDB({ count: 11 }); // over the 10-req/min limit
      const env = { DB: db };
      const request = new Request('https://example.com/api/auth/activate', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should allow subscription requests under the limit using D1', async () => {
      const db = makeMockDB({ count: 1 });
      const env = { DB: db };
      const request = new Request('https://example.com/api/subscriptions', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 10 - 1
    });

    it('should fail closed when D1 throws on a sensitive endpoint', async () => {
      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockRejectedValue(new Error('D1 error')),
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      };
      const env = { DB: db };
      const request = new Request('https://example.com/api/auth/activate', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(false); // fail closed for security endpoints
    });

    it('should not use D1 for non-sensitive endpoints even when env.DB is available', async () => {
      const db = makeMockDB({ count: 1 });
      const env = { DB: db };
      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      await checkRateLimit(request, env);

      // D1 should NOT be called for /api/events
      expect(db.prepare).not.toHaveBeenCalled();
      // Cache API should be used instead
      expect(mockCache.match).toHaveBeenCalled();
    });

    it('admin auth login route is rate-limited via D1 (fail-closed)', async () => {
      const db = makeMockDB({ count: 2 });
      const env = { DB: db };
      const request = new Request('https://example.com/api/admin/auth/login', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(true);
      expect(db.prepare).toHaveBeenCalled(); // must use D1, not Cache API
      expect(mockCache.match).not.toHaveBeenCalled();
    });

    it('admin auth login fails closed when D1 throws (P1-S1)', async () => {
      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockRejectedValue(new Error('D1 unavailable')),
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      };
      const env = { DB: db };
      const request = new Request('https://example.com/api/admin/auth/login', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(false); // must fail closed, not open
    });

    it('admin auth login is blocked when limit is exceeded', async () => {
      const db = makeMockDB({ count: 100 }); // way over any reasonable limit
      const env = { DB: db };
      const request = new Request('https://example.com/api/admin/auth/login', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('IP bypass behaviour', () => {
    it('loopback 127.0.0.1 skips rate limiting entirely (wrangler dev / CI)', async () => {
      const db = makeMockDB({ count: 100 });
      const env = { DB: db };
      const request = new Request('https://example.com/api/admin/auth/login', {
        headers: { 'CF-Connecting-IP': '127.0.0.1' },
      });

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it('loopback ::1 skips rate limiting entirely', async () => {
      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '::1' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });

    it('unknown IP fails closed on fail-closed (auth) endpoints', async () => {
      const db = makeMockDB({ count: 0 });
      const env = { DB: db };
      const request = new Request('https://example.com/api/admin/auth/login', {}); // no IP headers

      const result = await checkRateLimit(request, env);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(db.prepare).not.toHaveBeenCalled(); // blocked before hitting D1
    });

    it('unknown IP fails open on non-sensitive endpoints', async () => {
      const request = new Request('https://example.com/api/events', {}); // no IP headers

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });
  });

  describe('rateLimitHeaders', () => {
    it('should return empty object for skipped rate limits', () => {
      const result = { allowed: true, remaining: -1, resetAt: 0 };
      const headers = rateLimitHeaders(result);

      expect(headers).toEqual({});
    });

    it('should return rate limit headers', () => {
      const result = { allowed: true, remaining: 50, resetAt: 1234567890, limit: 60 };
      const headers = rateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('60');
      expect(headers['X-RateLimit-Remaining']).toBe('50');
      expect(headers['X-RateLimit-Reset']).toBe('1234567890');
    });
  });

  describe('rateLimitResponse', () => {
    it('should return 429 response', () => {
      const result = { allowed: false, remaining: 0, resetAt: Math.floor(Date.now() / 1000) + 30, limit: 60 };
      const response = rateLimitResponse(result);

      expect(response.status).toBe(429);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Retry-After')).toBeTruthy();
    });

    it('should include CORS headers if provided', () => {
      const result = { allowed: false, remaining: 0, resetAt: Math.floor(Date.now() / 1000) + 30, limit: 60 };
      const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
      const response = rateLimitResponse(result, corsHeaders);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
