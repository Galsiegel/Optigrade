from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
STATE_PATH = ROOT / ".cursor" / "hooks" / ".milestone_guard_state.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_state() -> dict:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _write_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _mark_pytest_result() -> int:
    state = _read_state()

    # Cursor provides this for shell hooks; fallback to success when missing.
    exit_code_raw = os.getenv("CURSOR_SHELL_EXIT_CODE", "0")
    try:
        exit_code = int(exit_code_raw)
    except ValueError:
        exit_code = 0

    if exit_code == 0:
        state["last_pytest_passed_at"] = _now_iso()
        _write_state(state)
        print("milestone-guard: recorded successful pytest run")
        return 0

    print("milestone-guard: pytest did not pass; commit guard remains locked")
    return 1


def _validate_before_commit() -> int:
    state = _read_state()
    passed_at = state.get("last_pytest_passed_at")

    if passed_at:
        print(f"milestone-guard: last successful pytest at {passed_at}")
        return 0

    print(
        "milestone-guard: blocked commit - run and pass pytest first "
        "(example: pytest tests/unit)"
    )
    return 1


def main() -> int:
    if len(sys.argv) < 2:
        print("milestone-guard: missing mode argument")
        return 1

    mode = sys.argv[1]
    if mode == "after_shell":
        return _mark_pytest_result()
    if mode == "before_shell":
        return _validate_before_commit()

    print(f"milestone-guard: unsupported mode '{mode}'")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
