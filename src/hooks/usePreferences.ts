import { useEffect } from 'react';
import { useSettingsStore, type UserPreferences } from '@/stores/settingsStore';

/**
 * Convenience hook that hydrates the preferences store on first mount and
 * exposes `{ preferences, update, isHydrated }`.
 *
 * The hydration call is idempotent: the store guards against double-calls via
 * `isHydrated`, so multiple components can use this hook freely.
 */
export function usePreferences(): {
  preferences: UserPreferences;
  update: (partial: Partial<UserPreferences>) => void;
  isHydrated: boolean;
} {
  const preferences = useSettingsStore((s) => s.preferences);
  const isHydrated = useSettingsStore((s) => s.isHydrated);
  const update = useSettingsStore((s) => s.update);
  const hydrate = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    if (!isHydrated) {
      void hydrate();
    }
  }, [isHydrated, hydrate]);

  return { preferences, update, isHydrated };
}
