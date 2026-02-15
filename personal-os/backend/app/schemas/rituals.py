from __future__ import annotations

from datetime import date as dt_date

from pydantic import BaseModel

from app.schemas.jobs import DailyPlanPayload, DailyReviewPayload


class MorningRitualRequest(BaseModel):
  date: dt_date | None = None
  overwrite: bool = True
  must_win: str | None = None


class EveningRitualRequest(BaseModel):
  date: dt_date | None = None
  overwrite: bool = True
  key_outcome: str | None = None
  biggest_blocker: str | None = None


class MorningRitualResponse(BaseModel):
  plan: DailyPlanPayload
  source_event_count: int
  generated_by: str


class EveningRitualResponse(BaseModel):
  review: DailyReviewPayload
  source_event_count: int
  generated_by: str


class RitualsTodayResponse(BaseModel):
  date: dt_date
  morning: DailyPlanPayload | None = None
  evening: DailyReviewPayload | None = None
  morning_generated_by: str | None = None
  evening_generated_by: str | None = None
