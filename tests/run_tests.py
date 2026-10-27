#!/usr/bin/env python3
"""Repository tests for system-drawings.

1. Every example validates with zero errors and zero warnings.
2. Every checked-in example index.html equals a fresh build (examples are not stale).
3. The build is deterministic.
4. The validator rejects known-bad documents.
5. With --render, every example passes headless inspection without script errors or audit findings.

Usage: python3 tests/run_tests.py [--render]
"""
import copy
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKILL = ROOT / "skills" / "system-drawings"
sys.path.insert(0, str(SKILL / "scripts"))
from validate_drawing import validate  # noqa: E402
from build_drawing import build  # noqa: E402

failures = []


def check(cond, message):
    print(("PASS  " if cond else "FAIL  ") + message)
    if not cond:
        failures.append(message)


examples = sorted((SKILL / "examples").glob("*/drawing.json"))
check(len(examples) >= 2, f"found {len(examples)} examples")
for path in examples:
    doc = json.loads(path.read_text(encoding="utf-8"))
    errors, warnings = validate(doc)
    check(not errors and not warnings, f"{path.parent.name}: validates cleanly ({len(errors)} errors, {len(warnings)} warnings)")
    built = build(doc)
    check(built == build(doc), f"{path.parent.name}: build is deterministic")
    html = path.parent / "index.html"
    check(html.exists() and html.read_text(encoding="utf-8") == built, f"{path.parent.name}: index.html is up to date with drawing.json and the engine")

base = json.loads(examples[0].read_text(encoding="utf-8"))


def expect_error(mutate, fragment, name):
    doc = copy.deepcopy(base)
    mutate(doc)
    errors, _ = validate(doc)
    check(any(fragment in e for e in errors), f"validator rejects {name}")


expect_error(lambda d: d["sheets"][0]["links"].append({"from": d["sheets"][0]["parts"][0]["id"], "to": "nonexistent"}), "endpoint", "a link to a missing part")
expect_error(lambda d: d["sheets"][0]["parts"][0].update(shape="sphere"), "shape", "an unknown shape")
expect_error(lambda d: d["sheets"][0]["parts"][1].update(at=d["sheets"][0]["parts"][0]["at"]), "overlap", "overlapping parts")
expect_error(lambda d: d["sheets"].append({"id": "orphan", "title": "Orphan", "parts": []}), "unreachable", "an unreachable sheet")
expect_error(lambda d: d["sheets"][0]["traces"][0]["steps"].append({"link": "a>b", "text": "x"}), "does not exist", "a trace step on a missing link")
expect_error(lambda d: d.update(root="missing"), "root", "a missing root sheet")

if "--render" in sys.argv:
    for path in examples:
        with tempfile.TemporaryDirectory() as tmp:
            res = subprocess.run([sys.executable, str(SKILL / "scripts" / "inspect_drawing.py"), str(path.parent / "index.html"),
                                  "--out", tmp, "--strict"], capture_output=True, text=True)
            print(res.stdout)
            check(res.returncode == 0, f"{path.parent.name}: headless inspection passes")

print(f"\n{len(failures)} failures")
sys.exit(1 if failures else 0)
