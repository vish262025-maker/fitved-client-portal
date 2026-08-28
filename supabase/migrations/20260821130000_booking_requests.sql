-- Booking requests: a customer's paid request that still needs an admin action.
--
-- First use case is Offline Personal Training, where the customer never picks
-- their own trainer — they pay, and their admin assigns a trainer afterwards.
-- Kept generic (training_mode / training_type) so the other three plan buckets
-- can reuse the same table instead of growing a parallel booking system.
--
-- Additive & idempotent. Nothing existing is modified.

CREATE TABLE IF NOT EXISTS public.booking_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  plan_option_id    uuid,
  assigned_admin_id uuid,

  training_mode     text NOT NULL DEFAULT 'offline',   -- 'offline' | 'online'
  training_type     text NOT NULL DEFAULT 'personal',  -- 'personal' | 'group'

  -- What the customer asked for. Never silently changed by the admin.
  preferred_days    text[],
  preferred_time    text,
  society_name      text,
  address           text,

  -- Payment. payment_ref is unique so a retried/duplicated webhook or a
  -- double-submit can't create a second request for the same payment.
  payment_ref       text,
  payment_status    text NOT NULL DEFAULT 'paid',

  status            text NOT NULL DEFAULT 'pending_trainer_assignment',
  -- pending_trainer_assignment → trainer_assigned → training_ongoing → completed | cancelled

  trainer_id        uuid,
  assigned_by       uuid,
  assigned_at       timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_requests_user_idx   ON public.booking_requests (user_id);
CREATE INDEX IF NOT EXISTS booking_requests_admin_idx  ON public.booking_requests (assigned_admin_id);
CREATE INDEX IF NOT EXISTS booking_requests_status_idx ON public.booking_requests (status);

-- Idempotency guard for payments (NULLs are allowed and not deduped).
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_payment_ref_unique
  ON public.booking_requests (payment_ref) WHERE payment_ref IS NOT NULL;

-- One open request per customer, so a refresh or a second tab can't queue two.
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_one_open_per_user
  ON public.booking_requests (user_id)
  WHERE status IN ('pending_trainer_assignment', 'trainer_assigned');

-- Anon-key + open-RLS reality (matches the rest of this project).
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "booking_requests_all" ON public.booking_requests
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
