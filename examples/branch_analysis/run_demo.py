#!/usr/bin/env python3
"""Run the full branch-analysis demo pipeline from discovery to validation."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_DIR = Path(__file__).resolve().parent
DERIVED_DIR = EXAMPLE_DIR / "derived"
RAW_SOURCE = EXAMPLE_DIR / "raw_branch_metrics.csv"
NORMALIZED_SOURCE_NAME = "branch_metrics"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        text=True,
        capture_output=True,
        check=False,
    )


def main() -> int:
    raw_discovery_path = DERIVED_DIR / "discovery_raw.json"
    discovery_path = DERIVED_DIR / "discovery.json"
    generated_policy_path = DERIVED_DIR / "generated_policy.json"

    discovery_result = run(
        [
            sys.executable,
            str(ROOT / "scripts" / "discover_sources.py"),
            str(RAW_SOURCE),
        ]
    )
    if discovery_result.returncode != 0:
        sys.stdout.write(discovery_result.stdout)
        sys.stderr.write(discovery_result.stderr)
        return discovery_result.returncode

    raw_summary = json.loads(discovery_result.stdout)
    write_json(raw_discovery_path, raw_summary)

    source_payload = raw_summary["sources"][RAW_SOURCE.name]
    normalized_summary = {
        "max_initial_sources": raw_summary.get("max_initial_sources", 100),
        "sources": {NORMALIZED_SOURCE_NAME: source_payload},
        "interview_questions": raw_summary.get("interview_questions", []),
    }
    write_json(discovery_path, normalized_summary)

    policy_result = run(
        [
            sys.executable,
            str(ROOT / "scripts" / "init_policy.py"),
            "--discovery-summary",
            str(discovery_path),
            "--output",
            str(generated_policy_path),
        ]
    )
    if policy_result.returncode != 0:
        sys.stdout.write(policy_result.stdout)
        sys.stderr.write(policy_result.stderr)
        return policy_result.returncode

    success_result = run(
        [
            sys.executable,
            str(EXAMPLE_DIR / "run_analysis.py"),
            "--policy",
            str(generated_policy_path),
            "--output-dir",
            str(DERIVED_DIR),
            "--source-name",
            NORMALIZED_SOURCE_NAME,
        ]
    )

    blocked_result = run([sys.executable, str(EXAMPLE_DIR / "run_blocked_analysis.py")])

    summary = {
        "ok": success_result.returncode == 0 and blocked_result.returncode != 0,
        "steps": {
            "discover": str(discovery_path.relative_to(ROOT)),
            "policy": str(generated_policy_path.relative_to(ROOT)),
            "artifact": str((DERIVED_DIR / "safe_insight_pack.json").relative_to(ROOT)),
            "lineage": str((DERIVED_DIR / "lineage.json").relative_to(ROOT)),
            "blocked_artifact": str(
                (EXAMPLE_DIR / "blocked" / "unsafe_branch_extract.json").relative_to(ROOT)
            ),
        },
        "validation": {
            "passing_demo_exit_code": success_result.returncode,
            "blocked_demo_exit_code": blocked_result.returncode,
        },
    }
    print(json.dumps(summary, indent=2))

    if success_result.stdout:
        sys.stdout.write(success_result.stdout)
    if success_result.stderr:
        sys.stderr.write(success_result.stderr)
    if blocked_result.stdout:
        sys.stdout.write(blocked_result.stdout)
    if blocked_result.stderr:
        sys.stderr.write(blocked_result.stderr)
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
