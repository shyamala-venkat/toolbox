# CLAUDE.md — ToolBox

> **This file is the single source of truth for any AI assistant or developer working on this project. Read it fully before writing any code. Follow every rule precisely. When in doubt, ask — don't guess.**

---

## What Is ToolBox

A **local-first desktop utility app** (macOS + Windows + Linux) that bundles **59 tools** into a single, fast, native application. Built with Tauri 2 (Rust backend) + React 19 (TypeScript frontend).

**The pitch**: People paste sensitive data — tax returns, contracts, personal photos, API keys — into random websites to merge PDFs, resize images, or decode tokens. ToolBox does it all locally. Nothing leaves the machine. Ever.

**Target users**: Non-technical users who rely on web tools (SmallPDF, iLovePDF, TinyPNG) for everyday tasks, plus software engineers, DevOps, and security-conscious power users.

---

## Business Model — Read This Before Making UX Decisions

**Pricing**: $3.99/month OR $29.99 one-time lifetime purchase (user's choice).

**Tier structure**:
- **Free tier** (33 tools): All consumer essentials — PDF Merge, Image Resize/Compress/Convert/Crop/Rotate, QR Code, Barcode, ZIP, Color Palette, Favicon Generator, Password Checker, JSON Formatter, Base64, UUID, Hash, Timestamp, URL Encoder, JWT Decoder, Color Converter, Text Case, Lorem Ipsum, Word Counter, Text Cleanup, Unit Converter, Date Calculator, Aspect Ratio, Placeholder Image, Screen Ruler, Checksum Verifier, Social Media Resizer, and more.
- **Pro tier** ($3.99/mo or $29.99 lifetime): All 59 tools — adds PDF Split/Compress/Pages/Watermark/ToImage, Image Watermark/Batch, EXIF Strip, Regex Tester, Text Diff, SQL Formatter, YAML/JSON, XML Formatter, HTML Encoder/Preview, Number Base, Password Generator, GZip, Markdown Preview/PDF, CSV Viewer/JSON, JSON-to-TypeScript, JSONPath, Epoch Batch, Cron Parser, Backslash Escape.

**UX implications of the business model**:
- The free-to-paid upgrade must be **smooth and non-annoying**. No pop-ups. No nagging. Pro tools show a subtle lock icon; clicking opens a clean upgrade prompt.
- Free tools must be **genuinely useful** on their own — they're the sales funnel. A user who loves the JSON Formatter will upgrade for the SQL Formatter.
- The app must feel **worth paying for**. That means polish, speed, and zero bugs. A single paste-not-working bug or a crash on malformed input erodes trust and kills conversions.
- **Never cripple free tools** to push upgrades. The free JSON Formatter should be the best JSON formatter the user has ever used. Quality sells.

---

## Core Principles — Non-Negotiable

### 1. Local-First
Everything runs 100% on the user's machine. No cloud services, no telemetry, no analytics, no accounts, no sign-up. Zero network calls from core features. The CSP enforces `connect-src 'self'` so even a bug can't phone home.

### 2. Security-First
All data stays on-device. API keys stored in OS keychain only. Input sanitization on every tool. No `eval()`, no `innerHTML` with user data, no shell injection vectors. CSP enforced. Tauri's capabilities are locked down to minimum required permissions. **A security-conscious user reading our code should find nothing concerning.**

### 3. Bug-Free
Every tool must handle empty input, very long input (1MB+), and malformed input gracefully — no crashes, no unhandled exceptions, no blank screens. Edge cases are not optional. Test the sad paths, not just the happy path. **Every bug is a reason for the user to not pay.**

### 4. Fast
Every tool loads in under 100ms. The app should feel like a native system utility, not an Electron app. Sub-second cold start. No loading spinners for simple operations.

### 5. Simple
The app should be immediately obvious to use. Paste input, get output. No tutorials needed. No config required. Every tool follows the same visual pattern so once you've used one, you've used them all.

### 6. Best-in-Class Implementations — This Is What Customers Pay For

**Every tool must use the best available open-source library or algorithm for its core operation. No mediocre defaults. No "it technically works." Professional-grade output is the entire value proposition.**

This is non-negotiable because:
- Users compare our output against the best free web tools (SmallPDF, TinyPNG, Squoosh)
- If our JPEG compression produces LARGER files than the input, users uninstall and never come back
- "Works but poorly" is worse than "not built yet" — it actively damages trust and kills conversions
- Users are paying $4/month or $30 lifetime. They expect output quality that matches or beats the tools they're replacing

**The rule**: Before implementing ANY tool that processes files or data, research what the gold-standard implementation is. Don't use the first library that compiles — find the one that professionals use. Then verify the output quality against real-world inputs.

**Examples of this principle in action:**

| Operation | Mediocre choice | Best-in-class choice | Why it matters |
|---|---|---|---|
| JPEG compression | `image` crate's built-in `JpegEncoder` | **`mozjpeg`** (Apache 2.0) — optimal Huffman coding + trellis quantization | Basic encoder produced LARGER files than input. mozjpeg produces 10-30% smaller files at same visual quality. |
| PNG optimization | Re-save with `image` crate | **`oxipng`** (MIT) — multi-threaded, lossless recompression | oxipng applies zopfli/zlib-ng compression that the basic encoder doesn't. |
| PDF compression | `pdf-lib` save with `useObjectStreams` | **`qpdf`** (Apache 2.0) sidecar — stream optimization + image recompression | pdf-lib's "optimization" is modest (10-30%). qpdf can achieve 50-70% on image-heavy PDFs. |
| SQL formatting | Random npm formatter | **`sql-formatter`** (MIT) — 8 dialect support, used by major IDEs | Cheap formatters break on dialect-specific syntax (MySQL vs PostgreSQL vs T-SQL). |
| Text diffing | Naive line-by-line comparison | **`diff`** library (BSD) — Myers algorithm, word-level and char-level | Naive diff produces unreadable results on reordered text. Myers is the gold standard (used by git). |
| Regex execution | Run on main thread | **Web Worker with 5s timeout** — same pattern as VS Code | Running user regex on the main thread lets catastrophic backtracking freeze the entire app. |
| YAML parsing | `js-yaml` with default schema | **`js-yaml` with `JSON_SCHEMA`** explicitly | Default schema enables `<<` merge keys that allow prototype pollution (CVE). |

**Process for every new tool:**
1. Research what tool/library the industry considers best-in-class for this operation
2. Check its license (must be MIT, Apache 2.0, BSD, or ISC for commercial use)
3. If it's a C/C++ library, check if there's a quality Rust wrapper or if we need a sidecar
4. Build the tool with that library
5. Test the output against a competing product (SmallPDF, TinyPNG, etc.) — our output should be comparable or better
6. If the best library is GPL/AGPL, find the next-best permissively-licensed alternative and document the trade-off

**When in doubt**: Ask "would a professional photographer / accountant / content creator be satisfied with this output?" If the answer is "it's okay but not great," find a better library.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript (strict + `noUncheckedIndexedAccess`), Vite 6, Tailwind 4, Zustand 5 |
| Backend | Rust (stable), Tauri 2.1, Tokio, serde, keyring |
| Icons | Lucide React (curated subset in `src/lib/icons.ts`) |
| Tool libs | `sql-formatter`, `js-yaml` (with `JSON_SCHEMA`), `qrcode`, `diff@8`, `pdf-lib`, `pdfjs-dist`, `fflate`, `marked`, `dompurify`, `papaparse`, `jsbarcode`, `jsonpath-plus`, `cronstrue` |
| Testing | Cargo test (14 Rust tests), Playwright E2E (71 tests), `npm run build` as type-check gate |

**What NOT to use**: No Electron. No Redux/MobX. No CSS-in-JS. No SSR. No external APIs from core tools. No ORM. No new dependencies without clear justification — every dep is an attack surface.

---

## Project Structure

```
src-tauri/                      # Rust backend
├── src/
│   ├── lib.rs                  # App setup, plugins, menu, command registration
│   ├── commands/               # Tauri IPC handlers (crypto, file_ops, keychain, preferences, system)
│   ├── security/               # Input validators (path canonicalization + deny list), rate limiter
│   └── storage/                # Preferences I/O (atomic writes, .bad recovery)
├── capabilities/default.json   # Tauri permission scoping (tight — no shell, no http)
└── tauri.conf.json             # CSP, window config, bundler

src/                            # React frontend
├── app/                        # Shell: Layout, Sidebar, CommandPalette
├── components/
│   ├── ui/                     # Primitives: Button, Input, Textarea, CopyButton, Toggle, Toast, ...
│   ├── tool/                   # ToolPage wrapper, InputOutputLayout, error boundary
│   └── settings/               # ApiKeyInput (masked, reveal-with-timeout)
├── tools/                      # === EACH TOOL IS A SELF-CONTAINED FOLDER ===
│   ├── registry.ts             # All 59 tools registered with lazy() imports + synonym search
│   ├── types.ts                # ToolDefinition, ToolMeta, ToolCategory
│   └── <tool-id>/              # meta.ts + Component.tsx (+ optional helpers)
├── pages/                      # Home, AllTools, Settings, NotFound, ToolRoute
├── stores/                     # Zustand: appStore, toolStore, settingsStore
├── hooks/                      # useClipboard, useKeyboardShortcut, useDebounce, ...
├── lib/                        # tauri.ts (typed IPC wrappers), icons.ts, utils.ts
└── styles/                     # globals.css, themes.css (CSS variables for both themes)
```

---

## Build & Verify Commands

**Run ALL of these before every commit. No exceptions.**

```bash
# Frontend: TypeScript strict + Vite production build
npm run build

# Rust: compilation check
cd src-tauri && cargo check

# Rust: lint (treats warnings as errors)
cd src-tauri && cargo clippy --all-targets -- -D warnings

# Rust: tests (15 tests covering path validators + preferences validation)
cd src-tauri && cargo test

# E2E tests (34 Playwright tests against the Vite dev server)
npm run test:e2e

# Production build (creates .dmg / .msi / .deb)
npm run tauri build
```

## Testing Rules — Non-Negotiable

**Every code change to the product MUST include corresponding tests.** This is not optional.

### When to write tests

| Change type | Required tests |
|---|---|
| **New tool** | At least 2 E2E tests: (1) valid input → correct output, (2) malformed input → no crash + friendly error. Add to `e2e/` directory. |
| **Bug fix** | Write a test that REPRODUCES the bug first (red), then fix it (green). The test prevents regression. |
| **New Rust IPC command** | Add a `#[test]` in the relevant `src-tauri/src/commands/*.rs` or `src-tauri/src/security/*.rs` file. |
| **UI component change** | If the change affects tool behavior (not just styling), add or update the relevant E2E test in `e2e/`. |
| **New feature (non-tool)** | Add E2E tests for user-visible behavior (e.g., navigation, settings, theme switching). |
| **Refactor** | Existing tests must still pass. If the refactor changes behavior, update the tests to match. |

### Test infrastructure

- **Rust unit tests**: `cd src-tauri && cargo test` — 14 tests covering path validators, preferences validation, symlink write guard.
- **E2E tests**: `npm run test:e2e` — Playwright against Vite dev server (Chromium headless). 71 tests across 24 files covering navigation, theming, home screen, and 22+ tools. All pass in ~13 seconds.
- **Tools that need Rust IPC** (image tools, hash generator) cannot be tested via Playwright — they need the Tauri runtime. Test these manually or via `tauri-driver` in the future.
- **File-input tools** (PDF tools, CSV viewer) need file dialog simulation — skip in E2E for now, test manually.

### Test file conventions

- E2E tests live in `e2e/<tool-id>.spec.ts` or `e2e/<feature>.spec.ts`
- Use `aria-label` attributes as selectors where possible (most stable)
- Wait for debounce after input: `await page.waitForTimeout(300)` or `await expect(locator).not.toBeEmpty()`
- Each test file should complete in under 5 seconds

### The rule

**No test = no merge.** If you can't write an automated test for a change (e.g., it's purely visual), document WHY in the commit message and describe the manual verification steps you performed.

