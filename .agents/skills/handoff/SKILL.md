---
name: handoff
description: >
  Create or update the repo-scoped agent checkpoint and handoff for this
  Hoshin Kanri app workspace. Use when the user asks for a handoff,
  checkpoint, resume state, context checkpoint, or session summary.
license: MIT
metadata:
  author: gulp
  version: "1.0.0"
allowed-tools: Read Grep Glob Bash Edit Write
---

# Handoff

Use this skill to preserve high-fidelity context for the next agent without turning
`AGENTS.md` or `CLAUDE.md` into session diaries.

## Scope

This app repo uses a two-layer checkpoint convention:

- Machine-readable live state: `.agents/checkpoints/active.json`
- Human-readable trajectory: `.agents/handoffs/YYYY-MM-DDTHH-MM-SSZ-slug.md`

Do not record secrets, session cookies, API keys, database URLs, private tokens, prod
dumps, or clone SQL.

## Process

Use a strict 3-stage process:

1. **Generator:** reconstruct the actual trajectory: objective, attempts, dead ends,
   results, assumptions, verification, and unresolved items.
2. **Reflector:** identify effective strategies, harmful patterns, noisy context,
   constraints, missing information, and required verification gates.
3. **Curator:** update `.agents/checkpoints/active.json` and write a new Markdown
   handoff under `.agents/handoffs/`.

Summarize conclusions and decisions only. Do not include private chain-of-thought.

## Verification And Commit

After writing files:

1. Run `git diff --check`.
2. Run `git status --short`.
3. Do not commit unless the user explicitly asked to commit.

For documentation-only handoffs, no runtime tests are required. Record that fact in
`active.json`.
