from __future__ import annotations

from app.db.models import DailyPlan, DailyReview
from app.schemas.jobs import DailyPlanPayload, DailyReviewPayload
from app.services.ingest_processing import clean_text
from app.services.serialization import load_json


def build_plan_payload(record: DailyPlan) -> DailyPlanPayload:
  return DailyPlanPayload(
    date=record.plan_date,
    top_goals=load_json(record.top_goals_json, []),
    focus_blocks=load_json(record.focus_blocks_json, []),
    risks=load_json(record.risks_json, []),
    summary=record.summary,
  )


def build_review_payload(record: DailyReview) -> DailyReviewPayload:
  return DailyReviewPayload(
    date=record.review_date,
    outcomes=load_json(record.outcomes_json, []),
    unfinished=load_json(record.unfinished_json, []),
    cognition_delta=load_json(record.cognition_delta_json, []),
    tomorrow_first_step=record.tomorrow_first_step,
    summary=record.summary,
  )


def apply_morning_input(plan: DailyPlanPayload, must_win: str | None) -> DailyPlanPayload:
  cleaned = clean_text(must_win)
  if not cleaned:
    return plan

  anchor_goal = f'必须拿下：{cleaned}'
  top_goals = [anchor_goal]
  for goal in plan.top_goals:
    if goal != anchor_goal:
      top_goals.append(goal)
    if len(top_goals) >= 3:
      break

  summary = plan.summary
  if cleaned not in summary:
    summary = f'{summary} 今日锚点：{cleaned}'

  return DailyPlanPayload(
    date=plan.date,
    top_goals=top_goals,
    focus_blocks=plan.focus_blocks,
    risks=plan.risks,
    summary=summary,
  )


def apply_evening_input(
  review: DailyReviewPayload,
  *,
  key_outcome: str | None,
  biggest_blocker: str | None,
) -> DailyReviewPayload:
  cleaned_outcome = clean_text(key_outcome)
  cleaned_blocker = clean_text(biggest_blocker)

  outcomes = list(review.outcomes)
  unfinished = list(review.unfinished)

  if cleaned_outcome:
    outcomes = [f'今日结果：{cleaned_outcome}', *outcomes]
  if cleaned_blocker:
    unfinished = [f'最大卡点：{cleaned_blocker}', *unfinished]

  summary = review.summary
  if cleaned_outcome and cleaned_outcome not in summary:
    summary = f'{summary} 今日最关键结果：{cleaned_outcome}'
  if cleaned_blocker and cleaned_blocker not in summary:
    summary = f'{summary} 最大卡点：{cleaned_blocker}'

  return DailyReviewPayload(
    date=review.date,
    outcomes=outcomes,
    unfinished=unfinished,
    cognition_delta=review.cognition_delta,
    tomorrow_first_step=review.tomorrow_first_step,
    summary=summary,
  )
