# Install and setup

This guide is the practical setup path. The goal is to get `unleak` installed so the agent can handle setup and analysis for you.

## Before you start

You need:

- Python 3.10+
- a repo where raw data stays local
- an agent surface that will use `unleak`

Primary targets:

- Claude Code
- Codex

Secondary target:

- Gemini via `gemini-extension.json`

## Install model

`unleak` should be installed the same way `caveman` treats its surfaces:

- packaged plugin or bundle first when the agent supports it
- standalone hook wiring only as the fallback path for Claude Code
- prompt-level bootstrap only as the fallback path for Codex

That split matters because the plugin path is the clean install surface, while the standalone path is the escape hatch for local repos and manual debugging.

## Claude Code

Preferred path: use the packaged Claude bundle in [`.claude-plugin/`](../.claude-plugin/).

That is the install surface to keep stable for release packaging.

Standalone fallback from the repository root:

```bash
./hooks/install.sh
```

By default this writes to `.claude/settings.local.json`, which keeps the enforcement repo-local instead of mutating your user-wide Claude settings.

To install into another Claude settings file:

```bash
./hooks/install.sh --settings-file /path/to/settings.local.json
```

What gets installed:

- `UserPromptSubmit` to warn when policy is missing
- `PreToolUse` for `Bash|Read` to catch obvious raw exports
- `PostToolUse` for `Bash` to validate generated release artifacts

Hook behavior and uninstall steps are documented in [`hooks/README.md`](../hooks/README.md).

Use the standalone hook path when:

- you are testing `unleak` from a clone before packaging it
- you want repo-specific enforcement tied to one workspace
- you need to inspect or debug the exact hook commands being registered

## Codex

Preferred path: install the packaged plugin in [`plugins/unleak/`](../plugins/unleak/).

Manual fallback sources:

- single canonical skill: [`skills/unleak/SKILL.md`](../skills/unleak/SKILL.md)
- bootstrap prompt example: [`.codex/AGENTS.example.md`](../.codex/AGENTS.example.md)

The Codex fallback is intentionally prompt-level. Unlike Claude Code, this repo does not claim a standalone deterministic Codex hook installer today.

If you are maintaining generated packaging copies, refresh them with:

```bash
python3 scripts/sync_packaging.py
```

The activation rule text lives in [`rules/unleak-activate.md`](../rules/unleak-activate.md).

## Gemini CLI

Gemini is a secondary surface. The repo ships [`gemini-extension.json`](../gemini-extension.json), but Claude Code and Codex remain the install paths to optimize first.

## After install

Once `unleak` is installed, the normal user flow is:

1. open your coding agent in the repo with the local data
2. ask it to analyze the data using `unleak`
3. answer any short setup questions about sensitive fields or allowed output
4. let the agent complete the safe local workflow

Example prompts:

```text
Use unleak to analyze this CSV and summarize the main risks.
Set up unleak for this repository, then help me inspect the SQLite data safely.
Analyze these support metrics with unleak without exposing raw customer messages.
```

`unleak` should then guide the agent through source discovery, policy setup, local derived-artifact generation, and validation.

## What `unleak` does behind the scenes

The skill/plugin is designed to drive this workflow:

1. discover source metadata
2. create or update `.unleak/policy.json`
3. generate a sanitized artifact for model consumption
4. generate lineage for released fields
5. validate the artifact before the agent uses it

Most users should not need to run the underlying scripts manually.

## Manual workflow

If you want to inspect or debug the internals yourself, the core scripts are:

```bash
python3 scripts/discover_sources.py data.csv > discovery.json
python3 scripts/init_policy.py --discovery-summary discovery.json --output .unleak/policy.json
python3 scripts/validate_release.py --policy .unleak/policy.json --artifact safe_artifact.json --lineage lineage.json
```

This is the lower-level implementation workflow, not the primary onboarding path. The preferred onboarding path is still plugin or bundle install first, then let the agent drive setup.

## Where to go next

- [README](../README.md) for the short overview
- [Example walkthrough](examples.md) for the branch analysis demo
- [Benchmark notes](benchmarks.md) for proof and result snapshots
- [Threat model](threat-model.md) for what `unleak` does and does not protect
