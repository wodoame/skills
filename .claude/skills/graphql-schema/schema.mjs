#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Paths are anchored on the current working directory (the repo you run the
// skill from), not on this file's location. This keeps the script symlink-safe:
// the code can live in one canonical repo and be symlinked into others, while
// each repo's .env and cached schemas/ stay local to it. Invoke from the repo
// root, as the docs and error messages assume.
const REPO_ROOT = process.cwd();
const SCHEMA_DIR = path.join(REPO_ROOT, '.claude', 'skills', 'graphql-schema', 'schemas');
const ENV_PATH = path.join(REPO_ROOT, '.env');

const SERVICES = ['leaves', 'clocking', 'employee'];
const SERVICE_ENV = {
  leaves: 'LEAVES_SERVICE_GRAPHQL_URL',
  clocking: 'CLOCKING_SERVICE_GRAPHQL_URL',
  employee: 'EMPLOYEE_SERVICE_GRAPHQL_URL',
};

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      ...FullType
    }
    directives {
      name
      description
      locations
      args { ...InputValue }
    }
  }
}
fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args { ...InputValue }
    type { ...TypeRef }
    isDeprecated
    deprecationReason
  }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue {
  name
  description
  type { ...TypeRef }
  defaultValue
}
fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType { kind name }
            }
          }
        }
      }
    }
  }
}
`.trim();

// Print a message to stderr and exit with the given code.
function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

// Read a .env file into a key/value object, stripping quotes and comments.
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

// Exit if the given service name isn't one of the known downstream services.
function assertService(service) {
  if (!SERVICES.includes(service)) {
    die(`Unknown service '${service}'. Valid: ${SERVICES.join(', ')}.`);
  }
}

// Load a service's cached introspection from disk, exiting if it's missing.
function loadSchema(service) {
  const p = path.join(SCHEMA_DIR, `${service}.json`);
  if (!fs.existsSync(p)) {
    die(
      `No schema for '${service}'. Run: node .claude/skills/graphql-schema/schema.mjs update ${service}`
    );
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!raw.__schema) die(`Schema file ${p} missing __schema key.`);
  return raw.__schema;
}

// Render an introspection type ref to SDL, unwrapping NON_NULL (!) and LIST ([]).
function formatTypeRef(ref) {
  if (!ref) return '?';
  if (ref.kind === 'NON_NULL') return formatTypeRef(ref.ofType) + '!';
  if (ref.kind === 'LIST') return '[' + formatTypeRef(ref.ofType) + ']';
  return ref.name || '?';
}

// Render a field/operation's argument list as "(name: Type = default, ...)".
function formatArgs(args) {
  if (!args || args.length === 0) return '';
  const parts = args.map((a) => {
    const base = `${a.name}: ${formatTypeRef(a.type)}`;
    return a.defaultValue != null ? `${base} = ${a.defaultValue}` : base;
  });
  return '(' + parts.join(', ') + ')';
}

// Render a single field/operation as "name(args): ReturnType".
function formatField(field) {
  return `${field.name}${formatArgs(field.args)}: ${formatTypeRef(field.type)}`;
}

// Render a full type definition (object/input/enum/union/scalar) as one SDL line.
function formatType(type) {
  switch (type.kind) {
    case 'OBJECT':
    case 'INTERFACE': {
      const fields = (type.fields || []).map(formatField).join('; ');
      const label = type.kind === 'INTERFACE' ? 'interface' : 'type';
      const impl =
        type.interfaces && type.interfaces.length
          ? ' implements ' + type.interfaces.map((i) => i.name).join(' & ')
          : '';
      return `${label} ${type.name}${impl} { ${fields} }`;
    }
    case 'INPUT_OBJECT': {
      const fields = (type.inputFields || [])
        .map((f) => {
          const base = `${f.name}: ${formatTypeRef(f.type)}`;
          return f.defaultValue != null ? `${base} = ${f.defaultValue}` : base;
        })
        .join('; ');
      return `input ${type.name} { ${fields} }`;
    }
    case 'ENUM': {
      const vals = (type.enumValues || []).map((v) => v.name).join(' ');
      return `enum ${type.name} { ${vals} }`;
    }
    case 'UNION': {
      const members = (type.possibleTypes || []).map((t) => t.name).join(' | ');
      return `union ${type.name} = ${members}`;
    }
    case 'SCALAR':
      return `scalar ${type.name}`;
    default:
      return `${type.kind} ${type.name}`;
  }
}

// Return the fields of a root type (Query/Mutation/Subscription) by its name.
function rootTypeFields(schema, rootName) {
  if (!rootName) return [];
  const t = schema.types.find((x) => x.name === rootName);
  return t && t.fields ? t.fields : [];
}

// Group the schema's root operations into { query, mutation, subscription } fields.
function rootFieldsByKind(schema) {
  return {
    query: rootTypeFields(schema, schema.queryType && schema.queryType.name),
    mutation: rootTypeFields(schema, schema.mutationType && schema.mutationType.name),
    subscription: rootTypeFields(
      schema,
      schema.subscriptionType && schema.subscriptionType.name
    ),
  };
}

// Return user-defined types, excluding introspection (__) types and root operations.
function userTypes(schema) {
  return schema.types.filter(
    (t) =>
      !t.name.startsWith('__') &&
      t.name !== (schema.queryType && schema.queryType.name) &&
      t.name !== (schema.mutationType && schema.mutationType.name) &&
      t.name !== (schema.subscriptionType && schema.subscriptionType.name)
  );
}

// Edit distance between two strings, used to rank "did you mean" suggestions.
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

// Return the n closest candidate names to `name` by edit distance.
function suggest(name, candidates, n = 3) {
  const lower = name.toLowerCase();
  return candidates
    .map((c) => ({ c, d: levenshtein(lower, c.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.c);
}

const KIND_ALIASES = {
  queries: 'query',
  query: 'query',
  mutations: 'mutation',
  mutation: 'mutation',
  subscriptions: 'subscription',
  subscription: 'subscription',
};

// `list` command: print operation names, optionally filtered to one kind.
function cmdList(args) {
  const [service, kind] = args;
  if (!service) die('Usage: list <service> [queries|mutations|subscriptions]');
  assertService(service);
  const schema = loadSchema(service);
  const roots = rootFieldsByKind(schema);
  let sections;
  if (kind) {
    const singular = KIND_ALIASES[kind.toLowerCase()];
    if (!singular) {
      die(`Unknown kind '${kind}'. Use queries, mutations, or subscriptions.`);
    }
    sections = [[singular, roots[singular]]];
  } else {
    sections = [
      ['query', roots.query],
      ['mutation', roots.mutation],
      ['subscription', roots.subscription],
    ];
  }
  const out = [];
  for (const [label, fields] of sections) {
    if (!fields || fields.length === 0) continue;
    const plural = label === 'query' ? 'queries' : `${label}s`;
    if (!kind) out.push(`# ${plural}`);
    for (const f of fields) out.push(f.name);
  }
  process.stdout.write(out.join('\n') + '\n');
}

