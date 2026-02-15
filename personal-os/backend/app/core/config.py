from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  app_name: str = 'Personal OS Backend'
  app_env: str = 'dev'
  api_v1_prefix: str = '/api/v1'
  sqlite_db_path: str = 'data/personal_os.db'
  wechat_dry_run: bool = True
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
