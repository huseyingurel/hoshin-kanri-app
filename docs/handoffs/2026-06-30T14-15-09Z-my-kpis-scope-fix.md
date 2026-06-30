# HANDOFF SUMMARY

## 1) Mission State

- **Current objective:** Continue the security/technical audit of a friend's Hoshin Kanri app. This session: (a) commit the prior session's pending audit work, (b) diagnose and fix why `/my-kpis` showed no records.
- **Current status:** Both done. Pending audit work committed to a new branch; `/my-kpis` scope bug root-caused and fixed; fix verified live in the browser and via tests. **Branch is local only — not pushed, no PR.** Prod untouched.
- **Definition of done:** Pending changes committed per user's choice (branch); `/my-kpis` shows the logged-in user's department KPIs without weakening scoping; verified.
- **Immediate next best action:** Ask the user whether to push branch `audit/local-setup-and-security-docs` / open a PR. Then optionally tackle remaining open loops (prod RLS lockdown, SESSION_SECRET rotation, plaintext passwords, npm audit) — all still deferred.

## 2) Stable Context (carry forward)

- **Repo path:** `/home/gulp/projects/emploid/hoshin-kanri-app` (session primary dir is parent `/home/gulp/projects/emploid`). Cloned from `https://github.com/huseyingurel/hoshin-kanri-app`.
- **Current branch:** `audit/local-setup-and-security-docs` (created this session off `main`). Working tree clean after commits.
- **Stack:** Next.js **16.2.4** (App Router, RSC + Server Actions, Turbopack), React 19.2.4, Prisma 5.22 (Postgres), Tailwind v4, `@base-ui/react`, Vitest. Dev server **port 3001** (`npm run dev`), currently up.
- **Next.js 16 specifics:** route gate is **`src/proxy.ts`** (renamed middleware; exports `proxy` + `config.matcher`), checks cookie *presence* only, not role. No `prisma/migrations/` — schema via `npx prisma db push`.
- **Auth:** custom JWT (`jose` HS256, httpOnly `session` cookie) in `src/lib/auth.ts`; page guard `getSessionOrRedirect()` in `src/lib/session.ts`. **Passwords PLAINTEXT** (`authActions.ts`: `user.password !== password`).
- **Authorization/data scoping (central design):** `src/lib/domainTypes.ts` (role constants) → `src/lib/access.ts` (predicates) → `src/lib/dataScope.ts` (Prisma where-filters). `ORG_WIDE_ROLES = ADMIN|PMO|EXECUTIVE`; `DEPARTMENT_SCOPED_ROLES = DEPT_HEAD|KPI_OWNER|USER`.
- **Local DB:** Docker `hoshin-pg`, `postgres:16`, host port **5433**→5432, creds `hoshin/hoshin/hoshin`, URL `postgresql://hoshin:hoshin@localhost:5433/hoshin`. POSTGRES_USER `hoshin` is superuser. No volume (data not persisted across container removal). Connect: `PGPASSWORD=hoshin psql -h localhost -p 5433 -U hoshin -d hoshin`.
- **Prod (Supabase):** reachable via **Supabase MCP** (`.mcp.json` at workspace root `/home/gulp/projects/emploid/.mcp.json`, HTTP transport). Use `mcp__supabase__execute_sql` for read queries. Prod creds NOT in repo (Vercel env / Supabase dashboard). Live URL `https://hoshin-kanri-app.vercel.app`.
- **Data facts (prod == local, verified this session):** 37 KPIs, **all with `ownerUserId = NULL`**, all with `responsibleDeptId` set. 2 users, **both `ADMIN`**: `huseyin.gurel@gmail.com` (dept Production, 6 dept KPIs), `burcu` (dept Quality, 4 dept KPIs). `burcu` apparently never logged in to prod.
- **KPI table columns (note exact names):** `ownerUserId`, `responsibleDeptId`, `actionPlanId` — NOT `ownerId`. Verify schema with `\d "KPI"` before querying.
- **Project rules (`AGENTS.md`, Turkish):** small reversible patches; never weaken auth/scoping; don't rewrite; don't change schema arbitrarily; consult `node_modules/next/dist/docs/` before Next.js changes. UI/code is Turkish.
- **Tooling quirk:** a hook rewrites bare commands to `rtk <cmd>`; if it errors (`rtk: No such file`), call the binary directly: `./node_modules/.bin/{tsc,eslint,vitest,prisma}`.

## 3) Progress So Far (what happened)

