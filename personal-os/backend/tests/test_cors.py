from __future__ import annotations


def test_cors_preflight_for_ingest(client):
  response = client.options(
    '/api/v1/ingest/browser',
    headers={
      'Origin': 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-ingest-token',
    },
  )
  assert response.status_code == 200
  assert response.headers.get('access-control-allow-origin') == 'http://localhost:5173'
