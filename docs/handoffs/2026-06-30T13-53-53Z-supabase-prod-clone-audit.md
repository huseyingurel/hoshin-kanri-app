# HANDOFF SUMMARY

## 1) Mission State

- **Current objective:** Help a friend's Hoshin Kanri app (Next.js 16 + Prisma + Supabase/Vercel) — get it running locally, clone prod data, and document ops/security. Project is under technical/security audit (not a rewrite).
- **Current status:** App runs locally on a full prod data clone. Two UI/auth bugs fixed. Ops + security documented. Prod left untouched. **All changes uncommitted except** the handoff commit being made now.
- **Definition of done:** App runnable locally w/ realistic data; ops/security captured in repo; prod safe.
- **Immediate next best action:** Decide whether to commit the working-tree changes (dialog fix, login fix, CLAUDE.md, `docs/`, `security/`, `scripts/pull-prod-db.sh`) — currently uncommitted. Optionally apply `security/lockdown-supabase-api.sql` to prod (user deferred).

## 2) Stable Context (carry forward)

- **Repo path:** `/home/gulp/projects/emploid/hoshin-kanri-app` (cloned from `https://github.com/huseyingurel/hoshin-kanri-app`). Note the session's primary working dir is the parent `/home/gulp/projects/emploid`.
- **Stack:** Next.js **16.2.4** (App Router, RSC + Server Actions, Turbopack), React 19.2.4, Prisma 5.22 (Postgres), Tailwind v4, `@base-ui/react`, Vitest. Dev server on **port 3001** (`npm run dev`).
- **Next.js 16 specifics:** middleware was renamed → **`src/proxy.ts`** (exports `proxy` + `config.matcher`); it only checks session-cookie *presence*, not role. No `prisma/migrations/` — schema applied via `npx prisma db push`.
- **Auth:** custom JWT via `jose` HS256 in httpOnly `session` cookie (`src/lib/auth.ts`); `getSessionOrRedirect()` in `src/lib/session.ts`. **Passwords are PLAINTEXT** (`src/app/actions/authActions.ts`: `user.password !== password`).
- **Authorization/data scoping:** `src/lib/domainTypes.ts` (role constants) → `src/lib/access.ts` (predicates) → `src/lib/dataScope.ts` (Prisma where-filters). Org-wide roles = ADMIN/PMO/EXECUTIVE (no filter); dept-scoped = DEPT_HEAD/KPI_OWNER/USER (own + department).
- **Local DB:** throwaway Docker `hoshin-pg`, `postgres:16`, host port **5433** → 5432, creds `hoshin/hoshin/hoshin`. URL `postgresql://hoshin:hoshin@localhost:5433/hoshin`. POSTGRES_USER `hoshin` is a **superuser** (needed for `SET session_replication_role`). Data NOT persisted to a volume.
- **`.env`** (gitignored) currently: both DB URLs → local docker; `SESSION_SECRET="<REDACTED: prod SESSION_SECRET — value in local .env only>"` (the real prod secret, from friend's commented-out `.env`).
- **Prod (Supabase):** project ref `<project_ref>`, URL `https://<project_ref>.supabase.co`. Reachable via **Supabase MCP** (`.mcp.json` at workspace root `/home/gulp/projects/emploid/.mcp.json`, HTTP transport). Prod creds NOT in repo (live in Vercel env vars / Supabase dashboard). Friend's shared `.env` had **empty** DB URLs.
- **Prod users (now cloned locally, plaintext pw):** `huseyin.gurel@gmail.com`/`<redacted>` (ADMIN, dept Production); `burcu`/`<redacted>` (ADMIN, dept Quality).
- **Project rules (`AGENTS.md`, Turkish):** small reversible patches; never weaken auth/scoping; don't rewrite; don't change schema arbitrarily; consult `node_modules/next/dist/docs/` before Next.js changes. UI/code is Turkish.
- **Tooling quirk:** a hook may rewrite bare commands to `rtk <cmd>`; if it errors (`rtk: No such file`), run the binary directly (e.g. `./node_modules/.bin/prisma`).

## 3) Progress So Far (what happened)

- **Cloned repo, `npm install`** → 14 npm-audit vulns (1 critical). `npm test` → 7/7 pass (only `src/lib/kpiRag.test.ts`).
- **Stood up local DB:** `docker run ... hoshin-pg ... -p 5433:5432 postgres:16`; wrote `.env`; `npx prisma db push` (after `rtk` hiccup, used `./node_modules/.bin/prisma`); `npx tsx prisma/seed.ts`; `npx tsx scripts/create-user.ts` (created admin). Dev server up, `/login` → 200.
- **Fixed hydration error** in `src/app/meetings/ReviewClient.tsx` (~line 242): `<DialogTrigger>` wrapping `<Button>` produced nested `<button>`. Switched to base-ui `render` prop: `<DialogTrigger render={<Button .../>}>...children...</DialogTrigger>`. `tsc --noEmit` clean.
- **Wrote `CLAUDE.md`** (replaced 1-line `@AGENTS.md` stub) documenting commands + architecture; later added pointers to `docs/OPERATIONS.md` and `security/README.md`.
- **Browser investigation of `/my-kpis`** via chrome-devtools: single `GET /my-kpis → 200` HTML (RSC, server-side Prisma; **no browser→DB/Supabase calls**). Empty state ("no KPIs") was correct: logged-in admin owned 0 KPIs and (originally) had no department; `/my-kpis` uses `personalKpiScopeFilter` (own + dept only). Found stray **Clerk cookies** in Chrome from an unrelated project (app does NOT use Clerk).
- **Investigated prod config:** no `vercel.json`/`.vercel`/committed secrets; CI (`.github/workflows/ci.yml`) only lint+test (Vercel auto-deploys). Remote branch `codex-review-01` exists.
- **Added Supabase MCP** (user-supplied): `claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<project_ref>"`. Initially written to `hoshin-kanri-app/.mcp.json`; **moved to parent** `/home/gulp/projects/emploid/.mcp.json` per user. `/reload-plugins` did NOT approve it; required restart + `/mcp` OAuth. User confirmed connected.
- **Cloned prod → local (Method B, no DB password):** `list_tables` showed stale 0-row estimates; real `count(*)` via `execute_sql` gave true counts. Pulled all 11 tables, then generated reload SQL on prod with one query using `format('INSERT INTO %I SELECT * FROM json_populate_recordset(NULL::%I, $json$%s$json$);', ...)`. Result (65k chars) exceeded context → auto-saved to a tool-results file. Extracted via python (parsed outer JSON → inner untrusted-data array → `[0].sql`), wrapped in `BEGIN; SET session_replication_role=replica; TRUNCATE ... CASCADE; <inserts>; SET session_replication_role=DEFAULT; COMMIT;`, ran with `psql`. **Local counts now exactly match prod:** Department 15, User 2, Hoshin 6, MajorTask 38, ActionPlan 38, KPI 37, KPIPeriodRecord 5, Countermeasure 2, Review 5, Decision 6, SystemSetting 2.
- **Set local `SESSION_SECRET`** to prod value; deleted scratchpad `prod_clone.sql`; restarted dev server (now running as background task id `boj23hnud`); `/login` → 200.
- **Wrote `security/lockdown-supabase-api.sql`** (RLS enable + revoke anon/authenticated grants) and **`security/README.md`** (3 findings) and **`docs/OPERATIONS.md`** (runbook). Did NOT apply to prod.
- **Fixed login validation:** user couldn't log in as `burcu` (HTML5 `type="email"` rejected non-email). Changed `src/app/login/page.tsx:49` `type="email"` → `type="text"` (server action does no email-format check). Chose "allow non-emails" over renaming the user.

## 4) Effective Strategies (helpful)

- **Read RSC page source + chrome-devtools network together:** confirmed `/my-kpis` is server-rendered and "empty" was correct scoping behavior, not a bug. Reuse for any "page shows nothing" report on this app.
- **MCP-only prod clone via `json_populate_recordset`:** pull data as JSON, let Postgres emit type-safe INSERTs keyed off the table rowtype (no column lists, no manual escaping). Wrap in `session_replication_role=replica` + `TRUNCATE CASCADE` to ignore FK order. Robust for full clones without a DB password. Reuse whenever only MCP/SQL access is available.
- **Large MCP results auto-save to file:** when `execute_sql` output exceeds context, it's written to `tool-results/*.txt`; process it with python slicing — never reload into context. Keeps bulk data out of the conversation.
- **`git check-ignore -v <file>`** instantly revealed the `*.md` rule hiding docs. Use before assuming a write failed.
- **base-ui `render` prop** is the canonical fix for "button inside button" / nested-primitive hydration errors.

## 5) Pitfalls and Anti-Patterns (harmful)

- **`rtk` command rewriting:** bare `npx prisma`/`prisma` got rewritten and failed with `rtk: No such file or directory`. Avoid by calling `./node_modules/.bin/<bin>` directly.
- **Backgrounding the dev server via `(npm run dev &)` in a Bash tool call:** process died when the tool call ended. Use the Bash tool's `run_in_background: true` instead (gave task id `boj23hnud`).
- **`list_tables` row counts are stale estimates** (showed 0 / wrong values). Always confirm with `SELECT count(*)`.
- **Relaying cloned rows through the conversation** is token-expensive and error-prone. Route bulk data file→file→`psql`, never through model context.
- **`.gitignore` has a broad `*.md` ignore** (line 49, only `!README.md` excepted) — new docs (`docs/OPERATIONS.md`, handoffs) are invisible to git; already-tracked `.md` (CLAUDE.md) still shows. Use `git add -f` or add un-ignore exceptions.
- **Assuming friend's `.env` had prod creds:** it didn't (DB URLs empty); only `SESSION_SECRET` was useful. Don't assume shared dotfiles contain connection strings — Vercel holds them.

## 6) Open Loops

- **Uncommitted working tree:** dialog fix, login fix, CLAUDE.md, `.gitignore`, `package-lock.json`, `docs/OPERATIONS.md`, `security/*`, `scripts/pull-prod-db.sh` are all uncommitted. Blocking reason: user hasn't said to commit them. Next probe: ask whether to commit (and on `main` or a branch).
- **Prod RLS fix not applied (user deferred "leave prod for now").** Next probe: when ready, optionally verify nothing uses the anon API path, then run `security/lockdown-supabase-api.sql` via MCP `apply_migration`.
- **Plaintext passwords** unaddressed (needs hashing code change + re-hash migration; behavior change → PR).
- **Prod `SESSION_SECRET` shared around** — should be rotated in Vercel (invalidates sessions).
- **`docs/OPERATIONS.md` is gitignored** by `*.md` — won't be committed unless force-added or `.gitignore` amended.
- **npm audit:** 14 vulns (1 critical) — not investigated.

## 7) Decision Ledger

- **Allow non-emails in login** (`type=text`) instead of renaming `burcu`. Rationale: matches real prod login values, fixes all such accounts, minimal/reversible. Tradeoff: input still labeled "E-posta".
- **Clone prod via MCP (Method B), not pg_dump.** Rationale: no DB password available. Tradeoff: more steps; relies on superuser local role for `session_replication_role`.
- **Supabase MCP at project scope, moved to parent dir.** Rationale: user wanted it at the session project root. Tradeoff: project-scoped servers need approval + restart.
- **Do not touch prod.** Rationale: explicit user instruction + Supabase advisor warns against auto-applying RLS (could break anon path). Tradeoff: critical RLS hole stays open until maintainer acts.
- **Match local `SESSION_SECRET` to prod.** Rationale: mirror prod auth locally. Tradeoff: prod secret now in local `.env` (gitignored).

## 8) Delta Update (for memory/playbook)

### Helpful (+)
- [prod-clone] : MCP JSON pull + `json_populate_recordset` + `session_replication_role=replica` + TRUNCATE CASCADE = passwordless full clone (count: 1)
- [big-output] : oversized MCP results auto-save to tool-results file; process via python slicing, keep out of context (count: 2)
- [debug-rsc] : combine RSC source read + devtools network to distinguish bug vs correct scoping (count: 1)
- [base-ui] : use `render` prop to fix nested-button hydration errors (count: 1)
- [git] : `git check-ignore -v` to diagnose "file not showing in git" (count: 1)

### Harmful (-)
- [shell] : `(cmd &)` in a Bash tool call dies on call end; use run_in_background (count: 1)
- [tooling] : `rtk` rewrite breaks `prisma`/`npx`; call `./node_modules/.bin/*` directly (count: 2)
- [supabase] : `list_tables` row counts are stale estimates; use `count(*)` (count: 1)
- [assumption] : shared `.env` files may lack prod connection strings (Vercel holds them) (count: 1)
- [gitignore] : broad `*.md` ignore hides new docs from git (count: 1)

## 9) Next-Agent Brief

- **Read first:** `CLAUDE.md`, `docs/OPERATIONS.md`, `security/README.md`, `AGENTS.md` (Turkish rules).
- **Ignore:** stray Clerk cookies in the browser (unrelated app); `seed.log` (old Windows trace); `list_tables` row estimates.
- **Try first:** confirm dev server alive (`curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/login`; background task `boj23hnud`); if DB empty, the local Docker `hoshin-pg` may have been removed (no volume) — re-clone via `docs/OPERATIONS.md` Method B. Then ask the user whether to commit the pending working-tree changes.
- **Success next turn:** pending changes committed per user's choice (branch vs main), and/or a clear go/no-go on applying the prod RLS lockdown. Keep prod untouched unless explicitly told.
- **Invariants:** small reversible patches; never weaken auth/scoping; don't touch prod without explicit OK; never commit secrets/dumps; UI/code stays Turkish.
