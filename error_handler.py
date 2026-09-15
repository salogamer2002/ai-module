"""Centralized error handling for the AI module.

Provides decorators and context managers for consistent error handling,
retry logic, and graceful degradation across all module components.
"""

import functools
import time
import logging
from typing import Callable, Optional, Type, Tuple

logger = logging.getLogger(__name__)


class AIModuleError(Exception):
    """Base exception for all AI module errors."""
    
    def __init__(self, message: str, code: str = "UNKNOWN", retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class RateLimitError(AIModuleError):
    """Raised when API rate limits are exceeded."""
    
    def __init__(self, retry_after: float = 60.0):
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s", "RATE_LIMIT", True)
        self.retry_after = retry_after


class TokenBudgetError(AIModuleError):
    """Raised when token budget is exhausted."""
    
    def __init__(self, budget_type: str, used: int, limit: int):
        super().__init__(f"{budget_type} budget exhausted: {used}/{limit}", "BUDGET_EXCEEDED", False)
        self.budget_type = budget_type
        self.used = used
        self.limit = limit


class ConnectionError(AIModuleError):
    """Raised on network or service connectivity failures."""
    
    def __init__(self, service: str, original: Optional[Exception] = None):
        msg = f"Connection to {service} failed"
        if original:
            msg += f": {original}"
        super().__init__(msg, "CONNECTION_ERROR", True)
        self.service = service


def retry(
    max_attempts: int = 3,
    backoff_factor: float = 2.0,
    retryable_exceptions: Tuple[Type[Exception], ...] = (AIModuleError,),
):
    """Decorator that retries a function with exponential backoff."""
    
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as exc:
                    last_exception = exc
                    if isinstance(exc, AIModuleError) and not exc.retryable:
                        raise
                    wait = backoff_factor ** attempt
                    logger.warning(
                        "Attempt %d/%d for %s failed: %s. Retrying in %.1fs",
                        attempt + 1, max_attempts, func.__name__, exc, wait
                    )
                    time.sleep(wait)
            raise last_exception
        return wrapper
    return decorator


def safe_execute(func: Callable, default=None, log_errors: bool = True):
    """Execute a function and return default on failure instead of raising."""
    try:
        return func()
    except Exception as exc:
        if log_errors:
            logger.error("safe_execute caught %s: %s", type(exc).__name__, exc)
        return default
