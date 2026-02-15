from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session

from app.core.config import get_settings
from app.db.session import get_session
from app.services.llm import LLMService, get_default_llm_service
from app.services.wechat import MockWeChatClient, RealWeChatClient, WeChatClient


def get_llm_service() -> LLMService:
  return get_default_llm_service()


def get_wechat_client() -> WeChatClient:
  settings = get_settings()
  if settings.wechat_push_mode == 'real':
    return RealWeChatClient(
      api_base=settings.wechat_api_base,
      app_id=settings.wechat_app_id,
      app_secret=settings.wechat_app_secret,
    )
  return MockWeChatClient()


def verify_ingest_token(x_ingest_token: str | None = Header(default=None, alias='X-INGEST-TOKEN')) -> None:
  settings = get_settings()
  provided = x_ingest_token or ''
  if not secrets.compare_digest(provided, settings.ingest_token):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail='invalid ingest token',
    )


SessionDep = Annotated[Session, Depends(get_session)]
LLMServiceDep = Annotated[LLMService, Depends(get_llm_service)]
WeChatClientDep = Annotated[WeChatClient, Depends(get_wechat_client)]
IngestAuthDep = Annotated[None, Depends(verify_ingest_token)]
