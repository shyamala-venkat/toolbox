import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react';
import {
  deleteApiKey,
  getApiKey,
  getApiKeySummary,
  storeApiKey,
  type ApiKeySummary,
  type KeychainProvider,
} from '@/lib/tauri';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppStore } from '@/stores/appStore';

export interface ApiKeyInputProps {
  provider: KeychainProvider;
  label: string;
  description?: string;
  placeholder?: string;
}

type Status = 'idle' | 'loading' | 'saving' | 'revealing';

// How long the raw key is allowed to sit in React state after the user
// clicks "Reveal". The window is deliberately short — if someone walks
// away from their desk, the key shouldn't linger forever in memory.
const REVEAL_TIMEOUT_MS = 30_000;

// How long the delete confirm state stays armed before auto-reverting. Same
// idea — a dangerous action shouldn't stay armed after the user has stopped
// looking at it.
const CONFIRM_TIMEOUT_MS = 5_000;

// Shared empty summary used for the "no key stored" state.
const EMPTY_SUMMARY: ApiKeySummary = { has_key: false, last_four: null };

const formatMasked = (lastFour: string | null): string => {
  if (!lastFour) return '•••• •••• •••• ••••';
  return `•••• •••• •••• ${lastFour}`;
};

export function ApiKeyInput({
  provider,
  label,
  description,
  placeholder = 'Paste API key',
}: ApiKeyInputProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [summary, setSummary] = useState<ApiKeySummary>(EMPTY_SUMMARY);
  const [draft, setDraft] = useState('');
  const [draftReveal, setDraftReveal] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  // Auto-revert timers — one for the reveal window, one for the delete
  // confirm. Both are cleared on unmount so the setState never fires on a
  // dead component.
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  const hideRevealedKey = useCallback(() => {
    clearRevealTimer();
    setRevealedKey(null);
  }, [clearRevealTimer]);

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const next = await getApiKeySummary(provider);
      setSummary(next);
    } catch {
      // Never echo the provider-keyed error back to the user; a generic
      // message prevents side-channel info about keychain state.
      showToast(`Could not read ${label} key`, 'error');
      setSummary(EMPTY_SUMMARY);
    } finally {
      setStatus('idle');
    }
  }, [provider, label, showToast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Cleanup: clear any pending timers on unmount so stale setState doesn't
  // fire after the component is gone.
  useEffect(
    () => () => {
      clearRevealTimer();
      clearConfirmTimer();
    },
    [clearRevealTimer, clearConfirmTimer],
  );

  const handleSave = async (): Promise<void> => {
    const value = draft.trim();
    if (!value) return;
    setStatus('saving');
    try {
      await storeApiKey(provider, value);
      setDraft('');
      setDraftReveal(false);
      showToast(`${label} key saved`, 'success');
      // Re-fetch the summary so the masked display shows the last four chars
      // of the key we just stored — we never re-use the raw draft value.
      await reload();
    } catch {
      showToast(`Could not save ${label} key`, 'error');
      setStatus('idle');
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!confirmDelete) {
      // Arm the confirm state and schedule an auto-revert so the button
      // doesn't stay in a dangerous state if the user walks away.
      setConfirmDelete(true);
      clearConfirmTimer();
      confirmTimerRef.current = setTimeout(() => {
        setConfirmDelete(false);
        confirmTimerRef.current = null;
      }, CONFIRM_TIMEOUT_MS);
      return;
    }
    clearConfirmTimer();
    try {
      await deleteApiKey(provider);
      setSummary(EMPTY_SUMMARY);
      hideRevealedKey();
      setConfirmDelete(false);
      showToast(`${label} key removed`, 'success');
    } catch {
      showToast(`Could not remove ${label} key`, 'error');
    }
  };

  const handleToggleReveal = async (): Promise<void> => {
    if (revealedKey !== null) {
      hideRevealedKey();
      return;
    }
    setStatus('revealing');
    try {
      const raw = await getApiKey(provider);
      if (raw === null) {
        // Key disappeared between summary fetch and reveal — refresh UI state.
        setSummary(EMPTY_SUMMARY);
        return;
      }
      setRevealedKey(raw);
      // Auto-hide the key after a short window so it doesn't linger in
      // memory if the user forgets to collapse it.
      clearRevealTimer();
      revealTimerRef.current = setTimeout(() => {
        setRevealedKey(null);
        revealTimerRef.current = null;
      }, REVEAL_TIMEOUT_MS);
    } catch {
      showToast(`Could not reveal ${label} key`, 'error');
    } finally {
      setStatus('idle');
    }
  };

  const hasKey = summary.has_key;
  const isRevealed = revealedKey !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {label}
          </span>
          {description && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {description}
            </span>
          )}
        </div>
        {hasKey && (
          <span
            className="rounded px-2 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent)',
            }}
          >
            Saved
          </span>
        )}
      </div>

      {hasKey ? (
        <div className="flex items-center gap-2">
          <div
            className="mono flex h-9 flex-1 items-center justify-between gap-2 px-3 text-sm"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="truncate">
              {isRevealed ? revealedKey : formatMasked(summary.last_four)}
            </span>
            <button
              type="button"
              onClick={() => void handleToggleReveal()}
              aria-label={isRevealed ? `Hide ${label} key` : `Reveal ${label} key`}
              disabled={status === 'revealing'}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {isRevealed ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <Button
            size="sm"
            variant={confirmDelete ? 'danger' : 'secondary'}
            onClick={() => void handleDelete()}
            leadingIcon={<Trash2 className="h-4 w-4" />}
          >
            {confirmDelete ? 'Confirm' : 'Remove'}
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            type={draftReveal ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            disabled={status !== 'idle'}
            trailingIcon={
              <button
                type="button"
                onClick={() => setDraftReveal((r) => !r)}
                aria-label={draftReveal ? 'Hide key' : 'Reveal key'}
                className="inline-flex h-5 w-5 items-center justify-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {draftReveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <Button
            size="md"
            variant="primary"
            onClick={() => void handleSave()}
            disabled={!draft.trim()}
            loading={status === 'saving'}
            leadingIcon={<Save className="h-4 w-4" />}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
