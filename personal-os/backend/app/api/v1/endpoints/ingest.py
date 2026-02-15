from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import IngestAuthDep, SessionDep
from app.db.models import Event
from app.schemas.ingest import EventResponse, IngestRequest
from app.services.ingest_processing import find_recent_duplicate, prepare_ingest_payload
from app.services.serialization import dump_json, load_json

router = APIRouter()


def _to_event_response(event: Event) -> EventResponse:
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


def _save_event(session: SessionDep, payload: IngestRequest, source: str) -> EventResponse:
  try:
    prepared = prepare_ingest_payload(
      source=source,
      event_type=payload.event_type,
      title=payload.title,
      content=payload.content,
      url=payload.url,
      timestamp=payload.timestamp,
      metadata=payload.metadata,
    )
  except ValueError as exc:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

  duplicated_event = find_recent_duplicate(session, source=source, prepared=prepared)
  if duplicated_event:
    return _to_event_response(duplicated_event)

  event = Event(
    source=source,
    event_type=prepared.event_type,
    title=prepared.title,
    content=prepared.content,
    url=prepared.url,
    metadata_json=dump_json(prepared.metadata),
    event_day=prepared.created_at.date(),
    created_at=prepared.created_at,
  )
  session.add(event)
  session.commit()
  session.refresh(event)

  return _to_event_response(event)


@router.post('/ingest/browser', response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def ingest_browser(payload: IngestRequest, session: SessionDep, _: IngestAuthDep) -> EventResponse:
  return _save_event(session, payload, source='browser')


@router.post('/ingest/mobile', response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def ingest_mobile(payload: IngestRequest, session: SessionDep, _: IngestAuthDep) -> EventResponse:
  return _save_event(session, payload, source='mobile')
