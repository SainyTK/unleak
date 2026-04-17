#!/usr/bin/env python3
"""Bootstrap an unleak policy draft from discovered source metadata."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_POLICY = {
    "version": 1,
    "minimum_group_size": 5,
    "require_aliases_for_entity_names": True,
    "blocked_name_patterns": [
        "name",
        "email",
        "phone",
        "address",
        "revenue",
        "profit",
        "salary",
        "price",
    ],
}


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def field_policy(field_name: str, metadata: dict) -> dict:
    risk = metadata.get("risk", "moderate")
    policy = {"risk": risk, "allow_release": risk == "low"}
    lowered = field_name.lower()
    if lowered.endswith("name"):
        policy["allow_release"] = False
    if risk in {"highest", "high"}:
        policy["allowed_transforms"] = (
            ["alias"] if lowered.endswith("name") else ["bucket", "band", "percentile_rank", "median_relative_index"]
        )
    return policy


def normalize_source(source: dict) -> dict:
    if source.get("tables"):
        fields = {}
        for table_name, table in source["tables"].items():
            for field_name, metadata in table.get("fields", {}).items():
                fields[f"{table_name}.{field_name}"] = field_policy(field_name, metadata)
        return {"fields": fields}
    return {
        "fields": {
            field_name: field_policy(field_name, metadata)
            for field_name, metadata in source.get("fields", {}).items()
        }
    }


def build_policy(summary: dict) -> dict:
    policy = dict(DEFAULT_POLICY)
    policy["sources"] = {
        source_name: normalize_source(source)
        for source_name, source in summary.get("sources", {}).items()
    }
    policy["setup_questions"] = summary.get("interview_questions", [])
    return policy


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--discovery-summary", required=True)
    parser.add_argument(
        "--output",
        default=".unleak/policy.json",
        help="Where to write the draft policy",
    )
    args = parser.parse_args()

    summary = load_json(Path(args.discovery_summary))
    policy = build_policy(summary)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(policy, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "policy_path": str(output_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
