/**
 * Settings → History panel (PR-A).
 *
 * Renders inside the existing Settings page. Owns:
 *   - Retention radio group (1d / 7d / 30d / forever)
 *   - Global pause toggle
 *   - Storage usage indicator (X.X MB used (of 50 MB) · N entries · M tools)
 *   - Clear all history (with two-step confirm)
 *   - Privacy explainer (collapsible <details>)
 *
 * Drawer-collapse state, per-tool always-pause, and Export-as-JSON are
 * deliberately NOT rendered here — they belong to PR-B (drawer flows) and
 * v2 (Activity page) respectively. See `tasks/tool-history.md` Codex C5/C6.
 *
 * Why no hardcoded colors: every tone draws from `themes.css` so light/dark
 * flip atomically. See CLAUDE.md "Security Invariants" #3.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, ShieldCheck } from 'lucide-react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { HistoryRetention } from '@/lib/tauri';

const CONFIRM_TIMEOUT_MS = 5_000;

const RETENTION_OPTIONS: ReadonlyArray<{ value: HistoryRetention; label: string; sub: string }> = [
  { value: '1d', label: '1 day', sub: 'Wipe daily' },
  { value: '7d', label: '7 days', sub: 'Default' },
  { value: '30d', label: '30 days', sub: 'Long memory' },
  { value: 'forever', label: 'Forever', sub: 'Until you clear' },
];

const SENSITIVE_TOOL_NAMES: ReadonlyArray<string> = [
  'Password Generator',
  'Password Checker',
  'Hash Generator',
  'JWT Decoder',
  'Backslash Escape',
  'Paycheck Calculator',
  'Tax Bracket Estimator',
];

const PATTERN_FAMILIES: ReadonlyArray<string> = [
  'AWS access keys',
  'GitHub personal access tokens',
  'Stripe keys',
  'Slack tokens',
  'Google API keys',
  'Bearer tokens',
  'sk- prefixed API keys (OpenAI, Anthropic, etc.)',
  'PEM private key blocks',
  'JWTs',
];

/**
 * Format a byte count as a short human-readable string, e.g. `2.4 MB`. For
 * Settings copy only; never shown in error messages or surfaces that touch
 * user-supplied values, so no redaction needed.
 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function HistorySettingsPanel() {
  const paused = useHistoryStore((s) => s.paused);
  const retention = useHistoryStore((s) => s.retention);
  const stats = useHistoryStore((s) => s.stats);
  const isStatsLoading = useHistoryStore((s) => s.isStatsLoading);
  const togglePause = useHistoryStore((s) => s.togglePause);
  const setRetention = useHistoryStore((s) => s.setRetention);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const refreshStats = useHistoryStore((s) => s.refreshStats);
  const syncFromPreferences = useHistoryStore((s) => s.syncFromPreferences);

  const isSettingsHydrated = useSettingsStore((s) => s.isHydrated);

  const [showConfirm, setShowConfirm] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  // Once preferences are hydrated, mirror their history slice into the
  // history store and pull the latest stats from Rust. Both are idempotent.
  useEffect(() => {
    if (!isSettingsHydrated) return;
    syncFromPreferences();
    void refreshStats();
  }, [isSettingsHydrated, syncFromPreferences, refreshStats]);

  // Clear the confirm timer on unmount so we don't setState on a dead
  // component.
  useEffect(() => clearConfirmTimer, [clearConfirmTimer]);

  const handleClearClick = useCallback(() => {
    if (!showConfirm) {
      setShowConfirm(true);
      clearConfirmTimer();
      confirmTimerRef.current = setTimeout(() => {
        setShowConfirm(false);
        confirmTimerRef.current = null;
      }, CONFIRM_TIMEOUT_MS);
      return;
    }
    clearConfirmTimer();
    setShowConfirm(false);
    void clearAll();
  }, [showConfirm, clearAll, clearConfirmTimer]);

  const storageLine = useMemo(() => {
    if (!stats) {
      return isStatsLoading ? 'Loading storage usage…' : 'Storage usage unavailable.';
    }
    const used = formatBytes(stats.bytes_used);
    const cap = formatBytes(stats.bytes_cap);
    const entryWord = stats.entries === 1 ? 'entry' : 'entries';
    const tombstoneNote =
      stats.tombstones > 0
        ? ` · ${stats.tombstones} sensitive ${stats.tombstones === 1 ? 'block' : 'blocks'}`
        : '';
    return `${used} used (of ${cap}) · ${stats.entries} ${entryWord}${tombstoneNote}`;
  }, [stats, isStatsLoading]);

  return (
    <SettingsSection
      title="History"
      description="Recent runs of text-based tools are saved locally so you can pick up where you left off. Sensitive content is automatically excluded."
    >
      {/* Retention */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Retention
        </span>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
          role="radiogroup"
          aria-label="History retention"
        >
          {RETENTION_OPTIONS.map((opt) => {
            const selected = retention === opt.value;
            return (
              <label key={opt.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="history-retention"
                  value={opt.value}
                  checked={selected}
                  onChange={() => void setRetention(opt.value)}
                  className="sr-only"
                />
                <div
                  className="flex flex-col items-start gap-0.5 px-3 py-2.5 transition-colors"
                  style={{
                    backgroundColor: selected ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    border: `1px solid ${
                      selected ? 'var(--accent)' : 'var(--border-primary)'
                    }`,
                    color: selected ? 'var(--accent)' : 'var(--text-primary)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span
                    className="text-xs"
                    style={{
                      color: selected ? 'var(--accent)' : 'var(--text-tertiary)',
                    }}
                  >
                    {opt.sub}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Pause */}
      <Toggle
        checked={paused}
        onChange={() => void togglePause()}
        label="Pause history globally"
        description="When on, ToolBox stops saving new entries. Existing history is kept."
      />

      {/* Storage usage */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Storage usage
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {storageLine}
        </span>
      </div>

      {/* Clear all */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Clear all history
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {showConfirm
              ? 'This will permanently delete all history. Cannot be undone.'
              : 'Permanently delete every saved run across every tool.'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showConfirm && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearConfirmTimer();
                setShowConfirm(false);
              }}
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            variant={showConfirm ? 'danger' : 'secondary'}
            leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            onClick={handleClearClick}
          >
            {showConfirm ? 'Clear all' : 'Clear'}
          </Button>
        </div>
      </div>

      {/* Privacy explainer (default collapsed) */}
      <details
        className="group"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
        }}
      >
        <summary
          className="flex cursor-pointer items-center gap-2 text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          <ShieldCheck
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--accent)' }}
            aria-hidden="true"
          />
          What ToolBox stores, where, and how it's protected
        </summary>
        <div
          className="mt-3 flex flex-col gap-3 text-xs leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p>
            History is stored in a single SQLite file at{' '}
            <span className="mono" style={{ color: 'var(--text-primary)' }}>
              ~/Library/Application Support/ToolBox/history.db
            </span>{' '}
            (or the platform equivalent). The database is encrypted with{' '}
            <strong>SQLCipher</strong> using a 32-byte random key generated on
            first launch. The key lives in your operating system's keychain
            under the service name <span className="mono">toolbox-history</span>{' '}
            and never leaves the device.
          </p>
          <div>
            <p className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
              What gets stored
            </p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>
                The input text, output text, and parameters of each run for
                eligible text-based tools.
              </li>
              <li>
                A timestamp, the tool ID, and a small accounting field for
                size caps.
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
              What never gets stored
            </p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>
                Anything from sensitive tools — they have no history at all:
                {' '}
                <span style={{ color: 'var(--text-primary)' }}>
                  {SENSITIVE_TOOL_NAMES.join(', ')}.
                </span>
              </li>
              <li>
                Inputs, outputs, or parameter values that match a known
                secret-pattern family (see below). When detected, ToolBox
                writes a privacy tombstone — a row that proves a run
                happened but contains no content.
              </li>
              <li>
                File bytes from any file-input tool (PDF, image, etc.). Those
                tools are not eligible for history in this version.
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
              Patterns ToolBox detects
            </p>
            <ul className="ml-4 list-disc space-y-0.5">
              {PATTERN_FAMILIES.map((family) => (
                <li key={family}>{family}</li>
              ))}
            </ul>
            <p className="mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Pattern detection is best-effort. False negatives are
              possible — if you handle highly sensitive data, pause history
              or use the per-tool pause setting (coming soon).
            </p>
          </div>
          <div>
            <p className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
              Limits
            </p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>Up to 200 entries per tool.</li>
              <li>Up to 50 MB total across all tools.</li>
              <li>
                When a cap is hit, the oldest unpinned entry is silently
                removed.
              </li>
            </ul>
          </div>
        </div>
      </details>
    </SettingsSection>
  );
}
