---
name: commit
description: Create a git commit for staged or unstaged changes, following project conventions.
---

# Commit

Create a git commit for the current changes.

## Rules

- **Never add a `Co-Authored-By` trailer** or any AI attribution to the commit message.
- Stage specific files by name — avoid `git add -A` or `git add .` unless the user explicitly asks for it.
- Do not amend existing commits unless the user explicitly asks.
- Do not skip hooks (`--no-verify`) unless the user explicitly asks.

## Workflow

1. Run `git status` and `git diff` (staged + unstaged) in parallel to see what changed.
2. Run `git log --oneline -5` to read the recent commit style.
3. Draft a commit message that matches the repo's style:
   - Summarise the *why*, not the *what*.
   - Keep the subject line under 72 characters.
   - Use the conventional-commits prefix if the repo already uses it (feat, fix, chore, docs, refactor, test, etc.).
4. Stage the relevant files and create the commit.
5. Run `git status` to confirm success.

## Commit message format

```
<type>: <short summary>

<optional body — only if the why needs more explanation>
```

No `Co-Authored-By` line. No AI attribution of any kind.
