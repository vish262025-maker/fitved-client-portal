-- Online training offerings: the batches (group) and 1-to-1 slots (personal)
-- an admin runs online, plus the link from a booking to the batch it joined.
--
-- One table serves both because they are the same shape — trainer + days +
-- timing — differing only in capacity: a group batch seats many, a personal
-- slot seats one. Bookings themselves reuse the existing booking_requests
-- table (training_mode = 'online'), so there is no parallel booking system.
--
-- Additive & idempotent. Nothing existing is modified.

CREATE TABLE IF NOT EXISTS public.online_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_admin_id uuid NOT NULL,
  training_type     text NOT NULL DEFAULT 'group',   -- 'group' | 'personal'
  name              text,
  trainer_id        uuid,
  days              text[] NOT NULL,
  start_time        text,
  end_time          text,
  capacity          integer,                          -- NULL = unlimited; 1 for personal
  active            boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT online_batches_days_len CHECK (array_length(days, 1) BETWEEN 1 AND 7),
  CONSTRAINT online_batches_capacity_pos CHECK (capacity IS NULL OR capacity > 0)
);

CREATE INDEX IF NOT EXISTS online_batches_admin_idx   ON public.online_batches (assigned_admin_id);
CREATE INDEX IF NOT EXISTS online_batches_trainer_idx ON public.online_batches (trainer_id);
CREATE INDEX IF NOT EXISTS online_batches_active_idx  ON public.online_batches (active);

-- Which batch/slot a booking joined (NULL for offline bookings).
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS booking_requests_batch_idx ON public.booking_requests (batch_id);

-- Anon-key + open-RLS reality (matches the rest of this project).
ALTER TABLE public.online_batches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "online_batches_all" ON public.online_batches
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
