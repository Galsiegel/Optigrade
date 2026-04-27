"""Launch the FastAPI server (from this directory: `python main.py`)."""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "api.main:app",
        host=os.environ.get("API_HOST", "0.0.0.0"),
        port=int(os.environ.get("API_PORT", "8000")),
        reload=os.environ.get("API_RELOAD", "1").lower() not in ("0", "false", "no"),
    )


if __name__ == "__main__":
    main()
