from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx


@dataclass
class WeChatPushResult:
  status: str
  channel: str
  message_id: str | None = None
  error_message: str | None = None


class WeChatClient(ABC):
  @abstractmethod
  def send_daily_summary(
    self,
    *,
    to_user: str,
    template_id: str,
    message_preview: str,
    dry_run: bool,
  ) -> WeChatPushResult:
    raise NotImplementedError


class MockWeChatClient(WeChatClient):
  channel = 'wechat_official_account'

  def send_daily_summary(
    self,
    *,
    to_user: str,
    template_id: str,
    message_preview: str,
    dry_run: bool,
  ) -> WeChatPushResult:
    if dry_run:
      return WeChatPushResult(
        status='dry_run',
        channel=self.channel,
        message_id='mock-dry-run',
      )
    if not to_user or to_user == 'OPENID_PLACEHOLDER':
      return WeChatPushResult(
        status='failed',
        channel=self.channel,
        error_message='missing to_user openid',
      )
    if not template_id or template_id == 'TEMPLATE_ID_PLACEHOLDER':
      return WeChatPushResult(
        status='failed',
        channel=self.channel,
        error_message='missing template id',
      )
    return WeChatPushResult(
      status='sent',
      channel=self.channel,
      message_id='mock-sent-001',
    )


class RealWeChatClient(WeChatClient):
  channel = 'wechat_official_account'

  def __init__(
    self,
    *,
    api_base: str,
    app_id: str,
    app_secret: str,
    timeout_seconds: float = 10.0,
  ):
    self.api_base = api_base.rstrip('/')
    self.app_id = app_id
    self.app_secret = app_secret
    self.timeout_seconds = timeout_seconds
    self._access_token: str | None = None
    self._access_token_expire_at: float = 0

  def _is_token_valid(self) -> bool:
    # Keep 60s as safety margin to avoid edge expiry during API call.
    return bool(self._access_token) and time.time() < (self._access_token_expire_at - 60)

  def _refresh_access_token(self) -> str:
    if not self.app_id or not self.app_secret:
      raise ValueError('missing wechat app credentials')

    token_url = f'{self.api_base}/cgi-bin/token'
    response = httpx.get(
      token_url,
      params={
        'grant_type': 'client_credential',
        'appid': self.app_id,
        'secret': self.app_secret,
      },
      timeout=self.timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()

    errcode = payload.get('errcode', 0)
    if errcode != 0:
      errmsg = payload.get('errmsg', 'unknown error')
      raise ValueError(f'wechat token error: {errcode} {errmsg}')

    access_token = payload.get('access_token')
    if not access_token:
      raise ValueError('wechat token missing access_token field')

    expires_in = int(payload.get('expires_in', 7200))
    self._access_token = access_token
    self._access_token_expire_at = time.time() + expires_in
    return access_token

  def _get_access_token(self) -> str:
    if self._is_token_valid():
      return self._access_token or ''
    return self._refresh_access_token()

  def _send_template_message(
    self,
    *,
    access_token: str,
    to_user: str,
    template_id: str,
    message_preview: str,
  ) -> dict:
    send_url = f'{self.api_base}/cgi-bin/message/template/send'
    payload = {
      'touser': to_user,
      'template_id': template_id,
      'data': {
        'summary': {
          'value': message_preview[:500],
        }
      },
    }
    response = httpx.post(
      send_url,
      params={'access_token': access_token},
      json=payload,
      timeout=self.timeout_seconds,
    )
    response.raise_for_status()
    return response.json()

  def send_daily_summary(
    self,
    *,
    to_user: str,
    template_id: str,
    message_preview: str,
    dry_run: bool,
  ) -> WeChatPushResult:
    if dry_run:
      return WeChatPushResult(
        status='dry_run',
        channel=self.channel,
        message_id='real-client-dry-run',
      )
    if not to_user:
      return WeChatPushResult(
        status='failed',
        channel=self.channel,
        error_message='missing to_user openid',
      )
    if not template_id:
      return WeChatPushResult(
        status='failed',
        channel=self.channel,
        error_message='missing template id',
      )

    try:
      access_token = self._get_access_token()
      result = self._send_template_message(
        access_token=access_token,
        to_user=to_user,
        template_id=template_id,
        message_preview=message_preview,
      )
      errcode = result.get('errcode', 0)
      if errcode != 0:
        errmsg = result.get('errmsg', 'unknown error')
        return WeChatPushResult(
          status='failed',
          channel=self.channel,
          error_message=f'wechat send error: {errcode} {errmsg}',
        )
      return WeChatPushResult(
        status='sent',
        channel=self.channel,
        message_id=str(result.get('msgid') or ''),
      )
    except (httpx.HTTPError, ValueError) as exc:
      return WeChatPushResult(
        status='failed',
        channel=self.channel,
        error_message=str(exc),
      )
