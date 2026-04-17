#!/usr/bin/env python3
"""Discover source metadata and infer candidate sensitivity from names."""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from pathlib import Path


DEFAULT_PATTERNS = {
    "highest": [
        "password",
        "secret",
        "token",
        "api_key",
        "private_key",
        "ssn",
        "dob",
        "passport",
        "card",
        "cvv",
        "medical",
        "diagnosis",
        "patient",
    ],
    "high": [
        "name",
        "email",
        "phone",
        "address",
        "salary",
        "revenue",
        "profit",
        "cost",
        "margin",
        "price",
        "contract",
    ],
}


def infer_risk(column_name: str) -> str:
    name = column_name.lower()
    for risk, patterns in DEFAULT_PATTERNS.items():
        if any(pattern in name for pattern in patterns):
            return risk
    return "moderate"


def inspect_csv(path: Path) -> dict:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        headers = next(reader, [])
    fields = {header: {"risk": infer_risk(header)} for header in headers}
    return {"kind": "csv", "fields": fields}


def inspect_sqlite(path: Path) -> dict:
    conn = sqlite3.connect(path)
    try:
        tables = [
            row[0]
            for row in conn.execute(
                "select name from sqlite_master where type='table' order by name"
            )
        ]
        table_map = {}
        for table in tables:
            columns = conn.execute(f"pragma table_info('{table}')").fetchall()
            fields = {column[1]: {"risk": infer_risk(column[1])} for column in columns}
            table_map[table] = {"kind": "sqlite_table", "fields": fields}
        return {"kind": "sqlite", "tables": table_map}
    finally:
        conn.close()


def interview_questions(summary: dict) -> list[str]:
    highest = []
    high = []
    for source_name, source in summary["sources"].items():
        candidates = source.get("fields")
        if not candidates and source.get("tables"):
            for table_name, table in source["tables"].items():
                for field_name, field in table["fields"].items():
                    label = f"{source_name}:{table_name}.{field_name}"
                    if field["risk"] == "highest":
                        highest.append(label)
                    elif field["risk"] == "high":
                        high.append(label)
            continue
        for field_name, field in candidates.items():
            label = f"{source_name}:{field_name}"
            if field["risk"] == "highest":
                highest.append(label)
            elif field["risk"] == "high":
                high.append(label)
    return [
        "Which inferred highest-risk fields are truly forbidden from model exposure?",
        f"Do these high-risk business fields need stricter treatment: {', '.join(high[:10]) or 'none detected'}?",
        "What is the minimum acceptable aggregation level for model-visible outputs?",
        "Are aliases acceptable for entities such as customers, branches, vendors, or employees?",
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", help="CSV files or SQLite databases")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    selected = [Path(item) for item in args.paths][: args.limit]
    summary = {"max_initial_sources": args.limit, "sources": {}}

    for path in selected:
        if path.suffix.lower() == ".csv":
            summary["sources"][path.name] = inspect_csv(path)
        elif path.suffix.lower() in {".sqlite", ".db"}:
            summary["sources"][path.name] = inspect_sqlite(path)
        else:
            summary["sources"][path.name] = {"kind": "unknown", "fields": {}}

    summary["interview_questions"] = interview_questions(summary)
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
