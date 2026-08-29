# CLAUDE.md — LeetCode CN for Obsidian

面向 AI 编码助手的项目上下文；人类读者请看 [README.md](README.md)。修改本文件时保持内容与代码事实一致——错误的上下文比没有更糟。

## 项目概述

- Obsidian 社区插件（TypeScript），fork 自 `LikeSundayLikeRain/obsidian-leetcode`（MIT，保留致谢），扩展支持 **leetcode.cn**。
- **Workflow A（纯笔记本模式）**：用户在 leetcode.cn 网站写题提交，插件把题面、AC 提交代码、社区题解抓取成 Obsidian 笔记。**不做** Run/Submit、内嵌编辑器 widget、AI、竞赛——上游这些模块已删除，AI 与竞赛为 v2 远期方向，不承诺。
- 产品定位：先自用，按 Obsidian 社区商店审核标准打磨，择机上架。
- 仅桌面端（`isDesktopOnly: true`，嵌入式 BrowserWindow 需要 Electron）。

## 技术栈

| 技术 | 用途 | 备注 |
|---|---|---|
| TypeScript 5.8（strict） | 语言 | `tsc -noEmit` 在 build 中强制 |
| `obsidian`（npm，latest） | 类型 + 运行时 API | esbuild external |
| esbuild | 打包 CJS `main.js` | `obsidian` 与 `@codemirror/*` 保持 external |
| `@leetnotion/leetcode-api` 3.0.0 | LC API 封装 | 通过 fetcher shim 接 `requestUrl`（见下） |
| `turndown` + `turndown-plugin-gfm` | LC HTML → Markdown | LC 内容禁止走 `innerHTML`（XSS + 审核红线） |
| vitest 4 | 单元测试 | 纯逻辑层；Obsidian 生命周期无法离线测试 |

**HTTP 铁律**：对 leetcode.cn 的所有请求只走 Obsidian 内建 `requestUrl`（绕过 Electron CORS；`fetch`/`axios` 在插件渲染进程会被 CORS 拦截）。`npm run check:lc-isolation`（两个脚本）在 CI 强制 `src/api/` 内不得出现 `fetch`。

## 架构

入口 `src/main.ts` 按 8 步装配：SettingsStore 加载 → `installRequestUrlFetcher()`（**必须**在 LeetCodeClient 构造前，否则 Credential.init 的预热请求直接打 cross-fetch 而 CORS 失败）→ LeetCodeClient + `reauthenticate()` → AuthService → ProblemListService → NoteWriter → SettingsTab → 注册命令。

