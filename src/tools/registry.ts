import { lazy } from 'react';
import type { ToolDefinition } from './types';

// === TOOL_IMPORTS_START ===
const JsonFormatter = lazy(() => import('./json-formatter/JsonFormatter'));
const Base64Tool = lazy(() => import('./base64/Base64Tool'));
const UuidGenerator = lazy(() => import('./uuid-generator/UuidGenerator'));
const HashGenerator = lazy(() => import('./hash-generator/HashGenerator'));
const TimestampConverter = lazy(() => import('./timestamp-converter/TimestampConverter'));
const UrlEncoder = lazy(() => import('./url-encoder/UrlEncoder'));
const JwtDecoder = lazy(() => import('./jwt-decoder/JwtDecoder'));
const HtmlEncoder = lazy(() => import('./html-encoder/HtmlEncoder'));
const GzipTool = lazy(() => import('./gzip-tool/GzipTool'));
const NumberBase = lazy(() => import('./number-base/NumberBase'));
const SqlFormatter = lazy(() => import('./sql-formatter/SqlFormatter'));
const XmlFormatter = lazy(() => import('./xml-formatter/XmlFormatter'));
const YamlJson = lazy(() => import('./yaml-json/YamlJson'));
const ColorConverter = lazy(() => import('./color-converter/ColorConverter'));
const TextCase = lazy(() => import('./text-case/TextCase'));
const LoremIpsum = lazy(() => import('./lorem-ipsum/LoremIpsum'));
const PasswordGen = lazy(() => import('./password-gen/PasswordGen'));
const QrCode = lazy(() => import('./qr-code/QrCode'));
const TextDiff = lazy(() => import('./text-diff/TextDiff'));
const RegexTester = lazy(() => import('./regex-tester/RegexTester'));
// === TOOL_IMPORTS_END ===

