from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.schemas.ingest import EventResponse
from app.schemas.jobs import DailyPlanPayload, DailyReviewPayload


class TodayStats(BaseModel):
  total_events: int
  by_source: dict[str, int]


class TodayResponse(BaseModel):
  date: date
  events: list[EventResponse]
  stats: TodayStats
  daily_plan: DailyPlanPayload | None = None
  daily_review: DailyReviewPayload | None = None
