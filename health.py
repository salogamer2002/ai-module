"""Health check endpoint for container orchestration.

Returns service readiness and liveness status.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict


@dataclass
class HealthStatus:
    """Represents the health of a single service dependency.

    Attributes:
        name: Human-readable dependency name.
        healthy: Whether the dependency is reachable.
        latency_ms: Round-trip time in milliseconds.
    """

    name: str
    healthy: bool
    latency_ms: int

    def to_dict(self) -> Dict[str, object]:
        """Serialize to a JSON-safe dictionary."""
        return {
            \"name\": self.name,
            \"healthy\": self.healthy,
            \"latency_ms\": self.latency_ms,
        }


def check_health(checks: Dict[str, callable]) -> Dict[str, object]:
    """Run all health checks and return an aggregate report.

    Args:
        checks: Mapping of dependency name to a callable that returns True
                 if the dependency is healthy, False otherwise.

    Returns:
        A dictionary with overall status and per-dependency results.
    """
    results = []
    for name, check_fn in checks.items():
        start = time.monotonic()
        try:
            healthy = bool(check_fn())
        except Exception:
            healthy = False
        elapsed = max(0, int((time.monotonic() - start) * 1000))
        results.append(HealthStatus(name=name, healthy=healthy, latency_ms=elapsed))

    all_healthy = all(r.healthy for r in results)
    return {
        \"status\": \"ok\" if all_healthy else \"degraded\",
        \"checks\": [r.to_dict() for r in results],
    }
