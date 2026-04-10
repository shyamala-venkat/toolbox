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
  | 'calculators';

export interface ClipboardDetection {
  patterns: RegExp[];
  priority: number;
}

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
}

export interface ToolDefinition extends ToolMeta {
  component: LazyExoticComponent<ComponentType<unknown>>;
}