// Resolve a name to an operation or type, trying exact then case-insensitive match.
function findInSchema(schema, name) {
  const roots = rootFieldsByKind(schema);
  for (const kind of ['query', 'mutation', 'subscription']) {
    const f = (roots[kind] || []).find((x) => x.name === name);
    if (f) return { kind, field: f };
  }
  const t = schema.types.find((x) => x.name === name);
  if (t) return { kind: 'type', type: t };
  const lower = name.toLowerCase();
  for (const kind of ['query', 'mutation', 'subscription']) {
    const f = (roots[kind] || []).find((x) => x.name.toLowerCase() === lower);
    if (f) return { kind, field: f };
  }
  const tCi = schema.types.find((x) => x.name.toLowerCase() === lower);
  if (tCi) return { kind: 'type', type: tCi };
  return null;
}

// `get` command: print one operation or type's signature, or suggest near-misses.
function cmdGet(args) {
  const [service, name] = args;
  if (!service || !name) die('Usage: get <service> <name>');
  assertService(service);
  const schema = loadSchema(service);
  const hit = findInSchema(schema, name);
  if (!hit) {
    const roots = rootFieldsByKind(schema);
    const all = [
      ...roots.query.map((f) => f.name),
      ...roots.mutation.map((f) => f.name),
      ...roots.subscription.map((f) => f.name),
      ...userTypes(schema).map((t) => t.name),
    ];
    const s = suggest(name, all);
    die(`Not found: '${name}'. Did you mean: ${s.join(', ')}?`);
  }
  if (hit.field) {
    process.stdout.write(`${hit.kind}: ${formatField(hit.field)}\n`);
  } else {
    process.stdout.write(`${typeKindLabel(hit.type.kind)}: ${formatType(hit.type)}\n`);
  }
}

