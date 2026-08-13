-- Admin profiles + activity audit trail (additive — safe to run more than once).
--
-- Adds, for the Super Admin's per-admin profile view:
--   • admins.active         — suspend/activate an admin without deleting them
--   • admins.notes          — Super-Admin-only internal notes
--   • admins.last_login_at  — quick "last active" display
--   • admin_activity        — audit trail of what each admin does
--   • admin_logins          — per-admin sign-in history
--
-- Nothing existing is removed. Writes use the anon publishable key (same model
-- as the rest of the app), so these tables get permissive anon RLS policies.

-- ── admins columns ─────────────────────────────────────────────────────────
ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- ── Activity audit trail ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_activity (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid,          -- who performed it (admins.id or super_admins.id)
  actor_role   text,          -- 'admin' | 'super_admin'
  actor_name   text,          -- denormalized for display
  action       text NOT NULL, -- e.g. 'trainer.delete', 'society.create'
  entity_type  text,          -- 'trainer' | 'society' | 'customer' | 'plan' | 'admin' | ...
  entity_id    text,          -- id of the affected row
  entity_label text,          -- human label (name) for display
  details      jsonb,         -- optional extra context
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_activity_admin_id_idx
  ON public.admin_activity (admin_id, created_at DESC);

ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_activity anon select" ON public.admin_activity;
CREATE POLICY "admin_activity anon select" ON public.admin_activity FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_activity anon insert" ON public.admin_activity;
CREATE POLICY "admin_activity anon insert" ON public.admin_activity FOR INSERT WITH CHECK (true);

-- ── Sign-in history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_logins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid,
  actor_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_logins_admin_id_idx
  ON public.admin_logins (admin_id, created_at DESC);

ALTER TABLE public.admin_logins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_logins anon select" ON public.admin_logins;
CREATE POLICY "admin_logins anon select" ON public.admin_logins FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_logins anon insert" ON public.admin_logins;
CREATE POLICY "admin_logins anon insert" ON public.admin_logins FOR INSERT WITH CHECK (true);

-- Allow updating last_login_at (admins update policy already added by the
-- super_admin migration; this is a no-op reminder that UPDATE must be allowed).
