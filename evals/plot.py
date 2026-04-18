"""Render a tiny markdown summary from the latest unleak eval snapshot."""

from __future__ import annotations

import json
from pathlib import Path


SNAPSHOT = Path(__file__).parent / "snapshots" / "results.json"


def main() -> None:
    if not SNAPSHOT.exists():
        print("No eval snapshot yet.")
        return
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    summary = data["summary"]

    print("## Scenario Status")
    for scenario in summary.get("results", []):
        completion = scenario["metrics"]["task_completion"]
        print(
            f"- `{scenario['scenario_id']}`: safe={completion['safe_release_valid']}, "
            f"blocked_rejected={completion['blocked_release_rejected']}"
        )

    print("\n## Agent Smoke")
    for result in summary.get("agent_smoke", []):
        print(f"- `{result['agent']}`: {result.get('status', 'unknown')}")


if __name__ == "__main__":
    main()
