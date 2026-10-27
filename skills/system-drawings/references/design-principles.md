# Design principles

These principles come from the brief that produced this skill. When a choice is not covered here, decide the way a 1970s engineering documentation office would.

## The original brief

The requester's own description is summarized below. Treat it as the specification.

> Think in the style of a serious engineer: IBM in the 70s or NASA documentation. The value should come from being able to represent concepts using three-dimensional space and move them as necessary. The style should be incredibly minimal: a white canvas with just lines and maybe a title.
>
> Conceptually, imagine being asked to explain how a car works. When I open the page I see a diagram of a car. If I click on the windshield, I get more information about that component. Same for the door. If I click under the hood, a new screen shows just the engine, and from there I click on a component as appropriate. You go from an overview down to a more fine-grained view.
>
> For a software system, the first thing the reader sees is a typical, normal diagram of all the components and how they talk to each other. The whole thing is interactive: you can follow how a request goes from one place to the next. Click any component and, where necessary (not always, not for every component), you get an overview of its own parts and how they work together, then click those for more detail, and so on.
>
> It should feel less like a static page with a ton of information and more like an interactive environment the reader explores to guide their own understanding.

## Visual vocabulary

| Element | Rule |
|---|---|
| Surface | Pure white `#fff`. A faint floor grid (`#efefef`) gives depth cues; nothing else in the background. |
| Line work | Ink `#111`, 1 px. 1.8 px for the selected or traced part. Faded elements use `#c4c4c4`. Dashed lines mark rejected parts and feedback or return paths. |
| Solids | White-filled prisms with hidden lines removed (painter's algorithm). An orthographic camera, never perspective: measurements stay comparable. |
| Lettering | Uppercase monospace for labels and the title block; a geometric sans for sheet titles. No mixed-case labels on the canvas. |
| Reference designators | Every part carries a hierarchical number (1.7.3). A sheet's number is the number of the part that opens it. |
| Title block | Bottom right: project, revision, sheet number, sheet count, level, date, status legend. |
| Status | A bracketed code after each label: [V] verified, [P] proposed, [W] in progress, [H] hypothesis, [X] rejected. Never encode status with color. |
| Marks | Boxed uppercase tags (`✗ BLOCKED`, `✓ PASS`) that appear above a part during a trace. |
| Color | None. If you feel the need for color, the information belongs in a label, a status code, or a separate sheet. |

## Shape vocabulary

Shape encodes the kind of thing, so the reader learns the system's grammar at a glance.

| Shape | Use for | Example |
|---|---|---|
| `tall` | Models, engines, primary actors that do the heavy work | model, engine |
| `box` | Processes, services, transformations, checks | evaluation battery, transmission |
| `slab` | Data, records, artifacts, inputs and outputs, stores | dataset, release package, fuel tank |
| `diamond` | Decisions and gates | release gate, accept? |
| `column` | People, or round mechanical members | release owner, driver, flywheel |
| `stack` | A repeated layer, drawn as `count` thin plates | 52 decoder blocks |
| `layered` | A base element with an adjustable add-on plate on top | weight matrix plus adapter |

A `dial` makes geometry respond to a slider in the data sheet: a `layered` part's top plate thickens or thins, and other shapes change height. Use a dial when a concept is a continuous quantity the reader benefits from manipulating.

## Interaction model

1. **Orientation.** Drag to orbit, shift-drag to pan, scroll to zoom. The VIEW buttons give ISO, TOP and FRONT views. Parts can be dragged to new positions to declutter or regroup, and double-clicking returns them.
2. **Inspect.** Clicking an ordinary part opens a data sheet panel with FUNCTION, RATIONALE, PARAMETERS (dotted-leader table), NOTES, REFERENCES and CONNECTIONS. The drawing shifts left so nothing is hidden.
3. **Descend.** Clicking a subsystem (labelled `▸ SHEET n`) zooms the camera into it and opens its own sheet. The path at the top left and Esc go back up, zooming out to the parent part.
4. **Trace.** A trace highlights one connection or part at a time. A black square travels the conduit, everything off the path fades, and a numbered caption explains the step. Marks accumulate, so the story's outcome stays visible.

## Writing for the drawing

- **Canvas text:** a reference designator, an uppercase label, and one uppercase subtitle line per part. Link labels appear only on hover, selection, or trace.
- **Data sheet text:** short paragraphs in plain language. `what` says what the part is or does. `why` says why it matters in this system. Facts with numbers go in `params`. Caveats go in `note`.
- **Captions:** one or two sentences, present tense, naming what happens at this step. Inline `code` and **bold** are available.
- **Honesty:** examples, illustrative flows, and estimates are labelled as such. A hypothesis is drawn and tagged as a hypothesis, never as a fact.

## What the drawing is not

- It is not a dashboard, a slide, or a chart. It has no KPIs and no colored status lights.
- It is not exhaustive. A component without explanatory value inside it stays a single part.
- It is not a static picture. If a reader cannot learn something by orbiting, clicking, descending, or tracing, restructure the content.
