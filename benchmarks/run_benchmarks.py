#!/usr/bin/env python3
"""Run deterministic benchmark scenarios for unleak."""

from __future__ import annotations

import csv
import json
import statistics
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BENCHMARKS_DIR = ROOT / "benchmarks"
SCENARIOS_DIR = BENCHMARKS_DIR / "scenarios"
RESULTS_DIR = BENCHMARKS_DIR / "results"
VALIDATOR = ROOT / "scripts" / "validate_release.py"
HARNESS_VERSION = 1


@dataclass(frozen=True)
class ScenarioSpec:
    scenario_id: str
    title: str
    description: str
    raw_csv: Path
    policy: Path
    expected: Path
    artifact_path: str
    blocked_artifact_path: str


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def percentile_map(values: list[float]) -> dict[float, float]:
    ordered = sorted(set(values))
    scale = max(len(ordered) - 1, 1)
    return {value: round(index / scale, 2) for index, value in enumerate(ordered)}


def validate_release(policy: Path, lineage_path: Path, artifact_path: Path) -> dict:
    result = subprocess.run(
        [
            sys.executable,
            str(VALIDATOR),
            "--policy",
            str(policy),
            "--lineage",
            str(lineage_path),
            "--artifact",
            str(artifact_path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    payload = json.loads(result.stdout)
    payload["returncode"] = result.returncode
    if result.stderr:
        payload["stderr"] = result.stderr
    return payload


def retail_alias(index: int) -> str:
    return f"RB-{index:03d}"


def support_alias(index: int) -> str:
    return f"SQ-{index:03d}"


def retail_attention(health_index: float, returns_rate: float) -> str:
    if health_index < 88 or returns_rate >= 0.075:
        return "high"
    if health_index < 98 or returns_rate >= 0.055:
        return "watch"
    return "low"


def support_attention(sla_index: float, escalations: int, csat_score: int) -> str:
    if sla_index >= 125 or escalations >= 16 or csat_score <= 76:
        return "high"
    if sla_index >= 105 or escalations >= 12 or csat_score <= 82:
        return "watch"
    return "low"


def support_safe_score(entity: dict) -> float:
    attention_weight = {"low": 0, "watch": 100, "high": 200}[entity["attention_level"]]
    escalation_weight = {"stable": 0, "elevated": 20, "critical": 50}[entity["escalation_band"]]
    csat_penalty = (1 - entity["csat_percentile"]) * 50
    return round(attention_weight + entity["sla_index"] + escalation_weight + csat_penalty, 2)


def rank_overlap(raw_bottom: list[str], safe_bottom_real_names: list[str]) -> tuple[int, float]:
    overlap = len(set(raw_bottom) & set(safe_bottom_real_names))
    ratio = round(overlap / max(len(raw_bottom), 1), 2)
    return overlap, ratio


def check_expected_bottom(scenario_id: str, expected: dict, raw_bottom: list[str]) -> None:
    if raw_bottom != expected["raw_bottom_entities"]:
        raise ValueError(
            f"{scenario_id} raw ranking drifted: expected {expected['raw_bottom_entities']}, got {raw_bottom}"
        )


def build_retail_safe(rows: list[dict[str, str]], spec: ScenarioSpec) -> tuple[dict, dict, list[str], list[str]]:
    revenues = [float(row["revenue"]) for row in rows]
    revenue_percentiles = percentile_map(revenues)
    baseline = statistics.median(revenues)
    sorted_rows = sorted(rows, key=lambda row: float(row["revenue"]))
    raw_bottom = [row["branch_name"] for row in sorted_rows[:3]]
    alias_map: dict[str, str] = {}
    entities = []
    group_sizes = {}

    for index, row in enumerate(rows, start=1):
        alias = retail_alias(index)
        revenue = float(row["revenue"])
        returns_rate = float(row["returns_rate"])
        health_index = round((revenue / baseline) * 100, 1)
        entity = {
            "branch_alias": alias,
            "health_index": health_index,
            "risk_band": retail_attention(health_index, returns_rate),
            "trend_percentile": revenue_percentiles[revenue],
        }
        entities.append(entity)
        alias_map[alias] = row["branch_name"]
        group_sizes[alias] = int(row["orders"])

    safe_bottom_aliases = [
        item["branch_alias"]
        for item in sorted(entities, key=lambda item: (item["health_index"], item["trend_percentile"]))[:3]
    ]
    safe_bottom_real_names = [alias_map[alias] for alias in safe_bottom_aliases]
    lineage = {
        "artifact_path": spec.artifact_path,
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
    artifact = {
        "artifact_path": spec.artifact_path,
        "scenario_id": spec.scenario_id,
        "task": "Rank weak retail branches without exposing names or exact revenue.",
        "schema": {
            "branch_alias": "stable pseudonym for local join-back",
            "health_index": "median-relative revenue index where 100 is the median branch",
            "risk_band": ["low", "watch", "high"],
            "trend_percentile": "revenue percentile across branches",
        },
        "entities": entities,
        "prompt_template": "Use only branch_alias, health_index, risk_band, and trend_percentile.",
        "lineage": lineage,
    }
    return artifact, lineage, raw_bottom, safe_bottom_real_names


def build_retail_blocked(rows: list[dict[str, str]], spec: ScenarioSpec) -> tuple[dict, dict]:
    entities = []
    group_sizes = {}
    for row in rows:
        name = row["branch_name"]
        entities.append(
            {
                "branch_name": name,
                "exact_revenue": float(row["revenue"]),
            }
        )
        group_sizes[name] = int(row["orders"])
    lineage = {
        "artifact_path": spec.blocked_artifact_path,
        "fields": {
            "branch_name": {
                "ancestors": ["branch_metrics.branch_name"],
                "transforms": [],
            },
            "exact_revenue": {
                "ancestors": ["branch_metrics.revenue"],
                "transforms": [],
            },
        },
        "group_sizes": group_sizes,
    }
    artifact = {
        "artifact_path": spec.blocked_artifact_path,
        "scenario_id": spec.scenario_id,
        "entities": entities,
        "lineage": lineage,
    }
    return artifact, lineage


def build_support_safe(rows: list[dict[str, str]], spec: ScenarioSpec) -> tuple[dict, dict, list[str], list[str]]:
    resolution_hours = [float(row["avg_resolution_hours"]) for row in rows]
    csat_scores = [int(row["csat_score"]) for row in rows]
    csat_percentiles = percentile_map(csat_scores)
    baseline = statistics.median(resolution_hours)
    raw_ranked = sorted(
        rows,
        key=lambda row: (
            float(row["avg_resolution_hours"]) * 2.0
            + int(row["escalations"]) * 3.0
            + (100 - int(row["csat_score"])) * 1.5
        ),
        reverse=True,
    )
    raw_bottom = [row["queue_name"] for row in raw_ranked[:3]]
    alias_map: dict[str, str] = {}
    entities = []
    group_sizes = {}

    for index, row in enumerate(rows, start=1):
        alias = support_alias(index)
        resolution = float(row["avg_resolution_hours"])
        escalations = int(row["escalations"])
        csat_score = int(row["csat_score"])
        sla_index = round((resolution / baseline) * 100, 1)
        entity = {
            "queue_alias": alias,
            "sla_index": sla_index,
            "escalation_band": "critical" if escalations >= 16 else "elevated" if escalations >= 12 else "stable",
            "csat_percentile": csat_percentiles[csat_score],
            "attention_level": support_attention(sla_index, escalations, csat_score),
        }
        entities.append(entity)
        alias_map[alias] = row["queue_name"]
        group_sizes[alias] = int(row["ticket_count"])

    safe_bottom_aliases = [
        item["queue_alias"]
        for item in sorted(entities, key=support_safe_score, reverse=True)[:3]
    ]
    safe_bottom_real_names = [alias_map[alias] for alias in safe_bottom_aliases]
    lineage = {
        "artifact_path": spec.artifact_path,
        "fields": {
            "queue_alias": {
                "ancestors": ["support_metrics.queue_name"],
                "transforms": ["alias"],
            },
            "sla_index": {
                "ancestors": ["support_metrics.avg_resolution_hours"],
                "transforms": ["median_relative_index"],
            },
            "escalation_band": {
                "ancestors": ["support_metrics.escalations"],
                "transforms": ["bucket"],
            },
            "csat_percentile": {
                "ancestors": ["support_metrics.csat_score"],
                "transforms": ["percentile_rank"],
            },
            "attention_level": {
                "ancestors": [
                    "support_metrics.avg_resolution_hours",
                    "support_metrics.escalations",
                    "support_metrics.csat_score",
                ],
                "transforms": ["bucket"],
            },
        },
        "group_sizes": group_sizes,
    }
    artifact = {
        "artifact_path": spec.artifact_path,
        "scenario_id": spec.scenario_id,
        "task": "Prioritize struggling support queues without exposing queue names or raw ticket text.",
        "schema": {
            "queue_alias": "stable pseudonym for local join-back",
            "sla_index": "median-relative average resolution index where 100 is the median queue",
            "escalation_band": ["stable", "elevated", "critical"],
            "csat_percentile": "queue percentile based on csat_score",
            "attention_level": ["low", "watch", "high"],
        },
        "entities": entities,
        "prompt_template": "Use only queue_alias, sla_index, escalation_band, csat_percentile, and attention_level.",
        "lineage": lineage,
    }
    return artifact, lineage, raw_bottom, safe_bottom_real_names


def build_support_blocked(rows: list[dict[str, str]], spec: ScenarioSpec) -> tuple[dict, dict]:
    entities = []
    group_sizes = {}
    for row in rows:
        name = row["queue_name"]
        entities.append(
            {
                "queue_name": name,
                "ticket_summary": row["ticket_summary"],
            }
        )
        group_sizes[name] = int(row["ticket_count"])
    lineage = {
        "artifact_path": spec.blocked_artifact_path,
        "fields": {
            "queue_name": {
                "ancestors": ["support_metrics.queue_name"],
                "transforms": [],
            },
            "ticket_summary": {
                "ancestors": ["support_metrics.ticket_summary"],
                "transforms": [],
            },
        },
        "group_sizes": group_sizes,
    }
    artifact = {
        "artifact_path": spec.blocked_artifact_path,
        "scenario_id": spec.scenario_id,
        "entities": entities,
        "lineage": lineage,
    }
    return artifact, lineage


def build_scenario(spec: ScenarioSpec) -> dict:
    rows = load_csv(spec.raw_csv)
    expected = load_json(spec.expected)
    result_dir = RESULTS_DIR / spec.scenario_id

    if spec.scenario_id == "retail_branch":
        safe_artifact, safe_lineage, raw_bottom, safe_bottom_real_names = build_retail_safe(rows, spec)
        blocked_artifact, blocked_lineage = build_retail_blocked(rows, spec)
    elif spec.scenario_id == "support_ticket_trends":
        safe_artifact, safe_lineage, raw_bottom, safe_bottom_real_names = build_support_safe(rows, spec)
        blocked_artifact, blocked_lineage = build_support_blocked(rows, spec)
    else:
        raise ValueError(f"unknown scenario: {spec.scenario_id}")

    check_expected_bottom(spec.scenario_id, expected, raw_bottom)

    safe_artifact_path = result_dir / "safe_artifact.json"
    safe_lineage_path = result_dir / "safe_lineage.json"
    blocked_artifact_path = result_dir / "blocked_artifact.json"
    blocked_lineage_path = result_dir / "blocked_lineage.json"
    write_json(safe_artifact_path, safe_artifact)
    write_json(safe_lineage_path, safe_lineage)
    write_json(blocked_artifact_path, blocked_artifact)
    write_json(blocked_lineage_path, blocked_lineage)

    safe_validation = validate_release(spec.policy, safe_lineage_path, safe_artifact_path)
    blocked_validation = validate_release(spec.policy, blocked_lineage_path, blocked_artifact_path)
    write_json(result_dir / "safe_validation.json", safe_validation)
    write_json(result_dir / "blocked_validation.json", blocked_validation)

    overlap_count, overlap_ratio = rank_overlap(raw_bottom, safe_bottom_real_names)
    return {
        "scenario_id": spec.scenario_id,
        "title": spec.title,
        "description": spec.description,
        "raw_fixture": str(spec.raw_csv.relative_to(ROOT)),
        "policy": str(spec.policy.relative_to(ROOT)),
        "expected": str(spec.expected.relative_to(ROOT)),
        "snapshots": {
            "safe_artifact": str(safe_artifact_path.relative_to(ROOT)),
            "safe_lineage": str(safe_lineage_path.relative_to(ROOT)),
            "safe_validation": str((result_dir / "safe_validation.json").relative_to(ROOT)),
            "blocked_artifact": str(blocked_artifact_path.relative_to(ROOT)),
            "blocked_lineage": str(blocked_lineage_path.relative_to(ROOT)),
            "blocked_validation": str((result_dir / "blocked_validation.json").relative_to(ROOT)),
        },
        "metrics": {
            "task_completion": {
                "safe_release_valid": safe_validation["ok"],
                "blocked_release_rejected": not blocked_validation["ok"],
            },
            "utility": {
                "focus": "bottom_3_entities",
                "raw_bottom_entities": raw_bottom,
                "safe_overlap_count": overlap_count,
                "safe_overlap_ratio": overlap_ratio,
                "safe_bottom_real_names": safe_bottom_real_names,
            },
            "leakage": {
                "baseline_prompt_mode": "raw_extract_direct_to_model",
                "baseline_exposed_high_risk_fields": expected["baseline_exposed_high_risk_fields"],
                "baseline_leakage_rate": 1.0,
                "sanitized_release_ok": safe_validation["ok"],
                "sanitized_violation_count": len(safe_validation["violations"]),
                "blocked_release_ok": blocked_validation["ok"],
                "blocked_violation_count": len(blocked_validation["violations"]),
                "blocked_violation_samples": blocked_validation["violations"][:3],
            },
            "execution": {
                "raw_row_count": len(rows),
                "safe_entity_count": len(safe_artifact["entities"]),
                "minimum_group_size": load_json(spec.policy)["minimum_group_size"],
            },
        },
    }


def specs() -> list[ScenarioSpec]:
    return [
        ScenarioSpec(
            scenario_id="retail_branch",
            title="Retail branch performance analysis",
            description="Compares raw weak-branch ranking against a sanitized safe insight pack.",
            raw_csv=SCENARIOS_DIR / "retail_branch" / "raw_metrics.csv",
            policy=SCENARIOS_DIR / "retail_branch" / "policy.json",
            expected=SCENARIOS_DIR / "retail_branch" / "expected.json",
            artifact_path="benchmarks/results/retail_branch/safe_artifact.json",
            blocked_artifact_path="benchmarks/results/retail_branch/blocked_artifact.json",
        ),
        ScenarioSpec(
            scenario_id="support_ticket_trends",
            title="Support ticket trend analysis",
            description="Measures whether queue prioritization survives sanitization when raw ticket text exists.",
            raw_csv=SCENARIOS_DIR / "support_ticket_trends" / "raw_metrics.csv",
            policy=SCENARIOS_DIR / "support_ticket_trends" / "policy.json",
            expected=SCENARIOS_DIR / "support_ticket_trends" / "expected.json",
            artifact_path="benchmarks/results/support_ticket_trends/safe_artifact.json",
            blocked_artifact_path="benchmarks/results/support_ticket_trends/blocked_artifact.json",
        ),
    ]


def main() -> int:
    scenarios = [build_scenario(spec) for spec in specs()]
    summary = {
        "harness_version": HARNESS_VERSION,
        "scenario_count": len(scenarios),
        "schema_path": "evals/benchmark_result.schema.json",
        "results": scenarios,
    }
    write_json(RESULTS_DIR / "benchmark_summary.json", summary)
    print(json.dumps(summary, indent=2))
    failures = [
        scenario["scenario_id"]
        for scenario in scenarios
        if not scenario["metrics"]["task_completion"]["safe_release_valid"]
        or not scenario["metrics"]["task_completion"]["blocked_release_rejected"]
    ]
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
