# Agent Checkpoint Protocol

This repo uses a lightweight local checkpoint layer for Claude/Codex continuity.

## Read Order

Before substantial work, read:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.agents/checkpoints/active.json`
4. The relevant plan, operation doc, security note, handoff, or source files for the task

If work crosses into the parent coordination repo, also read:

- `/home/gulp/projects/emploid/main/AGENTS.md`
- `/home/gulp/projects/emploid/main/CLAUDE.md`
- `/home/gulp/projects/emploid/main/docs/hoshin-migration.md`

## Checkpoint Rules

- Keep `AGENTS.md` and `CLAUDE.md` as stable operational entrypoints, not session diaries.
- Store machine-readable resume state in `.agents/checkpoints/active.json`.
- Store human-readable trajectory in `.agents/handoffs/`.
- Treat checkpoints as a resume contract:
  - Where are we?
  - What is proven?
  - What failed?
  - What is next?
  - What must not be repeated?
  - Which verification gate is required before claiming done?
- Do not record secrets, session cookies, API keys, database URLs, private tokens, prod dumps, or clone SQL.
- Prefer exact paths, branch names, commits, commands, and verifier results over vague status.

## Update Cadence

Update `.agents/checkpoints/active.json` after meaningful state changes:

- branch/worktree changes
- completed implementation, verification, documentation, or migration phases
- failed or passed verification gates
- newly discovered platform/API/runtime invariant
- explicit handoff to another agent

Write a new `.agents/handoffs/YYYY-MM-DDTHH-MM-SSZ-slug.md` when ending a complex session
or when the next agent would otherwise need conversation history to continue safely.

## Verification

Never claim completion from memory. Record the exact verification command and result in the
checkpoint. If no command was run because the change is documentation-only, state that
explicitly.
