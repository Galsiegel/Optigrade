from __future__ import annotations

import json
import os
import tempfile
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from api.deps import require_firebase_uid
from student_loader.parse_transcript import TranscriptData, parse_transcript_pdf

router = APIRouter()

# Technion transcripts are usually small; cap to avoid abuse.
_MAX_TRANSCRIPT_BYTES = 15 * 1024 * 1024


def _transcript_to_jsonable(data: TranscriptData) -> dict[str, Any]:
    return {
        "student_name": data.student_name,
        "student_id": data.student_id,
        "degree": data.degree,
        "faculty": data.faculty,
        "accumulated_credits": data.accumulated_credits,
        "required_credits": data.required_credits,
        "gpa": data.gpa,
        "courses": [
            {
                "course_id": c.course_id,
                "raw_pdf_id": c.raw_pdf_id,
                "name": c.name,
                "credits": c.credits,
                "grade": c.grade,
                "semester": c.semester,
                "is_numeric_grade": c.is_numeric_grade,
                "is_pass": c.is_pass,
                "is_exemption": c.is_exemption,
            }
            for c in data.courses
        ],
        "student_profile": data.to_student_profile_dict(),
    }


@router.post(
    "/transcripts/parse-pdf",
    summary="Parse a Technion grades transcript PDF",
    response_model=None,
)
async def parse_transcript_upload(
    _uid: Annotated[str, Depends(require_firebase_uid)],
    file: Annotated[UploadFile, File(description="Official Technion transcript PDF (English)")],
) -> dict[str, Any]:
    """
    Accepts a PDF upload, writes it to a temp file, and runs `parse_transcript_pdf`.
    Requires a valid Firebase ID token (same as `/api/v1/me`).
    """
    raw = await file.read()
    if len(raw) > _MAX_TRANSCRIPT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="הקובץ גדול מדי",
        )
    if len(raw) < 8 or not raw.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הקובץ אינו PDF תקין",
        )

    tmp_path: str | None = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
        try:
            os.write(fd, raw)
        finally:
            os.close(fd)

        try:
            data = parse_transcript_pdf(tmp_path)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="לא ניתן לנתח את גיליון הציונים. ודאו שזה גיליון רשמי באנגלית.",
            ) from None

        payload = _transcript_to_jsonable(data)
        print(
            "[optigrade] POST /api/v1/transcripts/parse-pdf — parsed transcript JSON:",
            flush=True,
        )
        print(json.dumps(payload, ensure_ascii=False, indent=2), flush=True)
        return payload
    finally:
        if tmp_path and os.path.isfile(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
