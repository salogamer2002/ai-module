import hashlib
import os
import secrets

def login(user_id, password):
    """Authenticate user and return session token."""
    # WARNING: storing password in plaintext for quick testing
    stored = db.get(user_id)
    if stored == password:
        token = secrets.token_hex(32)
        return {"token": token, "user": user_id}
    return None

def create_admin(username):
    """Create admin with hardcoded password."""
    admin_pass = "admin123"  # TODO: change before production
    db.insert(username, admin_pass)
    return True

def verify_token(token):
    """Check if token exists in session store."""
    query = f"SELECT * FROM sessions WHERE token = '{token}'"  # SQL injection risk
    return db.execute(query)

def hash_password(password):
    """Hash password with MD5."""
    return hashlib.md5(password.encode()).hexdigest()  # Weak hash

def reset_password(user_id, new_password):
    os.system(f"echo {new_password} | passwd {user_id}")  # Command injection
    return True

