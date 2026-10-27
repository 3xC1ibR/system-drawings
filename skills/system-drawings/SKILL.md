---
name: system-drawings
description: Build explorable three-dimensional technical drawings of a system (software, hardware, a research pipeline, an organization, a mechanism) in the style of 1970s IBM and NASA documentation. The output is a white sheet of black line-drawn solids that people orbit and rearrange, click for data sheets, open into sub-assemblies (car → engine → cylinder), and trace a request through step by step. Use whenever someone asks to visualize, diagram, map, or explain how a system, project, or concept works, wants an interactive architecture diagram, an explorable explanation, a drill-down overview, or wants to follow how a request moves from one component to the next, even if they only say "help me visualize this" or "explain how X works". Produces one self-contained HTML file.
---

# System Drawings

Turn a system into a **drawing set**: a sheet that shows every major component and how the components talk to each other. Each component can be clicked for its data sheet, and the important ones open into their own sheet with finer detail. A reader learns the system by **exploring** it, not by reading a page.

You write the content as `drawing.json`. The bundled engine renders it. Never hand-write the renderer, and never substitute Mermaid, a charting library, a generic "visual explainer" tool, or a colorful dashboard. The style and the interaction model are the point.

## The brief this skill encodes

These are the original requirements, kept as rules (full rationale in [references/design-principles.md](references/design-principles.md)):

1. **Serious engineering documentation.** Think IBM in the 1970s or NASA technical drawings. Incredibly minimal: a white canvas, thin black lines, a title, uppercase lettering, reference designators (1.7.3), a title block. No color, gradients, shadows, emoji, cards, or dashboard chrome.
2. **Meaning carried by three-dimensional space.** Concepts are solids on a floor plane. The reader can orbit, zoom, and drag parts to new positions. Shape encodes kind: a tall block is a model, a flat slab is data, a box is a process, a diamond is a decision, a column is a person, a stack of plates is a repeated layer.
3. **Overview first, then drill down.** The first sheet is the normal diagram of all components and their connections. Clicking an ordinary part (the windshield, the door) opens its data sheet. Clicking a subsystem (under the hood) opens a **new sheet** showing only that subsystem (the engine), whose parts behave the same way. Elaborate only where it helps. Not every part needs its own sheet.
4. **Follow a request.** Every sheet with a flow has at least one **trace**: a step-by-step walk in which a marker moves along the connecting lines, the path stays dark while everything else fades, and a caption explains each step.
5. **An environment, not a page.** Information appears when the reader asks for it. Little text is visible by default. The drawing does the explaining.

## Workflow

### 1. Find the system's real structure (before any coordinates)

Read the source material: code, docs, a README, a conversation, a paper. Then write a **sheet plan** as an indented outline:

```
1.0 SYSTEM (root): 8–12 parts, the components a newcomer must know, and how they connect
  ▸ subsystem A → its own sheet (4–11 parts) only if its internals change understanding
  ▸ subsystem B → its own sheet
traces: root "follow a request"; one per sheet that has a flow
```

Rules:
- The root sheet answers "what are the pieces and how do they talk?" Put subsystems on separate sheets rather than crowding them onto the root.
- Open a sub-sheet only where the reader would ask "how does that work inside?" A part with nothing more to say gets a data sheet, not a sheet.
- Depth of three or four levels is normal (system → subsystem → component → mechanism).
- Each trace follows one concrete thing (a request, a token, a fuel charge, a decision) through real connections. Write captions as plain sentences about what happens at that step.

### 2. Ground the content

- Every part gets `what` (what it is or does) and, where useful, `why` (why it matters here). Use `params` for numbers, `refs` for sources, and `note` for caveats.
- Mark epistemic status on every part. `V` = verified fact, `P` = proposed design, `W` = in progress, `H` = untested hypothesis, `X` = rejected approach (drawn dashed).
- Never invent numbers. Label example traces as illustrative in the caption, and say "estimate" or "typical" where that is true.
- Labels and subtitles are uppercase, short (≤ 30 and ≤ 40 characters), and concrete.

### 3. Lay out each sheet

Follow [references/layout-rules.md](references/layout-rules.md). The rules that matter most:
- Place parts on a grid in world units on the floor `[x, z]`. Use a pitch of **4–5 units** between neighbours; never put two parts closer than 3.5 units in the same x column, or their labels stack.
- One main flow direction per sheet: left → right along x, or back → front along z.
- **Fan-out and fan-in:** put siblings in a row along x, the source behind them, and the sink in front. Use `"route": "z"` on every sibling link so the lines form a clean bus. A column of siblings with default routing produces a tangled lattice.
- When two links would share a segment, separate them with `fromOffset` / `toOffset`. Draw feedback loops as dashed links with explicit `via` waypoints around the outside of the sheet.

### 4. Write `drawing.json`

The schema is in [references/content-schema.md](references/content-schema.md). Start from the worked examples:
- `examples/automobile/drawing.json`: the canonical car → engine → cylinder set, small enough to read in full.
- `examples/causal-delta/drawing.json`: a nine-sheet research system with dials, a concept figure, and 11 traces.

### 5. Validate, build, inspect, and look

```bash
S=<this skill's directory>
python3 $S/scripts/validate_drawing.py drawing.json                 # structure, references, sheet tree, spacing
python3 $S/scripts/build_drawing.py drawing.json -o out/index.html  # self-contained HTML (validates first)
python3 $S/scripts/inspect_drawing.py out/index.html --out out/inspection   # headless Chrome: PNG per sheet and trace + audit
```

`inspect_drawing.py` reports label collisions, labels outside the canvas or under the fixed panels, overlapping parts, and script errors for every sheet. **Then open and look at every PNG.** The audit cannot tell you whether the drawing explains anything, whether lines cross confusingly, or whether a trace tells a coherent story. Fix the layout or content and repeat until every sheet is clean and every trace reads well. The checklist is in [references/verification.md](references/verification.md).

### 6. Deliver

Report the path, the one command to open it (`open out/index.html`), the sheet tree, the traces, what is verified versus proposed or illustrative, and any rough edges you could not fix. Offer one concrete next refinement.

## Reader controls (built into the engine)

- Drag to orbit, shift-drag to pan, scroll to zoom.
- Drag a part to move it; double-click puts it back.
- Click a part for its data sheet, or click a subsystem to fly into its sheet.
- Navigate back with the path at the top left or with Esc. The VIEW buttons switch between ISO, TOP and FRONT, and FIT reframes the sheet.
- The TRACE buttons and the ◀ ▶ arrow keys step through a trace.
- INDEX lists the parts on the current sheet. NOTES buttons open drawing-wide notes.
- Deep links: `index.html#sheetId`, `index.html?trace=A&step=3#sheetId`, `index.html?part=id#sheetId`.

## Anti-patterns

- Adding color, icons, rounded cards, gradients, or a legend of colored chips. Monochrome line work and text tags carry everything.
- Cramming all detail onto the root sheet instead of drilling down.
- Writing paragraphs on the canvas. Prose belongs in data sheets and captions.
- Using traces that jump between unconnected parts, or that narrate instead of following a real path.
- Presenting example or illustrative flows as observed results.
- Delivering without having looked at the screenshots.