export const toolRegistry: ToolDefinition[] = [
  // === TOOL_REGISTRATIONS_START ===
  {
    id: 'json-formatter',
    name: 'JSON Formatter',
    description: 'Format, validate, and minify JSON with syntax highlighting',
    longDescription:
      'Pretty-print or minify JSON, validate with precise error locations, ' +
      'and optionally sort keys. Runs entirely in your browser — nothing leaves your machine.',
    category: 'formatters',
    tags: ['json', 'format', 'beautify', 'minify', 'validate', 'pretty-print'],
    icon: 'braces',
    tier: 'free',
    requiresBackend: false,
    clipboardDetection: {
      patterns: [/^\s*[[{]/],
      priority: 10,
    },
    component: JsonFormatter,
  },
  {
    id: 'base64',
    name: 'Base64 Encoder/Decoder',
    description: 'Encode and decode Base64 strings and files',
    longDescription:
      'Convert between text and Base64 with full UTF-8 support. Handles files ' +
      'up to 10 MB and supports the URL-safe alphabet.',
    category: 'encoders-decoders',
    tags: ['base64', 'encode', 'decode', 'binary'],
    icon: 'binary',
    tier: 'free',
    requiresBackend: false,
    component: Base64Tool,
  },
  {
    id: 'uuid-generator',
    name: 'UUID Generator',
    description: 'Generate UUIDs in v1, v4, and v7 formats',
    longDescription:
      'Generate cryptographically random or time-ordered UUIDs in v1, v4, ' +
      'and v7 formats. Up to 100 at a time, with hyphen and case options.',
    category: 'generators',
    tags: ['uuid', 'guid', 'identifier', 'random', 'v1', 'v4', 'v7'],
    icon: 'fingerprint',
    tier: 'free',
    requiresBackend: false,
    component: UuidGenerator,
  },
  {
    id: 'hash-generator',
    name: 'Hash Generator',
    description: 'Generate MD5, SHA-1, SHA-256, SHA-512, and CRC32 hashes from text or files',
    longDescription:
      'Compute cryptographic and non-cryptographic digests for arbitrary text or local files. ' +
      'File hashing is streamed in 64 KiB chunks on the Rust side, so files up to 100 MB process ' +
      'without loading the whole payload into memory.',
    category: 'crypto',
    tags: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'crc32', 'checksum', 'digest'],
    icon: 'hash',
    tier: 'free',
    requiresBackend: true,
    component: HashGenerator,
  },
  {
    id: 'timestamp-converter',
    name: 'Timestamp Converter',
    description: 'Convert between Unix timestamps, ISO 8601, and human-readable dates',
    longDescription:
      'Auto-detects Unix seconds, Unix milliseconds, ISO 8601, and natural language dates. ' +
      'Shows every common representation side-by-side and supports any IANA timezone.',
    category: 'converters',
    tags: ['timestamp', 'unix', 'epoch', 'date', 'time', 'iso8601', 'convert'],
    icon: 'clock',
    tier: 'free',
    requiresBackend: false,
    clipboardDetection: {
      patterns: [/^\s*\d{10}(\d{3})?\s*$/],
      priority: 8,
    },
    component: TimestampConverter,
  },
  {
    id: 'url-encoder',
    name: 'URL Encoder/Decoder',
    description: 'Encode and decode URLs and URL components',
    longDescription:
      'Percent-encode or decode URLs and URL components. Switch between ' +
      '`encodeURIComponent` for query parameters and `encodeURI` for whole ' +
      'URLs. Runs entirely in your browser.',
    category: 'encoders-decoders',
    tags: ['url', 'encode', 'decode', 'percent', 'uri', 'query'],
    icon: 'link-2',
    tier: 'free',
    requiresBackend: false,
    component: UrlEncoder,
  },
  {
    id: 'jwt-decoder',
    name: 'JWT Decoder',
    description: 'Decode and inspect JWT tokens (header, payload, expiry)',
    longDescription:
      'Decode JSON Web Tokens and inspect the header, payload, and signature. ' +
      'Recognises standard claims (exp, iat, nbf, iss, aud, sub) and shows ' +
      'validity windows in human time. Signature verification requires a secret ' +
      'and is intentionally not performed locally.',
    category: 'encoders-decoders',
    tags: ['jwt', 'token', 'decode', 'json', 'auth', 'jose'],
    icon: 'key-round',
    tier: 'free',
    requiresBackend: false,
    clipboardDetection: {
      patterns: [/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/],
      priority: 9,
    },
    component: JwtDecoder,
  },
  {
    id: 'html-encoder',
    name: 'HTML Encoder/Decoder',
    description: 'Encode HTML entities and decode entity references',
    longDescription:
      'Escape HTML-unsafe characters (&, <, >, ", \') as named entities and ' +
      'decode named or numeric entity references back to text. Optionally ' +
      'encode every non-ASCII character as a numeric reference.',
    category: 'encoders-decoders',
    tags: ['html', 'entities', 'encode', 'decode', 'escape'],
    icon: 'code',
    tier: 'pro',
    requiresBackend: false,
    component: HtmlEncoder,
  },
  {
    id: 'gzip-tool',
    name: 'GZip Compress/Decompress',
    description: 'Compress and decompress text using gzip',
    longDescription:
      'Compress text to a base64-encoded gzip payload or decompress a base64 ' +
      'payload back to text. Uses the browser-native `CompressionStream` API — ' +
      'nothing leaves your machine.',
    category: 'encoders-decoders',
    tags: ['gzip', 'compress', 'decompress', 'archive', 'deflate'],
    icon: 'archive',
    tier: 'pro',
    requiresBackend: false,
    component: GzipTool,
  },
  {
    id: 'number-base',
    name: 'Number Base Converter',
    description: 'Convert numbers between binary, octal, decimal, and hex',
    longDescription:
      'Convert integers between binary, octal, decimal, and hexadecimal. ' +
      'Uses BigInt internally so arbitrarily large values stay exact. ' +
      'Signed input is supported in decimal.',
    category: 'converters',
    tags: ['binary', 'octal', 'decimal', 'hex', 'hexadecimal', 'base', 'radix', 'bigint'],
    icon: 'binary',
    tier: 'pro',
    requiresBackend: false,
    component: NumberBase,
  },
  {
    id: 'sql-formatter',
    name: 'SQL Formatter',
    description: 'Format SQL queries with dialect support',
    longDescription:
      'Pretty-print SQL queries with dialect-aware keyword handling. Supports ' +
      'MySQL, PostgreSQL, SQLite, T-SQL, BigQuery, Snowflake, and MariaDB. Runs ' +
      'entirely in your browser — nothing leaves your machine.',
    category: 'formatters',
    tags: ['sql', 'format', 'beautify', 'mysql', 'postgresql', 'sqlite', 'database'],
    icon: 'database',
    tier: 'pro',
    requiresBackend: false,
    component: SqlFormatter,
  },
  {
    id: 'xml-formatter',
    name: 'XML Formatter',
    description: 'Format, minify, and validate XML',
    longDescription:
      'Pretty-print or minify XML documents with validation. Uses the browser ' +
      'DOMParser so nothing leaves your machine, and renders output into a ' +
      'plain text area (never injected into the live DOM).',
    category: 'formatters',
    tags: ['xml', 'format', 'beautify', 'minify', 'validate'],
    icon: 'code-xml',
    tier: 'pro',
    requiresBackend: false,
    component: XmlFormatter,
  },
  {
    id: 'yaml-json',
    name: 'YAML ↔ JSON',
    description: 'Convert between YAML and JSON formats',
    longDescription:
      'Convert between YAML and JSON with auto-detected direction. Uses the ' +
      "safe JSON schema so YAML's merge-key syntax can't smuggle prototype " +
      'pollution into your objects.',
    category: 'converters',
    tags: ['yaml', 'json', 'convert', 'parse', 'serialize'],
    icon: 'file-cog',
    tier: 'pro',
    requiresBackend: false,
    component: YamlJson,
  },
  {
    id: 'color-converter',
    name: 'Color Converter',
    description: 'Convert between HEX, RGB, HSL, HSB color formats',
    longDescription:
      'Convert colors between HEX, RGB, HSL, HSB/HSV, and CMYK with a live ' +
      'preview and WCAG contrast ratio checks against both white and black.',
    category: 'converters',
    tags: ['color', 'hex', 'rgb', 'hsl', 'hsb', 'hsv', 'palette', 'design', 'contrast', 'wcag'],
    icon: 'palette',
    tier: 'free',
    requiresBackend: false,
    component: ColorConverter,
  },
  {
    id: 'text-case',
    name: 'Text Case Converter',
    description: 'Convert between camelCase, snake_case, kebab-case, and more',
    longDescription:
      'Convert any identifier or sentence between 13 common cases at once. ' +
      'Handles existing camelCase, snake_case, kebab-case, dot.case, and plain ' +
      'prose as input.',
    category: 'text',
    tags: ['case', 'camel', 'snake', 'kebab', 'pascal', 'upper', 'lower', 'title', 'sentence'],
    icon: 'case-sensitive',
    tier: 'free',
    requiresBackend: false,
    component: TextCase,
  },
  {
    id: 'lorem-ipsum',
    name: 'Lorem Ipsum Generator',
    description: 'Generate placeholder text',
    longDescription:
      'Generate lorem ipsum placeholder text by paragraphs, sentences, words, or byte count. ' +
      'Everything runs locally with a fixed Latin word dictionary — no network, no external library.',
    category: 'generators',
    tags: ['lorem', 'ipsum', 'placeholder', 'dummy', 'text', 'fill'],
    icon: 'align-left',
    tier: 'free',
    requiresBackend: false,
    component: LoremIpsum,
  },
  {
    id: 'password-gen',
    name: 'Password Generator',
    description: 'Generate strong, customizable passwords',
    longDescription:
      'Generate cryptographically strong passwords with configurable length, character sets, ' +
      'and ambiguous-character filtering. Bulk-generate up to 50 at once with an entropy-based ' +
      'strength meter. Passwords are ephemeral — nothing is ever written to disk or logs.',
    category: 'generators',
    tags: ['password', 'generate', 'random', 'secure', 'strength'],
    icon: 'key',
    tier: 'pro',
    requiresBackend: false,
    component: PasswordGen,
  },
  {
    id: 'qr-code',
    name: 'QR Code Generator',
    description: 'Generate QR codes from text or URLs',
    longDescription:
      'Generate QR codes from arbitrary text or URLs with configurable error correction, size, ' +
      'and margin. Download as PNG or SVG. Generation runs entirely locally — your content never ' +
      'leaves your machine.',
    category: 'generators',
    tags: ['qr', 'qrcode', 'barcode', 'url', 'link', 'image', 'png', 'svg'],
    icon: 'qr-code',
    tier: 'pro',
    requiresBackend: false,
    component: QrCode,
  },
  {
    id: 'text-diff',
    name: 'Text Diff',
    description: 'Compare two text snippets side by side or unified',
    longDescription:
      'Visual diff between two text snippets with line, word, or character granularity. ' +
      'Side-by-side and unified views, optional whitespace-insensitive comparison. ' +
      'Runs entirely in your browser.',
    category: 'text',
    tags: ['diff', 'compare', 'merge', 'difference', 'changes'],
    icon: 'diff',
    tier: 'pro',
    requiresBackend: false,
    component: TextDiff,
  },
  {
    id: 'regex-tester',
    name: 'Regex Tester',
    description: 'Test regular expressions with real-time match highlighting',
    longDescription:
      'Test JavaScript regular expressions against sample input with live match highlighting. ' +
      'Supports match, replace, and split modes, all six flag toggles, named capture groups, ' +
      'and a library of common patterns. Execution runs in a sandboxed Web Worker with a ' +
      '5-second timeout to protect against catastrophic backtracking.',
    category: 'text',
    tags: ['regex', 'regexp', 'pattern', 'match', 'test', 'replace'],
    icon: 'regex',
    tier: 'pro',
    requiresBackend: false,
    component: RegexTester,
  },
  // === TOOL_REGISTRATIONS_END ===
];

export const getToolById = (id: string): ToolDefinition | undefined =>
  toolRegistry.find(t => t.id === id);

export const getToolsByCategory = (category: string): ToolDefinition[] =>
  toolRegistry.filter(t => t.category === category);

export const searchTools = (query: string): ToolDefinition[] => {
  const q = query.toLowerCase().trim();
  if (!q) return toolRegistry;
  return toolRegistry.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.tags.some(tag => tag.toLowerCase().includes(q))
  );
};
