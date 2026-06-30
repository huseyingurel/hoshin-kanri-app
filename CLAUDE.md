# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context & rules

Read **`AGENTS.md`** first — it defines the project mission (a Hoshin Kanri app under
security/technical audit, *not* a rewrite) and hard rules: make small reversible patches,
never weaken auth/authorization/data-scoping, never commit credentials, and do not change
the Prisma schema arbitrarily. The improvement priority order (build stability → runtime →
auth/session → authorization & data scope → Prisma consistency → seed/scripts → KPI/RAG →
Excel import → tests → lint → UI → refactor) lives there too.

The codebase, comments, and UI are in **Turkish**. Match that when editing user-facing strings.

For local setup, running, and cloning prod data, see **`docs/OPERATIONS.md`**. For the
security audit findings and the prod RLS remediation, see **`security/README.md`**.

## Commands

```bash
npm run dev        # dev server on port 3001 (Turbopack)
npm run build      # next build
npm start          # serve production build on port 3001
npm run lint       # eslint
npm test           # vitest run (one-shot)
npm run test:watch # vitest watch
npx vitest run src/lib/kpiRag.test.ts   # run a single test file
```

Database / data setup (require a Postgres reachable via `DATABASE_URL` in `.env`):

```bash
npx prisma db push           # sync schema to DB (no migration history)
npx tsx prisma/seed.ts       # seed demo departments/users/hoshin/KPIs
npx tsx scripts/create-user.ts   # upsert an ADMIN login
npx tsx scripts/import-excel.ts  # Excel (xlsx) import
npx tsx scripts/check-db.ts      # quick DB connectivity check
```

`.env` requires `DATABASE_URL`, `DIRECT_URL` (Postgres), and `SESSION_SECRET` (JWT signing
key — `auth.ts` throws at import time if missing). `postinstall` runs `prisma generate`.

> Note: a tooling hook may rewrite bare commands to `rtk <cmd>`; if a command fails with an
> `rtk` error, run the binary directly (e.g. `./node_modules/.bin/prisma db push`).

## Architecture

Next.js 16 **App Router** with React Server Components and Server Actions. Pages are
async server components (`src/app/<route>/page.tsx`) that fetch data and render a `"use client"`
component (`*Client.tsx`) for interactivity. Mutations are Server Actions in
`src/app/actions/*.ts` (`"use server"`). Most pages set `export const dynamic = "force-dynamic"`.

This is a **very new Next.js** (see `AGENTS.md`): consult `node_modules/next/dist/docs/` before
changing Next.js behavior. Notably, the route gate is **`src/proxy.ts`** — Next.js 16's renamed
replacement for `middleware.ts` (exports `proxy` + `config.matcher`).

### Auth & session
- `src/lib/auth.ts` — JWT via `jose` (HS256, 24h), stored in an httpOnly `session` cookie.
  `encrypt`/`decrypt`/`getSession`/`logout`.
- `src/lib/session.ts` — `getSessionOrRedirect()` is the standard page-level guard.
- `src/proxy.ts` — only checks cookie *presence* to allow/deny routes (public: `/login`,
  `/api/auth`); it does **not** validate roles. Real authorization happens per query (below).
- Login: `actions/authActions.ts` `loginAction`. **Passwords are compared in plaintext**
  (`user.password !== password`) — a known audit issue; do not assume hashing exists.

### Authorization & data scoping (the central design)
Role-based row-level filtering is layered and must be applied **server-side** on every query:
1. `src/lib/domainTypes.ts` — single source of truth for role and status string constants.
   `ORG_WIDE_ROLES = ADMIN | PMO | EXECUTIVE`; `DEPARTMENT_SCOPED_ROLES = DEPT_HEAD | KPI_OWNER | USER`.
2. `src/lib/access.ts` — role predicates (`isOrgWideRole`, `canManageSettings`,
   `usesDepartmentalDataScope`).
3. `src/lib/dataScope.ts` — builds Prisma `where` filters from a `UserScope` ({id, role, departmentId}).
   Org-wide roles return `undefined` (no filter = see everything); department-scoped roles see
   their own records **plus** their department's. Use the right helper per surface, e.g.
   `kpiScopeFilter` (dashboards/reports), `personalKpiScopeFilter`, `countermeasureListScopeFilter`,
   `actionPlanMyTasksFilter`. When adding queries, scope them through these helpers rather than
   inventing new `where` clauses.

### Domain model (Prisma, `prisma/schema.prisma`, Postgres)
Hierarchy: `Hoshin → MajorTask → ActionPlan → KPI → KPIPeriodRecord`. Plus `Countermeasure`
(linked to a KPI), `Review → Decision`, `Department`, `User`, and `SystemSetting` (key/value,
e.g. RAG thresholds). No migration files — schema is applied with `prisma db push`.

### KPI RAG logic
`src/lib/kpiRag.ts` holds the pure scoring functions (the only unit-tested module):
variance % → GREEN/AMBER/RED using thresholds loaded from `SystemSetting` via
`settingActions.getRagSettings()`. A **RED** status auto-opens a Countermeasure
(`shouldAutoOpenCountermeasure`), wired in `kpiActions.ts` when saving period records.

### UI
shadcn-style components in `src/components/ui/` built on **`@base-ui/react`** + Tailwind v4.
base-ui primitives render their own DOM element, so to render a custom element as a trigger/close
use the **`render` prop** (e.g. `<DialogTrigger render={<Button .../>}>`) — nesting a `<Button>`
inside `<DialogTrigger>` produces invalid nested `<button>`s.
