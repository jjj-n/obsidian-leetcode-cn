# LeetCode CN for Obsidian

> **致谢 / Acknowledgment**
>
> 本插件 fork 自 [LikeSundayLikeRain/obsidian-leetcode](https://github.com/LikeSundayLikeRain/obsidian-leetcode)，扩展支持 leetcode.cn，按 MIT 许可证保留原始版权声明。
>
> This plugin is a fork of [LikeSundayLikeRain/obsidian-leetcode](https://github.com/LikeSundayLikeRain/obsidian-leetcode), extended for leetcode.cn, with the original copyright retained under the MIT license.

把 leetcode.cn 的题目、代码、题解抓取到 Obsidian 笔记中——数学公式、代码、图片格式全部保留。每道刷过的题都成为 vault 里可搜索、可链接、可离线阅读的一等笔记。

Fetch leetcode.cn problems, your AC submissions, and community solutions into your Obsidian vault — with math formulas, code blocks, and images preserved. Every solved problem becomes a first-class note: searchable, linkable, and readable offline.

本插件与 `leetcode.cn` 通信以抓取题目和题解，完整主机列表见[网络使用](#网络使用--network-usage)章节。/ This plugin communicates with `leetcode.cn` to fetch problems and solutions — see [Network usage](#网络使用--network-usage) for the full host list.

**工作模式（workflow A，纯笔记本模式）**：你在 leetcode.cn 网站上写题、提交，插件负责把内容抓进笔记。插件**不**在 Obsidian 内运行或提交代码。

**Workflow A (pure notebook mode):** you write and submit code on leetcode.cn; the plugin fetches content into notes. The plugin does **not** run or submit code inside Obsidian.

## 核心特性 / Core Features

- 登录 leetcode.cn（嵌入式浏览器自动捕获 session，设置面板手动粘贴 cookie 兜底）
- 题目浏览器侧边栏（ribbon 图标 / 命令面板打开）：搜索、难度/状态快捷筛选、高级复合筛选（标签、通过率、题号区间等）、AC 状态一览，点选即建笔记；全量题库索引缓存 24 小时，离线可浏览
- 抓取题面：HTML → Obsidian Markdown，数学公式、上下标、代码块、图片格式全部保留
- 抓取你的 AC 提交代码（无提交时回退到题目 starter code）
- 抓取社区题解文章，自动拆分为代码（`## 题解`）与思路（`## 题解思路`）
- 笔记模板 + 14 个内置占位符（`{{problem}}` / `{{code}}` / `{{solution}}` 等）+ 自定义占位符（可引用内置占位符）
- 支持全部 8 种 LC 语言（Python、Java、C++、C、JavaScript、TypeScript、Go、Rust）
- 多题一笔记（锚点系统）+ 一题多解法（多个 `lc:solution` 锚点）
- 可选图片下载到 vault，笔记完全离线可读
- 题面缓存 7 天，过期后台自动刷新

- Log in to leetcode.cn (embedded browser session capture + manual cookie paste fallback)
- Problem browser sidebar (ribbon icon / command palette): search, difficulty/status quick filters, advanced compound filtering (tags, acceptance, id ranges), AC status at a glance, click-to-create-note; full index cached for 24h, browsable offline
- Fetch problem statements: HTML → Obsidian Markdown with math/sup/sub/code/images preserved
- Fetch your AC submission code (falls back to the problem's starter code)
- Fetch community solution articles, auto-split into code (`## 题解`) and approach (`## 题解思路`)
- Configurable note template + 14 built-in placeholders (`{{problem}}` / `{{code}}` / `{{solution}}`, etc.) + custom placeholders that can reference built-ins
- All 8 LC languages (Python, Java, C++, C, JavaScript, TypeScript, Go, Rust)
- Multi-problem-per-note (anchor system) + multi-solution-per-problem (multiple `lc:solution` anchors)
- Optional image download into the vault; notes fully readable offline
- 7-day problem-content cache with background refresh

## 当前状态与 Roadmap / Current Status & Roadmap

**当前可用命令（命令面板搜索 "LeetCode"）：**

| 命令 / Command | 作用 / What it does |
|---|---|
| `打开题目浏览器` | 左侧栏打开题目浏览器视图（ribbon 图标同入口）：搜索 / 筛选 / 点选建题；首次打开自动同步全量题库 / **Open the problem browser sidebar** (ribbon icon works too): search, filter, click-to-note; first open syncs the full problemset |
| `Fetch problem` | **核心入口**：粘贴题目 URL 或输入 slug → 生成完整笔记（题面 + 代码 + 空题解锚点）；笔记已存在则直接打开并按需后台刷新 / **Core entry**: paste a problem URL or type a slug → a full note is created (statement + code + empty solution anchors); existing notes are re-opened with background refresh |
| `Log in` | 嵌入式浏览器登录 leetcode.cn / Sign in via embedded browser |
| `Log out` | 登出并清除本地 cookie / Sign out and clear local cookies |
| `Paste sanitize: clean and convert HTML to markdown` | 清洗选区/全文中的 LC 网页粘贴，转成干净 Markdown / Clean LC web paste-ins into Markdown |
| `吸收题解标记` | 把笔记中的 `题解链接: <URL>` 行吸收进最近的空题解锚点并抓取 / Absorb `solution link: <URL>` lines into the nearest empty solution anchor and fetch |
| `输入题解 URL` | 弹窗输入题解 URL，写入首个空锚点并抓取 / Prompt for a solution URL, fill the first empty anchor and fetch |
| `刷新题解` | 三种范围刷新：单锚点 / 当前题全部 / 整篇笔记 / Refresh by scope: single anchor / current problem / whole note |

**Roadmap（按优先级 / in priority order）：**

1. **上架准备**：补充截图、发布 GitHub release、向 `obsidianmd/obsidian-releases` 提交社区商店 PR。

~~题目浏览器~~（已完成：侧边栏视图 + 搜索 / 筛选 / 点选建题，2026-08。）

v2 远期方向（暂不承诺）：AI 题解审查、竞赛支持、快速搜索命令（`QuickProblemSearchModal` 已实现待接线）。

**Current state:** the eight commands above are available today, including the `Fetch problem` core entry and the problem browser sidebar. Store submission is next on the roadmap. v2 directions (not promised): AI review, contest support, quick-search command (`QuickProblemSearchModal` implemented, unwired).

## 安装 / Install

### 手动安装（商店上架前）/ Manual install (pre-store)

1. 从 [Releases](https://github.com/jjj-n/obsidian-leetcode-cn/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 放入 vault 的 `.obsidian/plugins/leetcode-cn/` 目录
3. 设置 → 第三方插件 → 启用 `LeetCode CN`

1. Download `main.js`, `manifest.json`, and `styles.css` from [Releases](https://github.com/jjj-n/obsidian-leetcode-cn/releases)
2. Copy them into `.obsidian/plugins/leetcode-cn/` inside your vault
3. Settings → Community plugins → enable `LeetCode CN`

### 社区商店（上架后）/ Community store (after acceptance)

设置 → 第三方插件 → 浏览 → 搜索 `LeetCode CN` → 安装并启用。/ Settings → Community plugins → Browse → search `LeetCode CN` → install and enable.

## 使用 / Usage

1. **登录**：设置 → LeetCode → `Log in`，在弹出的嵌入式浏览器窗口中正常登录 leetcode.cn，插件自动捕获 session。若嵌入式窗口在你的平台上不可用，改用设置面板的 Manual cookie 输入框粘贴 `LEETCODE_SESSION` cookie。
   / **Log in**: Settings → LeetCode → `Log in`, sign in normally inside the embedded browser window. If the embedded window doesn't work on your platform, paste your `LEETCODE_SESSION` cookie into the manual-cookie field instead.
2. **抓题建笔记（核心闭环）**：命令面板 → `Fetch problem` → 粘贴题目链接（如 `https://leetcode.cn/problems/two-sum/`，任意子路径都可以）、输入 slug（如 `two-sum`）、题号（如 `70`），或**直接输入中文/英文题名搜索**（如 `两数之和`、`climbing stairs`）→ 搜索结果弹窗选择 → 插件抓取题面与代码，按模板生成 `{id}. {题名}.md`（如 `1. 两数之和.md`） 笔记并打开。笔记已存在时直接打开，缓存过期会后台刷新。无需登录即可抓取公开题目。
   / **Fetch a problem (core loop)**: command palette → `Fetch problem` → paste a problem URL, type a slug (`two-sum`) or a number (`70`), or **search by title in Chinese or English** (`两数之和`, `climbing stairs`) and pick from the results → the plugin fetches the statement and code, writes the `{id}. {题名}.md`（如 `1. 两数之和.md`） note from your template, and opens it. Existing notes are re-opened directly with background refresh when the cache is stale. Public problems can be fetched without logging in.
3. **题目浏览器（浏览建题）**：点左侧栏 ribbon 图标（或命令面板 → `打开题目浏览器`）打开侧边栏视图。首次打开自动分页同步全量题库（带进度条，约一分钟；缓存 24 小时），之后离线可浏览。顶部搜索框支持题号 / 中英文题名 / slug；`简单/中等/困难` 与 `已解决/尝试过/未开始` 快捷筛选；漏斗按钮打开高级筛选（标签、通过率、题号区间、会员题，规则可组合，跨重启持久化）；点任意题目即建笔记或打开已有笔记。未登录时 AC 状态不可见（全部显示为未开始），登录后点刷新按钮即可。
   / **Browse problems**: open the sidebar via the ribbon icon (or command palette → `打开题目浏览器`). The first open syncs the full problemset with a progress bar (~1 min, cached 24h), then it's browsable offline. Search by id / Chinese or English title / slug; quick chips for difficulty and status; the funnel button opens advanced compound filtering (topics, acceptance, id ranges, premium — persisted across restarts); clicking any problem creates or reveals its note. Logged out, AC status is hidden (everything shows as not started) — log in and hit refresh.
4. **题解工作流**：在抓取生成的笔记中——
   - 直接运行 `刷新题解` 按范围刷新已有锚点；
   - 或写一行 `题解链接: https://leetcode.cn/problems/.../solutions/.../` 再运行 `吸收题解标记`；
   - 或运行 `输入题解 URL` 弹窗粘贴链接。
   / **Solution workflow**: in a fetched note — run `刷新题解` to refresh by scope; or write a `题解链接: <URL>` line and run `吸收题解标记`; or run `输入题解 URL` and paste a link.
5. **粘贴清洗**：从 leetcode.cn 网页复制内容后，选中粘贴结果运行 `Paste sanitize`，公式、代码、图片链接会被整理成干净的 Obsidian Markdown。
   / **Paste sanitize**: after pasting content from the leetcode.cn website, select it and run `Paste sanitize` — formulas, code, and image links are converted into clean Obsidian Markdown.

## 笔记格式 / Note Format

- 笔记位于可配置的题目文件夹（默认 `LeetCode/`），文件名 `{id}. {题名}.md`（如 `1. 两数之和.md`）
- 默认模板对齐刷题笔记的中文属性体系：`created` / `分类`（cn 官方中文标签自动填充，如 `数组、哈希表`）/ `难度`（简单/中等/困难）/ `分数` / `情况` / `时间复杂度` / `空间复杂度` / `备注` / `tags`（`leetcode` + 语言）；插件内部仅维护 `lc-slug` / `lc-language` / `lc-status` 三个字段（`lc-status` 不会从已做题回退），旧版本的 `lc-id` / `lc-url` 等身份字段在重新打开时自动清除；`tags` 与用户已有条目做并集，不会丢你的手动添加
- 正文：frontmatter 下方是 `链接：` 行（题目直达链接，无 H1——Obsidian 顶部本就显示文件名），之后依次为 `## 题面` → `## 代码` → `## 代码思路` → `## 题解` → `## 题解思路` → `## 遇到的错误`
- 回顾表等**每篇笔记的附加内容不硬编码在模板里**：设置 → 笔记 → `笔记尾部附加内容` 填入任意 Markdown（支持全部占位符），会渲染后追加到每篇新笔记末尾；例如一个 dataview 刷题回顾表（需安装 Dataview 插件）
- 内容区用 HTML 注释锚点包裹，插件按锚点精准刷新、不动锚点外的内容：

```
<!-- lc:problem slug="two-sum" -->
题面 Markdown…
<!-- /lc:problem -->

<!-- lc:code slug="two-sum" -->
```python3
class Solution: …
```
<!-- /lc:code -->

<!-- lc:solution slug="two-sum" source="url" url="https://…" -->
## 题解思路
…
## 题解
…code…
<!-- /lc:solution -->
```

- `leetcode.cn` — GraphQL API（`/graphql`）：抓取题目详情、题库列表（题目浏览器索引，分页拉取）、题名搜索、用户 AC 提交、社区题解文章、登录态校验。

- Notes live in the configurable problems folder (default `LeetCode/`) as `{id}. {题名}.md`（如 `1. 两数之和.md`）
- The default template follows a Chinese property vocabulary for practice notes: `created` / `分类` (auto-filled with official cn topic labels, e.g. `数组、哈希表`) / `难度` (简单/中等/困难) / `分数` / `情况` / `时间复杂度` / `空间复杂度` / `备注` / `tags` (`leetcode` + language). The plugin maintains only three internal keys — `lc-slug` / `lc-language` / `lc-status` (`lc-status` never regresses from solved); identity keys from older versions (`lc-id`, `lc-url`, …) are removed on re-open; `tags` is union-merged with your manual entries
- Body: a `链接：` line under the frontmatter (no H1 — Obsidian's inline title already shows the note name), then `## 题面` → `## 代码` → `## 代码思路` → `## 题解` → `## 题解思路` → `## 遇到的错误`
- Per-note extras (a review table, links) are **not hardcoded** into the template: Settings → Notes → `笔记尾部附加内容` accepts any Markdown (all placeholders supported) and is rendered onto the tail of every new note — e.g. a dataview review table (requires the Dataview plugin)
- The body uses HTML-comment anchors; the plugin refreshes inside anchors and never touches content outside them (structure as above)
- Solution anchor `source`: `url` (community solution link) / `ac` (your AC submission) / `official` (official editorial) / `starter` (the problem's starter code); multiple `lc:solution` anchors per problem (multi-solution) and multiple problems per note are both supported

## 设置 / Settings

设置界面为中文。设置 → LeetCode。/ The settings UI is in Chinese:

- **登录**：嵌入式浏览器登录、登出、手动粘贴 Cookie 兜底 / Embedded-browser login, logout, manual cookie fallback
- **站点**：leetcode.cn（中国站，默认）/ leetcode.com（国际站）/ Site selector
- **笔记**：题目笔记文件夹（默认 `LeetCode`，可自定义任意路径）、默认代码语言（默认 `Java`）、笔记尾部附加内容（自定义每篇笔记末尾的 Markdown 块，支持占位符）/ Problems folder (default `LeetCode`), default language (default `Java`), per-note footer block
- **图片**：下载图片到 vault 开关 + 图片文件夹（可自定义路径）/ Download-images toggle + image folder
- **自定义占位符**：自定义占位符，值模板可引用内置占位符（如 `{{my_id}}` = `lc-{{id}}`）/ Custom placeholders whose value templates may reference built-ins

**内置占位符 / Built-in placeholders：**
`{{slug}}` `{{title}}` `{{title_cn}}` `{{problem}}` `{{code}}` `{{solution}}` `{{solution_approach}}` `{{difficulty}}` `{{tags}}` `{{tags_cn}}` `{{id}}` `{{url}}` `{{solved_date}}` `{{language}}`

## 网络使用 / Network usage

本插件仅与以下主机通信 / This plugin communicates with the following hosts only：

- `leetcode.cn` — GraphQL API（`/graphql`）：抓取题目详情、题库列表（题目浏览器索引，分页拉取）、题名搜索、用户 AC 提交、社区题解文章、登录态校验。
- `pic.leetcode-cn.com` — 题面和题解中的图片 CDN（仅在 Settings → Images 开启"下载图片到 vault"时才下载，否则保留 CDN 链接）。
- `leetcode.cn/accounts/login/` — 嵌入式浏览器登录页（仅登录时使用）。

- `leetcode.cn` — GraphQL API (`/graphql`): problem details, the problemset list (browser index, paginated), title search, user AC submissions, community solution articles, login-state check.
- `pic.leetcode-cn.com` — image CDN for problem/solution images (only downloaded when Settings → Images → download is ON; otherwise CDN links are preserved).
- `leetcode.cn/accounts/login/` — embedded browser login page (login only).

所有 HTTP 流量通过 Obsidian 内建的 `requestUrl`，绕过 Electron CORS 限制。无遥测、无分析、无其他端点。

All HTTP traffic goes through Obsidian's built-in `requestUrl`, bypassing Electron CORS restrictions. No telemetry. No analytics. No other endpoints.

### 认证与隐私 / Authentication & privacy

认证通过 Obsidian 嵌入式 `BrowserWindow` 完成——登录后捕获 LC session cookie。Cookie 仅存储在本地 `.obsidian/plugins/leetcode-cn/data.json`，除 `leetcode.cn` 外不传输到任何地方，且永不记录到日志。

Authentication is handled via an embedded `BrowserWindow` that captures your LC session cookie after you sign in. The cookie is stored only in `.obsidian/plugins/leetcode-cn/data.json` on your local machine, is never transmitted anywhere except `leetcode.cn`, and is never logged.

## 故障排除 / Troubleshooting

- `LeetCode session expired. Please log in again via settings.` — session cookie 已失效。设置 → LeetCode → 重新登录。/ Your session cookie is no longer valid — log in again via Settings → LeetCode.
- `LeetCode is rate limiting us.` — LC 返回 429。插件会自动退避重试一次；连续遇到请等几秒再试。/ LC returned 429. The plugin auto-retries once with backoff; if you see it twice in a row, wait a few seconds.
- `Couldn't reach LeetCode.` — 无法连接 leetcode.cn（离线、DNS、防火墙）。网络故障不自动重试。/ Your machine cannot reach leetcode.cn (offline, DNS, firewall). Network failures are not auto-retried.
- `LeetCode is slow to respond.` — LC 超时未响应。稍后手动重试。/ LC timed out. Retry manually in a moment.
- 题解刷新无反应 — 检查笔记中锚点结构完整（开/闭标签成对、slug 正确），详见[笔记格式](#笔记格式--note-format)。/ Solution refresh does nothing — check that your anchors are well-formed (paired open/close tags, correct slug); see [Note format](#笔记格式--note-format).
- `同步题库失败，请稍后重试。` — 题目浏览器同步题库时网络或登录状态异常。稍后点浏览器右上角刷新按钮重试；匿名同步无需登录，失败通常是网络问题。/ The problem browser index sync failed (network or session issue). Hit the refresh button in the browser top bar; anonymous sync needs no login, so failures are usually network-related.
- 浏览器里已做的题显示为「未开始」— 未登录时 AC 状态不可见。设置 -> LeetCode 登录后，点浏览器右上角刷新按钮重新同步。/ Solved problems show as "not started" in the browser — AC status is hidden when logged out. Log in (Settings -> LeetCode), then hit the browser refresh button to re-sync.

## 发布流程 / Release process

维护者发布步骤 / Maintainer release steps：

1. 同步更新 `manifest.json` 的 `version` 与 `package.json`，并在 `versions.json` 添加 `"版本": "最低 Obsidian 版本"` 映射 / Bump `version` in `manifest.json` + `package.json` in lockstep, and add a `"version": "min-obsidian-version"` entry to `versions.json`.
2. 运行 `npm run ci` 确认全绿 / Run `npm run ci` and confirm it is green.
3. 创建 GitHub release，tag 必须与 `manifest.json` 的 `version` 完全一致 / Create a GitHub release; the tag **must** match `manifest.json`'s `version` exactly.
4. 上传 `main.js`、`manifest.json`、`styles.css` 作为 release assets / Attach `main.js`, `manifest.json`, and `styles.css` as release assets.
5. 向 [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases) 提交 PR 更新 `community-plugins.json` / Submit a PR to [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases) updating `community-plugins.json`:
   ```json
   {
     "id": "leetcode-cn",
     "name": "LeetCode CN",
     "author": "jjj-n",
     "description": "把 leetcode.cn 的题目、代码、题解抓取到 Obsidian 笔记中。Fetch leetcode.cn problems, code, and solutions into Obsidian notes.",
     "repo": "jjj-n/obsidian-leetcode-cn"
   }
   ```

## 开发 / Development

```bash
git clone https://github.com/jjj-n/obsidian-leetcode-cn
cd obsidian-leetcode-cn
npm install
npm run dev    # esbuild watch → main.js
npm test       # vitest
npm run ci     # lint + test + build + bundle-size（提交前必须全绿 / must be green before committing）
```

本地调试：把 `main.js`、`manifest.json`、`styles.css` 拷入 `<vault>/.obsidian/plugins/leetcode-cn/` 后重载插件。/ For local testing, copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/leetcode-cn/` and reload the plugin.

### 体积门禁 / Bundle size gate

生产构建 `main.js` 由 CI 门禁（`scripts/check-bundle-size.mjs`）：硬上限 1.8 MB，1.76 MB 起警告；当前约 146 KB。/ The production `main.js` is gated by CI: hard ceiling 1.8 MB, warning at 1.76 MB; currently ~146 KB.

## License

[MIT](LICENSE)

## Contributing

Issues 与 PR 欢迎：[github.com/jjj-n/obsidian-leetcode-cn](https://github.com/jjj-n/obsidian-leetcode-cn)
