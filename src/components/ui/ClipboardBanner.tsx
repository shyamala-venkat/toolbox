/**
 * Clipboard auto-detect banner.
 *
 * Polls the system clipboard when the app window is focused and
 * `smartDetectionEnabled` is true. Matches clipboard content against:
 *
 *   1. File path extensions (.pdf, .png, .jpg, etc.) → suggests the most
 *      relevant tool for that file type.
 *   2. Tool `clipboardDetection.patterns` regex arrays → matches text
 *      content (JSON, JWTs, timestamps, etc.).
 *
 * Sensitive content (passwords, API keys, tokens) is detected and
 * silently skipped to respect the privacy-first principle.
 *
 * The banner renders above the main content area (in Layout.tsx) and
 * offers a one-click "Open in {tool}" action.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clipboard, X } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { useSettingsStore } from '@/stores/settingsStore';
import { toolRegistry, getToolById } from '@/tools/registry';
import type { ToolDefinition } from '@/tools/types';
import { getToolIcon } from '@/lib/icons';

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 800;

/** File extension → tool ID mapping for file path detection. */
const EXT_TO_TOOL: Record<string, string> = {
  '.pdf': 'pdf-merge',
  '.png': 'image-resize',
  '.jpg': 'image-resize',
  '.jpeg': 'image-resize',
  '.gif': 'image-resize',
  '.svg': 'image-resize',
  '.webp': 'image-resize',
  '.bmp': 'image-resize',
  '.tiff': 'image-resize',
  '.tif': 'image-resize',
  '.ico': 'image-resize',
  '.csv': 'csv-viewer',
  '.json': 'json-formatter',
  '.xml': 'xml-formatter',
  '.yaml': 'yaml-json',
  '.yml': 'yaml-json',
  '.md': 'markdown-preview',
  '.zip': 'zip-tool',
};

/**
 * Patterns that indicate sensitive content. If any of these match,
 * we skip detection entirely to avoid surfacing passwords, API keys,
 * or tokens in the banner.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  // API keys: sk-..., pk-..., ak-..., AKIA...
  /^(sk|pk|ak|rk)[-_][a-zA-Z0-9]{20,}/,
  /^AKIA[A-Z0-9]{16}/,
  // Bearer tokens
  /^Bearer\s+[a-zA-Z0-9._\-/+=]{20,}/i,
  // Passwords: short strings with mixed characters that look like credentials
  // (heuristic: 8-64 chars, has uppercase + lowercase + digit/symbol, no spaces)
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W]).{8,64}$/,
  // Private keys
  /^-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  // Connection strings
  /^(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/i,
  // AWS secret keys (40 char base64)
  /^[a-zA-Z0-9/+=]{40}$/,
];

// ─── Hook: clipboard detection ──────────────────────────────────────────────

interface DetectionResult {
  tool: ToolDefinition;
  label: string;
}

function useClipboardDetection(): {
  detection: DetectionResult | null;
  dismiss: () => void;
} {
  const clipboard = useClipboard();
  const enabled = useSettingsStore((s) => s.preferences.smartDetectionEnabled);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const lastContent = useRef('');
  const dismissedContent = useRef('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detect = useCallback(
    async () => {
      if (!enabled) return;

      let text: string;
      try {
        text = await clipboard.read();
      } catch {
        return;
      }

      if (!text || text === lastContent.current) return;
      lastContent.current = text;

      // If user dismissed this exact content, don't re-show
      if (text === dismissedContent.current) return;

      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 10_000) return;

      // Skip sensitive content
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(trimmed)) return;
      }

      // 1. Try file path extension matching
      const fileMatch = detectFileExtension(trimmed);
      if (fileMatch) {
        setDetection(fileMatch);
        return;
      }

      // 2. Try tool clipboardDetection regex patterns
      const patternMatch = detectToolPattern(trimmed);
      if (patternMatch) {
        setDetection(patternMatch);
        return;
      }

      // No match — clear any previous detection
      setDetection(null);
    },
    [clipboard, enabled],
  );

  // Start/stop polling on window focus/blur
  useEffect(() => {
    if (!enabled) {
      setDetection(null);
      return;
    }

    const startPolling = () => {
      if (intervalRef.current) return;
      detect(); // immediate first check
      intervalRef.current = setInterval(detect, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // Only poll when window is focused
    if (document.hasFocus()) {
      startPolling();
    }

    window.addEventListener('focus', startPolling);
    window.addEventListener('blur', stopPolling);

    return () => {
      stopPolling();
      window.removeEventListener('focus', startPolling);
      window.removeEventListener('blur', stopPolling);
    };
  }, [enabled, detect]);

  const dismiss = useCallback(() => {
    dismissedContent.current = lastContent.current;
    setDetection(null);
  }, []);

  return { detection, dismiss };
}

// ─── Detection helpers ──────────────────────────────────────────────────────

function detectFileExtension(text: string): DetectionResult | null {
  // Check if it looks like a file path (starts with / or drive letter, or ~/)
  const looksLikePath =
    text.startsWith('/') ||
    text.startsWith('~/') ||
    /^[A-Z]:\\/i.test(text) ||
    /^[A-Z]:\//i.test(text);

  if (!looksLikePath) return null;

  // No newlines in file paths
  if (text.includes('\n')) return null;

  const lower = text.toLowerCase();
  for (const [ext, toolId] of Object.entries(EXT_TO_TOOL)) {
    if (lower.endsWith(ext)) {
      const tool = getToolById(toolId);
      if (tool) {
        const extName = ext.replace('.', '').toUpperCase();
        return { tool, label: `${extName} file detected` };
      }
    }
  }

  return null;
}

function detectToolPattern(text: string): DetectionResult | null {
  const candidates: { tool: ToolDefinition; priority: number }[] = [];

  for (const tool of toolRegistry) {
    if (!tool.clipboardDetection) continue;
    for (const pattern of tool.clipboardDetection.patterns) {
      if (pattern.test(text)) {
        candidates.push({ tool, priority: tool.clipboardDetection.priority });
        break;
      }
    }
  }

  if (candidates.length === 0) return null;

  // Highest priority wins (lower number = higher priority... wait, let's check)
  // Looking at existing patterns: JSON=10, JWT=9, Timestamp=8
  // Higher number = higher priority in the existing convention
  candidates.sort((a, b) => b.priority - a.priority);
  const best = candidates[0] as { tool: ToolDefinition; priority: number } | undefined;
  if (!best) return null;
  return { tool: best.tool, label: `${best.tool.name} content detected` };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ClipboardBanner() {
  const { detection, dismiss } = useClipboardDetection();
  const navigate = useNavigate();

  if (!detection) return null;

  const Icon = getToolIcon(detection.tool.icon);

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{
        backgroundColor: 'var(--accent-subtle)',
        borderBottom: '1px solid var(--border-primary)',
      }}
      role="status"
      aria-live="polite"
    >
      <Clipboard
        className="h-4 w-4 shrink-0"
        style={{ color: 'var(--accent)' }}
        aria-hidden="true"
      />
      <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
        {detection.label}
      </span>
      <button
        type="button"
        onClick={() => {
          navigate(`/tools/${detection.tool.id}`);
          dismiss();
        }}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
        style={{
          backgroundColor: 'var(--accent)',
          color: 'var(--accent-contrast)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        Open in {detection.tool.name}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss clipboard suggestion"
        className="flex h-6 w-6 items-center justify-center rounded"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
