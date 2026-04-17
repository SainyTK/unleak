#!/usr/bin/env python3
"""Verify committed repo artifacts that should stay in sync."""

from __future__ import annotations

import argparse
import csv
import json
import os
import statistics
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE_DIR = ROOT / "examples" / "branch_analysis"
DERIVED_DIR = EXAMPLE_DIR / "derived"
OPTIONAL_JSON_DIRS = [
    ROOT / ".claude-plugin",
    ROOT / "plugins" / "unleak",
]
OPTIONAL_JSON_FILES = [
    ROOT / "gemini-extension.json",
]

SCRIPT_DIR = ROOT / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from validate_release import detect_violations, load_json  # noqa: E402
from sync_packaging import build_outputs  # noqa: E402


def _load_rows() -> list[dict[str, str]]:
    with (EXAMPLE_DIR / "raw_branch_metrics.csv").open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _branch_alias(index: int) -> str:
    return f"BR-{index:03d}"


def _risk_band(health_index: float, returns_rate: float) -> str:
    if health_index < 90 or returns_rate >= 0.07:
        return "high"
    if health_index < 100 or returns_rate >= 0.05:
        return "watch"
    return "low"


def _returns_band(returns_rate: float) -> str:
    if returns_rate >= 0.07:
        return "elevated"
    if returns_rate >= 0.05:
        return "watch"
    return "stable"


def _follow_up_action(health_index: float, returns_rate: float) -> str:
    if health_index < 90 and returns_rate >= 0.07:
        return "audit returns workflow"
    if health_index < 90:
        return "review local demand drivers"
    if returns_rate >= 0.05:
        return "inspect post-sale quality signals"
    return "monitor"


def _build_expected_branch_analysis() -> tuple[dict, dict]:
    rows = _load_rows()
    revenues = [float(row["revenue"]) for row in rows]
    baseline = statistics.median(revenues)
    ordered = sorted(revenues)
    entities = []
    group_sizes = {}

    for index, row in enumerate(rows, start=1):
        alias = _branch_alias(index)
        revenue = float(row["revenue"])
        returns_rate = float(row["returns_rate"])
        health_index = round((revenue / baseline) * 100, 1)
        percentile = round(ordered.index(revenue) / max(len(ordered) - 1, 1), 2)
        entities.append(
            {
                "branch_alias": alias,
                "health_index": health_index,
                "risk_band": _risk_band(health_index, returns_rate),
                "returns_band": _returns_band(returns_rate),
                "trend_percentile": percentile,
                "follow_up_action": _follow_up_action(health_index, returns_rate),
            }
        )
        group_sizes[alias] = int(row["orders"])

    lineage = {
        "artifact_path": "examples/branch_analysis/derived/safe_insight_pack.json",
        "source_name": "branch_metrics",
        "source_paths": ["examples/branch_analysis/raw_branch_metrics.csv"],
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
            "returns_band": {
                "ancestors": ["branch_metrics.returns_rate"],
                "transforms": ["band"],
            },
            "trend_percentile": {
                "ancestors": ["branch_metrics.revenue"],
                "transforms": ["percentile_rank"],
            },
            "follow_up_action": {
                "ancestors": ["branch_metrics.revenue", "branch_metrics.returns_rate"],
                "transforms": ["bucket"],
            },
        },
        "group_sizes": group_sizes,
    }
    artifact = {
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
    return artifact, lineage


def verify_branch_analysis_example() -> list[str]:
    issues: list[str] = []
    required_paths = [
        EXAMPLE_DIR / "raw_branch_metrics.csv",
        EXAMPLE_DIR / "policy.json",
        DERIVED_DIR / "safe_insight_pack.json",
        DERIVED_DIR / "lineage.json",
        DERIVED_DIR / "discovery.json",
        DERIVED_DIR / "generated_policy.json",
        EXAMPLE_DIR / "blocked" / "unsafe_branch_extract.json",
        EXAMPLE_DIR / "blocked" / "unsafe_lineage.json",
    ]
    for path in required_paths:
        if not path.exists():
            issues.append(f"missing required example file: {path.relative_to(ROOT)}")
    if issues:
        return issues

    expected_artifact, expected_lineage = _build_expected_branch_analysis()
    actual_artifact = load_json(DERIVED_DIR / "safe_insight_pack.json")
    actual_lineage = load_json(DERIVED_DIR / "lineage.json")
    policy = load_json(EXAMPLE_DIR / "policy.json")

    if actual_artifact != expected_artifact:
        issues.append(
            "example artifact drift: "
            "examples/branch_analysis/derived/safe_insight_pack.json is out of sync"
        )
    if actual_lineage != expected_lineage:
        issues.append(
            "example lineage drift: examples/branch_analysis/derived/lineage.json is out of sync"
        )

    violations = detect_violations(policy, actual_lineage, actual_artifact)
    if violations:
        issues.extend(f"branch_analysis example failed validation: {item}" for item in violations)

    entity_aliases = {
        entry.get("branch_alias")
        for entry in actual_artifact.get("entities", [])
        if isinstance(entry, dict)
    }
    lineage_aliases = set(actual_lineage.get("group_sizes", {}))
    if entity_aliases != lineage_aliases:
        issues.append("branch_analysis aliases do not match lineage group_sizes keys")

    blocked_artifact = EXAMPLE_DIR / "blocked" / "unsafe_branch_extract.json"
    blocked_lineage = EXAMPLE_DIR / "blocked" / "unsafe_lineage.json"
    blocked_result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "validate_release.py"),
            "--policy",
            str(EXAMPLE_DIR / "policy.json"),
            "--lineage",
            str(blocked_lineage),
            "--artifact",
            str(blocked_artifact),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if blocked_result.returncode == 0:
        issues.append("blocked branch_analysis example unexpectedly passed validation")

    return issues


