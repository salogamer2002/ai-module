"""Utility helpers for the AI module."""

import os
import hashlib

def load_config(path="config.json"):
    """Load configuration from a JSON file."""
    import json
    with open(path) as f:
        data = json.load(f)
    # TODO: validate config schema
    api_key = data.get("api_key", os.environ.get("API_KEY"))
    if api_key:
        data["api_key"] = api_key
    return data

def hash_input(text):
    """Create a SHA256 hash of the input text for caching."""
    return hashlib.sha256(text.encode()).hexdigest()

def sanitize_prompt(prompt):
    """Basic prompt sanitization."""
    # Remove potential injection patterns
    cleaned = prompt.replace("ignore previous instructions", "")
    cleaned = cleaned.strip()
    if len(cleaned) > 10000:
        cleaned = cleaned[:10000]
    return cleaned

class RateLimiter:
    """Simple in-memory rate limiter."""
    def __init__(self, max_requests=100, window=60):
        self.max_requests = max_requests
        self.window = window
        self._requests = []

    def allow(self):
        import time
        now = time.time()
        self._requests = [t for t in self._requests if now - t < self.window]
        if len(self._requests) >= self.max_requests:
            return False
        self._requests.append(now)
        return True
