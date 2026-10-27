#!/usr/bin/env python3
"""Validate a system-drawings content file (drawing.json).

Checks structure, references between sheets, parts, links and traces, the
sheet tree, and world-space layout rules. Errors make the drawing unusable;
warnings mark choices that usually produce a poor drawing.

Usage: python3 validate_drawing.py drawing.json [--json]
Exit status: 0 when there are no errors, 1 otherwise.
"""
import json
import math
import re
import sys

SHAPES = {"box": (2.4, 1.0, 1.6), "tall": (2.4, 1.8, 1.6), "slab": (2.4, 0.28, 1.6), "diamond": (2.3, 1.0, 2.3),
          "column": (1.0, 1.9, 1.0), "stack": (2.6, 0.0, 1.8), "layered": (2.2, 0.55, 1.4)}
STATUS = {"V", "P", "W", "H", "X"}
ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
LABEL_MAX, SUB_MAX, PARTS_MAX, PARTS_MIN = 30, 40, 12, 3
MIN_GAP = 0.6           # minimum clear distance between part footprints, world units
ROW_PITCH_MIN = 3.5     # minimum centre distance for parts whose labels would stack


def footprint(part):
    w, _, d = part.get("size") or SHAPES.get(part.get("shape"), SHAPES["box"])
    x, z = part["at"]
    return (x - w / 2, z - d / 2, x + w / 2, z + d / 2)


def gap(a, b):
    """Clear distance between two axis-aligned rectangles (0 when they touch or overlap)."""
    dx = max(0.0, max(a[0], b[0]) - min(a[2], b[2]))
    dz = max(0.0, max(a[1], b[1]) - min(a[3], b[3]))
    overlap = a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]
    return -1.0 if overlap else math.hypot(dx, dz)


