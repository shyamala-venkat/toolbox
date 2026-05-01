import { describe, expect, it } from 'vitest';
import { redactedError } from '@/lib/redactedError';

describe('redactedError', () => {
  it('returns the message when it has no digits', () => {
    expect(redactedError('invalid input')).toBe('invalid input');
  });

  it('returns the message when it has only short structural digits', () => {
    // "USD" has no digits, "10%" has 2 digits — both should pass through.
    expect(redactedError("Snapshot 'base' must be 'USD'"))
      .toBe("Snapshot 'base' must be 'USD'");
    expect(redactedError('Tip must be at most 100')).toBe(
      'Tip must be at most 100',
    );
  });

  it('redacts when the message contains a currency-symbol-then-digit pattern', () => {
    expect(redactedError('Cannot convert $5,000 to JPY')).toBe(
      'Could not complete this action',
    );
  });

  it('redacts when the message contains a long digit run', () => {
    expect(redactedError('Income of 250000 exceeds limit')).toBe(
      'Could not complete this action',
    );
  });

  it('uses the provided fallback when redacting', () => {
    expect(
      redactedError('Income 250000 exceeds limit', 'Try a smaller value'),
    ).toBe('Try a smaller value');
  });

  it('falls back when message is empty', () => {
    expect(redactedError('')).toBe('Could not complete this action');
    expect(redactedError('   ')).toBe('Could not complete this action');
  });

  it('falls back when fallback is empty too', () => {
    expect(redactedError('', '')).toBe('Could not complete this action');
  });

  it('redacts euro-prefixed amounts', () => {
    expect(redactedError('Cannot convert €5,000')).toBe(
      'Could not complete this action',
    );
  });

  it('passes through messages with at most 3 grouped digits', () => {
    // "max 100" → 3 digits, no currency → safe
    expect(redactedError('Party must be at most 100')).toBe(
      'Party must be at most 100',
    );
  });
});
