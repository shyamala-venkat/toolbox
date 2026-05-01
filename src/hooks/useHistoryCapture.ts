/**
 * useHistoryCapture — fire-and-forget hook that records a tool run in the
 * encrypted history database.
 *
 * Behavior:
 *   - Debounces `input` for `debounceMs` (default 1500ms) so we don't write
 *     a row for every keystroke. The hook fires AFTER the input stabilizes.
 *   - Skips capture when:
 *       · `enabled === false` (the tool says it's in an error state)
 *       · debounced `input.trim() === ''`
 *       · `output.trim() === ''`
 *     These checks are deliberately permissive: it is always safe to skip,
 *     and never safe to write a half-formed row.
 *   - On `add_history_entry` success: prepends the canonical entry returned
 *     by Rust into `historyStore.entriesByTool[toolId]` IF that slice has
 *     already been fetched. (If it hasn't, the next drawer expand will
 *     hydrate the canonical list.) The Rust IPC echoes the inserted row so
 *     the frontend never invents a synthetic id — pin/delete on a fresh row
 *     can therefore round-trip to Rust correctly.
 *   - On `stored: false` with a sensitive reason (or `stored: true` with a
 *     sensitive reason for tombstones): shows the first-block toast exactly
 *     once per install. The dismissed flag is read from `useSettingsStore`
 *     (hydrated at app startup), and the eager "shown this session" flag
 *     prevents two near-simultaneous IPC results from firing the toast twice
 *     before the user has time to click "Got it".
 *   - On IPC error: swallows + console.warn. Tool functionality is never
 *     allowed to break because of history. This is a hard rule from the
 *     plan ("Failure modes" table — IPC failure is acceptable silent loss).
 */

import { useEffect, useRef } from 'react';
import { addHistoryEntry } from '@/lib/tauri';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { useDebounce } from './useDebounce';

interface UseHistoryCaptureOpts {
  toolId: string;
  input: string;
  output: string;
  params: Record<string, unknown>;
  /** When false, capture is skipped. Defaults to true. */
  enabled?: boolean;
  /** Debounce window in ms. Defaults to 1500. */
  debounceMs?: number;
}

const FIRST_BLOCK_TOAST_MESSAGE =
  'Sensitive content detected. This run was not saved to history.';

/**
 * Decide whether the IPC result represents a sensitive-content block that
 * should trigger the first-block toast. Tombstones come back as
 * `stored: true` with a sensitive reason; outright rejections come back as
 * `stored: false` with the same reason families.
 */
const isSensitiveBlock = (reason: string): boolean =>
  reason === 'blocklisted' ||
  reason.startsWith('sensitive_pattern') ||
  reason.startsWith('output_pattern');

export function useHistoryCapture(opts: UseHistoryCaptureOpts): void {
  const {
    toolId,
    input,
    output,
    params,
    enabled = true,
    debounceMs = 1500,
  } = opts;

  const debouncedInput = useDebounce(input, debounceMs);

  // Track the last `(input, output)` we successfully attempted to capture
  // so a re-render with the same values doesn't fire a duplicate IPC. The
  // debounce already collapses keystroke storms, but `output` updates can
  // re-render the consumer at a different cadence.
  const lastAttemptRef = useRef<{ input: string; output: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const trimmedInput = debouncedInput.trim();
    const trimmedOutput = output.trim();
    if (trimmedInput.length === 0 || trimmedOutput.length === 0) return;

    const last = lastAttemptRef.current;
    if (last && last.input === debouncedInput && last.output === output) return;
    lastAttemptRef.current = { input: debouncedInput, output };

    let cancelled = false;

    const send = async (): Promise<void> => {
      try {
        const result = await addHistoryEntry({
          toolId,
          input: debouncedInput,
          output,
          params,
        });
        if (cancelled) return;

        const reason = result.reason ?? '';
        const isBlock = reason !== '' && isSensitiveBlock(reason);

        if (isBlock) {
          // Read the persisted dismissal flag from settings (hydrated at
          // startup) — NOT from historyStore, which only mirrors after an
          // explicit `syncFromPreferences()` call. Combined with the
          // session-level `firstBlockToastShown` flag we get exactly-once
          // behavior even for back-to-back IPC results.
          const persistedDismissed = useSettingsStore
            .getState()
            .preferences.history.firstBlockToastDismissed;
          const sessionShown = useHistoryStore.getState().firstBlockToastShown;

          if (!persistedDismissed && !sessionShown) {
            // Eagerly mark "shown this session" + persist dismissal so a
            // second sensitive IPC racing with this one cannot re-trigger.
            useHistoryStore.setState({ firstBlockToastShown: true });
            useHistoryStore.getState().dismissFirstBlockToast();
            useAppStore.getState().showToast(FIRST_BLOCK_TOAST_MESSAGE, 'warning', {
              label: 'Got it',
              // The dismissal is already persisted; the click is just an
              // explicit acknowledgement. Keep the callback to honor the
              // existing toast contract that buttons have an onClick.
              onClick: () => undefined,
            });
          }
        }

        // Optimistic insert — only when Rust echoed back a row. The IPC
        // contract guarantees `entry` is present whenever `stored=true`
        // (full rows AND tombstones).
        if (result.stored && result.entry) {
          useHistoryStore.getState().addEntry(toolId, result.entry);
        }
      } catch (err) {
        // Swallow: history capture must never break the tool. We log a
        // warning so devtools surface the failure during development.
        console.warn('[useHistoryCapture] add_history_entry failed:', err);
      }
    };

    void send();

    return () => {
      cancelled = true;
    };
    // We deliberately do NOT depend on `params` reference identity — many
    // tools rebuild their params object per render. Stringifying gives us
    // a stable comparator for "did the params actually change?".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, debouncedInput, output, enabled, JSON.stringify(params)]);
}