**Security grep — run after any code change:**
```bash
# Must return ZERO matches in src/ and src-tauri/src/
rg -n 'eval\(|innerHTML|dangerouslySetInnerHTML|new Function\(' src/ src-tauri/src/

# Must return ZERO matches in src/tools/ (exception: color-converter business logic)
rg -n '#[0-9a-fA-F]{3,8}|rgb\(|rgba\(' src/tools/

# Must return ZERO matches
rg -n 'Math\.random' src/tools/

# Must return ZERO matches
rg -n 'console\.log' src/tools/
```

---

## Security Invariants — Memorize These

These rules apply to EVERY file, EVERY commit, EVERY tool. No exceptions.

1. **No `eval()`, `new Function()`, or `setTimeout/setInterval` with string arguments.** Period.
2. **No `dangerouslySetInnerHTML` or `innerHTML`** with user-provided content. Use React JSX text rendering. If you must render HTML (e.g., Markdown preview), use DOMPurify with strict configuration.
3. **No hard-coded colors** in tool files. All colors come from CSS variables defined in `src/styles/themes.css`. The only exception is `color-converter/` where `rgb(...)` is the tool's business logic (with a justifying comment).
4. **No `Math.random()`** for anything security-sensitive. Use `crypto.getRandomValues()`.
5. **No `console.log()`** in production code, especially for passwords, API keys, or user data.
6. **No `fetch()` or `XMLHttpRequest`** from any tool. Network calls violate the local-first principle.
7. **Every Tauri IPC command validates inputs on the Rust side** — allowlists, length bounds, path canonicalization. The frontend is untrusted.
8. **API keys are NEVER stored in localStorage**, never logged, never in error messages. OS keychain only via `keyring` crate.
9. **User-supplied regex runs ONLY in a Web Worker** with a 5-second timeout and `worker.terminate()` on hang.
10. **File operations enforce size limits** (100 MB for reads/hashes, 10 MB for text hashing, 64 KB for tool_defaults).
11. **Path validators canonicalize every path** and reject forbidden prefixes (`/etc/`, `/System/`, `/usr/`, etc.) and symlink write targets.
12. **CSP is exactly**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'`. Never weaken it.
13. **Tauri capabilities** grant only: clipboard read/write, dialog open/save, fs (scoped to app data dir), os platform/arch. No shell, no http, no notification, no global-shortcut, no process, no updater.
14. **YAML parsing MUST use `JSON_SCHEMA`** on both `load` and `dump` to prevent prototype pollution via `<<` merge keys.

