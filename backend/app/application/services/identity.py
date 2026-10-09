from collections.abc import Callable

from app.application.errors import AppError, authentication_required
from app.application.ports import TokenService, UnitOfWork
from app.domain.identity import LoginResult, UserIdentity


class IdentityService:
    def __init__(
        self,
        uow_factory: Callable[[], UnitOfWork],
        tokens: TokenService,
        *,
        verify_password: Callable[[str, str], bool],
        dummy_hash: str,
    ) -> None:
        self._uow_factory = uow_factory
        self._tokens = tokens
        self._verify_password = verify_password
        self._dummy_hash = dummy_hash

    def login(self, username: str, password: str) -> LoginResult:
        if not isinstance(username, str) or not username.strip() or len(username.strip()) > 50:
            raise AppError("INVALID_CREDENTIALS", "Invalid username or password.")
        if not isinstance(password, str) or not password:
            raise AppError("INVALID_CREDENTIALS", "Invalid username or password.")
        with self._uow_factory() as uow:
            account = uow.users.by_username(username.strip())
        valid = self._verify_password(
            password, account.password_hash if account else self._dummy_hash
        )
        if not valid or account is None or account.identity.status != "ACTIVE":
            raise AppError("INVALID_CREDENTIALS", "Invalid username or password.")
        return LoginResult(
            access_token=self._tokens.issue(account.identity.id),
            expires_in=self._tokens.expires_in,
            user=account.identity,
        )

    def current_user(self, token: str) -> UserIdentity:
        user_id = self._tokens.subject(token)
        with self._uow_factory() as uow:
            account = uow.users.by_id(user_id)
        if account is None or account.identity.status != "ACTIVE":
            raise authentication_required()
        return account.identity

    @staticmethod
    def require_role(user: UserIdentity, role: str) -> UserIdentity:
        # The caller's current database role is authoritative, never a JWT role claim.
        if user.role != role:
            raise AppError("PERMISSION_DENIED", "Permission denied.")
        return user
