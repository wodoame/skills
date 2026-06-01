# Skills

A personal collection of Claude Code skills — reusable slash commands that extend Claude's behaviour for recurring tasks.

## What is a skill?

A skill is a `SKILL.md` file placed under `.claude/skills/<skill-name>/`. When Claude Code loads a project, it picks up any skills in `.claude/skills/` and makes them available as `/skill-name` slash commands. Each skill file defines how Claude should behave when that command is invoked.

## Skills in this repo

| Skill | Command | Purpose |
|---|---|---|
| aws-diagram-creator | `/aws-diagram-creator` | Create and edit AWS architecture diagrams as draw.io files |
| code-interviewer | `/code-interviewer` | AI-led interview to assess your understanding of a section of code |
| coding-practice-coach | `/coding-practice-coach` | Hands-on coding challenges with review and feedback |
| django-systems-architect | `/django-systems-architect` | Structured guidance for Django project architecture |
| graphql-schema | `/graphql-schema` | Look up GraphQL schema details for downstream services |
| springboot-systems-architect | `/springboot-systems-architect` | Structured guidance for Spring Boot project architecture |
| system-design-interviewer | `/system-design-interviewer` | Practice system design interviews with AI feedback |
| ticket-description-writer | `/ticket-description-writer` | Generate structured ticket descriptions (user story, description, acceptance criteria) |
| commit | `/commit` | Create a git commit following project conventions (no AI co-author attribution) |

## Adding a new skill

1. Create a directory: `.claude/skills/<skill-name>/`
2. Add a `SKILL.md` with this frontmatter:

   ```markdown
   ---
   name: skill-name
   description: One-line description shown in skill selection UI.
   ---

   # Skill Title

   Instructions for Claude...
   ```

3. Update the table above.
4. Sync to `~/.claude/skills/<skill-name>/` if you want the skill available globally (outside this repo).

## Syncing skills globally

Skills in this repo are only active when Claude Code is opened in this directory. To make a skill available in any project, copy it to the global skills directory:

```bash
cp -r .claude/skills/<skill-name> ~/.claude/skills/
```
