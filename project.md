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
- 下一步：进入 v0.2 计划评审（真实微信推送联调 + 浏览器扩展接入）

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
