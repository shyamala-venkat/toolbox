import { useCallback, useState, type DragEvent } from 'react';
import { MAX_FILE_SIZE } from '@/lib/constants';

/**
 * Drag-and-drop state machine for file inputs.
 *
 * Returns the handlers that should be spread onto the drop target plus a
 * boolean `isDragging` for visual feedback. Rejected files (oversized, wrong
 * type) are surfaced via the `onReject` callback so the caller can show a
 * toast or inline error.
 */
export interface UseFileDropzoneOptions {
  onDrop: (files: File[]) => void;
  onReject?: (reason: string, file: File) => void;
  maxSize?: number;
  accept?: string[];
}

export interface UseFileDropzoneResult {
  isDragging: boolean;
  handlers: {
    onDragEnter: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
}

const matchesAccept = (file: File, accept: string[] | undefined): boolean => {
  if (!accept || accept.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((pattern) => {
    const p = pattern.trim().toLowerCase();
    if (!p) return false;
    if (p.startsWith('.')) return name.endsWith(p);
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, p.length - 1);
      return type.startsWith(prefix);
    }
    return type === p;
  });
};

export function useFileDropzone(
  options: UseFileDropzoneOptions,
): UseFileDropzoneResult {
  const { onDrop, onReject, maxSize = MAX_FILE_SIZE, accept } = options;
  const [dragDepth, setDragDepth] = useState(0);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => d + 1);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => Math.max(0, d - 1));
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDropHandler = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragDepth(0);

      const incoming = Array.from(e.dataTransfer?.files ?? []);
      const accepted: File[] = [];
      for (const file of incoming) {
        if (file.size > maxSize) {
          onReject?.(`File "${file.name}" exceeds the maximum allowed size.`, file);
          continue;
        }
        if (!matchesAccept(file, accept)) {
          onReject?.(`File "${file.name}" is not an accepted type.`, file);
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length > 0) onDrop(accepted);
    },
    [onDrop, onReject, maxSize, accept],
  );

  return {
    isDragging: dragDepth > 0,
    handlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop: onDropHandler,
    },
  };
}
