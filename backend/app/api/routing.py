from fastapi import Request
from fastapi.routing import APIRoute

from app.application.errors import AppError


class StrictAPIRoute(APIRoute):
    """Reject query fields not declared by the endpoint/dependencies and bodyless input."""

    def get_route_handler(self):
        original = super().get_route_handler()
        allowed_query = set()

        def collect(dependant):
            allowed_query.update(param.alias for param in dependant.query_params)
            for child in dependant.dependencies:
                collect(child)

        collect(self.dependant)

        async def handle(request: Request):
            if set(request.query_params) - allowed_query:
                raise AppError("VALIDATION_ERROR", "Unexpected query parameters.")
            body = await request.body()
            if self.body_field is None and body:
                raise AppError("VALIDATION_ERROR", "This operation does not accept a body.")
            if self.body_field is not None and body:
                media_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
                if media_type != "application/json":
                    raise AppError("VALIDATION_ERROR", "A JSON request body is required.")
            return await original(request)

        return handle
