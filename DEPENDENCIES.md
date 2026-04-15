# Dependencies

Tool-to-dependency mapping for ToolBox. Updated when tools or dependencies change.

## Frontend (npm)

### Tool-specific libraries

| Tool | Package | Version | What we use | Notes |
|---|---|---|---|---|
| SQL Formatter | `sql-formatter` | 15.4.6 | `format(sql, { language, tabWidth, keywordCase })` | Largest tool chunk (239 KB). Supports 8 SQL dialects. |
| YAML ↔ JSON | `js-yaml` | 4.1.1 | `load()`, `loadAll()`, `dump()` with `JSON_SCHEMA` | **Must use `JSON_SCHEMA`** on both load and dump to prevent prototype pollution via `<<` merge keys (CVE patched in 4.1.1). |
| QR Code Generator | `qrcode` | 1.5.4 | `QRCode.toDataURL()`, `QRCode.toString({ type: 'svg' })` | PNG via data URL, SVG via string. |
| Text Diff | `diff` | 8.0.4 | `diffLines()`, `diffWords()`, `diffWordsWithSpace()`, `diffChars()` | v8 breaking change: `diffWords` no longer accepts `{ ignoreWhitespace }` — use `diffWordsWithSpace` instead. CVE patched in 8.0.4. |
| PDF Merge/Split/Compress/Pages/Watermark | `pdf-lib` | 1.17.1 | `PDFDocument.load()`, `.create()`, `.copyPages()`, `.embedFont()`, `.save()` | Pure JS PDF manipulation. Used by 5 PDF tools. |
| PDF to Image, PDF Pages (thumbnails) | `pdfjs-dist` | 4.9.155 | `getDocument()`, `page.render()` | PDF rendering to canvas. **Must `.slice(0)` the ArrayBuffer before each `getDocument()` call** — pdfjs transfers the buffer to its web worker, detaching the original. |
| ZIP Tool, Favicon Generator | `fflate` | 0.8.2 | `zipSync()`, `unzipSync()` | Fast, lightweight ZIP compression/decompression. Also used for multi-file downloads. |
| Markdown Preview, Markdown to PDF | `marked` | 15.0.7 | `marked.parse()` | GitHub Flavored Markdown rendering. Always sanitize output with DOMPurify before rendering. |
| Markdown Preview, Markdown to PDF, HTML Preview | `dompurify` | 3.3.3 | `DOMPurify.sanitize()` | HTML sanitization. **Required** before any `dangerouslySetInnerHTML` usage. |
| CSV Viewer, CSV ↔ JSON | `papaparse` | 5.5.2 | `Papa.parse()`, `Papa.unparse()` | CSV parsing with delimiter auto-detection. |
| Barcode Generator | `jsbarcode` | 3.11.6 | `JsBarcode(svgElement, value, { format })` | Code128, UPC-A, EAN-13, EAN-8, Code39, ITF-14. |
| JSONPath Evaluator | `jsonpath-plus` | 10.3.0 | `JSONPath({ path, json })` | Full JSONPath spec with filters, wildcards, recursive descent. |
| Cron Parser | `cronstrue` | 2.52.0 | `cronstrue.toString(expression)` | Cron expression → human-readable description. |

### Framework and infrastructure

| Package | Version | Purpose |
|---|---|---|
| `react` | 19.0.0 | UI framework |
| `react-dom` | 19.0.0 | DOM renderer |
| `react-router-dom` | 7.14.0 | Client-side routing |
| `zustand` | 5.0.2 | State management (3 stores: app, tool, settings) |
| `lucide-react` | 0.468.0 | Icon library (~60 icons registered in `src/lib/icons.ts`) |
| `@tauri-apps/api` | 2.1.1 | Tauri frontend API |
| `@tauri-apps/plugin-clipboard-manager` | 2.2.6 | Clipboard read/write |
| `@tauri-apps/plugin-dialog` | 2.2.0 | Open/save file dialogs |
| `@tauri-apps/plugin-fs` | 2.2.0 | Filesystem (scoped to app data dir) |
| `@tauri-apps/plugin-os` | 2.2.0 | Platform/arch detection |
| `@tauri-apps/plugin-global-shortcut` | 2.3.1 | Global keyboard shortcut (Cmd+Shift+T) |
| `@tauri-apps/plugin-process` | 2.3.1 | Process management for system tray |
| `@tauri-apps/plugin-updater` | 2.10.1 | Auto-updater infrastructure |

### Dev dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | 5.7.2 | Type checking (strict mode, `noUncheckedIndexedAccess`) |
| `vite` | 6.4.2 | Bundler + dev server |
| `tailwindcss` | 4.1.11 | Utility CSS (v4, CSS-first config) |
| `@tailwindcss/vite` | 4.1.11 | Tailwind Vite plugin |
| `@types/diff` | 6.0.0 | Types for `diff` |
| `@types/js-yaml` | 4.0.9 | Types for `js-yaml` |
| `@types/qrcode` | 1.5.5 | Types for `qrcode` |
| `@types/node` | 22.10.5 | Node types for Vite config |

## Backend (Cargo)

### Security-critical

| Crate | Version | Used by | Purpose | Notes |
|---|---|---|---|---|
| `keyring` | 3.6.1 | `commands/keychain.rs` | OS keychain (macOS Keychain / Windows Credential Manager) | Service name: `com.toolbox.app`. Provider allowlist: `[openai, anthropic, google]`. |
| `sha2` | 0.10.8 | `commands/crypto.rs` | SHA-256, SHA-512 hashing | Streamed in 64 KiB chunks for file mode. |
| `sha1` | 0.10.6 | `commands/crypto.rs` | SHA-1 hashing | |
| `md-5` | 0.10.6 | `commands/crypto.rs` | MD5 hashing | |
| `crc32fast` | 1.4.2 | `commands/crypto.rs` | CRC32 checksums | |

