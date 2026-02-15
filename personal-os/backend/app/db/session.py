from __future__ import annotations

from pathlib import Path
from typing import Iterator

from sqlalchemy.engine import Engine
from sqlmodel import SQLModel, Session, create_engine

from app.core.config import get_settings

_engine: Engine | None = None


def _resolve_sqlite_path(raw_path: str) -> Path:
  path = Path(raw_path)
  if path.is_absolute():
    return path
  backend_dir = Path(__file__).resolve().parents[2]
  return backend_dir / path


def get_database_url() -> str:
  settings = get_settings()
  db_path = _resolve_sqlite_path(settings.sqlite_db_path)
  db_path.parent.mkdir(parents=True, exist_ok=True)
  return f'sqlite:///{db_path}'


def get_engine() -> Engine:
  global _engine
  if _engine is None:
    _engine = create_engine(
      get_database_url(),
      connect_args={'check_same_thread': False},
    )
  return _engine


def init_db() -> None:
  from app.db import models  # noqa: F401

  SQLModel.metadata.create_all(get_engine())


def get_session() -> Iterator[Session]:
  with Session(get_engine()) as session:
    yield session


def reset_engine() -> None:
  global _engine
  if _engine is not None:
    _engine.dispose()
  _engine = None
