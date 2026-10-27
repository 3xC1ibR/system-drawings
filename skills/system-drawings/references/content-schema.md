# Content schema: `drawing.json` (system-drawings/1)

The engine renders one JSON document. `scripts/validate_drawing.py` enforces everything marked **required** and the cross-references between fields.

## Top level

```json
{
  "schema": "system-drawings/1",
  "project": "PASSENGER CAR · GENERAL ARRANGEMENT",
  "revision": "A",
  "date": "2026-10-27",
  "root": "car",
  "camera": { "yaw": -0.55, "pitch": 0.62 },
  "sheets": [ ... ],
  "notes": [ ... ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `project` | yes | Title-block heading and page title. Uppercase. |
| `root` | yes | Id of the overview sheet. |
| `sheets` | yes | All sheets. Every non-root sheet must be the `drill` target of exactly one part, so the sheets form a tree. |
| `revision`, `date` | no | Title block. |
| `camera` | no | Default orbit in radians. Yaw is about the vertical axis; pitch is the elevation (0.05–1.52). The defaults give a classic isometric-like view. |
| `notes` | no | Drawing-wide reference notes, one button each in the NOTES row. |

Reference designators are assigned automatically. The root sheet is 1.0, its parts are 1.1, 1.2, and so on in array order, and a sub-sheet takes the designator of the part that opens it (1.6 → parts 1.6.1, 1.6.2 …). **Array order is designator order.** Put parts in reading order.

## Sheet

```json
{
  "id": "engine",
  "short": "ENGINE",
  "title": "Inside the engine",
  "purpose": "One or two sentences shown under the title: what this sheet explains.",
  "parts": [ ... ],
  "links": [ ... ],
  "traces": [ ... ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | `[a-z][a-z0-9_]*`, unique across the drawing. Also the URL hash. |
| `title` | yes | Sheet heading, displayed in uppercase. |
| `short` | no | Breadcrumb name (uppercase). Defaults to the title. |
| `purpose` | recommended | The header sentence. |
| `parts` | yes | 3–12 parts. Above 12, move detail into a sub-sheet. |
| `links`, `traces` | no | See below. |

## Part

```json
{
  "id": "camshaft",
  "shape": "box",
  "at": [0, -5],
  "status": "V",
  "label": "CAMSHAFT",
  "sub": "OPENS THE VALVES",
  "what": "Lobes on a shaft push the valves open at the right moment.",
  "why": "A four-stroke cycle takes two revolutions, so it turns at half crankshaft speed.",
  "params": [["SPEED", "1/2 × CRANKSHAFT"], ["DRIVE", "TIMING BELT OR CHAIN"]],
  "note": "Caveat or limitation, shown with a rule at the left.",
  "refs": [["Source title", "https://..."]],
  "drill": "cylinder"
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique on its sheet. |
| `shape` | yes | `box`, `tall`, `slab`, `diamond`, `column`, `stack`, `layered` (see design-principles.md). |
| `at` | yes | `[x, z]` floor position in world units. Parts stand on the floor. |
| `status` | yes | `V` verified, `P` proposed, `W` in progress, `H` hypothesis, `X` rejected (drawn dashed). |
| `label` | yes | Uppercase, ≤ 30 characters. |
| `sub` | recommended | Uppercase subtitle, ≤ 40 characters. |
| `what`, `why` | recommended | Data sheet FUNCTION and RATIONALE. Required in practice unless the part has `drill`. |
| `params` | no | `[key, value]` rows rendered with dotted leaders. |
| `note`, `refs` | no | Caveat; source links. |
| `drill` | no | Id of the sheet this part opens. Clicking the part flies into that sheet. |
| `size` | no | `[width, height, depth]` override. |
| `count` | `stack` only | Number of plates (default 12). |
| `dial` | no | Adds a slider to the data sheet and binds geometry to it (below). |
| `figure` | no | An interactive concept figure in the data sheet (below). |

### Dial

```json
"dial": {
  "scope": "local",
  "title": "DIAL",
  "formula": "W = W_original + {g} · ΔW",
  "step": 0.25,
  "states": { "1": "1.00 — as trained.", "0": "0.00 — removed.", "mid": "{g} — contributes {pct} %." },
  "caption": "Illustrates the mechanism; not a measured effect."
}
```

`scope: "local"` gives the part its own value. `scope: "global"` shares one value among every global-dial part in the drawing. For example, a "gate dials" control can drive an "adapter" slab's thickness. `{g}` and `{pct}` are substituted in `formula` and `states`. The `layered` shape's top plate follows the dial; other shapes scale their height.

### Figure (interpolation)

A two-axis concept sketch with a point that moves along a curve between two labelled states as the reader drags a slider. Use it to show a continuous tradeoff without inventing data.

```json
"figure": {
  "type": "interpolation",
  "title": "CONCEPT · ONE DIAL FOR EVERYTHING",
  "xLabel": "TASK SKILL", "yLabel": "HONEST REPORTS", "slider": "Scale",
  "from": { "label": "ORIGINAL", "x": 0.12, "y": 0.79 },
  "to":   { "label": "ADAPTED",  "x": 0.84, "y": 0.18 },
  "bend": [0.45, 0.63],
  "target": { "label": "TARGET", "x": 0.70, "y": 0.62, "w": 0.28, "h": 0.26 },
  "states": { "1": "as trained", "0": "rollback", "mid": "part of each" },
  "caption": "No measured values."
}
```

Coordinates are normalized from 0 to 1 with y pointing up. The slider value 1 sits at `to` and 0 at `from`.

## Link

```json
{ "from": "crank", "to": "camshaft", "label": "TIMING CHAIN · 1/2 SPEED",
  "route": "z", "fromOffset": [0.6, 0], "toOffset": [0.6, 0], "dashed": false,
  "via": [[11, -6.5], [-7, -6.5]] }
```

| Field | Meaning |
|---|---|
| `from`, `to` | Part ids on the same sheet. The key `from>to` identifies the link in traces. |
| `label` | Uppercase, ≤ 28 characters. Shown only on hover, selection, or trace. |
| `route` | `x` or `z`: which axis the conduit travels first. Defaults to the larger displacement. |
| `fromOffset`, `toOffset` | Shift an endpoint `[dx, dz]` so parallel links do not share a segment. |
| `via` | Explicit `[x, z]` waypoints; use axis-aligned steps. |
| `dashed` | Feedback, return, optional, or rejected paths. |

Links are axis-aligned conduits on the floor, clipped at part boundaries, with an arrowhead on the last segment.

## Trace

```json
{ "id": "A", "label": "PRESS THE ACCELERATOR", "steps": [
  { "part": "driver", "text": "The driver presses the accelerator pedal." },
  { "link": "driver>controls", "text": "A sensor measures how far." },
  { "part": "transmission", "text": "In a low gear the transmission multiplies torque.", "mark": ["transmission", "GEAR 2"] }
]}
```

Each step names exactly one `part` or one `link` (`from>to`, which must exist) and a `text` caption. `mark` attaches a boxed tag to a part from that step onward. Captions support the inline markup below. A step that focuses a subsystem shows its summary with an OPEN SHEET button.

## Note

```json
{ "id": "why", "button": "WHY", "ref": "NOTE A", "title": "Why this matters", "blocks": [
  { "h": "DOCUMENTED CASES" },
  { "p": "Paragraph with a [link](https://example.com)." },
  { "list": ["Item one", "Item two"] },
  { "kv": [["KEY", "VALUE"]] },
  { "note": "Caveat." }
]}
```

## Inline markup

Allowed in `what`, `why`, `note`, `params` values, captions, and note blocks: `` `code` ``, `**bold**`, `[text](https://url)`. Everything else is escaped. HTML is never interpreted.
