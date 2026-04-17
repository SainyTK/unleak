# unleak

`unleak` is privacy-preserving local analysis for coding agents. Compute on raw data locally, release only validated derived artifacts to the model.

It is for teams using Codex or Claude Code on sensitive CSV, SQLite, and project data where raw rows, exact identifiers, and exact business metrics should stay off-model.

## Why it exists

Most agent workflows fail open: the model reads raw rows directly, then promises to be careful. `unleak` changes the default path:

- discover schemas and risky fields first
- classify sensitivity before analysis
- compute deterministic aggregates or buckets locally
- validate the derived artifact and lineage
- only then let the model inspect the sanitized output

The flagship example proves both sides of the contract:

- passing path: sanitized branch analysis with lineage
- blocked path: exact branch data rejected by the validator

## Install surfaces

First-class targets:

- Codex via [`plugins/unleak/`](plugins/unleak/)
- Claude Code via [`.claude-plugin/`](.claude-plugin/) and [`hooks/install.sh`](hooks/install.sh)

Secondary target:

- Gemini via [`gemini-extension.json`](gemini-extension.json)

Canonical sources:

- [`skills/unleak/SKILL.md`](skills/unleak/SKILL.md)
- [`rules/unleak-activate.md`](rules/unleak-activate.md)

Regenerate packaged copies with:

```bash
python scripts/sync_packaging.py
```

## Quick start

Run the flagship demo:

```bash
python examples/branch_analysis/run_demo.py
```

That will:

1. discover the local source metadata
2. draft a policy
3. build a sanitized artifact plus lineage
4. validate the passing artifact
5. run an intentionally unsafe path and confirm it fails

To install the Claude hook flow in this repo:

```bash
./hooks/install.sh
```

## Proof

The repository includes deterministic benchmark snapshots under [`benchmarks/`](benchmarks/). The current harness covers:

- retail branch performance
- support ticket trends with raw free text present

Run them with:

```bash
python benchmarks/run_benchmarks.py
```

The committed summary snapshot is [`benchmarks/results/benchmark_summary.json`](benchmarks/results/benchmark_summary.json). Both current scenarios preserve the raw bottom-3 entities with `safe_overlap_ratio` of `1.0` while rejecting the blocked artifacts.

## Verification

Use CI-equivalent local checks:

```bash
pytest -q
python scripts/verify_repo.py
python examples/branch_analysis/run_demo.py
python benchmarks/run_benchmarks.py
```

## Docs

- [Install notes](docs/install.md)
- [Threat model](docs/threat-model.md)
- [FAQ](docs/faq.md)
- [Support](docs/support.md)
- [Release structure](docs/release-structure.md)
- [Contributing](CONTRIBUTING.md)
