from __future__ import annotations

from datetime import date as dt_date

from pydantic import BaseModel


class PushDailyRequest(BaseModel):
  date: dt_date | None = None
  dry_run: bool = True


class PushDailyResponse(BaseModel):
  push_date: dt_date
  status: str
  channel: str
  message_preview: str
  log_id: int
