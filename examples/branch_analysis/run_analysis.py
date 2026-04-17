#!/usr/bin/env python3
"""Build and validate a safe branch insight pack from local raw data."""

from __future__ import annotations

import csv
import json
import statistics
import subprocess
import sys
from argparse import ArgumentParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_DIR = Path(__file__).resolve().parent
DERIVED_DIR = EXAMPLE_DIR / "derived"
TEMPLATE_PATH = ROOT / "assets" / "templates" / "safe_insight_pack_template.json"


def load_rows() -> list[dict[str, str]]:
    with (EXAMPLE_DIR / "raw_branch_metrics.csv").open(
        encoding="utf-8",
        newline="",
    ) as handle:
        return list(csv.DictReader(handle))


def load_template() -> dict:
    with TEMPLATE_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def branch_alias(index: int) -> str:
    return f"BR-{index:03d}"


def risk_band(health_index: float, returns_rate: float) -> str:
    if health_index < 90 or returns_rate >= 0.07:
        return "high"
    if health_index < 100 or returns_rate >= 0.05:
        return "watch"
    return "low"


def returns_band(returns_rate: float) -> str:
    if returns_rate >= 0.07:
        return "elevated"
    if returns_rate >= 0.05:
        return "watch"
    return "stable"


def follow_up_action(health_index: float, returns_rate: float) -> str:
    if health_index < 90 and returns_rate >= 0.07:
        return "audit returns workflow"
    if health_index < 90:
        return "review local demand drivers"
    if returns_rate >= 0.05:
        return "inspect post-sale quality signals"
    return "monitor"


def build_release(rows: list[dict[str, str]], source_name: str) -> tuple[dict, dict]:
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
                "returns_band": returns_band(returns_rate),
                "trend_percentile": percentile,
                "follow_up_action": follow_up_action(health_index, returns_rate),
            }
        )
        group_sizes[alias] = int(row["orders"])

    lineage = {
        "artifact_path": "examples/branch_analysis/derived/safe_insight_pack.json",
        "source_name": source_name,
        "source_paths": ["examples/branch_analysis/raw_branch_metrics.csv"],
        "fields": {
            "branch_alias": {
                "ancestors": [f"{source_name}.branch_name"],
                "transforms": ["alias"],
            },
            "health_index": {
                "ancestors": [f"{source_name}.revenue"],
                "transforms": ["median_relative_index"],
            },
            "risk_band": {
                "ancestors": [f"{source_name}.revenue", f"{source_name}.returns_rate"],
                "transforms": ["bucket"],
            },
            "returns_band": {
                "ancestors": [f"{source_name}.returns_rate"],
                "transforms": ["band"],
            },
            "trend_percentile": {
                "ancestors": [f"{source_name}.revenue"],
                "transforms": ["percentile_rank"],
            },
            "follow_up_action": {
                "ancestors": [f"{source_name}.revenue", f"{source_name}.returns_rate"],
                "transforms": ["bucket"],
            },
        },
        "group_sizes": group_sizes,
    }

    artifact = load_template()
    artifact.update(
        {
            "artifact_path": lineage["artifact_path"],
            "task": "Rank weak branches without exposing raw names, raw revenue, or raw returns.",
            "schema": {
                "branch_alias": "stable pseudonym for local join-back",
                "health_index": "median-relative revenue index where baseline branch = 100",
                "risk_band": ["low", "watch", "high"],
                "returns_band": ["stable", "watch", "elevated"],
                "trend_percentile": "rank percentile across branches",
                "follow_up_action": "safe local next step derived from approved buckets",
            },
            "entities": entities,
            "prompt_template": (
                "Use only branch_alias, health_index, risk_band, returns_band, "
                "trend_percentile, and follow_up_action."
            ),
            "lineage": lineage,
        }
    )
    return artifact, lineage


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def validate(
    artifact_path: Path,
    lineage_path: Path,
    policy_path: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "validate_release.py"),
            "--policy",
            str(policy_path),
            "--lineage",
            str(lineage_path),
            "--artifact",
            str(artifact_path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )


def parse_args() -> ArgumentParser:
    parser = ArgumentParser()
    parser.add_argument(
        "--policy",
        default=str(EXAMPLE_DIR / "policy.json"),
        help="Path to the policy JSON used for validation.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DERIVED_DIR),
        help="Directory where the artifact and lineage files will be written.",
    )
    parser.add_argument(
        "--source-name",
        default="branch_metrics",
        help="Logical source identifier used in lineage references.",
    )
    return parser


def main() -> int:
    parser = parse_args()
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    artifact, lineage = build_release(load_rows(), args.source_name)
    artifact_path = output_dir / "safe_insight_pack.json"
    lineage_path = output_dir / "lineage.json"
    policy_path = Path(args.policy)

    artifact["artifact_path"] = str(artifact_path.relative_to(ROOT))
    artifact["lineage"]["artifact_path"] = artifact["artifact_path"]
    lineage["artifact_path"] = artifact["artifact_path"]

    write_json(artifact_path, artifact)
    write_json(lineage_path, lineage)

    result = validate(artifact_path, lineage_path, policy_path)
    if result.stdout:
        sys.stdout.write(result.stdout)
    if result.stderr:
        sys.stderr.write(result.stderr)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
