# 10 — Refresh 细粒度命令

**What to build:** 命令面板提供"刷新题解"命令，运行后弹出一个选择范围的 modal，让用户三选一：(1) 只刷新当前光标所在的单个 `<!-- lc:solution -->` 锚点；(2) 刷新当前题（按光标所在位置的 slug 匹配）的所有锚点（problem / code / 所有 solution / 所有 solution_approach）；(3) 刷新整篇笔记的所有锚点。选择后 plugin 按锚点参数精准匹配目标，重新从 leetcode.cn 拉取最新内容并仅替换匹配锚点内部内容，锚点外的用户内容、其他锚点的内容都保持不变。刷新过程中遇到网络失败时保留原内容并 Notice 提示，不会把锚点清空。

**Blocked by:** 07 — 多解法锚点（一题多 solution）, 09 — 题解选择 UX：笔记 marker 吸收 + 命令 modal

**Status:** ready-for-agent

- [ ] 命令面板出现"刷新题解 / Refresh solution(s)"命令，运行后弹出范围选择 modal（单锚点 / 单题全部 / 整篇笔记）
- [ ] 单锚点模式：按光标所在位置定位最近的 `<!-- lc:TYPE -->` 锚点，仅重新抓取并替换该锚点内部内容
- [ ] 单题全部模式：按光标所在位置的 slug 匹配该题的所有锚点（problem / code / 所有 solution / solution_approach），分别重新抓取并替换
- [ ] 整篇笔记模式：遍历笔记中所有 `<!-- lc:TYPE -->` 锚点，按各自参数分别重新抓取并替换
- [ ] 任何模式下，锚点外的用户内容都保持不变；非目标锚点的内容也保持不变
- [ ] 网络失败时保留该锚点的原内容，Notice 提示失败原因，不抛错、不清空
