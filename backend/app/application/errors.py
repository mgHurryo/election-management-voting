class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def authentication_required() -> AppError:
    return AppError(
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
    )