| 模块 | 职责 |
|---|---|
| `src/api/` | `LeetCodeClient`（@leetnotion 封装）+ 三个 cn 适配器（题面 `LeetCodeCNAdapter` / 题解 `LeetCodeCNSolutionAdapter` / AC 提交 `LeetCodeCNSubmissionAdapter`）+ `requestUrlFetcher`（fetcher shim + 节流）+ `throttle`（429 退避重试、超时） |
| `src/auth/` | `AuthService`（嵌入式 BrowserWindow 登录、`loginManual` 手动 cookie、登出清 cookie 分区）+ `BrowserWindowLogin` |
| `src/browse/` | 题目浏览器：`ProblemBrowserView`（侧边栏 ItemView，ribbon 图标 + `打开题目浏览器` 命令；搜索框、难度/状态快捷 chips、`FilterModal` 高级筛选、slice+滚动加载列表、底部计数/索引时间/未登录提示；决策逻辑全部在导出的纯函数里）、`ProblemListService`（全量索引分页拉取、24h TTL、region 标记、单飞）、`QuickProblemSearchModal`（已实现未接命令，保留）、`FilterModal` |
| `src/notes/` | 核心管道。`NoteWriter`（公开方法：`openProblem` / `addProblemToNote` / `forceRefresh` / `refreshSolution` / `refreshSingleAnchor` / `refreshProblemAnchors` / `refreshAllNoteAnchors`）、`NoteTemplate`（`{id}. {题名}.md` 文件名（含非法字符清洗与旧命名 lc-slug 兜底扫描）、frontmatter 写入器、正文骨架）、`TemplateEngine`（14 个内置占位符 + 自定义占位符引用展开）、`htmlToMarkdown`（turndown 管道，确定性输出有 snapshot 测试）、`AnchorParser`/`AnchorRewriter`（锚点解析与重写）、`SolutionMarker`（`题解链接:` 标记吸收）、`ImageDownloader`、`PasteSanitizer`、`BaseFile`、`HeadingRegion` |
| `src/settings/` | `SettingsStore`（`data.json` 唯一读写入口，全字段 sanitize 守卫）+ `SettingsTab`（中文界面：登录/站点/笔记/图片/自定义占位符） |
| `src/ui/` | `FetchProblemModal`（核心入口 + `parseProblemSlug` / `classifyFetchInput` 输入路由：URL/slug 直取，中文题名、含空格关键词、纯数字走 `searchCNProblems` 服务端搜索 → `ProblemSearchResultModal` 选择）、`SolutionUrlModal` / `RefreshScopeModal`（回调类型统一 `void | Promise<void>`） |
| `src/shared/` | `logger`（cookie 脱敏，禁止打印 LEETCODE_SESSION）、`errors`、`timers` |

**锚点系统**：内容区用成对 HTML 注释包裹——`lc:problem` / `lc:code` / `lc:solution` / `lc:solution_approach`；题解 `source` 取值 `url` / `ac` / `official` / `starter`。插件只改锚点内部，锚点外内容永不触碰。支持多题一笔记与一题多解法。

**笔记数据**：默认模板（`TemplateEngine.DEFAULT_TEMPLATE`）对齐用户的中文刷题笔记体系——frontmatter 用 `created` / `分类`（cn `topicTags.translatedName` 自动填充）/ `难度` / `分数` / `情况` / `时间复杂度` / `空间复杂度` / `备注` / `tags`（`leetcode` + 语言，默认语言 `java`），正文以 `链接：` 行开头（**无 H1**——Obsidian 顶部已显示文件名），无硬编码回顾表；每篇笔记末尾的附加内容由用户设置 `noteFooter`（`笔记尾部附加内容`，占位符渲染）决定，默认空。插件每次覆写的只有 `lc-slug` / `lc-language` / `lc-status`（`lc-status` 不从非 untouched 回退）；`lc-id` / `lc-title` / `lc-difficulty` / `lc-url` / `lc-region` 为已退役键，`applyFrontmatter` 重写时删除（旧笔记迁移）；不再写 `aliases`；`tags` 与用户已有条目并集。题面详情缓存于 `data.json`，TTL 7 天（`NoteWriter.CACHE_TTL_MS`），过期后台刷新，离线可读。

**当前命令**（8 条）：`open-problem-browser`（打开题目浏览器侧边栏视图——ribbon 图标同入口；首次打开自动同步全量题库索引，缓存 24 小时）、`fetch-problem`（核心入口：`FetchProblemModal` 按 `classifyFetchInput` 路由——URL/slug 直取，中文/英文题名、纯数字走 cn `problemsetQuestionList` 的 `searchKeywords` 服务端搜索后弹 `ProblemSearchResultModal` 选择 → `NoteWriter.openProblem`；匿名可抓公开题目，付费题与题解需登录）、`login`、`logout`、`paste-sanitize`、`absorb-solution-markers`、`input-solution-url`、`refresh-solutions`。`parseProblemSlug` / `classifyFetchInput`（`src/ui/FetchProblemModal.ts`）是输入解析的唯一实现，有单测覆盖。

## 硬性约定

