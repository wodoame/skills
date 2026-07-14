---
name: graphql-query
description: Write a gateway-level GraphQL query or mutation with all arguments supplied inline as literals (Postman-style), instead of using variables. Use whenever the user asks for a query/mutation "like I'd paste into Postman", "with inputs supplied directly", or otherwise wants inline arguments instead of a variables block.
---

# When to use

- The user asks for a gateway-level GraphQL operation (query or mutation) to run in Postman, GraphiQL, or similar, with argument values written directly into the operation body.
- The user explicitly says they don't want a `variables` block / don't want to use `$variableName` placeholders.

# Don't use when

- The user wants a query for a **downstream** service (leaves, clocking, employee, ims) — use the `graphql-schema` skill first to look up the operation/type shapes, then apply this format.
- The user wants the query written with variables (the normal client-side convention) — just write it the standard way instead.

# Format

- Look up the operation in the gateway's local schema under `src/main/resources/graphql/*.graphqls` (or the downstream service's schema via `graphql-schema` if it's a proxied operation) to get the exact argument names, input types, and return type.
- Inline every argument directly in the operation body — no `query Foo($x: X)` header, no separate `variables` JSON.
- For each input object argument, spell out its fields inline as a GraphQL object literal (`{ field: value, ... }`), recursing into nested input types the same way.
- Use realistic placeholder values:
  - IDs → an obviously-fake placeholder string like `"REPLACE_WITH_INCIDENT_TYPE_ID"`, and a one-line note on which query supplies real ones (e.g. "from the `incidentTopics` query").
  - Strings → short realistic example text for the field (a title, a comment, etc.), not `"string"`.
  - Enums → a real enum value from the schema.
  - Dates → a plausible ISO date/datetime string.
- Select a reasonable set of fields on the return type (favor fields likely useful to inspect — id, status, timestamps — over dumping every field), unless the user asks for a specific subset.
- Mention any auth/header requirements the operation needs (e.g. `X-IMS-Token`) as a short note after the query, not inline in the GraphQL body.

# Example

```graphql
mutation {
  createIncident(
    input: {
      title: "Broken elevator on 3rd floor"
      description: "The elevator near the east wing has been stuck since this morning."
      incidentTypeId: "REPLACE_WITH_INCIDENT_TOPIC_ID"
      locationId: "REPLACE_WITH_LOCATION_ID"
      severityId: "REPLACE_WITH_SEVERITY_ID"
    }
  ) {
    id
  }
}
```
