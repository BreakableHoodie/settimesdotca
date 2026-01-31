import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkRateLimit,
  rateLimitHeaders,
  rateLimitResponse,
} from '../rateLimit.js';

// Mock the caches global
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
};

global.caches = {
  default: mockCache,
};

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.match.mockResolvedValue(null);
    mockCache.put.mockResolvedValue(undefined);
  });

  describe('checkRateLimit', () => {
    it('should allow requests under the limit', async () => {
      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 - 1
    });

    it('should skip rate limiting for admin routes', async () => {
      const request = new Request('https://example.com/api/admin/users', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1); // -1 indicates skipped
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

    it('should use different limits for different endpoints', async () => {
      const subscriptionRequest = new Request('https://example.com/api/subscriptions', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(subscriptionRequest);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 10 - 1 for subscriptions
    });

    it('should fail open if cache errors', async () => {
      mockCache.match.mockRejectedValue(new Error('Cache error'));

      const request = new Request('https://example.com/api/events', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
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
