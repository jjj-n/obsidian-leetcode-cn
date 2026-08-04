# LeetCode CN for Obsidian

> **致谢 / Acknowledgment**
>
> 本插件 fork 自 [LikeSundayLikeRain/obsidian-leetcode](https://github.com/LikeSundayLikeRain/obsidian-leetcode)，扩展支持 leetcode.cn。核心基础设施（widget 同步、HTTP 节流、模板渲染等）来自上游项目，按 MIT 许可证保留原始版权声明。
>
> This plugin is a fork of [LikeSundayLikeRain/obsidian-leetcode](https://github.com/LikeSundayLikeRain/obsidian-leetcode), extended to support leetcode.cn. Core infrastructure (widget/sync, HTTP throttling, template rendering, etc.) is from the upstream project, with original copyright retained under the MIT license.

---

把 leetcode.cn 的题目、代码、题解抓取到 Obsidian 笔记中——数学公式、代码、图片格式全部保留，粘贴不再坏掉。每道刷过的题都变成 Obsidian vault 里可搜索、可链接、可离线阅读的一等笔记。

Fetch leetcode.cn problems, your AC submissions, and community solutions into your Obsidian vault — with math formulas, code blocks, and images preserved. Every solved problem becomes a first-class note: tagged, linked, and discoverable.

本插件与 `leetcode.cn` 通信以抓取题目和题解。完整的主机列表见下方 [网络使用](#网络使用-network-usage) 章节。

This plugin communicates with `leetcode.cn` to fetch problems and solutions. See the [Network usage](#网络使用-network-usage) section below for the full list of hosts contacted.

## 核心特性 / Core Features

- 登录 leetcode.cn（嵌入式浏览器 + cookie 手动粘贴兜底）
- 抓取题面（HTML → Obsidian Markdown，数学公式、上下标、代码块、图片格式全部保留）
- 抓取你的 AC 提交代码（fallback 到题目 starter code）
- 抓取社区题解文章（自动拆 `## 题解` 代码块 + `## 题解思路` 思路）
- 可配置笔记模板 + 占位符（`{{problem}}` / `{{code}}` / `{{solution}}` 等）
- 支持 8 种 LC 语言（Python, Java, C++, C, JavaScript, TypeScript, Go, Rust）
- 多题一笔记 + 一题多解法
- 完全灵活的 frontmatter schema（任何 Dataview 字段名都能适配）

- Login to leetcode.cn (embedded browser + manual cookie paste fallback)
- Fetch problem statements (HTML → Obsidian Markdown, math/sup/sub/code/images preserved)
- Fetch your AC submission code (fallback to starter code)
- Fetch community solution articles (auto-split into `## 题解` code + `## 题解思路` approach)
- Configurable note template + placeholders (`{{problem}}` / `{{code}}` / `{{solution}}` etc.)
- Support all 8 LC languages (Python, Java, C++, C, JS, TS, Go, Rust)
- Multi-problem-per-note + multi-solution-per-problem
- Fully flexible frontmatter schema (adapts to any Dataview property names)

## 上游版本说明 / Upstream Version Note

本仓库基于上游 `LikeSundayLikeRain/obsidian-leetcode` v1.3.2 fork。由于本插件走 workflow A（纯笔记本模式，不在 Obsidian 内 Run/Submit 代码），v1.3 引入的 widget / solve / ai / contest / preview 模块已删除。

This repo is forked from upstream `LikeSundayLikeRain/obsidian-leetcode` v1.3.2. Since this plugin uses workflow A (pure notebook mode — no Run/Submit inside Obsidian), the v1.3-introduced widget / solve / ai / contest / preview modules have been removed.

## v1.3 — Inline widget architecture (upstream)

**v1.3** introduces an inline widget architecture: every `leetcode-solve`
fence renders as a self-contained CodeMirror editor inside your note, with
edits flowing to disk via debounced `vault.process` writes. The dual-CM6
nested editor + bidirectional sync from v1.2 has been retired. The file is
the single source of truth; the widget writes through one mutation primitive;
language metadata lives entirely in the `lc-language` frontmatter field.

### Migration from v1.0 / v1.1 / v1.2

Existing v1.0 / v1.1 / v1.2 notes auto-migrate to the `leetcode-solve` fence
tag the first time you open them in 1.3.x. Migration is a single atomic
`vault.process` write — no half-migrated state ever lands on disk.

- **Backup sidecar:** before each migration the original note is copied to
  `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO-timestamp}/`.
- **Backup retention:** backups auto-delete after 30 days.
- **`autoMigrateOnOpen` setting:** default ON. Toggle OFF to migrate manually
  via the `LeetCode: Migrate this note` command palette entry.
- **Reassurance:** your existing notes are not modified until you open them.
  The migration is idempotent — opening an already-migrated note is a no-op.

### How sync works

The widget's editing model is one-way: widget edits are the only source of
new content; the file is the canonical store.

- **Debounced writes:** widget edits write to disk via `vault.process` with
  ~400 ms debounce by default (configurable to 300 / 500 / 1000 / 2000 ms in
  Settings → LeetCode → Sync).
- **External edits reload the widget:** if another pane, Obsidian Sync, or a
  CLI tool (`git pull`, etc.) modifies the file, the widget reloads with your
  cursor position preserved.
- **Conflict modal:** if an external edit arrives while you are mid-keystroke,
  a `Keep mine / Keep external / View diff` modal appears so neither side is
  silently dropped.

### Keyboard scoping

- **Cmd-Z / Ctrl-Z (Undo):** per-widget. Pressing undo inside the widget undoes
  widget edits; pressing it outside undoes parent-doc edits. The two undo
  stacks are independent — typing in the widget does not pollute the parent
  doc's undo stack and vice versa.
- **Cmd-F / Ctrl-F (Find):** focus-scoped. Pressing find inside the widget
  searches widget content; outside, it searches the parent doc. The active
  search scope follows your cursor.

### Known notes

- **Vim toggle requires reload:** toggling vim mode ON/OFF in
  `Settings → Editor → Vim Mode` does not hot-reload the widget. Reload
  Obsidian (Cmd-R or restart) for the new vim state to apply. The plugin's
  internal `Compartment.reconfigure` path works for plugin-driven dispatches
  but the user-driven Settings-panel toggle does not propagate reliably.
  This is a known v1.3 contract.
- **Block-id widget UX deferred to v1.4+:** standard Obsidian `^block-id`
  syntax already works on the widget fence — appending `^id` on the line
  after the closing fence resolves via `[[Note#^id]]`. The deferred
  enhancement is UX polish (auto-hiding generated `^id` lines in Live Preview
  and a one-click "Copy block ref" button); the basic linking capability is
  available today.

## Features

- Browse the LeetCode problem list with search + difficulty/status filters
- Preview any problem in a read-only tab before committing — single-click previews by default; shift-click still opens the note directly
- Open any problem as an Obsidian note with locked frontmatter and a `## Problem` statement rendered as Markdown
- Write solutions in a nested code editor with full language support — syntax highlighting, auto-indent, bracket matching, and comment toggling for all 8 LC languages (Python, Java, C++, C, JavaScript, TypeScript, Go, Rust)
- Run your code against sample or custom test cases with `LeetCode: Run`
- Submit to LC's judge with `LeetCode: Submit`; every verdict type (AC, WA, TLE, MLE, CE, RE) is surfaced
- On Accepted, the plugin updates frontmatter and writes `[[Technique]]` backlinks, turning your vault into a knowledge graph of solving techniques
- Browse your past LC submissions with `LeetCode: View past submissions`
- Vim mode support — Normal-mode keys (j/k/dd/yy/etc.) stay in the code editor, not the parent document
- Optional relative line numbers in the code editor (plugin setting, independent of third-party plugins)
- Previously fetched problems stay readable offline

## Install

### From the Obsidian community plugin store (recommended, after v0.1.0 acceptance)

1. Open Obsidian → Settings → Community plugins → Browse
2. Search for `LeetCode`
3. Install, then Enable

### Manual install (from release assets, pre-acceptance)

1. Download `manifest.json`, `main.js`, and `styles.css` from the latest [GitHub release](https://github.com/LikeSundayLikeRain/obsidian-leetcode/releases)
2. Copy them into `.obsidian/plugins/leetcode/` inside your vault
3. Open Obsidian → Settings → Community plugins → enable `LeetCode`

## Usage walkthrough

1. Install and enable the plugin.
2. Log in: Settings → LeetCode → `Log in`. An embedded window captures your `leetcode.com` session cookie after you sign in normally. If the embedded window does not work on your platform, paste your `LEETCODE_SESSION` cookie into the manual-cookie field instead.
3. Open the problem browser via the ribbon icon or the `LeetCode: Open problem browser` command.

   ![Problem browser](docs/problem-browser.png)

4. Click any problem. The plugin creates a note at `{Problems folder}/{id}-{slug}.md` with the problem statement, frontmatter, and a fenced code block ready for your solution.

   ![Problem note](docs/problem-note.png)

5. Write your solution in the `## Code` block. A nested code editor activates automatically with syntax highlighting, auto-indent, and bracket matching for your selected language. `Run` and `Submit` buttons appear inline. The command palette (`LeetCode: Run`, `LeetCode: Submit`) also works.
6. When you are ready, click `Submit`. The verdict modal shows the result, runtime, memory, and percentile:

   ![Verdict — Accepted](docs/verdict-accepted.png)

7. On Accepted, the plugin writes `[[Technique Name]]` wikilinks under a `## Techniques` section and creates stub technique notes. Open Obsidian's Graph view to see the knowledge graph forming:

   ![Graph view](docs/graph-view.png)

## Previewing problems

Single-click on a problem in the LeetCode browser previews it in a new tab. Shift-click opens the note directly. The preview tab is read-only — it shows the problem statement, difficulty, and topic chips with a sticky `Start Problem` button at the top, and creates no `.md` file in your vault until you click `Start Problem` (or shift-click the row in the browser).

- **Right-click** any problem in the browser and pick `Preview problem` to preview regardless of your default click behavior.
- Run `Open in preview` from the command palette while viewing a problem note to re-open the preview tab for that problem.
- Open Settings → Preview → Click behavior. Choose `Preview first` (default) or `Open note directly` to restore v1.0 behavior. The setting persists across reloads.

Only one preview tab is open at a time — clicking another problem reuses the same tab. After you click `Start Problem`, the preview detaches itself and the new note takes focus.

## Network usage

This plugin communicates with the following hosts:

- `leetcode.com` — fetch problems, submit solutions, poll verdicts. Contest API operations (contest list via `leetcode.com/graphql`, contest ranking/detail via `leetcode.com/contest/`) use the same authenticated session. **All LeetCode traffic** uses Obsidian's built-in `requestUrl`; no other code path touches `leetcode.com`.
- AI provider hosts — only when you have configured an active AI provider in Settings → AI. The plugin contacts at most ONE of these per AI call, depending on your `Active AI provider` selection:
  - `https://api.anthropic.com` — when `Active AI provider = Anthropic`
  - `https://api.openai.com` — when `Active AI provider = OpenAI`
  - `https://openrouter.ai` — when `Active AI provider = OpenRouter`
  - your local Ollama host (default `http://localhost:11434`) — when `Active AI provider = Ollama`
  - your custom OpenAI-compatible endpoint URL — when `Active AI provider = Custom`
  - **AWS Bedrock**: `https://bedrock-runtime.{region}.amazonaws.com` where `{region}` is your configured AWS region (e.g. `us-east-1`) — when `Active AI provider = AWS Bedrock`

No telemetry. No analytics. No other endpoints.

### Authentication

Authentication is handled via an embedded Obsidian `BrowserWindow` that captures your LC session cookie after you sign in. The cookie is stored only in `.obsidian/plugins/leetcode/data.json` on your local machine, is never transmitted anywhere except leetcode.com, and is never logged.

AI provider API keys are stored in plain text in `.obsidian/plugins/leetcode/data.json` on your local machine. Keys are never logged (the plugin's logger redacts every known key field name; see `src/shared/logger.ts`). Keys are transmitted only to the configured provider's endpoint.

### Cost expectations

AI features incur per-call cost charged by your selected provider. The following features make AI calls:

- **AI Debug** (Phase 08) — one streaming call per debug session to analyze your wrong-answer or TLE verdict.
- **AI Review** (Phase 09) — one call per accepted solution when opt-in review is enabled.
- **AI Knowledge Graph classification** (Phase 11) — approximately one call per accepted problem for pattern classification.
- **AI Contest Analysis** (Phase 11) — approximately one call per completed contest for performance summary.

Typical cost per accepted solution: ~$0.01-0.05 depending on provider and model (classification + optional review). See your provider's pricing page for current rates: [Anthropic](https://www.anthropic.com/pricing), [OpenAI](https://openai.com/pricing), [OpenRouter](https://openrouter.ai/models), [AWS Bedrock](https://aws.amazon.com/bedrock/pricing/).

The "Test connection" action sends a metadata-only `GET /v1/models` (or `GET /api/tags` for Ollama) for OpenAI / OpenRouter / Custom / Ollama — these are free. For Anthropic, "Test connection" sends a 1-token chat completion (~$0.0001 per click).

Per-feature daily cost cap UI ships in Phase 09. Default model identifiers may rot — when "Test connection" reports `model not found`, update the `Model` field manually.

## Configuration

Open Settings → LeetCode. Three sections:

- **Authentication** — log in, log out, or paste a session cookie manually as a fallback.
- **Notes** — choose the vault folder for problem notes (default: `LeetCode`) and the default language (default: `python3`).
- **Knowledge Graph** — override the technique-notes folder (defaults to `{Problems folder}/Techniques`) and toggle automatic technique backlinks on Accepted submissions.

### Code editor

The plugin renders the `## Code` fence as an embedded inline-widget editor with
syntax highlighting, auto-indent, bracket matching, and per-language comment
toggling. The widget is the only editor surface in v1.3 — the v1.2 nested-editor
fallback path was retired in 1.3.0. Run / Submit / Reset / Retrieve last
submission / AI commands all continue to work via the action row mounted inside
the widget.

## Troubleshooting

- `LeetCode session expired. Log in again.` — your session cookie is no longer valid. Click the `Log in` action on the Notice, or open Settings → LeetCode → `Log in`.
- `LeetCode is rate limiting us. Try again in a moment.` — LC returned HTTP 429. The plugin auto-retries once after a short backoff; if you see this twice in a row, wait a few seconds and retry manually.
- `Couldn't reach LeetCode. Check your connection.` — your machine cannot reach `leetcode.com` (offline, DNS issue, firewall). Plugin does not auto-retry network failures.
- `LeetCode is slow to respond. Try again.` — LC did not answer within 10 seconds. Judge or network latency; retry manually.
- Run/Submit buttons don't appear — verify the note has `lc-slug` in its frontmatter (only LC-problem notes show the buttons). The buttons render in both Reading mode and Edit mode (Live Preview + Source). If they still don't appear after toggling the plugin off and on, check the developer console (Cmd-Option-I) for errors.

### Section Protection

Problem notes (any note with an `lc-slug` frontmatter entry) make a small
set of plugin-owned regions read-only in Edit Mode (Live Preview + Source).
The protection is silent: typing or pasting into a protected region simply
has no effect — there's no Notice or warning.

**Protected regions** (read-only):

- `## Problem` — heading and entire body (the plugin overwrites this on
  background refresh).
- `## Techniques` — heading line only (the plugin writes `[[Wikilinks]]`
  underneath on Accepted submissions).

**Editable regions:**

- The `## Code` body — owned by the inline widget; you write your solution
  here. The widget itself enforces the fence boundaries via
  `EditorView.atomicRanges`, so your cursor cannot stray into the fence
  opener / closer lines.
- The `## Techniques` body — you can add manual `[[Wikilinks]]` here; AI-driven
  analysis will also write here.
- The `## Notes` body — your own notes about the problem, fully under your
  control.
- `## Custom Tests` (legacy section) — never protected; the plugin doesn't
  read or write it.

**Switching languages:** click the language chevron in the action row at the
top of the widget. It rewrites the fence opener atomically (Cmd-Z reverts the
change inside the widget's per-widget undo stack) and updates the
`lc-language` frontmatter. The fence opener tag is `leetcode-solve` in v1.3 —
you do not edit it directly.

**Why this exists:** locking the `## Problem` body and the `## Techniques`
heading prevents your edits from accidentally landing in regions the plugin
is about to overwrite. v1.3 narrows protection sharply versus v1.2: fence
opener / closer protection is no longer needed because the widget owns the
fence range.

## License

Released under the [MIT License](LICENSE).

## Contributing

Issues and pull requests welcome at [github.com/LikeSundayLikeRain/obsidian-leetcode](https://github.com/LikeSundayLikeRain/obsidian-leetcode).

## Development

```bash
git clone https://github.com/LikeSundayLikeRain/obsidian-leetcode
cd obsidian-leetcode
npm install
npm run dev   # esbuild watch mode → main.js
npm test      # vitest
```

For local testing, copy `main.js`, `manifest.json`, and `styles.css` into `<your-vault>/.obsidian/plugins/leetcode/` and reload the plugin.

### Bundle size

The production bundle (`main.js`) is gated by CI (`scripts/check-bundle-size.mjs`).

- **Hard ceiling: 1.8 MB.** PRs that push `main.js` over 1,800,000 bytes fail CI.
- **Soft warn: 1.76 MB.** PRs that push `main.js` over 1,760,000 bytes emit a CI
  warning so feature drift is caught well before the hard cap.
- **Current size (v1.3):** ~1.76 MB raw. The v1.2 path deletion (~3,325 LOC
  removed) and the v1.3 polish suite (line-number gutter port, per-mode vim
  cursor rendering, hover-border override, action row font) net out to a
  small +49 KB delta versus the v1.2 baseline.

Run the gate locally before pushing:

```bash
npm run build && npm run check:bundle-size
```
