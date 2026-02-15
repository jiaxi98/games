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

### [2026-02-15] heredoc 批量写文件导致文档内容被命令污染
- 问题：尝试用单条 `bash heredoc` 批量生成多文件时，`README.md` 中示例片段被 shell 误执行，文档被污染。
- 解决：放弃该方式，改用 `apply_patch` 分批逐文件写入，确保内容和命令严格隔离。
- 预防：复杂/长内容优先用 `apply_patch`，避免在同一 shell 脚本里混合大量 heredoc 与命令。
- Commit：`8d644ce23260a69d0e7dc6acf65251b9ef94b1e3`

### [2026-02-15] 私有 pip 镜像缺包导致依赖安装失败
- 问题：默认索引缺少 `fastapi/sqlmodel` 以及构建依赖 `setuptools`，导致 `pip install` 失败。
- 解决：改用官方索引 `-i https://pypi.org/simple` 安装所需依赖，并保留可复现命令。
- 预防：后续在安装步骤中显式声明索引源；为 CI 准备可用镜像或锁定依赖缓存。
- Commit：`8d644ce23260a69d0e7dc6acf65251b9ef94b1e3`

### [2026-02-15] pytest 被全局插件污染
- 问题：直接运行 `pytest` 时自动加载全局插件（dvc），因缺少 `colorama` 导致启动失败。
- 解决：测试命令统一改为 `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest`。
- 预防：在项目测试说明中固定该环境变量，避免受宿主机全局插件影响。
- Commit：`8d644ce23260a69d0e7dc6acf65251b9ef94b1e3`

### [2026-02-15] Pydantic 解析 `date | None` 失败
- 问题：`GenerateDailyRequest` 中字段名也叫 `date`，类型注解写成 `date | None` 导致 Pydantic 解析冲突。
- 解决：将日期类型别名为 `dt_date`，避免命名遮蔽后通过测试。
- 预防：当字段名与类型同名时，统一使用类型别名，避免运行期注解求值冲突。
- Commit：`8d644ce23260a69d0e7dc6acf65251b9ef94b1e3`

### [2026-02-15] git push 受 SSH 环境影响失败
- 问题：推送到 GitHub 时连续出现 `Host key verification failed`，并且默认用户主目录解析到不存在的 `/home/sailor/.ssh`，导致无法写入 known_hosts。
- 解决：显式指定 SSH 参数执行推送：`-i /home/aiops/zhaojx/.ssh/id_rsa` 与 `-o UserKnownHostsFile=/home/aiops/zhaojx/.ssh/known_hosts`，成功完成 `git push -u origin feature/personal-os-bootstrap-v2`。
- 预防：在该环境中执行 git over ssh 时统一使用 `GIT_SSH_COMMAND` 显式指定私钥与 known_hosts 路径，避免依赖默认 home 解析。
- Commit：`58186eaf925d7255a7a7760205df3241c8085eff`

### [2026-02-15] v0.3 文本清洗首版遗漏行首尾空格
- 问题：`clean_text` 初版只压缩连续空格，未处理每一行的行首/行尾空白，导致多行文本清洗后出现 `第一行 `、` 第二行` 这种残留。
- 解决：将清洗流程改为“按行归一化 + 行级 strip + 空行折叠”，并补充测试 `test_ingest_cleans_text_and_event_type` 覆盖该场景。
- 预防：后续所有文本规范化逻辑都必须有“多行 + 混合空白字符（空格/Tab/空行）”测试样例后再合并。
- Commit：`32a77efb84ffbaf4cbda7b7f21266da6f6fc648a`

### [2026-02-15] 仅保留 jobs 入口导致“早晚交互”语义不足
- 问题：原有 `jobs/generate-plan` 与 `jobs/generate-review` 偏通用任务，无法直接承载“晨间 must_win、晚间 key_outcome/blocker”这类双时段交互语义。
- 解决：新增 `rituals` 接口层（morning/evening/today），并在后处理阶段注入用户输入，同时复用既有 `daily_plan/daily_review` 存储。
- 预防：后续新增交互模式优先先定义“场景语义接口”，避免把所有能力都堆到通用 `jobs` 路径里。
- Commit：`8bfc6db6bd48645f1f76fe00bb91c63ea46f8eab`
