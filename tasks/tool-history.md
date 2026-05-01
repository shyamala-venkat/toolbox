# Plan: Tool History (per-tool "Recent runs" drawer)

> Reviewed via `/plan-design-review` and `/plan-eng-review` on 2026-05-01.
> 5 design decisions + 6 architecture decisions resolved with the user.
> Codex outside-voice review caught 10 additional gaps; all incorporated below.

## What we're building

Persistent per-tool history for **text-in/text-out tools** (~35 of 68 in v1). Every
eligible tool gains a right-side **"Recent runs" drawer** (collapsed-to-rail by default
on initial install) that shows past runs of THAT tool. Click a row → slide-in detail
panel shows input + output read-only with a `Restore to editor` button. Sensitive
content (API keys, JWTs, passwords, financial PII patterns) is auto-detected on input
**and output** and stored only as metadata-only tombstone rows that prove "we
caught it" without storing the secret itself.

**Solves:** "I formatted that JSON yesterday, I don't want to paste it again."
**v1 scope:** text tools only. File-input, form-input, and visual tools get history in v2.
**Activity page (cross-tool):** v2.

## Decisions locked

### Design (`/plan-design-review`, 2026-05-01)

| # | Decision | Choice |
|---|---|---|
| D1 | Privacy posture | Smart-default: persistent + blocklist + content-aware exclusion + 7-day TTL + encrypted-at-rest |
| D2 | UI shape | Right drawer in eligible tools (Variant A) |
| D3 | Detail view | Slide-in panel from right (drawer widens to 640px, list compresses to 32px rail) |
| D4 | Trust signal | Toast on first sensitive-block, then silent; tombstone rows are the ongoing signal |
| D5 | Scope (UI) | Drawer in v1; global Activity page deferred to v2 |

### Architecture (`/plan-eng-review`, 2026-05-01)

| # | Decision | Choice |
|---|---|---|
| A1 | Encryption | **SQLCipher** via `rusqlite { features = ["bundled-sqlcipher"] }`; 32-byte key from OS keychain via `keyring`; `PRAGMA key` on connection open |
| A2 | Blocklist source | **Defense-in-depth**: `sensitiveContent: true` flag in `meta.ts` + hardcoded `SENSITIVE_TOOLS` list in Rust; CI assertion enforces parity |
| A3 | Drawer mount | **ToolPage hosts the drawer**; remounts on tool switch; absent from Settings/Home/NotFound |
| A4 | Restore scope | **Text-in/text-out tools only in v1** (~35 tools); file/form/visual tools get history in v2 with per-tool adapter contract |
| A5 | Capture point | Each tool calls a shared **`useHistoryCapture()`** hook with `enabled` predicate; hook debounces 1.5s after stable input + non-empty output + no error |
| A6 | Sensitive runs | **Metadata-only tombstone rows**: persisted with `redacted=TRUE`, NULL content, reason code; survive restart; count toward 200/tool but 0 bytes |

### From Codex outside-voice (auto-baked, no real choice)

| # | Fix | Note |
|---|---|---|
| C1 | Pin storage accounting | Pins **count against** the 50 MB cap; pins bypass TTL only |
| C2 | Output-side detection | Pattern scan runs on **input AND output AND param values**; not input only |
| C3 | Keychain vs DB failure | Separate paths: keychain failure → retryable, drawer disabled, no `.bad` rename; DB-decrypt-with-correct-key failure → `.bad` rename |
| C4 | Default drawer state | **Collapsed to rail** on initial install; user expands explicitly; preserves horizontal space for SQL/Diff/JSON tools |
| C5 | "View all activity →" link | **Removed from v1**; added in same PR as Activity page |
| C6 | Export-as-JSON | **Dropped from v1**; added to v2 because export creates plaintext outside encrypted store and needs re-scan + warning UX |
| C7 | Schema migration | **Day-1 schema_meta row + migration runner skeleton**; even if no migrations exist on day 1, the runner exists |
| C8 | Detail panel rendering | Generic `<HistoryViewer kind>` using a shared lightweight syntax highlighter (`prism-react-renderer` or equivalent already in deps), **NOT** the lazy-loaded tool's own renderer |
| C9 | Gitleaks vendoring policy | Vendor a snapshot of `gitleaks/config/gitleaks.toml` patterns at known commit; document quarterly review in CLAUDE.md |
| C10 | Local telemetry TODO | **Dropped** — adds trust questions inside a privacy feature |
| C11 | Tauri capabilities | Verification step in implementation plan: confirm `fs` scope covers `app_data_dir/history.db*`, dialog scope covers save dialog (export is v2 anyway) |

