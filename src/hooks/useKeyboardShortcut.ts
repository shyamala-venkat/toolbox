import { useEffect, useRef } from 'react';

/**
 * Cross-platform keyboard shortcut hook.
 *
 * Combo format is a plus-joined string, e.g. `'mod+k'`, `'mod+shift+p'`,
 * `'escape'`, `'mod+1'`. The special token `mod` means Command on macOS and
 * Control elsewhere. Matching is case-insensitive for the non-modifier key.
 *
 * By default, the handler does NOT fire when an input/textarea/contentEditable
 * element is focused — this prevents surprising the user mid-type. Pass
 * `{ global: true }` to override (useful for ⌘K which should always open the
 * palette regardless of focus).
 */
export interface UseKeyboardShortcutOptions {
  /** Fire even when focus is in an editable element. */
  global?: boolean;
  /** Disable the listener without removing the call site. */
  enabled?: boolean;
  /** Prevent the browser's default action when the combo matches. */
  preventDefault?: boolean;
}

interface ParsedCombo {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const parseCombo = (combo: string): ParsedCombo => {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  let mod = false;
  let shift = false;
  let alt = false;
  let key = '';
  for (const part of parts) {
    if (part === 'mod' || part === 'cmd' || part === 'ctrl' || part === 'meta') mod = true;
    else if (part === 'shift') shift = true;
    else if (part === 'alt' || part === 'option') alt = true;
    else key = part;
  }
  return { mod, shift, alt, key };
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
};

export function useKeyboardShortcut(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: UseKeyboardShortcutOptions = {},
): void {
  // Keep handler fresh without re-binding the listener on every render.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const { global = false, enabled = true, preventDefault = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const parsed = parseCombo(combo);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!global && isEditableTarget(event.target)) return;

      const modPressed = event.metaKey || event.ctrlKey;
      if (parsed.mod !== modPressed) return;
      if (parsed.shift !== event.shiftKey) return;
      if (parsed.alt !== event.altKey) return;

      const eventKey = event.key.toLowerCase();
      if (eventKey !== parsed.key) return;

      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [combo, enabled, global, preventDefault]);
}
