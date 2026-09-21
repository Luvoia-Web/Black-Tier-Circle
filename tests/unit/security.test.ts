/**
 * @file tests/unit/security.test.ts
 *
 * Sanitization and rate-limit unit tests.
 *
 * @module Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, resetRateLimitStore } from '@/lib/rate-limiter';
import { escapeTelegramMarkdown, sanitizeInput, stripHtml } from '@/lib/sanitize';

afterEach(() => {
  resetRateLimitStore();
  vi.useRealTimers();
});

describe('escapeTelegramMarkdown', () => {
  it('escapes all special chars', () => {
    const input = '_*[]()~`>#+-=|{}.!\\';
    const escaped = escapeTelegramMarkdown(input);
    expect(escaped).toContain('\\_');
    expect(escaped).toContain('\\*');
    expect(escaped).toContain('\\[');
    expect(escaped).toContain('\\.');
    expect(escaped).toContain('\\\\');
  });
});

describe('stripHtml', () => {
  it('removes script tags', () => {
    expect(stripHtml('<script>alert(1)</script>hello')).toBe('alert(1)hello');
  });
});

describe('sanitizeInput', () => {
  it('trims and strips HTML', () => {
    expect(sanitizeInput('  <b>hi</b>  ')).toBe('hi');
  });
});

describe('checkRateLimit', () => {
  it('blocks after limit reached', () => {
    expect(checkRateLimit('sec-a', 2).allowed).toBe(true);
    expect(checkRateLimit('sec-a', 2).allowed).toBe(true);
    const blocked = checkRateLimit('sec-a', 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets after window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T00:00:00.000Z'));
    checkRateLimit('sec-b', 1, 1_000);
    expect(checkRateLimit('sec-b', 1, 1_000).allowed).toBe(false);
    vi.setSystemTime(new Date('2026-09-21T00:00:02.000Z'));
    expect(checkRateLimit('sec-b', 1, 1_000).allowed).toBe(true);
  });

  it('returns correct remaining count', () => {
    const first = checkRateLimit('sec-c', 3);
    expect(first.remaining).toBe(2);
    const second = checkRateLimit('sec-c', 3);
    expect(second.remaining).toBe(1);
  });
});
