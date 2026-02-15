# Personal OS 项目看板

这是项目管理唯一需要查看的文件。

## 北极星目标
- 构建一个个人日常信息 OS：自动采集、AI 规划、日终复盘。
- 最大化杠杆：减少微管理，强化上下文与目标清晰度。

## 工作原则
- Context, not control：明确目标、约束与验收标准，不做低层次微管理。
- 计划先行：每个功能开发前必须先给出计划并与你评审。
- 未获批准不实现：只有计划被明确批准后才开始编码。
- 高信噪比同步：每次只汇报关键变化、原因和下一步。

## Plan Mode（编码前强制）
每个功能遵循以下流程：
1. 问题与目标
2. 范围与非目标
3. 方案与取舍
4. 任务拆解
5. 风险与测试策略
6. 与你评审
7. 评审通过后实现

## 当前已确认产品方向
- 首发组合：
  1. 浏览器扩展（主采集）
  2. iOS 快捷指令（移动补采）
  3. 微信（只做推送触达 + 轻输入）
  4. Web（整理/检索/复盘）
- 后端技术：Python（FastAPI）
- 推送渠道：微信公众号模板消息
- 数据策略：本地优先，后续可迁移上云

## 当前状态
- Worktree 路径：`/home/aiops/zhaojx/projects/personal-os-worktree`
- 当前分支：`feature/personal-os-bootstrap-v2`
- v0.1 状态：已按批准计划完成实现并通过本地测试（9/9）
- v0.2 状态：已按批准计划完成实现并通过本地测试（15/15）
- v0.3 状态：已按批准计划完成实现并通过本地测试（19/19）
- v0.4 状态：已按批准计划完成实现并通过本地测试（23/23）
- 下一步：进入 v0.5 计划评审（双时段自动触发与失败重试）

## 功能计划 v0.4：双时段交互闭环（已实施）
### 1）问题与目标
- 问题：你明确不需要每日事件列表 Web，核心只关心每天早晚两次高价值交互。
- 目标：将“晨间计划 + 晚间复盘”固化为独立 rituals 接口，最小化交互面。

### 2）范围（包含）
- 新增接口：
  - `POST /api/v1/rituals/morning`
  - `POST /api/v1/rituals/evening`
  - `GET /api/v1/rituals/today`
- 晨间输入增强：
  - 支持 `must_win`，写入计划首要目标并注入总结。
- 晚间输入增强：
  - 支持 `key_outcome` 与 `biggest_blocker`，注入复盘结果与未完成项。
- 数据存储：
  - 复用 `daily_plan` 与 `daily_review` 两张表，不新增表。

### 3）非目标（不包含）
- 不做事件日志 Web 界面。
- 不做公众号 real 推送改造（保持 mock 可用）。
- 不做多轮聊天会话管理。

### 4）方案与取舍
- 保留原 `jobs` 接口兼容性，新增 `rituals` 语义层：
  - `jobs` 继续作为通用生成入口。
  - `rituals` 专注早晚固定场景，减少调用歧义。
- 输入增强采用“后处理注入”：
  - 不改动底层 LLM 接口，先保证结构稳定与快速交付。

### 5）任务拆解
1. 定义 rituals 请求/响应 schema。
2. 新增 rituals endpoint 并接入路由。
3. 实现 morning/evening 输入注入逻辑。
4. 新增 rituals API 测试与回归测试。
5. 更新 `project.md` 与 `PROGRESS.md`。

### 6）风险与应对
- 风险：新旧接口语义重叠导致调用方混乱。
  - 应对：文档明确 `rituals` 为首选交互接口，`jobs` 保留兼容。
- 风险：用户输入覆盖默认生成内容，导致质量波动。
  - 应对：输入仅注入关键字段，不替换整段结构。

### 7）测试策略
- 新增 `tests/test_rituals_api.py`：
  - 晨间 `must_win` 注入生效。
  - 晚间 `key_outcome` 与 `biggest_blocker` 注入生效。
  - `rituals/today` 在未生成前返回 `None`。
  - `overwrite=False` 保持已有晨间结果不被覆盖。

