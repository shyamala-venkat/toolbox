/**
 * Pure text-cleanup operations. Each operation is a single-pass transform.
 */

export interface CleanupOptions {
  trimWhitespace: boolean;
  removeEmptyLines: boolean;
  removeDuplicateLines: boolean;
  sortLines: 'none' | 'asc' | 'desc';
  removeExtraSpaces: boolean;
  stripHtmlTags: boolean;
  normalizeLineEndings: boolean;
}

export const DEFAULT_OPTIONS: CleanupOptions = {
  trimWhitespace: true,
  removeEmptyLines: false,
  removeDuplicateLines: false,
  sortLines: 'none',
  removeExtraSpaces: false,
  stripHtmlTags: false,
  normalizeLineEndings: true,
};

export interface CleanupStats {
  linesRemoved: number;
  charactersTrimmed: number;
  duplicatesRemoved: number;
}

export interface CleanupResult {
  output: string;
  stats: CleanupStats;
}

export const cleanupText = (input: string, options: CleanupOptions): CleanupResult => {
  if (input.length === 0) {
    return { output: '', stats: { linesRemoved: 0, charactersTrimmed: 0, duplicatesRemoved: 0 } };
  }

  let text = input;
  const originalLength = text.length;
  let duplicatesRemoved = 0;

  // Normalize line endings first (always safe to do first)
  if (options.normalizeLineEndings) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  // Strip HTML tags
  if (options.stripHtmlTags) {
    text = text.replace(/<[^>]+>/g, '');
  }

  // Work with lines for per-line operations
  let lines = text.split('\n');
  const originalLineCount = lines.length;

  // Trim whitespace per line
  if (options.trimWhitespace) {
    lines = lines.map((line) => line.trim());
  }

  // Remove extra spaces (collapse multiple spaces to one)
  if (options.removeExtraSpaces) {
    lines = lines.map((line) => line.replace(/ {2,}/g, ' '));
  }

  // Remove empty lines
  if (options.removeEmptyLines) {
    lines = lines.filter((line) => line.trim().length > 0);
  }

  // Remove duplicate lines
  if (options.removeDuplicateLines) {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line);
        deduped.push(line);
      } else {
        duplicatesRemoved += 1;
      }
    }
    lines = deduped;
  }

  // Sort lines
  if (options.sortLines === 'asc') {
    lines.sort((a, b) => a.localeCompare(b));
  } else if (options.sortLines === 'desc') {
    lines.sort((a, b) => b.localeCompare(a));
  }

  const output = lines.join('\n');
  const linesRemoved = originalLineCount - lines.length;
  const charactersTrimmed = originalLength - output.length;

  return {
    output,
    stats: { linesRemoved, charactersTrimmed, duplicatesRemoved },
  };
};

/**
 * Validate persisted options against expected shape.
 */
export const sanitizeCleanupOptions = (raw: unknown): CleanupOptions => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_OPTIONS };
  const obj = raw as Record<string, unknown>;
  return {
    trimWhitespace:
      typeof obj.trimWhitespace === 'boolean' ? obj.trimWhitespace : DEFAULT_OPTIONS.trimWhitespace,
    removeEmptyLines:
      typeof obj.removeEmptyLines === 'boolean' ? obj.removeEmptyLines : DEFAULT_OPTIONS.removeEmptyLines,
    removeDuplicateLines:
      typeof obj.removeDuplicateLines === 'boolean'
        ? obj.removeDuplicateLines
        : DEFAULT_OPTIONS.removeDuplicateLines,
    sortLines:
      obj.sortLines === 'none' || obj.sortLines === 'asc' || obj.sortLines === 'desc'
        ? obj.sortLines
        : DEFAULT_OPTIONS.sortLines,
    removeExtraSpaces:
      typeof obj.removeExtraSpaces === 'boolean'
        ? obj.removeExtraSpaces
        : DEFAULT_OPTIONS.removeExtraSpaces,
    stripHtmlTags:
      typeof obj.stripHtmlTags === 'boolean' ? obj.stripHtmlTags : DEFAULT_OPTIONS.stripHtmlTags,
    normalizeLineEndings:
      typeof obj.normalizeLineEndings === 'boolean'
        ? obj.normalizeLineEndings
        : DEFAULT_OPTIONS.normalizeLineEndings,
  };
};
