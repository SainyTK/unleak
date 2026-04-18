#!/usr/bin/env python3
"""Compatibility wrapper for the caveman-style benchmarks entrypoint."""

from __future__ import annotations

import runpy
from pathlib import Path


if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("run_benchmarks.py")), run_name="__main__")
