from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlmodel import select

from app.api.deps import LLMServiceDep, SessionDep
from app.db.models import DailyPlan, DailyReview, Event
from app.schemas.jobs import (
  DailyPlanPayload,
  DailyReviewPayload,
  GenerateDailyRequest,
  GeneratePlanResponse,
  GenerateReviewResponse,
)
from app.services.serialization import dump_json, load_json

router = APIRouter()


def _build_plan_payload(record: DailyPlan) -> DailyPlanPayload:
  return DailyPlanPayload(
    date=record.plan_date,
    top_goals=load_json(record.top_goals_json, []),
    focus_blocks=load_json(record.focus_blocks_json, []),
    risks=load_json(record.risks_json, []),
    summary=record.summary,
  )


def _build_review_payload(record: DailyReview) -> DailyReviewPayload:
  return DailyReviewPayload(
    date=record.review_date,
    outcomes=load_json(record.outcomes_json, []),
    unfinished=load_json(record.unfinished_json, []),
    cognition_delta=load_json(record.cognition_delta_json, []),
    tomorrow_first_step=record.tomorrow_first_step,
    summary=record.summary,
  )


@router.post('/jobs/generate-plan', response_model=GeneratePlanResponse)
def generate_plan(
  payload: GenerateDailyRequest,
  session: SessionDep,
  llm_service: LLMServiceDep,
) -> GeneratePlanResponse:
  day = payload.date or datetime.now(timezone.utc).date()
  events = session.exec(select(Event).where(Event.event_day == day).order_by(Event.created_at)).all()

  existing = session.exec(select(DailyPlan).where(DailyPlan.plan_date == day)).first()
  if existing and not payload.overwrite:
    return GeneratePlanResponse(
      plan=_build_plan_payload(existing),
      source_event_count=len(events),
      generated_by=existing.generated_by,
    )

  plan_payload = llm_service.generate_plan(day, events)
  record = existing if existing else DailyPlan(plan_date=day)
  record.top_goals_json = dump_json(plan_payload.top_goals)
  record.focus_blocks_json = dump_json(plan_payload.focus_blocks)
  record.risks_json = dump_json(plan_payload.risks)
  record.summary = plan_payload.summary
  record.generated_by = llm_service.model_name

  session.add(record)
  session.commit()

  return GeneratePlanResponse(
    plan=plan_payload,
    source_event_count=len(events),
    generated_by=llm_service.model_name,
  )


@router.post('/jobs/generate-review', response_model=GenerateReviewResponse)
def generate_review(
  payload: GenerateDailyRequest,
  session: SessionDep,
  llm_service: LLMServiceDep,
) -> GenerateReviewResponse:
  day = payload.date or datetime.now(timezone.utc).date()
  events = session.exec(select(Event).where(Event.event_day == day).order_by(Event.created_at)).all()

  existing = session.exec(select(DailyReview).where(DailyReview.review_date == day)).first()
  if existing and not payload.overwrite:
    return GenerateReviewResponse(
      review=_build_review_payload(existing),
      source_event_count=len(events),
      generated_by=existing.generated_by,
    )

  review_payload = llm_service.generate_review(day, events)
  record = existing if existing else DailyReview(review_date=day)
  record.outcomes_json = dump_json(review_payload.outcomes)
  record.unfinished_json = dump_json(review_payload.unfinished)
  record.cognition_delta_json = dump_json(review_payload.cognition_delta)
  record.tomorrow_first_step = review_payload.tomorrow_first_step
  record.summary = review_payload.summary
  record.generated_by = llm_service.model_name

  session.add(record)
  session.commit()

  return GenerateReviewResponse(
    review=review_payload,
    source_event_count=len(events),
    generated_by=llm_service.model_name,
  )
