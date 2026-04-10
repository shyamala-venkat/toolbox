/**
 * Pure text-statistics functions. All O(n) string scans — no debounce needed.
 */

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingTimeMinutes: number;
  speakingTimeMinutes: number;
}

const WORDS_PER_MIN_READING = 250;
const WORDS_PER_MIN_SPEAKING = 150;

/**
 * Count words by splitting on whitespace boundaries, filtering empties.
 * Handles punctuation-attached words (e.g. "hello," counts as one word).
 */
const countWords = (text: string): number => {
  if (text.trim().length === 0) return 0;
  return text.trim().split(/\s+/).length;
};

/**
 * Count sentences by splitting on sentence-ending punctuation followed by
 * a space, newline, or end-of-string.
 */
const countSentences = (text: string): number => {
  if (text.trim().length === 0) return 0;
  const matches = text.match(/[.!?](?:\s|$)/g);
  return matches ? matches.length : 0;
};

/**
 * Count paragraphs: blocks separated by one or more blank lines.
 */
const countParagraphs = (text: string): number => {
  if (text.trim().length === 0) return 0;
  return text
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0).length;
};

const countLines = (text: string): number => {
  if (text.length === 0) return 0;
  return text.split('\n').length;
};

export const computeStats = (text: string): TextStats => {
  const words = countWords(text);
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    words,
    sentences: countSentences(text),
    paragraphs: countParagraphs(text),
    lines: countLines(text),
    readingTimeMinutes: words / WORDS_PER_MIN_READING,
    speakingTimeMinutes: words / WORDS_PER_MIN_SPEAKING,
  };
};

export const formatTime = (minutes: number): string => {
  if (minutes < 1) {
    const seconds = Math.round(minutes * 60);
    return seconds <= 0 ? '0 sec' : `${seconds} sec`;
  }
  const wholeMinutes = Math.floor(minutes);
  const remainingSeconds = Math.round((minutes - wholeMinutes) * 60);
  if (remainingSeconds === 0) {
    return `${wholeMinutes} min`;
  }
  return `${wholeMinutes} min ${remainingSeconds} sec`;
};
