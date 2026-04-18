# Evals

`unleak` uses `evals/` as the reproducible entrypoint for checking the current live-agent outcome, while `benchmarks/` owns the deterministic scenario builder and smoke execution logic.

## What gets measured

- deterministic safe-release and blocked-release validation over the checked-in benchmark scenarios
- optional live smoke checks for real `claude` and `codex` CLIs against `benchmarks/smoke_agent_sample/`
- whether the current integration blocks raw direct reads before the agent can inspect sensitive rows

## Files

- `prompts/en.txt`: the smoke prompts we care about
- `llm_run.py`: runs the benchmark harness with live agent smoke enabled and snapshots the result
- `measure.py`: reads the snapshot and prints a compact summary
- `plot.py`: emits a tiny markdown table grouped by scenario and agent status
- `snapshots/results.json`: latest snapshot produced by `llm_run.py`

## Refresh the snapshot

```bash
python3 evals/llm_run.py --agent claude --agent codex
```

If a CLI is not installed, the snapshot records that as `skipped`.

## Read the snapshot

```bash
python3 evals/measure.py
```
