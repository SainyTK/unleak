import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_verify_repo_passes_on_current_tree():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "verify_repo.py")],
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["violations"] == []
