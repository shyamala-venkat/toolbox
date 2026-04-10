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

## Tools with zero third-party dependencies (16 of 20)

These tools use only browser-native APIs and hand-rolled logic:

| Tool | Key browser APIs used |
|---|---|
| JSON Formatter | `JSON.parse`, `JSON.stringify` |
| Base64 | `TextEncoder`, `TextDecoder`, `btoa`, `atob` |
| UUID Generator | `crypto.randomUUID()`, `crypto.getRandomValues()` |
| Timestamp Converter | `Date`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` |
| URL Encoder | `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI` |
| JWT Decoder | `TextDecoder`, `atob` (base64url variant) |
| HTML Encoder | Hand-rolled entity lookup table |
| GZip | `CompressionStream`, `DecompressionStream` (native) |
| Number Base | `BigInt` |
| Color Converter | Hand-rolled math (RGB ↔ HSL ↔ HSB ↔ CMYK) |
| Text Case | Hand-rolled tokenizer + case formatters |
| Lorem Ipsum | Embedded word dictionary + `crypto.getRandomValues()` |
| Password Generator | `crypto.getRandomValues()` |
| Hash Generator (text mode) | Rust IPC (uses Cargo crates above) |
| Regex Tester | `RegExp` in a Web Worker |
| XML Formatter | `DOMParser`, `XMLSerializer` |

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
```

When updating `js-yaml`: verify `JSON_SCHEMA` is still used everywhere. Grep: `rg 'JSON_SCHEMA' src/tools/yaml-json/`.
When updating `diff`: check for breaking API changes in the changelog — v7→v8 already broke `diffWords`.
