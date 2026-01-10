import os

def build_invite_link(token: str) -> str:
    frontend_url = os.getenv("FRONTEND_URL")

    if not frontend_url:
        raise RuntimeError("FRONTEND_URL is not set")

    return f"{frontend_url}/accept-invite?token={token}"
