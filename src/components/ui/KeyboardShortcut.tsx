import { useEffect, useState } from 'react';
import { getPlatform } from '@/lib/tauri';
import { cn } from '@/lib/utils';

/**
 * Renders a keyboard shortcut combo as a series of `<kbd>` badges.
 * The `mod` token is rendered as `⌘` on macOS, `Ctrl` elsewhere.
 *
 * Platform detection: tries the Tauri IPC first (authoritative in Tauri
 * windows) and falls back to `navigator.platform` for the browser / SSR case.
 */
export interface KeyboardShortcutProps {
  combo: string;
  className?: string;
}

type Platform = 'mac' | 'other';

const detectFallbackPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'other';
  const p = (navigator.platform || '').toLowerCase();
  const ua = (navigator.userAgent || '').toLowerCase();
  if (p.includes('mac') || ua.includes('mac os')) return 'mac';
  return 'other';
};

const FRIENDLY_KEY: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  tab: 'Tab',
  space: 'Space',
};

const formatKey = (part: string, platform: Platform): string => {
  const key = part.toLowerCase().trim();
  if (key === 'mod' || key === 'cmd' || key === 'meta') return platform === 'mac' ? '⌘' : 'Ctrl';
  if (key === 'ctrl') return platform === 'mac' ? '⌃' : 'Ctrl';
  if (key === 'shift') return platform === 'mac' ? '⇧' : 'Shift';
  if (key === 'alt' || key === 'option') return platform === 'mac' ? '⌥' : 'Alt';
  if (FRIENDLY_KEY[key]) return FRIENDLY_KEY[key]!;
  return key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1);
};

export function KeyboardShortcut({ combo, className }: KeyboardShortcutProps) {
  const [platform, setPlatform] = useState<Platform>(detectFallbackPlatform());

  useEffect(() => {
    let cancelled = false;
    getPlatform()
      .then((p) => {
        if (cancelled) return;
        setPlatform(p === 'macos' ? 'mac' : 'other');
      })
      .catch(() => {
        // Tauri not available (e.g. pure browser) — fallback already applied
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {parts.map((part, idx) => (
        <kbd
          key={`${part}-${idx}`}
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 1px 0 var(--border-primary)',
          }}
        >
          {formatKey(part, platform)}
        </kbd>
      ))}
    </span>
  );
}
