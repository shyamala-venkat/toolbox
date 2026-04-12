import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

/**
 * Non-intrusive update notification banner.
 *
 * On mount, fires a background update check against the configured Tauri
 * updater endpoint (GitHub Releases). If an update is available, renders a
 * thin banner at the top of the app. The check is entirely non-blocking —
 * the user can interact with the app immediately.
 *
 * All failures (network errors, missing endpoint, unsigned updates) are
 * swallowed silently so the app works 100% offline.
 */

type BannerState =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; progress: number }
  | { kind: 'ready' }
  | { kind: 'dismissed' };

export function UpdateBanner() {
  const [state, setState] = useState<BannerState>({ kind: 'idle' });

  // Hold onto the Update object so we can call downloadAndInstall later.
  // Using `any` because the exact type varies across plugin versions and
  // we don't want a hard compile-time dependency on the plugin's internal types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled) return;

        if (update) {
          updateRef.current = update;
          setState({ kind: 'available', version: update.version });
        }
        // No update → stay idle (render nothing).
      } catch {
        // Silently swallow all errors: network failures, missing endpoint,
        // unsigned updates, plugin not configured, etc.
        // The app must work 100% offline.
      }
    };

    void checkForUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = async () => {
    const update = updateRef.current;
    if (!update) return;

    try {
      setState({ kind: 'downloading', progress: 0 });

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event: { event: string; data: { contentLength?: number; chunkLength?: number } }) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength ?? 0;
          const pct = totalBytes > 0
            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            : 0;
          setState({ kind: 'downloading', progress: pct });
        } else if (event.event === 'Finished') {
          setState({ kind: 'ready' });
        }
      });

      // downloadAndInstall resolved — the update is staged.
      setState({ kind: 'ready' });
    } catch {
      // Download/install failed — revert to "available" so the user can retry.
      setState({
        kind: 'available',
        version: update.version ?? 'unknown',
      });
    }
  };

  const handleRelaunch = async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      // If relaunch fails, there's nothing useful we can do.
    }
  };

  const handleDismiss = () => {
    setState({ kind: 'dismissed' });
  };

  // Render nothing for idle, dismissed, or no-update states.
  if (state.kind === 'idle' || state.kind === 'dismissed') {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 px-4 py-2 text-xs"
      style={{
        backgroundColor: 'var(--accent-subtle)',
        borderBottom: '1px solid var(--border-primary)',
        color: 'var(--text-primary)',
        flexShrink: 0,
      }}
    >
      {state.kind === 'available' && (
        <>
          <span>
            <strong style={{ color: 'var(--accent)' }}>ToolBox v{state.version}</strong>{' '}
            is available.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUpdate}
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              Update now
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss update notification"
              className="inline-flex h-5 w-5 items-center justify-center rounded"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {state.kind === 'downloading' && (
        <>
          <div className="flex flex-1 items-center gap-3">
            <span>Downloading update{state.progress > 0 ? ` (${state.progress}%)` : ''}...</span>
            <div
              className="h-1.5 flex-1 overflow-hidden"
              style={{
                backgroundColor: 'var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                maxWidth: '200px',
              }}
            >
              <div
                className="h-full transition-all duration-200"
                style={{
                  width: `${state.progress}%`,
                  backgroundColor: 'var(--accent)',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
            </div>
          </div>
        </>
      )}

      {state.kind === 'ready' && (
        <>
          <span>Update downloaded. Restart to apply.</span>
          <button
            type="button"
            onClick={handleRelaunch}
            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Restart now
          </button>
        </>
      )}
    </div>
  );
}
