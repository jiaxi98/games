from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, status

from app.api.deps import SessionDep
from app.db.models import Event
from app.schemas.ingest import EventResponse, IngestRequest
from app.services.serialization import dump_json, load_json

router = APIRouter()


def _save_event(session: SessionDep, payload: IngestRequest, source: str) -> EventResponse:
  created_at = payload.timestamp or datetime.now(timezone.utc)
  event = Event(
    source=source,
    event_type=payload.event_type,
    title=payload.title,
    content=payload.content,
    url=payload.url,
    metadata_json=dump_json(payload.metadata),
    event_day=created_at.date(),
    created_at=created_at,
  )
  session.add(event)
  session.commit()
  session.refresh(event)

  return EventResponse(
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


@router.post('/ingest/browser', response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def ingest_browser(payload: IngestRequest, session: SessionDep) -> EventResponse:
  return _save_event(session, payload, source='browser')


@router.post('/ingest/mobile', response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def ingest_mobile(payload: IngestRequest, session: SessionDep) -> EventResponse:
  return _save_event(session, payload, source='mobile')
