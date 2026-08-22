---
name: obsidian-note
description: Use when the user wants to save, document, or write up a topic or discussion as a note in their Obsidian vault. Finds the vault, confirms it with the user, then writes a well-structured markdown note matching the vault's conventions.
---

# Obsidian Note

Capture a topic from the current conversation as a clean, well-structured markdown note in the user's Obsidian vault.

## Core Workflow

1. **Find the vault**
   - By default, explore `~/Documents` looking for an Obsidian vault — a directory containing a `.obsidian` subdirectory (e.g. `~/Documents/Obsidian Vault`).
   - If nothing is found there, check other common locations (`~`, `~/Desktop`, `~/Nextcloud`) before giving up.
   - If multiple vaults exist or none can be found, list what you found and ask the user where to write.
   - Do not write anything until the vault is located.

2. **Confirm the vault with the user**
   - Before writing, state the vault path you found and ask the user to confirm it is the right one (use the question tool if available).
   - Only proceed after explicit confirmation.

3. **Learn the vault's conventions**
   - Read 1-3 representative existing notes to pick up the house style before writing anything:
     - Naming convention for note files (e.g. `Topic Name.md`)
     - Whether notes start with tags/frontmatter (e.g. `#linux #apt` on the first line)
     - Header structure, code-block style, tone (second person vs neutral), use of tables/lists
   - Mimic these conventions exactly. New notes should be indistinguishable in style from existing ones.

4. **Write the note**
   - Summarize the topic or discussion accurately — include the concepts covered, commands shown, gotchas, and examples from the conversation.
   - Prefer concrete examples and commands over vague prose.
   - Choose a descriptive file name matching the vault's naming style; avoid names that clash with existing notes.
   - Place the note where similar notes live (vault root unless folders suggest otherwise).

5. **Report back**
   - Tell the user which file you created and briefly what it covers.
   - Never modify or delete existing notes unless explicitly asked.

## Guidelines

- One topic per note; split unrelated subjects into separate notes only if the user asks.
- If images or attachments would help, save them into the vault's `Attachments/` folder if one exists, and reference them with standard Obsidian embed syntax (`![[name.png]]`).
- Keep the note self-contained — assume a future reader hasn't seen this conversation.