## Storage & privacy spec

### What gets stored (full rows, eligible text tools only)
- `id` (auto-increment)
- `tool_id` (validated against registry)
- `timestamp` (ISO 8601)
- `input` text (≤ 256 KB; over-cap rejected with `{stored:false, reason:"size_cap"}`)
- `output` text (≤ 1 MB; same)
- `params` JSON (tool params used)
- `bytes` (size accounting for cap math)
- `redacted` BOOLEAN (false for full rows)
- `reason` TEXT NULL
- `pinned` BOOLEAN

### What gets stored (tombstone rows for sensitive runs)
- `id`, `tool_id`, `timestamp`
- `input`, `output`, `params` = `NULL`
- `bytes = 0`
- `redacted = TRUE`
- `reason` = `"blocklisted"` | `"sensitive_pattern:<pattern_id>"` | `"output_pattern:<id>"`
- `pinned = FALSE` (tombstones cannot be pinned)

### What never gets stored
- Anything from blocklisted tools (Password Generator, Password Checker, Hash Generator, JWT Decoder, Backslash Escape, Paycheck Calculator, Tax Bracket Estimator). These tools never render the drawer; their inputs are never sent to the IPC. As defense-in-depth, Rust independently rejects unknown/blocklisted `tool_id`.
- Inputs OR outputs OR param values matching secret patterns. Vendored snapshot of gitleaks pattern catalog (subset). Examples: AWS access keys, GitHub PATs, Stripe keys, Slack tokens, Google API keys, generic `Bearer …`, `sk-…`, PEM private key blocks, JWT-shaped strings. Detection compiled into a single `RegexSet` at startup for one-pass O(n) scan.
- File bytes for any file-input tool (file-input tools have no drawer in v1 anyway).

### Where stored
- `~/Library/Application Support/ToolBox/history.db` (macOS), Windows/Linux equivalents via `app_data_dir()`
- **SQLite via `rusqlite { features = ["bundled-sqlcipher"] }`** — links statically to a SQLCipher-extended SQLite (BSD-3, OK for commercial)
- **Encryption key:** 32 random bytes generated on first launch via `getrandom`, stored in OS keychain via `keyring` crate with service `"toolbox-history"`. On open: read key, `conn.execute("PRAGMA key = ?", [&key])`, then `PRAGMA cipher_compatibility = 4` for SQLCipher v4 defaults.
- **Failure modes** (separate paths):
  - Keychain locked / missing entry → drawer renders "History temporarily unavailable. [Retry]"; tools work normally; **no .bad rename**; entry persists for next launch
  - DB file present but key rejects (bundle-id changed, tampered) → log + rename `history.db` → `history.db.bad.{ts}` → start fresh; user sees "Couldn't unlock history. Started a fresh history. Old data preserved at `history.db.bad.<ts>`."
  - DB file corrupt (header mismatch) → rename + fresh, mirroring `preferences.rs` pattern
- **Schema** (with migration runner from day 1):
  ```sql
  CREATE TABLE schema_meta (version INTEGER NOT NULL, created_at TEXT NOT NULL);
  INSERT INTO schema_meta VALUES (1, datetime('now'));

  CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    input TEXT,
    output TEXT,
    params TEXT,           -- JSON
    bytes INTEGER NOT NULL,
    redacted INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    pinned INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_entries_tool_ts ON entries(tool_id, timestamp DESC);
  CREATE INDEX idx_entries_ts ON entries(timestamp);
  PRAGMA journal_mode = WAL;
  ```
  Migration runner reads `schema_meta.version` and runs ordered migrations from a `Vec<fn(&Connection) -> Result<()>>` keyed by target version. Day-1 migrations vec is empty; the structure exists.

