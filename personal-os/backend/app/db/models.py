from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
  return datetime.now(timezone.utc)


class Event(SQLModel, table=True):
  id: Optional[int] = Field(default=None, primary_key=True)
  source: str = Field(index=True, max_length=64)
  event_type: str = Field(index=True, max_length=64)
  title: Optional[str] = Field(default=None, max_length=255)
  content: str
  url: Optional[str] = Field(default=None, max_length=1024)
  metadata_json: str = Field(default='{}')
  event_day: date = Field(index=True)
  created_at: datetime = Field(default_factory=utc_now, index=True)


class DailyPlan(SQLModel, table=True):
  id: Optional[int] = Field(default=None, primary_key=True)
  plan_date: date = Field(index=True)
  top_goals_json: str = Field(default='[]')
  focus_blocks_json: str = Field(default='[]')
  risks_json: str = Field(default='[]')
  summary: str = Field(default='')
  generated_by: str = Field(default='mock-llm-v1', max_length=128)
  created_at: datetime = Field(default_factory=utc_now, index=True)


class DailyReview(SQLModel, table=True):
  id: Optional[int] = Field(default=None, primary_key=True)
  review_date: date = Field(index=True)
  outcomes_json: str = Field(default='[]')
  unfinished_json: str = Field(default='[]')
  cognition_delta_json: str = Field(default='[]')
  tomorrow_first_step: str = Field(default='')
  summary: str = Field(default='')
  generated_by: str = Field(default='mock-llm-v1', max_length=128)
  created_at: datetime = Field(default_factory=utc_now, index=True)


class PushLog(SQLModel, table=True):
  id: Optional[int] = Field(default=None, primary_key=True)
  channel: str = Field(default='wechat_official_account', index=True, max_length=64)
  push_date: date = Field(index=True)
  template_id: str = Field(max_length=128)
  status: str = Field(index=True, max_length=64)
  message_preview: str
  error_message: Optional[str] = Field(default=None)
  created_at: datetime = Field(default_factory=utc_now, index=True)
