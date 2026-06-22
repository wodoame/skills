---
name: rest-api
description: Look up REST endpoint details (paths, methods, parameters, request/response shapes, schemas) for the incident-management service without pulling the full OpenAPI spec into context. Use whenever you need to know the shape of a downstream endpoint before writing or debugging a service client call.
---

# When to use

- Before writing a method in `IncidentManagementServiceClient` — check what path, params, and response shape the endpoint expects.
- The user asks "what does X return" / "what args does Y take" / "is there an endpoint for Z" against the incident management service.
- Debugging a REST proxy call where the response shape doesn't match expectations.

# Don't use when

- The question is about the gateway-local GraphQL schema — read `src/main/resources/graphql/*.graphqls` directly.
- You already have the endpoint shape from a recent `get` call in this session.

# Services

`incident-management`

# Commands

```
api list <service> [GET|POST|PUT|PATCH|DELETE]
api get <service> <operationId|/path|SchemaName>
api search <service> <keyword>
api update <service> [--token <jwt>]
api diff <service> [--token <jwt>]
```

`get` resolves operation IDs (e.g. `createIncident`), exact paths (e.g. `/incidents/{id}`), and schema names (e.g. `Incident`). Output is prefixed with the kind, e.g. `POST /incidents  [createIncident]` or `schema Incident { ... }`.

# Setup (once)

```
export ARMS_INTROSPECTION_JWT=<your jwt>
node .claude/skills/rest-api/api.mjs update incident-management
```

The JWT is the same SSO token the gateway uses. The script automatically exchanges it for an `access_token` cookie via `POST /auth/login` before fetching the spec — you don't need to do this manually.

The service base URL is read from `.env` (`INCIDENT_MANAGEMENT_SERVICE_BASE_URL`).

If `update` fails with auth errors, your token is stale — refresh it. You can also pass `--token <jwt>` per-call.

# Workflow tip

Each call is intentionally minimal. Chain calls:

1. `search <service> <keyword>` or `list <service> POST` to find the endpoint.
2. `get <service> <operationId>` to see its full signature.
3. `get <service> <SchemaName>` for any referenced type you need to model.

Each step adds ~50–200 tokens instead of the full 326KB spec.

# Examples

```
api search incident-management incident
# => GET /incidents  [listIncidents] — Get all incidents
# => POST /incidents  [createIncident] — Create a new incident
# => GET /incidents/{id}  [getIncidentById] — Get incident by ID
# => schema Incident
# => schema CreateIncidentRequest

api get incident-management createIncident
# => POST /incidents  [createIncident]
#      tags: Incidents
#      summary: Create a new incident
#      body: CreateIncidentRequest { title: string; description: string; ... } (required)
#      responses: 201: Incident { id: string; ... }  400: ErrorResponse

api get incident-management Incident
# => schema Incident { id: string; title: string; status: string; createdAt?: string; ... }

api list incident-management POST
# => POST /incidents
# => POST /auth/login
# => POST /incidents/{id}/messages
```

# Checking for remote changes

`diff <service>` fetches the live spec and compares it against your local cache **without overwriting it**. Use it before adding new endpoint methods to check whether the API has changed.

```
api diff incident-management
# => incident-management — 2 new, 1 changed vs local
#
#    new endpoints:
#      GET /incidents/export  [exportIncidents] — Export incidents as CSV
#
#    changed endpoints:
#      POST /incidents  (was: "Submit an incident")
```

# Refreshing

Run `update <service>` when:

- The incident management service has shipped API changes.
- You get a "Not found" on a name you know should exist.

Cached specs live at `.claude/skills/rest-api/specs/<service>.json`.
