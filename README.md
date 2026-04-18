<p align="center">
  <img src="assets/readme/unleak-hero.png" width="640" alt="unleak hero" />
</p>

<h1 align="center">unleak</h1>

<p align="center">
  <strong>let ai agents analyze data with minimal data leakage</strong>
</p>

<p align="center">
  <a href="#how-it-works">How It Works</a> •
  <a href="#install">Install</a> •
  <a href="#what-you-get">What You Get</a> •
  <a href="#evals">Evals</a>
</p>

---

`unleak` is a Claude Code plugin/bundle, Codex plugin, and portable skill layout for cases where the model should **not** see raw rows, raw identifiers, raw free text, or exact protected metrics.

The idea is simple:

1. keep raw data local
2. let deterministic scripts do the risky computation
3. validate the release artifact plus lineage
4. only then let the model see the safe output

## How It Works

Use `unleak` when your agent needs to work with:

- CSV, SQLite, or project data that must stay on the operator machine
- exact identifiers, free text, secrets, or exact business metrics that should not enter prompt context
- analysis that can still succeed with aliases, indexes, buckets, percentiles, or other derived outputs

The core workflow is:

1. discover sources and risky fields without exposing raw rows
2. ask only the minimum setup questions needed to calibrate policy
3. write or update `.unleak/policy.json`
4. compute a sanitized artifact and lineage manifest locally
5. validate the release before the model reads it

## Install

Pick the surface you actually use. Claude Code and Codex are the primary targets.

| Agent | Install surface |
|-------|-----------------|
| Claude Code | Packaged bundle in [`.claude-plugin/`](.claude-plugin/) |
| Codex | Local plugin in [`plugins/unleak/`](plugins/unleak/) |
| Gemini CLI | Secondary manifest in [`gemini-extension.json`](gemini-extension.json) |
| Cursor | Generated skill + always-on rule in [`.cursor/`](.cursor/) |
| Windsurf | Generated skill + always-on rule in [`.windsurf/`](.windsurf/) |
| Cline | Generated rule in [`.clinerules/unleak.md`](.clinerules/unleak.md) |
| Copilot | Generated rule in [`.github/copilot-instructions.md`](.github/copilot-instructions.md) |

### Claude Code

Preferred path: install the packaged Claude bundle in [`.claude-plugin/`](.claude-plugin/).

Standalone fallback from a local clone:

```bash
./hooks/install.sh
```

That writes repo-local hook entries to `.claude/settings.local.json` by default.

### Codex

Preferred path: install the packaged plugin in [`plugins/unleak/`](plugins/unleak/).

Repo-local bootstrap files also exist:

- [`AGENTS.md`](AGENTS.md)
- [`.codex/hooks.json`](.codex/hooks.json)
- [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json)

### Portable skill copies

The canonical skill lives in [`skills/unleak/SKILL.md`](skills/unleak/SKILL.md). Mirrored copies are generated into:

- [`unleak/SKILL.md`](unleak/SKILL.md)
- [`plugins/unleak/skills/unleak/SKILL.md`](plugins/unleak/skills/unleak/SKILL.md)
- [`.cursor/skills/unleak/SKILL.md`](.cursor/skills/unleak/SKILL.md)
- [`.windsurf/skills/unleak/SKILL.md`](.windsurf/skills/unleak/SKILL.md)

Refresh all mirrored copies with:

```bash
python3 scripts/sync_packaging.py
```

More setup detail lives in [docs/install.md](docs/install.md).

## What You Get

| Capability | Claude | Codex | Gemini | Cursor/Windsurf | Cline/Copilot |
|-----------|:------:|:-----:|:------:|:---------------:|:-------------:|
| Canonical `unleak` skill | Y | Y | Y | Y | Y |
| Always-on activation rule | Y | Y | Y | Y | Y |
| Repo-local hook enforcement | Y | prompt bootstrap | prompt bootstrap | rule only | rule only |
| Deterministic validation scripts | Y | Y | Y | Y | Y |
| Live smoke evaluation path | Y | Y | — | — | — |

## First Use

Example prompts:

```text
Analyze this CSV with unleak and tell me which branches need attention.
Use unleak to review this SQLite database without exposing raw customer data.
Set up unleak for this repo, then analyze support metrics safely.
```

The user should not need to manually run `discover_sources.py`, `init_policy.py`, or `validate_release.py` during normal use. Those scripts are the deterministic path the skill and plugin drive behind the scenes.

## Evals

This repo now mirrors `caveman`'s `evals/` layout.

Fresh live-agent snapshot:

```bash
python3 evals/llm_run.py --agent claude --agent codex
```

Read the latest snapshot:

```bash
python3 evals/measure.py
```

The underlying deterministic scenarios still live in `benchmarks/`, and the live smoke path uses `benchmarks/smoke_agent_sample/`.

## Verify

```bash
pytest -q
python3 scripts/verify_repo.py
python3 benchmarks/run.py
python3 evals/measure.py
```

## Support

- [Install and setup](docs/install.md)
- [Examples](docs/examples.md)
- [Benchmarks](docs/benchmarks.md)
- [Threat model](docs/threat-model.md)
- [Release structure](docs/release-structure.md)
- [Support](docs/support.md)
- [Contributing](CONTRIBUTING.md)
