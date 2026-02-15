from __future__ import annotations


def test_push_wechat_daily_dry_run(client):
  client.post('/api/v1/jobs/generate-plan', json={})
  client.post('/api/v1/jobs/generate-review', json={})

  response = client.post('/api/v1/push/wechat/daily', json={'dry_run': True})
  assert response.status_code == 200

  payload = response.json()
  assert payload['status'] == 'dry_run'
  assert payload['channel'] == 'wechat_official_account'
  assert payload['log_id'] > 0


def test_push_wechat_daily_requires_data(client):
  response = client.post('/api/v1/push/wechat/daily', json={'dry_run': True})
  assert response.status_code == 400
  assert 'no daily plan/review found' in response.json()['detail']
