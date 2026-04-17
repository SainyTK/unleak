# Install notes

This document is a stable landing place for install guidance while packaging work is still in motion. It intentionally avoids duplicating a future public `README.md`.

## Current state

The repo currently ships:

- the canonical skill at `skills/unleak/SKILL.md`
- generated install copies for root compatibility, Claude, Codex, and a secondary Gemini manifest
- helper scripts in `scripts/`
- a runnable branch-analysis example in `examples/branch_analysis/`
- Claude hook installer and uninstall scripts in `hooks/`

Planned first-class install targets from `PLAN.md`:

- Claude Code
- Codex
- Gemini as a secondary target

## Near-term install shape

The install story is being productized around:

- a canonical source-of-truth skill location
- generated packaged copies for agent-specific install surfaces
- hook installer and uninstall scripts
- repo verification so generated copies cannot drift

The source of truth is the canonical skill plus activation rule:

- `skills/unleak/SKILL.md`
- `rules/unleak-activate.md`

Regenerate packaged copies with:

```bash
python scripts/sync_packaging.py
```

## Local verification path

Use the current example flow to validate behavior locally:

1. Run `python examples/branch_analysis/run_demo.py`.
2. Confirm the sanitized artifact, lineage, discovery summary, and generated policy appear under `examples/branch_analysis/derived/`.
3. Confirm the blocked path fails validation under `examples/branch_analysis/blocked/`.
4. Run `python benchmarks/run_benchmarks.py` for the committed benchmark snapshots.

## Documentation contract

Current install surfaces:

- Claude Code: install hooks with `./hooks/install.sh`
- Codex: use the generated bundle under `plugins/unleak/` and prompt bootstrap examples under `.codex/`
- Gemini: treat `gemini-extension.json` as a secondary manifest, not the primary launch surface

This file is the deeper install reference. `README.md` should stay shorter and link here.
