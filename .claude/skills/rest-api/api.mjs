#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Paths anchored on cwd (the repo root), not this file's location — keeps the
// script symlink-safe and each repo's .env + cached specs/ local to it.
const REPO_ROOT = process.cwd();
const SKILL_DIR = path.join(REPO_ROOT, '.claude', 'skills', 'rest-api');
const SPECS_DIR = path.join(SKILL_DIR, 'specs');
const ENV_PATH = path.join(REPO_ROOT, '.env');

const SERVICES = ['incident-management'];
const SERVICE_ENV = {
  'incident-management': 'INCIDENT_MANAGEMENT_SERVICE_BASE_URL',
};
const LOGIN_PATH = '/auth/login';
const API_DOCS_PATH = '/api-docs';

function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function parseEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function assertService(service) {
  if (!SERVICES.includes(service)) {
    die(`Unknown service '${service}'. Valid: ${SERVICES.join(', ')}.`);
  }
}

function loadSpec(service) {
  const p = path.join(SPECS_DIR, `${service}.json`);
  if (!fs.existsSync(p)) {
    die(
      `No spec for '${service}'. Run: node .claude/skills/rest-api/api.mjs update ${service}`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// POST armsToken to /auth/login, return the access_token cookie value.
async function fetchAccessToken(baseUrl, armsToken) {
  let res;
  try {
    res = await fetch(`${baseUrl}${LOGIN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ armsToken }),
    });
  } catch (e) {
    throw new Error(`Network error calling ${baseUrl}${LOGIN_PATH}: ${e.message}`);
  }
  if (!res.ok) {
    throw new Error(`Login failed (HTTP ${res.status}) at ${baseUrl}${LOGIN_PATH}.`);
  }
  // getSetCookie() added in Node 18.14 — fall back to get() which concatenates cookies
  const rawCookies = res.headers.getSetCookie
    ? res.headers.getSetCookie().join(', ')
    : (res.headers.get('set-cookie') || '');
  const match = rawCookies.match(/(?:^|,)\s*access_token=([^;,]+)/);
  if (match) return match[1].trim();
  throw new Error(
    `No access_token cookie in login response from ${baseUrl}${LOGIN_PATH}.`
  );
}

// GET /api-docs with the access_token cookie, return parsed OpenAPI JSON.
async function fetchSpec(baseUrl, accessToken) {
  let res;
  try {
    res = await fetch(`${baseUrl}${API_DOCS_PATH}`, {
      headers: { Cookie: `access_token=${accessToken}` },
    });
  } catch (e) {
    throw new Error(`Network error fetching ${baseUrl}${API_DOCS_PATH}: ${e.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Auth failed (${res.status}) for ${baseUrl}${API_DOCS_PATH}. Token may be stale — refresh via update.`
      );
    }
    throw new Error(`HTTP ${res.status} from ${baseUrl}${API_DOCS_PATH}: ${text.slice(0, 200)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response from ${baseUrl}${API_DOCS_PATH}: ${text.slice(0, 200)}`
    );
  }
  if (!json.paths) throw new Error(`Response missing 'paths' — not a valid OpenAPI spec.`);
  return json;
}

// Resolve '#/components/schemas/Foo' to the actual schema object.
function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  let obj = spec;
  for (const p of ref.slice(2).split('/')) obj = obj?.[p];
  return obj || null;
}

// All endpoints as flat array of { method, path, operationId, summary, tags, op }.
function allEndpoints(spec) {
  const out = [];
  const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
  for (const [p, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      out.push({
        method: method.toUpperCase(),
        path: p,
        operationId: op.operationId || '',
        summary: op.summary || '',
        tags: (op.tags || []).join(', '),
        op,
      });
    }
  }
  return out;
}

// Render a schema as a terse inline string: "{ field: type; ... }" or "TypeName".
function renderSchema(spec, schema, depth = 0) {
  if (!schema) return '?';
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    if (depth > 0) return name;
    const resolved = resolveRef(spec, schema.$ref);
    if (!resolved) return name;
    return `${name} { ${renderFields(spec, resolved, depth + 1)} }`;
  }
  if (schema.type === 'array') return `[${renderSchema(spec, schema.items, depth)}]`;
  if (schema.type === 'object' || schema.properties) {
    return `{ ${renderFields(spec, schema, depth + 1)} }`;
  }
  if (schema.allOf || schema.oneOf || schema.anyOf) {
    const items = schema.allOf || schema.oneOf || schema.anyOf;
    return items.map(s => renderSchema(spec, s, depth)).join(' & ');
  }
  return schema.type || schema.format || '?';
}

function renderFields(spec, schema, depth) {
  if (depth > 2) return '...';
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const parts = Object.entries(props).map(([k, v]) => {
    const t = renderSchema(spec, v, depth);
    return required.has(k) ? `${k}: ${t}` : `${k}?: ${t}`;
  });
  return parts.length ? parts.join('; ') : '...';
}

// Render operation parameters as "name (in, type[, required]); ..."
function renderParams(params) {
  if (!params || params.length === 0) return null;
  return params
    .map(p => {
      const t = p.schema?.type || 'string';
      const req = p.required ? ', required' : '';
      return `${p.name} (${p.in}, ${t}${req})`;
    })
    .join('; ');
}

// Render the request body shape.
function renderBody(spec, requestBody) {
  if (!requestBody) return null;
  const content = requestBody.content || {};
  const mt = content['application/json'] || Object.values(content)[0];
  if (!mt?.schema) return requestBody.required ? '? (required)' : '?';
  const req = requestBody.required ? ' (required)' : '';
  return `${renderSchema(spec, mt.schema)}${req}`;
}

// Render notable responses as "200: Type  404: Type".
function renderResponses(spec, responses) {
  if (!responses) return null;
  const NOTABLE = new Set(['200', '201', '204', '400', '401', '403', '404', '422']);
  return Object.entries(responses)
    .filter(([code]) => NOTABLE.has(code))
    .map(([code, resp]) => {
      const mt = resp.content?.['application/json'];
      const shape = mt?.schema ? renderSchema(spec, mt.schema) : 'void';
      return `${code}: ${shape}`;
    })
    .join('  ') || null;
}

// list command
function cmdList(args) {
  const [service, methodFilter] = args;
  if (!service) die('Usage: api list <service> [GET|POST|PUT|PATCH|DELETE]');
  assertService(service);
  const spec = loadSpec(service);
  const endpoints = allEndpoints(spec);
  const filtered = methodFilter
    ? endpoints.filter(e => e.method === methodFilter.toUpperCase())
    : endpoints;
  if (filtered.length === 0) {
    die(`No endpoints${methodFilter ? ` for ${methodFilter.toUpperCase()}` : ''}.`);
  }
  process.stdout.write(filtered.map(e => `${e.method} ${e.path}`).join('\n') + '\n');
}

// get command
function cmdGet(args) {
  const [service, name] = args;
  if (!service || !name) die('Usage: api get <service> <operationId|/path|SchemaName>');
  assertService(service);
  const spec = loadSpec(service);

  // Schema name (PascalCase or explicit match)
  const schemas = spec.components?.schemas || {};
  if (schemas[name]) {
    process.stdout.write(
      `schema ${name} { ${renderFields(spec, schemas[name], 1)} }\n`
    );
    return;
  }

  // Endpoint by operationId or path (exact, then case-insensitive)
  const endpoints = allEndpoints(spec);
  let hits = endpoints.filter(e => e.operationId === name || e.path === name);
  if (hits.length === 0) {
    const lower = name.toLowerCase();
    hits = endpoints.filter(e => e.operationId.toLowerCase() === lower);
  }
  if (hits.length === 0) {
    const candidates = [
      ...endpoints.map(e => e.operationId).filter(Boolean),
      ...endpoints.map(e => e.path),
      ...Object.keys(schemas),
    ];
    const close = candidates
      .map(c => ({ c, d: levenshtein(name.toLowerCase(), c.toLowerCase()) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(x => x.c);
    die(`Not found: '${name}'. Did you mean: ${close.join(', ')}?`);
  }
  for (const { method, path: p, operationId, summary, tags, op } of hits) {
    const lines = [`${method} ${p}${operationId ? `  [${operationId}]` : ''}`];
    if (tags) lines.push(`  tags: ${tags}`);
    if (summary) lines.push(`  summary: ${summary}`);
    const params = renderParams(op.parameters);
    if (params) lines.push(`  params: ${params}`);
    const body = renderBody(spec, op.requestBody);
    if (body) lines.push(`  body: ${body}`);
    const responses = renderResponses(spec, op.responses);
    if (responses) lines.push(`  responses: ${responses}`);
    process.stdout.write(lines.join('\n') + '\n\n');
  }
}

// search command
function cmdSearch(args) {
  const [service, keyword] = args;
  if (!service || !keyword) die('Usage: api search <service> <keyword>');
  assertService(service);
  const spec = loadSpec(service);
  const k = keyword.toLowerCase();
  const out = [];
  for (const { method, path: p, operationId, summary, tags } of allEndpoints(spec)) {
    if ([p, operationId, summary, tags].some(s => s.toLowerCase().includes(k))) {
      const id = operationId ? `  [${operationId}]` : '';
      const desc = summary ? ` — ${summary}` : '';
      out.push(`${method} ${p}${id}${desc}`);
    }
  }
  for (const name of Object.keys(spec.components?.schemas || {})) {
    if (name.toLowerCase().includes(k)) out.push(`schema ${name}`);
  }
  if (out.length === 0) die(`No matches for '${keyword}' in ${service}.`);
  process.stdout.write(out.join('\n') + '\n');
}

// update command
async function cmdUpdate(args) {
  let token = process.env.ARMS_INTROSPECTION_JWT || '';
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token') token = args[++i] || '';
    else rest.push(args[i]);
  }
  const [target] = rest;
  if (!target) die('Usage: api update <service> [--token <jwt>]');
  if (!token) die('Missing JWT. Export ARMS_INTROSPECTION_JWT or pass --token <jwt>.');
  assertService(target);
  const env = parseEnv(ENV_PATH);
  const baseUrl = env[SERVICE_ENV[target]];
  if (!baseUrl) die(`Missing ${SERVICE_ENV[target]} in ${ENV_PATH}.`);
  const accessToken = await fetchAccessToken(baseUrl, token);
  const spec = await fetchSpec(baseUrl, accessToken);
  if (!fs.existsSync(SPECS_DIR)) fs.mkdirSync(SPECS_DIR, { recursive: true });
  const out = path.join(SPECS_DIR, `${target}.json`);
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(spec));
  fs.renameSync(tmp, out);
  const count = allEndpoints(spec).length;
  process.stdout.write(`${target}: ok — ${count} endpoints cached (${out})\n`);
}

// diff command
async function cmdDiff(args) {
  let token = process.env.ARMS_INTROSPECTION_JWT || '';
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token') token = args[++i] || '';
    else rest.push(args[i]);
  }
  const [target] = rest;
  if (!target) die('Usage: api diff <service> [--token <jwt>]');
  if (!token) die('Missing JWT. Export ARMS_INTROSPECTION_JWT or pass --token <jwt>.');
  assertService(target);
  const specPath = path.join(SPECS_DIR, `${target}.json`);
  if (!fs.existsSync(specPath)) {
    die(`No local spec for '${target}'. Run: api update ${target}`);
  }
  const local = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const env = parseEnv(ENV_PATH);
  const baseUrl = env[SERVICE_ENV[target]];
  if (!baseUrl) die(`Missing ${SERVICE_ENV[target]} in ${ENV_PATH}.`);
  const accessToken = await fetchAccessToken(baseUrl, token);
  const remote = await fetchSpec(baseUrl, accessToken);

  // Diff endpoints
  const toMap = spec => {
    const m = new Map();
    for (const { method, path: p, summary } of allEndpoints(spec)) {
      m.set(`${method} ${p}`, summary || '');
    }
    return m;
  };
  const lm = toMap(local);
  const rm = toMap(remote);
  const added = [], removed = [], changed = [];
  for (const [key, summary] of rm) {
    if (!lm.has(key)) added.push(`${key}${summary ? ` — ${summary}` : ''}`);
    else if (lm.get(key) !== summary) {
      changed.push(`${key}  (was: "${lm.get(key)}")`);
    }
  }
  for (const key of lm.keys()) {
    if (!rm.has(key)) removed.push(key);
  }

  // Diff schemas
  const lSchemas = Object.keys(local.components?.schemas || {});
  const rSchemas = Object.keys(remote.components?.schemas || {});
  const addedSchemas = rSchemas.filter(s => !lSchemas.includes(s));
  const removedSchemas = lSchemas.filter(s => !rSchemas.includes(s));

  const total =
    added.length + removed.length + changed.length +
    addedSchemas.length + removedSchemas.length;
  if (total === 0) {
    process.stdout.write(`${target} — up to date with remote\n`);
    return;
  }
  const counts = [];
  if (added.length) counts.push(`${added.length} new`);
  if (changed.length) counts.push(`${changed.length} changed`);
  if (removed.length) counts.push(`${removed.length} removed`);
  if (addedSchemas.length) counts.push(`${addedSchemas.length} new schema(s)`);
  if (removedSchemas.length) counts.push(`${removedSchemas.length} removed schema(s)`);
  const lines = [`${target} — ${counts.join(', ')} vs local`];
  const section = (title, items) => {
    if (!items.length) return;
    lines.push('', `${title}:`);
    items.forEach(i => lines.push('  ' + i));
  };
  section('new endpoints', added);
  section('new schemas', addedSchemas);
  section('changed endpoints', changed);
  section('removed endpoints', removed);
  section('removed schemas', removedSchemas);
  process.stdout.write(lines.join('\n') + '\n');
}

// Levenshtein for "did you mean" suggestions on miss.
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
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
    }
  }
  return dp[m][n];
}

function usage() {
  process.stdout.write(
    [
      'Usage:',
      '  api.mjs list <service> [GET|POST|PUT|PATCH|DELETE]',
      '  api.mjs get <service> <operationId|/path|SchemaName>',
      '  api.mjs search <service> <keyword>',
      '  api.mjs update <service> [--token <jwt>]',
      '  api.mjs diff <service> [--token <jwt>]',
      '',
      `Services: ${SERVICES.join(', ')}`,
      'JWT: env ARMS_INTROSPECTION_JWT or --token flag.',
      'Note: this service uses cookie auth — the JWT is exchanged for an access_token',
      `      via POST ${LOGIN_PATH} before fetching ${API_DOCS_PATH}.`,
    ].join('\n') + '\n'
  );
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'list': return cmdList(rest);
    case 'get': return cmdGet(rest);
    case 'search': return cmdSearch(rest);
    case 'update': return await cmdUpdate(rest);
    case 'diff': return await cmdDiff(rest);
    case '-h': case '--help': case 'help': case undefined: return usage();
    default: die(`Unknown command '${cmd}'. Run with --help.`);
  }
}

main(process.argv.slice(2)).catch(e => die(e.message || String(e)));
