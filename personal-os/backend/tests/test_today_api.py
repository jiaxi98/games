from __future__ import annotations


def test_today_returns_event_stats(client):
  client.post(
    '/api/v1/ingest/browser',
    json={'event_type': 'article', 'content': '读了一篇 blog'},
  )
  client.post(
    '/api/v1/ingest/mobile',
    json={'event_type': 'idea', 'content': '记录一个灵感'},
  )

  response = client.get('/api/v1/today')
  assert response.status_code == 200

  payload = response.json()
  assert payload['stats']['total_events'] == 2
  assert payload['stats']['by_source']['browser'] == 1
  assert payload['stats']['by_source']['mobile'] == 1
