#!/usr/bin/env python3
"""Build and validate a safe branch insight pack from local raw data."""

from __future__ import annotations

import csv
import json
import statistics
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_DIR = Path(__file__).resolve().parent
DERIVED_DIR = EXAMPLE_DIR / "derived"


def load_rows() -> list[dict[str, str]]:
    with (EXAMPLE_DIR / "raw_branch_metrics.csv").open(
        encoding="utf-8",
        newline="",
    ) as handle:
        return list(csv.DictReader(handle))


def branch_alias(index: int) -> str:
    return f"BR-{index:03d}"


def risk_band(health_index: float, returns_rate: float) -> str:
    if health_index < 90 or returns_rate >= 0.07:
        return "high"
    if health_index < 100 or returns_rate >= 0.05:
        return "watch"
    return "low"


def build_release(rows: list[dict[str, str]]) -> tuple[dict, dict]:
    revenues = [float(row["revenue"]) for row in rows]
    baseline = statistics.median(revenues)
    ordered = sorted(revenues)
    entities = []
    group_sizes = {}

    for index, row in enumerate(rows, start=1):
        alias = branch_alias(index)
        revenue = float(row["revenue"])
        returns_rate = float(row["returns_rate"])
        health_index = round((revenue / baseline) * 100, 1)
        percentile = round(ordered.index(revenue) / max(len(ordered) - 1, 1), 2)
        entities.append(
            {
                "branch_alias": alias,
                "health_index": health_index,
                "risk_band": risk_band(health_index, returns_rate),
                "trend_percentile": percentile,
            }
        )
        group_sizes[alias] = int(row["orders"])

    artifact = {
        "artifact_path": "examples/branch_analysis/derived/safe_insight_pack.json",
        "task": "Rank weak branches without exposing raw names or revenue.",
        "schema": {
            "branch_alias": "stable pseudonym for local join-back",
            "health_index": "median-relative revenue index where baseline branch = 100",
            "risk_band": ["low", "watch", "high"],
            "trend_percentile": "rank percentile across branches",
        },
        "entities": entities,
        "prompt_template": "Use only branch_alias, health_index, risk_band, and trend_percentile.",
    }
    lineage = {
        "artifact_path": artifact["artifact_path"],
        "fields": {
            "branch_alias": {
                "ancestors": ["branch_metrics.branch_name"],
                "transforms": ["alias"],
            },
            "health_index": {
                "ancestors": ["branch_metrics.revenue"],
                "transforms": ["median_relative_index"],
            },
            "risk_band": {
                "ancestors": ["branch_metrics.revenue", "branch_metrics.returns_rate"],
                "transforms": ["bucket"],
            },
            "trend_percentile": {
                "ancestors": ["branch_metrics.revenue"],
                "transforms": ["percentile_rank"],
            },
        },
        "group_sizes": group_sizes,
    }
    return artifact, lineage


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def validate(artifact_path: Path, lineage_path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
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


def main() -> int:
    artifact, lineage = build_release(load_rows())
    artifact_path = DERIVED_DIR / "safe_insight_pack.json"
    lineage_path = DERIVED_DIR / "lineage.json"
    write_json(artifact_path, artifact)
    write_json(lineage_path, lineage)

    result = validate(artifact_path, lineage_path)
    if result.stdout:
        sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
