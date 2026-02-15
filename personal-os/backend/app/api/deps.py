from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.db.session import get_session
from app.services.llm import LLMService, get_default_llm_service
from app.services.wechat import WeChatClient, get_default_wechat_client


def get_llm_service() -> LLMService:
  return get_default_llm_service()


def get_wechat_client() -> WeChatClient:
  return get_default_wechat_client()


SessionDep = Annotated[Session, Depends(get_session)]
LLMServiceDep = Annotated[LLMService, Depends(get_llm_service)]
WeChatClientDep = Annotated[WeChatClient, Depends(get_wechat_client)]
