from __future__ import annotations

from app.api.deps import get_wechat_client
from app.core.config import clear_settings_cache
from app.services.wechat import MockWeChatClient, RealWeChatClient


class _DummyResponse:
  def __init__(self, payload):
    self._payload = payload

  def raise_for_status(self):
    return None

  def json(self):
    return self._payload


def test_wechat_client_selection_mock(monkeypatch):
  monkeypatch.setenv('PERSONAL_OS_WECHAT_PUSH_MODE', 'mock')
  clear_settings_cache()
  client = get_wechat_client()
  assert isinstance(client, MockWeChatClient)
  clear_settings_cache()


def test_wechat_client_selection_real(monkeypatch):
  monkeypatch.setenv('PERSONAL_OS_WECHAT_PUSH_MODE', 'real')
  monkeypatch.setenv('PERSONAL_OS_WECHAT_APP_ID', 'app-id')
  monkeypatch.setenv('PERSONAL_OS_WECHAT_APP_SECRET', 'app-secret')
  clear_settings_cache()
  client = get_wechat_client()
  assert isinstance(client, RealWeChatClient)
  clear_settings_cache()


def test_real_wechat_client_dry_run():
  client = RealWeChatClient(
    api_base='https://api.weixin.qq.com',
    app_id='appid',
    app_secret='secret',
  )
  result = client.send_daily_summary(
    to_user='openid',
    template_id='template',
    message_preview='preview',
    dry_run=True,
  )
  assert result.status == 'dry_run'


def test_real_wechat_client_send_success(monkeypatch):
  def fake_get(*args, **kwargs):
    return _DummyResponse({'access_token': 'token-123', 'expires_in': 7200})

  def fake_post(*args, **kwargs):
    return _DummyResponse({'errcode': 0, 'msgid': 777})

  monkeypatch.setattr('app.services.wechat.httpx.get', fake_get)
  monkeypatch.setattr('app.services.wechat.httpx.post', fake_post)

  client = RealWeChatClient(
    api_base='https://api.weixin.qq.com',
    app_id='appid',
    app_secret='secret',
  )
  result = client.send_daily_summary(
    to_user='openid',
    template_id='template-id',
    message_preview='daily summary',
    dry_run=False,
  )
  assert result.status == 'sent'
  assert result.message_id == '777'
