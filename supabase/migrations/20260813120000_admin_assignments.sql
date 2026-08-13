-- Admin assignments (additive — safe to run more than once).
--
-- Lets the Super Admin assign a managing admin to each customer, trainer, and
-- society (the "SA will choose Admin for Customer" / "Assign Admin" flows).
-- Nothing existing is removed; these columns are nullable and default to
-- unassigned. Writes use the anon key like the rest of the admin tooling.

ALTER TABLE public.profiles  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid;
ALTER TABLE public.trainers  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid;
ALTER TABLE public.societies ADD COLUMN IF NOT EXISTS assigned_admin_id uuid;

CREATE INDEX IF NOT EXISTS profiles_assigned_admin_idx  ON public.profiles  (assigned_admin_id);
CREATE INDEX IF NOT EXISTS trainers_assigned_admin_idx  ON public.trainers  (assigned_admin_id);
CREATE INDEX IF NOT EXISTS societies_assigned_admin_idx ON public.societies (assigned_admin_id);

-- Backfill: existing customers, trainers, and societies are already handled by
-- the current (first) admin, so assign them to the earliest admin account.
-- This keeps them OUT of the Super Admin "Requests" queue, which should only
-- surface genuinely new/unassigned records going forward.
UPDATE public.profiles  SET assigned_admin_id = (SELECT id FROM public.admins ORDER BY created_at ASC LIMIT 1) WHERE assigned_admin_id IS NULL;
UPDATE public.trainers  SET assigned_admin_id = (SELECT id FROM public.admins ORDER BY created_at ASC LIMIT 1) WHERE assigned_admin_id IS NULL;
UPDATE public.societies SET assigned_admin_id = (SELECT id FROM public.admins ORDER BY created_at ASC LIMIT 1) WHERE assigned_admin_id IS NULL;
