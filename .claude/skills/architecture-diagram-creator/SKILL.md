---
name: architecture-diagram-creator
description: Create or edit clean, professional software/network architecture diagrams (services, DBs, DMZs, trust zones, auth flows, mobile/web clients) as draw.io (.drawio) files, in a cloud-agnostic pastel style. Use whenever the user asks to draw, create, update, or fix a general (non-AWS-specific) architecture, network, or system diagram. For AWS-specific diagrams with official AWS icons, use aws-diagram-creator instead.
---

# Architecture Diagram Creator

Produce neat, uncluttered software/network architecture diagrams as **draw.io (`.drawio`)
files**, for systems that aren't AWS-icon diagrams — service topologies, DMZ/trust-zone
layouts, auth flows, client/server boundaries. The output is always a single `.drawio` file
the user opens in draw.io / the VS Code Draw.io extension. Derive the architecture from
whatever the user points at (code, config, prose) and ask when something is genuinely
ambiguous. A full worked example lives at `reference/DMZ_architecture_diagram.drawio` —
open it to see every convention below in context.

## Non-negotiable preferences

These carry over from this user's AWS diagram preferences (see `aws-diagram-creator`) and
apply here too, since they're about the medium, not about AWS:

1. **Output is a `.drawio` file.** Never deliver an image or ASCII as the deliverable.
2. **Clean and easy on the eye.** Pastel container/box backgrounds with a darker stroke and
   a near-black font of the same hue (see palette below) — never a wall of deep saturated
   color.
3. **Minimal text.** Only the text needed to explain an operation. Short bold node names
   (`Leaves`, `SSO`, `API Layer`), short edge captions (`GraphQL + JWT`, `:8080`).
4. **All text is independent, freely-movable text boxes.** Nodes and edges carry an empty
   `value=""` wherever practical, or short bold inline text for the box itself; standalone
   captions (section titles, edge labels like "DMZ", "Private Network", "GraphQL + JWT")
   are their own `text;html=1;...` cells positioned near their target, not edge labels
   riding the line. The user wants to drag any text freely without moving the shape it
   annotates.
5. **Edge labels never sit on the arrow.** Place each caption off to the side (above for
   horizontal runs, beside for vertical ones) as its own text cell.
6. **Consolidate to reduce clutter.** Collapse repetitive/equivalent resources into one
   labeled node (e.g. many worker instances → one "Other Services" box) rather than drawing
   every instance.
7. **Dark-mode aware colors.** Use draw.io's `light-dark(<light>, <dark>)` fill/stroke
   syntax on shapes (see DB template below) so the diagram reads correctly in both draw.io
   themes, not just light mode.

## Visual style reference

**Boxes** — `rounded=1;whiteSpace=wrap;html=1;fillColor=<FILL>;strokeColor=<STROKE>;fontColor=<FONT>;fontSize=13;`
with a short bold `value` (e.g. `<b>Leaves</b>`). Pick the fill/stroke/font triple by role:

| Role                                            | Fill      | Stroke    | Font      |
|--------------------------------------------------|-----------|-----------|-----------|
| Backend service / internal app                   | `#EAF3DE` | `#3B6D11` | `#173404` |
| API / gateway / mediation layer                  | `#E6F1FB` | `#185FA5` | `#042C53` |
| Data tier (DB boxes, data-tier grouping panels)   | `#FAEEDA` | `#BA7517` | `#633806` |
| Auth / identity / security-sensitive component    | `#FAECE7` | `#993C1D` | `#4A1B0C` |
| External client (mobile/web/desktop app)          | `#EEEDFE` | `#534AB7` | `#26215C` |
| Generic / unclassified / "other"                  | `#F1EFE8` | `#5F5E5A` | `#2C2C2A` |

Each triple is one pastel family: fill is the palest tint, stroke is a mid-saturation
version of the same hue, font is a near-black shade of the same hue (never plain `#000000`).
When a role isn't in the table, derive a new triple the same way rather than reusing an
unrelated color.

**Trust/network boundaries** (e.g. "Private Network", a VPC, a corporate LAN) — a **dashed**
rounded rectangle in the teal/green family, empty `value`, label as an independent bold text
box (top-left corner, outside or just inside the box), not the container's own value:

```
rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=#E1F5EE;strokeColor=#0F6E56;fontColor=#04342C;fontSize=13;verticalAlign=top;align=left;spacingLeft=20;spacingTop=10;
```

**Sub-zones** (e.g. a DMZ carved out of the wider network) — a **solid** (non-dashed) pastel
panel in the data-tier tan family, sized to enclose the components that belong to it, with a
small bold caption text cell (e.g. `DMZ`) placed near an inside edge, not as the panel's
value:

