# Hook patterns

Claude Code hooks can enforce `unleak` without trusting the model to remember the rules.

## Project-level settings example

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py user-prompt"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|Read",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py pre-tool"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/scripts/unleak_hook.py post-tool"
          }
        ]
      }
    ]
  }
}
```

## Enforcement intent

- `UserPromptSubmit`: inject or enforce a reminder when the user requests analysis over raw data before setup exists
- `PreToolUse`: block obvious raw exports, unrestricted SQL dumps, or direct reads of known sensitive files
- `PostToolUse`: validate any newly generated release artifact before the next prompt step consumes it

Use exit code `2` for blocking behavior when supported by the hook event.
