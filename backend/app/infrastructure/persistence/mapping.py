from datetime import UTC, datetime


def utc(value: datetime) -> datetime:
    # MySQL DATETIME is timezone-naive; the connection and all writers use UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
