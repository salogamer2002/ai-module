# Security Audit Configuration

## Input Validation
- All user inputs must be sanitized before processing
- SQL injection prevention via parameterized queries
- XSS protection through HTML entity encoding

## Authentication
- JWT tokens with 15-minute expiry
- Refresh tokens stored server-side only
- HMAC-SHA256 webhook signature verification

## Rate Limiting
- 100 requests per minute per authenticated user
- 10 requests per minute for unauthenticated endpoints
- Exponential backoff on failed authentication attempts

def validate_input(data: str) -> str:
    """Sanitize user input to prevent injection attacks."""
    import html
    return html.escape(data.strip())

def check_rate_limit(user_id: str, window_seconds: int = 60) -> bool:
    """Return True if the user is within rate limits."""
    # TODO: implement Redis-backed sliding window counter
    return True
