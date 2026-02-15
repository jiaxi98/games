from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  app_name: str = 'Personal OS Backend'
  app_env: str = 'dev'
  api_v1_prefix: str = '/api/v1'
  sqlite_db_path: str = 'data/personal_os.db'
  ingest_token: str = 'dev-ingest-token'
  cors_allow_origins: str = ''
  llm_mode: Literal['mock', 'openai_compatible'] = 'mock'
  llm_api_base: str = 'https://api.openai.com/v1'
  llm_api_key: str = ''
  llm_model: str = 'gpt-4o-mini'
  llm_timeout_seconds: float = 30.0
  wechat_dry_run: bool = True
  wechat_push_mode: Literal['mock', 'real'] = 'mock'
  wechat_api_base: str = 'https://api.weixin.qq.com'
  wechat_app_id: str = ''
  wechat_app_secret: str = ''
  wechat_template_id: str = 'TEMPLATE_ID_PLACEHOLDER'
  wechat_to_user: str = 'OPENID_PLACEHOLDER'

  model_config = SettingsConfigDict(
    env_prefix='PERSONAL_OS_',
    env_file='.env',
    case_sensitive=False,
    extra='ignore',
  )


@lru_cache
def get_settings() -> Settings:
  return Settings()


def clear_settings_cache() -> None:
  get_settings.cache_clear()


def parse_cors_origins(raw_value: str) -> list[str]:
  return [item.strip() for item in raw_value.split(',') if item.strip()]
