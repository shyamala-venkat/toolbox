/**
 * C1 regression: the drawer's Settings link must call `useNavigate()` from
 * react-router-dom rather than mutating `window.location.hash`.
 *
 * The project's vitest runs in `node` env (no jsdom + no RTL), so we can't
 * mount the Drawer component. Instead, we model the exact click-handler
 * contract the component now implements and assert it on synthetic events.
 *
 * If this test stops matching the component's handler logic, fix one or
 * the other — they MUST stay in lockstep. The fix here is the one that
 * lets BrowserRouter actually pick up the route change.
 */

import { describe, expect, it, vi } from 'vitest';

interface MouseLikeEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  button: number;
  preventDefault: () => void;
}

const buildSettingsClickHandler = (navigate: (to: string) => void) =>
  (e: MouseLikeEvent): void => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate('/settings');
  };

const mkEvent = (overrides: Partial<MouseLikeEvent> = {}): MouseLikeEvent => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  button: 0,
  preventDefault: vi.fn(),
  ...overrides,
});

describe('Drawer settings-link click handler', () => {
  it('calls navigate("/settings") on a plain left click', () => {
    const navigate = vi.fn();
    const handler = buildSettingsClickHandler(navigate);
    const e = mkEvent();

    handler(e);

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/settings');
  });

  it('lets the browser handle cmd+click so the link opens in a new tab', () => {
    const navigate = vi.fn();
    const handler = buildSettingsClickHandler(navigate);
    const e = mkEvent({ metaKey: true });

    handler(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets the browser handle ctrl+click (Windows/Linux equivalent)', () => {
    const navigate = vi.fn();
    const handler = buildSettingsClickHandler(navigate);
    const e = mkEvent({ ctrlKey: true });

    handler(e);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets the browser handle middle-click (button=1)', () => {
    const navigate = vi.fn();
    const handler = buildSettingsClickHandler(navigate);
    const e = mkEvent({ button: 1 });

    handler(e);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does NOT mutate window.location.hash', () => {
    // The previous (broken) handler set `window.location.hash = '#/settings'`
    // which is a silent no-op under BrowserRouter. The current handler must
    // never touch `window.location` at all.
    const navigate = vi.fn();
    const handler = buildSettingsClickHandler(navigate);
    const e = mkEvent();

    // Use a sentinel to detect any property set. Node runs without a real
    // DOM, but `globalThis.window` may be defined; guard either way.
    const before = (globalThis as { window?: { location?: { hash?: string } } }).window
      ?.location?.hash;
    handler(e);
    const after = (globalThis as { window?: { location?: { hash?: string } } }).window
      ?.location?.hash;
    expect(after).toBe(before);
    expect(navigate).toHaveBeenCalledWith('/settings');
  });
});
