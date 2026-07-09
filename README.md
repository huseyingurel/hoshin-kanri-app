# Hoshin Kanri Platform

This is a Hoshin Kanri / strategy deployment web application. The project is under
technical and security audit; the goal is to preserve working behavior while improving
stability, access control, data scope correctness, tests, and migration readiness.

The UI, comments, and user-facing strings are primarily Turkish.

## Stack

- Next.js 16.2.4 App Router
- React 19.2.4
- TypeScript
- Prisma 5 / PostgreSQL
- Tailwind CSS v4
- Vitest
- Vercel deployment
- `xlsx` for Excel import
- `pdfkit` / `xlsx` export paths

## Development

```bash
npm run dev        # http://localhost:3001
npm run build
npm start          # production server on port 3001
npm run lint
npm test
npm run test:int
npm run test:all
```

Database setup and prod-clone procedures are documented in `docs/OPERATIONS.md`.

## Domain Overview

The core planning hierarchy is:

```text
Vision -> Hoshin -> MajorTask -> ActionPlan -> KPI -> KPIPeriodRecord
```

Related models include:

- Department
- User
- Countermeasure
- Review
- ReviewParticipant
- Decision
- Task
- NotificationLog
- AuditLog
- CatchballItem
- SystemSetting
- ReportTemplate

The Prisma schema is `prisma/schema.prisma`. This project currently uses `prisma db push`,
not a migration history under `prisma/migrations/`.

## Architecture

Pages are async React Server Components under `src/app/<route>/page.tsx`. Interactive
views are usually client components such as `*Client.tsx`. Mutations live in Server Actions
under `src/app/actions/*.ts`.

The route gate is `src/proxy.ts`, which checks for session-cookie presence. It is not the
authorization layer. Real authorization and data scoping must happen in server-side queries
and Server Actions.

## Auth And Data Scope

Authentication is custom JWT-based session auth:

- `src/lib/auth.ts`
- `src/lib/session.ts`
- `src/proxy.ts`
- `src/app/actions/authActions.ts`

Known security issue: passwords are stored and compared as plaintext. See `security/README.md`.

Role and data-scope logic is centralized in:

- `src/lib/domainTypes.ts`
- `src/lib/access.ts`
- `src/lib/dataScope.ts`

Org-wide roles can see all relevant rows. Department-scoped users see records assigned to
them or to their department, depending on the surface-specific helper. New queries should use
the existing helpers rather than hand-written authorization filters.

## KPI RAG

KPI status uses Red/Amber/Green scoring from variance percentage:

- Pure logic: `src/lib/kpiRag.ts`
- Settings: `SystemSetting`
- Save path: `src/app/actions/kpiActions.ts`

RED KPI periods auto-open countermeasures when appropriate.

## Governance Layer

The governance layer adds:

- tasks
- notifications
- audit logs
- catchball workflow
- daily sweep route
- period lock/reopen support
- meeting agenda and follow-up behavior

The sweep endpoint is:

```text
POST /api/cron/sweep
Authorization: Bearer $CRON_SECRET
```

It is designed to be idempotent through dedupe keys. See `docs/OPERATIONS.md`.

## Imports And Exports

Excel import logic lives under:

- `scripts/import-excel.ts`
- `src/lib/import/`

Reporting and export logic lives under:

- `src/lib/export/`
- `src/lib/export/reports/`
- `src/app/reports/`

## Migration Context

The parent coordination repo is:

```bash
/home/gulp/projects/emploid/main
```

That repo tracks the migration of this PoC onto the emploid.ai platform. Its load-bearing
document is `docs/hoshin-migration.md`.

This app branch also contains a Collections API adapter path in `src/lib/db.ts` for the
`saveKpiRecord` tracer. Platform-specific context belongs in the parent repo docs.

## Agent Operations

Agent memory and checkpoint files are operational only:

- `.agents/memory.md`
- `.agents/protocol.md`
- `.agents/checkpoints/active.json`
- `.agents/handoffs/`

`AGENTS.md` and `CLAUDE.md` are symlinks to `.agents/memory.md`.
