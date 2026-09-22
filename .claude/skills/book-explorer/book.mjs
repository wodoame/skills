#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// This is a global skill: a book you index from one project should still be
// found from any other. So, unlike the per-repo graphql-schema skill, the
// cache is anchored on a fixed location under the user's home directory
// rather than on process.cwd() — invoking `book <cmd>` from any directory
// reaches the same cached books.
const BOOKS_DIR = path.join(os.homedir(), '.claude', 'skills', 'book-explorer', 'books');

const TOC_HEADINGS = [/^(table of )?contents$/i];
const GLOSSARY_HEADINGS = [/^glossary$/i, /^glossary of terms$/i, /^key terms$/i];
const INDEX_HEADINGS = [/^index$/i, /^subject index$/i];
const STOP_HEADINGS = [
  /^index$/i,
  /^subject index$/i,
  /^bibliography$/i,
  /^references$/i,
  /^notes$/i,
  /^appendix/i,
  /^acknowledg(e)?ments$/i,
  /^about the author$/i,
  /^colophon$/i,
];

function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function assertBookId(id) {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    die(`Invalid book id '${id}'. Use letters, numbers, - and _ only.`);
  }
}

function bookDir(id) {
  return path.join(BOOKS_DIR, id);
}

function cachePath(id) {
  return path.join(bookDir(id), 'cache.json');
}