- **所有 vault 写入只走 `vault.process`**（单一变更原语；`scripts/grep-no-vault-modify.sh` 辅助检查）。frontmatter 用 `app.fileManager.processFrontMatter`，且数组并集必须在回调内手动做（API 不自动并集）。
- 对 LC 的 HTTP 只走 `requestUrl`；新增 API 代码放进 `src/api/` 并过 `check:lc-isolation`。
- `NoteWriter` 依赖注入用结构类型（`NoteWriterClient` / `NoteWriterSettings`），不 import 具体类——测试因此能纯 mock。
- 类型纪律：`no-explicit-any` 零容忍（当前 lint 全绿）。测试 mock 沿用 `as never` 惯例；mock 对象放 `tests/helpers/`（`obsidian-stub` mock 整个 `obsidian` 模块、`mock-vault`、`mock-leetcode-client`）。
- UI 文案规范由 `eslint-plugin-obsidianmd` 强制：英文 sentence case、命令名不含插件名。已有定向豁免：URL 占位符的 sentence-case（大写主机名会使 URL 失效）。
- 提交信息格式：`type(scope): 中文描述`；**每次改动后 `npm run ci`（lint + test + build + bundle-size）全绿再提交**。
- 构建产物 `main.js` 由 CI 门禁：硬上限 1.8 MB、1.76 MB 起警告，当前约 137 KB。

## Obsidian 商店审核红线（上架前逐条自查）

- `manifest.json` 字段完整；`README` 说明用途与网络使用；`LICENSE` 存在
- release 的 tag 必须等于 `manifest.json` 的 `version`；`main.js` + `manifest.json` + `styles.css` 作为 assets；向 `obsidian-releases` 提 `community-plugins.json` PR
- 无遥测/分析；无 `eval` / `new Function` / 远程代码加载；LC HTML 一律 turndown 转 Markdown，禁止 `innerHTML` 渲染用户数据；UI 用 `createEl` 等 DOM API
- 插件 id 不含 "obsidian"；无默认快捷键；Electron/BrowserWindow 使用要求 `isDesktopOnly: true`（已设）
- 事件监听走 `registerEvent` / `registerInterval`；定时器可清理；`this.app` 而非全局 `app`；不碰已废弃的 `workspace.activeLeaf`

## 测试

- vitest，460 个用例；`npm test` 约 15s
- `tests/fixtures/`：真实 LC 题面 HTML 样本（two-sum、median、valid-number、regex）+ GraphQL 响应样本
- `htmlToMarkdown` 有确定性 snapshot 测试——改动转换管道时先跑 `tests/htmlToMarkdown-snapshots.test.ts` 看差异再决定是否更新快照
- 已知测试日志噪音：`cache-ttl.test.ts` 会故意打印 `getRegion is not a function` 被吞掉的 TypeError——那是 mock 缺方法以验证"后台刷新失败静默"的预期行为，不是 bug

## 已知技术债（按清理优先级）

（无——styles.css 已于 2026-08 瘦身完成：86 KB → 18 KB，按类名与 `src/` 引用交叉比对删除全部 widget/AI/contest 时代死样式，仅保留题目浏览器、筛选弹窗、快速搜索、设置面板四个作用域。）

已清偿：~~SettingsStore 孤儿字段~~（2026-08 完成：`indentSizeOverride`、`showRelativeLineNumbers`、`autoMigrateOnOpen`、`widgetSyncDebounceMs`、`autoBacklinksEnabled`、`techniquesFolderOverride`、`previewClickBehavior`、`activeAIProvider`、`providerConfigs`、`aiCostLedger`、`autoAIReviewOnAC`、`contestSession`、`autoAIContestAnalysis`、`contestIndex`、`autoAIKnowledgeGraph`、`featureFlags`、`legacyBaseNoticeShown` 及全部守卫/getter/伴生测试已删；策略为**读取容忍、写出丢弃**——老 data.json 里的这些键在 load 时被忽略，下次 persist 自然消失。同批清理了 LeetCodeClient 的 contest/AI 死方法与 logger 的 Bedrock 脱敏规则）