### Lifecycle
- TTL: 7 days default (configurable: 1d / 7d / 30d / forever). Sweep runs in a background tokio task on app start and on retention change.
- **Caps:** 200 entries per tool, 50 MB total. Pinned entries **count toward** both caps (Codex C1). Pins bypass TTL only.
- **Eviction:** silent. When a write would exceed 50 MB total, evict oldest unpinned. Settings displays "X.X MB used (of 50 MB)" so user can investigate.
- **Pause toggle** (in drawer header): persists in Rust preferences; even if frontend ignores it, Rust returns `{stored:false, reason:"paused"}`.
- **Per-tool always-pause** (in tool kebab menu): persists per-tool flag in `preferences.json`.
- **Clear all history**: confirm dialog → `DELETE FROM entries`.
- **Pin cap:** 20 pins/tool. At cap, frontend shows toast: "Unpin one to pin another."

## IPC contract (Rust ↔ frontend)

```
add_history_entry({tool_id, input, output, params}) ->
    {stored: bool, reason?: "blocklisted"|"paused"|"sensitive_pattern"|"size_cap"|"unknown_tool"}
list_history({tool_id, limit, before_timestamp?}) -> [HistoryEntry]
    // previews truncated server-side to 1KB; full content via get_history_entry
get_history_entry({id}) -> HistoryEntry  // full input + output
delete_history_entry({id}) -> ok
clear_history({tool_id?}) -> {removed: usize}
pin_history_entry({id, pinned: bool}) -> {ok|reason:"pin_cap"|"is_tombstone"}
set_history_paused({paused: bool}) -> ok
set_history_retention({ttl: "1d"|"7d"|"30d"|"forever"}) -> ok
history_storage_stats() -> {entries, bytes_used, bytes_cap, tombstones, pins}

HistoryEntry = {
  id: u64, tool_id: string, timestamp: ISO8601,
  input: string|null,        // null when redacted (tombstone) or list_history-truncated
  output: string|null,
  params: JsonValue|null,
  redacted: boolean,
  reason: string|null,
  pinned: boolean,
  bytes: u64
}

// All Rust IPC handlers:
//   - validate tool_id is in registry (no arbitrary writes)
//   - cap input length at 256KB, output at 1MB (reject above)
//   - run RegexSet scan on input + output + param values
//     before write
//   - if scan matches: insert tombstone row instead
//   - if blocklisted: insert tombstone row with reason="blocklisted"
//   - check pause flag
```

## UI spec

### Drawer (per-tool, right side, eligible tools only)

Rendered only when `tool.sensitiveContent !== true` AND `tool.historyEligible !== false`.
File/form/visual tools have `historyEligible: false` in v1.

**Default state on first install: collapsed to 32px rail.** User expands explicitly via
the rail or `Cmd/Ctrl+Shift+H`. State (collapsed vs expanded) persists in `preferences.json`
as a global preference.

Breakpoints unchanged from design review (300px → rail at 1024–1279px → bottom sheet < 1024px).

Layout, top to bottom — unchanged from design review except: **no "View all activity →" footer link in v1.**

Row rendering for tombstone:
```
9:42 AM  🔒 Sensitive — not stored
         (matched: AWS access key)
```
Row rendering for normal entries unchanged.

### Detail slide-in panel

Click a row → drawer widens to ~640 px, row list compresses to 32 px left rail.

Layout unchanged from design review **except** syntax highlighting: detail panel uses a
**generic `<HistoryViewer kind="text|json|sql|yaml|xml|html|markdown|...">`** component
backed by a single shared lightweight highlighter, NOT the lazy-loaded tool's own renderer.
This avoids loading the tool chunk just to render history. Tool's `meta.ts` declares
its `historyKind` (defaults to `"text"`).

If a row is a tombstone (`redacted=true`), the detail panel shows:
```
🔒 Sensitive content was not stored.

Run at: <timestamp>
Tool:   <tool name>
Reason: This input matched a pattern that looks like an
        AWS access key. As a privacy precaution, the input
        and output were not saved.

[Why does ToolBox do this?]   (link to Settings → History → Privacy explainer)
```
No `[Restore]` button on tombstones (nothing to restore).

### First-block toast

Unchanged from design review.

### Settings → History (new section)

