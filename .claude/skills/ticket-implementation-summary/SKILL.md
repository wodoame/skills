---
name: ticket-implementation-summary
description: Write and post a QA-friendly "implementation summary" comment on a Jira ticket, describing what was built and which GraphQL queries/mutations (or endpoints) exercise each piece of functionality. Use whenever the user asks to summarize the implementation of a ticket for QA, or to add an implementation-summary comment to a Jira issue.
---

# When to use

- The user asks for an implementation summary of a ticket, to be added as a Jira comment.
- The user wants a QA handoff note describing what was built for a ticket and how to exercise it.
- The user references a Jira ticket (key or URL) and asks what was implemented for it / wants that written up for QA.

# Don't use when

- The user wants the ticket's *description* (user story + acceptance criteria) written — use `ticket-description-writer` instead.
- The user wants a PR description written — that's a separate artifact with its own template; don't repurpose this skill for it.

# Workflow

1. **Resolve the ticket.** Get the ticket key from the user's message (e.g. `AMOB-451` or a Jira URL). Fetch it with `getJiraIssue` to confirm the summary/title and current status.
2. **Find the implementation.** Search merged PRs referencing the ticket key:
   ```bash
   gh pr list --search "<TICKET-KEY>" --state all --json number,title,body,url,mergedAt
   ```
   If multiple PRs come back, check each PR body's "relevant Jira tracker stories" link (or similar) to confirm it actually references *this* ticket — don't assume a title match is enough, since ticket keys can look similar (e.g. `AMOB-451` vs `AMB-...`). If nothing turns up, fall back to `git log --all --grep="<TICKET-KEY>"` or ask the user which PR/branch implements it.
3. **Identify the QA-facing surface.** From the PR body/diff, list the distinct pieces of functionality delivered, and for each one, the exact GraphQL operation name (query/mutation) — or REST endpoint if that's what the project exposes — that a QA tester would call to exercise it. Look these up in the gateway's local schema (`src/main/resources/graphql/*.graphqls`) if the PR body doesn't already name them precisely.
4. **Draft the comment** using the format below and show it to the user before posting.
5. **Check for an existing implementation-summary comment** on the ticket (one with the same "Implementation Summary" header) before adding a new one — if found, ask whether to update it in place (`addCommentToJiraIssue` with `commentId`) rather than duplicate it.
6. **Post it** via `addCommentToJiraIssue` only after the user confirms the draft (or explicitly asked you to add it directly) — this is a comment visible to the whole team, so don't post without at least implicit sign-off in the current request.

# Writing guidelines

Write for a QA tester, not another backend engineer — no class names, internal method names, resilience/retry mechanics, or persistence details. Stick to *what the system now does* and *which operation triggers it*.

- **Header:** `**Implementation Summary**` followed by a link to the PR(s) that implement the ticket.
- **Functionality list:** one bullet per distinct capability, bold label, the operation name in backticks, then a one-line plain-language description of what it does.
- **Auth/preconditions:** one short line if the operations need a prior login/token step or any other setup a tester must do first.
- **Suggested manual test flow:** a short numbered sequence of operation calls that exercises the happy path end-to-end (and, if relevant, one failure case worth checking, like a missing-auth request).

Keep the whole comment scannable — a QA tester should be able to read it in under a minute and know exactly which operations to call and in what order.

# Example

For a ticket about incident chat messaging:

```markdown
**Implementation Summary** (PR: [#93 - Backend: Incident Messaging](https://github.com/Amali-Tech/arms-mobile-backend/pull/93))

The gateway now supports viewing, sending, and deleting chat messages on an incident:

- **View messages** — `messages` query — fetch a paginated list of messages for a given incident, including sender name, message content, attachments, and timestamps.
- **Send a message** — `sendMessage` mutation — post a new message to an incident, either as text only or with an attachment.
- **Delete a message** — `deleteMessage` mutation — remove a message from an incident's thread.

All of these require the user to be authenticated with a valid IMS session (obtained via the `imsLogin` mutation) and are scoped to the specific incident the message belongs to.

**Suggested manual test flow:**
1. Call `imsLogin` to get a session, then use `myIncidents` to get an incident ID.
2. Call `sendMessage` with just text content and confirm it's returned with the correct content, sender, and timestamp.
3. Call `messages` for that incident and confirm the new message appears.
4. Call `deleteMessage` and confirm the message no longer appears in `messages`.
5. Try calling `sendMessage`/`deleteMessage` without a valid session token and confirm it's rejected.
```
