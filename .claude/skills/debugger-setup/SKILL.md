---
name: debugger-setup
description: Configure a step debugger for the current repo, in the user's editor, attached to a Docker container or run another way (local process, test runner). Asks which editor and which approach, then creates the config as untracked files (`.local/`, `.git/info/exclude`) and gives usage steps. Use when the user asks how to set up, configure or attach a debugger, breakpoints against a container, or "debug this project in <editor>".
---

# When to use

- The user wants breakpoints/step debugging in this repo and asks how to configure it.
- They name an editor (Zed, VS Code, IntelliJ, Neovim, ...) and/or a way to run the app (Docker container, local process, tests).

# Don't use when

- The user is chasing a specific bug and just wants help reading logs or code. Debug it directly.
- They want the debug config committed or shared with the team. This skill makes personal, untracked files; ask before doing anything else with them.

# Workflow

1. **Detect the project** before asking anything: language/runtime and version (`pom.xml`, `package.json`, `go.mod`, `pyproject.toml`, ...), the `Dockerfile` (how the app is launched: `CMD`/`ENTRYPOINT`, exposed ports, base image), `docker-compose*.yml` (service name, `env_file`, volumes), and any existing `.zed/`, `.vscode/`, `.idea/` debug config. Read them; don't guess.

2. **Ask the user two things with AskUserQuestion** (one call, two questions). Skip a question only if they already answered it in their message:
   - **Editor**: Zed, VS Code, IntelliJ IDEA, Other (they type it).
   - **How to attach**:
     - Docker container (Recommended when a Dockerfile/compose exists): attach to a debug port exposed by the container.
     - Local process: the editor launches the app itself.
     - Tests: debug a single test or class.
     - Other: they describe it.
   Put the option that fits the repo first and mark it Recommended. If the chosen combination isn't covered in `reference/`, say so and work from the editor's own docs (search if needed) instead of improvising keys.

3. **Read the matching file in `reference/`** for the runtime-specific debug agent flags and the editor's config format. Reference files are a starting point; verify any config key you aren't sure of and tell the user which parts you couldn't verify.

4. **Make every file untracked.** Never edit tracked files (`Dockerfile`, `docker-compose.yml`, `pom.xml`, ...). Put new files in the places below, then prove it:
   ```bash
   mkdir -p .local
   for p in '.local/' '<editor dir, e.g. .zed/ .vscode/ .idea/runConfigurations/>'; do
     grep -qxF "$p" .git/info/exclude || echo "$p" >> .git/info/exclude
   done
   git status --short            # must show nothing new
   git check-ignore -v <each new file>
   ```
   - Docker: a compose **override** at `.local/docker-compose.debug.yml`, used with `-f docker-compose.yml -f .local/docker-compose.debug.yml`. Relative paths in an override resolve against the first file's directory, so volumes and build contexts keep working.
   - Editor config: the editor's own folder, git-ignored via `.git/info/exclude` (works even if `.gitignore` doesn't list it).
   - If a target is already tracked by git, stop and ask; don't overwrite it.

5. **Validate what you can**: `docker compose -f ... -f ... config` for compose files, JSON parse for editor configs. Don't start containers or the debugger unless the user asks.

6. **Report** with: the files created (and that they're untracked), then numbered steps to use it (start the app/container, attach from the editor, set a breakpoint, trigger a request), then the caveats that apply (below). Keep it short; the user can ask for more.

# Caveats to always mention for Docker attach

- Breakpoints only match if the running image was built from the current source: rebuild (`--build`) after changes.
- The debug port gives remote code execution to anyone who can reach it. Fine on localhost; never use the override on a shared or deployed host.
- `suspend=n` (JVM) lets the app boot without a debugger; switch to `suspend=y` only to debug startup code.
- Disable healthchecks and restart policies in the override so a paused breakpoint doesn't get the container killed.
- Prefer injecting agent flags through an env var (e.g. `JAVA_TOOL_OPTIONS`, `NODE_OPTIONS`) over changing `CMD`, so tracked files stay untouched.
