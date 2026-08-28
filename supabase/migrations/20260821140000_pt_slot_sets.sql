-- Personal-training availability: the day combinations an admin offers, and
-- the time slots available for each one.
--
-- Group training schedules live on societies (society_day_sets), but personal
-- training happens at the customer's own address, so availability belongs to
-- the admin, not to a society. Day count is deliberately flexible (2, 3, …)
-- because admins run different combinations.
--
-- Additive & idempotent. Nothing existing is modified.

CREATE TABLE IF NOT EXISTS public.pt_slot_sets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_admin_id uuid NOT NULL,
  training_type     text NOT NULL DEFAULT 'personal',
  label             text,
  days              text[] NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_slot_sets_min_days CHECK (array_length(days, 1) BETWEEN 1 AND 7)
);

CREATE INDEX IF NOT EXISTS pt_slot_sets_admin_idx ON public.pt_slot_sets (assigned_admin_id);

-- One row per (admin, day combination) so the same set can't be added twice.
CREATE UNIQUE INDEX IF NOT EXISTS pt_slot_sets_unique
  ON public.pt_slot_sets (assigned_admin_id, training_type, days);

-- The selectable times for a day set. A set can offer several times; the
-- customer picks one from the dropdown.
CREATE TABLE IF NOT EXISTS public.pt_slot_set_times (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_set_id uuid NOT NULL REFERENCES public.pt_slot_sets(id) ON DELETE CASCADE,
  time_slot   text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_slot_set_times_unique UNIQUE (slot_set_id, time_slot)
);

CREATE INDEX IF NOT EXISTS pt_slot_set_times_set_idx ON public.pt_slot_set_times (slot_set_id);

-- Anon-key + open-RLS reality (matches the rest of this project).
ALTER TABLE public.pt_slot_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_slot_set_times ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pt_slot_sets_all" ON public.pt_slot_sets
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pt_slot_set_times_all" ON public.pt_slot_set_times
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
