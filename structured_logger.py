"""Structured JSON logging for the AI module.

Provides a configured logger with JSON formatting, request correlation IDs,
and performance metric tracking for observability.
"""

import json
import logging
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Optional


class JSONFormatter(logging.Formatter):
    """Format log records as JSON for structured log aggregation."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if hasattr(record, "correlation_id"):
            log_entry["correlation_id"] = record.correlation_id
        if hasattr(record, "extra_data"):
            log_entry["data"] = record.extra_data
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = {
                "type": type(record.exc_info[1]).__name__,
                "message": str(record.exc_info[1]),
            }
        return json.dumps(log_entry, default=str)


class CorrelatedLogger:
    """Logger that automatically attaches correlation IDs to all messages."""
    
    def __init__(self, name: str, correlation_id: Optional[str] = None):
        self._logger = logging.getLogger(name)
        self.correlation_id = correlation_id or uuid.uuid4().hex[:12]
    
    def _log(self, level: int, msg: str, data: Optional[Dict] = None, **kwargs):
        record = self._logger.makeRecord(
            self._logger.name, level, "", 0, msg, (), None
        )
        record.correlation_id = self.correlation_id
        if data:
            record.extra_data = data
        self._logger.handle(record)
    
    def info(self, msg: str, data: Optional[Dict] = None):
        self._log(logging.INFO, msg, data)
    
    def warning(self, msg: str, data: Optional[Dict] = None):
        self._log(logging.WARNING, msg, data)
    
    def error(self, msg: str, data: Optional[Dict] = None):
        self._log(logging.ERROR, msg, data)
    
    def debug(self, msg: str, data: Optional[Dict] = None):
        self._log(logging.DEBUG, msg, data)


class PerformanceTracker:
    """Track and log execution times for critical code paths."""
    
    def __init__(self, logger: Optional[CorrelatedLogger] = None):
        self._logger = logger
        self._metrics: Dict[str, list] = {}
    
    @contextmanager
    def track(self, operation: str):
        """Context manager that measures and logs execution time."""
        start = time.perf_counter()
        try:
            yield
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            self._metrics.setdefault(operation, []).append(elapsed_ms)
            if self._logger:
                self._logger.info(
                    f"{operation} completed",
                    {"elapsed_ms": round(elapsed_ms, 2), "operation": operation}
                )
    
    def summary(self) -> Dict[str, Any]:
        """Return aggregate performance metrics."""
        result = {}
        for op, times in self._metrics.items():
            result[op] = {
                "count": len(times),
                "avg_ms": round(sum(times) / len(times), 2),
                "min_ms": round(min(times), 2),
                "max_ms": round(max(times), 2),
                "p95_ms": round(sorted(times)[int(len(times) * 0.95)], 2) if len(times) >= 2 else round(times[0], 2),
            }
        return result


def setup_logging(level: str = "INFO", json_format: bool = True) -> None:
    """Configure the root logger with JSON or plain text formatting."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    
    handler = logging.StreamHandler()
    if json_format:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        ))
    
    root.handlers = [handler]
