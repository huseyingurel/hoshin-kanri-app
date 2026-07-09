# Agent Memory

Operational memory for Claude, Codex, and other coding agents working in this repository.

## Scope

This is the `hoshin-kanri-app` worktree:

```bash
/home/gulp/projects/emploid/hoshin-kanri-app/feat-governance-layer
```

The wrapper/bare-repo root is one directory up:

```bash
/home/gulp/projects/emploid/hoshin-kanri-app
```

The parent migration coordination repo is separate:

```bash
/home/gulp/projects/emploid/main
```

Use this file for operational rules only. Product, architecture, setup, and domain details
belong in `README.md`, `docs/OPERATIONS.md`, `security/README.md`, or other project docs.

## Read Order

Before substantial work:

1. `.agents/memory.md`
2. `.agents/protocol.md`
3. `.agents/checkpoints/active.json`
4. `README.md`
5. Relevant docs, source files, and tests for the task

For platform migration context, read the parent repo:

1. `/home/gulp/projects/emploid/main/AGENTS.md`
2. `/home/gulp/projects/emploid/main/CLAUDE.md`
3. `/home/gulp/projects/emploid/main/docs/hoshin-migration.md`

## Working Rules

- Do not rewrite the app or make broad architecture changes without explicit direction.
- Keep patches small, reversible, and reviewable.
- Read relevant files before editing them.
- Preserve existing user flows and Hoshin Kanri behavior.
- If a business rule is unclear, report the ambiguity instead of inventing a rule.
- Do not change Prisma schema, Vercel assumptions, or deployment behavior casually.
- Do not add dependencies unless they are necessary and justified.
- UI, comments, and user-facing app strings are Turkish; match that when editing app surfaces.

## Security Rules

- Never commit `.env`, API keys, tokens, session cookies, private keys, database URLs, prod dumps,
  clone SQL, or credential-bearing debug notes.
- Do not weaken authentication, authorization, or data-scope logic.
- Client-side filtering is not sufficient for access control.
- Server Actions and database/API queries must enforce server-side access checks.
- Use existing access/scope helpers rather than ad hoc authorization filters.

## Checkpoint Rules

- Keep live resume state in `.agents/checkpoints/active.json`.
- Put long handoffs under `.agents/handoffs/`.
- Use `$handoff` when asked for a checkpoint, handoff, resume state, or session summary.
- Repo-local handoff skills live at:
  - `.codex/skills/handoff/SKILL.md`
  - `.claude/skills/handoff/SKILL.md`
- Update the checkpoint after meaningful branch, implementation, verification, or handoff changes.
- Do not put secrets in checkpoint or handoff files.

## Verification Rules

- Before claiming completion, record the exact verification command and result.
- For documentation-only or operational-memory-only updates, say that no runtime tests were required.
- Run `git diff --check` after documentation or memory edits.
- For code changes, start with focused tests, then broaden to `npm test`, `npm run test:int`,
  `npm run build`, or lint based on risk and blast radius.

## Next.js Rule

This project uses a very new Next.js version. Before changing Next.js routing, App Router,
Server Actions, caching, proxy, or build behavior, inspect the local docs:

```bash
node_modules/next/dist/docs/
```

The route gate is `src/proxy.ts`, not legacy `middleware.ts`.

## Tooling Notes

- A local hook may rewrite bare commands to `rtk <cmd>`. If that fails, run binaries directly,
  for example `./node_modules/.bin/prisma db push`.
- Stale IDE Prisma diagnostics are not authoritative. Verify with `tsc`, tests, or build.
