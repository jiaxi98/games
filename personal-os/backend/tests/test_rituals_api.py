from __future__ import annotations


def test_morning_ritual_applies_must_win(client, ingest_headers):
  client.post(
    '/api/v1/ingest/browser',
    headers=ingest_headers,
    json={'event_type': 'article', 'content': '晨间输入样本'},
  )

  response = client.post(
    '/api/v1/rituals/morning',
    json={'must_win': '完成 v0.4 早晚闭环'},
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload['generated_by'] == 'mock-llm-v1'
  assert payload['plan']['top_goals'][0] == '必须拿下：完成 v0.4 早晚闭环'

  today = client.get('/api/v1/rituals/today')
  assert today.status_code == 200
  today_payload = today.json()
  assert today_payload['morning']['top_goals'][0] == '必须拿下：完成 v0.4 早晚闭环'


def test_evening_ritual_applies_result_and_blocker(client, ingest_headers):
  client.post(
    '/api/v1/ingest/mobile',
    headers=ingest_headers,
    json={'event_type': 'idea', 'content': '晚间输入样本'},
  )

  response = client.post(
    '/api/v1/rituals/evening',
    json={
      'key_outcome': '完成浏览器采集链路验收',
      'biggest_blocker': '个人公众号缺少模板消息权限',
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload['review']['outcomes'][0] == '今日结果：完成浏览器采集链路验收'
  assert payload['review']['unfinished'][0] == '最大卡点：个人公众号缺少模板消息权限'

  today = client.get('/api/v1/rituals/today')
  assert today.status_code == 200
  today_payload = today.json()
  assert today_payload['evening']['outcomes'][0] == '今日结果：完成浏览器采集链路验收'


def test_rituals_today_returns_none_before_generation(client):
  response = client.get('/api/v1/rituals/today')
  assert response.status_code == 200
  payload = response.json()
  assert payload['morning'] is None
  assert payload['evening'] is None


def test_morning_ritual_without_overwrite_keeps_existing(client):
  first = client.post(
    '/api/v1/rituals/morning',
    json={'must_win': '第一次锚点', 'overwrite': True},
  ).json()
  second = client.post(
    '/api/v1/rituals/morning',
    json={'must_win': '第二次锚点', 'overwrite': False},
  ).json()

  assert first['plan']['top_goals'][0] == second['plan']['top_goals'][0]
  assert second['plan']['top_goals'][0] == '必须拿下：第一次锚点'
