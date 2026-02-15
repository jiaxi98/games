from __future__ import annotations


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
