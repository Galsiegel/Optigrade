"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Header, HTTPException, status

from firebase_admin import auth as firebase_auth

from firebase_client import uid_from_authorization_header


def require_firebase_uid(authorization: Annotated[str | None, Header()] = None) -> str:
    """Require `Authorization: Bearer <Firebase ID token>`."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="נדרש כותרת Authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        uid = uid_from_authorization_header(authorization)
    except firebase_auth.InvalidIdTokenError:
        uid = None
    except firebase_auth.ExpiredIdTokenError:
        uid = None
    except firebase_auth.RevokedIdTokenError:
        uid = None
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="אסימון לא תקין או פג תוקף",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return uid
