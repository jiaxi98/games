from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


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


def get_default_wechat_client() -> WeChatClient:
  return MockWeChatClient()
