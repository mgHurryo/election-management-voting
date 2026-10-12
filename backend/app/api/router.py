from fastapi import APIRouter

from app.api import auth, result, voters

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(voters.router)
router.include_router(result.router)
# Add elections/candidates/votes only after their services and tests exist.
# Unimplemented operations intentionally stay absent from the runtime OpenAPI contract.
