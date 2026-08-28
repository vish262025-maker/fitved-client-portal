-- Society day sets: the fixed 3-day training patterns a society runs.
--
-- Until now the only day information in the system lived on plans.training_days
-- (per customer). There was no society-level schedule, so the booking flow had
-- no way to offer "Tue · Thu · Sat" vs "Mon · Wed · Fri". This adds that layer
-- and back-fills it from the patterns already present in existing plans, so no
-- admin has to retype schedules that the data already proves.
--
-- Additive & idempotent. Nothing existing is modified or deleted.

CREATE TABLE IF NOT EXISTS public.society_day_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id  uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  label       text,                      -- e.g. "Tue · Thu · Sat" (derived when null)
  days        text[] NOT NULL,           -- exactly 3 weekday names
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT society_day_sets_three_days CHECK (array_length(days, 1) = 3)
);

CREATE INDEX IF NOT EXISTS society_day_sets_society_idx ON public.society_day_sets (society_id);

-- One row per (society, day pattern). Guards the back-fill and stops an admin
-- creating the same set twice.
CREATE UNIQUE INDEX IF NOT EXISTS society_day_sets_unique
  ON public.society_day_sets (society_id, days);

-- Per-day timing inside a set. Optional: a set works without timings, and each
-- day can point at an existing trainer_slots row / trainer when configured.
CREATE TABLE IF NOT EXISTS public.society_day_set_times (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_set_id  uuid NOT NULL REFERENCES public.society_day_sets(id) ON DELETE CASCADE,
  day         text NOT NULL,
  time_slot   text,
  trainer_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT society_day_set_times_unique UNIQUE (day_set_id, day)
);

CREATE INDEX IF NOT EXISTS society_day_set_times_set_idx ON public.society_day_set_times (day_set_id);

-- Anon-key + open-RLS reality (matches the rest of this project).
ALTER TABLE public.society_day_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.society_day_set_times ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "society_day_sets_all" ON public.society_day_sets
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "society_day_set_times_all" ON public.society_day_set_times
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Back-fill from existing schedules ────────────────────────────────────────
-- Every distinct 3-day pattern already being trained in a society becomes a day
-- set for that society. Days are re-sorted into weekday order first, so
-- "Thursday, Saturday, Tuesday" and "Tuesday, Thursday, Saturday" collapse into
-- the same set instead of creating a duplicate. Patterns with fewer/more than
-- three days (ad-hoc schedules) are left alone — they stay on their plans.
WITH weekday_order AS (
  SELECT * FROM (VALUES
    ('Monday',1),('Tuesday',2),('Wednesday',3),('Thursday',4),
    ('Friday',5),('Saturday',6),('Sunday',7)
  ) AS t(day, pos)
),
plan_patterns AS (
  SELECT pr.society_id,
         ARRAY(
           SELECT d FROM unnest(p.training_days) AS d
           JOIN weekday_order w ON w.day = d
           ORDER BY w.pos
         ) AS days,
         COUNT(*) AS uses
    FROM public.plans p
    JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.training_days IS NOT NULL
     AND pr.society_id IS NOT NULL
     AND array_length(p.training_days, 1) = 3
   GROUP BY pr.society_id, 2
)
INSERT INTO public.society_day_sets (society_id, days, label, sort_order, active)
SELECT pp.society_id,
       pp.days,
       array_to_string(ARRAY(SELECT left(d, 3) FROM unnest(pp.days) AS d), ' · '),
       ROW_NUMBER() OVER (PARTITION BY pp.society_id ORDER BY pp.uses DESC),
       true
  FROM plan_patterns pp
 WHERE array_length(pp.days, 1) = 3
ON CONFLICT (society_id, days) DO NOTHING;
