from __future__ import annotations

from datetime import date as dt_date

from pydantic import BaseModel


class GenerateDailyRequest(BaseModel):
  date: dt_date | None = None
  overwrite: bool = True


class DailyPlanPayload(BaseModel):
  date: dt_date
  top_goals: list[str]
  focus_blocks: list[str]
  risks: list[str]
  summary: str


class DailyReviewPayload(BaseModel):
  date: dt_date
  outcomes: list[str]
  unfinished: list[str]
  cognition_delta: list[str]
  tomorrow_first_step: str
  summary: str


class GeneratePlanResponse(BaseModel):
  plan: DailyPlanPayload
  source_event_count: int
  generated_by: str


class GenerateReviewResponse(BaseModel):
  review: DailyReviewPayload
  source_event_count: int
  generated_by: str
