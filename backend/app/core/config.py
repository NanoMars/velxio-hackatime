from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    DATABASE_URL: str = "sqlite+aiosqlite:///./velxio.db"
    DATA_DIR: str = "."
    # Legacy Google OAuth (kept for backward-compat but not exposed in the UI)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8001/api/auth/google/callback"
    # Hack Club OAuth (primary auth method for this fork)
    HACKCLUB_CLIENT_ID: str = ""
    HACKCLUB_CLIENT_SECRET: str = ""
    HACKCLUB_REDIRECT_URI: str = "http://localhost:8001/api/auth/hackclub/callback"
    FRONTEND_URL: str = "http://localhost:5173"
    # Set to true in production (HTTPS). Controls the Secure flag on the JWT cookie.
    COOKIE_SECURE: bool = False
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
