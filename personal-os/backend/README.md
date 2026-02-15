# Personal OS Backend

个人日常信息管理系统后端（FastAPI + SQLModel + SQLite）。

## 功能范围（v0.1）
- 事件采集接口（浏览器、iOS 快捷指令）
- 按天聚合查询（Today）
- 晨间计划生成（mock LLM）
- 晚间复盘生成（mock LLM）
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