### 8）完成标准（Exit Criteria）
- 晨间/晚间接口可用，支持补充输入。
- `rituals/today` 返回当天双时段结果。
- 所有后端测试通过。

### 9）审批闸门
- 当前状态：`APPROVED_AND_COMPLETED`
- 执行口令：你已回复 `approved`，随后开始实现并完成。

## v0.4 实施结果
- 新增 schema：`personal-os/backend/app/schemas/rituals.py`
- 新增服务：`personal-os/backend/app/services/rituals.py`
- 新增路由：`personal-os/backend/app/api/v1/endpoints/rituals.py`
- 路由注册：`personal-os/backend/app/api/v1/router.py`
- 新增测试：`personal-os/backend/tests/test_rituals_api.py`
- 测试结果：
  - 命令：`cd personal-os/backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest`
  - 结果：`23 passed`

## 功能计划 v0.3：采集质量增强（已实施）
### 1）问题与目标
- 问题：浏览器重复点击会产生重复事件；URL 噪音参数过多；来源标签不统一；文本存在空白噪音。
- 目标：保证采集结果“少噪音、可聚合、可复盘”。

### 2）范围（包含）
- 后端 ingest 预处理：
  - URL 归一化（去 fragment、去跟踪参数、排序 query、统一 host/scheme）。
  - 10 分钟时间窗去重（同来源 + 同页面 URL）。
  - 来源标签标准化（`wechat/xhs/x/web/mobile`）。
  - 文本清洗（标题/正文空白归一化、event_type 归一化）。
- 测试覆盖：
  - 去重命中与去重失效（超窗口）分支。
  - URL 与来源标签标准化。
  - 文本清洗行为。

### 3）非目标（不包含）
- 不做全文正文抽取（Readability/爬虫级）。
- 不做历史数据回填清洗。
- 不做多维语义去重（embedding 近似重复）。

### 4）方案与取舍
- 去重策略采用“规则优先”而非语义模型：
  - 同来源 + 归一化 URL + 10 分钟窗口，优先稳定与可解释性。
- 来源标签写入 `metadata.source_tag`：
  - 不改变 `source=browser/mobile` 既有契约，避免破坏当前统计。

### 5）任务拆解
1. 新增 ingest 预处理模块（normalize/clean/infer）。
2. 接入 ingest 接口写入前流程（预处理 + 去重判断）。
3. 补充 API 测试覆盖 v0.3 新行为。
4. 更新 `project.md` 与 `PROGRESS.md`。

### 6）风险与应对
- 风险：文本清洗过度导致内容失真。
  - 应对：只做空白标准化，不改写语义文本。
- 风险：去重误杀不同内容同 URL。
  - 应对：先限定 10 分钟窗口，后续再加可配置策略。

### 7）测试策略
- `tests/test_ingest_api.py` 新增 v0.3 场景测试：
  - 同页 10 分钟内重复采集仅 1 条。
  - 超过 10 分钟可再次入库。
  - 微信域名识别为 `source_tag=wechat`。
  - 文本清洗与 event_type 标准化。

### 8）完成标准（Exit Criteria）
- 同 URL 在 10 分钟内重复采集不新增事件。
- `/api/v1/today` 返回稳定，统计无回归。
- 测试总数提升并全部通过。

### 9）审批闸门
- 当前状态：`APPROVED_AND_COMPLETED`
- 执行口令：你已回复“好，开始v0.3吧，从plan开始然后实现”，随后开始实现并完成。

## v0.3 实施结果
- 新增模块：`personal-os/backend/app/services/ingest_processing.py`
  - `normalize_url`
  - `clean_text`
  - `infer_source_tag`
  - `find_recent_duplicate`
- 接入接口：`personal-os/backend/app/api/v1/endpoints/ingest.py`
  - 写入前执行预处理与去重判断。
- 测试结果：
  - 命令：`cd personal-os/backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest`
  - 结果：`19 passed`

## 功能计划 v0.2：真实触达 + 主采集入口（已实施）
### 1）问题与目标
- 问题：v0.1 虽可跑通闭环，但微信推送仍是 mock，浏览器采集端还未落地，离真实日用还差两段。
- 目标：打通“真实微信触达 + 浏览器首发采集”，让你可以每天实际使用。

