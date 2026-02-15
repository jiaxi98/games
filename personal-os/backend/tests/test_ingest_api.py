from __future__ import annotations

from datetime import datetime, timedelta, timezone


def test_ingest_browser_contract(client, ingest_headers):
  response = client.post(
    '/api/v1/ingest/browser',
    headers=ingest_headers,
    json={
      'event_type': 'article',
      'title': 'FastAPI 文档',
      'content': '今天读了 FastAPI 依赖注入章节',
      'url': 'https://fastapi.tiangolo.com/',
      'metadata': {'source_app': 'chrome'},
    },
  )

  assert response.status_code == 201
  payload = response.json()
  assert payload['id'] > 0
  assert payload['source'] == 'browser'
  assert payload['event_type'] == 'article'
  assert payload['metadata']['source_app'] == 'chrome'
  assert payload['metadata']['source_tag'] == 'web'


def test_ingest_mobile_contract(client, ingest_headers):
  response = client.post(
    '/api/v1/ingest/mobile',
    headers=ingest_headers,
    json={
      'event_type': 'idea',
      'content': '在路上记录一个产品想法',
      'metadata': {'channel': 'ios-shortcuts'},
    },
  )

  assert response.status_code == 201
  payload = response.json()
  assert payload['source'] == 'mobile'
  assert payload['event_type'] == 'idea'
  assert payload['metadata']['source_tag'] == 'mobile'


def test_ingest_requires_token(client):
  response = client.post(
    '/api/v1/ingest/browser',
    json={
      'event_type': 'article',
      'content': '缺少 token',
    },
  )
  assert response.status_code == 401
  assert response.json()['detail'] == 'invalid ingest token'


def test_ingest_dedup_within_ten_minutes_for_same_page(client, ingest_headers):
  start_time = datetime(2026, 2, 15, 8, 0, tzinfo=timezone.utc)
  first = client.post(
    '/api/v1/ingest/browser',
    headers=ingest_headers,
    json={
      'event_type': 'article',
      'content': '第一次采集',
      'url': 'https://example.com/path?a=1&utm_source=wechat#sec1',
      'timestamp': start_time.isoformat(),
    },
  )
  second = client.post(
    '/api/v1/ingest/browser',
    headers=ingest_headers,
    json={
      'event_type': 'article',
      'content': '第二次采集',
      'url': 'https://example.com/path?utm_medium=social&a=1#sec2',
      'timestamp': (start_time + timedelta(minutes=5)).isoformat(),
    },
  )

  assert first.status_code == 201
  assert second.status_code == 201
  first_payload = first.json()
  second_payload = second.json()
  assert first_payload['id'] == second_payload['id']

  today = client.get('/api/v1/today', params={'target_date': '2026-02-15'})
  assert today.status_code == 200
  assert today.json()['stats']['total_events'] == 1


def test_ingest_not_dedup_outside_ten_minutes(client, ingest_headers):
  start_time = datetime(2026, 2, 15, 9, 0, tzinfo=timezone.utc)
  first = client.post(
    '/api/v1/ingest/browser',
    headers=ingest_headers,
    json={
      'event_type': 'article',
      'content': '窗口外测试 1',
      'url': 'https://example.com/path?a=1',
      'timestamp': start_time.isoformat(),
    },
  )
  second = client.post(
    '/api/v1/ingest/browser',
    headers=ingest_headers,
    json={
      'event_type': 'article',
      'content': '窗口外测试 2',
      'url': 'https://example.com/path?a=1',
      'timestamp': (start_time + timedelta(minutes=11)).isoformat(),
    },
  )

  assert first.status_code == 201
  assert second.status_code == 201
  assert first.json()['id'] != second.json()['id']


def test_ingest_source_tag_detects_wechat_domain(client, ingest_headers):
  response = client.post(
    '/api/v1/ingest/browser',
    headers=ingest_headers,
    json={
      'event_type': 'article',
      'title': '公众号文章',
      'content': '测试来源标签',
      'url': 'https://mp.weixin.qq.com/s/abc123?utm_source=timeline',
      'metadata': {'via': 'popup'},
    },
  )

  assert response.status_code == 201
  payload = response.json()
  assert payload['url'] == 'https://mp.weixin.qq.com/s/abc123'
  assert payload['metadata']['source_tag'] == 'wechat'
  assert payload['metadata']['normalized_url'] == 'https://mp.weixin.qq.com/s/abc123'


def test_ingest_cleans_text_and_event_type(client, ingest_headers):
  response = client.post(
    '/api/v1/ingest/mobile',
    headers=ingest_headers,
    json={
      'event_type': '  IDEA  ',
      'title': '  一个标题   ',
      'content': '  第一行   \n\n\n   第二行\t\t',
      'metadata': {'channel': 'ios-shortcuts'},
    },
  )

  assert response.status_code == 201
  payload = response.json()
  assert payload['event_type'] == 'idea'
  assert payload['title'] == '一个标题'
  assert payload['content'] == '第一行\n\n第二行'