def verify_optional_json_payloads() -> list[str]:
    issues: list[str] = []
    json_paths: list[Path] = []

    for directory in OPTIONAL_JSON_DIRS:
        if directory.exists():
            json_paths.extend(sorted(directory.rglob("*.json")))
    for path in OPTIONAL_JSON_FILES:
        if path.exists():
            json_paths.append(path)

    for path in json_paths:
        try:
            payload = load_json(path)
        except json.JSONDecodeError as exc:
            issues.append(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")
            continue
        if not isinstance(payload, dict):
            issues.append(f"JSON manifest must be an object: {path.relative_to(ROOT)}")

    return issues


def verify_packaging_sync() -> list[str]:
    issues: list[str] = []
    canonical_skill = ROOT / "skills" / "unleak" / "SKILL.md"
    canonical_rule = ROOT / "rules" / "unleak-activate.md"
    if not canonical_skill.exists() or not canonical_rule.exists():
        return issues

    for path, expected in build_outputs().items():
        if not path.exists():
            issues.append(f"generated packaging file is missing: {path.relative_to(ROOT)}")
            continue
        if path.read_text(encoding="utf-8") != expected:
            issues.append(f"generated packaging file drifted: {path.relative_to(ROOT)}")

    return issues


def verify_optional_hook_layout() -> list[str]:
    issues: list[str] = []
    hooks_dir = ROOT / "hooks"
    if not hooks_dir.exists():
        return issues

    readme = hooks_dir / "README.md"
    if not readme.exists():
        issues.append("hooks/ exists but hooks/README.md is missing")

    for shell_path in sorted(hooks_dir.rglob("*.sh")):
        text = shell_path.read_text(encoding="utf-8")
        if not text.startswith("#!"):
            issues.append(f"hook script missing shebang: {shell_path.relative_to(ROOT)}")
        if os.name != "nt" and not os.access(shell_path, os.X_OK):
            issues.append(f"hook script is not executable: {shell_path.relative_to(ROOT)}")

    return issues


def verify_repo() -> list[str]:
    issues: list[str] = []
    issues.extend(verify_branch_analysis_example())
    issues.extend(verify_optional_json_payloads())
    issues.extend(verify_packaging_sync())
    issues.extend(verify_optional_hook_layout())
    return issues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Reserved for future use; current checks are always strict",
    )
    _ = parser.parse_args()

    issues = verify_repo()
    result = {"ok": not issues, "violations": issues}
    print(json.dumps(result, indent=2))
    return 0 if not issues else 2


if __name__ == "__main__":
    raise SystemExit(main())
