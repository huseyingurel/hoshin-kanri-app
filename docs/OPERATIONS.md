# Operations

How to run, seed, and clone this app locally. Production lives on **Vercel** with a
**Supabase Postgres** database; prod connection strings exist only in the Vercel
project env vars and the Supabase dashboard (nothing secret is committed).

## Local environment

Requirements: Node, Docker, and the Postgres client tools (`psql`, `pg_dump`).

### 1. Environment variables
Copy `.env.example` to `.env` and fill in:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection used by Prisma at runtime (pooled URL in prod). |
| `DIRECT_URL` | Direct Postgres connection used for migrations (`prisma db push`). |
| `SESSION_SECRET` | HMAC key for signing session JWTs (`src/lib/auth.ts` throws if unset). |
| `CRON_SECRET` | Bearer token the daily governance sweep endpoint requires (see below). If unset, `POST /api/cron/sweep` **fails closed** (500) — it never runs unauthenticated. |

For local dev both URLs point at the throwaway Docker Postgres below.

### 2. Throwaway Postgres (Docker)
```bash
docker run -d --name hoshin-pg \
  -e POSTGRES_PASSWORD=hoshin -e POSTGRES_USER=hoshin -e POSTGRES_DB=hoshin \
  -p 5433:5432 postgres:16
```
Then in `.env`:
```
DATABASE_URL="postgresql://hoshin:hoshin@localhost:5433/hoshin?schema=public"
DIRECT_URL="postgresql://hoshin:hoshin@localhost:5433/hoshin?schema=public"
```
Container lifecycle: `docker stop hoshin-pg` / `docker start hoshin-pg` /
`docker rm -f hoshin-pg` (data is **not** persisted to a volume — removing it wipes the DB).

### 3. Schema + data
```bash
npx prisma db push          # apply schema (no migration history; see note below)
npx tsx prisma/seed.ts      # demo departments/users/hoshin/KPIs
npx tsx scripts/create-user.ts   # optional: an ADMIN login for local testing
```

### 4. Run
```bash
npm run dev    # http://localhost:3001  (note: port 3001, not 3000)
```

> Migrations: the project uses `prisma db push` (schema sync), **not** `prisma migrate`
> — there is no `prisma/migrations/` history. Apply schema changes the same way.

## Cloning prod data into local

Two supported methods.

### Method A — `pg_dump` (needs the prod DB password)
If you have the Supabase **direct** connection string (port 5432, from
Supabase → Connect, or Vercel → `DIRECT_URL`):
```bash
echo 'PROD_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' > .env.prod
./scripts/pull-prod-db.sh
```
`.env.prod` and `*.dump` are gitignored. The script dumps the `public` schema
(structure + data), wipes the local `public` schema, and restores into `hoshin-pg`.

### Method B — Supabase MCP (no DB password needed)
When only the Supabase MCP is connected (project-scoped server in `.mcp.json`), data
can be pulled through it as JSON and reloaded locally. The robust recipe:

1. On prod, emit reload SQL for all tables at once (avoids per-column escaping):
   ```sql
   SELECT string_agg(
     format('INSERT INTO %I SELECT * FROM json_populate_recordset(NULL::%I, $json$%s$json$);',
            t, t, coalesce((SELECT json_agg(x) FROM ...)::text,'[]')), E'\n')
   -- one row per table, ordered by FK dependency
   ```
   (See git history / the security audit notes for the exact query.)
2. Wrap the result in a transaction that disables FK triggers during load:
   ```sql
   BEGIN;
   SET session_replication_role = replica;
   TRUNCATE "Department","User",...,"SystemSetting" CASCADE;
   -- <the INSERT ... json_populate_recordset statements>
   SET session_replication_role = DEFAULT;
   COMMIT;
   ```
3. Run it against local: `psql "postgresql://hoshin:hoshin@localhost:5433/hoshin" -f clone.sql`

Load order / FK dependency:
`Department → User → Hoshin → MajorTask → ActionPlan → KPI → KPIPeriodRecord
→ Countermeasure → Review → Decision → SystemSetting`.

