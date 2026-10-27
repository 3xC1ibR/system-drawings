#!/usr/bin/env python3
"""Build a self-contained HTML drawing set from a content file.

Validates drawing.json, then inlines it with the engine into the template.
The output has no external dependencies and opens directly from disk.

Usage: python3 build_drawing.py drawing.json -o index.html [--allow-warnings-only] [--skip-validation]
"""
import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
sys.path.insert(0, str(HERE))
from validate_drawing import validate  # noqa: E402


def build(doc):
    template = (ASSETS / "template.html").read_text(encoding="utf-8")
    engine = (ASSETS / "engine.js").read_text(encoding="utf-8")
    data = json.dumps(doc, ensure_ascii=False, indent=1).replace("</", "<\\/")
    title = doc.get("project", "System drawings").replace("<", "&lt;")
    out = template.replace("__TITLE__", title).replace("__DRAWING_JSON__", data).replace("__ENGINE_JS__", engine)
    for marker in ("__TITLE__", "__DRAWING_JSON__", "__ENGINE_JS__"):
        if marker in out:
            raise RuntimeError(f"template placeholder {marker} was not replaced")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("content", help="drawing.json")
    ap.add_argument("-o", "--output", required=True, help="output HTML path")
    ap.add_argument("--skip-validation", action="store_true")
    args = ap.parse_args()
    doc = json.loads(pathlib.Path(args.content).read_text(encoding="utf-8"))
    if not args.skip_validation:
        errors, warnings = validate(doc)
        for w in warnings:
            print(f"WARNING  {w}")
        for e in errors:
            print(f"ERROR    {e}")
        if errors:
            print("build stopped: fix the errors above (or pass --skip-validation)")
            return 1
    out = pathlib.Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(doc), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
