from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter
from sqlmodel import select

from app.api.deps import SessionDep
from app.db.models import DailyPlan, DailyReview, Event
from app.schemas.ingest import EventResponse
from app.schemas.jobs import DailyPlanPayload, DailyReviewPayload
from app.schemas.today import TodayResponse, TodayStats
from app.services.serialization import load_json

router = APIRouter()


def _serialize_plan(plan: DailyPlan | None) -> DailyPlanPayload | None:
  if not plan:
    return None
  return DailyPlanPayload(
    date=plan.plan_date,
    top_goals=load_json(plan.top_goals_json, []),
    focus_blocks=load_json(plan.focus_blocks_json, []),
    risks=load_json(plan.risks_json, []),
    summary=plan.summary,
  )


def _serialize_review(review: DailyReview | None) -> DailyReviewPayload | None:
  if not review:
    return None
  return DailyReviewPayload(
    date=review.review_date,
    outcomes=load_json(review.outcomes_json, []),
    unfinished=load_json(review.unfinished_json, []),
    cognition_delta=load_json(review.cognition_delta_json, []),
    tomorrow_first_step=review.tomorrow_first_step,
    summary=review.summary,
  )


@router.get('/today', response_model=TodayResponse)
def get_today(session: SessionDep, target_date: date | None = None) -> TodayResponse:
  day = target_date or datetime.now(timezone.utc).date()
  events = session.exec(select(Event).where(Event.event_day == day).order_by(Event.created_at)).all()

  by_source: dict[str, int] = {}
  response_events: list[EventResponse] = []
  for event in events:
    by_source[event.source] = by_source.get(event.source, 0) + 1
    response_events.append(
      EventResponse(
        id=event.id,
        source=event.source,
        event_type=event.event_type,
        title=event.title,
        content=event.content,
        url=event.url,
        metadata=load_json(event.metadata_json, {}),
        event_day=event.event_day,
        created_at=event.created_at,
      )
    )

  plan = session.exec(select(DailyPlan).where(DailyPlan.plan_date == day)).first()
  review = session.exec(select(DailyReview).where(DailyReview.review_date == day)).first()

  return TodayResponse(
    date=day,
    events=response_events,
    stats=TodayStats(total_events=len(events), by_source=by_source),
    daily_plan=_serialize_plan(plan),
    daily_review=_serialize_review(review),
  )