---

## How to Add a New Tool

1. **Create** `src/tools/<id>/meta.ts` — exports a `ToolMeta` literal (id, name, description, category, tags, icon, tier, requiresBackend).
2. **Create** `src/tools/<id>/<Name>.tsx` — default-exports a component that renders `<ToolPage tool={meta}>` exactly once at its root. The ToolPage provides the header, error boundary, and recent-tracking.
3. **Register** in `src/tools/registry.ts` — add a `lazy()` import between the `TOOL_IMPORTS` markers and a `ToolDefinition` entry between the `TOOL_REGISTRATIONS` markers.
4. **Icons** — check `src/lib/icons.ts` first. Add a new Lucide icon to the registry if needed.
5. **Tier** — set `tier: 'free'` or `tier: 'pro'` in meta.ts. Free tools are permanently free. Pro tools require a subscription/lifetime purchase.

### Patterns every tool MUST follow

- **ONE `<ToolPage>` wrapper per tool.** The route (`ToolRoute.tsx`) renders the tool component directly inside `<Suspense>`. Never skip the wrapper, never double-wrap.
- **Defensive sanitizer for persisted defaults.** If the tool persists settings to `toolDefaults[meta.id]`, validate the slice with a `sanitize*Defaults(raw: unknown)` function. Never trust the raw value — a manually edited `preferences.json` can contain anything.
- **Slice subscription.** Subscribe via `useSettingsStore((s) => s.preferences.toolDefaults[meta.id])` — NOT the whole `toolDefaults` map. Read the full map lazily inside persist effects via `useSettingsStore.getState().preferences.toolDefaults`.
- **`didMount` flag.** Every persist effect must skip the initial render to avoid clobbering other tools' defaults during hydration.
- **Debounce input processing.** Use `useDebounce(value, 150)` (or 200ms for expensive operations). Never process on every keystroke.
- **Graceful error handling.** Catch all errors from parsing/processing. Show friendly inline messages via the tool's own error state or `useAppStore.getState().showToast(message, 'error')`. Never let an unhandled exception crash the tool — the `ToolPage` error boundary is a last resort, not a primary error handling strategy.
- **Both light and dark mode.** Use CSS variables from `themes.css` only. Test in both themes.
- **No new dependencies** without explicit justification. Most tools use zero third-party libraries (Canvas API, Web Workers, browser-native APIs preferred). See `DEPENDENCIES.md` for the full mapping.

