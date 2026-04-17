#!/usr/bin/env python3
"""Validate whether a derived artifact is safe to expose to the model."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def normalize_block_patterns(policy: dict) -> list[str]:
    return [item.lower() for item in policy.get("blocked_name_patterns", [])]


def effective_field_policy(policy: dict, source_ref: str) -> dict:
    source_name, field_name = source_ref.split(".", 1)
    source = policy.get("sources", {}).get(source_name, {})
    fields = source.get("fields", {})
    return fields.get(field_name, {})


def normalize_field_entry(entry):
    if isinstance(entry, list):
        return {"ancestors": entry, "transforms": []}
    return {
        "ancestors": entry.get("ancestors", []),
        "transforms": entry.get("transforms", []),
    }


SAFE_TRANSFORMS = {
    "alias",
    "bucket",
    "band",
    "percentile_rank",
    "median_relative_index",
    "top_code",
    "rounded",
}

MONETARY_FIELD_HINTS = {
    "amount",
    "arr",
    "cost",
    "currency",
    "mrr",
    "price",
    "profit",
    "revenue",
    "sales",
    "salary",
    "usd",
}

FREE_TEXT_FIELD_HINTS = {
    "comment",
    "comments",
    "description",
    "message",
    "notes",
    "summary_text",
}


def artifact_field_names(artifact) -> set[str]:
    if isinstance(artifact, dict):
        if isinstance(artifact.get("entities"), list):
            names = set()
            for item in artifact["entities"]:
                if isinstance(item, dict):
                    names.update(item.keys())
            return names
        return set(artifact.keys())
    return set()


def field_name_looks_monetary(name: str) -> bool:
    lowered = name.lower()
    return any(hint in lowered for hint in MONETARY_FIELD_HINTS)


def looks_like_free_text(value) -> bool:
    return isinstance(value, str) and len(value.split()) >= 8


def contains_free_text_fields(artifact) -> list[str]:
    violations = []
    if not isinstance(artifact, dict):
        return violations

    def inspect_record(record, prefix=""):
        if not isinstance(record, dict):
            return
        for key, value in record.items():
            lowered = key.lower()
            label = f"{prefix}{key}"
            if lowered in FREE_TEXT_FIELD_HINTS and looks_like_free_text(value):
                violations.append(f"artifact field '{label}' appears to contain free text")

    inspect_record(artifact)
    for index, item in enumerate(artifact.get("entities", [])):
        inspect_record(item, prefix=f"entities[{index}].")
    return violations


def detect_violations(policy: dict, lineage: dict, artifact: dict | None = None) -> list[str]:
    violations = []
    minimum_group_size = policy.get("minimum_group_size", 1)
    blocked_patterns = normalize_block_patterns(policy)
    artifact = artifact or {}
    lineage_fields = lineage.get("fields", {})

    for alias, size in lineage.get("group_sizes", {}).items():
        if size < minimum_group_size:
            violations.append(
                f"group '{alias}' has size {size}, below minimum {minimum_group_size}"
            )

    require_aliases = policy.get("require_aliases_for_entity_names", False)

    if artifact:
        artifact_fields = artifact_field_names(artifact)
        missing_lineage = sorted(artifact_fields - set(lineage_fields))
        if missing_lineage:
            violations.append(
                "artifact fields missing lineage: " + ", ".join(missing_lineage)
            )
        orphaned_lineage = sorted(set(lineage_fields) - artifact_fields)
        if orphaned_lineage:
            violations.append(
                "lineage fields missing from artifact: " + ", ".join(orphaned_lineage)
            )
        artifact_lineage_path = artifact.get("lineage", {}).get("fields")
        if artifact_lineage_path and artifact_lineage_path != lineage_fields:
            violations.append("artifact lineage fields do not match validator lineage input")
        if artifact.get("lineage", {}).get("group_sizes") and artifact["lineage"].get(
            "group_sizes"
        ) != lineage.get("group_sizes", {}):
            violations.append("artifact group sizes do not match validator lineage input")
        violations.extend(contains_free_text_fields(artifact))
        if artifact.get("artifact_path") and artifact.get("artifact_path") != lineage.get(
            "artifact_path"
        ):
            violations.append("artifact_path does not match lineage artifact_path")

    for derived_field, raw_entry in lineage_fields.items():
        entry = normalize_field_entry(raw_entry)
        ancestors = entry["ancestors"]
        transforms = set(entry["transforms"])
        lowered = derived_field.lower()
        if any(pattern in lowered for pattern in blocked_patterns):
            violations.append(
                f"derived field '{derived_field}' matches a blocked name pattern"
            )

        for ancestor in ancestors:
            field_policy = effective_field_policy(policy, ancestor)
            risk = field_policy.get("risk", "moderate")
            allow_release = field_policy.get("allow_release", risk == "low")
            has_safe_transform = bool(transforms & SAFE_TRANSFORMS)
            if (
                require_aliases
                and "alias" in transforms
                and ancestor.split(".", 1)[1].lower().endswith("name")
            ):
                allow_release = True
            if risk in {"highest", "high"} and not allow_release and not has_safe_transform:
                violations.append(
                    f"derived field '{derived_field}' depends on blocked source '{ancestor}'"
                )
            if risk in {"highest", "high"} and allow_release and not has_safe_transform:
                violations.append(
                    f"derived field '{derived_field}' uses high-risk source '{ancestor}' without a safe transform"
                )
        if (
            artifact
            and not policy.get("allow_exact_monetary_values", False)
            and field_name_looks_monetary(derived_field)
            and not (transforms & SAFE_TRANSFORMS)
        ):
            violations.append(
                f"derived field '{derived_field}' looks monetary but lacks a safe transform"
            )

    return violations


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True)
    parser.add_argument("--lineage", required=True)
    parser.add_argument("--artifact", required=False)
    args = parser.parse_args()

    policy = load_json(Path(args.policy))
    lineage = load_json(Path(args.lineage))
    artifact = load_json(Path(args.artifact)) if args.artifact else None
    violations = detect_violations(policy, lineage, artifact)

    result = {"ok": not violations, "violations": violations}
    print(json.dumps(result, indent=2))
    return 0 if not violations else 2


if __name__ == "__main__":
    raise SystemExit(main())
