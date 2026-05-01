import { describe, expect, it } from 'vitest';
import { parseAndValidate } from '@/lib/validators';

describe('parseAndValidate', () => {
  it('accepts a plain number', () => {
    const r = parseAndValidate('42');
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('accepts a decimal number', () => {
    const r = parseAndValidate('3.14');
    expect(r).toEqual({ ok: true, value: 3.14 });
  });

  it('accepts a negative number when no min set', () => {
    const r = parseAndValidate('-5');
    expect(r).toEqual({ ok: true, value: -5 });
  });

  it('treats empty string as NaN when optional=true', () => {
    const r = parseAndValidate('', { optional: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number.isNaN(r.value)).toBe(true);
  });

  it('treats empty string as failure when optional is not set', () => {
    const r = parseAndValidate('', { fieldLabel: 'Bill' });
    expect(r).toEqual({ ok: false, error: 'Bill is required' });
  });

  it('uses generic "Required" when no label is set', () => {
    const r = parseAndValidate('');
    expect(r).toEqual({ ok: false, error: 'Required' });
  });

  it('rejects non-numeric strings', () => {
    const r = parseAndValidate('abc', { fieldLabel: 'Tip' });
    expect(r).toEqual({ ok: false, error: 'Tip must be a number' });
  });

  it('rejects "Infinity"', () => {
    const r = parseAndValidate('Infinity');
    expect(r.ok).toBe(false);
  });

  it('rejects "NaN"', () => {
    const r = parseAndValidate('NaN');
    expect(r.ok).toBe(false);
  });

  it('strips a trailing percent sign', () => {
    const r = parseAndValidate('7%');
    expect(r).toEqual({ ok: true, value: 7 });
  });

  it('strips trailing percent with decimal', () => {
    const r = parseAndValidate('12.5%');
    expect(r).toEqual({ ok: true, value: 12.5 });
  });

  it('rejects values below min', () => {
    const r = parseAndValidate('-5', { min: 0, fieldLabel: 'Principal' });
    expect(r).toEqual({ ok: false, error: 'Principal must be at least 0' });
  });

  it('rejects values above max', () => {
    const r = parseAndValidate('1e10', { max: 1e9, fieldLabel: 'Principal' });
    expect(r).toEqual({
      ok: false,
      error: 'Principal must be at most 1000000000',
    });
  });

  it('accepts US thousands-separator format', () => {
    const r = parseAndValidate('1,000.50');
    expect(r).toEqual({ ok: true, value: 1000.5 });
  });

  it('accepts large US thousands-separator values', () => {
    const r = parseAndValidate('1,234,567.89');
    expect(r).toEqual({ ok: true, value: 1234567.89 });
  });

  it('rejects Indian-style grouping', () => {
    const r = parseAndValidate('1,00,0.50', { fieldLabel: 'Bill' });
    expect(r).toEqual({ ok: false, error: 'Bill must be a number' });
  });

  it('rejects malformed thousands grouping', () => {
    expect(parseAndValidate('1,2,3').ok).toBe(false);
    expect(parseAndValidate('1,23').ok).toBe(false);
    expect(parseAndValidate(',100').ok).toBe(false);
  });

  it('rejects non-integer when integer=true', () => {
    const r = parseAndValidate('5.5', { integer: true, fieldLabel: 'Party' });
    expect(r).toEqual({ ok: false, error: 'Party must be a whole number' });
  });

  it('accepts integer when integer=true', () => {
    const r = parseAndValidate('7', { integer: true });
    expect(r).toEqual({ ok: true, value: 7 });
  });

  it('rejects scientific notation above max', () => {
    const r = parseAndValidate('1e10', { max: 1e9 });
    expect(r.ok).toBe(false);
  });

  it('accepts scientific notation under bounds', () => {
    const r = parseAndValidate('1e3');
    expect(r).toEqual({ ok: true, value: 1000 });
  });

  it('rejects whitespace-only input as required', () => {
    const r = parseAndValidate('   ', { fieldLabel: 'Bill' });
    expect(r).toEqual({ ok: false, error: 'Bill is required' });
  });

  it('rejects bare percent sign', () => {
    const r = parseAndValidate('%');
    expect(r.ok).toBe(false);
  });

  it('does NOT echo user input in errors', () => {
    const r = parseAndValidate('hackerString123');
    if (r.ok) throw new Error('expected failure');
    expect(r.error).not.toContain('hackerString');
    expect(r.error).not.toContain('123');
  });
});
