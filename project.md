# Personal OS Project Board

This is the only file you need to read for project management.

## North Star
- Build a personal daily information OS that captures, plans, and reviews with AI.
- Maximize leverage: less micromanagement, more clear context and outcomes.

## Working Rules
- Context, not control: define goals, constraints, and success criteria; avoid low-level micromanagement.
- Plan-first delivery: before implementing any feature, produce a plan and review with you.
- Implement only after plan approval.
- Keep high signal communication: what changed, why, and what is next.

## Plan Mode (Mandatory Before Coding)
For each feature, we follow this flow:
1. Problem and objective
2. Scope and non-goals
3. Design and tradeoffs
4. Task breakdown
5. Risks and test strategy
6. Review with user
7. Implement after approval

## Current Product Direction (Agreed)
- Launch stack:
  1. Browser extension (primary ingestion)
  2. iOS Shortcuts (mobile ingestion)
  3. WeChat (push + lightweight input only)
  4. Web (organize/search/review)
- Backend: Python (FastAPI)
- Push channel: WeChat Official Account template messages
- Data posture: local-first, cloud-migratable later

## Current Status
- Worktree path: `/home/aiops/zhaojx/projects/personal-os-worktree`
- Active branch: `feature/personal-os-bootstrap-v2`
- Old temporary worktree: removed
- Next step: review Feature Plan v0.1 below; implement only after explicit approval

## Feature Plan v0.1: Backend Bootstrap (Review Required)
### 1) Problem and Objective
- Problem: no executable backend yet for ingestion, daily plan/review generation, and WeChat push.
- Objective: deliver a runnable FastAPI backend skeleton with stable contracts so extension/iOS/Web can integrate immediately.

### 2) Scope (In)
- Project skeleton under `personal-os/backend/`.
- FastAPI app with health check and versioned API router.
- Minimal data layer with SQLModel + SQLite (local-first baseline).
- Initial tables:
  - `events`
  - `daily_plan`
  - `daily_review`
  - `push_logs`
- Core endpoints:
  - `POST /api/v1/ingest/browser`
  - `POST /api/v1/ingest/mobile`
  - `GET /api/v1/today`
  - `POST /api/v1/jobs/generate-plan`
  - `POST /api/v1/jobs/generate-review`
  - `POST /api/v1/push/wechat/daily`
- Service stubs:
  - LLM service interface (mock implementation first)
  - WeChat OA push client interface (mock implementation first)
- Basic tests for API contracts and persistence.

### 3) Non-Goals (Out)
- No full auth system in v0.1 (single-user local token only).
- No production-grade async queue yet (use synchronous service calls first).
- No full WeChat production push verification in v0.1 (mock + contract test only).
- No browser extension/iOS/web UI implementation in this feature.

### 4) Design and Tradeoffs
- FastAPI + SQLModel chosen for speed and AI ecosystem compatibility.
- SQLite first for fast bootstrap and portability; keep repository pattern to migrate to Postgres later.
- External integrations wrapped by adapter interfaces to avoid lock-in and simplify testing.

### 5) Task Breakdown
1. Bootstrap Python project, dependency config, and app entrypoint.
2. Add config management (`.env`), logging, and settings model.
3. Implement SQLModel entities and DB session helpers.
4. Implement API schemas + routes for ingestion/today/jobs/push.
5. Implement service layer for summary generation and push orchestration.
6. Add unit tests and API integration tests.
7. Add run/test instructions to README.

### 6) Risks and Mitigation
- Risk: schema changes break clients early.
  - Mitigation: freeze v1 request/response models and test contract snapshots.
- Risk: WeChat API constraints delay integration.
  - Mitigation: keep push adapter mockable; validate with dry-run mode first.
- Risk: LLM output instability.
  - Mitigation: strict output schema + fallback deterministic templates.

### 7) Test Strategy
- Unit tests for services and validators.
- API tests for all v0.1 endpoints.
- DB tests for CRUD and day aggregation logic.
- Smoke run: `uvicorn` startup + sample ingestion + today aggregation.

### 8) Exit Criteria
- All v0.1 endpoints callable locally.
- Tests pass in CI-style local run.
- `project.md` updated with implementation summary and next plan.

### 9) Approval Gate
- Status: `WAITING_FOR_APPROVAL`
- Implementation starts only after user confirms: `批准计划，开始实现 v0.1`.

## Decision Log
- 2026-02-15: Use Python/FastAPI backend for AI-heavy workflow.
- 2026-02-15: WeChat used for push and light input, not heavy bot in V1.
- 2026-02-15: Enforce plan-review-implement workflow.
