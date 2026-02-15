# PROGRESS

该文件用于沉淀问题、修复方案、预防策略与对应提交。

记录规则：每次遇到问题都必须记录
- 发生了什么问题
- 如何解决
- 如何避免再次发生
- 对应 git commit

## 记录模板
### [YYYY-MM-DD] 标题
- 问题：
- 解决：
- 预防：
- Commit：`<hash>`

## 问题记录

### [2026-02-15] worktree 跨设备移动失败
- 问题：尝试将 worktree 从 `/tmp/personal-os-worktree` 移动到 `/home/aiops/zhaojx/projects/personal-os-worktree` 时，报错 `Invalid cross-device link`。
- 解决：直接在目标路径新建 worktree，然后清理旧 worktree。
- 预防：跨文件系统场景不使用 `git worktree move`；改用“目标路径新建 + 验证后删除旧 worktree”流程。
- Commit：`8297235c8c6059a757ea94382ec35b55834e52a1`

### [2026-02-15] worktree 删除被本地改动阻塞
- 问题：执行 `git worktree remove /tmp/personal-os-worktree` 失败，原因是目录存在未提交或未跟踪文件。
- 解决：经你确认后使用 `git worktree remove --force` 清理。
- 预防：删除临时 worktree 前先检查 `git status`；只有在明确可丢弃时才使用 `--force`。
- Commit：`8297235c8c6059a757ea94382ec35b55834e52a1`
