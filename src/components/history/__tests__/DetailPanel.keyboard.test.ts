/**
 * C2 regression: DetailPanel's keyboard handler must NOT hijack Cmd+R or
 * Cmd+P. Those are reserved by the browser for refresh and print; without
 * the modifier guards the previous implementation called `e.preventDefault`
 * on every `r/R` and `p/P` keystroke and broke both shortcuts whenever the
 * detail panel was mounted.
 *
 * We re-implement the handler's branching logic locally so the test runs
 * in node (no jsdom). If the component's keyboard model changes, update
 * BOTH this helper and the component — they're a contract.
 */

import { describe, expect, it, vi } from 'vitest';

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

interface PanelDeps {
  onClose: () => void;
  onRestore: () => void;
  onTogglePin: () => void;
  onConfirmDelete: () => void;
  redacted: boolean;
}

const handle = (e: KeyLike, deps: PanelDeps): void => {
  const target = e.target ?? null;
  if (
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable
  ) {
    return;
  }
  if (e.key === 'Escape') {
    deps.onClose();
  } else if (
    (e.key === 'r' || e.key === 'R') &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !deps.redacted
  ) {
    e.preventDefault();
    deps.onRestore();
  } else if (
    (e.key === 'p' || e.key === 'P') &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  ) {
    if (deps.redacted) return;
    e.preventDefault();
    deps.onTogglePin();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      deps.onConfirmDelete();
    }
  }
};

const mkEvent = (overrides: Partial<KeyLike>): KeyLike => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  preventDefault: vi.fn(),
  target: null,
  ...overrides,
});

const mkDeps = (overrides: Partial<PanelDeps> = {}): PanelDeps => ({
  onClose: vi.fn(),
  onRestore: vi.fn(),
  onTogglePin: vi.fn(),
  onConfirmDelete: vi.fn(),
  redacted: false,
  ...overrides,
});

describe('DetailPanel keyboard model — modifier guards', () => {
  it('does NOT trigger Restore when Cmd+R is pressed', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'r', metaKey: true });

    handle(e, deps);

    expect(deps.onRestore).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('does NOT trigger Restore when Ctrl+R is pressed', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'R', ctrlKey: true });

    handle(e, deps);

    expect(deps.onRestore).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('does NOT trigger Pin when Cmd+P is pressed', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'p', metaKey: true });

    handle(e, deps);

    expect(deps.onTogglePin).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('does NOT trigger Pin when Ctrl+P is pressed', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'P', ctrlKey: true });

    handle(e, deps);

    expect(deps.onTogglePin).not.toHaveBeenCalled();
  });

  it('still triggers Restore on a bare R press', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'R' });

    handle(e, deps);

    expect(deps.onRestore).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('still triggers Pin on a bare P press', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'p' });

    handle(e, deps);

    expect(deps.onTogglePin).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('skips Restore when the row is a tombstone', () => {
    const deps = mkDeps({ redacted: true });
    const e = mkEvent({ key: 'r' });

    handle(e, deps);

    expect(deps.onRestore).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('still surfaces Cmd+Delete as the destructive shortcut', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'Delete', metaKey: true });

    handle(e, deps);

    expect(deps.onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it('does not hijack Alt+R either (Alt is a reserved modifier)', () => {
    const deps = mkDeps();
    const e = mkEvent({ key: 'r', altKey: true });

    handle(e, deps);

    expect(deps.onRestore).not.toHaveBeenCalled();
  });
});
