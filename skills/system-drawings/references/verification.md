# Verification

A drawing set is done when it validates, builds, passes the audit, and **looks right in every screenshot**. Run the loop until all four hold.

## Commands

```bash
S=<skill directory>
python3 $S/scripts/validate_drawing.py drawing.json
python3 $S/scripts/build_drawing.py drawing.json -o out/index.html
python3 $S/scripts/inspect_drawing.py out/index.html --out out/inspection [--size 1600x1000] [--strict]
```

- `validate_drawing.py` is structural. It checks required fields, unique ids, that every non-root sheet is opened by exactly one part (a tree, no cycles), that link and trace references exist, footprint overlaps and spacing, label lengths and case, unconnected parts, and sheets without traces.
- `build_drawing.py` validates, then inlines the content and engine into one HTML file. The output has no network dependencies and opens from disk.
- `inspect_drawing.py` uses headless Chrome or Chromium (set `CHROME_PATH` if it is not found). It writes one PNG per sheet, one PNG per trace at its middle step, and `inspection.json`. For every sheet it reports:
  - `labelOverlaps`: pairs of part labels intersecting on screen.
  - `labelsOutsideCanvas`: labels cut off by the window.
  - `labelsUnderHud`: labels hidden under the header, controls, title block, or trace bar.
  - `footprintOverlaps`: parts intersecting on the floor.
  - script errors (these always fail the run).

## Visual review checklist (look at each PNG)

- [ ] The root sheet reads as "these are the parts and this is how they talk" within five seconds.
- [ ] No label is covered by a line, a solid, another label, or a panel.
- [ ] Lines do not form a lattice. Buses are straight, and crossings are few and deliberate.
- [ ] Every arrow points the way the thing actually flows.
- [ ] Shapes match the vocabulary (data is a slab, a decision is a diamond, and so on).
- [ ] Every subsystem a reader would ask about has a `▸ SHEET` marker, and the parts marked that way open sheets worth opening.
- [ ] Each trace screenshot shows a lit path that continues from the previous step, a caption that explains the step, and marks only where they matter.
- [ ] Status codes are honest. Illustrative flows say so in their captions.
- [ ] The style is still monochrome line work on white. Nothing decorative has crept in.

## Known limits of the automated checks

- The audit checks **part** labels only. Link labels and trace marks appear during interaction. The engine places each link label at the first position along the link that clears every part label, and omits it from the canvas when none does (the data sheet's CONNECTIONS table still names it). Check marks and captions in the trace screenshots.
- Headless Chrome does not run animation frames reliably. Screenshots show the final drawing but not the fly-in, the moving trace marker, or the panel shift. Open the file in a browser once to confirm those.
- The audit runs at one window size. If the drawing will be shown on small screens, rerun with `--size 1280x800`.

## Delivery report

Tell the requester:
1. The file path and how to open it (`open out/index.html`).
2. The sheet tree (designators and titles) and the traces on each sheet.
3. What is verified, proposed, hypothetical, or illustrative.
4. The remaining rough edges you saw in the screenshots, with the fix you would make next.
