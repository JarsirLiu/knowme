# 安全边界规则

SuperAgent 可以读写本地项目并执行 Shell，因此安全边界属于架构合同。

- 文件工具只能在当前 Project/workspace 根目录内工作；路径必须规范化并拒绝
  越界路径。
- 当前版本暂时不对工具调用执行审批；`run_command` 直接执行，但仍必须遵守工作区边界、超时、取消和输出长度限制。审批服务和持久化模型保留，待未来重新启用细粒度策略。
- Shell 应有超时、取消和输出长度限制；错误信息不能泄露 API key。
- `web_fetch` 只允许明确支持的 HTTP(S) 目标，并限制大小、超时和本机/内网访问。
- `packages/core` 的类型和 UI 展示不构成权限控制；权限必须在服务端和工具实现
  处执行。
- 设备的 endpoint、apiKey 等敏感信息不能在日志、Timeline 或模型上下文中明文
  暴露。
- Skill 文件只能写入 `workspace/.superagent/skills/` 目录，由 frontmatter 校验
  `name` 和 `description` 必填字段，`name` 不超过 64 字符，`description` 不超过 1024 字符，
  避免目录穿越或恶意覆盖。
- `install_skill` 工具只接受 HTTP(S) URL，下载后验证 JSON 结构再写入磁盘，防止
  任意文件写入。Skill 注入仅在用户消息中显式提及 `$skill-name` 时触发，不自动注入所有 skill。
- 修改工具权限时，必须补充权限边界测试，并更新 current 文档。
