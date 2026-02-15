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
- Next step: draft Feature Plan v0.1 for backend bootstrap and wait for approval

## Decision Log
- 2026-02-15: Use Python/FastAPI backend for AI-heavy workflow.
- 2026-02-15: WeChat used for push and light input, not heavy bot in V1.
- 2026-02-15: Enforce plan-review-implement workflow.
