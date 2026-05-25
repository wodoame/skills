#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(__dirname, 'schemas');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
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

function formatTypeRef(ref) {
  if (!ref) return '?';
  if (ref.kind === 'NON_NULL') return formatTypeRef(ref.ofType) + '!';
  if (ref.kind === 'LIST') return '[' + formatTypeRef(ref.ofType) + ']';
  return ref.name || '?';
}

function formatArgs(args) {
  if (!args || args.length === 0) return '';
  const parts = args.map((a) => {
    const base = `${a.name}: ${formatTypeRef(a.type)}`;
    return a.defaultValue != null ? `${base} = ${a.defaultValue}` : base;
  });
  return '(' + parts.join(', ') + ')';
}

function formatField(field) {
  return `${field.name}${formatArgs(field.args)}: ${formatTypeRef(field.type)}`;
}

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

function rootTypeFields(schema, rootName) {
  if (!rootName) return [];
  const t = schema.types.find((x) => x.name === rootName);
  return t && t.fields ? t.fields : [];
}

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

function userTypes(schema) {
  return schema.types.filter(
    (t) =>
      !t.name.startsWith('__') &&
      t.name !== (schema.queryType && schema.queryType.name) &&
      t.name !== (schema.mutationType && schema.mutationType.name) &&
      t.name !== (schema.subscriptionType && schema.subscriptionType.name)
  );
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

function writeAtomic(p, content) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}

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

function usage() {
  process.stdout.write(
    [
      'Usage:',
      '  schema.mjs list <service> [queries|mutations|subscriptions]',
      '  schema.mjs get <service> <name>',
      '  schema.mjs search <service> <keyword>',
      '  schema.mjs update <service|all> [--token <jwt>]',
      '',
      `Services: ${SERVICES.join(', ')}`,
      'JWT for update: env ARMS_INTROSPECTION_JWT or --token flag.',
    ].join('\n') + '\n'
  );
}

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
