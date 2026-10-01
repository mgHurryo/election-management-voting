from fastapi import APIRouter

from app.api.dependencies import HealthServiceDep
from app.schemas.common import DataResponse, ErrorResponse

router = APIRouter(prefix="/health", tags=["operations"])


@router.get("/live", response_model=DataResponse[dict[str, str]])
def live():
    return DataResponse(data={"status": "alive"})


@router.get(
    "/ready", response_model=DataResponse[dict[str, str]], responses={503: {"model": ErrorResponse}}
)
def ready(service: HealthServiceDep):
    return DataResponse(data=service.ready())