### 2）范围（包含）
- 后端：
  - 新增 `RealWeChatClient`，支持公众号 `access_token` 获取/缓存、模板消息发送。
  - 新增推送模式开关：`mock` / `real` / `dry-run`。
  - 为采集接口增加简单鉴权（`X-INGEST-TOKEN`）。
  - 增加 CORS 配置，允许浏览器扩展请求。
- 浏览器扩展（Chrome MV3，首版）：
  - 弹窗按钮：一键采集当前页面（title/url/选中文本摘要）。
  - 右键菜单：选中文本后发送到 `POST /api/v1/ingest/browser`。
  - 配置页：后端地址、采集 token、是否自动采集（开关）。
  - 自动采集（可关闭）：页面加载后仅上报元数据（title/url）。
- 文档与验收：
  - 更新运行文档（后端 + 扩展安装 + 微信配置）。
  - 增加最小验收脚本与手工验收步骤。

### 3）非目标（不包含）
- 不做小程序/公众号聊天 Bot。
- 不做 iOS 快捷指令增强（留到 v0.3）。
- 不做多用户系统和复杂权限模型。
- 不做全量浏览历史回填（仅当前页/选中文本/可选自动元数据上报）。

### 4）方案与取舍
- 微信推送：
  - 保留 mock 通道，真实通道可按配置切换，降低调试风险。
  - `access_token` 先内存缓存，后续再迁 Redis。
- 扩展采集：
  - 先做“轻采集”而不是复杂内容抽取，优先稳定和速度。
  - 自动采集默认关闭，避免噪音和隐私误采。

### 5）任务拆解
1. 定义 v0.2 配置项（微信 real 模式参数、ingest token、CORS）。
2. 实现 `RealWeChatClient` 与推送模式路由。
3. 为 ingest 接口增加 token 校验中间件/依赖。
4. 新建 `personal-os/extension`（MV3）并实现 popup、background、options。
5. 接入 `/api/v1/ingest/browser`，完成手动采集链路。
6. 实现可开关自动元数据采集。
7. 增加测试：后端鉴权、推送模式分支、扩展最小端到端自测。
8. 更新 `project.md`、`PROGRESS.md`、`README`。

### 6）风险与应对
- 风险：公众号模板消息配置复杂（模板 ID、openid、白名单、域名）。
  - 应对：先跑最小真实发送链路，再补字段映射和容错。
- 风险：扩展自动采集噪音过高。
  - 应对：默认关闭自动采集，只保留手动入口为主。
- 风险：接口暴露导致被误调用。
  - 应对：强制 token 校验 + CORS 限制 + 可选 IP 限制。

### 7）测试策略
- 后端单元测试：
  - token 校验通过/失败
  - push 模式（mock/real/dry-run）分支
- 后端集成测试：
  - 扩展请求头鉴权 + 入库验证
- 手工验收：
  - 浏览器扩展点按钮采集 -> `/today` 可见
  - 微信真实发送一条模板消息到你的账号

### 8）完成标准（Exit Criteria）
- 你能在浏览器中一键采集当前页并在 `GET /api/v1/today` 看到记录。
- 你的公众号可真实发送每日摘要模板消息（至少 1 次成功）。
- `project.md` 与 `PROGRESS.md` 完整更新，测试通过。

### 9）审批闸门
- 当前状态：`APPROVED_AND_COMPLETED`
- 执行口令：你已回复 `approved`，随后开始实现并完成。

## v0.2 实施结果
- 后端：
  - 新增采集鉴权：`X-INGEST-TOKEN`
  - 新增 CORS 配置项：`PERSONAL_OS_CORS_ALLOW_ORIGINS`
  - 新增微信推送模式：
    - `mock`
    - `real`
    - `dry_run`（请求级）
  - 新增 `RealWeChatClient`（公众号 `access_token` 获取与模板消息发送）
- 浏览器扩展（`personal-os/extension`）：
  - Popup：一键采集当前页面
  - Context Menu：采集选中文本
  - Options：后端地址 / token / 自动采集开关
  - 自动采集：可开关的页面元数据上报
