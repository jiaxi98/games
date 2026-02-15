from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IngestRequest(BaseModel):
  event_type: str = Field(default='note', min_length=1, max_length=64)
  title: str | None = Field(default=None, max_length=255)
  content: str = Field(min_length=1)
  url: str | None = Field(default=None, max_length=1024)
  timestamp: datetime | None = None
  metadata: dict[str, Any] = Field(default_factory=dict)


class EventResponse(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  source: str
  event_type: str
  title: str | None = None
  content: str
  url: str | None = None
  metadata: dict[str, Any] = Field(default_factory=dict)
  event_day: date
  created_at: datetime
