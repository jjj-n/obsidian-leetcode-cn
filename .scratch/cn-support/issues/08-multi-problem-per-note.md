# 08 — 多题一笔记（lc-slugs 数组 + slug= 参数）

**What to build:** 一篇笔记可以服务多道题目。Frontmatter 在单题情况下是 `lc-slug: X`，在多题情况下升级为 `lc-slugs: [X, Y, Z]`（两者互斥、plugin 自动维护）。笔记内的所有 `<!-- lc:TYPE -->` 锚点都带 `slug=` 参数标识属于哪一题；刷新时按 slug 精准匹配目标题的锚点组，不同题的锚点互不干扰。用户可以在一篇"同类题对比笔记"里放 3 道题，每道题各有自己的 problem / code / solution 锚点组，各自独立刷新。

**Blocked by:** 06 — 社区题解 HTML 走 htmlToMarkdown + 拆分 code/approach

**Status:** ready-for-agent

- [ ] Frontmatter 模型：单题用 `lc-slug`，多题用 `lc-slugs` 数组；两者互斥，新增第二题时 plugin 自动把 `lc-slug` 升级为 `lc-slugs`
- [ ] 所有 `<!-- lc:TYPE -->` 锚点支持 `slug=` 参数，解析时严格按 slug 区分归属
- [ ] 刷新命令可按 slug 选择刷新范围：只刷某一道题的所有锚点
- [ ] 不同题的锚点共存时，刷新一道题不影响另一道题的锚点内容
- [ ] 用户在锚点外写的内容（例如"对比分析"段落）永远不被修改
- [ ] 单元测试覆盖：`lc-slug` ↔ `lc-slugs` 升级、锚点 slug 参数解析、跨题刷新隔离
