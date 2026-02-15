from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import build_api_router
from app.core.config import get_settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
  init_db()
  yield


def create_app() -> FastAPI:
  settings = get_settings()
  app = FastAPI(
    title=settings.app_name,
    version='0.1.0',
    lifespan=lifespan,
  )

  @app.get('/healthz', tags=['system'])
  def healthz() -> dict[str, str]:
    return {'status': 'ok'}

  app.include_router(build_api_router(settings.api_v1_prefix))
  return app


app = create_app()
