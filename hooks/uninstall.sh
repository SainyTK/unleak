#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Remove standalone Claude Code hooks for unleak.

Usage:
  ./hooks/uninstall.sh [--settings-file PATH]

Defaults:
  Removes hook entries from .claude/settings.local.json in the current repo.
  This only affects the standalone hook install path.

Options:
  --settings-file PATH  Remove hooks from a different Claude settings file.
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
  echo "python3 is required to uninstall unleak hooks." >&2
  exit 1
fi

python3 - "${settings_file}" <<'PY'
import json
import sys
from pathlib import Path

settings_path = Path(sys.argv[1])

commands_to_remove = {
    'python3 "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py" user-prompt',
    'python3 "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py" pre-tool',
    'python3 "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py" post-tool',
}

if not settings_path.exists():
    print(f"No settings file at {settings_path}; nothing to uninstall.")
    raise SystemExit(0)

try:
    data = json.loads(settings_path.read_text(encoding="utf-8"))
except json.JSONDecodeError as exc:
    raise SystemExit(f"Refusing to edit invalid JSON in {settings_path}: {exc}") from exc

if not isinstance(data, dict):
    raise SystemExit(f"Refusing to edit non-object JSON in {settings_path}")

hooks = data.get("hooks")
if hooks is None:
    print(f"No hooks section in {settings_path}; nothing to uninstall.")
    raise SystemExit(0)
if not isinstance(hooks, dict):
    raise SystemExit(f"Refusing to edit settings with non-object hooks in {settings_path}")

changes_made = False

for event_name in list(hooks):
    entries = hooks.get(event_name)
    if not isinstance(entries, list):
        continue

    kept_entries = []
    for entry in entries:
        if not isinstance(entry, dict):
            kept_entries.append(entry)
            continue

        hook_list = entry.get("hooks")
        if not isinstance(hook_list, list):
            kept_entries.append(entry)
            continue

        kept_hooks = [
            item
            for item in hook_list
            if not (
                isinstance(item, dict)
                and item.get("type") == "command"
                and item.get("command") in commands_to_remove
            )
        ]

        if len(kept_hooks) != len(hook_list):
            changes_made = True

        if kept_hooks:
            updated_entry = dict(entry)
            updated_entry["hooks"] = kept_hooks
            kept_entries.append(updated_entry)

    if kept_entries:
        hooks[event_name] = kept_entries
    else:
        hooks.pop(event_name, None)
        changes_made = True

if not hooks:
    data.pop("hooks", None)
    changes_made = True

settings_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(f"{'Removed' if changes_made else 'No'} standalone unleak hooks in {settings_path}")
PY
