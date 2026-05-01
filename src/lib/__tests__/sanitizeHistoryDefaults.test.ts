import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_DEFAULTS,
  sanitizeHistoryDefaults,
} from '@/lib/sanitizeHistoryDefaults';

describe('sanitizeHistoryDefaults', () => {
  it('returns defaults for null', () => {
    const result = sanitizeHistoryDefaults(null);
    expect(result).toEqual({
      drawerExpanded: false,
      paused: false,
      retention: '7d',
      firstBlockToastDismissed: false,
      perToolPaused: {},
    });
  });

  it('returns defaults for undefined', () => {
    expect(sanitizeHistoryDefaults(undefined)).toEqual({
      ...DEFAULT_HISTORY_DEFAULTS,
      perToolPaused: {},
    });
  });

  it('returns defaults for a string', () => {
    expect(sanitizeHistoryDefaults('not an object').retention).toBe('7d');
  });

  it('returns defaults for a number', () => {
    expect(sanitizeHistoryDefaults(42).paused).toBe(false);
  });

  it('returns defaults for an array', () => {
    expect(sanitizeHistoryDefaults([1, 2, 3]).drawerExpanded).toBe(false);
  });

  it('passes through a fully valid object', () => {
    const valid = {
      drawerExpanded: true,
      paused: true,
      retention: '30d',
      firstBlockToastDismissed: true,
      perToolPaused: { 'json-formatter': true, 'sql-formatter': false },
    };
    expect(sanitizeHistoryDefaults(valid)).toEqual(valid);
  });

  it('falls back to 7d when retention is not in the enum', () => {
    expect(sanitizeHistoryDefaults({ retention: 'eternally' }).retention).toBe('7d');
  });

  it('falls back to 7d when retention is not a string', () => {
    expect(sanitizeHistoryDefaults({ retention: 7 }).retention).toBe('7d');
  });

  it('coerces a non-bool drawerExpanded to default (false)', () => {
    expect(sanitizeHistoryDefaults({ drawerExpanded: 'yes' }).drawerExpanded).toBe(false);
  });

  it('coerces a non-bool paused to default (false)', () => {
    expect(sanitizeHistoryDefaults({ paused: 1 }).paused).toBe(false);
  });

  it('coerces a non-bool firstBlockToastDismissed to default (false)', () => {
    expect(
      sanitizeHistoryDefaults({ firstBlockToastDismissed: 'true' }).firstBlockToastDismissed,
    ).toBe(false);
  });

  it('rejects perToolPaused when not an object', () => {
    expect(sanitizeHistoryDefaults({ perToolPaused: 'nope' }).perToolPaused).toEqual({});
    expect(sanitizeHistoryDefaults({ perToolPaused: 5 }).perToolPaused).toEqual({});
    expect(sanitizeHistoryDefaults({ perToolPaused: null }).perToolPaused).toEqual({});
    expect(sanitizeHistoryDefaults({ perToolPaused: [true, false] }).perToolPaused).toEqual(
      {},
    );
  });

  it('drops non-boolean values from perToolPaused', () => {
    const result = sanitizeHistoryDefaults({
      perToolPaused: {
        'json-formatter': true,
        'sql-formatter': 'yes',
        'text-diff': 1,
        'base64': false,
        'yaml-formatter': null,
      },
    });
    expect(result.perToolPaused).toEqual({
      'json-formatter': true,
      'base64': false,
    });
  });

  it('preserves valid fields and replaces invalid ones independently', () => {
    const result = sanitizeHistoryDefaults({
      drawerExpanded: true,
      paused: 'maybe',
      retention: 'forever',
      firstBlockToastDismissed: false,
      perToolPaused: { 'sql-formatter': true },
    });
    expect(result).toEqual({
      drawerExpanded: true,
      paused: false,
      retention: 'forever',
      firstBlockToastDismissed: false,
      perToolPaused: { 'sql-formatter': true },
    });
  });

  it('accepts all four valid retention values', () => {
    expect(sanitizeHistoryDefaults({ retention: '1d' }).retention).toBe('1d');
    expect(sanitizeHistoryDefaults({ retention: '7d' }).retention).toBe('7d');
    expect(sanitizeHistoryDefaults({ retention: '30d' }).retention).toBe('30d');
    expect(sanitizeHistoryDefaults({ retention: 'forever' }).retention).toBe('forever');
  });
});