> ⚠️ A prod clone contains **real data, including the `User` table with plaintext
> passwords**. Keep it local; never commit dumps or clone SQL. After cloning, local
> logins are the real prod accounts.

## MCP: Supabase

`.mcp.json` (at the workspace root) registers the Supabase MCP server, giving
read/query access to the prod project for inspection (schema, row counts, advisors).
Project-scoped MCP servers require one-time approval on Claude Code startup, then
OAuth authentication via `/mcp`. Prefer it for **inspecting** prod; use Method A/B for
moving data.

## Governance engine — daily sweep (cron)

The time-driven half of the governance layer (period openings, due-soon / overdue
follow-ups, RED-KPI review tasks, level-2 escalations) runs as an **idempotent daily
sweep** behind a bearer-protected route. There is **no in-process scheduler** — an
external scheduler must POST to the endpoint (N7).

```bash
curl -X POST https://<host>/api/cron/sweep \
  -H "Authorization: Bearer $CRON_SECRET"
```

- **Auth (fail-closed, INV-7):** the route returns **401** on a missing/wrong bearer and
  **500** if `CRON_SECRET` is unset server-side. It never runs unauthenticated.
- **Response:** a structured JSON summary —
  `{ ranAt, scanned, generated, notified, escalated, skipped, failures[] }`. A non-empty
  `failures[]` means individual work items threw; each runs in its **own transaction**, so
  one failure never rolls back the others (it is reported, not swallowed).
- **Retry / re-run semantics (INV-2/INV-3):** every task and notification write is keyed by
  a unique `dedupeKey`, so re-running the sweep any number of times per day is safe —
  the second run reports `generated: 0` and counts the existing rows under `skipped`. A
  scheduler that retries on a non-200 (or double-fires) cannot create duplicates.
- **Scheduling:** wire any external trigger to fire it ~once/day, e.g. a **Vercel Cron**
  entry (`vercel.json` → `crons`) hitting `/api/cron/sweep`, with `CRON_SECRET` set in the
  project env. Frequency only affects latency of follow-ups, not correctness (idempotent).

Local smoke test (against the dev server on port 3001):
```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/sweep
# run twice — the second call should show generated:0, skipped:>0
```

## Tests

```bash
npm test            # Tier 1 — unit (pure engine + RAG): no DB needed
npm run test:int    # Tier 2 — integration (.itest.ts): requires a test Postgres
npm run test:all    # both, in sequence
```

**Test database.** Integration tests run against a **separate** `hoshin_test` database so
they never touch dev/prod data. Configure it in `.env.test` (gitignored; copy from
`.env.test.example`):

```
DATABASE_URL=postgresql://hoshin:hoshin@localhost:5433/hoshin_test?schema=public
DIRECT_URL=postgresql://hoshin:hoshin@localhost:5433/hoshin_test?schema=public
SESSION_SECRET=test-secret
CRON_SECRET=test-cron-secret
```

Create the DB once (reuses the Docker Postgres from above):
```bash
docker exec hoshin-pg psql -U hoshin -d hoshin -c 'CREATE DATABASE hoshin_test;'
```

How the harness isolates state (no manual setup beyond the DB):
- **`test/integration.globalSetup.ts`** runs `prisma db push` against `hoshin_test` **once**
  before the suite (no migration history — N5; `db push` is idempotent).
- **`test/integration.setup.ts`** `TRUNCATE … RESTART IDENTITY CASCADE`s every `public`
  table **before each test** (table list read from `pg_tables`, so adding a model needs no
  edit here). Tests run serially (`fileParallelism: false`) since they share one DB.

## Security

See [`security/README.md`](../security/README.md). Open prod item: RLS is disabled on
all tables (Supabase REST API exposure) — remediation SQL is in
[`security/lockdown-supabase-api.sql`](../security/lockdown-supabase-api.sql), to be
applied by a maintainer against prod (not auto-applied).
