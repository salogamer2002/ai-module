"""Configuration validator with type-safe environment loading.

All values are validated at startup. No secrets are logged.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass(frozen=True)
class AppConfig:
    """Immutable, validated application configuration.

    Attributes:
        app_name: Human-readable application identifier.
        port: TCP port for the HTTP server (1024-65535).
        debug: Enable verbose logging (never in production).
        allowed_origins: CORS allow-list for browser clients.
        max_retries: Maximum retry attempts for transient failures.
    """

    app_name: str = \"ai-module\"
    port: int = 8080
    debug: bool = False
    allowed_origins: List[str] = field(default_factory=list)
    max_retries: int = 3

    def __post_init__(self) -> None:
        \"\"\"Validate invariants after construction.\"\"\"
        if not 1024 <= self.port <= 65535:
            raise ValueError(f\"port must be 1024-65535, got {self.port}\")
        if self.max_retries < 0:
            raise ValueError(f\"max_retries must be non-negative, got {self.max_retries}\")
        if self.debug:
            import warnings
            warnings.warn(\"debug mode is enabled; disable before deploying\", stacklevel=2)

    @classmethod
    def from_env(cls) -> \"AppConfig\":
        \"\"\"Load configuration from environment variables.

        Returns:
            A validated AppConfig instance.

        Raises:
            ValueError: If any value fails validation.
        \"\"\"
        origins_raw: str = os.getenv(\"ALLOWED_ORIGINS\", \"\")
        origins: List[str] = [o.strip() for o in origins_raw.split(\",\") if o.strip()]
        return cls(
            app_name=os.getenv(\"APP_NAME\", \"ai-module\"),
            port=int(os.getenv(\"PORT\", \"8080\")),
            debug=os.getenv(\"DEBUG\", \"\").lower() in (\"1\", \"true\", \"yes\"),
            allowed_origins=origins,
            max_retries=int(os.getenv(\"MAX_RETRIES\", \"3\")),
        )


def validate_required_env(names: List[str]) -> None:
    \"\"\"Raise if any required environment variables are missing.

    Args:
        names: List of environment variable names to check.

    Raises:
        EnvironmentError: With a message listing all missing variables.
    \"\"\"
    missing: List[str] = [n for n in names if not os.getenv(n)]
    if missing:
        raise EnvironmentError(f\"Missing required env vars: {\", \".join(missing)}\")
