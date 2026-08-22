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
- 抓取题面：HTML → Obsidian Markdown，数学公式、上下标、代码块、图片格式全部保留
- 抓取你的 AC 提交代码（无提交时回退到题目 starter code）
- 抓取社区题解文章，自动拆分为代码（`## 题解`）与思路（`## 题解思路`）
- 笔记模板 + 13 个内置占位符（`{{problem}}` / `{{code}}` / `{{solution}}` 等）+ 自定义占位符（可引用内置占位符）
- 支持全部 8 种 LC 语言（Python、Java、C++、C、JavaScript、TypeScript、Go、Rust）
- 多题一笔记（锚点系统）+ 一题多解法（多个 `lc:solution` 锚点）
- 可选图片下载到 vault，笔记完全离线可读
- 题面缓存 7 天，过期后台自动刷新

- Log in to leetcode.cn (embedded browser session capture + manual cookie paste fallback)
- Fetch problem statements: HTML → Obsidian Markdown with math/sup/sub/code/images preserved
- Fetch your AC submission code (falls back to the problem's starter code)
- Fetch community solution articles, auto-split into code (`## 题解`) and approach (`## 题解思路`)
- Configurable note template + 13 built-in placeholders (`{{problem}}` / `{{code}}` / `{{solution}}`, etc.) + custom placeholders that can reference built-ins
- All 8 LC languages (Python, Java, C++, C, JavaScript, TypeScript, Go, Rust)
- Multi-problem-per-note (anchor system) + multi-solution-per-problem (multiple `lc:solution` anchors)
- Optional image download into the vault; notes fully readable offline
- 7-day problem-content cache with background refresh

## 当前状态与 Roadmap / Current Status & Roadmap

**当前可用命令（命令面板搜索 "LeetCode"）：**

| 命令 / Command | 作用 / What it does |
|---|---|
| `Fetch problem` | **核心入口**：粘贴题目 URL 或输入 slug → 生成完整笔记（题面 + 代码 + 空题解锚点）；笔记已存在则直接打开并按需后台刷新 / **Core entry**: paste a problem URL or type a slug → a full note is created (statement + code + empty solution anchors); existing notes are re-opened with background refresh |
| `Log in` | 嵌入式浏览器登录 leetcode.cn / Sign in via embedded browser |
| `Log out` | 登出并清除本地 cookie / Sign out and clear local cookies |
| `Paste sanitize: clean and convert HTML to markdown` | 清洗选区/全文中的 LC 网页粘贴，转成干净 Markdown / Clean LC web paste-ins into Markdown |
| `吸收题解标记` | 把笔记中的 `题解链接: <URL>` 行吸收进最近的空题解锚点并抓取 / Absorb `solution link: <URL>` lines into the nearest empty solution anchor and fetch |
| `输入题解 URL` | 弹窗输入题解 URL，写入首个空锚点并抓取 / Prompt for a solution URL, fill the first empty anchor and fetch |
| `刷新题解` | 三种范围刷新：单锚点 / 当前题全部 / 整篇笔记 / Refresh by scope: single anchor / current problem / whole note |

**Roadmap（按优先级 / in priority order）：**

1. **题目浏览器**：搜索 + 难度/标签筛选 + 点选建题的浏览界面（`QuickProblemSearchModal` / `FilterModal` 已实现并有测试，待接线与交互打磨）。
2. **上架准备**：补充截图、发布 GitHub release、向 `obsidianmd/obsidian-releases` 提交社区商店 PR。

v2 远期方向（暂不承诺）：AI 题解审查、竞赛支持。

**Current state:** the seven commands above are available today, including the `Fetch problem` core entry. The problem browser UI and store submission are next on the roadmap. v2 directions (not promised): AI review, contest support.

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
2. **抓题建笔记（核心闭环）**：命令面板 → `Fetch problem` → 粘贴题目链接（如 `https://leetcode.cn/problems/two-sum/`，任意子路径都可以）或直接输入 slug（如 `two-sum`）→ 插件抓取题面与代码，按模板生成 `{id}-{slug}.md` 笔记并打开。笔记已存在时直接打开，缓存过期会后台刷新。无需登录即可抓取公开题目。
   / **Fetch a problem (core loop)**: command palette → `Fetch problem` → paste a problem URL (any subpath works) or type a slug → the plugin fetches the statement and code, writes the `{id}-{slug}.md` note from your template, and opens it. Existing notes are re-opened directly with background refresh when the cache is stale. Public problems can be fetched without logging in.
3. **题解工作流**：在抓取生成的笔记中——
   - 直接运行 `刷新题解` 按范围刷新已有锚点；
   - 或写一行 `题解链接: https://leetcode.cn/problems/.../solutions/.../` 再运行 `吸收题解标记`；
   - 或运行 `输入题解 URL` 弹窗粘贴链接。
   / **Solution workflow**: in a fetched note — run `刷新题解` to refresh by scope; or write a `题解链接: <URL>` line and run `吸收题解标记`; or run `输入题解 URL` and paste a link.
4. **粘贴清洗**：从 leetcode.cn 网页复制内容后，选中粘贴结果运行 `Paste sanitize`，公式、代码、图片链接会被整理成干净的 Obsidian Markdown。
   / **Paste sanitize**: after pasting content from the leetcode.cn website, select it and run `Paste sanitize` — formulas, code, and image links are converted into clean Obsidian Markdown.

## 笔记格式 / Note Format

- 笔记位于可配置的题目文件夹（默认 `LeetCode/`），文件名 `{id}-{slug}.md`
- frontmatter：`lc-slug` / `lc-id` / `lc-title` / `lc-difficulty` / `lc-url` / `lc-language` / `lc-status` 由插件维护（每次覆写；`lc-status` 不会从已做题回退），`aliases` 与 `tags` 与用户已有条目做并集，不会丢你的手动添加
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

- 题解锚点 `source` 支持 `url`（社区题解链接）/ `ac`（你的 AC 提交）/ `official`（官方题解）/ `starter`（题目初始代码）；同一题可以有多个 `lc:solution` 锚点（多解法），一篇笔记可以包含多道题（多题一笔记）

- Notes live in the configurable problems folder (default `LeetCode/`) as `{id}-{slug}.md`
- Frontmatter: `lc-slug` / `lc-id` / `lc-title` / `lc-difficulty` / `lc-url` / `lc-language` / `lc-status` are plugin-maintained (overwritten each pass; `lc-status` never regresses from solved), while `aliases` and `tags` are union-merged with your manual entries
- The body uses HTML-comment anchors; the plugin refreshes inside anchors and never touches content outside them (structure as above)
- Solution anchor `source`: `url` (community solution link) / `ac` (your AC submission) / `official` (official editorial) / `starter` (the problem's starter code); multiple `lc:solution` anchors per problem (multi-solution) and multiple problems per note are both supported

## 设置 / Settings

设置 → LeetCode。/ Settings → LeetCode:

- **Authentication**：登录、登出、手动粘贴 cookie 兜底 / Log in, log out, manual cookie paste fallback
- **Notes**：题目笔记文件夹（默认 `LeetCode`）、默认语言（默认 `python3`）/ Problems folder (default `LeetCode`), default language (default `python3`)
- **Images**：下载图片到 vault 开关 + 图片文件夹 / Download-images toggle + image folder
- **Custom placeholders**：自定义占位符，值模板可引用内置占位符（如 `{{my_id}}` = `lc-{{id}}`）/ Custom placeholders whose value templates may reference built-ins (e.g. `{{my_id}}` = `lc-{{id}}`)

> 面板中另有 `AI coach`、`Knowledge graph` 两个分区和 Notes 下的 `Click behavior` 选项——它们是已移除功能（AI 审查、Accepted 反链、题目预览）的残留界面，当前不产生任何作用，将在后续版本清理。
>
> The panel also shows `AI coach` and `Knowledge graph` sections plus a `Click behavior` option under Notes — remnants of removed features (AI review, Accepted backlinks, problem preview) with no effect today; they will be removed in a future release.

**内置占位符 / Built-in placeholders：**
`{{slug}}` `{{title}}` `{{title_cn}}` `{{problem}}` `{{code}}` `{{solution}}` `{{solution_approach}}` `{{difficulty}}` `{{tags}}` `{{id}}` `{{url}}` `{{solved_date}}` `{{language}}`

## 网络使用 / Network usage

本插件仅与以下主机通信 / This plugin communicates with the following hosts only：

- `leetcode.cn` — GraphQL API（`/graphql`）：抓取题目详情、用户 AC 提交、社区题解文章、官方题解。
- `leetcode.cn` — REST API：用户认证、题目标签索引。
- `pic.leetcode-cn.com` — 题面和题解中的图片 CDN（仅在 Settings → Images 开启"下载图片到 vault"时才下载，否则保留 CDN 链接）。
- `leetcode.cn/accounts/login/` — 嵌入式浏览器登录页（仅登录时使用）。

- `leetcode.cn` — GraphQL API (`/graphql`): problem details, user AC submissions, community solution articles, official editorial.
- `leetcode.cn` — REST API: user authentication, problem tag index.
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

生产构建 `main.js` 由 CI 门禁（`scripts/check-bundle-size.mjs`）：硬上限 1.8 MB，1.76 MB 起警告；当前约 137 KB。/ The production `main.js` is gated by CI: hard ceiling 1.8 MB, warning at 1.76 MB; currently ~137 KB.

## License

[MIT](LICENSE)

## Contributing

Issues 与 PR 欢迎：[github.com/jjj-n/obsidian-leetcode-cn](https://github.com/jjj-n/obsidian-leetcode-cn)
