---
name: book-explorer
description: Look up where a topic, term, or passage lives in a locally cached book (PDF) — using its own table of contents, glossary, and back-of-book index — without pulling whole chapters or the full book into context. Use whenever the user describes a half-remembered concept and wants to find it, is stuck on a passage and wants to know what to read first, or wants to find where a book covers a topic.
---

# When to use

- The user describes something vaguely and doesn't know the exact term ("there was a part where they said a tree is a connected graph") and wants to find it.
- The user is reading a passage that isn't making sense and wants to know which earlier topics/sections to review first.
- The user wants to find where a book discusses a specific topic, or wants a term defined the way the book's own glossary defines it.
- Before quoting or summarizing part of a book, to find the right page(s) without reading the whole thing.

# Don't use when

- The user wants a chapter read and discussed in full — once you've located the pages, just read them directly (`book page`); there's no indexing benefit for a single deliberate read.
- The book was already indexed this session and you already have the page/section from a recent `search`/`locate`/`which` call.
- The source isn't a PDF with a text layer. Scanned/image-only PDFs and non-PDF formats aren't supported — see Limitations.

# Commands

```
book update <book-id> --pdf <path> [--toc-heading <t>] [--glossary-heading <t>] [--index-heading <t>]
book list <book-id> [toc|glossary|index]
book search <book-id> <keyword>
book define <book-id> <term>
book locate <book-id> <term>
book which <book-id> <page>
book grep <book-id> <keyword> [--context <n>] [--max <n>]
book page <book-id> <n>[-<m>]
```

This is a global skill — run these as `node ~/.claude/skills/book-explorer/book.mjs <command> ...` (or invoke `book.mjs` directly, it's executable) from any directory. A book indexed once is findable from every project, not just the one you were in when you ran `update`.

# Setup (once per book)

```
book update algo-book --pdf ~/Books/introduction-to-algorithms.pdf
```

Requires `pdftotext`/`pdfinfo` (poppler-utils) on PATH — no extra dependencies. This builds one small cache file, `~/.claude/skills/book-explorer/books/<book-id>/cache.json` — a fixed location under your home directory, independent of where you ran `update` from — holding the table of contents, glossary terms+definitions, and back-of-book index terms+page numbers, plus the path to your source PDF. That's it: this skill caches the book's *structure*, never a copy of its text.

`list`/`search`/`define`/`locate`/`which` only ever read that small file. `grep` and `page` go back to the source PDF itself on demand — `page` re-extracts just the pages you asked for (near-instant), `grep` re-extracts the whole book to search it (a few seconds for a several-hundred-page book) and returns only the matching lines, never the full pages. Nothing from either is written back to disk, so the source PDF must stay at the path you passed to `update`, or you'll need to re-run `update` with its new path.

`update` detects the TOC, glossary, and index by finding the book's own section headings ("Contents", "Glossary", "Index") and parsing the printed entries under them — the same pages a human reader would flip to. If a book titles these differently, pass `--toc-heading`/`--glossary-heading`/`--index-heading` with the exact heading text and re-run `update`.

`update` prints a summary of what it found:

```
algo-book: 1312 pages cached
  toc: 87 entries (starts p.9)
  glossary: 143 terms (p.1276)
  index: 2041 terms (p.1289)
```

If glossary or index say "(not found)", that section either doesn't exist in this book or uses an unrecognized heading — retry with an override, or fall back to `grep`/`page` for that material.

# Workflow tips

## "I remember something but not the exact term"

1. `book search <book-id> <guess>` — cheap, checks toc titles / glossary terms / index terms first.
2. If nothing hits, `book grep <book-id> <guess-phrase>` — full-text search, but output is only matching lines with page numbers, not full pages.
3. `book which <book-id> <page>` on the best candidate to see what chapter/section it's in.
4. `book page <book-id> <n>` for the top 1–2 candidates only, to confirm before reporting back.

## "This passage doesn't make sense, what should I read first?"

1. `book which <book-id> <page>` for the page the user is on, to find the current section and its parent.
2. `book list <book-id> toc` to see what precedes it structurally — earlier sections are the likely prerequisites.
3. For specific unfamiliar terms on the page, `book define <book-id> <term>` against the glossary.

## "Where does this book cover X?"

1. `book search <book-id> X` first.
2. `book locate <book-id> X` if X reads like a proper index term — gives every page it's discussed on, each labeled with its chapter.
3. `book grep <book-id> X` as a fallback full-text search if X isn't in the index verbatim.

Each of these calls costs tens to a couple hundred tokens. `book page` and `book grep` are the only two that pull real book content (by re-reading the source PDF, not a cached copy) — `page` is capped at 20 pages per call on purpose, so use it deliberately on pages you've already located; `grep` re-reads the whole book each time (a few seconds), so lean on `search`/`locate` first and use `grep` as the fallback.

# Examples

```
book search algo-book "connected graph"
# => toc: Graphs (p.589)
#    index: connected graph (pp.591,604,712)

book locate algo-book "connected graph"
# => connected graph:
#      p.591 (PDF p.615) — Graphs
#      p.604 (PDF p.628) — Depth-First Search
#      p.712 (PDF p.736) — Minimum Spanning Trees

book which algo-book 604
# => p.604 is in: Depth-First Search (starts p.598, PDF p.622)
#      under: Graphs (starts p.589, PDF p.613)

book define algo-book "spanning tree"
# => spanning tree: A subgraph that is a tree containing all the vertices of the graph. (glossary p.1301)
#    Discussed in main text at pp.591,712 — see 'book locate algo-book spanning tree'.

book grep algo-book "connected graph" --max 5
# => p.591 (PDF p.615) [Graphs]: A graph is connected if there is a path between every pair of vertices...
```

`book which`/`locate`/`grep`/`page` all show both numbers: the page number printed in the book (what the toc/index cite) and, in parentheses, the PDF's own page number (what your PDF viewer's page counter shows) — jump straight there with the latter. `update` detects the constant offset between the two (front matter before printed "page 1" pushes them apart) and stores it per book; override with `--page-offset <n>` if detection ever guesses wrong.

# Limitations

- TOC/glossary/index detection is heuristic — it parses the book's own printed section pages via regex, so unusual layouts can be missed or parsed imperfectly. If a lookup comes up empty or looks wrong, use `book page <book-id> <n>` to read the raw section directly, and consider a `--*-heading` override on `update`.
- Two-column back-of-book index pages and page ranges (e.g. "45–47") parse best-effort; a range may only capture its endpoints.
- Scanned/image-only PDFs have no text layer — `update` will warn if most pages come back empty. OCR the file first; this skill doesn't do OCR.
- Non-PDF formats (EPUB, plain text, etc.) aren't handled yet.
- `book page`/`book grep` need the source PDF to still exist at the path passed to `update`. If it's moved, re-run `update <book-id> --pdf <new path>`.

# Rebuilding the index

Re-run `update <book-id> --pdf <path>` if you swap in a different edition/printing of the same book (page numbers can shift), or if the first `update` reported missing/empty toc/glossary/index and you're retrying with a heading override.

Cached books live at `~/.claude/skills/book-explorer/books/<book-id>/`, shared across every project. If this skill is installed as a symlink from a repo checkout (as it is in `wodoame/skills`), that path resolves into the repo's own `.claude/skills/book-explorer/books/`, which isn't tracked in git — see `.claude/skills/book-explorer/.gitignore`.
