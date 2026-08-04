# 05 — 清理遗留 v1.3 widget 代码 + 单 region 实例化

**What to build:** 把 codebase 里所有遗留自上游 v1.3 widget/solve/ai/contest/preview 模型的死代码彻底清除，让 codebase 干净反映 cn-only + 纯笔记本的架构决策；同时把登录 client 的实例化从"双 region 都 new"改为"只 new 当前 region"，减少无用内存占用和潜在的状态错乱。清理后整个工程能干净编译、所有现存测试通过、无任何对已删除模块的 import / runtime 引用。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 删除所有遗留的 CodeMirror 6 内嵌 widget 编辑器相关源码（主/子编辑器通信、fence 插件、atomic range 保护等）
- [ ] NoteWriter 不再发射 `leetcode-solve` code fence 或任何 widget 专属标记；输出只使用 `<!-- lc:TYPE -->` 注释锚点模型
- [ ] SettingsTab 不再引用 widget registry / child editor 相关设置项
- [ ] `reauthenticate()` 仅实例化当前 region 对应的 client（`'cn'` → `CredentialCN + LeetCodeCN`；`'com'` 预留但不在 v1 主动 new）
- [ ] 全工程 `tsc` / `esbuild` 编译无错、`vitest` 全绿
- [ ] 无任何对已删除模块路径的 import（grep 验证）
