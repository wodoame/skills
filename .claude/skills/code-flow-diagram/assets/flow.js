// Shared renderer for the .local flow diagrams. Each page calls renderFlow() with its own nodes and edges.

const THEME_KEY = 'flow-diagrams-theme';
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function currentTheme() {
  return document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
}

// FLOW_PAGES comes from flow-pages.js: [{ file: 'x.html', title: 'X' }, ...], one entry per diagram in this folder.
(function initNav() {
  const nav = document.querySelector('nav.flows');
  if (!nav || !Array.isArray(window.FLOW_PAGES)) return;
  const current = decodeURIComponent(location.pathname.split('/').pop());
  for (const page of window.FLOW_PAGES) {
    const a = document.createElement('a');
    a.href = page.file;
    a.textContent = page.title;
    if (page.file === current) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
})();

(function initThemeToggle() {
  const nav = document.querySelector('nav.flows');
  if (!nav) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  const updateLabel = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    button.textContent = next === 'dark' ? 'Dark mode' : 'Light mode';
    button.setAttribute('aria-label', `Switch to ${next} mode`);
  };
  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    updateLabel();
  });
  systemDark.addEventListener('change', updateLabel);
  updateLabel();
  nav.appendChild(button);
})();
const KIND_LABEL = {
  main: 'Processing step', topic: 'Source', dec: 'Decision', drop: 'Stops here',
  fail: 'Error', retry: 'Deferred / retry', ok: 'Delivery', note: 'Note',
};

function renderFlow({ width, height, ariaLabel, nodes, edges, lanes = [], labels = [], intro, kindLabels = {} }) {
  const kindLabel = { ...KIND_LABEL, ...kindLabels };
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('flow');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-label', ariaLabel);
  const el = (name, attrs = {}, parent = svg) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  };

  const defs = el('defs');
  for (const k of ['flow', 'drop', 'fail', 'async']) {
    const m = el('marker', { id: `arrow-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', class: `mk-${k}` }, m);
  }

  for (const l of lanes) {
    el('rect', { x: l.x, y: l.y, width: l.w, height: l.h, rx: 12, fill: l.fail ? 'var(--lane-fail)' : 'var(--lane)' });
  }
  for (const l of labels) {
    el('text', { x: l.x, y: l.y, class: 'lane-label' }).textContent = l.text;
  }
  for (const e of edges) {
    el('polyline', { points: e.p.map(pt => pt.join(',')).join(' '), class: `edge e-${e.k}`, 'marker-end': `url(#arrow-${e.k})` });
  }
  for (const e of edges) {
    if (!e.l) continue;
    el('text', { x: e.lp[0], y: e.lp[1], class: 'elabel', 'text-anchor': e.la || 'start' }).textContent = e.l;
  }

  const panel = document.getElementById('panel');
  let selected = null;
  const showIntro = () => { panel.innerHTML = intro; };

  function select(node, g) {
    if (selected) selected.classList.remove('selected');
    selected = g;
    g.classList.add('selected');
    const d = node.detail;
    panel.innerHTML = `
      <h2>${node.title}</h2>
      <div class="kind">${kindLabel[node.kind]}</div>
      ${d.body.map(b => /^<(ul|pre)/.test(b) ? b : `<p>${b}</p>`).join('')}
      ${d.where?.length ? `<div class="where">Where in the code${d.where.map(w => `<code>${w}</code>`).join('')}</div>` : ''}`;
  }

  for (const n of nodes) {
    const g = el('g', { class: `node k-${n.kind}`, tabindex: 0, role: 'button', 'aria-label': n.title });
    el('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: n.kind === 'dec' ? 18 : 8 }, g);
    const subClass = n.mono ? 'm' : 's';
    const lines = [{ t: n.title, c: 't', lh: 17 }, ...n.sub.map(s => ({ t: s, c: subClass, lh: 15 }))];
    const total = lines.reduce((a, l) => a + l.lh, 0);
    const left = n.align === 'left';
    let y = n.y + (n.h - total) / 2;
    for (const l of lines) {
      y += l.lh;
      el('text', { x: left ? n.x + 14 : n.x + n.w / 2, y: y - 4, class: l.c, 'text-anchor': left ? 'start' : 'middle' }, g).textContent = l.t;
    }
    g.addEventListener('click', () => select(n, g));
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n, g); } });
  }

  showIntro();
}
