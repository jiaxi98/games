# Personal OS Backend

个人日常信息管理系统后端（FastAPI + SQLModel + SQLite）。

## 功能范围
- 事件采集接口（浏览器、iOS 快捷指令）
- 按天聚合查询（Today）
- 晨间计划生成（mock / 真实 LLM 可切换）
- 晚间复盘生成（mock / 真实 LLM 可切换）
- 微信公众号推送（mock 客户端）

## 本地启动
```bash
cd personal-os/backend
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
uvicorn app.main:app --reload
```

服务地址：`http://127.0.0.1:8000`

## 运行测试
```bash
cd personal-os/backend
source .venv/bin/activate
pytest
```

## 关键接口
- `POST /api/v1/ingest/browser`
- `POST /api/v1/ingest/mobile`
- `GET /api/v1/today`
- `POST /api/v1/jobs/generate-plan`
- `POST /api/v1/jobs/generate-review`
- `POST /api/v1/push/wechat/daily`

## 采集鉴权
- `POST /api/v1/ingest/browser`
- `POST /api/v1/ingest/mobile`

两个采集接口都要求请求头：
```http
X-INGEST-TOKEN: <PERSONAL_OS_INGEST_TOKEN>
```

## 微信推送模式
- `PERSONAL_OS_WECHAT_PUSH_MODE=mock`：默认 mock，不访问微信 API。
- `PERSONAL_OS_WECHAT_PUSH_MODE=real`：调用公众号真实模板消息接口。
- `POST /api/v1/push/wechat/daily` 的 `dry_run=true` 会强制演练，不真实发送。

## LLM 模式
- `PERSONAL_OS_LLM_MODE=mock`：默认模式，返回稳定模板结果。
- `PERSONAL_OS_LLM_MODE=openai_compatible`：调用 OpenAI 兼容接口。
- 真实模式必填：
  - `PERSONAL_OS_LLM_API_BASE`（例如 `https://api.openai.com/v1`）
  - `PERSONAL_OS_LLM_API_KEY`
  - `PERSONAL_OS_LLM_MODEL`

示例：
```bash
PERSONAL_OS_LLM_MODE=openai_compatible
PERSONAL_OS_LLM_API_BASE=https://api.openai.com/v1
PERSONAL_OS_LLM_API_KEY=sk-xxx
PERSONAL_OS_LLM_MODEL=gpt-4o-mini
```
