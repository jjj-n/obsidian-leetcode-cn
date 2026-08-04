# 04 — Paste-Sanitize 独立命令

**What to build:** 用户在 Obsidian 笔记中手动粘贴一段来自 leetcode.cn / 第三方站点的 HTML 原文（例如复制整篇网页题解），选中该区域后运行"清理粘贴内容"命令，插件将该段 HTML 清洗为干净的 Obsidian 兼容 Markdown 并替换选中区。清洗规则：剥离 `<script>`/`<iframe>`/`<style>` 等可执行或样式标签；提取 `<iframe src=".../playground/.../shared">` 中的代码块（如失败则保留原文链接）；把 `$$...$$` 与 `<span class="math">` 规范化为 Obsidian 数学语法；把 `<sup>`/`<sub>` 转为 Unicode 上下标或 Obsidian 标记；保留段落 / 列表 / 表格 / 代码块 / 链接 / 图片。作为 URL 抓取失败时的兜底入口，也可用于非 cn 源题解的清洗。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 命令面板出现"清理粘贴内容 / Sanitize pasted content"命令
- [ ] 命令作用在当前选中区（无选中则作用于全文），HTML 经清洗后替换为 Markdown
- [ ] `<script>`、`<iframe>`（非 playground 类）、`<style>`、`onclick` 等事件属性被完全剥离，无 XSS 残留
- [ ] Playground `<iframe>` 被尝试解析为代码块；解析失败时保留一个带原文链接的提示
- [ ] 数学公式（`$$...$$`、`<span class="math">`、MathJax 标记）统一转为 Obsidian `$...$` / `$$...$$` 形式
- [ ] 提供 snapshot 测试：覆盖含 script / iframe playground / 数学公式 / 上下标 / 表格 / 代码块的典型原文