// Map an introspection type kind to its SDL keyword (OBJECT -> "type", etc.).
function typeKindLabel(kind) {
  switch (kind) {
    case 'OBJECT': return 'type';
    case 'INTERFACE': return 'interface';
    case 'INPUT_OBJECT': return 'input';
    case 'ENUM': return 'enum';
    case 'UNION': return 'union';
    case 'SCALAR': return 'scalar';
    default: return kind.toLowerCase();
  }
}

// `search` command: print operations and types whose names contain the keyword.
function cmdSearch(args) {
  const [service, keyword] = args;
  if (!service || !keyword) die('Usage: search <service> <keyword>');
  assertService(service);
  const schema = loadSchema(service);
  const k = keyword.toLowerCase();
  const out = [];
  const roots = rootFieldsByKind(schema);
  for (const kind of ['query', 'mutation', 'subscription']) {
    for (const f of roots[kind] || []) {
      if (f.name.toLowerCase().includes(k)) out.push(`${kind}: ${f.name}`);
    }
  }
  for (const t of userTypes(schema)) {
    if (t.name.toLowerCase().includes(k)) out.push(`${typeKindLabel(t.kind)}: ${t.name}`);
  }
  if (out.length === 0) die(`No matches for '${keyword}' in ${service}.`);
  process.stdout.write(out.join('\n') + '\n');
}

// Build a map of member name -> rendered signature for a type, for diffing.
function memberMap(type) {
  const m = new Map();
  switch (type.kind) {
    case 'OBJECT':
    case 'INTERFACE':
      for (const f of type.fields || []) m.set(f.name, formatField(f));
      break;
    case 'INPUT_OBJECT':
      for (const f of type.inputFields || []) {
        const base = `${f.name}: ${formatTypeRef(f.type)}`;
        m.set(f.name, f.defaultValue != null ? `${base} = ${f.defaultValue}` : base);
      }
      break;
    case 'ENUM':
      for (const v of type.enumValues || []) m.set(v.name, v.name);
      break;
    case 'UNION':
      for (const t of type.possibleTypes || []) m.set(t.name, t.name);
      break;
  }
  return m;
}

// Diff one type's members across local/remote, returning +/~/- lines (or null if same).
function diffType(local, remote) {
  if (local.kind !== remote.kind) {
    return {
      name: remote.name,
      lines: [`~ kind ${typeKindLabel(local.kind)} -> ${typeKindLabel(remote.kind)}`],
    };
  }
  const lm = memberMap(local);
  const rm = memberMap(remote);
  const lines = [];
  for (const [name, sig] of rm) {
    if (!lm.has(name)) lines.push(`+ ${sig}`);
    else if (lm.get(name) !== sig) lines.push(`~ ${sig}  (local: ${lm.get(name)})`);
  }
  for (const [name, sig] of lm) {
    if (!rm.has(name)) lines.push(`- ${sig}`);
  }
  return lines.length ? { name: remote.name, lines } : null;
}

