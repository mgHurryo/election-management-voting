import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.application.errors import AppError

logger = logging.getLogger(__name__)

APPLICATION_ERROR_STATUS = {
    "AUTHENTICATION_REQUIRED": 401,
    "INVALID_CREDENTIALS": 401,
    "PERMISSION_DENIED": 403,
    "ELECTION_NOT_FOUND": 404,
    "USER_NOT_FOUND": 404,
    "VOTER_NOT_FOUND": 404,
    "ELECTION_NOT_EDITABLE": 409,
    "VOTER_ALREADY_EXISTS": 409,
    "RESOURCE_CONFLICT": 409,
    "INVALID_VOTER": 422,
    "VALIDATION_ERROR": 422,
    "INTERNAL_ERROR": 500,
    "SERVICE_UNAVAILABLE": 503,
}


def error_response(code: str, message: str, status: int, *, details=None, headers=None):
    error = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JSONResponse(
        {"error": error},
        status_code=status,
        headers={**(headers or {}), "Cache-Control": "no-store"},
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def business_error(request: Request, exc: AppError):
        status = APPLICATION_ERROR_STATUS.get(exc.code)
        if status is None:
            return internal_error_response(exc)
        headers = {"WWW-Authenticate": "Bearer"} if exc.code == "AUTHENTICATION_REQUIRED" else None
        return error_response(exc.code, exc.message, status, details=exc.details, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        details = []
        for issue in exc.errors():
            location = issue.get("loc", ())
            # Unknown keys can themselves contain arbitrary/private user input.
            if issue["type"] == "extra_forbidden":
                location = location[:-1]
            details.append(
                {
                    "field": ".".join(str(part) for part in location) or "request",
                    "reason": "Invalid or unexpected value.",
                }
            )
        return error_response("VALIDATION_ERROR", "Invalid request.", 422, details=details)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        codes = {
            401: ("AUTHENTICATION_REQUIRED", "Authentication is required."),
            403: ("PERMISSION_DENIED", "Permission denied."),
            404: ("ROUTE_NOT_FOUND", "Route not found."),
            405: ("METHOD_NOT_ALLOWED", "Method not allowed."),
        }
        code, message = codes.get(exc.status_code, ("HTTP_ERROR", "Request failed."))
        return error_response(code, message, exc.status_code, headers=exc.headers)


def internal_error_response(exc: Exception):
    # Never log exception text/tracebacks: DB failures can carry private parameters.
    logger.error("Unhandled application error (%s)", type(exc).__name__)
    return error_response("INTERNAL_ERROR", "An internal error occurred.", 500)