// Load the structural cache (meta + toc + glossary + index). This is the
// only thing persisted for a book — never the book's own text. Commands that
// need real page content (grep/page) re-read it from the source PDF named in
// meta.sourcePath, on demand, each time.
function loadCache(id) {
  const p = cachePath(id);
  if (!fs.existsSync(p)) {
    die(`No cached book '${id}'. Run: book update ${id} --pdf <path>`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Resolve a cached book's source PDF, dying with a clear fix if it moved.
function sourcePdfFor(cache) {
  const p = cache.meta.sourcePath;
  if (!fs.existsSync(p)) {
    die(
      `Source PDF for '${cache.meta.bookId}' is no longer at ${p}. Re-run: book update ${cache.meta.bookId} --pdf <new path>`
    );
  }
  return p;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function suggest(name, candidates, n = 5) {
  const lower = name.toLowerCase();
  return candidates
    .map((c) => ({ c, d: levenshtein(lower, c.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.c);
}

// ---------- PDF extraction ----------

function getPageCount(pdfPath) {
  let out;
  try {
    out = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    throw new Error(
      `pdfinfo failed on ${pdfPath}: ${e.message}. Requires poppler-utils (pdfinfo/pdftotext) on PATH.`
    );
  }
  const m = out.match(/^Pages:\s+(\d+)/m);
  return m ? Number(m[1]) : null;
}

// Extract per-page text with layout preserved (keeps TOC dot-leaders and
// glossary/index columns roughly intact). Returns a 1-indexed-friendly array
// where pages[0] is page 1.
function extractPages(pdfPath) {
  let out;
  try {
    out = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      // Poppler dumps content-stream warnings ("insufficient arguments for
      // Marked Content" etc.) to stderr on many real-world PDFs; they're
      // noise, not extraction failures, so don't let them flood the caller.
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    throw new Error(
      `pdftotext failed on ${pdfPath}: ${e.message}. Requires poppler-utils (pdfinfo/pdftotext) on PATH.`
    );
  }
  const pages = out.split('\f');
  // pdftotext emits a trailing form feed after the last page; drop the
  // resulting empty tail element if present.
  if (pages.length && pages[pages.length - 1].trim() === '') pages.pop();
  return pages;
}

// Extract just a 1-based PDF page range (poppler's -f/-l), for commands that
// only need a couple of specific pages — this is what keeps `book page` from
// having to read the whole book to return two pages of it.
function extractPageRange(pdfPath, fromPdfPage, toPdfPage) {
  let out;
  try {
    out = execFileSync(
      'pdftotext',
      ['-layout', '-f', String(fromPdfPage), '-l', String(toPdfPage), pdfPath, '-'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (e) {
    throw new Error(`pdftotext failed on ${pdfPath}: ${e.message}`);
  }
  const pages = out.split('\f');
  if (pages.length && pages[pages.length - 1].trim() === '') pages.pop();
  return pages;
}

function lineMatchesAny(line, patterns) {
  return patterns.some((re) => re.test(line));
}

// Books almost never number their PDF pages 1:1 with printed page numbers —
// a title page, copyright page, and roman-numeral front matter all push the
// printed "page 1" several PDF pages in. The table of contents and the
// back-of-book index both cite *printed* page numbers, so every other
// command needs to translate between the two. Detect the constant offset
// (pdfPage1based - printedPage) by reading running headers/footers: most
// printed books put the page number as the first or last token of the
// topmost or bottommost line of each page.
function detectPageOffset(pages) {
  const votes = new Map();
  for (let i = 0; i < pages.length; i++) {
    const lines = pages[i]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const candidates = new Set();
    for (const line of [lines[0], lines[lines.length - 1]]) {
      const toks = line.split(/\s+/);
      const first = toks[0];
      const last = toks[toks.length - 1];
      if (/^\d{1,4}$/.test(first)) candidates.add(Number(first));
      if (/^\d{1,4}$/.test(last)) candidates.add(Number(last));
    }
    for (const num of candidates) {
      const off = i + 1 - num;
      votes.set(off, (votes.get(off) || 0) + 1);
    }
  }
  let bestOffset = 0;
  let bestCount = 0;
  for (const [off, count] of votes) {
    if (count > bestCount) {
      bestCount = count;
      bestOffset = off;
    }
  }
  const confidence = pages.length > 0 ? bestCount / pages.length : 0;
  return { offset: bestOffset, confidence };
}

// Find the first page (0-indexed) containing a line that, once trimmed,
// matches one of the given heading patterns exactly (not just "contains").
// Bare-heading-line matching is what keeps this from false-positive-matching
// TOC rows like "Glossary .......... 312", which always carry a page number.
function findHeadingPage(pages, patterns, fromIdx = 0, toIdx = pages.length - 1) {
  for (let i = fromIdx; i <= toIdx; i++) {
    const lines = pages[i].split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (line && lineMatchesAny(line, patterns)) return i;
    }
  }
  return -1;
}

// Many typeset books space out their dot leaders ("Graphs . . . . . . 10")
// rather than running the dots together, so the leader is "dot, optional
// single space" repeated, not a plain run of dots.
const TOC_DOTLEADER_RE = /^(\s*)(.+?)\s*(?:\.[ \t]?){3,}\s*(\d{1,4})\s*$/;
const TOC_GAP_RE = /^(\s*)(.+?)\s{3,}(\d{1,4})\s*$/;

// Walk forward from the detected "Contents" page, collecting entries that
// look like "<title> .... <page>" or "<title>   <page>". Stops once a page
// yields no matches (after at least one page matched), so we don't wander
// into the first chapter's body text.
function parseToc(pages, startIdx, headingPatterns) {
  const entries = [];
  const maxScan = Math.min(pages.length - 1, startIdx + 12);
  for (let i = startIdx; i <= maxScan; i++) {
    const lines = pages[i].split('\n');
    let matchedOnThisPage = 0;
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      const trimmed = line.trim();
      if (!trimmed || lineMatchesAny(trimmed, headingPatterns)) continue;
      const m = TOC_DOTLEADER_RE.exec(line) || TOC_GAP_RE.exec(line);
      if (!m) continue;
      const [, indent, title, pageStr] = m;
      const cleanTitle = title.trim();
      if (cleanTitle.length < 2 || cleanTitle.length > 120) continue;
      const pageNum = Number(pageStr);
      const indentWidth = indent.replace(/\t/g, '    ').length;
      entries.push({ title: cleanTitle, page: pageNum, indentWidth });
      matchedOnThisPage++;
    }
    if (matchedOnThisPage === 0 && entries.length > 0) break;
  }
  // Nesting level is relative to this book's own indent widths, not an
  // absolute character count — books vary widely in how far they indent.
  const widths = [...new Set(entries.map((e) => e.indentWidth))].sort((a, b) => a - b);
  for (const e of entries) {
    e.level = widths.indexOf(e.indentWidth);
    delete e.indentWidth;
  }
  return entries;
}

// Collect the page range for a back-matter section (glossary/index): from the
// detected heading page up to (but not including) the next STOP_HEADINGS hit,
// capped so a mis-detection can't vacuum in the rest of the book.
function sectionRange(pages, startIdx, cap) {
  const maxIdx = Math.min(pages.length - 1, startIdx + cap);
  let endIdx = maxIdx;
  for (let i = startIdx + 1; i <= maxIdx; i++) {
    const lines = pages[i].split('\n');
    if (lines.some((l) => lineMatchesAny(l.trim(), STOP_HEADINGS))) {
      endIdx = i - 1;
      break;
    }
  }
  return endIdx;
}

const GLOSSARY_GAP_RE = /^([A-Z][A-Za-z0-9()'/\- ]{1,60}?)\s{2,}(\S.*)$/;
const GLOSSARY_COLON_RE = /^([A-Z][A-Za-z0-9()'/\- ]{1,60}?)\s*[:—]\s*(\S.*)$/;

function parseGlossary(pages, startIdx, endIdx, headingPatterns) {
  const entries = new Map(); // term(lower) -> {term, definition, page}
  let current = null;
  for (let i = startIdx; i <= endIdx; i++) {
    for (const raw of pages[i].split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (lineMatchesAny(line, headingPatterns) || /^\d+$/.test(line)) continue; // heading/page-number running lines
      const m = GLOSSARY_GAP_RE.exec(line) || GLOSSARY_COLON_RE.exec(line);
      if (m) {
        current = { term: m[1].trim(), definition: m[2].trim(), page: i + 1 };
        entries.set(current.term.toLowerCase(), current);
      } else if (current) {
        current.definition += ' ' + line;
      }
    }
  }
  return [...entries.values()];
}

function parseIndex(pages, startIdx, endIdx, headingPatterns) {
  const byTerm = new Map(); // term(lower) -> {term, pages:Set}
  for (let i = startIdx; i <= endIdx; i++) {
    for (const raw of pages[i].split('\n')) {
      const trimmed = raw.trim();
      if (!trimmed || lineMatchesAny(trimmed, headingPatterns)) continue;
      // Back-of-book indexes are almost always typeset in two (or more)
      // columns; pdftotext -layout reconstructs each PDF line as one text
      // line with a wide gap between columns, so without splitting on that
      // gap a right-column entry's page number gets misread as belonging to
      // the left-column term on the same line.
      for (const chunk of trimmed.split(/ {5,}/)) {
        const line = chunk.trim();
        if (!line) continue;
        const nums = line.match(/\d+/g);
        if (!nums) continue; // cross-reference lines ("see also X") carry no page numbers
        const firstDigitAt = line.search(/\d/);
        const term = line
          .slice(0, firstDigitAt)
          .replace(/[,\s]+$/, '')
          .trim();
        if (term.length < 2 || !/[A-Za-z]/.test(term)) continue;
        const key = term.toLowerCase();
        if (!byTerm.has(key)) byTerm.set(key, { term, pages: new Set() });
        const entry = byTerm.get(key);
        for (const n of nums) entry.pages.add(Number(n));
      }
    }
  }
  return [...byTerm.values()].map((e) => ({
    term: e.term,
    pages: [...e.pages].sort((a, b) => a - b),
  }));
}

function headingPatternsFor(defaults, override) {
  return override ? [new RegExp(`^${escapeRe(override)}$`, 'i')] : defaults;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- update ----------

function cmdUpdate(args) {
  let pdf = null;
  let tocHeading = null;
  let glossaryHeading = null;
  let indexHeading = null;
  let pageOffsetOverride = null;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pdf') pdf = args[++i];
    else if (args[i] === '--toc-heading') tocHeading = args[++i];
    else if (args[i] === '--glossary-heading') glossaryHeading = args[++i];
    else if (args[i] === '--index-heading') indexHeading = args[++i];
    else if (args[i] === '--page-offset') pageOffsetOverride = Number(args[++i]);
    else rest.push(args[i]);
  }
  const [bookId] = rest;
  if (!bookId || !pdf) {
    die(
      'Usage: update <book-id> --pdf <path> [--toc-heading <text>] [--glossary-heading <text>] [--index-heading <text>] [--page-offset <n>]'
    );
  }
  assertBookId(bookId);
  const resolvedPdf = path.resolve(pdf);
  if (!fs.existsSync(resolvedPdf)) die(`File not found: ${resolvedPdf}`);

  const pageCount = getPageCount(resolvedPdf);
  const pages = extractPages(resolvedPdf);

  const nonEmpty = pages.filter((p) => p.trim().length > 0).length;
  const warnings = [];
  if (pages.length > 0 && nonEmpty / pages.length < 0.5) {
    warnings.push(
      'Fewer than half the pages have extractable text — this may be a scanned/image-only PDF. OCR it first; this skill only reads existing text layers.'
    );
  }

  let pageOffset = 0;
  if (pageOffsetOverride !== null) {
    pageOffset = pageOffsetOverride;
  } else {
    const detected = detectPageOffset(pages);
    if (detected.confidence >= 0.3) {
      pageOffset = detected.offset;
    } else {
      warnings.push(
        `Could not reliably detect the printed-vs-PDF page offset (best guess only matched ${Math.round(detected.confidence * 100)}% of pages) — assuming 0. If 'book page'/'book grep' land on the wrong content relative to 'book locate'/'book search', pass --page-offset <n> (PDF page = printed page + n).`
      );
    }
  }

  const tocPatterns = headingPatternsFor(TOC_HEADINGS, tocHeading);
  const tocStart = findHeadingPage(pages, tocPatterns, 0, Math.min(pages.length - 1, 49));
  let toc = [];
  if (tocStart === -1) {
    warnings.push(
      `No "Contents" page found in the first 50 pages. Pass --toc-heading if this book titles it differently.`
    );
  } else {
    toc = parseToc(pages, tocStart, tocPatterns);
    if (toc.length === 0) {
      warnings.push('Found a Contents heading but could not parse any entries from it.');
    }
  }

  const glossaryPatterns = headingPatternsFor(GLOSSARY_HEADINGS, glossaryHeading);
  const glossaryStart = findHeadingPage(pages, glossaryPatterns, Math.floor(pages.length * 0.3));
  let glossary = [];
  if (glossaryStart !== -1) {
    const glossaryEnd = sectionRange(pages, glossaryStart, 30);
    glossary = parseGlossary(pages, glossaryStart, glossaryEnd, glossaryPatterns).map((e) => ({
      ...e,
      page: e.page - pageOffset, // parseGlossary records raw PDF-array page numbers
    }));
  }

  const indexPatterns = headingPatternsFor(INDEX_HEADINGS, indexHeading);
  const indexSearchFrom =
    glossaryStart !== -1 ? glossaryStart + 1 : Math.floor(pages.length * 0.5);
  const indexStart = findHeadingPage(pages, indexPatterns, indexSearchFrom);
  let index = [];
  if (indexStart !== -1) {
    const indexEnd = sectionRange(pages, indexStart, 60);
    index = parseIndex(pages, indexStart, indexEnd, indexPatterns);
  }

  fs.mkdirSync(bookDir(bookId), { recursive: true });
  const cache = {
    meta: {
      bookId,
      sourcePath: resolvedPdf,
      pages: pages.length,
      pdfinfoPages: pageCount,
      pageOffset,
      builtAt: new Date().toISOString(),
    },
    toc,
    glossary: glossary.map(({ term, definition, page }) => ({ term, definition, page })),
    index,
  };
  fs.writeFileSync(cachePath(bookId), JSON.stringify(cache, null, 2));

  // Heading locations in the front matter (title/copyright/roman-numeral
  // pages) can land at or before printed "page 1", where the arabic-page
  // offset isn't meaningful — show those as front matter rather than a
  // confusing zero/negative page number.
  const printedLabel = (arrayIdx) => {
    const printed = arrayIdx + 1 - pageOffset;
    return printed > 0 ? `printed p.${printed}` : 'front matter';
  };
  const lines = [
    `${bookId}: ${pages.length} pages cached (page offset ${pageOffset}: printed p.N = PDF page N+${pageOffset})`,
    `  toc: ${toc.length} entries${tocStart === -1 ? '' : ` (starts ${printedLabel(tocStart)})`}`,
    `  glossary: ${glossary.length} terms${glossaryStart === -1 ? ' (not found)' : ` (${printedLabel(glossaryStart)})`}`,
    `  index: ${index.length} terms${indexStart === -1 ? ' (not found)' : ` (${printedLabel(indexStart)})`}`,
  ];
  for (const w of warnings) lines.push(`  ! ${w}`);
  process.stdout.write(lines.join('\n') + '\n');
}

// ---------- list ----------

function cmdList(args) {
  const [bookId, kind] = args;
  if (!bookId) die('Usage: list <book-id> [toc|glossary|index]');
  const cache = loadCache(bookId);
  const out = [];
  const showToc = () => {
    for (const e of cache.toc) {
      out.push(`${'  '.repeat(e.level)}${e.title} — p.${e.page}`);
    }
  };
  const showGlossary = () => {
    for (const e of cache.glossary) out.push(`${e.term} — p.${e.page}`);
  };
  const showIndex = () => {
    for (const e of cache.index) out.push(`${e.term} — pp.${e.pages.join(',')}`);
  };
  if (kind === 'toc') showToc();
  else if (kind === 'glossary') showGlossary();
  else if (kind === 'index') showIndex();
  else if (kind) {
    die(`Unknown kind '${kind}'. Use toc, glossary, or index.`);
  } else {
    out.push(`# toc (${cache.toc.length} entries)`);
    showToc();
    out.push(`# ${cache.glossary.length} glossary terms — 'list ${bookId} glossary' to see them`);
    out.push(`# ${cache.index.length} index terms — 'list ${bookId} index' to see them`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

// ---------- search ----------

function cmdSearch(args) {
  const [bookId, keyword] = args;
  if (!bookId || !keyword) die('Usage: search <book-id> <keyword>');
  const cache = loadCache(bookId);
  const k = keyword.toLowerCase();
  const out = [];
  for (const e of cache.toc) {
    if (e.title.toLowerCase().includes(k)) out.push(`toc: ${e.title} (p.${e.page})`);
  }
  for (const e of cache.glossary) {
    if (e.term.toLowerCase().includes(k)) {
      out.push(`glossary: ${e.term} — ${truncate(e.definition, 80)} (glossary p.${e.page})`);
    }
  }
  for (const e of cache.index) {
    if (e.term.toLowerCase().includes(k)) {
      out.push(`index: ${e.term} (pp.${e.pages.slice(0, 6).join(',')}${e.pages.length > 6 ? ',…' : ''})`);
    }
  }
  if (out.length === 0) {
    die(
      `No matches for '${keyword}' in toc/glossary/index of ${bookId}. Try 'book grep ${bookId} ${keyword}' for a full-text search.`
    );
  }
  const cap = 30;
  process.stdout.write(out.slice(0, cap).join('\n') + '\n');
  if (out.length > cap) {
    process.stdout.write(`… ${out.length - cap} more matches; narrow your keyword.\n`);
  }
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------- define ----------

function cmdDefine(args) {
  const [bookId, ...termParts] = args;
  const term = termParts.join(' ');
  if (!bookId || !term) die('Usage: define <book-id> <term>');
  const cache = loadCache(bookId);
  if (cache.glossary.length === 0) {
    die(`${bookId} has no cached glossary. Try 'book grep ${bookId} ${term}' or 'book locate ${bookId} ${term}' instead.`);
  }
  const lower = term.toLowerCase();
  let hit = cache.glossary.find((e) => e.term.toLowerCase() === lower);
  if (!hit) {
    const s = suggest(term, cache.glossary.map((e) => e.term), 5);
    die(`No glossary entry for '${term}' in ${bookId}. Did you mean: ${s.join(', ')}?`);
  }
  process.stdout.write(`${hit.term}: ${hit.definition} (glossary p.${hit.page})\n`);
  const inIndex = cache.index.find((e) => e.term.toLowerCase() === lower);
  if (inIndex) {
    process.stdout.write(
      `Discussed in main text at pp.${inIndex.pages.slice(0, 8).join(',')}${inIndex.pages.length > 8 ? ',…' : ''} — see 'book locate ${bookId} ${term}'.\n`
    );
  }
}

// ---------- locate ----------

function pageToTocEntry(toc, pageNum) {
  let best = null;
  for (const e of toc) {
    if (e.page <= pageNum && (!best || e.page > best.page)) best = e;
  }
  return best;
}

// toc/glossary/index page numbers are all printed-page numbers (read straight
// off the book's own pages); the pages[] array is indexed by raw PDF page
// order. These convert between the two using the offset `update` detected.
function printedToArrayIndex(cache, printed) {
  return printed + cache.meta.pageOffset - 1;
}

function arrayIndexToPrinted(cache, idx) {
  return idx + 1 - cache.meta.pageOffset;
}

// Front matter (title/copyright/roman-numeral pages) sits before printed
// "page 1", where the arabic-page offset produces zero/negative numbers —
// label those as front matter instead of a confusing "p.-16".
function pageRefLabel(printed, pdfPage) {
  return printed > 0 ? `p.${printed} (PDF p.${pdfPage})` : `front matter (PDF p.${pdfPage})`;
}

// The 1-based page number as a PDF viewer would show it (its own "page N",
// not the number printed on the page) — handy for jumping straight there.
function pdfPageOf(cache, printed) {
  return printedToArrayIndex(cache, printed) + 1;
}

function cmdLocate(args) {
  const [bookId, ...termParts] = args;
  const term = termParts.join(' ');
  if (!bookId || !term) die('Usage: locate <book-id> <term>');
  const cache = loadCache(bookId);
  if (cache.index.length === 0) {
    die(`${bookId} has no cached back-of-book index. Try 'book grep ${bookId} ${term}' instead.`);
  }
  const lower = term.toLowerCase();
  let hit = cache.index.find((e) => e.term.toLowerCase() === lower);
  if (!hit) {
    const s = suggest(term, cache.index.map((e) => e.term), 5);
    die(`No index entry for '${term}' in ${bookId}. Did you mean: ${s.join(', ')}?`);
  }
  const out = [`${hit.term}:`];
  for (const p of hit.pages) {
    const chapter = pageToTocEntry(cache.toc, p);
    out.push(`  p.${p} (PDF p.${pdfPageOf(cache, p)})${chapter ? ` — ${chapter.title}` : ''}`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

// ---------- which ----------

function cmdWhich(args) {
  const [bookId, pageStr] = args;
  if (!bookId || !pageStr) die('Usage: which <book-id> <page>');
  const pageNum = Number(pageStr);
  if (!Number.isInteger(pageNum)) die('Page must be an integer.');
  const cache = loadCache(bookId);
  const entry = pageToTocEntry(cache.toc, pageNum);
  if (!entry) {
    die(`No toc entry at or before p.${pageNum} in ${bookId}.`);
  }
  const out = [
    `p.${pageNum} is in: ${entry.title} (starts p.${entry.page}, PDF p.${pdfPageOf(cache, entry.page)})`,
  ];
  if (entry.level > 0) {
    const parent = [...cache.toc]
      .filter((e) => e.page <= entry.page && e.level < entry.level)
      .sort((a, b) => b.page - a.page)[0];
    if (parent) {
      out.push(`  under: ${parent.title} (starts p.${parent.page}, PDF p.${pdfPageOf(cache, parent.page)})`);
    }
  }
  process.stdout.write(out.join('\n') + '\n');
}

// ---------- grep ----------

function cmdGrep(args) {
  let context = 0;
  let max = 40;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context') context = Number(args[++i]) || 0;
    else if (args[i] === '--max') max = Number(args[++i]) || 40;
    else rest.push(args[i]);
  }
  const [bookId, ...keywordParts] = rest;
  const keyword = keywordParts.join(' ');
  if (!bookId || !keyword) die('Usage: grep <book-id> <keyword> [--context <n>] [--max <n>]');
  const cache = loadCache(bookId);
  // Re-reads the whole book from the source PDF each call rather than
  // keeping a persistent full-text copy on disk — this skill caches the
  // book's own structure (toc/glossary/index), not the book itself.
  const pages = extractPages(sourcePdfFor(cache));
  const k = keyword.toLowerCase();
  const out = [];
  let total = 0;
  outer: for (let pi = 0; pi < pages.length; pi++) {
    const lines = pages[pi].split('\n');
    const printedPage = arrayIndexToPrinted(cache, pi);
    for (let li = 0; li < lines.length; li++) {
      if (!lines[li].toLowerCase().includes(k)) continue;
      total++;
      if (out.length < max) {
        const chapter = pageToTocEntry(cache.toc, printedPage);
        const label = chapter ? ` [${chapter.title}]` : '';
        out.push(`${pageRefLabel(printedPage, pi + 1)}${label}: ${truncate(lines[li].trim(), 160)}`);
        for (let c = 1; c <= context; c++) {
          if (lines[li - c] && lines[li - c].trim()) out.push(`  - ${truncate(lines[li - c].trim(), 160)}`);
          if (lines[li + c] && lines[li + c].trim()) out.push(`  + ${truncate(lines[li + c].trim(), 160)}`);
        }
      } else {
        break outer;
      }
    }
  }
  if (total === 0) die(`No matches for '${keyword}' in ${bookId}.`);
  process.stdout.write(out.join('\n') + '\n');
  if (total > max) {
    process.stdout.write(`… stopped at ${max} matches (of at least ${total}); narrow your keyword.\n`);
  }
}

// ---------- page ----------

function cmdPage(args) {
  const [bookId, rangeStr] = args;
  if (!bookId || !rangeStr) die('Usage: page <book-id> <n>[-<m>]');
  const m = /^(\d+)(?:-(\d+))?$/.exec(rangeStr);
  if (!m) die('Page must be like 42 or 42-45.');
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : start;
  if (end < start) die('End page must be >= start page.');
  if (end - start + 1 > 20) {
    die('Range too large (max 20 pages per call) — narrow it or call page multiple times.');
  }
  const cache = loadCache(bookId);
  const pdfPath = sourcePdfFor(cache);

  const requested = [];
  for (let p = start; p <= end; p++) {
    requested.push({ printed: p, pdfPage: printedToArrayIndex(cache, p) + 1 });
  }
  const inRange = requested.filter((r) => r.pdfPage >= 1 && r.pdfPage <= cache.meta.pages);
  const extracted = new Map();
  if (inRange.length > 0) {
    const fromPdf = Math.min(...inRange.map((r) => r.pdfPage));
    const toPdf = Math.max(...inRange.map((r) => r.pdfPage));
    // One pdftotext call for the whole requested span — only these pages
    // are ever read from the PDF, nothing is cached afterward.
    const slice = extractPageRange(pdfPath, fromPdf, toPdf);
    for (let i = 0; i < slice.length; i++) extracted.set(fromPdf + i, slice[i]);
  }

  const out = [];
  for (const { printed, pdfPage } of requested) {
    if (!extracted.has(pdfPage)) {
      out.push(`--- page ${printed} --- (out of range for this book)`);
      continue;
    }
    out.push(`--- page ${printed} (PDF p.${pdfPage}) ---`);
    out.push(extracted.get(pdfPage));
  }
  process.stdout.write(out.join('\n') + '\n');
}

// ---------- main ----------

function usage() {
  process.stdout.write(
    [
      'Usage:',
      '  book.mjs update <book-id> --pdf <path> [--toc-heading <t>] [--glossary-heading <t>] [--index-heading <t>]',
      '  book.mjs list <book-id> [toc|glossary|index]',
      '  book.mjs search <book-id> <keyword>',
      '  book.mjs define <book-id> <term>',
      '  book.mjs locate <book-id> <term>',
      '  book.mjs which <book-id> <page>',
      '  book.mjs grep <book-id> <keyword> [--context <n>] [--max <n>]',
      '  book.mjs page <book-id> <n>[-<m>]',
      '',
      'Requires poppler-utils (pdftotext, pdfinfo) on PATH.',
    ].join('\n') + '\n'
  );
}

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'update':
      return cmdUpdate(rest);
    case 'list':
      return cmdList(rest);
    case 'search':
      return cmdSearch(rest);
    case 'define':
      return cmdDefine(rest);
    case 'locate':
      return cmdLocate(rest);
    case 'which':
      return cmdWhich(rest);
    case 'grep':
      return cmdGrep(rest);
    case 'page':
      return cmdPage(rest);
    case '-h':
    case '--help':
    case 'help':
    case undefined:
      return usage();
    default:
      die(`Unknown command '${cmd}'. Run with --help.`);
  }
}

try {
  main(process.argv.slice(2));
} catch (e) {
  die(e.message || String(e));
}