Unchanged **except**:
- **Export as JSON** button: **REMOVED** from v1. Added to v2 alongside Activity page.
- Privacy explainer expanded: enumerate the gitleaks pattern families covered, link to
  the vendored `pattern-snapshot.toml` commit hash.

### Tools eligible for history in v1 (~35 tools)

```
Free:
  json-formatter, base64, url-encoder, html-encoder,
  text-cleanup, lorem-ipsum, word-counter, color-converter,
  color-palette, number-base, csv-json, csv-viewer (text mode),
  cron-parser, jsonpath-eval, html-preview, markdown-preview

Pro:
  sql-formatter, yaml-formatter, xml-formatter, regex-tester,
  text-diff, json-to-typescript, gzip-tool

Sensitive (drawer rendered, but every entry is a tombstone):
  // None — sensitive tools have sensitiveContent:true and
  // get NO drawer at all in v1 (defense-in-depth: no UI surface
  // for the user to wonder "is my password in here?")

NOT eligible in v1 (no drawer):
  All file-input tools: pdf-merge/split/compress/pages/watermark/to-image,
    image-resize/compress/convert/crop/rotate/watermark/batch,
    exif-strip, csv-viewer (file mode), markdown-pdf, gzip-tool (file mode),
    epoch-batch (csv input), favicon-gen, image-batch, zip-tool,
    checksum-verify
  All form/calc tools: tip-splitter, currency-converter, expense-splitter,
    loan-emi, compound-interest, mortgage-calc, retirement-calc,
    aspect-ratio, date-calculator, unit-converter, social-media-resizer
  All visual tools: qr-code, barcode-gen, screen-ruler, placeholder-image
  All sensitive tools: password-gen, password-checker, hash-generator,
    jwt-decoder, backslash-escape, paycheck-calc, tax-bracket-estimator
```

## ToolMeta extension

```typescript
// src/tools/types.ts
export interface ToolMeta {
  id: string;
  ...
  // History eligibility (v1).
  // - sensitiveContent: true → never store anything from this tool
  //   (defense-in-depth: also enforced in Rust SENSITIVE_TOOLS).
  //   No drawer is rendered for this tool.
  // - historyEligible: false → tool's input/output shape doesn't fit
  //   text-in/text-out v1 contract (file inputs, multi-pane forms,
  //   visual outputs). No drawer rendered. Will be eligible in v2 once
  //   per-tool history adapter contract ships.
  // - historyKind: which generic viewer to use in the detail panel.
  //   Defaults to "text". One of: "text"|"json"|"sql"|"yaml"|"xml"|
  //   "html"|"markdown"|"regex"|"csv"|"diff".
  sensitiveContent?: boolean;
  historyEligible?: boolean;     // default true if sensitiveContent false
  historyKind?: 'text'|'json'|'sql'|'yaml'|'xml'|'html'|'markdown'|'regex'|'csv'|'diff';
}
```

## Capture API

```typescript
// src/hooks/useHistoryCapture.ts
export function useHistoryCapture(opts: {
  toolId: string;
  input: string;
  output: string;
  params: Record<string, unknown>;
  enabled?: boolean;   // false during error / empty input
  debounceMs?: number; // default 1500
}): void

// Each eligible tool calls it from its component, e.g.:
useHistoryCapture({
  toolId: 'json-formatter',
  input,
  output,
  params: { indent, minify },
  enabled: !error && input.trim().length > 0,
});
```

Hook responsibilities:
- Debounce stable input for 1500ms
- Skip when `enabled === false`
- Skip when `output` is empty
- Call `invoke('add_history_entry', ...)`; on result `stored:false reason:"sensitive_pattern"` and first-block-toast not yet dismissed → show first-block toast
- Swallow errors silently with console warn (never fail the tool)
- Update local Zustand store optimistically; rollback on failure

## Interaction states (extends design review)

Adds:
| State | Spec |
|---|---|
| Initial install (no rows yet, drawer collapsed by default) | Rail shows clock icon + "Recent" vertical text + "0" count |
| Tombstone row hover | Tooltip: "Why was this not stored? [Settings]" |
| Drawer disabled (keychain locked) | Rail shows amber dot + "History off"; clicking opens Settings → History with troubleshooting copy |
| Tombstone in detail panel | Reason explanation; no Restore button |
| Capture skipped due to error | No row appears; no toast; tool continues |

