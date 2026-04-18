#!/usr/bin/env python3
"""Forward the smoke fixture hook entrypoint to the repo implementation."""

from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path


ROOT = Path(os.environ.get("UNLEAK_REPO_ROOT", Path(__file__).resolve().parents[3]))
SCRIPTS_DIR = ROOT / "scripts"

sys.path.insert(0, str(SCRIPTS_DIR))
runpy.run_path(str(SCRIPTS_DIR / "unleak_hook.py"), run_name="__main__")
