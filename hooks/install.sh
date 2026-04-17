#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install repo-local Claude Code hooks for unleak.

Usage:
  ./hooks/install.sh [--settings-file PATH]

Defaults:
  Writes to .claude/settings.local.json in the current repo.

Options:
  --settings-file PATH  Write to a different Claude settings file.
  -h, --help            Show this help text.
EOF
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "${script_dir}/.." && pwd)"
settings_file="${repo_dir}/.claude/settings.local.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --settings-file)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --settings-file" >&2
        exit 1
      fi
      settings_file="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to install unleak hooks." >&2
  exit 1
fi

mkdir -p "$(dirname -- "${settings_file}")"

python3 - "${settings_file}" <<'PY'
import json
import sys
from pathlib import Path

settings_path = Path(sys.argv[1])

desired_hooks = [
    (
        "UserPromptSubmit",
        None,
        'python3 "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py" user-prompt',
    ),
    (
        "PreToolUse",
        "Bash|Read",
        'python3 "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py" pre-tool',
    ),
    (
        "PostToolUse",
        "Bash",
        'python3 "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py" post-tool',
    ),
]

if settings_path.exists():
    try:
        data = json.loads(settings_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Refusing to edit invalid JSON in {settings_path}: {exc}") from exc
else:
    data = {}

if not isinstance(data, dict):
    raise SystemExit(f"Refusing to edit non-object JSON in {settings_path}")

hooks = data.setdefault("hooks", {})
if not isinstance(hooks, dict):
    raise SystemExit(f"Refusing to edit settings with non-object hooks in {settings_path}")

for event_name, matcher, command in desired_hooks:
    entries = hooks.setdefault(event_name, [])
    if not isinstance(entries, list):
        raise SystemExit(f"Refusing to edit {event_name}: expected a list in {settings_path}")

    target_entry = None
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get("matcher") != matcher:
            continue
        if isinstance(entry.get("hooks"), list):
            target_entry = entry
            break

    if target_entry is None:
        target_entry = {"hooks": []}
        if matcher is not None:
            target_entry["matcher"] = matcher
        entries.append(target_entry)

    hook_list = target_entry.setdefault("hooks", [])
    if not isinstance(hook_list, list):
        raise SystemExit(f"Refusing to edit {event_name}: hooks entry must be a list")

    already_present = any(
        isinstance(item, dict)
        and item.get("type") == "command"
        and item.get("command") == command
        for item in hook_list
    )
    if not already_present:
        hook_list.append({"type": "command", "command": command})

settings_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY

echo "Installed unleak hooks into ${settings_file}"
echo "Inspect them with Claude Code /hooks or by opening ${settings_file}"
