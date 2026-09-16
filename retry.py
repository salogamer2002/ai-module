"""Retry logic with exponential backoff.

Provides a decorator and a context manager for retrying
transient failures with configurable backoff.
"""

from __future__ import annotations

import random
import time
from typing import Callable, TypeVar

T = TypeVar(\"T\")


def retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    jitter: bool = True,
) -> Callable:
    """Decorator that retries a function on exception.

    Args:
        max_attempts: Maximum number of attempts (including the first).
        base_delay: Initial delay in seconds between retries.
        max_delay: Cap on the delay to prevent excessive waits.
        jitter: Add random jitter to prevent thundering herd.

    Returns:
        A decorator that wraps the target function.
    """
    if max_attempts < 1:
        raise ValueError(\"max_attempts must be at least 1\")

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        def wrapper(*args: object, **kwargs: object) -> T:
            last_error: Exception = RuntimeError(\"unreachable\")
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as exc:
                    last_error = exc
                    if attempt == max_attempts:
                        break
                    delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
                    if jitter:
                        delay *= 0.5 + random.random()
                    time.sleep(delay)
            raise last_error
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper
    return decorator
