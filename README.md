# ToolBox

> Local-first desktop utility suite — 20 tools, zero network calls, your data never leaves your machine.

A cross-platform desktop app (macOS · Windows · Linux) bundling 20 developer and productivity tools into a single fast native application. Think DevUtils meets Raycast — replaces dozens of browser tabs and small standalone utilities.

Built with Tauri 2 + Rust + React 19 + TypeScript.

## Why ToolBox

Most online utilities ask you to paste sensitive data — JWT tokens, API keys, JSON payloads, SQL queries, private code — into a website you don't control. ToolBox runs **100% on your device**. No accounts. No telemetry. No analytics. Zero network calls from the core features.

## Tools (20)

### Encoders & Decoders
| Tool | Notes |
|---|---|
| Base64 | Text and file modes, URL-safe alphabet, UTF-8 safe |
| URL | `encodeURIComponent` (query params) or `encodeURI` (full URLs) |
| JWT Decoder | Header, payload, signature, expiry status, standard claims (`exp`/`iat`/`nbf`/`iss`/`aud`/`sub`) |
| HTML Entities | Named entities or all-non-ASCII numeric encoding, proper UTF-8 codepoint handling |
| GZip | Native browser `CompressionStream`, base64 wrapper, compression-ratio stats |

### Formatters
| Tool | Notes |
|---|---|
| JSON Formatter | Validate with line/column errors, sort keys, minify, BOM-tolerant |
| SQL Formatter | 8 dialects: MySQL, PostgreSQL, SQLite, T-SQL, BigQuery, Snowflake, MariaDB, ANSI |
| XML Formatter | Hand-rolled DOMParser walker, validate, minify, indent |

### Generators
| Tool | Notes |
|---|---|
| UUID | v1, v4, v7 — RFC 4122 / RFC 9562 correct, bulk up to 100 |
| Lorem Ipsum | Paragraphs / sentences / words / bytes, fatal-decoder UTF-8-safe truncation |
| Password | `crypto.getRandomValues`, entropy meter, character class control, bulk up to 50 |
| QR Code | PNG + SVG download, error correction L/M/Q/H |

### Converters
| Tool | Notes |
|---|---|
| Timestamp | Unix s/ms, ISO 8601, relative time, IANA timezones |
| Color | HEX, RGB, HSL, HSB/HSV, CMYK, WCAG contrast vs white and black |
| YAML ↔ JSON | Auto-detect direction, multi-document support, safe schema |
| Number Base | Binary / octal / decimal / hex, BigInt-backed (arbitrary precision) |
| Text Case | 13 cases: camel, Pascal, snake, SCREAMING_SNAKE, kebab, dot, Title, Sentence, alternating, inverse, etc. |

### Text
| Tool | Notes |
|---|---|
| Text Diff | Line / word / char granularity, side-by-side or unified view, ignore-whitespace |
| Regex Tester | **Sandboxed Web Worker** with 5-second ReDoS timeout, named groups, library of common patterns |

### Crypto
| Tool | Notes |
|---|---|
| Hash Generator | MD5, SHA-1, SHA-256, SHA-512, CRC32 — text and file modes, streamed in 64 KiB chunks |

## Local-first guarantees

- **No network calls.** CSP locks `connect-src` to `'self'`. The Tauri capability allowlist excludes `http`, `notification`, `process`, `updater`, and `global-shortcut`.
- **API keys live in your OS keychain only** (via the Rust `keyring` crate). The raw key never enters the renderer process unless you click "Reveal" — and even then it's auto-hidden after 30 seconds. The settings UI shows a masked summary by default (`•••• •••• •••• 1234`), fetched via a dedicated `get_api_key_summary` IPC that returns only the last 4 chars.
- **Path validators** canonicalize every read/write target via `std::fs::canonicalize` and reject anything that lands under `/etc`, `/private/etc`, `/System`, `/usr`, `/bin`, `/sbin`, `/dev`, `/proc`, or (on Windows) `C:\Windows`, `C:\Program Files`. Symlink-on-existing-file write targets are blocked separately.
- **Web Worker isolation** for user-supplied regex with hard 5-second timeout (`worker.terminate()` on hang) so a catastrophic backtracking pattern can't lock the UI. Workers are spun up per-execution and any in-flight worker is terminated when the next dispatch starts.
- **No `eval`, no `innerHTML`, no `dangerouslySetInnerHTML`, no `new Function`** anywhere in the codebase.
- **Generated passwords are ephemeral** — never logged, never persisted, never echoed in toasts.
- **`tool_defaults` capped at 64 KB** on the Rust side so a compromised renderer can't fill your disk via the preferences IPC.
- **Atomic preferences write** with a `.bad` backup on parse failure so a corrupted preferences file is recoverable.