def validate(doc):
    errors, warnings = [], []
    err, warn = errors.append, warnings.append

    for key in ("project", "root", "sheets"):
        if key not in doc:
            err(f"top level: missing '{key}'")
    if errors:
        return errors, warnings
    if not isinstance(doc["sheets"], list) or not doc["sheets"]:
        err("top level: 'sheets' must be a non-empty list")
        return errors, warnings

    sheets = {}
    for s in doc["sheets"]:
        sid = s.get("id")
        if not sid or not ID_RE.match(sid):
            err(f"sheet id {sid!r}: must match {ID_RE.pattern}")
            continue
        if sid in sheets:
            err(f"sheet {sid}: duplicate id")
        sheets[sid] = s
    if doc["root"] not in sheets:
        err(f"root {doc['root']!r} is not a sheet id")

    drilled_by = {}
    for sid, s in sheets.items():
        where = f"sheet {sid}"
        for key in ("title", "parts"):
            if key not in s:
                err(f"{where}: missing '{key}'")
        if not s.get("purpose"):
            warn(f"{where}: no 'purpose' sentence; the header will be empty")
        parts = s.get("parts", [])
        if len(parts) > PARTS_MAX:
            warn(f"{where}: {len(parts)} parts; above {PARTS_MAX} the sheet gets crowded, move detail into a sub-sheet")
        if 0 < len(parts) < PARTS_MIN and sid != doc["root"]:
            warn(f"{where}: only {len(parts)} parts; a sub-sheet this small may not justify its own drawing")
        pids = {}
        for p in parts:
            pid = p.get("id")
            pw = f"{where} part {pid}"
            if not pid or not ID_RE.match(pid):
                err(f"{where}: part id {pid!r} must match {ID_RE.pattern}")
                continue
            if pid in pids:
                err(f"{pw}: duplicate id")
            pids[pid] = p
            if p.get("shape") not in SHAPES:
                err(f"{pw}: shape {p.get('shape')!r} not in {sorted(SHAPES)}")
            at = p.get("at")
            if not (isinstance(at, list) and len(at) == 2 and all(isinstance(v, (int, float)) for v in at)):
                err(f"{pw}: 'at' must be [x, z] numbers")
            if p.get("status") not in STATUS:
                err(f"{pw}: status {p.get('status')!r} not in {sorted(STATUS)}")
            label, sub = p.get("label", ""), p.get("sub", "")
            if not label:
                err(f"{pw}: missing 'label'")
            if len(label) > LABEL_MAX:
                warn(f"{pw}: label has {len(label)} characters (max {LABEL_MAX}); long labels collide")
            if len(sub) > SUB_MAX:
                warn(f"{pw}: sub has {len(sub)} characters (max {SUB_MAX})")
            if label != label.upper() or sub != sub.upper():
                warn(f"{pw}: label and sub are drawn as uppercase engineering lettering; write them in uppercase")
            if p.get("drill"):
                drilled_by.setdefault(p["drill"], []).append(f"{sid}.{pid}")
                if p["drill"] not in sheets:
                    err(f"{pw}: drill target {p['drill']!r} is not a sheet")
            elif not p.get("what"):
                warn(f"{pw}: no 'what' and no 'drill'; clicking it shows an empty data sheet")
            if p.get("shape") == "stack" and not isinstance(p.get("count", 12), int):
                err(f"{pw}: stack 'count' must be an integer")
            if "dial" in p and p["dial"].get("scope") not in ("local", "global"):
                err(f"{pw}: dial.scope must be 'local' or 'global'")
            if "figure" in p and p["figure"].get("type") != "interpolation":
                err(f"{pw}: figure.type must be 'interpolation'")
            for k in ("params", "refs"):
                for row in p.get(k, []):
                    if not (isinstance(row, list) and len(row) == 2):
                        err(f"{pw}: each '{k}' entry must be a [key, value] pair")

        valid_parts = [p for p in parts if isinstance(p.get("at"), list) and len(p.get("at")) == 2]
        for i, a in enumerate(valid_parts):
            for b in valid_parts[i + 1:]:
                g = gap(footprint(a), footprint(b))
                if g < 0:
                    err(f"{where}: parts {a['id']} and {b['id']} overlap on the floor")
                elif g < MIN_GAP:
                    warn(f"{where}: parts {a['id']} and {b['id']} are {g:.2f} units apart (min {MIN_GAP})")
                dx, dz = abs(a["at"][0] - b["at"][0]), abs(a["at"][1] - b["at"][1])
                if dx < 1.0 and 0 < dz < ROW_PITCH_MIN:
                    warn(f"{where}: {a['id']} and {b['id']} share an x column {dz:.1f} units apart; their labels will stack, use >= {ROW_PITCH_MIN}")

        link_keys = set()
        for l in s.get("links", []):
            f, t = l.get("from"), l.get("to")
            lw = f"{where} link {f}>{t}"
            if f not in pids or t not in pids:
                err(f"{lw}: endpoint is not a part on this sheet")
                continue
            if f == t:
                err(f"{lw}: a link cannot connect a part to itself")
            key = f"{f}>{t}"
            if key in link_keys:
                err(f"{lw}: duplicate link")
            link_keys.add(key)
            if l.get("route") not in (None, "x", "z"):
                err(f"{lw}: route must be 'x' or 'z'")
            for v in l.get("via", []):
                if not (isinstance(v, list) and len(v) == 2):
                    err(f"{lw}: each via point must be [x, z]")
            if l.get("label") and len(l["label"]) > 28:
                warn(f"{lw}: link label longer than 28 characters")

        connected = {e for k in link_keys for e in k.split(">")}
        for pid in pids:
            if pid not in connected and len(pids) > 1:
                warn(f"{where} part {pid}: not connected to anything; say why it belongs on this sheet or link it")

        for t in s.get("traces", []):
            tw = f"{where} trace {t.get('id')}"
            if not t.get("id") or not t.get("label") or not t.get("steps"):
                err(f"{tw}: needs id, label and steps")
                continue
            for n, st in enumerate(t["steps"], 1):
                if ("part" in st) == ("link" in st):
                    err(f"{tw} step {n}: give exactly one of 'part' or 'link'")
                elif "part" in st and st["part"] not in pids:
                    err(f"{tw} step {n}: part {st['part']!r} is not on this sheet")
                elif "link" in st and st["link"] not in link_keys:
                    err(f"{tw} step {n}: link {st['link']!r} does not exist (use 'from>to')")
                if not st.get("text"):
                    err(f"{tw} step {n}: missing 'text'")
                mark = st.get("mark")
                if mark is not None and (not isinstance(mark, list) or len(mark) != 2 or mark[0] not in pids):
                    err(f"{tw} step {n}: mark must be [partId, text] for a part on this sheet")
        if parts and len(parts) > 3 and not s.get("traces") and s.get("links"):
            warn(f"{where}: no traces; add at least one walk-through of how something moves through this sheet")

    for sid in sheets:
        n = len(drilled_by.get(sid, []))
        if sid == doc.get("root"):
            if n:
                err(f"sheet {sid}: the root sheet cannot be a drill target")
        elif n == 0:
            err(f"sheet {sid}: unreachable; no part drills into it")
        elif n > 1:
            err(f"sheet {sid}: drilled into by {n} parts {drilled_by[sid]}; the sheets must form a tree")

    # cycle check (a drill chain that returns to an ancestor)
    def walk(sid, stack):
        if sid in stack:
            err(f"drill cycle: {' > '.join(stack + [sid])}")
            return
        for p in sheets.get(sid, {}).get("parts", []):
            if p.get("drill") in sheets:
                walk(p["drill"], stack + [sid])
    if doc.get("root") in sheets:
        walk(doc["root"], [])

    for n in doc.get("notes", []):
        if not n.get("title") or not isinstance(n.get("blocks"), list):
            err(f"note {n.get('id')!r}: needs a title and a 'blocks' list")
    return errors, warnings


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    with open(argv[1], encoding="utf-8") as fh:
        doc = json.load(fh)
    errors, warnings = validate(doc)
    if "--json" in argv:
        print(json.dumps({"errors": errors, "warnings": warnings}, indent=1))
    else:
        for e in errors:
            print(f"ERROR    {e}")
        for w in warnings:
            print(f"WARNING  {w}")
        sheets = len(doc.get("sheets", []))
        parts = sum(len(s.get("parts", [])) for s in doc.get("sheets", []))
        traces = sum(len(s.get("traces", [])) for s in doc.get("sheets", []))
        print(f"{argv[1]}: {sheets} sheets, {parts} parts, {traces} traces; {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
