#!/usr/bin/env python3
"""Validate that an application release tag matches every version manifest."""

from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def fail(message: str) -> None:
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


if len(sys.argv) != 2:
    fail("usage: validate-release.py <tag>")

tag = sys.argv[1]
versions = {
    "package.json": json.loads((ROOT / "package.json").read_text())["version"],
    "Cargo.toml": tomllib.loads((ROOT / "Cargo.toml").read_text())["workspace"]["package"]["version"],
    "src-tauri/tauri.conf.json": json.loads(
        (ROOT / "src-tauri/tauri.conf.json").read_text()
    )["version"],
}

for path, version in versions.items():
    if not SEMVER.fullmatch(version):
        fail(f"{path} contains an invalid application version: {version!r}")

if len(set(versions.values())) != 1:
    details = ", ".join(f"{path}={version}" for path, version in versions.items())
    fail(f"application version manifests do not match: {details}")

expected_tag = f"v{next(iter(versions.values()))}"
if tag != expected_tag:
    fail(f"release tag {tag!r} does not match the application version tag {expected_tag!r}")

print(f"Release tag {tag} matches all application version manifests.")