- **Read latest handoff** `docs/handoffs/2026-06-30T13-53-53Z-supabase-prod-clone-audit.md`. Verified environment intact: dev server `/login` → 200, `hoshin-pg` up, local clone present (`User=2`, `KPI=37`).
- **Asked user** how to commit pending tree (branch vs main vs not) and whether to touch prod. Answers: **Branch + commit**, **Keep prod untouched**.
- **Pre-commit safety scan:** `git check-ignore` (nothing ignored — `.gitignore` already amended), grep for secrets / Supabase project ref → only placeholders (`<ref>`, `<project_ref>`); handoff already committed at `3280a67`.
- **Committed pending audit work** → branch `audit/local-setup-and-security-docs`, commit **`088d2a8`** ("audit: local setup, prod-clone tooling, and security docs"), 9 files: `.gitignore`, `CLAUDE.md`, `package-lock.json`, `src/app/login/page.tsx`, `src/app/meetings/ReviewClient.tsx`, `docs/OPERATIONS.md`, `scripts/pull-prod-db.sh`, `security/README.md`, `security/lockdown-supabase-api.sql`.
- **User report:** logged in as `burcu`, `/my-kpis` shows no records. Investigated.
- **Root-caused** by reading `src/app/my-kpis/page.tsx` + `src/lib/dataScope.ts` + `src/lib/access.ts` and querying local DB:
  - `/my-kpis` calls `personalKpiScopeFilter` directly. Old impl: `OR: [{ownerUserId: u.id}]` + dept clause only if `usesDepartmentalDataScope(role, deptId)` — which returns **false for org-wide roles**.
  - Both users are ADMIN (org-wide) → dept clause dropped; all KPIs have NULL owner → `{ownerUserId}` matches nothing → **0 rows**.
- **Confirmed live (chrome-devtools MCP):** reloaded `localhost:3001/my-kpis`, `evaluate_script` → `showsEmptyState: true`, 0 cards, HTTP 200, session cookie present. Not a crash — faithful empty state.
- **Checked prod (Supabase MCP, read-only):** `kpi_total=37, kpi_with_owner=0, kpi_with_dept=37, users=2`; both ADMIN with dept KPIs (Production 6, Quality 4). **Prod == local** → not a clone artifact; same empty behavior would occur in prod.
- **Compared `/data-entry`:** uses `kpiScopeFilter` (returns `undefined` for org-wide → no filter → sees all 37). This is why records appeared there but not on `/my-kpis`. Classified issue as **logic**, not store/UX.
- **Verified all 3 callers** of `personalKpiScopeFilter`: `/my-kpis` (direct), `kpiScopeFilter` (org-wide short-circuits to `undefined` first), `countermeasureListScopeFilter` (org-wide short-circuits first). Only `/my-kpis` changes for org-wide roles.
- **Applied fix** in `src/lib/dataScope.ts`: replaced the role-gated condition with `if (u.departmentId) or.push({ responsibleDeptId: u.departmentId });` (+ Turkish doc comment). `usesDepartmentalDataScope` import retained (still used by 3 other helpers).
- **Verified fix:** `tsc --noEmit` clean; `vitest run` 7/7 pass; `eslint src/lib/dataScope.ts` clean. Browser reload of `/my-kpis` (now logged in as huseyin, Production) → **6 KPI cards**, empty state gone.
- **Committed fix** → commit **`b46e599`** ("fix(my-kpis): show department KPIs for users with a department"). Working tree clean.

## 4) Effective Strategies (helpful)

- **Compare two surfaces that read the same model via different scope helpers** (`/my-kpis` vs `/data-entry`) to isolate store-vs-logic-vs-UX. Same data + different filter fn = logic bug. Reuse for any "page A empty, page B full" report on this app.
- **Cross-check prod via Supabase MCP `execute_sql` before assuming a local-clone artifact.** One aggregate query (`count(*)` with `FILTER`/subqueries) confirmed prod==local in a single call. Reuse whenever a "local data looks wrong" hypothesis arises.
- **Enumerate all callers of a shared helper before editing it** (`grep -rn personalKpiScopeFilter src/`), then reason about each path's reachability (org-wide short-circuits). Proves the change only widens the intended surface and weakens nothing — satisfies the AGENTS.md "never weaken scoping" invariant.
- **chrome-devtools `evaluate_script` returning a small JSON object** (`{showsEmptyState, cardCount, titles}`) is a cheap, deterministic live assertion — better than screenshots for empty/populated checks.
- **Verify KPI column names with `\d "KPI"`** before writing SQL — guessed `ownerId` failed; real column is `ownerUserId`.

## 5) Pitfalls and Anti-Patterns (harmful)

- **`select_page` requires `pageId` (number), not `pageIdx`.** First call failed validation. Use `list_pages` → pass the integer `pageId`.
- **chrome-devtools tools are deferred** — must `ToolSearch select:...` before use (loaded `list_pages,new_page,navigate_page,take_snapshot,list_network_requests,evaluate_script,select_page`, plus `mcp__supabase__execute_sql`). Batch them in one ToolSearch.
- **The selected browser tab can change between calls** (user navigates). Re-check `list_pages` and re-select the localhost tab before asserting; don't assume the tab index is stable.
- **Guessing Prisma column names** (`ownerId`) → SQL error. Always confirm via `\d`.
- **`rtk` rewrite** breaks bare `tsc`/`eslint`/`vitest`/`prisma`/`npx`; call `./node_modules/.bin/<bin>` directly.
- **Assuming "user can't see records" = data loss.** Here it was correct-by-filter behavior; the empty state was honest. Read the scope helper before suspecting the store.

