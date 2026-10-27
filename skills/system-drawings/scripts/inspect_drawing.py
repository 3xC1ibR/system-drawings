#!/usr/bin/env python3
"""Render every sheet and trace of a built drawing set in headless Chrome.

For each sheet it saves a screenshot and runs the engine's audit mode, which
reports label collisions, labels outside the canvas or under the fixed
heads-up panels, overlapping footprints, and script errors. For each trace it
saves a screenshot of the middle step. Look at every PNG afterwards: the audit
finds collisions, it cannot judge whether the drawing explains anything.

Usage: python3 inspect_drawing.py index.html --out shots/ [--size 1600x1000] [--strict]
Exit status: 1 on script errors (or on any audit finding with --strict).
Set CHROME_PATH if Chrome or Chromium is not found automatically.
"""
import argparse
import html
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome",
]


def find_chrome():
    if os.environ.get("CHROME_PATH"):
        return os.environ["CHROME_PATH"]
    for c in CANDIDATES:
        if os.path.isabs(c) and os.path.exists(c):
            return c
        found = shutil.which(c)
        if found:
            return found
    sys.exit("Chrome or Chromium not found; set CHROME_PATH")


def chrome(binary, url, size, extra):
    cmd = [binary, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
           f"--window-size={size}", "--virtual-time-budget=4000", *extra, url]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def sheet_ids(html_text):
    m = re.search(r"const DRAWING = (\{.*?\});\s*</script>", html_text, re.S)
    if not m:
        sys.exit("could not find the DRAWING object; was this file built by build_drawing.py?")
    doc = json.loads(m.group(1).replace("<\\/", "</"))
    return doc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("html")
    ap.add_argument("--out", default="drawing-inspection")
    ap.add_argument("--size", default="1600x1000")
    ap.add_argument("--strict", action="store_true", help="fail on any audit finding, not only script errors")
    args = ap.parse_args()

    src = pathlib.Path(args.html).resolve()
    doc = sheet_ids(src.read_text(encoding="utf-8"))
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    binary, size = find_chrome(), args.size.replace("x", ",")
    base = src.as_uri()
    summary, failures, findings = [], 0, 0

    for s in doc["sheets"]:
        sid = s["id"]
        chrome(binary, f"{base}#{sid}", size, [f"--screenshot={out / (sid + '.png')}"])
        res = chrome(binary, f"{base}?audit=1#{sid}", size, ["--dump-dom"])
        m = re.search(r'<pre id="audit" class="sr">(.*?)</pre>', res.stdout, re.S)
        if not m:
            summary.append({"sheet": sid, "error": "no audit output (script failed to run?)"})
            failures += 1
            print(f"FAIL   {sid}: no audit output")
            continue
        report = json.loads(html.unescape(m.group(1)))
        sh = report["sheet"]
        issues = {k: sh[k] for k in ("labelOverlaps", "labelsOutsideCanvas", "labelsUnderHud", "footprintOverlaps") if sh[k]}
        if report["errors"]:
            failures += 1
        findings += sum(len(v) for v in issues.values())
        status = "FAIL" if report["errors"] else ("CHECK" if issues else "OK")
        print(f"{status:6} {sh['ref']:8} {sid:24} parts {sh['parts']:2}  links {sh['links']:2}  traces {sh['traces']}"
              + (f"  errors {report['errors']}" if report["errors"] else "")
              + "".join(f"\n         {k}: {v}" for k, v in issues.items()))
        summary.append({"sheet": sid, "ref": sh["ref"], "errors": report["errors"], **issues})
        for t in s.get("traces", []):
            mid = max(1, (len(t["steps"]) + 1) // 2)
            name = f"{sid}__trace_{t['id']}_step{mid}.png"
            chrome(binary, f"{base}?trace={t['id']}&step={mid}#{sid}", size, [f"--screenshot={out / name}"])

    (out / "inspection.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(f"\nscreenshots and inspection.json in {out}/ — open and look at every PNG before delivering")
    if failures or (args.strict and findings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
