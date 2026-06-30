# HANDOFF SUMMARY

Session topic: implement the **governance layer** (Task/Notification/Escalation engine +
Audit/period-lock + Catchball workflow) on `hoshin-kanri-app`, then review + dogfood + doc it.

## 1) Mission State

- **Current objective:** Implement `docs/plans/governance-layer-implementation.md` (3 gaps, 7 phases) on branch `feat/governance-layer` without touching prod.
- **Current status:** ✅ **COMPLETE — 7/7 phases.** Code + tests + docs committed. Branch not merged. Prod untouched.
- **Definition of done:** All 7 phases; INV-1…7 upheld; unit + integration green; acceptance #2/#5/#7 met. **Met.** (Tier-3 Playwright e2e was the one planned item deliberately skipped per user.)
- **Immediate next best action:** Nothing pending — branch is review/merge-ready. If work resumes: optional Playwright e2e (user declined for now), or `prisma migrate` adoption (currently `db push`, N5).

## 2) Stable Context (carry forward)

- **Repo layout:** Implementation lives in the **nested** git repo `/home/gulp/projects/emploid/hoshin-kanri-app` (branch `feat/governance-layer`). The **parent** repo `/home/gulp/projects/emploid` is a docs/coordination repo whose trunk is `main` (the plan + `docs/proposals/gap-analysis.md` live there).
- **Stack:** Next.js **16.2.4** (App Router, RSC, Server Actions, Turbopack), React 19, Prisma 5.22 (Postgres, **`prisma db push`** — no migrations dir), Vitest 3.2.4. Dev server on **port 3001**.
- **Route gate:** `src/proxy.ts` (Next 16's renamed middleware) — cookie *presence* only; real authz is per-query.
- **Auth:** `src/lib/auth.ts` JWT (jose HS256, httpOnly `session` cookie). **Plaintext passwords** (known audit issue). `SESSION_SECRET` required or import throws.
- **Authorization/scoping (central design):** `domainTypes.ts` (role/status constants; `ORG_WIDE_ROLES=ADMIN|PMO|EXECUTIVE`, `DEPARTMENT_SCOPED_ROLES=DEPT_HEAD|KPI_OWNER|USER`) → `access.ts` (`isOrgWideRole`, `canManageSettings`=ADMIN||PMO, `usesDepartmentalDataScope`) → `dataScope.ts` (`hoshinScopeFilter`, `kpiScopeFilter`, `personalKpiScopeFilter`, `taskScopeFilter`, `notificationScopeFilter`, etc.; org-wide → `undefined` = no filter).
- **UI:** shadcn-style in `src/components/ui/` on **`@base-ui/react`** + Tailwind v4. base-ui primitives render own DOM → use **`render` prop** for custom triggers; base-ui `Select` `onValueChange` is `(value: string|null, eventDetails)` (handlers must accept `string|null`).
- **Page pattern:** async server `page.tsx` (`export const dynamic="force-dynamic"`) → `"use client"` `*Client.tsx`. Mutations are `"use server"` actions returning `{success:true}|{success:false;error}`. **All user-facing strings Turkish.** Dates `toLocaleDateString("tr-TR")`.
- **Invariants (load-bearing):** INV-1 audit in same tx; INV-2/3 task/notification idempotency via unique `dedupeKey`; INV-4 scope only widens to user's own dept, never narrows; INV-5 only APPROVED catchball → activatable; INV-6 locked period immutable; INV-7 no silent fallback / fail-closed.
- **Engine modules:** `lib/engine/{calendar,escalation,catchball,audit,tasks,notifications,sweep}.ts`. Writers: `recordAudit(tx,…)`, `upsertSystemTask(tx,…)`, `notify(tx,…)`/`notifyMany`, `applyTransition(tx,…)`, `diff(before,after,fields)`. Catchball matrix: DRAFT→[IN_REVIEW], IN_REVIEW→[REVISED,AGREED,REJECTED], REVISED→[IN_REVIEW,AGREED], AGREED→[APPROVED,IN_REVIEW], APPROVED→[], REJECTED→[DRAFT].
- **Tests:** `npm test` (unit, no DB) = **67**; `npm run test:int` (`.itest.ts`, needs `hoshin_test` DB) = **41**; `npm run test:all`. Integration uses `.env.test` (gitignored), `globalSetup` does `prisma db push` once, `setup` TRUNCATEs all `public` tables before each test; serial (`fileParallelism:false`).
- **Cron:** `POST /api/cron/sweep`, `Authorization: Bearer $CRON_SECRET`. Unset secret → 500 (fail-closed). Returns `{ranAt,scanned,generated,notified,escalated,skipped,failures[]}`.
- **Tooling:** `rtk` hook may rewrite bare commands; if it errors use `./node_modules/.bin/<bin>` directly. **IDE "new-diagnostics" for Prisma fields/delegates are STALE TS-server cache** — `./node_modules/.bin/tsc --noEmit` on disk is authoritative.
- **chrome-devtools MCP** runs in Docker container `sg-chrome-devtools` (image `0bb777c1659c`), **no bind mount** — `take_snapshot {filePath}` saves *inside the container*; read it back with `docker exec sg-chrome-devtools sh -lc 'cat <path>'`. (Use chrome-devtools, NOT claude-in-chrome.)
- **Dev DB state (left intentionally):** ADMIN login `huseyin.gurel@gmail.com` (plaintext pw in DB), tenant data (37 KPIs, 6 Hoshins). Dogfood rows kept: ~187 sweep tasks, Hoshin "H1 – OEM…" catchballStatus=IN_REVIEW (+ item + audit), 1 read notification. `.env` has `CRON_SECRET=dogfood-local-secret` (gitignored).

## 3) Progress So Far (what happened)

- **Phases 1–5** were complete on entry (commits 38fc092, d654188, a74c0e4, be21274, 983674c, 398023d, 6e15893). Discovered Phase 4 already delivered `taskScopeFilter`, `notificationScopeFilter`, agenda `overdueTasks`, transactional `createDecision`.
- **Phase 6 (UI)** → commit **5f93a84**: 3 action files (`taskActions`, `notificationActions`, `catchballActions`), `my-tasks` rewrite, notifications inbox + sidebar Bell badge (async root layout), `/audit` viewer (ADMIN/PMO, client-side filters + field diffs), `CatchballThread` on `/strategy`, meetings agenda overdue tasks (G7). Verified tsc/build/67 unit/37 int green.
- **Runtime error reported twice:** `Cannot read properties of undefined (reading 'count')` at `getUnreadCount` → `prisma.notificationLog` undefined. **Root cause:** dev-only **stale singleton** — `src/lib/prisma.ts` caches client on `globalThis.prismaGlobal` to survive HMR; the long-running dev server held a pre-`NotificationLog` client class. **HMR can't clear it; only full process restart wipes `globalThis`.** Fixed by `kill` + fresh `npm run dev` (verified `/login` 200, clean log).
- **Layout resilience fix** → commit **f2cf6dd**: wrapped root-layout Prisma calls in try/catch that `logEvent("error",…)` (not silent, INV-7) + safe defaults (badge/audit-nav hidden), so a non-essential query can't 500 every route.
- **Fresh-eyes review of Phases 4–6** → commit **4e97c4f**: (a) **Catchball IDOR fix** — added `canAccess(scope,entityType,entityId)` to `getThread`/`postCatchball`/`transitionCatchball` (org-wide=all; dept-scoped=own/dept only, INV-4) + `catchballActions.itest.ts` (4 tests). (b) my-tasks: `router.refresh()` on status change so columns re-group; MANUAL tasks labelled "Elle Görev".
- **Dogfooding via chrome-devtools (real dev DB):** sweep generated **187 tasks**, re-run idempotent (generated 0, skipped 188); my-tasks renders grouped; notifications markRead clears badge; **catchball DRAFT→IN_REVIEW driven through UI** (verified status+CatchballItem+AuditLog TRANSITION in DB); audit viewer + actor filter work.
- **Dogfooding found a bug (G7)** → commit **1872433**: sweep's `OVERDUE_FOLLOWUP` tasks were created with `dueDate=null`, so they never matched the agenda's `dueDate < now` filter → overdue agenda silently empty for the most common overdue source. Fix: carry source `cm.dueDate`/`d.dueDate` onto the follow-up task. Re-demoed live (agenda populated). Regression assertion added to `sweep.itest.ts`.
- **Phase 7 (Docs)** → commit **f2cddae** (`OPERATIONS.md`: CRON_SECRET, sweep section, test-DB section) + parent-repo commit **be04cd6** (`gap-analysis.md`: status banner, flipped 3 gaps + acceptance #2/#5/#7, 3/7→5/7, FR-13 frequencies largely closed).
- Produced an HTML status report (`scratchpad/governance-status.html`) and `xdg-open`ed it at user request (ephemeral, not committed).
- **Final tallies:** `tsc --noEmit` EXIT 0; **67 unit + 41 integration** green; `next build` clean.

## 4) Effective Strategies (helpful)

- **`tsc --noEmit` as source of truth over IDE diagnostics.** The new-diagnostics for Prisma delegates/fields are stale TS-server cache; on-disk tsc returns 0. Reuse: ignore inline Prisma "does not exist" noise, trust tsc/build.
- **Snapshot-to-container-file + `docker exec cat` for huge pages.** The 187-row `/my-tasks` page was too big to snapshot into context; saving via `filePath` then reading inside `sg-chrome-devtools` gave element uids without flooding context. Reuse for any large a11y snapshot.
- **Driving governance writes through *plain-button* UI flows** (catchball) proved the full UI→action→engine→DB+audit path reliably; verify the DB side with a `node -e` Prisma query.
- **Re-running the sweep twice** is the canonical idempotency proof (generated N then 0 / skipped N+1).
- **Per-phase: commit, then ask whether to proceed vs review.** Kept scope controlled and surfaced the review that found the IDOR + layout fragility.
- **Reusing existing scope-filter helpers** (`hoshinScopeFilter`, `personalKpiScopeFilter`) inside `canAccess` kept the IDOR fix INV-4-compliant and small.

## 5) Pitfalls and Anti-Patterns (harmful)

- **Stale Prisma singleton on `globalThis` after `prisma generate`.** A running dev server keeps the old client class across HMR; symptom is `prisma.<newModel>` undefined at runtime while tsc/tests pass. **Always full-restart the dev server after schema/generate changes** — file-save/HMR won't fix it.
- **Programmatic `.click()` on base-ui `Select` options does NOT trigger selection.** base-ui needs trusted pointer events; the portaled popup also opens/auto-closes faster than `take_snapshot` captures, so the real `click` tool + snapshot timing is flaky. Not an app bug. Don't rabbit-hole on it; prove the write path via plain-button flows + DB assertions instead.
- **Async root layout calling Prisma on every render is a global blast radius** — any failure 500s every route. Mitigated with try/catch+log+safe-defaults; keep non-essential layout queries defensive.
- **New unscoped server actions are an IDOR risk even when "consistent with existing code."** Catchball actions originally trusted any `entityId`. Scope-guard net-new mutation surfaces.
- **Sweep system tasks default to `dueDate=null`**, which silently excludes them from `dueDate < now` agenda/overdue queries. When a task represents an overdue source, propagate the source's dueDate.
- **`cd` then `node -e` requiring `@prisma/client`:** the Bash tool's cwd can reset to the parent repo (where deps aren't installed) → MODULE_NOT_FOUND. Always `cd /home/gulp/projects/emploid/hoshin-kanri-app && node -e …` in one command.

## 6) Open Loops

- **Tier-3 Playwright e2e** — not built. Blocking reason: new dep `@playwright/test` + browser-binary download + dev server vs `.env.test`; **user explicitly declined for now** ("leave e2e now"). Next probe: only if user opts in.
- **base-ui Select status write** unverified *via automated browser* (verified by integration test + manual reasoning). Next probe: human click test, or keyboard-driven (`press_key`) automation.
- **Frequency UI (FR-13):** engine supports HALF_YEAR/ANNUAL but the data-entry dropdown options were not confirmed to expose them. Next probe: inspect the data-entry frequency `<Select>` options before relying end-to-end.
- **Branch not merged**; prod still lacks governance layer. No merge requested.
- **Email/SMTP (N1), file upload (N2), prisma migrate (N5)** remain out of scope by design.

## 7) Decision Ledger

- **Decision:** Put this handoff + `OPERATIONS.md` in `hoshin-kanri-app/docs/` on `feat/governance-layer`; put `gap-analysis.md` update in parent repo `main`. **Rationale:** handoff/ops travel with the code branch; gap-analysis is a parent-repo coordination doc whose trunk is main (all prior governance docs went there). **Tradeoff:** handoff split across two repos.
- **Decision:** Scope-guard catchball (don't leave collaborative cross-dept open). **Rationale:** "never weaken scoping" + audited repo. **Tradeoff:** dept-scoped users can't act on out-of-scope entities even if catchball is conceptually cross-level; org-wide roles unrestricted preserves negotiation intent.
- **Decision:** Fix G7 by copying source dueDate onto follow-up task. **Rationale:** makes acceptance #5 actually work for sweep items. **Tradeoff:** next sweep treats that follow-up as overdue and re-notifies assignee+manager (idempotent, deemed acceptable/consistent).
- **Decision:** Layout degrades gracefully (log + safe defaults) instead of failing. **Rationale:** non-essential adornment shouldn't 500 the app. **Tradeoff:** would mask a future DB issue on those two queries — accepted because it's logged (INV-7 respected).
- **Decision:** Keep dogfood data + skip e2e. **Rationale:** explicit user instruction.
- **Decision:** Client-side filtering for `/audit` (fetch last 500). **Rationale:** POC simplicity, avoids round-trips. **Tradeoff:** caps at 500 rows.

## 8) Delta Update (for memory/playbook)

### Helpful (+)
- [prisma-dev] : after `prisma generate`/schema change, full-restart the dev server — `globalThis` singleton survives HMR (count: 2)
- [verification] : on-disk `tsc --noEmit` is authoritative; ignore stale IDE Prisma diagnostics (count: 4)
- [browser-mcp] : snapshot to `filePath` then `docker exec sg-chrome-devtools cat` to read huge a11y trees without context flood (count: 3)
- [idempotency] : prove sweep idempotency by running twice (generated N → 0 / skipped N+1) (count: 2)
- [security] : scope-guard net-new server actions with existing dataScope helpers (org-wide=all, dept=own/dept; INV-4) (count: 1)
- [dogfood] : drive governance writes via plain-button UI flows, verify with `node -e` Prisma query (count: 2)
- [workflow] : commit per phase, then ask proceed-vs-review (count: 1)

### Harmful (-)
- [browser-mcp] : programmatic `.click()` on base-ui Select options never registers (needs trusted events); popup auto-closes before snapshot (count: 3)
- [architecture] : async root layout querying Prisma 500s every route on any failure — wrap defensively (count: 1)
- [engine] : sweep system tasks default `dueDate=null` → excluded from overdue/agenda `dueDate<now` queries (count: 1)
- [bash] : `node -e` requiring deps after cwd reset to parent repo → MODULE_NOT_FOUND; cd app dir in same command (count: 1)
- [security] : net-new actions trusting caller `entityId` = IDOR even if "consistent with existing code" (count: 1)

## 9) Next-Agent Brief

- **Read first:** `docs/plans/governance-layer-implementation.md` (the plan), this handoff, `hoshin-kanri-app/CLAUDE.md` + `AGENTS.md` (hard rules), `docs/OPERATIONS.md` (cron + test DB).
- **Ignore:** inline IDE "Property does not exist on PrismaClient/…" diagnostics (stale cache). The ephemeral `scratchpad/governance-status.html`.
- **Try first (if resuming):** run `npm run test:all` (needs `hoshin_test` DB per OPERATIONS.md) to confirm 67+41 green; `./node_modules/.bin/tsc --noEmit` for EXIT 0. If touching the dev server, **kill + restart fully** (stale-singleton trap).
- **Success next turn:** any new governance code keeps INV-1…7, is scoped via `dataScope.ts` helpers, audited in the same tx, Turkish strings, tests green. Don't merge to prod or run destructive DB ops without explicit user OK. Don't churn create/delete (names matter on the platform side, not this Postgres app — but still avoid).
