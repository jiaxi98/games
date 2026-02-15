from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter
from sqlmodel import select

from app.api.deps import LLMServiceDep, SessionDep
from app.db.models import DailyPlan, DailyReview, Event
from app.schemas.rituals import (
  EveningRitualRequest,
  EveningRitualResponse,
  MorningRitualRequest,
  MorningRitualResponse,
  RitualsTodayResponse,
)
from app.services.rituals import (
  apply_evening_input,
  apply_morning_input,
  build_plan_payload,
  build_review_payload,
)
from app.services.serialization import dump_json

router = APIRouter()


def _resolve_day(target_date: date | None) -> date:
  return target_date or datetime.now(timezone.utc).date()


@router.post('/rituals/morning', response_model=MorningRitualResponse)
def morning_ritual(
  payload: MorningRitualRequest,
  session: SessionDep,
  llm_service: LLMServiceDep,
) -> MorningRitualResponse:
  day = _resolve_day(payload.date)
  events = session.exec(select(Event).where(Event.event_day == day).order_by(Event.created_at)).all()

  existing = session.exec(select(DailyPlan).where(DailyPlan.plan_date == day)).first()
  if existing and not payload.overwrite:
    return MorningRitualResponse(
      plan=build_plan_payload(existing),
      source_event_count=len(events),
      generated_by=existing.generated_by,
    )

  plan_payload = llm_service.generate_plan(day, events)
  plan_payload = apply_morning_input(plan_payload, payload.must_win)
  record = existing if existing else DailyPlan(plan_date=day)
  record.top_goals_json = dump_json(plan_payload.top_goals)
  record.focus_blocks_json = dump_json(plan_payload.focus_blocks)
  record.risks_json = dump_json(plan_payload.risks)
  record.summary = plan_payload.summary
  record.generated_by = llm_service.model_name

  session.add(record)
  session.commit()

  return MorningRitualResponse(
    plan=plan_payload,
    source_event_count=len(events),
    generated_by=llm_service.model_name,
  )


@router.post('/rituals/evening', response_model=EveningRitualResponse)
def evening_ritual(
  payload: EveningRitualRequest,
  session: SessionDep,
  llm_service: LLMServiceDep,
) -> EveningRitualResponse:
  day = _resolve_day(payload.date)
  events = session.exec(select(Event).where(Event.event_day == day).order_by(Event.created_at)).all()

  existing = session.exec(select(DailyReview).where(DailyReview.review_date == day)).first()
  if existing and not payload.overwrite:
    return EveningRitualResponse(
      review=build_review_payload(existing),
      source_event_count=len(events),
      generated_by=existing.generated_by,
    )

  review_payload = llm_service.generate_review(day, events)
  review_payload = apply_evening_input(
    review_payload,
    key_outcome=payload.key_outcome,
    biggest_blocker=payload.biggest_blocker,
  )
  record = existing if existing else DailyReview(review_date=day)
  record.outcomes_json = dump_json(review_payload.outcomes)
  record.unfinished_json = dump_json(review_payload.unfinished)
  record.cognition_delta_json = dump_json(review_payload.cognition_delta)
  record.tomorrow_first_step = review_payload.tomorrow_first_step
  record.summary = review_payload.summary
  record.generated_by = llm_service.model_name

  session.add(record)
  session.commit()

  return EveningRitualResponse(
    review=review_payload,
    source_event_count=len(events),
    generated_by=llm_service.model_name,
  )


@router.get('/rituals/today', response_model=RitualsTodayResponse)
def get_rituals_today(session: SessionDep, target_date: date | None = None) -> RitualsTodayResponse:
  day = _resolve_day(target_date)
  morning = session.exec(select(DailyPlan).where(DailyPlan.plan_date == day)).first()
  evening = session.exec(select(DailyReview).where(DailyReview.review_date == day)).first()

  return RitualsTodayResponse(
    date=day,
    morning=build_plan_payload(morning) if morning else None,
    evening=build_review_payload(evening) if evening else None,
    morning_generated_by=morning.generated_by if morning else None,
    evening_generated_by=evening.generated_by if evening else None,
  )
