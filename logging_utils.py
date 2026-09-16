"""Structured logging utilities for the AI module.

Provides a consistent, JSON-formatted logging interface
with request tracing and safe redaction of secrets.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def get_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    """Return a named logger with a JSON formatter attached.

    Args:
        name: Dot-separated logger name (e.g. ``ai_module.api``).
        level: Minimum severity. Defaults to ``INFO``.

    Returns:
        A configured :class:`logging.Logger` instance.
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(_JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger


def generate_trace_id() -> str:
    """Create a unique trace identifier for request correlation.

    Returns:
        A 32-character hex string suitable for distributed tracing.
    """
    return uuid.uuid4().hex


def redact_secrets(data: Dict[str, Any], keys: tuple = (\"password\", \"token\", \"secret\", \"api_key\")) -> Dict[str, Any]:
    """Return a shallow copy with sensitive values replaced by ``***``.

    Args:
        data: The dictionary to redact.
        keys: Case-insensitive substrings that identify secret fields.

    Returns:
        A new dictionary with matching values masked.
    """
    result: Dict[str, Any] = {}
    for key, value in data.items():
        if any(s in key.lower() for s in keys):
            result[key] = \"***\"
        else:
            result[key] = value
    return result


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        entry: Dict[str, Any] = {
            \"ts\": datetime.now(timezone.utc).isoformat(),
            \"level\": record.levelname,
            \"logger\": record.name,
            \"message\": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            entry[\"error\"] = str(record.exc_info[1])
        return json.dumps(entry, ensure_ascii=True)


class Timer:
    """Measure elapsed wall-clock time for a code block.

    Usage::

        with Timer() as t:
            do_work()
        logger.info(\"took %d ms\", t.elapsed_ms)
    """

    def __init__(self) -> None:
        self._start: float = 0.0
        self.elapsed_ms: int = 0

    def __enter__(self) -> \"Timer\":
        self._start = time.monotonic()
        return self

    def __exit__(self, *exc: object) -> None:
        self.elapsed_ms = max(0, int((time.monotonic() - self._start) * 1000))
