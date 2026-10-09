from fastapi import APIRouter

from app.api import auth, voters

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(voters.router)
# Add elections/candidates/voters/votes/results only after their services and tests exist.
# Unimplemented operations intentionally stay absent from the runtime OpenAPI contract.