### Infrastructure

| Crate | Version | Purpose |
|---|---|---|
| `tauri` | 2.10.3 | App framework |
| `tauri-build` | 2.5.6 | Build-time code generation |
| `tauri-plugin-clipboard-manager` | 2.3.2 | Clipboard plugin (Rust side) |
| `tauri-plugin-dialog` | 2.7.0 | Dialog plugin (Rust side) |
| `tauri-plugin-fs` | 2.5.0 | Filesystem plugin (Rust side) |
| `tauri-plugin-os` | 2.3.2 | OS info plugin (Rust side) |
| `serde` | 1.x | Serialization (derive) |
| `serde_json` | 1.x | JSON serialization |
| `tokio` | 1.43.0 | Async runtime (rt-multi-thread, fs, io-util, sync, macros) |

## Tools with zero third-party dependencies

These tools use only browser-native APIs, Canvas API, or Rust IPC:

| Tool | Key APIs used |
|---|---|
| JSON Formatter | `JSON.parse`, `JSON.stringify` |
| Base64 | `TextEncoder`, `TextDecoder`, `btoa`, `atob` |
| UUID Generator | `crypto.randomUUID()`, `crypto.getRandomValues()` |
| Timestamp Converter | `Date`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` |
| URL Encoder | `encodeURIComponent`, `decodeURIComponent` |
| JWT Decoder | `TextDecoder`, `atob` (base64url) |
| HTML Encoder | Hand-rolled entity lookup table |
| GZip | `CompressionStream`, `DecompressionStream` (native) |
| Number Base | `BigInt` |
| Color Converter | Hand-rolled math (RGB ↔ HSL ↔ HSB ↔ CMYK) |
| Color Palette | HSL math (hue rotation, lightness adjustment) |
| Text Case | Hand-rolled tokenizer + case formatters |
| Lorem Ipsum | Embedded word dictionary + `crypto.getRandomValues()` |
| Password Generator | `crypto.getRandomValues()` |
| Password Checker | Entropy math + inline common password list |
| Hash Generator | Rust IPC (sha2, sha1, md-5, crc32fast) |
| Regex Tester | `RegExp` in a Web Worker |
| XML Formatter | `DOMParser`, `XMLSerializer` |
| Image Crop | Canvas API (`drawImage`, `toBlob`) |
| Image Rotate/Flip | Canvas API (`translate`, `rotate`, `scale`) |
| Image Watermark | Canvas API (`globalAlpha`, `fillText`) |
| Placeholder Image | Canvas API (text rendering, `toBlob`) |
| Aspect Ratio | Pure math (GCD) |
| Screen Ruler | SVG + pointer events |
| Word Counter | String splitting + counting |
| Text Cleanup | String manipulation |
| Unit Converter | Lookup tables + math |
| Date Calculator | `Date`, `Intl` APIs |
| Unix Permissions | Bitwise operations |
| Backslash Escape | Hand-rolled escape/unescape |
| Epoch Batch | `Date` constructor |
| Image Resize/Compress/Convert | Rust IPC (`image` crate) |
| EXIF Strip | Rust IPC (`image` crate) |
| Image Batch | Rust IPC (`image` crate) |
| Social Media Resizer | Rust IPC (reuses `resizeImage`) |
| Checksum Verifier | Rust IPC (reuses `hashFile`) |

## Version pinning policy

All versions in `package.json` use **exact pins** (no `^` or `~` ranges). This is a deliberate security decision — we control when dependencies update rather than getting surprise patches. Trade-off: manual update burden.

Lock files (`package-lock.json`, `src-tauri/Cargo.lock`) are committed.

## Known CVE history

| Date | Package | CVE | Action |
|---|---|---|---|
| 2026-04-09 | `js-yaml` 4.1.0 | GHSA-mh29-5h37-fv8m (prototype pollution via `<<` merge) | Upgraded to 4.1.1. Also enforce `JSON_SCHEMA` on all `load`/`dump` calls. |
| 2026-04-09 | `diff` 7.0.0 | GHSA-73rr-hh4g-fpgx (DoS in `parsePatch`/`applyPatch`) | Upgraded to 8.0.4 (breaking: `diffWords` API changed). |

## Updating dependencies

```bash
# Check for outdated npm packages
npm outdated

# Check for npm security advisories
npm audit

# Check for outdated Cargo crates (requires cargo-outdated)
cd src-tauri && cargo outdated

# Check for Cargo security advisories (requires cargo-audit)
cd src-tauri && cargo audit

# After updating, verify:
npm run build                                    # tsc strict + vite
cd src-tauri && cargo check                      # Rust compilation
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test                       # 14 tests
npm run test:e2e                                 # 71 E2E tests
```

When updating `js-yaml`: verify `JSON_SCHEMA` is still used everywhere. Grep: `rg 'JSON_SCHEMA' src/tools/yaml-json/`.
When updating `diff`: check for breaking API changes in the changelog — v7→v8 already broke `diffWords`.
When updating `pdfjs-dist`: verify buffer `.slice(0)` is still needed (check if pdfjs stopped transferring ArrayBuffers to worker).
When updating `jsbarcode`: verify format validation still works (UPC/EAN digit counts, Code39 character set).