## Performance budget

- `add_history_entry` IPC round-trip: < 30 ms p95 (RegexSet scan + insert + cap check)
- `list_history` returning 50 entries with 1KB previews: < 20 ms p95
- Drawer first paint after tool mount: < 50 ms (skeleton instant, real data fills async)
- Sub-100ms tool load budget preserved: drawer init is async, doesn't block tool render. Skeleton shows in 1 frame; data loads via IPC.

## Code organization

```
src-tauri/src/
  storage/
    history.rs        # Connection mgmt, init, schema migration, CRUD,
                       # cap eviction, TTL sweep. ASCII state machine
                       # comment at top showing write path.
    history_test.rs   # ~12 unit tests (init/encrypt/corrupt/wrong-key/
                       # add/blocklist/pattern/pause/cap/list/pin/sweep)
  security/
    redaction.rs      # SENSITIVE_TOOLS list, RegexSet pattern matcher,
                       # is_blocklisted_tool(), contains_secret()
    redaction_test.rs # Per-pattern positive + false-positive guards
    patterns/
      gitleaks-snapshot.toml  # vendored, MIT, commit hash documented
  commands/
    history.rs        # IPC handlers; all validate tool_id, sizes,
                       # then delegate to storage/history.rs

src/
  components/
    history/
      Drawer.tsx              # Mounts in ToolPage when eligible
      DrawerRail.tsx          # 32px collapsed state
      RowItem.tsx             # Normal + tombstone variants
      DetailPanel.tsx         # Slide-in, includes HistoryViewer
      HistoryViewer.tsx       # Generic viewer dispatching on historyKind
      EmptyState.tsx
      SettingsPanel.tsx       # Settings → History section
  hooks/
    useHistoryCapture.ts
  stores/
    historyStore.ts           # Zustand: entries, pause flag, retention
  lib/
    sanitizeHistoryDefaults.ts
  components/tool/
    ToolPage.tsx              # Modified: layout flex; conditionally
                               # mounts <Drawer> when meta is eligible.
                               # ASCII layout-comment added at top.
```

## CI / parity check

Add a build-time assertion script (`scripts/check-blocklist-parity.sh` or a test in
`src-tauri/tests/`) that:
1. Reads `src/tools/*/meta.ts`, finds all entries with `sensitiveContent: true`, collects ids.
2. Reads `src-tauri/src/security/redaction.rs`, parses `SENSITIVE_TOOLS` const.
3. Fails build if the two sets differ.

Run in `npm run build` and `cargo test`.

## NOT in scope (v1)

