---
name: ticket-description-writer
description: Use when the user wants to write a well-structured ticket description for a project task, feature, or bug. Generates a user story, description paragraph, and acceptance criteria in a consistent format.
---

# Ticket Description Writer

Help the user write a clear, professional ticket description by gathering details through targeted questions and then generating a structured description.

## Output Format

Every ticket description must follow this exact structure:

```
As a [type of user],
I want [goal or action],
so that [reason or benefit].

Description:
[One or two paragraphs describing the feature, integration, or fix in technical and product terms. Cover what the system should do, key behaviors, and any important constraints.]

Acceptance Criteria:

[Criterion 1]

[Criterion 2]

[Criterion 3]

...
```

## Core Workflow

1. **Gather context** — Ask the user targeted questions to understand the ticket. Keep it conversational; ask follow-ups as needed.
2. **Draft the description** — Generate the full structured description using the format above.
3. **Refine** — Ask if anything needs adjusting (scope, tone, criteria wording). Apply edits on request.

## Questions to Ask

Adapt these to what the user already tells you. Don't ask for information they've already provided.

- **Who is the user?** (e.g., registered user, admin, guest, developer)
- **What is the feature or task?** (e.g., fetch profile data, fix login bug, add export button)
- **Why does it matter?** (the business or user value)
- **What system or component is involved?** (e.g., API name, screen name, service)
- **Are there any key technical details?** (e.g., data to display, error handling expectations, performance or security requirements)
- **What does "done" look like?** (any explicit success criteria the user already has in mind)

If the user provides a rough description upfront, extract what you can from it and only ask about the gaps.

## Writing Guidelines

### User Story
- Keep it one sentence per line (As a / I want / so that).
- Be specific about the user type — avoid generic "user" unless the ticket is truly non-role-specific.
- The "so that" clause must state a real benefit, not just restate the action.

### Description
- Write in plain, professional language — no bullet points, just prose.
- Describe what the system should do, not how to implement it.
- Cover: the main behavior, relevant screens or components, edge cases worth calling out (errors, loading, empty states), and any constraints (security, performance, caching).
- Keep it to 3–6 sentences. Dense but scannable.

### Acceptance Criteria
- Write as short, declarative statements (not "should" — just state the fact as if done).
- Each criterion must be independently testable.
- Cover the happy path, error/edge cases, and any non-functional requirements (security, performance) that are in scope.
- Aim for 4–7 criteria. Fewer if the ticket is simple; more only if genuinely needed.
- Do not add criteria that are vague or untestable (e.g., "the UI looks good").

## Example

**User input:**
> I need a ticket for fetching and showing the user profile from a backend API after login.

**Assistant output:**

As a registered user,
I want the mobile application to retrieve and display my profile information from a backend User Profile API,
so that my personal details are accurate, up to date, and consistently available across the app.

Description:
The app should integrate with the User Profile API to fetch user details such as name, email, profile photo, and other relevant attributes after authentication. The retrieved data should be securely stored in memory or local cache as needed and used across relevant screens (e.g., profile, settings). The integration should gracefully handle loading states, API errors, and missing data.

Acceptance Criteria:

User profile data is fetched successfully after login or app launch

Profile information is displayed correctly in relevant screens

API errors are handled with appropriate user feedback

Data refresh reflects updates made on the backend

Integration follows security and performance best practices

---

## Rules

- Always produce the full structured output — never just a user story or just criteria on their own.
- Do not ask more than 3–4 clarifying questions before drafting. If details are thin, make reasonable assumptions and note them in the draft.
- After drafting, explicitly invite the user to request changes.
- Match the formality and specificity of the user's context — a startup sprint ticket can be leaner than an enterprise story.
- Never include implementation details (specific library names, database schemas, etc.) unless the user explicitly asks for them in the description.