---

## Dependency Policy

- **Exact version pins** in `package.json` (no `^` or `~`). This is a security decision.
- **Lock files committed** (`package-lock.json`, `Cargo.lock`).
- **No CDN imports at runtime.** All JS dependencies are bundled at build time.
- See `DEPENDENCIES.md` for the full tool-to-dependency mapping, CVE history, and update procedure.
- Before adding any dependency, ask: Can this be done with browser-native APIs? If yes, do that instead.

---

## Commit Rules

1. **Run ALL build/verify commands** listed above before committing. Never commit broken code.
2. **Security grep must pass** — zero forbidden patterns in the codebase.
3. **If the commit has substantial changes** (new tool, architectural change, new dependency, security fix, changed conventions), **update this CLAUDE.md file** in the same commit. This file must always reflect the current state of the project.
4. **Commit messages** should be clear and follow conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `security:`. Lead with *why*, not *what*.
5. **One concern per commit.** Don't mix a bug fix with a new feature.
6. **No secrets** in commits — grep for `sk-`, `Bearer`, API key patterns before staging.

---

## Code Review Checklist

Before any PR is merged or code is considered done, verify:

- [ ] `npm run build` passes (tsc strict + vite)
- [ ] `cargo check` + `cargo clippy --all-targets -- -D warnings` — zero warnings
- [ ] `cargo test` — all tests pass
- [ ] Security grep returns zero forbidden patterns
- [ ] Every new tool renders `<ToolPage>` exactly once
- [ ] Every new tool handles empty, long, and malformed input gracefully
- [ ] Every new tool works in both light and dark mode
- [ ] Every interactive element has a visible focus state
- [ ] No new `console.log` statements in production code
- [ ] No hard-coded colors outside `themes.css`
- [ ] Persisted defaults have a defensive sanitizer
- [ ] `DEPENDENCIES.md` updated if deps changed
- [ ] `CLAUDE.md` updated if conventions/architecture changed

