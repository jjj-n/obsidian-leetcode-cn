# 01 — 最小可演示 cn 笔记流水线 (tracer bullet)

**What to build:** 端到端打通一道 cn 题的完整流水线——从 leetcode.cn 抓取题目详情（题面、难度、标签、starter code），通过模板引擎渲染为用户可配置的 Markdown，写入 vault 笔记文件，用户在 Obsidian 中打开即可看到干净的渲染结果：frontmatter 完整、`<!-- lc:problem -->` 与 `<!-- lc:code -->` 锚点正确闭合、题面里的数学公式 / 代码块 / 上下标 / 示例块都正确转换为 Obsidian 原生格式。用一道代表性题（例如含数学公式的 `powx-n` 或含示例块的题）做 golden 验证，作为后续 tickets 的可工作地基。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 给定一个 cn 题 slug，流水线产出一篇完整笔记文件，内容符合 `DEFAULT_TEMPLATE` 渲染结果
- [ ] Frontmatter 含 `lc-slug` / `lc-url` / `lc-region: cn` / `lc-language` / `difficulty` / `tags` 等字段，能被 Dataview 查询
- [ ] `<!-- lc:problem -->...<!-- /lc:problem -->` 与 `<!-- lc:code -->...<!-- /lc:code -->` 锚点完整闭合，中间内容分别承载题面与 starter code
- [ ] 题面中的 `$$...$$` 行内/块级数学、`<sup>/<sub>`、示例块、代码块在 Obsidian 渲染模式下正确显示
- [ ] 至少一道代表性 cn 题的 golden 测试通过（fixture 抓真实响应后固化）
- [ ] 网络不可达时优雅降级：使用缓存或 starter code，不阻塞笔记创建
