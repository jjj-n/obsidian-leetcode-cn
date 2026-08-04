# 11 — Store 合规收尾

**What to build:** 让插件满足 Obsidian 社区商店的所有提交流程要求，使维护者可以走完"GitHub release → PR to obsidianmd/obsidian-releases → 商店上架"的完整流程。涵盖：`manifest.json` 的 `description` 字段双语并列（中 + 英，≤250 字符，以 `.` 结尾）；`README.md` 双语定稿（中文在前完整叙述、英文在后给 reviewer 摘要）；`versions.json` 记录 Obsidian 兼容版本映射；`Network Usage` 章节明确列出 leetcode.cn 域名与用途；release 流程文档化（tag 必须匹配 manifest version、`main.js` + `manifest.json` 作为 assets 上传）；最终人工走一遍 submission checklist 确认无遗漏。

**Blocked by:** 01 — 最小可演示 cn 笔记流水线 (tracer bullet), 02 — 图片本地化（opt-in 下载）, 03 — 自定义占位符（Settings 注册）, 04 — Paste-Sanitize 独立命令, 05 — 清理遗留 v1.3 widget 代码 + 单 region 实例化, 06 — 社区题解 HTML 走 htmlToMarkdown + 拆分 code/approach, 07 — 多解法锚点（一题多 solution）, 08 — 多题一笔记（lc-slugs 数组 + slug= 参数）, 09 — 题解选择 UX：笔记 marker 吸收 + 命令 modal, 10 — Refresh 细粒度命令

**Status:** ready-for-agent

- [ ] `manifest.json`：id `leetcode-cn`、name `LeetCode CN`、description 双语 ≤250 chars 以 `.` 结尾、`isDesktopOnly: true`、`minAppVersion` 与实际 API 兼容
- [ ] `README.md`：中文在前（功能、安装、使用、Network Usage、致谢），英文摘要在后（供 reviewer 快速核对）
- [ ] `versions.json` 存在并记录 plugin version → min Obsidian appVersion 映射
- [ ] `README` 中 `Network Usage` 章节明确列出 leetcode.cn 相关域名（`leetcode.cn`、`pic.leetcode-cn.com` 等）及各自用途
- [ ] Release 流程文档化：维护者 README 段落 / CONTRIBUTING 段落说明 tag 命名、assets 上传、PR 到 obsidianmd/obsidian-releases 的字段要求
- [ ] 人工过一遍 Obsidian plugin review checklist（无 telemetry、无 eval/innerHTML、无默认快捷键、LICENSE 保留上游版权、无 `obsidian` 字样在 id 中等），确认无遗漏
