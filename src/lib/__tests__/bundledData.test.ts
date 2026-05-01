import { describe, expect, it } from 'vitest';
import { computeTone } from '@/lib/bundledData';

describe('computeTone', () => {
  const NOW = new Date('2026-04-29T12:00:00Z');

  it('returns fresh for same-day data', () => {
    expect(computeTone('2026-04-29', NOW)).toEqual({ tone: 'fresh', ageDays: 0 });
  });

  it('returns fresh for 7-day old data', () => {
    expect(computeTone('2026-04-22', NOW)).toEqual({ tone: 'fresh', ageDays: 7 });
  });

  it('returns amber at 8 days old', () => {
    expect(computeTone('2026-04-21', NOW)).toEqual({ tone: 'amber', ageDays: 8 });
  });

  it('returns amber at 30 days old', () => {
    expect(computeTone('2026-03-30', NOW)).toEqual({ tone: 'amber', ageDays: 30 });
  });

  it('returns red beyond 30 days', () => {
    expect(computeTone('2026-03-29', NOW)).toEqual({ tone: 'red', ageDays: 31 });
  });

  it('returns static for non-date strings (tax-year label)', () => {
    expect(computeTone('TY2025', NOW)).toEqual({ tone: 'static', ageDays: -1 });
  });

  it('clamps negative ages to zero (clock skew)', () => {
    const future = '2027-01-01';
    const r = computeTone(future, NOW);
    expect(r.ageDays).toBe(0);
    expect(r.tone).toBe('fresh');
  });
});
