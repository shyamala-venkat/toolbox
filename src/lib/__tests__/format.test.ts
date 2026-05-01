import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';

describe('formatMoney', () => {
  it('formats USD with two decimals by default', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });

  it('formats zero as $0.00', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('formats EUR using the locale currency symbol', () => {
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
  });

  it('formats JPY without fractional digits (locale default)', () => {
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234');
  });

  it('returns em-dash for NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('—');
  });

  it('returns em-dash for Infinity', () => {
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('returns em-dash for -Infinity', () => {
    expect(formatMoney(Number.NEGATIVE_INFINITY)).toBe('—');
  });

  it('formats negative numbers with the locale convention', () => {
    expect(formatMoney(-50)).toBe('-$50.00');
  });
});

describe('formatNumber', () => {
  it('formats with thousands separators', () => {
    expect(formatNumber(1_000_000)).toBe('1,000,000');
  });

  it('returns em-dash for NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
  });

  it('returns em-dash for Infinity', () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('honors fraction-digits options', () => {
    expect(formatNumber(3.14159, { maximumFractionDigits: 2 })).toBe('3.14');
  });
});

describe('formatPercent', () => {
  it('formats a percent value with default 2 fraction digits', () => {
    expect(formatPercent(7.5)).toBe('7.50%');
  });

  it('rounds to the requested digits', () => {
    expect(formatPercent(7.5, 0)).toBe('8%');
    expect(formatPercent(7.4, 0)).toBe('7%');
  });

  it('returns em-dash for NaN', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('returns em-dash for Infinity', () => {
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });
});
