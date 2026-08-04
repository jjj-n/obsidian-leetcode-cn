# 03 — 自定义占位符（Settings 注册）

**What to build:** 用户在 Settings 中注册自己的占位符，占位符的值模板可引用内建占位符（例如注册 `{{my_id}} = "lc-{{id}}"`，或注册 `{{difficulty_emoji}}` 按 `{{difficulty}}` 映射为 `🟢/🟡/🔴`）。注册完成后，用户的自定义模板中可以直接使用 `{{my_id}}`、`{{difficulty_emoji}}` 等占位符，渲染时按用户定义的值模板展开。占位符命名遵守内建规则（英文、snake_case），与 12 个内建占位符共存、不冲突。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Settings UI 提供"自定义占位符"列表，支持增、删、改
- [ ] 每个自定义占位符包含：名称（英文 snake_case，不可与内建占位符重名）、值模板（字符串，可引用内建占位符）
- [ ] 模板渲染时，自定义占位符先展开其值模板（递归替换引用到的内建占位符），再代入用户模板
- [ ] 自定义占位符之间不允许互相引用（避免循环依赖），检测到循环时拒绝保存并提示用户
- [ ] 自定义占位符数据持久化到 plugin settings，重装/升级后保留
- [ ] 渲染 golden 测试：注册 `{{my_id}} = "lc-{{id}}"`，模板中包含 `{{my_id}}`，渲染结果含 `lc-123` 形式的字符串
