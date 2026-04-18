# Examples

Examples are here to show the workflow after you understand the install and usage path.

## Flagship example

The main example lives in [`examples/branch_analysis/`](../examples/branch_analysis/).

Run the end-to-end demo:

```bash
python3 examples/branch_analysis/run_demo.py
```

This demo:

1. discovers source metadata from `raw_branch_metrics.csv`
2. drafts a policy
3. builds a sanitized artifact
4. validates the artifact and lineage
5. runs an intentionally unsafe path and confirms it is blocked

## Individual commands

Generate only the passing artifact:

```bash
python3 examples/branch_analysis/run_analysis.py
```

Generate the intentionally unsafe artifact:

```bash
python3 examples/branch_analysis/run_blocked_analysis.py
```

## Outputs

Generated files are written under `examples/branch_analysis/derived/` and `examples/branch_analysis/blocked/`.

See the example-specific notes in [`examples/branch_analysis/README.md`](../examples/branch_analysis/README.md).
