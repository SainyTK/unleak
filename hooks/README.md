# Unleak Hooks

`unleak` ships a repo-local Claude Code hook flow around [`scripts/unleak_hook.py`](../scripts/unleak_hook.py).

The installer is intentionally simple:

- writes Claude hook config without `jq`
- merges into an existing JSON settings file instead of replacing it
- is idempotent, so re-running install does not duplicate entries
- removes only `unleak` hook commands during uninstall

## What Gets Installed

The installer adds three Claude Code hooks:

- `UserPromptSubmit` to warn when `.unleak/policy.json` is missing
- `PreToolUse` with matcher `Bash|Read` to block obvious raw exports
- `PostToolUse` with matcher `Bash` to validate release artifacts

Anthropic documents Claude hooks in project settings files such as `.claude/settings.local.json` and recommends using `CLAUDE_PROJECT_DIR` for project-relative commands:

- [Hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings)

## Install

From the repo root:

```bash
./hooks/install.sh
```

That writes to `.claude/settings.local.json` by default.

To target a different Claude settings file:

```bash
./hooks/install.sh --settings-file /path/to/settings.local.json
```

## Uninstall

```bash
./hooks/uninstall.sh
```

Or remove from another settings file:

```bash
./hooks/uninstall.sh --settings-file /path/to/settings.local.json
```

## Repo-Local Auto-Start Examples

This repo keeps example bootstrap files under [`.codex/`](../.codex):

- [`.codex/claude-settings.local.example.json`](../.codex/claude-settings.local.example.json): committed example of the Claude hook config the installer writes
- [`.codex/AGENTS.example.md`](../.codex/AGENTS.example.md): Codex prompt-level bootstrap text for projects that want `unleak` behavior to load at session start

The Codex example is intentionally prompt-level, not a claimed hook implementation. Today the deterministic enforcement path in this repo is the Claude hook installer above.
