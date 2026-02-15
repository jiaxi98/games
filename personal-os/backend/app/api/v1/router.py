from fastapi import APIRouter

from app.api.v1.endpoints.ingest import router as ingest_router
from app.api.v1.endpoints.jobs import router as jobs_router
from app.api.v1.endpoints.push import router as push_router
from app.api.v1.endpoints.rituals import router as rituals_router
from app.api.v1.endpoints.today import router as today_router

router = APIRouter()
router.include_router(ingest_router, tags=['ingest'])
router.include_router(today_router, tags=['today'])
router.include_router(jobs_router, tags=['jobs'])
router.include_router(push_router, tags=['push'])
router.include_router(rituals_router, tags=['rituals'])
