from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import SessionDep, WeChatClientDep
from app.core.config import get_settings
from app.db.models import DailyPlan, DailyReview, PushLog
from app.schemas.push import PushDailyRequest, PushDailyResponse
from app.services.serialization import load_json

router = APIRouter()


def _build_message_preview(plan: DailyPlan | None, review: DailyReview | None) -> str:
  lines: list[str] = ['Personal OS 每日摘要']
  if plan:
    goals = load_json(plan.top_goals_json, [])
    lines.append(f"计划目标: {'；'.join(goals[:3])}")
  if review:
    cognition = load_json(review.cognition_delta_json, [])
    lines.append(f"认知变化: {'；'.join(cognition[:2])}")
  return '\n'.join(lines)


@router.post('/push/wechat/daily', response_model=PushDailyResponse)
def push_wechat_daily(
  payload: PushDailyRequest,
  session: SessionDep,
  wechat_client: WeChatClientDep,
) -> PushDailyResponse:
  settings = get_settings()
  push_date = payload.date or datetime.now(timezone.utc).date()
  dry_run = payload.dry_run or settings.wechat_dry_run

  plan = session.exec(select(DailyPlan).where(DailyPlan.plan_date == push_date)).first()
  review = session.exec(select(DailyReview).where(DailyReview.review_date == push_date)).first()
  if not plan and not review:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail='no daily plan/review found for target date',
    )

  message_preview = _build_message_preview(plan, review)
  result = wechat_client.send_daily_summary(
    to_user=settings.wechat_to_user,
    template_id=settings.wechat_template_id,
    message_preview=message_preview,
    dry_run=dry_run,
  )

  log = PushLog(
    channel=result.channel,
    push_date=push_date,
    template_id=settings.wechat_template_id,
    status=result.status,
    message_preview=message_preview,
    error_message=result.error_message,
  )
  session.add(log)
  session.commit()
  session.refresh(log)

  return PushDailyResponse(
    push_date=push_date,
    status=result.status,
    channel=result.channel,
    message_preview=message_preview,
    log_id=log.id,
  )
