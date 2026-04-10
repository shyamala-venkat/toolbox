import { useCallback } from 'react';
import {
  readText as tauriReadText,
  writeText as tauriWriteText,
} from '@tauri-apps/plugin-clipboard-manager';

/**
 * Thin wrapper around the Tauri clipboard plugin.
 *
 * Why this exists: components should not import plugin APIs directly so we
 * have one place to add telemetry, fallback behavior, or permission errors.
 */
export interface UseClipboard {
  read: () => Promise<string>;
  write: (value: string) => Promise<void>;
}

export function useClipboard(): UseClipboard {
  const read = useCallback(async (): Promise<string> => {
    try {
      return await tauriReadText();
    } catch {
      return '';
    }
  }, []);

  const write = useCallback(async (value: string): Promise<void> => {
    await tauriWriteText(value);
  }, []);

  return { read, write };
}