## 6) Open Loops

- **Push / PR?** Branch `audit/local-setup-and-security-docs` (commits `088d2a8`, `b46e599`) is local only. Blocking: user hasn't said to push. Next probe: ask push + open PR vs keep local.
- **Prod RLS lockdown** (`security/lockdown-supabase-api.sql`) not applied. Blocking: user deferred ("keep prod untouched"). Next probe: when ready, verify nothing uses anon path, then `apply_migration`.
- **Plaintext passwords** unaddressed (needs hashing + re-hash migration; behavior change → own PR).
- **Prod `SESSION_SECRET`** shared into local `.env` — should be rotated in Vercel (invalidates sessions).
- **npm audit:** 14 vulns (1 critical) — not investigated.
- **`ownerUserId` is NULL on all 37 KPIs** — `/my-kpis` ownership clause is dead until owners are assigned (data, eventually prod). The dept-clause fix sidesteps this for now.
- **Login UX:** `burcu` apparently never logged in to prod; verify the login fix (`type=text`) actually lets her in if/when needed.

## 7) Decision Ledger

- **Fix `/my-kpis` by removing the role gate in `personalKpiScopeFilter`** (`if (u.departmentId)`), not by switching the page to `kpiScopeFilter`. Rationale: department membership is intrinsic, not role-gated; strictly widens to the user's *own* department; doesn't make `/my-kpis` show all 37 (keeps "my" semantics distinct from `/data-entry`). Tradeoff: org-wide roles now see their dept's KPIs on `/my-kpis` (a subset of what dashboards already show) — accepted, doesn't weaken scoping.
- **Commit audit work to a feature branch, not main.** Rationale: keep friend's `main` clean; matches "small reversible patches". Tradeoff: needs push/PR step later.
- **Keep prod untouched.** Rationale: explicit user instruction; RLS auto-apply risks breaking anon path. Tradeoff: RLS hole stays open until maintainer acts.
- **Two separate commits** (audit bundle `088d2a8`, then targeted fix `b46e599`). Rationale: isolate the behavior change for reviewability/revertability.

## 8) Delta Update (for memory/playbook)

### Helpful (+)
- [debug-scope] : compare two pages reading same model via different scope helpers to classify store/logic/UX (count: 1)
- [prod-verify] : cross-check prod via Supabase MCP execute_sql before assuming local-clone artifact (count: 1)
- [refactor-safety] : enumerate + reason about all callers of a shared helper before editing to prove scope only widens (count: 1)
- [debug-rsc] : combine RSC source read + devtools/network to distinguish bug vs correct scoping (count: 2)
- [chrome-devtools] : evaluate_script returning small JSON = deterministic live empty/populated assertion (count: 1)
- [sql] : confirm Prisma column names with `\d "Table"` before querying (count: 1)
- [git] : use `git check-ignore -v` to diagnose file-not-showing (count: 1)

### Harmful (-)
- [chrome-devtools] : select_page needs `pageId` (number) not `pageIdx`; tab selection can change between calls — re-list (count: 1)
- [tooling] : `rtk` rewrite breaks `tsc`/`eslint`/`vitest`/`prisma`/`npx`; call `./node_modules/.bin/*` (count: 3)
- [sql] : guessing column names (`ownerId` vs `ownerUserId`) errors; inspect schema first (count: 1)
- [assumption] : "no records visible" ≠ data loss; may be correct filter behavior — read the scope helper (count: 1)
- [supabase] : `list_tables` row counts are stale estimates; use `count(*)` (count: 1)

## 9) Next-Agent Brief

- **Read first:** `CLAUDE.md`, `AGENTS.md` (Turkish rules), this handoff, `src/lib/dataScope.ts` (the scope helpers), `docs/OPERATIONS.md`, `security/README.md`.
- **Ignore:** stray Clerk cookies in browser (unrelated app); `list_tables` row estimates; the `app.emploid.ai` / agentron browser tabs (unrelated to this project).
- **Try first:** confirm dev server alive (`curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/login`); if DB empty, `hoshin-pg` (no volume) may have been removed — re-clone via `docs/OPERATIONS.md` Method B. Then ask the user whether to **push the branch / open a PR**.
- **Success next turn:** clear go/no-go on push+PR; and/or an explicit decision on a deferred open loop (prod RLS, secret rotation, password hashing). Keep prod untouched unless explicitly told.
- **Invariants:** small reversible patches; never weaken auth/scoping (only widen to user's own department); don't touch prod without explicit OK; never commit secrets/dumps; UI/code stays Turkish; consult `node_modules/next/dist/docs/` before Next.js behavior changes.
