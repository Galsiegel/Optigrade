from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder

from api.deps import require_firebase_uid
from firebase_client import get_user_document

router = APIRouter()


@router.get("/me", summary="Current user Firestore profile")
def read_me(uid: Annotated[str, Depends(require_firebase_uid)]) -> dict[str, Any]:
    """
    Returns the `users/{uid}` document. Frontend: send
    `Authorization: Bearer <idToken>` from `user.getIdToken()`.
    """
    doc = get_user_document(uid)
    payload = {"uid": uid, "profile": doc}
    return jsonable_encoder(payload)
