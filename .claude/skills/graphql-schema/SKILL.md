---
name: graphql-schema
description: Look up downstream GraphQL schema details (operations, types, inputs, enums) for the leaves, clocking, and employee services without pulling full SDLs into context. Use whenever you need to know the shape of a downstream field, argument, or type before writing or debugging a proxy/resolver call.
---

# When to use

- Before writing a `DataFetcher`, resolver, or `HttpGraphQlClient` call that talks to `leaves`, `clocking`, or `employee`.
- The user asks "what does X return" / "what args does Y take" / "is there a query for Z" against a downstream service.
- Debugging a federation/proxy call where the response shape doesn't match expectations.

# Don't use when

- The question is about the gateway-local schema — those live under `src/main/resources/graphql/*.graphqls`. Read those files directly.
- You already have the type/operation from a recent `get` call in this session.

# Services

`leaves` | `clocking` | `employee`

# Commands

```
schema list <service> [queries|mutations|subscriptions]
schema get <service> <name>
schema search <service> <keyword>
schema update <service|all> [--token <jwt>]
schema diff <service|all> [--token <jwt>]
```

`get` resolves both operation names (queries/mutations/subscriptions) and type names (objects, inputs, enums, unions, scalars). Output is prefixed with the kind, e.g. `query: getEmployeeById(...)` or `type: Employee { ... }`.

# Setup (once)

```
export ARMS_INTROSPECTION_JWT=<your jwt>
schema update all
```

The JWT comes from the same SSO the gateway uses; one user token works against all three downstream services. The tool reads service URLs from the repo root `.env` (`LEAVES_SERVICE_GRAPHQL_URL`, `CLOCKING_SERVICE_GRAPHQL_URL`, `EMPLOYEE_SERVICE_GRAPHQL_URL`).

If `update` fails with 401/403, the token is stale — refresh it. You can also pass `--token <jwt>` per-call to override the env var.

# Workflow tip

Each call is intentionally minimal (one line of SDL). Chain calls:

1. `search <service> <keyword>` or `list <service> queries` to find the operation name.
2. `get <service> <operationName>` to see its signature and return type.
3. `get <service> <ReferencedTypeName>` for each input/output type you need to construct or read.

Each step adds ~50–200 tokens to context instead of dumping the whole schema (KBs).

# Examples

```
schema search employee employ
# => query: getEmployeeById
#    query: searchEmployees
#    type: Employee
#    input: EmployeeFilterInput

schema get employee getEmployeeById
# => query: getEmployeeById(id: ID!): Employee

schema get employee Employee
# => type: type Employee { id: ID!; name: String!; department: Department }
```

# Checking for remote changes

`diff <service|all>` fetches the live introspection and compares it against your local cache **without overwriting it**. Use it to find out whether a downstream service has shipped schema changes you don't have yet, before deciding to `update`.

It reports additions first (new operations, new types, new fields/enum values/input fields on existing types), then changes (signature changes, with the local value shown), then removals. Markers inside a changed type: `+` added member, `~` changed member, `-` removed member.

```
schema diff employee
# => employee — 1 new op(s), 1 new type(s), 1 changed type(s) vs local
#
#    new operations:
#      query: getEmployeeArchive(id: ID!): Employee
#
#    new types:
#      type ArchiveEntry { id: ID!; archivedAt: String }
#
#    changed types:
#      Employee:
#        + nickname: String
#        ~ name: String!  (local: name: String)

schema diff all
# => leaves — up to date with remote
#    clocking — up to date with remote
#    employee — 2 new op(s) vs local
#    ...
```

If a service has no local schema yet, `diff` tells you to `update` first (everything would be new). Needs a JWT just like `update`.

# Refreshing schemas

Run `update <service>` (or `update all`) when:

- A downstream service has shipped a schema change.
- You get a "Not found" on a name you know should exist.
- It's been a while and you're unsure if the cache is current.

Cached schemas live at `.claude/skills/graphql-schema/schemas/<service>.json` (gitignored by default since the whole `.claude/skills/` tree isn't tracked in this repo).
