import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_hook(
    mode: str,
    payload: dict | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    hook_env = os.environ.copy()
    hook_env["PYTHONDONTWRITEBYTECODE"] = "1"
    if env is not None:
        hook_env.update(env)
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "unleak_hook.py"), mode],
        input=json.dumps(payload or {}),
        text=True,
        capture_output=True,
        check=False,
        env=hook_env,
    )


def test_user_prompt_warns_without_policy(tmp_path):
    result = run_hook("user-prompt", env={"CLAUDE_PROJECT_DIR": str(tmp_path)})
    assert result.returncode == 0
    assert "Unleak setup is missing" in result.stdout


def test_pre_tool_blocks_raw_export(tmp_path):
    result = run_hook(
        "pre-tool",
        payload={"tool_name": "Bash", "tool_input": {"command": "cat sales.csv"}},
        env={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert result.returncode == 2
    assert "Blocked by unleak" in result.stderr


def test_post_tool_returns_validator_payload(tmp_path):
    policy_dir = tmp_path / ".unleak"
    policy_dir.mkdir()
    (policy_dir / "policy.json").write_text(
        (ROOT / "tests" / "fixtures" / "branch_policy.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    lineage_path = tmp_path / "derived" / "lineage.json"
    lineage_path.parent.mkdir()
    lineage_path.write_text(
        (ROOT / "tests" / "fixtures" / "monetary_lineage.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    artifact_path = tmp_path / "derived" / "artifact.json"
    artifact_path.write_text(
        (ROOT / "tests" / "fixtures" / "monetary_artifact.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    result = run_hook(
        "post-tool",
        payload={
            "tool_output": {
                "lineage_path": str(lineage_path),
                "artifact_path": str(artifact_path),
            }
        },
        env={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert result.returncode == 2
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert any("looks monetary" in item for item in payload["violations"])
