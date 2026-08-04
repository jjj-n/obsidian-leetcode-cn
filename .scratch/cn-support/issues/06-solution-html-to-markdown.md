# 06 — 社区题解 HTML 走 htmlToMarkdown + 拆分 code/approach

**What to build:** 给定一个 leetcode.cn 社区题解 URL（或官方题解 slug），端到端抓取其内容，通过 htmlToMarkdown 把 HTML 转换为 Obsidian 兼容 Markdown，然后把内容拆分写入笔记的两个独立锚点：所有代码块（含从 playground iframe 解析出的代码）进入 `<!-- lc:solution -->` 区域；所有散文、数学公式、图片、列表等进入 `<!-- lc:solution_approach -->` 区域。拆分逻辑对官方题解（`question.solution{content}`）与社区题解（`solutionArticle`）都生效；当题解没有可识别代码块时，整篇内容落到 `solution_approach`、`solution` 区域留空并提示用户。

**Blocked by:** 01 — 最小可演示 cn 笔记流水线 (tracer bullet)

**Status:** ready-for-agent

- [ ] 给定社区题解 URL，能解析出文章 slug 并通过 cn GraphQL 拉到完整 HTML 内容
- [ ] 给定官方题解入口，能通过 `question.solution{content}` 拉到官方 editorial HTML
- [ ] HTML 内容经 htmlToMarkdown 转换后保留数学公式、代码块、图片、列表、表格
- [ ] Playground `<iframe>` 嵌入被解析为实际代码块（fetch playground 共享页提取代码）；失败时回退为保留原文链接并在 `solution` 区域留提示
- [ ] 转换后内容按"代码块 / playground 代码"vs"其余 prose"拆分，分别写入 `<!-- lc:solution -->` 与 `<!-- lc:solution_approach -->` 锚点
- [ ] 无代码块的题解整篇落到 `solution_approach`，`solution` 区域留空提示
- [ ] 代表性社区题解 + 官方题解各至少一个 golden 测试通过
