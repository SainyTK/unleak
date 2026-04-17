# Branch Analysis Demo

This example shows the intended `unleak` workflow on a small branch-operations CSV.

## Passing path

Run the full demo:

```bash
python examples/branch_analysis/run_demo.py
```

The demo will:

1. discover source metadata from `raw_branch_metrics.csv`
2. draft a policy from that discovery summary
3. build a sanitized `safe_insight_pack.json`
4. validate the artifact and its lineage
5. run a deliberately unsafe variant and confirm validation blocks it

## Individual commands

Generate the passing artifact and lineage only:

```bash
python examples/branch_analysis/run_analysis.py
```

Generate the intentionally unsafe artifact and see validator failures:

```bash
python examples/branch_analysis/run_blocked_analysis.py
```

## Outputs

- Passing artifact: `examples/branch_analysis/derived/safe_insight_pack.json`
- Passing lineage: `examples/branch_analysis/derived/lineage.json`
- Discovery summary: `examples/branch_analysis/derived/discovery.json`
- Draft policy: `examples/branch_analysis/derived/generated_policy.json`
- Blocked artifact: `examples/branch_analysis/blocked/unsafe_branch_extract.json`
