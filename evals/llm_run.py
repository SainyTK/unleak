"""Run the live-agent unleak eval harness and snapshot the result."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVALS = ROOT / "evals"
PROMPTS = EVALS / "prompts" / "en.txt"
SNAPSHOT = EVALS / "snapshots" / "results.json"
BENCHMARK_SUMMARY = ROOT / "benchmarks" / "results" / "benchmark_summary.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent", action="append", choices=["claude", "codex"])
    args = parser.parse_args()

    selected = args.agent or ["claude", "codex"]
    cmd = [sys.executable, str(ROOT / "benchmarks" / "run_benchmarks.py"), "--agent-smoke"]
    for agent in selected:
        cmd.extend(["--agent", agent])

    run = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=False)
    summary = json.loads(BENCHMARK_SUMMARY.read_text(encoding="utf-8"))
    prompts = [line.strip() for line in PROMPTS.read_text(encoding="utf-8").splitlines() if line.strip()]

    snapshot = {
        "metadata": {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "command": cmd,
            "returncode": run.returncode,
            "selected_agents": selected,
        },
        "prompts": prompts,
        "summary": summary,
        "stdout": run.stdout.splitlines()[-40:],
        "stderr": run.stderr.splitlines()[-40:],
    }
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {SNAPSHOT}")
    if run.returncode != 0:
        raise SystemExit(run.returncode)


if __name__ == "__main__":
    main()