---

## Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Tauri 2 over Electron | 10x smaller binary, Rust security boundary, native performance |
| Lazy-loaded tool chunks | Each tool is a separate JS bundle (~6-50 KB). Only loaded when opened. Keeps cold start fast. |
| Zustand over Redux | Minimal API, no boilerplate, slice subscriptions prevent cross-tool re-render churn |
| CSS variables over Tailwind theme | Instant theme switching without re-render. `data-theme="dark"` on `<html>` flips everything. |
| Rust-side IPC validation | The renderer is untrusted. Every `invoke()` payload is validated against allowlists, length bounds, and path rules before any side effect. |
| Web Worker for regex | User-supplied regex can hang indefinitely (ReDoS). Worker isolation + 5s terminate-on-timeout is the only safe pattern. |
| `keyring` crate over localStorage | API keys belong in the OS keychain, not in a JSON file on disk. The key never enters the renderer unless the user explicitly clicks "Reveal". |
| Atomic preferences write | `preferences.rs` writes to `.tmp` then renames. A crash mid-write can't corrupt the file. Parse failures rename to `.bad` for recovery. |
| Native Edit menu in Tauri | macOS requires a native Edit menu for Cmd+V/C/X/A to reach the webview. Without it, paste doesn't work. |
| `JSON_SCHEMA` for YAML | Default js-yaml schema enables `<<` merge keys which allow prototype pollution. We always use the safe `JSON_SCHEMA`. |
| Synonym search over Fuse.js | For <200 tools, a synonym `Map` + substring match is simpler, zero-dep, and has no failure mode. Fuse.js would violate the dependency policy. |
| Clipboard poll-on-focus | Only reads clipboard when the app window is focused. Stops on blur. Zero CPU when backgrounded, respects privacy. |
| Sensitive content filter | Clipboard detection silently skips passwords, API keys, bearer tokens, private keys. Even with opt-in, reading sensitive content violates the security-first principle. |
| Accent presets over single color | Users pick their own accent from 8 presets. No more "AI purple" default. CSS variables update at runtime. |
| pdfjs buffer `.slice(0)` | pdfjs-dist transfers ArrayBuffers to its web worker, detaching the original. Every `getDocument()` call gets a `.slice(0)` copy so the stored buffer stays usable. |

