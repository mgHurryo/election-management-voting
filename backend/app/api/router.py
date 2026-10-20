from fastapi import APIRouter

from app.api import auth, elections, results, voters, voting

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(elections.router)
router.include_router(voters.router)
router.include_router(voting.router)
router.include_router(results.router)
