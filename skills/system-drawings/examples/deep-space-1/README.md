# Deep Space 1 system drawings

Open [`index.html`](index.html) directly in a browser. The self-contained HTML requires no server, installation or network connection; external reference links require internet access. It contains nine sheets, 78 parts and 14 illustrative traces, rendered by the unmodified system-drawings engine.

## Video demonstration

[![Deep Space 1 demonstration](demo/preview.jpg)](https://github.com/3xC1ibR/system-drawings/raw/refs/heads/main/skills/system-drawings/examples/deep-space-1/demo/deep_space_1_demo.mp4)

[Watch the demonstration](https://github.com/3xC1ibR/system-drawings/raw/refs/heads/main/skills/system-drawings/examples/deep-space-1/demo/deep_space_1_demo.mp4) or open the checked-in [`demo/deep_space_1_demo.mp4`](demo/deep_space_1_demo.mp4). This 38-second silent recording shows orbit and view controls, two-level subsystem navigation, all six ion-acceleration steps and a component data sheet with source references. Format: H.264 MP4, 1600 × 1000, 25 frames per second, 5.4 MB.

## Sheet index

| Reference | Sheet | Traces |
|---|---|---|
| 1.0 | [DEEP SPACE 1](index.html#spacecraft) | SUNLIGHT TO THRUST; SCIENCE TO EARTH |
| 1.2 | [ELECTRICAL POWER](index.html#power) | GENERATE ELECTRICAL POWER |
| 1.3 | [ION PROPULSION](index.html#propulsion) | FOLLOW THE XENON |
| 1.3.3 | [NSTAR ENGINE MECHANISM](index.html#thruster) | ACCELERATE AN ION |
| 1.4 | [NAVIGATION AND ATTITUDE](index.html#navigation) | OPTICAL COURSE CORRECTION; RECOVER AFTER TRACKER LOSS |
| 1.5 | [SCIENCE INSTRUMENTS](index.html#instruments) | RECORD A VISIBLE IMAGE; MEASURE THE PLASMA |
| 1.7 | [TELECOMMUNICATIONS](index.html#telecommunications) | TRANSMIT ON KA BAND; RECEIVE AN EARTH COMMAND |
| 1.9 | [AUTONOMY EXPERIMENTS](index.html#autonomy) | EXECUTE A HIGH-LEVEL GOAL; REPORT SPACECRAFT HEALTH |
| 1.10 | [STRUCTURE AND THERMAL](index.html#structure) | CARRY A STRUCTURAL LOAD |

All second-level sheets open from the overview. The NSTAR mechanism is a third-level sheet inside ion propulsion.

## Accuracy and interpretation

The drawing is a functional schematic. The solids and their positions are symbolic; the specification fields contain sourced physical dimensions. It is not a dimensioned spacecraft model or a reconstruction of its cable harness. Each part links to NASA/JPL sources.

All V tags identify documented components, mechanisms or historical outcomes, including the failed ultraviolet channel and the November 1999 star-tracker failure. Traces illustrate operating paths rather than replay measured flight telemetry. No proposed hardware or hypothetical flight results are presented.

The original physical arrangement is shown in the [NASA configuration plate, printed page 32 / PDF page 34](https://www.jpl.nasa.gov/news/press_kits/ds1asteroid.pdf#page=34). Its solar arrays are stowed; the separate specifications give the deployed span.

The isolated low-power electronics part is intentional. The sources establish it as one of the twelve technology demonstrations but do not establish a specific connection to the multifunctional panel. Structural validation consequently reports one unconnected-part warning. The repository tests expect this exact warning; additional warnings or errors fail validation.

## Controls

Drag empty space to orbit; shift-drag to pan; scroll to zoom. Click parts for data sheets and subsystems for deeper sheets. Drag parts to rearrange them, and double-click to restore a moved part. Use TRACE for stepwise explanations, INDEX to select a part, and breadcrumbs or Escape to return.

The engine initializes URL deep links on page load. If manually changing only the URL fragment in an already open tab, reload the page; built-in subsystem links and breadcrumbs work without a reload.

## Sources

- [NASA Deep Space 1 press kit, July 1999](https://www.jpl.nasa.gov/news/press_kits/ds1asteroid.pdf)
- [Deep Space 1 primary mission results](https://www.jpl.nasa.gov/nmp/ds1/DS1_Primary_Mission.pdf)
- [JPL DESCANSO: Deep Space 1 Telecommunications](https://descanso.jpl.nasa.gov/DPSummary/All_Article2.pdf)
- [JPL DESCANSO: Deep Space 1 Navigation](https://descanso.jpl.nasa.gov/DPSummary/DS1_Navigation_rev.pdf)
- [NASA mission history](https://science.nasa.gov/mission/deep-space-1/)
- [JPL MICAS technology report](https://www.jpl.nasa.gov/nmp/ds1/tech/micas.html)
- [JPL Remote Agent flight announcement](https://www.jpl.nasa.gov/news/computer-program-assumes-spacecraft-command/)

## Rebuild and verify

Run from the repository root. `drawing.json` is the editable source.

```sh
SKILL_DIRECTORY=skills/system-drawings
EXAMPLE_DIRECTORY=$SKILL_DIRECTORY/examples/deep-space-1
python3 "$SKILL_DIRECTORY/scripts/validate_drawing.py" "$EXAMPLE_DIRECTORY/drawing.json"
python3 "$SKILL_DIRECTORY/scripts/build_drawing.py" "$EXAMPLE_DIRECTORY/drawing.json" -o "$EXAMPLE_DIRECTORY/index.html"
python3 "$SKILL_DIRECTORY/scripts/inspect_drawing.py" "$EXAMPLE_DIRECTORY/index.html" --out /tmp/deep-space-1-inspection --strict
python3 tests/run_tests.py --render
```

The inspection script requires Chrome or Chromium. Set `CHROME_PATH` if it is not found automatically.

## Validation record

Before publication on 27 October 2026, all nine sheets passed layout audits at both 1600 × 1000 and 1280 × 800, with zero layout findings and zero browser script errors. All 80 steps across 14 traces passed browser checks. Subsystem drill-down, breadcrumbs, part deep links, data-sheet closing, source notes, view controls, pointer orbit and automatic trace playback/pause passed. Every sheet and trace screenshot was visually reviewed.

The video passed full-stream decoding and visual review. No browser script errors occurred during recording. The recording used the example's unmodified HTML with a cursor overlay added only to the recording browser.
