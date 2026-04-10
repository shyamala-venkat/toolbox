import { useCallback, useEffect, useRef, useState } from 'react';
import { Github } from 'lucide-react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ApiKeyInput } from '@/components/settings/ApiKeyInput';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { usePreferences } from '@/hooks/usePreferences';
import { useAppStore, type Theme } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useToolStore } from '@/stores/toolStore';
import { getAppVersion } from '@/lib/tauri';
import { APP_VERSION } from '@/lib/constants';

// How long the "reset all preferences" confirm state stays armed before it
// auto-reverts. Matches the ApiKeyInput delete confirm — a dangerous action
// shouldn't stay armed after the user has walked away from the screen.
const CONFIRM_TIMEOUT_MS = 5_000;

export function Settings() {
  const { preferences, update } = usePreferences();
  const setTheme = useAppStore((s) => s.setTheme);
  const showToast = useAppStore((s) => s.showToast);
  const resetStore = useSettingsStore((s) => s.reset);
  const clearRecents = useToolStore((s) => s.clearRecents);
  const [runtimeVersion, setRuntimeVersion] = useState<string>(APP_VERSION);
  const [confirmReset, setConfirmReset] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    getAppVersion()
      .then(setRuntimeVersion)
      .catch(() => {
        /* Fall back to constant */
      });
  }, []);

  // Normalize legacy / out-of-range sidebar widths so the Select below has
  // something it can render. Anything outside the curated option set silently
  // snaps back to the canonical default.
  const SIDEBAR_WIDTH_OPTIONS = [200, 240, 280] as const;
  useEffect(() => {
    if (!SIDEBAR_WIDTH_OPTIONS.includes(preferences.sidebarWidth as 200 | 240 | 280)) {
      update({ sidebarWidth: 240 });
    }
    // Run once on mount — if the user picks a value via the Select, the new
    // value is by construction in-range and we shouldn't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleThemeChange = (theme: Theme): void => {
    setTheme(theme);
    update({ theme });
  };

  const handleClearRecents = (): void => {
    clearRecents();
    update({ recentToolIds: [] });
    showToast('Recent tools cleared', 'success');
  };

  const handleResetAll = (): void => {
    if (!confirmReset) {
      // Arm the confirm state and schedule an auto-revert so the button
      // doesn't stay in a dangerous state if the user walks away.
      setConfirmReset(true);
      clearConfirmTimer();
      confirmTimerRef.current = setTimeout(() => {
        setConfirmReset(false);
        confirmTimerRef.current = null;
      }, CONFIRM_TIMEOUT_MS);
      return;
    }
    clearConfirmTimer();
    resetStore();
    setConfirmReset(false);
    showToast('Preferences reset to defaults', 'success');
  };

  // Clear any pending confirm timer on unmount to avoid setState on a dead
  // component.
  useEffect(() => clearConfirmTimer, [clearConfirmTimer]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 py-10">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Configure how ToolBox looks, behaves, and persists.
        </p>
      </header>

      <SettingsSection
        title="General"
        description="Theme, density, and typography."
      >
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Theme
          </span>
          <div className="flex gap-2">
            {(['system', 'light', 'dark'] as const).map((opt) => (
              <label
                key={opt}
                className="flex-1 cursor-pointer"
              >
                <input
                  type="radio"
                  name="theme"
                  value={opt}
                  checked={preferences.theme === opt}
                  onChange={() => handleThemeChange(opt)}
                  className="sr-only"
                />
                <div
                  className="flex h-10 items-center justify-center px-3 text-sm capitalize transition-colors"
                  style={{
                    backgroundColor:
                      preferences.theme === opt ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                    border: `1px solid ${
                      preferences.theme === opt ? 'var(--accent)' : 'var(--border-primary)'
                    }`,
                    color:
                      preferences.theme === opt ? 'var(--accent)' : 'var(--text-primary)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {opt}
                </div>
              </label>
            ))}
          </div>
        </div>

        <Toggle
          checked={preferences.compactMode}
          onChange={(v) => update({ compactMode: v })}
          label="Compact mode"
          description="Tighter spacing across the app."
        />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="font-size"
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Monospace font size ({preferences.monospaceFontSize}px)
          </label>
          <input
            id="font-size"
            type="range"
            min={10}
            max={24}
            step={1}
            value={preferences.monospaceFontSize}
            onChange={(e) => update({ monospaceFontSize: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Behavior"
        description="How the app handles clipboard and tool switching."
      >
        <Toggle
          checked={preferences.smartDetectionEnabled}
          onChange={(v) => update({ smartDetectionEnabled: v })}
          label="Smart clipboard detection"
          description="Suggest the most likely tool when you paste."
        />
        <Toggle
          checked={preferences.autoProcessOnPaste}
          onChange={(v) => update({ autoProcessOnPaste: v })}
          label="Auto-process on paste"
          description="Run the current tool automatically when you paste input."
        />
        <Toggle
          checked={preferences.clearInputOnToolSwitch}
          onChange={(v) => update({ clearInputOnToolSwitch: v })}
          label="Clear input on tool switch"
          description="Reset input and output when navigating to a different tool."
        />
      </SettingsSection>

      <SettingsSection
        title="AI Features (BYOK)"
        description="Keys are stored in your OS keychain and never leave your device unless you use the associated tool."
      >
        <ApiKeyInput
          provider="openai"
          label="OpenAI"
          description="Used by tools that call GPT models."
        />
        <ApiKeyInput
          provider="anthropic"
          label="Anthropic"
          description="Used by tools that call Claude models."
        />
        <ApiKeyInput
          provider="google"
          label="Google"
          description="Used by tools that call Gemini models."
        />
      </SettingsSection>

      <SettingsSection
        title="Data"
        description="Clear history or reset preferences."
      >
        <div className="flex flex-col gap-3">
          <RowAction
            label="Clear recent tools"
            description="Remove the list of recently used tools."
            action={
              <Button size="sm" variant="secondary" onClick={handleClearRecents}>
                Clear
              </Button>
            }
          />
          <RowAction
            label="Reset all preferences"
            description="Restore every preference to its default."
            action={
              <Button
                size="sm"
                variant={confirmReset ? 'danger' : 'secondary'}
                onClick={handleResetAll}
              >
                {confirmReset ? 'Confirm reset' : 'Reset'}
              </Button>
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Sidebar width
          </span>
          <Select
            value={String(preferences.sidebarWidth)}
            onChange={(e) => update({ sidebarWidth: Number(e.target.value) })}
            options={[
              { value: '200', label: 'Narrow (200px)' },
              { value: '240', label: 'Default (240px)' },
              { value: '280', label: 'Wide (280px)' },
            ]}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="About">
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Version" value={runtimeVersion} />
          <Row label="License" value="MIT" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Github className="h-4 w-4" />}
          disabled
        >
          GitHub (coming soon)
        </Button>
      </SettingsSection>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

interface RowActionProps {
  label: string;
  description: string;
  action: React.ReactNode;
}

function RowAction({ label, description, action }: RowActionProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {description}
        </span>
      </div>
      {action}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="mono" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}
