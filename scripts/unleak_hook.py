#!/usr/bin/env python3
"""Minimal Claude Code hook entrypoint for unleak."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from validate_release import detect_violations, load_json


RAW_EXPORT_HINTS = [
    "select *",
    ".csv",
    ".sqlite",
    ".db",
    "dump",
    "export",
    "cat ",
    "cp ",
    "scp ",
    "curl ",
    "aws s3 cp",
    ".parquet",
]

SAFE_SCRIPT_HINTS = [
    "validate_release.py",
    "discover_sources.py",
    "init_policy.py",
]


def read_payload() -> dict:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def project_policy_exists() -> bool:
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))
    return (project_dir / ".unleak" / "policy.json").exists()


def default_policy_path() -> Path:
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))
    return project_dir / ".unleak" / "policy.json"


def command_text(payload: dict) -> str:
    tool_input = payload.get("tool_input", {})
    text = json.dumps(tool_input).lower()
    return text


def is_safe_script_invocation(text: str) -> bool:
    return any(hint in text for hint in SAFE_SCRIPT_HINTS)


def post_tool_paths(payload: dict) -> tuple[Path | None, Path | None, Path | None]:
    tool_output = payload.get("tool_output", {})
    policy_path = (
        tool_output.get("policy_path")
        or os.environ.get("UNLEAK_POLICY_PATH")
        or default_policy_path()
    )
    lineage_path = tool_output.get("lineage_path") or os.environ.get("UNLEAK_LINEAGE_PATH")
    artifact_path = tool_output.get("artifact_path") or os.environ.get("UNLEAK_ARTIFACT_PATH")
    return tuple(Path(item) if item else None for item in (policy_path, lineage_path, artifact_path))


def block(reason: str) -> int:
    sys.stderr.write(reason + "\n")
    return 2


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "pre-tool"
    payload = read_payload()

    if mode == "user-prompt" and not project_policy_exists():
        sys.stdout.write(
            "Unleak setup is missing. Classify sources and create .unleak/policy.json before data analysis.\n"
        )
        return 0

    if mode == "pre-tool":
        text = command_text(payload)
        if any(hint in text for hint in RAW_EXPORT_HINTS) and not is_safe_script_invocation(text):
            return block(
                "Blocked by unleak: possible raw data export or direct dataset read. "
                "Create a local analysis script and validate a sanitized artifact instead."
            )

    if mode == "post-tool":
        policy_path, lineage_path, artifact_path = post_tool_paths(payload)
        if policy_path and lineage_path:
            if not policy_path.exists():
                return block(
                    "Blocked by unleak post-tool validation: missing policy file at "
                    + str(policy_path)
                )
            policy = load_json(policy_path)
            lineage = load_json(lineage_path)
            artifact = load_json(artifact_path) if artifact_path else None
            violations = detect_violations(policy, lineage, artifact)
            if violations:
                sys.stdout.write(
                    json.dumps({"ok": False, "violations": violations}, indent=2) + "\n"
                )
                return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
