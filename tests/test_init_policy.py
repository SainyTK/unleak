import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_init_policy_bootstraps_discovery_summary(tmp_path):
    summary_path = tmp_path / "summary.json"
    output_path = tmp_path / "policy.json"
    summary_path.write_text(
        json.dumps(
            {
                "sources": {
                    "branches.csv": {
                        "fields": {
                            "branch_name": {"risk": "high"},
                            "sales_index": {"risk": "low"},
                        }
                    }
                },
                "interview_questions": ["Which fields are never allowed?"],
            }
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "init_policy.py"),
            "--discovery-summary",
            str(summary_path),
            "--output",
            str(output_path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["minimum_group_size"] == 5
    assert payload["sources"]["branches.csv"]["fields"]["branch_name"]["risk"] == "high"
    assert payload["sources"]["branches.csv"]["fields"]["branch_name"]["allowed_transforms"] == ["alias"]
    assert payload["setup_questions"] == ["Which fields are never allowed?"]
