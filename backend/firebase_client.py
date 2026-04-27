"""
Firebase Admin SDK: Firestore + Auth (verify ID tokens, load users).

Credentials (pick one):
  • FIREBASE_SERVICE_ACCOUNT_PATH — path to the service account JSON from
    Firebase Console → Project settings → Service accounts → Generate new key.
    Relative paths are resolved against the backend/ directory (this file’s parent),
    so the same .env works on any machine once the key file sits beside it.
  • GOOGLE_APPLICATION_CREDENTIALS — same path (standard Google env var).
  • FIREBASE_SERVICE_ACCOUNT_JSON — inline JSON object as a string (e.g. CI).
  • Omit path/json and use Application Default Credentials (gcloud auth
    application-default login, or GCP runtime).

Optional:
  FIREBASE_PROJECT_ID — required for ADC if the key JSON is not used; should match
  NEXT_PUBLIC_FIREBASE_PROJECT_ID in the frontend (e.g. final-8a999).

Emulators (optional):
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _load_backend_dotenv() -> None:
    """Load `backend/.env` so FIREBASE_* and API_* work without exporting in the shell."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.is_file():
        load_dotenv(env_path)


_load_backend_dotenv()

import firebase_admin
from firebase_admin import auth, credentials, firestore
from google.cloud.firestore import Client as FirestoreClient

_initialized = False


def _backend_root() -> Path:
    return Path(__file__).resolve().parent


def _resolve_env_path(raw: str) -> str:
    """Resolve credential file paths: relative → backend/ directory, not process cwd."""
    p = Path(raw.strip())
    if p.is_absolute():
        return str(p)
    return str((_backend_root() / p).resolve())


def _build_app_options() -> dict[str, str] | None:
    pid = (
        os.environ.get("FIREBASE_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
    )
    if pid:
        return {"projectId": pid}
    return None


def _load_credential() -> Any:
    sa_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS"
    )
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw:
        stripped = raw.strip()
        if stripped.startswith("{"):
            return credentials.Certificate(json.loads(stripped))
        return credentials.Certificate(_resolve_env_path(stripped))
    if sa_path:
        return credentials.Certificate(_resolve_env_path(sa_path))
    return credentials.ApplicationDefault()


def init_firebase() -> None:
    """Idempotent: safe to call from every request handler."""
    global _initialized
    if _initialized:
        return
    if firebase_admin._apps:
        _initialized = True
        return

    cred = _load_credential()
    opts = _build_app_options()
    if opts:
        firebase_admin.initialize_app(cred, opts)
    else:
        firebase_admin.initialize_app(cred)
    _initialized = True


def get_firestore_client() -> FirestoreClient:
    """Returns the default Firestore client for this Firebase project."""
    init_firebase()
    return firestore.client()


def verify_id_token(id_token: str, *, check_revoked: bool = False) -> dict[str, Any]:
    """
    Validate a Firebase Auth ID token from the client (Authorization: Bearer …).
    Returns decoded claims (includes 'uid', 'email', 'sub', etc.).
    Raises firebase_admin.auth.InvalidIdTokenError on failure.
    """
    init_firebase()
    return auth.verify_id_token(id_token, check_revoked=check_revoked)


def uid_from_authorization_header(value: str | None) -> str | None:
    """
    Parse `Authorization: Bearer <idToken>` and return Firebase uid, or None.
    Raises the same exceptions as verify_id_token if the header is present but invalid.
    """
    if not value:
        return None
    parts = value.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    claims = verify_id_token(token)
    uid = claims.get("uid")
    return str(uid) if uid else None


def get_auth_user(uid: str) -> auth.UserRecord:
    """Load a user by Firebase Auth uid."""
    init_firebase()
    return auth.get_user(uid)


def get_user_document(uid: str) -> dict[str, Any] | None:
    """Read `users/{uid}` from Firestore (same path as the Next.js app)."""
    db = get_firestore_client()
    snap = db.collection("users").document(uid).get()
    if not snap.exists:
        return None
    return snap.to_dict()


if __name__ == "__main__":
    init_firebase()
    db = get_firestore_client()
    print("Firestore OK, project:", db.project)