- 测试结果：
  - 命令：`cd personal-os/backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest`
  - 结果：`15 passed`

## 功能计划 v0.1：后端 Bootstrap（已实施）
### 1）问题与目标
- 问题：目前还没有可运行后端，无法承接采集、晨晚生成和微信推送流程。
- 目标：交付一个可运行的 FastAPI 骨架，并冻结首版接口契约，让扩展/iOS/Web 可并行接入。

### 2）范围（包含）
- 在 `personal-os/backend/` 下创建后端项目骨架。
- FastAPI 应用、健康检查、版本化路由。
- 最小数据层：SQLModel + SQLite（本地优先基线）。
- 初始数据表：
  - `events`
  - `daily_plan`
  - `daily_review`
  - `push_logs`
- 核心接口：
  - `POST /api/v1/ingest/browser`
  - `POST /api/v1/ingest/mobile`
  - `GET /api/v1/today`
  - `POST /api/v1/jobs/generate-plan`
  - `POST /api/v1/jobs/generate-review`
  - `POST /api/v1/push/wechat/daily`
- 服务桩：
  - LLM 服务接口（先用 mock）
  - 微信公众号推送客户端接口（先用 mock）
- 提供基础测试：接口契约 + 持久化行为。

### 3）非目标（不包含）
- 不实现完整鉴权系统（v0.1 仅单用户本地 token）。
- 不引入生产级异步队列（先同步调用）。
- 不做完整微信生产推送联调（v0.1 仅 mock + 契约验证）。
- 不实现浏览器扩展/iOS/Web 前端页面。

### 4）方案与取舍
- 选择 FastAPI + SQLModel：开发速度快，AI 生态匹配高。
- 先用 SQLite：落地快、可移植；通过仓储层隔离，后续迁移 Postgres。
- 外部集成统一走 adapter：降低耦合，便于测试和替换。

### 5）任务拆解
1. 初始化 Python 项目与依赖，完成应用入口。
2. 加入配置管理（`.env`）、日志与 settings。
3. 实现 SQLModel 实体和数据库会话管理。
4. 实现采集/today/jobs/push 的 API schema 与路由。
5. 实现服务层：摘要生成与推送编排。
6. 增加单元测试与接口集成测试。
7. 更新 README：启动、测试、调试说明。

### 6）风险与应对
- 风险：早期 schema 频繁变化导致客户端反复改。
  - 应对：冻结 v1 请求/响应模型，增加契约测试。
- 风险：微信接口约束影响进度。
  - 应对：推送 adapter 支持 dry-run，先打通可测链路。
- 风险：LLM 输出不稳定。
  - 应对：强约束输出结构 + 确定性 fallback 模板。

### 7）测试策略
- 服务层与校验逻辑单元测试。
- 所有 v0.1 接口 API 测试。
- 数据库 CRUD 与按日聚合测试。
- 启动冒烟：`uvicorn` 启动 + 样例采集 + today 聚合验证。

### 8）完成标准（Exit Criteria）
- v0.1 全部接口本地可调用。
- 本地 CI 风格测试通过。
- `project.md` 更新实现结果与下一阶段计划。

### 9）审批闸门
- 当前状态：`APPROVED_AND_COMPLETED`
- 执行口令：你已回复 `approved`，随后开始实现并完成。

## v0.1 实施结果
- 已新增目录：`personal-os/backend`
- 已完成模块：
  - FastAPI 应用入口、健康检查、版本路由
  - SQLModel + SQLite 数据层
  - 6 个核心接口（ingest/today/jobs/push）
  - Mock LLM 与 Mock 微信推送适配器
  - API 契约与持久化测试
- 测试结果：
  - 命令：`cd personal-os/backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest`
  - 结果：`9 passed`
- 产出文档：
  - `personal-os/backend/README.md`
  - `.env.example`

## 决策记录
- 2026-02-15：后端采用 Python/FastAPI，服务 AI 高交互场景。
- 2026-02-15：V1 微信仅做推送触达和轻输入，不做重型 Bot。
- 2026-02-15：强制执行“先计划评审，再实现”的交付流程。