```
rounded=1;whiteSpace=wrap;html=1;fillColor=#FAEEDA;strokeColor=#BA7517;fontColor=#633806;fontSize=13;
```

Dashed = a hard trust/network boundary; solid pastel panel = a softer logical sub-zone
nested within one. Don't dash a sub-zone — that's reserved for the outermost boundary.

**Databases** — the generic (non-AWS) flowchart database cylinder, with dark-mode-aware
colors:

```
strokeWidth=1;html=1;shape=mxgraph.flowchart.database;whiteSpace=wrap;fillColor=light-dark(#FAEEDA,#281E0C);gradientColor=none;strokeColor=light-dark(#BA7517,#B77B2B);align=center;
```

Swap the light-dark pair to match whichever role-color family the DB belongs to if it isn't
the default data tier tan.

**Edges** — `html=1;rounded=1;strokeColor=#5F5E5A;` (neutral gray, not the box's own color)
plus one of two arrowhead conventions depending on what the edge means:
- **Peer / bidirectional exchange** (a service talking to its own DB, a two-way data sync)
  — filled arrowheads on both ends: `startArrow=classic;startFill=1;endArrow=classic;`
- **Directional request / delegation** (a caller reaching a callee, one thing delegating to
  another, e.g. "authenticate via") — thin tail, filled head:
  `startArrow=classicThin;startFill=1;endArrow=classic;`

Attach every edge to real node `id`s via `source=`/`target=` so it reflows when a box moves;
only use free-floating `sourcePoint`/`targetPoint` for the rare edge that isn't anchored to a
node. Use `edgeStyle=orthogonalEdgeStyle` when an edge needs to route around other boxes;
leave it off (straight line) for short direct parent-child links. `flowAnimation=1` can mark
one primary path for emphasis — don't apply it to every edge or it loses meaning.

**Text captions** — independent cells, not edge/node labels:
`text;html=1;align=center;verticalAlign=middle;fontSize=12;fontColor=#5F5E5A;` with the
caption in an inline `<font style="font-size: 14px;">...</font>` span for edge captions
(e.g. `GraphQL + JWT`, `Authenticate + Obtain JWT`). Section/zone titles (`Private Network`,
`DMZ`) use bold and a larger size (15-16px) and the same neutral gray font color.

**Grouping cells** — purely organizational `group` cells (`connectable="0"`, empty `value`)
are fine for moving a cluster of boxes together; they carry no visual style of their own.

## Modeling guidance

A common shape for this family of diagrams (see the reference example): an outer trust
boundary contains a row of backend services, each paired with its own database via a
bidirectional edge; a mediation layer (API/gateway) sits below them and exchanges a
bidirectional, protocol-labeled edge (`GraphQL + JWT`, `REST + API key`, etc.) with every
service; that mediation layer lives inside a solid-panel sub-zone (the DMZ) nested in the
outer boundary; an auth component connects to the mediation layer with a directional edge
and may itself delegate further out to an external identity provider; external clients
(mobile/web apps) sit outside the boundary and connect directly into the mediation layer.
Adapt this shape to what the user actually describes — it's a starting mental model, not a
template to force-fit.

## Starter template

Layer order: boundaries/panels first (back), then boxes and DB shapes, then edges, then all
caption text boxes (front). Keep `pageWidth`/`pageHeight` generous.

```xml
<mxfile host="app.diagrams.net">
  <diagram id="architecture" name="Architecture">
    <mxGraphModel grid="1" page="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" pageScale="1" pageWidth="1200" pageHeight="1000" math="0" shadow="0">
      <root>
        <mxCell id="0" /><mxCell id="1" parent="0" />
        <!-- outer trust boundary (dashed) -->
        <!-- sub-zone panel(s) (solid pastel) -->
        <!-- service / component boxes (value="<b>Name</b>") -->
        <!-- DB cylinders -->
        <!-- edges (value="", source/target by id) -->
        <!-- free-floating caption text boxes -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Maintenance

This skill is a living document. **Whenever the user gives new feedback about how they want
these diagrams done** (a color, a shape, a layout rule, a text convention), update this file
so the preference persists. Treat the user's word as authoritative over the defaults written
here.

## Reference

`reference/DMZ_architecture_diagram.drawio` — a full worked example (services with their own
DBs, an API layer, a DMZ sub-zone, SSO/IdP delegation, an external mobile client) that every
convention above was extracted from. When in doubt about a concrete style string, open it and
copy the cell.
