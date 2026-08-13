-- Super Admin role tier (additive — safe to run more than once).
--
-- Model: the Super Admin is a SEPARATE account from the regular admins. It
-- lives in its own `super_admins` table and sits ABOVE the `admins` table.
-- Every regular admin (including the original "1st admin") stays in `admins`
-- and is managed BY the Super Admin from the /super-admin dashboard. The same
-- person may hold both a Super Admin account and a regular admin account — they
-- are independent logins, looked up in different tables, so the same phone can
-- appear in both without colliding.
--
-- Nothing existing is removed. The app degrades gracefully until this runs:
-- regular admin login is unchanged, and the Super Admin login simply fails
-- until the super_admins row exists.

-- ── Per-admin permissions on the existing admins table ─────────────────────
-- (Used to gate destructive actions in the regular admin UI.)
ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: give every existing admin full permissions so nothing they can do
-- today is taken away. New admins created by the Super Admin inherit whatever
-- the Super Admin explicitly grants them.
UPDATE public.admins
SET permissions = jsonb_build_object(
  'delete_customer', true,
  'delete_trainer',  true,
  'delete_society',  true
)
WHERE permissions IS NULL OR permissions = '{}'::jsonb;

-- The original admin (Vishal Gupta) must remain a REGULAR admin under the
-- Super Admin — never promoted. If an earlier version of this migration flipped
-- an is_super_admin flag on the admins table, undo it here.
UPDATE public.admins
SET is_super_admin = false
WHERE is_super_admin IS TRUE
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'is_super_admin'
  );

-- Allow the client-side dashboard (anon publishable key) to manage admin rows:
-- create admins, reset passwords, edit permissions, remove admins. NOTE: the
-- anon key ships in the frontend bundle, so anyone holding it can read/write
-- admin rows — a deliberate, accepted trade-off for a no-backend console.
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins anon select" ON public.admins;
CREATE POLICY "admins anon select" ON public.admins FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins anon insert" ON public.admins;
CREATE POLICY "admins anon insert" ON public.admins FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "admins anon update" ON public.admins;
CREATE POLICY "admins anon update" ON public.admins FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admins anon delete" ON public.admins;
CREATE POLICY "admins anon delete" ON public.admins FOR DELETE USING (true);

-- ── The separate Super Admin account table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.super_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  phone      text NOT NULL,
  password   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the Super Admin account: phone 9890471383 / password 9890471383.
-- Independent of the admins table — the same phone may also be a regular admin.
INSERT INTO public.super_admins (name, phone, password)
SELECT 'Super Admin', '9890471383', '9890471383'
WHERE NOT EXISTS (SELECT 1 FROM public.super_admins WHERE phone = '9890471383');

-- Read-only anon access so the dedicated Super Admin login can look up the row.
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admins anon select" ON public.super_admins;
CREATE POLICY "super_admins anon select" ON public.super_admins FOR SELECT USING (true);
