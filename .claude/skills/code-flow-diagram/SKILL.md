---
name: code-flow-diagram
description: Build a local, clickable flow diagram (HTML + SVG) of how a code path works in the current repo — each box is a step, decision, early exit or failure path, and clicking it shows what it does plus the file:line it comes from. Use when the user asks to visualize, diagram or map how part of a codebase works (a request path, a message consumer, a job, a state machine), or wants help understanding a flow that spans several files and branches. Pages live in the repo's `.local/` folder, git-ignored through `.git/info/exclude`, never committed.
---

# When to use

- The user asks to visualize, diagram or map how something in the codebase works ("make a visualization of how notifications are processed").
- The user is trying to understand a flow that spans several files or has many branches, early exits or failure paths, and a text explanation would make them hold too much in their head.
- The user asks for another diagram "like the last one" — add a page to the existing `.local/` set.

# Don't use when

- The question is about one function or one file. Just explain it.
- The user wants an architecture or infrastructure diagram (services, networks, AWS). Use `architecture-diagram-creator` or `aws-diagram-creator`.
- The user wants the diagram committed or shared with the team. This skill makes personal, untracked pages; ask before doing anything else with them.

# Workflow

1. **Read the code end to end before drawing anything.** Follow the path from its entry point through every branch: where it can stop early, what happens when something throws, what runs later (crons, retries, replays), and where it ends. Note the `file:line` of each step. Never draw from memory or from earlier answers in the conversation — re-read, because a diagram is trusted more than prose. Grep for every env var, preference field or flag that gates a step; opt-in switches are easy to miss.

2. **Set up the folder** (skip what already exists):
   ```bash
   mkdir -p .local
   grep -qxF '.local/' .git/info/exclude || echo '.local/' >> .git/info/exclude
   git check-ignore -q .local/x.html && echo ignored
   ```
   Copy `assets/flow.css`, `assets/flow.js` and `assets/flow-pages.js` from this skill's directory into `.local/` only if they aren't there yet. If they are, keep the repo's copies — they may have been edited, and existing pages depend on them.

3. **Plan the layout on paper first**, using the conventions below. Decide the columns, then give every box an `x, y, w, h` and every arrow its points. Keep 30 px vertical gaps between boxes and line arrows up with box centers or edges.

4. **Write the page.** Copy `assets/template.html` to `.local/<kebab-name>.html` and fill it in: title, heading, intro sentence, the legend entries you use, `NODES`, `EDGES`, lanes/labels, the intro panel, and the footer (`git rev-parse --abbrev-ref HEAD`, `git rev-parse --short HEAD`, today's date). Add the page to `.local/flow-pages.js`.

5. **Verify every claim you're about to show.** For each box's detail text and each "things worth knowing" bullet, point to the code that proves it. Check line numbers with `grep -n`. If something contradicts what you told the user earlier in the session, fix the diagram and say so plainly in your report.

6. **Render and look at it:**
   ```bash
   bash <skill-dir>/scripts/screenshot.sh .local/<page>.html <scratchpad-dir> <height> [node-id]
   ```
   Then Read the light and dark PNGs and the clicked one. Fix overlapping labels, text running past a box edge, arrows through boxes, and lane titles hidden under boxes. Re-render until clean. Delete the screenshots afterwards; they belong in the scratchpad, never in `.local/`.

7. **Report**: the file path (and that it's git-ignored), what the diagram covers in a sentence or two, and the two to four most surprising things it surfaced — especially anything that changes an earlier answer.

# Layout conventions

The canvas is usually `1120` wide; height is whatever the content needs.

- **Middle column, the main path** (`x: 260, w: 320`, center `420`): the happy path, top to bottom.
- **Left column, early stops** (`x: 20, w: 200`): where the flow ends early (skipped, dropped, ignored). Short arrows pointing left from the step that decides it. Label the column `Stops early`.
- **Right column, failure handling or deferred work** (`x: 660`, width up to `440`): retries, dead letters, held items, crons. Shade it with a lane (`fail: true` for error handling) and give it a title that isn't covered by its first box.
- **Bottom row, fan-out**: where the flow ends up (channels, responses, consumers).
- **Two parallel entry paths** (e.g. HTTP and WebSocket): two columns at the top (`x: 40` and `x: 700`, `w: 380`) merging into a shared middle box.
- Decisions split sideways with `yes`/`no` labels; side-by-side alternatives (e.g. merge vs create) can share a row as two narrower boxes.
- Arrows: `flow` for the normal path, `drop` (gray dashed) into early stops, `fail` (red dashed) for thrown errors, `async` (purple dotted) for anything later, scheduled, re-entering or read from stored data.

## Box kinds

| kind | use for |
|---|---|
| `topic` | entry points and event sources |
| `main` | processing steps |
| `dec` | decisions and checks (rounded) |
| `drop` | the flow stops here |
| `retry` | retried, held, or deferred work |
| `fail` | errors, rejections, dead letters |
| `ok` | delivery, responses, results |
| `note` | context worth seeing that isn't a step (config shape, a limitation) |

# Writing the boxes

- **Title**: the function or the step in a few words (`handleMessage()`, `Muted?`, `Deliver`). Decisions end with a question mark.
- **Sub lines**: one to four short lines. Approximate limits at 11.75 px: about 29 characters for a 200 px box, 38 for 260, 48 for 320, 66 for 440. Check the screenshot; wrap or shorten anything that touches an edge.
- **Detail panel**: what the step does, then the non-obvious parts (gates, defaults, what's *not* retried, what happens on bad input). Plain prose; `<ul>` for lists; `<pre>` only for short examples, since wide ones get cut off. Use `<code>` for identifiers and `<b>` for the one fact a reader must not miss.
- **Where**: `path:line  symbol()` for each relevant location, relative to the repo root.
- **Intro panel**: one or two sentences on the whole flow, then two to four "things worth knowing" — the facts a newcomer would most likely get wrong.
- Write for someone new to the codebase: no session shorthand, and explain internal terms the first time they appear.

# Notes on the bundled files

- `assets/flow.js` draws the SVG from `NODES` and `EDGES`, wires up the click-for-details panel, builds the page links from `FLOW_PAGES`, and adds a light/dark toggle (saved in `localStorage`, falling back to the system setting).
- `assets/flow.css` holds the palette for both themes. Colors are CSS variables; don't hard-code colors in pages.
- `scripts/screenshot.sh` finds a Chromium (Playwright's cache, `chromium`, or `google-chrome`; override with `CHROME=`), runs each capture with a 30-second timeout, and for a click test writes a temporary copy next to the page so its relative links resolve, then removes it. Don't pass `--user-data-dir` to headless Chrome here: it can hang.