// Compare two schemas, bucketing differences into new/changed/removed ops and types.
function diffSchemas(local, remote) {
  const out = {
    newOps: [], removedOps: [], changedOps: [],
    newTypes: [], removedTypes: [], changedTypes: [],
  };
  const lr = rootFieldsByKind(local);
  const rr = rootFieldsByKind(remote);
  for (const kind of ['query', 'mutation', 'subscription']) {
    const lmap = new Map((lr[kind] || []).map((f) => [f.name, formatField(f)]));
    const rmap = new Map((rr[kind] || []).map((f) => [f.name, formatField(f)]));
    for (const [name, sig] of rmap) {
      if (!lmap.has(name)) out.newOps.push(`${kind}: ${sig}`);
      else if (lmap.get(name) !== sig) {
        out.changedOps.push(`${kind}: ${sig}  (local: ${lmap.get(name)})`);
      }
    }
    for (const name of lmap.keys()) {
      if (!rmap.has(name)) out.removedOps.push(`${kind}: ${name}`);
    }
  }
  const ltypes = new Map(userTypes(local).map((t) => [t.name, t]));
  const rtypes = new Map(userTypes(remote).map((t) => [t.name, t]));
  for (const [name, rt] of rtypes) {
    if (!ltypes.has(name)) out.newTypes.push(formatType(rt));
    else {
      const d = diffType(ltypes.get(name), rt);
      if (d) out.changedTypes.push(d);
    }
  }
  for (const [name, lt] of ltypes) {
    if (!rtypes.has(name)) out.removedTypes.push(`${typeKindLabel(lt.kind)} ${name}`);
  }
  return out;
}

// Format a diff result into a human-readable block, or an "up to date" line.
function renderDiff(service, d) {
  const counts = [];
  const total =
    d.newOps.length + d.changedOps.length + d.removedOps.length +
    d.newTypes.length + d.changedTypes.length + d.removedTypes.length;
  if (total === 0) return `${service} — up to date with remote`;
  if (d.newOps.length) counts.push(`${d.newOps.length} new op(s)`);
  if (d.changedOps.length) counts.push(`${d.changedOps.length} changed op(s)`);
  if (d.removedOps.length) counts.push(`${d.removedOps.length} removed op(s)`);
  if (d.newTypes.length) counts.push(`${d.newTypes.length} new type(s)`);
  if (d.changedTypes.length) counts.push(`${d.changedTypes.length} changed type(s)`);
  if (d.removedTypes.length) counts.push(`${d.removedTypes.length} removed type(s)`);
  const lines = [`${service} — ${counts.join(', ')} vs local`];
  const section = (title, items) => {
    if (!items.length) return;
    lines.push('', title + ':');
    for (const it of items) lines.push('  ' + it);
  };
  section('new operations', d.newOps);
  section('new types', d.newTypes);
  if (d.changedTypes.length) {
    lines.push('', 'changed types:');
    for (const t of d.changedTypes) {
      lines.push('  ' + t.name + ':');
      for (const l of t.lines) lines.push('    ' + l);
    }
  }
  section('changed operations', d.changedOps);
  section('removed operations', d.removedOps);
  section('removed types', d.removedTypes);
  return lines.join('\n');
}

// `diff` command: fetch live schema(s) and report drift vs the local cache (no write).
async function cmdDiff(args) {
  let token = process.env.ARMS_INTROSPECTION_JWT || '';
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token') token = args[++i] || '';
    else rest.push(args[i]);
  }
  const [target] = rest;
  if (!target) die('Usage: diff <service|all> [--token <jwt>]');
  if (!token) die('Missing JWT. Export ARMS_INTROSPECTION_JWT or pass --token <jwt>.');
  if (target !== 'all') assertService(target);
  const env = parseEnv(ENV_PATH);
  const targets = target === 'all' ? SERVICES : [target];
  const blocks = [];
  let failed = false;
  for (const service of targets) {
    const localPath = path.join(SCHEMA_DIR, `${service}.json`);
    if (!fs.existsSync(localPath)) {
      blocks.push(`${service} — no local schema; run 'update ${service}' first (all of remote is new)`);
      failed = true;
      continue;
    }
    try {
      const local = JSON.parse(fs.readFileSync(localPath, 'utf8')).__schema;
      const urlVar = SERVICE_ENV[service];
      const url = env[urlVar];
      if (!url) throw new Error(`Missing ${urlVar} in ${ENV_PATH}.`);
      const remote = await fetchIntrospection(url, token);
      blocks.push(renderDiff(service, diffSchemas(local, remote)));
    } catch (e) {
      blocks.push(`${service} — FAILED (${e.message})`);
      failed = true;
    }
  }
  process.stdout.write(blocks.join('\n\n') + '\n');
  if (failed) process.exit(1);
}

