from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user, require_auth
from app.core.security import create_access_token, hash_password, verify_password
from app.database.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse

router = APIRouter()


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        secure=settings.COOKIE_SECURE,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # Check uniqueness
    existing = await db.execute(
        select(User).where((User.email == body.email) | (User.username == body.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or username already taken.")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": user.id})
    _set_auth_cookie(response, token)
    return user


@router.post("/login", response_model=UserResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled.")

    token = create_access_token({"sub": user.id})
    _set_auth_cookie(response, token)
    return user


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user


@router.post("/logout")
async def logout(response: Response, _user: User = Depends(require_auth)):
    response.delete_cookie("access_token")
    return {"message": "Logged out."}


# ── Google OAuth ──────────────────────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("/google")
async def google_login():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured.")
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    from urllib.parse import urlencode
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(code: str, response: Response, db: AsyncSession = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured.")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()

    google_id: str = userinfo["sub"]
    email: str = userinfo.get("email", "")
    avatar_url: str | None = userinfo.get("picture")

    # Upsert user by google_id
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        # Try to find by email (link accounts)
        result2 = await db.execute(select(User).where(User.email == email))
        user = result2.scalar_one_or_none()
        if user:
            user.google_id = google_id
            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url
        else:
            # Generate username from email prefix
            base_username = email.split("@")[0].lower()
            import re
            base_username = re.sub(r"[^a-z0-9_-]", "-", base_username)[:28]
            username = base_username
            counter = 1
            while True:
                existing = await db.execute(select(User).where(User.username == username))
                if not existing.scalar_one_or_none():
                    break
                username = f"{base_username}{counter}"
                counter += 1

            user = User(
                username=username,
                email=email,
                google_id=google_id,
                avatar_url=avatar_url,
            )
            db.add(user)

    await db.commit()
    await db.refresh(user)

    jwt_token = create_access_token({"sub": user.id}, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    # Send the user straight to the editor after OAuth login
    redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}/editor")
    _set_auth_cookie(redirect, jwt_token)
    return redirect


# ── Hack Club OAuth ───────────────────────────────────────────────────────────
# Docs: https://auth.hackclub.com (OAuth 2.0)

HACKCLUB_AUTH_URL = "https://auth.hackclub.com/oauth/authorize"
HACKCLUB_TOKEN_URL = "https://auth.hackclub.com/oauth/token"
HACKCLUB_USERINFO_URL = "https://auth.hackclub.com/api/v1/me"


@router.get("/hackclub")
async def hackclub_login():
    if not settings.HACKCLUB_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Hack Club OAuth not configured.")
    params = {
        "client_id": settings.HACKCLUB_CLIENT_ID,
        "redirect_uri": settings.HACKCLUB_REDIRECT_URI,
        "response_type": "code",
        "scope": "email name slack_id",
    }
    from urllib.parse import urlencode
    url = f"{HACKCLUB_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/hackclub/callback")
async def hackclub_callback(code: str, db: AsyncSession = Depends(get_db)):
    if not settings.HACKCLUB_CLIENT_ID or not settings.HACKCLUB_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Hack Club OAuth not configured.")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            HACKCLUB_TOKEN_URL,
            json={
                "client_id": settings.HACKCLUB_CLIENT_ID,
                "client_secret": settings.HACKCLUB_CLIENT_SECRET,
                "redirect_uri": settings.HACKCLUB_REDIRECT_URI,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {token_resp.text}")
        access_token = token_resp.json()["access_token"]

        userinfo_resp = await client.get(
            HACKCLUB_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Userinfo fetch failed: {userinfo_resp.text}")
        payload = userinfo_resp.json()

    identity = payload.get("identity", {})
    # Stable user id from Hack Club (looks like "ident!47fYo3P")
    hackclub_id: str = identity.get("id", "")
    if not hackclub_id:
        raise HTTPException(status_code=400, detail="Hack Club response missing identity.id")

    email: str = identity.get("primary_email") or ""
    first_name: str = identity.get("first_name") or ""
    last_name: str = identity.get("last_name") or ""
    slack_id: str | None = identity.get("slack_id")

    # Upsert user by hackclub_id first
    result = await db.execute(select(User).where(User.hackclub_id == hackclub_id))
    user = result.scalar_one_or_none()

    if not user and email:
        # Try to link to an existing account with the same email
        result2 = await db.execute(select(User).where(User.email == email))
        user = result2.scalar_one_or_none()
        if user:
            user.hackclub_id = hackclub_id

    if not user:
        # Generate a username, preferring something a human would actually
        # recognise. Order:
        #   1. first_name (e.g. "armand")
        #   2. first_name + last_name (e.g. "armandpackham")
        #   3. email prefix (e.g. "armand" from armand@example.com)
        #   4. hc-<slack_id> (e.g. "hc-u07abep916x") as a last resort.
        # Each candidate is normalised to [a-z0-9_-] and capped at 28 chars.
        import re

        def _normalise(raw: str) -> str:
            cleaned = re.sub(r"[^a-z0-9_-]", "-", raw.strip().lower())
            cleaned = re.sub(r"-+", "-", cleaned).strip("-")
            return cleaned[:28]

        candidates = [
            first_name,
            f"{first_name}{last_name}",
            email.split("@")[0] if email else "",
            f"hc-{slack_id}" if slack_id else "",
        ]
        base = ""
        for c in candidates:
            normalised = _normalise(c) if c else ""
            if normalised:
                base = normalised
                break
        if not base:
            base = "hacker"

        username = base
        counter = 1
        while True:
            existing = await db.execute(select(User).where(User.username == username))
            if not existing.scalar_one_or_none():
                break
            username = f"{base}{counter}"
            counter += 1

        # Fallback email if Hack Club didn't expose one
        user_email = email or f"{username}@hackclub.local"

        user = User(
            username=username,
            email=user_email,
            hackclub_id=hackclub_id,
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)

    jwt_token = create_access_token(
        {"sub": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    redirect = RedirectResponse(url=f"{settings.FRONTEND_URL}/editor")
    _set_auth_cookie(redirect, jwt_token)
    return redirect
