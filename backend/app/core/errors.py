class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        *,
        details: list[dict[str, str]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        self.headers = headers or {}


def authentication_required() -> AppError:
    return AppError(
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
        401,
        headers={"WWW-Authenticate": "Bearer"},
    )
