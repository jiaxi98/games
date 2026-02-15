from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import clear_settings_cache
from app.db.session import get_engine, reset_engine
from app.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
  db_path = tmp_path / 'test.db'
  monkeypatch.setenv('PERSONAL_OS_SQLITE_DB_PATH', str(db_path))
  monkeypatch.setenv('PERSONAL_OS_INGEST_TOKEN', 'test-ingest-token')
  monkeypatch.setenv('PERSONAL_OS_CORS_ALLOW_ORIGINS', 'http://localhost:5173')
  monkeypatch.setenv('PERSONAL_OS_LLM_MODE', 'mock')
  monkeypatch.setenv('PERSONAL_OS_LLM_MODEL', 'mock-llm-v1')
  monkeypatch.setenv('PERSONAL_OS_WECHAT_PUSH_MODE', 'mock')
  monkeypatch.setenv('PERSONAL_OS_WECHAT_TO_USER', 'test-openid')
  monkeypatch.setenv('PERSONAL_OS_WECHAT_TEMPLATE_ID', 'test-template')
  monkeypatch.setenv('PERSONAL_OS_WECHAT_DRY_RUN', 'true')

  clear_settings_cache()
  reset_engine()
  app = create_app()

  with TestClient(app) as test_client:
    yield test_client

  reset_engine()
  clear_settings_cache()


@pytest.fixture()
def db_session(client):
  with Session(get_engine()) as session:
    yield session


@pytest.fixture()
def ingest_headers():
  return {'X-INGEST-TOKEN': 'test-ingest-token'}
