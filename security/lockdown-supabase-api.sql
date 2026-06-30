-- Lock down the Supabase auto-generated REST API (PostgREST) for this project.
--
-- WHY: The advisor found Row Level Security DISABLED on all 11 public tables.
-- Supabase exposes a public REST endpoint (https://<ref>.supabase.co/rest/v1/)
-- authorized by the publishable "anon" key, which is meant to ship to browsers.
-- With RLS off AND the default anon/authenticated grants in place, anyone holding
-- that anon key can read/write EVERY row -- including public."User", which stores
-- plaintext passwords.
--
-- This app does NOT use supabase-js / the anon key. It talks to Postgres only via
-- Prisma over the direct connection (the `postgres` role), which BYPASSES RLS and
-- these grants. So we can safely slam the API-facing roles shut without touching
-- how the app works.
--
-- Strategy: default-deny RLS (defense in depth) + revoke all table/sequence grants
-- from the API roles, including for any future tables.
--
-- Run ONCE against prod. Reversible (see bottom). Review before applying.

BEGIN;

-- 1) Enable RLS on every app table. With no policies, this is default-deny for
--    the anon/authenticated roles. The `postgres` role (Prisma) is unaffected.
ALTER TABLE public."Department"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Hoshin"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MajorTask"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ActionPlan"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KPI"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KPIPeriodRecord"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Countermeasure"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Review"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Decision"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SystemSetting"    ENABLE ROW LEVEL SECURITY;

-- 2) Revoke the privileges Supabase grants to the API roles by default.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3) Make sure tables created later don't silently re-open the hole.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

COMMIT;

-- Verify afterwards (expect rls_enabled = true for all, and no anon/authenticated grants):
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated');

-- ROLLBACK (only if the app somehow depended on the anon API path -- it should not):
--   GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
--   ALTER TABLE public."User" DISABLE ROW LEVEL SECURITY;  -- (repeat per table)
