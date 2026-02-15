from __future__ import annotations


def test_generate_plan(client):
  client.post(
    '/api/v1/ingest/browser',
    json={'event_type': 'article', 'content': '测试晨间计划'},
  )

  response = client.post('/api/v1/jobs/generate-plan', json={})
  assert response.status_code == 200

  payload = response.json()
  assert payload['generated_by'] == 'mock-llm-v1'
  assert len(payload['plan']['top_goals']) == 3


def test_generate_review(client):
  client.post(
    '/api/v1/ingest/mobile',
    json={'event_type': 'idea', 'content': '测试晚间复盘'},
  )

  response = client.post('/api/v1/jobs/generate-review', json={})
  assert response.status_code == 200

  payload = response.json()
  assert payload['generated_by'] == 'mock-llm-v1'
  assert payload['review']['tomorrow_first_step']


def test_generate_plan_without_overwrite_keeps_existing(client):
  first = client.post('/api/v1/jobs/generate-plan', json={'overwrite': True}).json()
  second = client.post('/api/v1/jobs/generate-plan', json={'overwrite': False}).json()

  assert first['plan']['summary'] == second['plan']['summary']
