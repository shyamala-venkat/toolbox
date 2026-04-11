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
const PdfMerge = lazy(() => import('./pdf-merge/PdfMerge'));
const PdfSplit = lazy(() => import('./pdf-split/PdfSplit'));
const PdfCompress = lazy(() => import('./pdf-compress/PdfCompress'));
const PdfToImage = lazy(() => import('./pdf-to-image/PdfToImage'));
const PdfPages = lazy(() => import('./pdf-pages/PdfPages'));
const ImageResize = lazy(() => import('./image-resize/ImageResize'));
const ImageCompress = lazy(() => import('./image-compress/ImageCompress'));
const ImageConvert = lazy(() => import('./image-convert/ImageConvert'));
const ExifStrip = lazy(() => import('./exif-strip/ExifStrip'));
const ImageBatch = lazy(() => import('./image-batch/ImageBatch'));
const WordCounter = lazy(() => import('./word-counter/WordCounter'));
const TextCleanup = lazy(() => import('./text-cleanup/TextCleanup'));
const UnitConverter = lazy(() => import('./unit-converter/UnitConverter'));
const DateCalculator = lazy(() => import('./date-calculator/DateCalculator'));
const CsvViewer = lazy(() => import('./csv-viewer/CsvViewer'));
const MarkdownPreview = lazy(() => import('./markdown-preview/MarkdownPreview'));
const JsonToTypescript = lazy(() => import('./json-to-typescript/JsonToTypescript'));
const CsvJson = lazy(() => import('./csv-json/CsvJson'));
const BackslashEscape = lazy(() => import('./backslash-escape/BackslashEscape'));
const HtmlPreview = lazy(() => import('./html-preview/HtmlPreview'));
const CronParser = lazy(() => import('./cron-parser/CronParser'));
const UnixPermissions = lazy(() => import('./unix-permissions/UnixPermissions'));
const JsonPathEval = lazy(() => import('./jsonpath-eval/JsonPathEval'));
const EpochBatch = lazy(() => import('./epoch-batch/EpochBatch'));
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
  // --- PDF Tools ---
  {
    id: 'pdf-merge',
    name: 'PDF Merge',
    description: 'Combine multiple PDFs into a single document',
    longDescription:
      'Drag-and-drop or select multiple PDF files, reorder them as needed, ' +
      'and merge into one PDF. Runs entirely in your browser — nothing leaves your machine.',
    category: 'pdf-tools',
    tags: ['pdf', 'merge', 'combine', 'join', 'concatenate'],
    icon: 'file-plus-2',
    tier: 'free',
    requiresBackend: false,
    component: PdfMerge,
  },
  {
    id: 'pdf-split',
    name: 'PDF Split',
    description: 'Split a PDF into multiple files by page range',
    longDescription:
      'Upload a PDF, choose page ranges or split every N pages, and download ' +
      'the result. Multiple outputs are bundled into a ZIP. Runs entirely in your browser.',
    category: 'pdf-tools',
    tags: ['pdf', 'split', 'extract', 'pages', 'range', 'separate'],
    icon: 'scissors',
    tier: 'pro',
    requiresBackend: false,
    component: PdfSplit,
  },
  {
    id: 'pdf-compress',
    name: 'PDF Compress',
    description: 'Optimize PDF file size with object stream compression',
    longDescription:
      'Upload a PDF and re-encode it with object streams enabled. Typically reduces file ' +
      'size by 10-30%. For maximum compression, use a dedicated PDF compressor. ' +
      'Runs entirely in your browser — nothing leaves your machine.',
    category: 'pdf-tools',
    tags: ['pdf', 'compress', 'optimize', 'reduce', 'size', 'shrink'],
    icon: 'file-minus-2',
    tier: 'pro',
    requiresBackend: false,
    component: PdfCompress,
  },
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    description: 'Convert PDF pages to PNG or JPG images',
    longDescription:
      'Upload a PDF, choose the output format (PNG or JPG), scale, and page range, ' +
      'then preview and download images. Multiple pages are bundled into a ZIP. ' +
      'Runs entirely in your browser — nothing leaves your machine.',
    category: 'pdf-tools',
    tags: ['pdf', 'image', 'png', 'jpg', 'convert', 'export', 'screenshot'],
    icon: 'image',
    tier: 'pro',
    requiresBackend: false,
    component: PdfToImage,
  },
  {
    id: 'pdf-pages',
    name: 'PDF Page Manager',
    description: 'Rotate, delete, and reorder PDF pages visually',
    longDescription:
      'Upload a PDF and see page thumbnails. Select pages to rotate, delete, or drag to ' +
      'reorder, then save the modified PDF. Runs entirely in your browser — nothing leaves your machine.',
    category: 'pdf-tools',
    tags: ['pdf', 'pages', 'rotate', 'delete', 'reorder', 'rearrange', 'manage'],
    icon: 'layout-grid',
    tier: 'pro',
    requiresBackend: false,
    component: PdfPages,
  },
  // --- Image Tools ---
  {
    id: 'image-resize',
    name: 'Image Resize',
    description: 'Resize images by dimensions or percentage with aspect ratio lock',
    longDescription:
      'Resize any image to custom dimensions or a preset percentage. Maintains aspect ratio ' +
      'by default and supports PNG, JPEG, WebP, BMP, GIF, TIFF, and ICO. All processing ' +
      'happens locally via the Rust backend — nothing leaves your machine.',
    category: 'image-tools',
    tags: ['image', 'resize', 'dimensions', 'scale', 'width', 'height', 'aspect-ratio'],
    icon: 'minimize-2',
    tier: 'free',
    requiresBackend: true,
    component: ImageResize,
  },
  {
    id: 'image-compress',
    name: 'Image Compress',
    description: 'Compress images to reduce file size with adjustable quality',
    longDescription:
      'Reduce image file size with a quality slider for JPEG and WebP. PNG files are ' +
      're-saved losslessly. Shows before/after size comparison with savings percentage. ' +
      'All processing runs locally via the Rust backend.',
    category: 'image-tools',
    tags: ['image', 'compress', 'optimize', 'quality', 'reduce', 'file-size'],
    icon: 'file-down',
    tier: 'free',
    requiresBackend: true,
    component: ImageCompress,
  },
  {
    id: 'image-convert',
    name: 'Image Format Convert',
    description: 'Convert images between PNG, JPEG, WebP, BMP, GIF, TIFF, and ICO',
    longDescription:
      'Convert images between all major formats with optional quality control for ' +
      'lossy formats. Supports PNG, JPEG, WebP, BMP, GIF, TIFF, and ICO. ' +
      'HEIC/AVIF support is planned for a future update. All processing runs locally.',
    category: 'image-tools',
    tags: ['image', 'convert', 'format', 'png', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'],
    icon: 'repeat',
    tier: 'free',
    requiresBackend: true,
    component: ImageConvert,
  },
  {
    id: 'exif-strip',
    name: 'EXIF Metadata Strip',
    description: 'View and strip EXIF metadata from images for privacy',
    longDescription:
      'Read EXIF metadata from images, highlighting sensitive fields like GPS ' +
      'coordinates and timestamps. Strip all metadata with a single click for privacy. ' +
      'Shows before/after size comparison. All processing runs locally.',
    category: 'image-tools',
    tags: ['exif', 'metadata', 'strip', 'privacy', 'gps', 'location', 'image'],
    icon: 'scan',
    tier: 'pro',
    requiresBackend: true,
    component: ExifStrip,
  },
  {
    id: 'image-batch',
    name: 'Image Batch Processor',
    description: 'Apply resize, compress, convert, or strip EXIF to multiple images at once',
    longDescription:
      'Process multiple images in bulk with a single operation. Choose from resize, compress, ' +
      'convert format, or strip EXIF metadata. Per-file progress tracking with error resilience ' +
      '— failed files are skipped and reported at the end. All processing runs locally.',
    category: 'image-tools',
    tags: ['image', 'batch', 'bulk', 'resize', 'compress', 'convert', 'exif', 'multiple'],
    icon: 'images',
    tier: 'pro',
    requiresBackend: true,
    component: ImageBatch,
  },
  // --- Writing & Text ---
  {
    id: 'word-counter',
    name: 'Word & Character Counter',
    description: 'Count words, characters, sentences, paragraphs, and estimate reading time',
    longDescription:
      'Paste or type any text to get real-time statistics: words, characters (with and without spaces), ' +
      'sentences, paragraphs, lines, estimated reading time, and speaking time. Everything runs locally.',
    category: 'text',
    tags: ['word', 'count', 'character', 'sentence', 'paragraph', 'reading time', 'speaking time'],
    icon: 'pilcrow',
    tier: 'free',
    requiresBackend: false,
    component: WordCounter,
  },
  {
    id: 'text-cleanup',
    name: 'Text Cleanup',
    description: 'Trim whitespace, remove empty lines, strip HTML tags, and more',
    longDescription:
      'Clean up messy text pasted from emails, PDFs, or web pages. Toggle operations like trimming, ' +
      'deduplication, sorting, HTML stripping, and extra-space removal. All processing runs locally.',
    category: 'text',
    tags: ['cleanup', 'trim', 'whitespace', 'duplicate', 'sort', 'html', 'strip'],
    icon: 'eraser',
    tier: 'free',
    requiresBackend: false,
    component: TextCleanup,
  },
  // --- Calculators ---
  {
    id: 'unit-converter',
    name: 'Unit Converter',
    description: 'Convert between length, weight, temperature, volume, speed, and more',
    longDescription:
      'Convert units across 10 categories: length, weight, temperature, volume, speed, data size, ' +
      'area, time, pressure, and energy. Live conversion as you type with formula display.',
    category: 'calculators',
    tags: ['unit', 'convert', 'length', 'weight', 'temperature', 'volume', 'speed', 'metric', 'imperial'],
    icon: 'ruler',
    tier: 'free',
    requiresBackend: false,
    component: UnitConverter,
  },
  {
    id: 'date-calculator',
    name: 'Date Calculator',
    description: 'Calculate differences between dates or add/subtract days, weeks, months, and years',
    longDescription:
      'Two modes: find the difference between two dates (including business days), or add/subtract a ' +
      'duration from a date. Shows day of week, ISO week number, and detailed breakdowns.',
    category: 'calculators',
    tags: ['date', 'difference', 'add', 'subtract', 'business days', 'weekday', 'duration'],
    icon: 'calendar',
    tier: 'free',
    requiresBackend: false,
    component: DateCalculator,
  },
  // --- File Tools ---
  {
    id: 'csv-viewer',
    name: 'CSV Viewer & Editor',
    description: 'View, sort, filter, edit, and export CSV files',
    longDescription:
      'Drop a CSV file or paste CSV text to view it as a sortable, filterable table. Edit cells in-place ' +
      'and export the result. Uses PapaParse for robust parsing with delimiter auto-detection.',
    category: 'file-tools',
    tags: ['csv', 'spreadsheet', 'table', 'editor', 'sort', 'filter', 'export'],
    icon: 'file-spreadsheet',
    tier: 'pro',
    requiresBackend: false,
    component: CsvViewer,
  },
  // --- Issue 2: Agent I ---
  {
    id: 'markdown-preview',
    name: 'Markdown Preview',
    description: 'Write Markdown and see a live rendered preview',
    longDescription:
      'Paste or type Markdown and see a live, sanitized HTML preview. Supports GitHub Flavored ' +
      'Markdown — tables, task lists, strikethrough, fenced code blocks, and more. ' +
      'Runs entirely in your browser.',
    category: 'text',
    tags: ['markdown', 'preview', 'render', 'html', 'gfm', 'github'],
    icon: 'file-text',
    tier: 'pro',
    requiresBackend: false,
    component: MarkdownPreview,
  },
  {
    id: 'json-to-typescript',
    name: 'JSON to TypeScript',
    description: 'Generate TypeScript interfaces from JSON data',
    longDescription:
      'Paste a JSON payload and instantly get TypeScript interface or type definitions. ' +
      'Handles nested objects, arrays, mixed-type arrays, and null values. ' +
      'Customizable root name and interface/type output. Runs entirely in your browser.',
    category: 'converters',
    tags: ['json', 'typescript', 'interface', 'type', 'generate', 'convert', 'ts'],
    icon: 'file-code',
    tier: 'pro',
    requiresBackend: false,
    component: JsonToTypescript,
  },
  {
    id: 'csv-json',
    name: 'CSV ↔ JSON',
    description: 'Convert between CSV and JSON formats',
    longDescription:
      'Convert CSV to JSON arrays of objects or JSON arrays back to CSV. Auto-detects ' +
      'input direction, configurable headers, and pretty-print. Uses PapaParse for ' +
      'robust parsing. Runs entirely in your browser.',
    category: 'file-tools',
    tags: ['csv', 'json', 'convert', 'parse', 'table', 'data'],
    icon: 'file-spreadsheet',
    tier: 'pro',
    requiresBackend: false,
    component: CsvJson,
  },
  {
    id: 'backslash-escape',
    name: 'Backslash Escape/Unescape',
    description: 'Escape and unescape special characters for different contexts',
    longDescription:
      'Escape or unescape special characters for JSON strings, regular expressions, ' +
      'HTML, URLs, or general use. Auto-processes as you type with context-aware ' +
      'character handling. Runs entirely in your browser.',
    category: 'encoders-decoders',
    tags: ['escape', 'unescape', 'backslash', 'special', 'characters', 'json', 'regex', 'html', 'url'],
    icon: 'shield',
    tier: 'free',
    requiresBackend: false,
    component: BackslashEscape,
  },
  {
    id: 'html-preview',
    name: 'HTML Preview',
    description: 'Write HTML and see a live rendered preview',
    longDescription:
      'Paste or type HTML and see a live, sanitized preview. Optionally view the ' +
      'source code alongside the rendered output. All HTML is sanitized through ' +
      'DOMPurify before rendering. Runs entirely in your browser.',
    category: 'text',
    tags: ['html', 'preview', 'render', 'live', 'sandbox'],
    icon: 'eye',
    tier: 'pro',
    requiresBackend: false,
    component: HtmlPreview,
  },
  // --- Issue 2: Agent J ---
  {
    id: 'cron-parser',
    name: 'Cron Expression Parser',
    description: 'Parse cron expressions into human-readable schedules with next run times',
    longDescription:
      'Enter a standard 5-field or 6-field (with seconds) cron expression and see its ' +
      'human-readable description plus the next 10 scheduled execution times. ' +
      'Includes common presets for quick start. Runs entirely in your browser.',
    category: 'calculators',
    tags: ['cron', 'schedule', 'crontab', 'timer', 'job', 'recurring'],
    icon: 'timer',
    tier: 'free',
    requiresBackend: false,
    component: CronParser,
  },
  {
    id: 'unix-permissions',
    name: 'Unix Permissions Calculator',
    description: 'Convert between octal, symbolic, and checkbox representations of file permissions',
    longDescription:
      'Edit Unix file permissions via octal input (e.g. 755), a checkbox grid, or ' +
      'symbolic display (rwxr-xr-x). All representations stay in sync as you edit. ' +
      'Shows the corresponding chmod command.',
    category: 'calculators',
    tags: ['unix', 'permissions', 'chmod', 'octal', 'rwx', 'linux', 'file'],
    icon: 'lock',
    tier: 'free',
    requiresBackend: false,
    component: UnixPermissions,
  },
  {
    id: 'jsonpath-eval',
    name: 'JSON Path Evaluator',
    description: 'Evaluate JSONPath expressions against JSON data with live results',
    longDescription:
      'Paste JSON data and a JSONPath expression to instantly see matched results. ' +
      'Supports the full JSONPath spec including filters, wildcards, and recursive descent. ' +
      'Includes a library of common expressions. Runs entirely in your browser.',
    category: 'converters',
    tags: ['json', 'jsonpath', 'query', 'filter', 'evaluate', 'path', 'data'],
    icon: 'search',
    tier: 'pro',
    requiresBackend: false,
    component: JsonPathEval,
  },
  {
    id: 'epoch-batch',
    name: 'Epoch Batch Converter',
    description: 'Convert multiple Unix timestamps to human-readable dates at once',
    longDescription:
      'Paste multiple Unix timestamps (one per line) and see each converted to ISO 8601, ' +
      'local time, and relative time. Auto-detects seconds (10 digits) vs milliseconds ' +
      '(13 digits) per line. Copy all results as CSV or formatted text.',
    category: 'converters',
    tags: ['epoch', 'timestamp', 'batch', 'unix', 'convert', 'bulk', 'date'],
    icon: 'list',
    tier: 'pro',
    requiresBackend: false,
    component: EpochBatch,
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
