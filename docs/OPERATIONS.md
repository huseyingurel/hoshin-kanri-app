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

## Security

See [`security/README.md`](../security/README.md). Open prod item: RLS is disabled on
all tables (Supabase REST API exposure) — remediation SQL is in
[`security/lockdown-supabase-api.sql`](../security/lockdown-supabase-api.sql), to be
applied by a maintainer against prod (not auto-applied).
