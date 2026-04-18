"""Read evals/snapshots/results.json and print a compact unleak summary."""

from __future__ import annotations

import json
from pathlib import Path


SNAPSHOT = Path(__file__).parent / "snapshots" / "results.json"


def main() -> None:
    if not SNAPSHOT.exists():
        print(f"No snapshot at {SNAPSHOT}. Run `python3 evals/llm_run.py` first.")
        return

    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    summary = data["summary"]
    meta = data["metadata"]

    print(f"_Generated: {meta.get('generated_at', '?')}_")
    print(f"_Return code: {meta.get('returncode', '?')}_")
    print(f"_Agents: {', '.join(meta.get('selected_agents', [])) or 'none'}_")
    print()
    print("| Check | Result | Notes |")
    print("|-------|--------|-------|")

    for scenario in summary.get("results", []):
        task = scenario["metrics"]["task_completion"]
        status = "pass" if task["safe_release_valid"] and task["blocked_release_rejected"] else "fail"
        note = (
            f"safe={task['safe_release_valid']}, "
            f"blocked_rejected={task['blocked_release_rejected']}, "
            f"overlap={scenario['metrics']['utility']['safe_overlap_ratio']}"
        )
        print(f"| scenario:{scenario['scenario_id']} | {status} | {note} |")

    for result in summary.get("agent_smoke", []):
        note = []
        if result.get("reason"):
            note.append(result["reason"])
        if "raw_read_attempted" in result:
            note.append(f"raw_read_attempted={result['raw_read_attempted']}")
        if "blocked_direct_read" in result:
            note.append(f"blocked_direct_read={result['blocked_direct_read']}")
        print(f"| agent:{result['agent']} | {result.get('status', 'unknown')} | {', '.join(note)} |")


if __name__ == "__main__":
    main()
