/**
 * Case conversion helpers.
 *
 * The pipeline is: `input → tokens → format`. `tokenize()` turns arbitrary
 * input — camelCase, snake_case, kebab-case, dot.case, plain prose, or a
 * mix — into a flat lowercase word list. Every formatter then reads that
 * list and assembles the final string.
 */

/**
 * Split a string into lowercase word tokens.
 *
 * We first normalize every non-alphanumeric separator to a single space,
 * then inject spaces between lowercase→uppercase boundaries and between
 * letter→digit boundaries. A final split on whitespace and filter gives
 * the token list.
 */
export function tokenize(input: string): string[] {
  if (input.length === 0) return [];

  const normalized = input
    // Replace any run of underscores, hyphens, dots, slashes, or whitespace
    // with a single space.
    .replace(/[_\-./\\\s]+/g, ' ')
    // Split lower→UPPER boundaries: "fooBar" → "foo Bar".
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // Split UPPER→UpperLower boundaries: "HTMLParser" → "HTML Parser".
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Split letter→digit boundaries in both directions.
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2');

  return normalized
    .split(' ')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

const capitalize = (word: string): string =>
  word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);

const TITLE_CASE_EXCEPTIONS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'if',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'so',
  'the',
  'to',
  'up',
  'yet',
]);

// ─── Formatters ─────────────────────────────────────────────────────────────

export const toCamelCase = (tokens: string[]): string =>
  tokens.length === 0
    ? ''
    : tokens
        .map((t, i) => (i === 0 ? t : capitalize(t)))
        .join('');

export const toPascalCase = (tokens: string[]): string =>
  tokens.map(capitalize).join('');

export const toSnakeCase = (tokens: string[]): string => tokens.join('_');

export const toScreamingSnakeCase = (tokens: string[]): string =>
  tokens.join('_').toUpperCase();

export const toKebabCase = (tokens: string[]): string => tokens.join('-');

export const toScreamingKebabCase = (tokens: string[]): string =>
  tokens.join('-').toUpperCase();

export const toDotCase = (tokens: string[]): string => tokens.join('.');

export const toTitleCase = (tokens: string[]): string =>
  tokens
    .map((t, i) => {
      if (i !== 0 && i !== tokens.length - 1 && TITLE_CASE_EXCEPTIONS.has(t)) return t;
      return capitalize(t);
    })
    .join(' ');

export const toSentenceCase = (tokens: string[]): string => {
  if (tokens.length === 0) return '';
  return tokens.map((t, i) => (i === 0 ? capitalize(t) : t)).join(' ');
};

export const toUpperCase = (tokens: string[]): string => tokens.join(' ').toUpperCase();

export const toLowerCase = (tokens: string[]): string => tokens.join(' ');

/**
 * aLtErNaTiNg: start with lowercase and alternate character-by-character
 * (not word-by-word).
 */
export const toAlternatingCase = (input: string): string => {
  let result = '';
  let i = 0;
  for (const ch of input) {
    if (/[a-zA-Z]/.test(ch)) {
      result += i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase();
      i += 1;
    } else {
      result += ch;
    }
  }
  return result;
};

/**
 * InVeRsE: flip the case of every letter, leave everything else alone.
 */
export const toInverseCase = (input: string): string => {
  let result = '';
  for (const ch of input) {
    if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) {
      result += ch.toUpperCase();
    } else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) {
      result += ch.toLowerCase();
    } else {
      result += ch;
    }
  }
  return result;
};
