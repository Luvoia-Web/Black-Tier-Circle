import { describe, expect, it } from 'vitest';
import { parseData } from '@/lib/hooks/parse-data';

describe('parseData', () => {
  it('returns the data when the payload succeeds', () => {
    const parsed = parseData<{ total: number }>(200, { success: true, data: { total: 3 } });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.total).toBe(3);
    }
  });

  it('returns a typed error and never implies the request is still loading', () => {
    const parsed = parseData(500, { success: false, error: { code: 'MIGRATION', message: 'Apply migration 0032.' } });
    expect(parsed).toEqual({
      ok: false,
      error: { code: 'MIGRATION', message: 'Apply migration 0032.' },
    });
  });

  it('explains a non-JSON failure', () => {
    const parsed = parseData(502, null);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('REQUEST_FAILED');
      expect(parsed.error.message).toContain('502');
    }
  });
});
