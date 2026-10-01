from fastapi import APIRouter

from app.api import auth

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
# Add elections/candidates/voters/votes/results only after their services and tests exist.
# Unimplemented operations intentionally stay absent from the runtime OpenAPI contract.
