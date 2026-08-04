# 02 — 图片本地化（opt-in 下载）

**What to build:** 用户在 Settings 中打开"下载图片"开关后，抓取题面或题解时，所有指向 leetcode.cn CDN 的图片 URL 都被下载到 vault 内的用户可配置文件夹（默认 `附件/leetcode`），笔记中的图片链接被改写为相对 vault 路径，使笔记在完全离线状态下也能正确显示图片。默认关闭；开启时仅下载 cn 域名的图片，其他来源保持原 URL 不动。图片文件名采用内容哈希去重，同一张图不会被重复下载。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Settings 新增 `downloadImages`（默认 false）与 `imageFolder`（默认 `附件/leetcode`）两个配置项
- [ ] 开关打开时，题面 / 题解中出现的所有 `pic.leetcode-cn.com`（或同族 CDN）图片 URL 被下载到 `imageFolder`，笔记内链接被改写为 vault 相对路径
- [ ] 开关关闭时，所有图片 URL 保持原样，不发起任何下载请求
- [ ] 同一 URL 已存在对应本地文件时跳过下载（幂等、去重）
- [ ] 下载失败（网络错误、404 等）时笔记中保留原 URL 并给用户一个 Notice 提示，不阻塞整体流程
- [ ] 离线场景验证：关闭网络后打开笔记，图片仍能正常渲染
