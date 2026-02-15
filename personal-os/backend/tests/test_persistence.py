from __future__ import annotations

from sqlmodel import select

from app.db.models import DailyPlan, DailyReview, Event, PushLog


def test_persistence_end_to_end(client, db_session):
  client.post(
    '/api/v1/ingest/browser',
    json={'event_type': 'article', 'content': '持久化测试事件'},
  )
  client.post('/api/v1/jobs/generate-plan', json={})
  client.post('/api/v1/jobs/generate-review', json={})
  client.post('/api/v1/push/wechat/daily', json={'dry_run': True})

  assert len(db_session.exec(select(Event)).all()) == 1
  assert len(db_session.exec(select(DailyPlan)).all()) == 1
  assert len(db_session.exec(select(DailyReview)).all()) == 1
  assert len(db_session.exec(select(PushLog)).all()) == 1