## Tech stack

- **Frontend**: React 19 + TypeScript (strict, including `noUncheckedIndexedAccess`) + Vite 6 + Tailwind 4 + Zustand 5 + React Router 7 + Lucide React
- **Backend**: Rust + Tauri 2.1 + Tokio + serde + `keyring` + `sha2` / `sha1` / `md-5` / `crc32fast`
- **Tool libraries**: `sql-formatter`, `js-yaml` (with `JSON_SCHEMA` to mitigate prototype pollution), `qrcode`, `diff@8` (CVE-patched)
- **Bundle**: each tool is a separate lazy-loaded JS chunk (~6–50 KB each). Main bundle is 317 KB / 96 KB gzipped. Cold start under 2 seconds.

## Build from source

Requires:
- Node 22+
- Rust stable (`rustup default stable`)
- Tauri prerequisites — see <https://v2.tauri.app/start/prerequisites/>

```bash
git clone https://github.com/shyamala-venkat/toolbox.git
cd toolbox
npm install
npm run tauri dev          # development mode with hot reload
npm run tauri build        # production build (.dmg / .msi / .deb / .AppImage)
```

Production build artifacts land in `src-tauri/target/release/bundle/`.

## Tests

```bash
# Frontend
npm run build              # tsc strict + vite production build

# Rust backend
cd src-tauri
cargo check
cargo clippy --all-targets -- -D warnings
cargo test
```

The Rust suite currently has 14 tests covering the path validators (`validate_existing_file_path`, `validate_writable_file_path`) and the preferences IPC validator (theme allowlist, sidebar width range, font size range, recent/favorites caps, tool-defaults size cap, tool-id charset).

## Project structure

```
toolbox/
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── commands/           # Tauri IPC handlers (crypto, file_ops, keychain, preferences, system)
│   │   ├── security/           # Input validators, rate limiter
│   │   └── storage/            # Preferences I/O (atomic writes, .bad recovery)
│   ├── capabilities/           # Tauri permission scoping
│   └── tauri.conf.json         # CSP, window config, bundler config
└── src/
    ├── app/                    # Layout, Sidebar, CommandPalette
    ├── components/
    │   ├── ui/                 # Button, Input, Textarea, CopyButton, FileDropZone, Toast, …
    │   ├── tool/               # ToolPage wrapper, InputOutputLayout, error boundary
    │   └── settings/           # ApiKeyInput (masked, reveal-with-timeout)
    ├── tools/                  # Each tool is a self-contained folder
    │   ├── registry.ts         # Lazy imports + ToolDefinition entries
    │   └── <tool-id>/          # meta.ts + Component.tsx
    ├── pages/                  # Home, AllTools, Settings, NotFound, ToolRoute
    ├── stores/                 # Zustand: appStore, toolStore, settingsStore
    ├── hooks/                  # useClipboard, useKeyboardShortcut, useDebounce, …
    ├── lib/                    # tauri.ts (typed IPC wrappers), icons.ts, utils.ts
    └── styles/                 # globals.css, themes.css (CSS variables for both themes)
```

### Adding a new tool

1. Create `src/tools/<id>/meta.ts` exporting a `ToolMeta` literal.
2. Create `src/tools/<id>/<Name>.tsx` that renders inside `<ToolPage tool={meta}>` exactly once.
3. Add a `lazy()` import + `ToolDefinition` entry to `src/tools/registry.ts` between the existing markers.
4. If the tool needs an icon not in `src/lib/icons.ts`, add it (just import from `lucide-react` and append to the registry map).
5. If the tool persists per-tool defaults, copy the defensive sanitizer pattern from any existing tool — never trust the raw `toolDefaults[id]` slice without runtime validation.

## Architecture notes

- **Every IPC command validates its inputs** on the Rust side against an allowlist or bounded length. The renderer is treated as untrusted at the trust boundary.
- **Tools subscribe to `toolDefaults[meta.id]`** as a slice (not the whole map) to avoid cross-tool re-render churn.
- **Path validators return a canonicalized `PathBuf`** so callers operate on the verified path, eliminating the TOCTOU window between validation and the real filesystem call.
- **The CSP is exactly** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'`. `connect-src 'self'` blocks all network egress including XHR, fetch, and WebSockets.

## Roadmap

Current scope is the 20-tool MVP. Future possibilities (not committed):

- Auto-updater
- Plugin / extension system for third-party tools
- Sidecar binaries (FFmpeg, Pandoc) for media tools
- AI-powered tools (BYOK keychain is already in place)
- System tray / menu bar mode
- Multi-window support
- i18n / localization

## License

Proprietary — all rights reserved.

## Status

**v0.1.0** — initial release with 20 tools.