- Activity page (cross-tool timeline) → v2
- Drawer for file-input tools → v2 with adapter contract
- Drawer for form/calc tools (Tip Splitter, Mortgage, etc.) → v2 with adapter contract
- Drawer for visual tools (QR, Barcode, etc.) → v2 (questionable value)
- Drawer for sensitive tools (Password Gen, Hash, etc.) → forever (no value, only risk)
- Export-as-JSON → v2
- In-drawer search → v2
- Cross-tool browsing → v2
- Multi-select / compare → v2
- Sharing / collaboration → forever (violates local-first)
- Sync across machines → forever
- AI-powered "find similar runs" → forever
- Local telemetry / usage counters → forever (privacy feature shouldn't even count locally)

## What already exists (reuse)

- `useSettingsStore` — extend with `historyDrawerExpanded`, `historyPaused`, `historyRetention`, `firstBlockToastDismissed`, per-tool always-pause map
- `preferences.rs` — atomic write + `.bad` recovery pattern; mirror exactly for `history.db`
- `keyring` crate — already used in `keychain.rs` for API keys; new entry under `service="toolbox-history"`
- `themes.css` CSS variables — drawer reuses `--surface-1/--border-hairline/--surface-hover/--text-{primary,secondary,tertiary}`
- `ToolPage` wrapper — extended with conditional `<Drawer>` sibling; ASCII layout comment added
- Existing skeleton/empty-state components in `src/components/ui/`
- Existing Toast system in `useAppStore.showToast`
- Tauri `fs` capability — verify covers `app_data_dir/history.db*` (likely already does); no new capabilities expected
- Existing `useKeyboardShortcut` — register `Cmd/Ctrl+Shift+H`
- `regex` crate already in Cargo.toml (used elsewhere)
- New deps: `rusqlite` with `bundled-sqlcipher` feature, `getrandom` (already transitive)

## Test plan

Full test plan written to:
`~/.gstack/projects/shyamala-venkat-toolbox/raghavan-main-eng-review-test-plan-20260501-002715.md`

Summary:
- **Rust unit tests**: `history.rs` (init/encrypt/corrupt/wrong-key/add/blocklist/pattern/pause/cap/list/pin/sweep — 12 tests), `redaction.rs` (per-pattern positive + false-positive guards — 12 tests). Includes critical security path: wrong-key DB open must not leak plaintext.
- **Vitest**: `sanitizeHistoryDefaults.test.ts`, `historyStore.test.ts`. ~8 tests.
- **Playwright E2E**: `history-drawer.spec.ts` (10 tests covering render, capture, detail panel, restore, pause, keyboard, tombstone display), `history-settings.spec.ts` (3 tests), `history-regression.spec.ts` (smoke for 35+ eligible tools with drawer mounted).
- **Total new tests**: ~45.
- **Regression rule applied**: drawer mounts inside ToolPage which every eligible tool uses; smoke test required to prove no tool is broken by drawer presence.
- **CI assertion**: blocklist parity check (`meta.ts` ↔ Rust `SENSITIVE_TOOLS`).

## Failure modes (each must have test + handling + visible failure)

| Failure | Test? | Handling | User experience |
|---|---|---|---|
| Keychain locked | yes | Drawer disabled state, no `.bad` rename, retryable | "History temporarily unavailable. [Retry]" in drawer; tool works fine |
| Wrong key (bundle-id changed) | yes | Rename `.bad.{ts}`, fresh DB | Notice in Settings: "Started a fresh history. Old data preserved at <path>." |
| DB file corrupt | yes | Rename `.bad.{ts}`, fresh DB | Same notice |
| Pattern false-positive | yes (false-positive guard) | Tombstone row written; user sees lock badge | Trust signal; user can verify in Settings privacy explainer |
| Pattern false-negative (secret slips through) | partial | Cannot fully prevent; mitigated by gitleaks vendoring | Documented limitation in Settings privacy copy |
| `add_history_entry` IPC fails | yes | Frontend swallows + console.warn | Tool continues; no row appears (silent loss acceptable for failing IPC) |
| Cap exceeded | yes | Silent eviction of oldest unpinned | Settings shows "X.X MB used (of 50 MB)" |
| Pin cap exceeded | yes | Reject + toast | "Unpin one to pin another." |
| Tool calls capture for blocklisted tool | yes | Rust rejects with `unknown_tool`; frontend ignores | No-op; never written; defense-in-depth |
| User pastes 300KB JSON | yes | Reject with `size_cap`; transient toast | "Input too large for history. Run completed normally." |

**No critical gaps remaining.**

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
|------|----------------|------------|
| 1. Storage layer (Rust) | `src-tauri/src/storage/`, `src-tauri/src/security/`, `src-tauri/src/commands/`, `Cargo.toml` | — |
| 2. Frontend store + hook | `src/stores/`, `src/hooks/`, `src/lib/` | step 1 IPC contract |
| 3. Drawer + DetailPanel UI | `src/components/history/`, `src/components/tool/ToolPage.tsx` | step 2 |
| 4. Tool integration | `src/tools/*/Component.tsx` (~35 tools), `src/tools/*/meta.ts` | step 2 |
| 5. Settings → History | `src/pages/Settings.tsx`, `src/components/history/SettingsPanel.tsx` | step 2 |
| 6. CI parity check | `scripts/`, `src-tauri/tests/` | steps 1 + 4 |
| 7. E2E tests | `e2e/` | step 3 + 4 |

**Lanes:**
- **Lane A (sequential):** step 1 → step 2
- **Lane B (parallel after Lane A's step 2):** step 3, step 4, step 5 — three engineers / three worktrees, no module overlap
- **Lane C (final):** step 6 + step 7 — both depend on the rest

**Conflict flags:** step 4 modifies ~35 tool components but each is independent. step 3 modifies ToolPage.tsx; step 4 doesn't. No conflicts.

**Recommendation:** if a single engineer, do sequential 1→2→3→4→5→6→7. If parallelizing with CC subagents, dispatch step 3, 4, 5 in parallel once step 2 is merged.

## TODOs (proposed)

1. **Activity page (v2)** — global cross-tool timeline + search + filter + bulk delete + Export-as-JSON. Includes the deferred `View all activity →` link.
2. **Per-tool history adapter contract (v2)** — for file-input, form-input, and visual tools. Each tool exports `historyAdapter: { serialize, deserialize, formatPreview }`. Enables drawer for the other ~33 tools.
3. **Migration cookbook (post-v1)** — when first schema change happens, document the migration runner pattern in CLAUDE.md.
4. **DESIGN.md** — formalize design tokens, drawer/panel patterns, list patterns. Currently scattered in `themes.css` only.
5. **Gitleaks pattern refresh cadence** — quarterly review of upstream gitleaks repo for new pattern families. Track in CLAUDE.md.
6. **Export-as-JSON UX (v2)** — re-scan before write, prominent "exported file is plaintext" warning, default save location guidance.

(Removed from prior list: local telemetry counter — Codex C10.)

## Approved Mockups

None — `DESIGN_NOT_AVAILABLE` (OpenAI key not configured for `gstack design`). ASCII wireframes in plan-design-review session were used. Recommend running `/design-shotgun` before final visual QA after API key setup.

## Implementation order (what to build first)

1. Storage layer + IPC + Rust tests (worktree-able alone)
2. CI parity check (small)
3. `useHistoryCapture` hook + `historyStore` + sanitizer + Vitest
4. `ToolPage` modification + Drawer + RowItem + EmptyState + DrawerRail
5. DetailPanel + HistoryViewer (generic syntax-highlighted)
6. Settings → History section
7. Wire up the ~35 eligible tools (one PR or batched)
8. Playwright E2E + regression smoke
9. CLAUDE.md + DEPENDENCIES.md updates

Ship as 2 PRs:
- **PR-A**: steps 1–3 + 6 (storage + IPC + state + Settings; no drawer UI yet)
- **PR-B**: steps 4–5 + 7–9 (drawer UI, tool integration, tests, docs)

## Completion Summary (eng review)

```
+========================================================================+
|         ENG PLAN REVIEW — COMPLETION SUMMARY                            |
+========================================================================+
| Step 0 (scope)       | Accepted: 14-16 files, complete v1 with text-only
|                      | restore scope reduction; no other reductions
| Architecture         | 4 issues, all resolved
| Code Quality         | 5 findings, all baked
| Test Review          | 45 paths flagged, regression rule triggered,
|                      | test plan artifact written
| Performance          | 1 real concern (RegexSet vs N regex), baked
| Outside Voice (Codex)| 10 substantive findings:
|                      |   3 surfaced as cross-model tensions, resolved
|                      |   7 baked directly (clear fixes)
| Failure modes        | 0 critical gaps remaining
| Parallelization      | 7 steps, 3-way parallel after step 2
+------------------------------------------------------------------------+
| Decisions made       | 6 architectural (A1-A6) + 11 baked (C1-C11)
| Decisions deferred   | 0
| Mode                 | FULL_REVIEW
+========================================================================+
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | OUTSIDE_VOICE | 10 substantive: 3 tensions resolved, 7 baked |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 6 architecture decisions, 5 code quality, 45 test paths, 1 perf concern, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score: 1/10 → 9/10, 5 decisions, 0 unresolved |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX:** 10 findings → 3 tensions surfaced + 7 fixes auto-baked (pin-cap math, output-side scan, keychain/DB separation, default-collapsed drawer, removed v1 placeholder link, dropped v1 export, day-1 schema migration runner, generic HistoryViewer not lazy-loaded tool renderers, gitleaks vendoring policy, dropped telemetry TODO, capability verification step).
**CROSS-MODEL:** Both reviews agree on text-only-tools-in-v1, defense-in-depth blocklist, and SQLCipher; tension only on default drawer state (resolved to collapsed).
**UNRESOLVED:** 0
**VERDICT:** DESIGN + ENG + CODEX CLEARED — ready to implement.
