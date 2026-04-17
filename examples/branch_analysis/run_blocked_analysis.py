#!/usr/bin/env python3
"""Emit an intentionally unsafe branch artifact and confirm validation fails."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_DIR = Path(__file__).resolve().parent
BLOCKED_DIR = EXAMPLE_DIR / "blocked"


def load_rows() -> list[dict[str, str]]:
    with (EXAMPLE_DIR / "raw_branch_metrics.csv").open(
        encoding="utf-8",
        newline="",
    ) as handle:
        return list(csv.DictReader(handle))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    rows = load_rows()
    artifact_path = BLOCKED_DIR / "unsafe_branch_extract.json"
    lineage_path = BLOCKED_DIR / "unsafe_lineage.json"

    artifact = {
        "artifact_path": str(artifact_path.relative_to(ROOT)),
        "task": "Deliberately unsafe example that leaks exact branch data.",
        "entities": [
            {
                "branch_name": row["branch_name"],
                "revenue": float(row["revenue"]),
                "returns_rate": float(row["returns_rate"]),
            }
            for row in rows
        ],
        "analyst_notes": "North branch revenue is strongest while East is underperforming badly.",
    }
    lineage = {
        "artifact_path": artifact["artifact_path"],
        "fields": {
            "branch_name": {
                "ancestors": ["branch_metrics.branch_name"],
                "transforms": [],
            },
            "revenue": {
                "ancestors": ["branch_metrics.revenue"],
                "transforms": [],
            },
            "returns_rate": {
                "ancestors": ["branch_metrics.returns_rate"],
                "transforms": [],
            },
        },
        "group_sizes": {row["branch_name"]: 1 for row in rows},
    }

    write_json(artifact_path, artifact)
    write_json(lineage_path, lineage)

    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "validate_release.py"),
            "--policy",
            str(EXAMPLE_DIR / "policy.json"),
            "--lineage",
            str(lineage_path),
            "--artifact",
            str(artifact_path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )

    if result.stdout:
        sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
