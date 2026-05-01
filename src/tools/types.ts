import type { LazyExoticComponent, ComponentType } from 'react';

export type ToolCategory =
  | 'encoders-decoders'
  | 'formatters'
  | 'generators'
  | 'converters'
  | 'text'
  | 'media'
  | 'network'
  | 'crypto'
  | 'pdf-tools'
  | 'image-tools'
  | 'file-tools'
  | 'finance'
  | 'calculators';

export interface ClipboardDetection {
  patterns: RegExp[];
  priority: number;
}

/**
 * Generic kind hint for the history detail-panel viewer. Each text-eligible
 * tool declares its kind so the shared `<HistoryViewer>` can apply the right
 * monospace-and-wrap treatment without ever lazy-loading the tool itself.
 */
export type ToolHistoryKind =
  | 'text'
  | 'json'
  | 'sql'
  | 'yaml'
  | 'xml'
  | 'html'
  | 'markdown'
  | 'regex'
  | 'csv'
  | 'diff';

export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: ToolCategory;
  tags: string[];
  icon: string;
  tier: 'free' | 'pro';
  requiresBackend: boolean;
  requiresSidecar?: string;
  keyboardShortcut?: string;
  clipboardDetection?: ClipboardDetection;
  /**
   * History eligibility (PR-B / v1).
   *
   * - `sensitiveContent: true` → tool's data is highly sensitive (passwords,
   *   hashes, tokens). The drawer is never rendered and Rust independently
   *   rejects writes. This is defense-in-depth: even if the frontend leaks,
   *   nothing can be persisted. Defaults to `false`.
   * - `historyEligible: false` → tool's IO shape doesn't fit the v1
   *   text-in/text-out contract (file inputs, multi-pane forms, visual
   *   outputs). No drawer rendered. v2 will introduce a per-tool adapter.
   *   Defaults to `true` whenever `sensitiveContent !== true`.
   * - `historyKind` → which generic viewer to use in the detail panel. Has
   *   no effect on capture; only on rendering. Defaults to `'text'`.
   */
  sensitiveContent?: boolean;
  historyEligible?: boolean;
  historyKind?: ToolHistoryKind;
}

export interface ToolDefinition extends ToolMeta {
  component: LazyExoticComponent<ComponentType<unknown>>;
}
