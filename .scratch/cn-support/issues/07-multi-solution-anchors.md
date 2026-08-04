# 07 — 多解法锚点（一题多 solution）

**What to build:** 同一道题可以在笔记中挂多个独立的题解锚点，每个锚点通过参数区分来源：`<!-- lc:solution slug=X source=Y url=Z index=N -->`，`source` 可取 `url`（社区题解 URL）、`ac`（用户自己 AC 提交）、`official`（官方题解）、`starter`（题目 starter，仅 `code` TYPE）。`index` 用于同一来源类型下的多个实例（例如用户的第 2 个 AC 提交）。锚点解析和写入都按参数严格匹配——刷新时只更新参数完全匹配的那个锚点，不碰其他锚点，也不碰用户在锚点外写的任何内容。

**Blocked by:** 06 — 社区题解 HTML 走 htmlToMarkdown + 拆分 code/approach

**Status:** ready-for-agent

- [ ] 锚点格式支持参数：`slug=` / `source=` / `url=` / `index=`，解析时对参数做 normalize（顺序无关、引号可选）
- [ ] 同一题在笔记中可存在多个 `<!-- lc:solution -->` 锚点，各自带不同的 `source+url` 或 `source+index` 组合
- [ ] 刷新时按参数精准匹配目标锚点，只更新该锚点内部内容，不动其他锚点
- [ ] 用户在锚点外部写的内容（例如"我的比较笔记"段落）永远不被刷新修改
- [ ] 锚点参数缺失时按默认规则补齐（例如单 solution 时 slug 可省，默认当前题）
- [ ] 单元测试覆盖：参数解析 normalize、多锚点共存、精准刷新匹配、外部内容不被动