// POST the introspection query to a service URL and return its __schema, or throw.
async function fetchIntrospection(url, token) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    });
  } catch (e) {
    throw new Error(`Network error calling ${url}: ${e.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Auth failed (${res.status}) for ${url}. Check ARMS_INTROSPECTION_JWT or pass --token <jwt>.`
      );
    }
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
  if (json.errors && json.errors.length) {
    throw new Error(`GraphQL errors from ${url}: ${json.errors[0].message}`);
  }
  if (!json.data || !json.data.__schema) {
    throw new Error(`Response missing data.__schema from ${url}.`);
  }
  return json.data.__schema;
}

// Write a file atomically via a temp file + rename to avoid partial writes.
function writeAtomic(p, content) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}

// Fetch one service's live schema and write it to the local cache; returns the path.
async function updateOne(service, env, token) {
  const urlVar = SERVICE_ENV[service];
  const url = env[urlVar];
  if (!url) throw new Error(`Missing ${urlVar} in ${ENV_PATH}.`);
  const schema = await fetchIntrospection(url, token);
  if (!fs.existsSync(SCHEMA_DIR)) fs.mkdirSync(SCHEMA_DIR, { recursive: true });
  const out = path.join(SCHEMA_DIR, `${service}.json`);
  writeAtomic(out, JSON.stringify({ __schema: schema }));
  return out;
}

// `update` command: refresh the cached schema for one service or all of them.
async function cmdUpdate(args) {
  let token = process.env.ARMS_INTROSPECTION_JWT || '';
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token') {
      token = args[++i] || '';
    } else {
      rest.push(args[i]);
    }
  }
  const [target] = rest;
  if (!target) die('Usage: update <service|all> [--token <jwt>]');
  if (!token) {
    die('Missing JWT. Export ARMS_INTROSPECTION_JWT or pass --token <jwt>.');
  }
  const env = parseEnv(ENV_PATH);
  const targets = target === 'all' ? SERVICES : [target];
  if (target !== 'all') assertService(target);
  const results = [];
  for (const s of targets) {
    try {
      const out = await updateOne(s, env, token);
      results.push(`${s}: ok (${out})`);
    } catch (e) {
      results.push(`${s}: FAILED (${e.message})`);
    }
  }
  process.stdout.write(results.join('\n') + '\n');
  if (results.some((r) => r.includes('FAILED'))) process.exit(1);
}

// Print the command/usage help text.
function usage() {
  process.stdout.write(
    [
      'Usage:',
      '  schema.mjs list <service> [queries|mutations|subscriptions]',
      '  schema.mjs get <service> <name>',
      '  schema.mjs search <service> <keyword>',
      '  schema.mjs update <service|all> [--token <jwt>]',
      '  schema.mjs diff <service|all> [--token <jwt>]',
      '',
      `Services: ${SERVICES.join(', ')}`,
      'JWT for update: env ARMS_INTROSPECTION_JWT or --token flag.',
    ].join('\n') + '\n'
  );
}

// Entry point: dispatch the first argv token to its command handler.
async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'list':
      return cmdList(rest);
    case 'get':
      return cmdGet(rest);
    case 'search':
      return cmdSearch(rest);
    case 'update':
      return cmdUpdate(rest);
    case 'diff':
      return cmdDiff(rest);
    case '-h':
    case '--help':
    case 'help':
    case undefined:
      return usage();
    default:
      die(`Unknown command '${cmd}'. Run with --help.`);
  }
}

main(process.argv.slice(2)).catch((e) => die(e.message || String(e)));
