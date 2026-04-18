# CLAUDE.md — unleak

## README is a product artifact

README is the install and trust surface for people deciding whether to let an agent touch sensitive data at all. Treat it like security-product copy, not internal notes.

Rules for README changes:

- Lead with the leakage problem, the local-first workflow, and the install path.
- Keep claims concrete. If a number comes from `benchmarks/` or `evals/`, re-run before changing it.
- Do not imply enclave-grade or infrastructure-grade protection. `unleak` is deterministic local reduction plus validation.
- Install tables and examples must match the actual files in this repo.
- Prefer language non-specialists can act on quickly: raw data stays local, only safe summaries reach the model.

## Project overview

`unleak` helps coding agents analyze sensitive local data with minimal leakage. The model should not inspect raw rows when a deterministic local script can produce a validated derived artifact instead.

## Single source of truth

Edit only these files for product behavior:

- `skills/unleak/SKILL.md`: canonical skill behavior
- `rules/unleak-activate.md`: canonical always-on activation rule
- `scripts/sync_packaging.py`: generates mirrored install surfaces

Do not hand-edit mirrored copies such as:

- `unleak/SKILL.md`
- `plugins/unleak/skills/unleak/SKILL.md`
- `.cursor/skills/unleak/SKILL.md`
- `.windsurf/skills/unleak/SKILL.md`
- `.clinerules/unleak.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/unleak.mdc`
- `.windsurf/rules/unleak.md`
- `.claude-plugin/*`
- `plugins/unleak/.codex-plugin/plugin.json`
- `unleak.skill`

Refresh those with:

```bash
python3 scripts/sync_packaging.py
```

## Verification

Run these before claiming the repo is in sync:

```bash
pytest -q
python3 scripts/verify_repo.py
python3 benchmarks/run.py
python3 evals/measure.py
```

Use `python3 evals/llm_run.py --agent claude --agent codex` when you need a fresh live-agent smoke snapshot and the CLIs are installed.
