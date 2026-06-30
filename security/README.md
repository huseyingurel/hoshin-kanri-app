# Security findings & fixes

Findings from the prod Supabase audit, most severe first.

## 1. Public REST API exposes every table (CRITICAL)
RLS is disabled on all 11 `public` tables and the default `anon`/`authenticated`
grants are in place. Supabase's PostgREST endpoint
(`https://<ref>.supabase.co/rest/v1/`) is authorized by the **publishable anon key**
— a key designed to be public/shipped to browsers. Net effect: anyone with the anon
key can read or write any row, including `User` (plaintext passwords).

The app itself is unaffected by the fix below — it uses **Prisma over the direct
Postgres connection** (`postgres` role), which bypasses RLS and these grants. It does
not use `supabase-js` or the anon key anywhere.

**Fix:** run [`lockdown-supabase-api.sql`](./lockdown-supabase-api.sql) against prod
(enables default-deny RLS + revokes anon/authenticated grants). Reversible.

## 2. Passwords stored in plaintext (HIGH)
`authActions.ts` compares `user.password !== password` with no hashing, and the
`User` table holds plaintext values. Fix = hash with bcrypt/argon2 on create and on
login (a code change + one-time migration to re-hash existing rows). Not included here
because it changes app behavior; should be a reviewed PR.

## 3. SESSION_SECRET hygiene (MEDIUM)
The prod `SESSION_SECRET` (JWT signing key) has been shared around in local `.env`
files. Anyone with it can forge valid login sessions. Rotate it in Vercel once the
sharing stops; all existing sessions will be invalidated (users re-login).
