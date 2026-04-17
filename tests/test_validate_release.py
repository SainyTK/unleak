import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_validator(
    lineage_name: str,
    artifact_name: str | None = None,
) -> subprocess.CompletedProcess[str]:
    command = [
        sys.executable,
        str(ROOT / "scripts" / "validate_release.py"),
        "--policy",
        str(ROOT / "tests" / "fixtures" / "branch_policy.json"),
        "--lineage",
        str(ROOT / "tests" / "fixtures" / lineage_name),
    ]
    if artifact_name is not None:
        command.extend(
            [
                "--artifact",
                str(ROOT / "tests" / "fixtures" / artifact_name),
            ]
        )
    return subprocess.run(
        command,
        text=True,
        capture_output=True,
        check=False,
    )


def test_passing_release():
    result = run_validator("passing_lineage.json", "passing_artifact.json")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["ok"] is True
    assert payload["violations"] == []


def test_blocking_release():
    result = run_validator("failing_lineage.json")
    payload = json.loads(result.stdout)
    assert result.returncode == 2
    assert payload["ok"] is False
    assert any("below minimum" in item for item in payload["violations"])
    assert any("blocked source" in item for item in payload["violations"])


def test_artifact_and_lineage_must_match():
    result = run_validator("passing_lineage.json", "failing_artifact.json")
    payload = json.loads(result.stdout)
    assert result.returncode == 2
    assert any("missing lineage" in item for item in payload["violations"])
    assert any("free text" in item for item in payload["violations"])


def test_blocking_exact_monetary_release():
    result = run_validator("monetary_lineage.json", "monetary_artifact.json")
    payload = json.loads(result.stdout)
    assert result.returncode == 2
    assert any("looks monetary" in item for item in payload["violations"])
