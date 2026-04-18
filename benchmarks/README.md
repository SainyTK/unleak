# Benchmarks

This package provides deterministic `unleak` benchmark scenarios grounded in the product plan, plus a small live-agent smoke path for real CLI checks.

## Included scenarios

- `retail_branch`: weak-branch ranking from raw revenue and returns data
- `support_ticket_trends`: queue prioritization with raw ticket summaries present

Each scenario includes:

- local raw fixture data
- a scenario policy
- an expected raw bottom-3 answer key
- a passing sanitized release snapshot
- a blocked release snapshot

## Run

```bash
python benchmarks/run_benchmarks.py
```

The harness writes reproducible outputs to `benchmarks/results/` and a summary snapshot to `benchmarks/results/benchmark_summary.json`.

## Live Agent Smoke Test

Run the deterministic harness plus real CLI smoke checks against [`benchmarks/smoke_agent_sample/`](/Users/sainy/Documents/projects/personal/unleak/benchmarks/smoke_agent_sample):

```bash
python benchmarks/run_benchmarks.py --agent-smoke
```

To target one CLI only:

```bash
python benchmarks/run_benchmarks.py --agent-smoke --agent claude
python benchmarks/run_benchmarks.py --agent-smoke --agent codex
```

These smoke results are intentionally small and non-deterministic. They verify whether the actual agent CLI tries a direct raw read and whether the current `unleak` integration stops it.

If you want the `caveman`-style top-level eval entrypoint instead of calling the benchmark harness directly, use:

```bash
python3 evals/llm_run.py --agent claude --agent codex
python3 evals/measure.py
```

## Output schema

The summary snapshot follows [`evals/benchmark_result.schema.json`](/Users/sainy/Documents/projects/personal/unleak/evals/benchmark_result.schema.json).

Each scenario result records:

- task completion: safe release validates and blocked release is rejected
- utility: overlap between raw bottom-3 entities and the bottom-3 implied by the sanitized artifact
- leakage: baseline raw exposure fields plus validator outcomes for safe and blocked outputs
- execution: row counts and minimum group threshold
