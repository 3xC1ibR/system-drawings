# Layout rules

These rules come from iterating on real drawing sets. Each records a failure that was seen and fixed.

## Coordinates and the default view

- Parts stand on the floor at `[x, z]` world units. The default camera looks from above and in front, with +x toward the lower right of the screen and +z toward the lower left.
- Default footprints are about 2.4 × 1.6 units, so a part plus its two-line label needs roughly 4 units of clearance in screen terms.
- The engine fits each sheet to the window, so absolute scale does not matter. Only relative spacing does.

## Spacing

| Situation | Rule |
|---|---|
| Neighbours in a row along x | Pitch 4–5 units. Use 5 when labels are long (≥ 22 characters). |
| Rows (along z) | Pitch 4.5–5 units between rows. |
| Same x column, different z | ≥ 4 units apart. At 3 units the label of the front part covers the label of the part behind it. |
| Tall parts in front of short ones | Add 1 unit. Tall parts lift their labels into the row behind. |
| Footprint clearance | ≥ 0.6 units (the validator warns below this and errors on overlap). |

## Routing patterns

**Pipeline.** Place parts along one axis at the same coordinate: links are straight lines.

**Fan-out and fan-in (bus).** Put the source behind, the siblings in a row along x, and the sink in front. Give every link `"route": "z"`. The conduits then share a trunk halfway between the rows, which reads as a bus:

```
            source (0, -8)
     ┌──────┬────┴────┬──────┐       route "z" on each link
   a(-10,0) b(-6,0)  …      f(10,0)
     └──────┴────┬────┴──────┘       route "z" on each link
             sink (0, 8)
```

Do not put the siblings in a column with default routing. The x-first conduits criss-cross into a lattice that crosses every label. This was the single biggest readability failure observed.

**Hub.** A central part with spokes: put spokes on the four sides and let the router choose. Use offsets when two spokes would enter the same face.

**Feedback loop.** Draw it as a dashed link with `via` waypoints that run around the outside of the sheet (behind the back row or past the end of the row), never through the middle.

**Parallel links into one face.** Separate them with `toOffset` (and `fromOffset` at the source), typically ±0.6 units along the face.

## Sheet decomposition

- The root sheet holds the components a newcomer must know (8–12). Anything with internal structure worth learning gets its own sheet.
- A sub-sheet holds 4–11 parts. Fewer than 3 means the detail belongs in the parent's data sheet. More than 12 means split it again.
- Group a sub-sheet by function, not by code module, unless the reader's task is navigating the code.
- Show the boundary: inputs entering and outputs leaving a sub-sheet appear as parts at its edges (`BLOCK INPUT`, `TO TRANSMISSION`).

## Labels

- Uppercase, ≤ 30 characters for the label and ≤ 40 for the subtitle. Labels center over the top of the part. Wide labels on neighbours that are 4 units apart will touch, so shorten them rather than widening the spacing past 5.
- Link labels appear only during hover, selection, or trace, at the middle of the longest segment. Short links (< 3 units of visible conduit) can collide with part labels. Lengthen them or keep their labels very short.

## Traces

- Each step should light up something adjacent to the previous step: a link from the last part, or the part that link reached. A jump across the sheet breaks the story.
- 5–12 steps per trace. Split longer stories into two traces.
- Use `mark` for outcomes the reader should remember (PASS, BLOCKED, OPEN, RUNNING). Do not mark every step.

## Lessons recorded

1. A three-line canvas label (name, subtitle, status) collided constantly. Two lines with an inline status code fixed it.
2. Arrowheads drawn after all faces appeared on top of solids that should hide them. They are now depth-sorted and placed at 62 % of the last segment, so they stay visible when the endpoint is behind a part.
3. A data sheet panel covering the right third of the drawing hid parts. The drawing now shifts left when the panel opens.
4. Fan-out sheets laid out as columns produced line lattices. Rows with z-routed buses solved every case.
5. A decision prism with unequal sides looked like a skewed box. The diamond footprint is square.
6. Link labels at segment midpoints landed on part labels when links were short. The engine now searches positions along and beside the link, and omits the canvas label if none is clear.
7. Lengthening a sheet along one axis shrinks the whole drawing to fit, which makes labels relatively larger and can create new collisions along the other axis. After respacing one axis, rerun the inspection.
