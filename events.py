"""Lightweight event emitter for decoupled communication.

Provides a simple publish-subscribe pattern for components
that need loose coupling without direct dependencies.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable, Dict, List


class EventEmitter:
    """Thread-safe event emitter with typed listeners.

    Usage::

        emitter = EventEmitter()
        emitter.on(\"user.created\", handle_new_user)
        emitter.emit(\"user.created\", user_id=42)
    """

    def __init__(self) -> None:
        self._listeners: Dict[str, List[Callable]] = defaultdict(list)

    def on(self, event: str, callback: Callable[..., Any]) -> None:
        """Register a listener for the given event name.

        Args:
            event: Dot-separated event name.
            callback: Function to invoke when the event fires.
        """
        if not callable(callback):
            raise TypeError(\"callback must be callable\")
        self._listeners[event].append(callback)

    def off(self, event: str, callback: Callable[..., Any]) -> None:
        """Remove a previously registered listener.

        Args:
            event: Event name the callback was registered under.
            callback: The exact function reference to remove.
        """
        listeners = self._listeners.get(event, [])
        self._listeners[event] = [cb for cb in listeners if cb is not callback]

    def emit(self, event: str, **kwargs: Any) -> int:
        """Fire all listeners for the given event.

        Args:
            event: Event name to fire.
            **kwargs: Keyword arguments passed to each listener.

        Returns:
            Number of listeners that were invoked.
        """
        count = 0
        for callback in self._listeners.get(event, []):
            callback(**kwargs)
            count += 1
        return count

    def clear(self, event: str | None = None) -> None:
        """Remove all listeners, optionally for a specific event.

        Args:
            event: If provided, only clear listeners for this event.
        """
        if event is None:
            self._listeners.clear()
        else:
            self._listeners.pop(event, None)