---

## Current State (v0.2.0)

- **59 tools** shipped (33 free, 26 pro) across 12 categories
- **71 Playwright E2E tests** across 24 spec files, **14 Rust unit tests**
- **Consumer-friendly home screen** with category cards, synonym search, popular tools grid, and privacy badge
- **Clipboard auto-detect** with file path + text pattern matching, sensitive content filter, poll-on-focus
- **8 accent color presets** (default: teal) — user-selectable in Settings
- **System tray / menu bar mode** with global shortcut (Cmd+Shift+T)
- **Auto-updater infrastructure** scaffolded
- **CI/CD release workflow** (`.github/workflows/release.yml`)
- **macOS arm64 binary** released as `ToolBox_0.1.0_aarch64.dmg`
- **Private repo**: `shyamala-venkat/toolbox`

### What's NOT built yet (future phases)
- Payment/subscription system ($3.99/mo + $29.99 lifetime via Stripe or Paddle)
- Marketing site (Astro static site with SEO landing pages per tool)
- Plugin/extension system for third-party tools
- Sidecar binaries (FFmpeg, Pandoc) for audio/video/OCR tools
- AI-powered tools (BYOK keychain is ready)
- Cross-platform release builds (currently macOS arm64 only — Windows + Linux planned)
- i18n / localization

---

## File Reference

| File | Purpose |
|---|---|
| `CLAUDE.md` | This file — project rules and context for AI/developers |
| `DEPENDENCIES.md` | Tool-to-dependency mapping, CVE history, update procedure |
| `README.md` | Public-facing project description |
| `src/tools/types.ts` | `ToolDefinition`, `ToolMeta`, `ToolCategory` type contracts |
| `src/tools/registry.ts` | All 59 tools registered with lazy imports + synonym search |
| `src/lib/accents.ts` | 8 accent color presets + runtime CSS variable application |
| `src/lib/tauri.ts` | Type-safe IPC wrappers for every Rust command |
| `src/lib/icons.ts` | Curated Lucide icon registry (~60 icons) |
| `src/styles/themes.css` | All CSS variables for both light and dark themes |
| `src-tauri/tauri.conf.json` | CSP, window config, app identifier, bundler config |
| `src-tauri/capabilities/default.json` | Tauri permission scoping |
| `src-tauri/src/security/input_validation.rs` | Path canonicalization + forbidden prefix deny list + tests |
| `src-tauri/src/commands/preferences.rs` | Preferences IPC with field validation + size caps |

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
