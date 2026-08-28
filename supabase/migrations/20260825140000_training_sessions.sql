-- Session backbone for BOTH offline and online training.
--
-- Until now the calendar was DERIVED from a plan's dates, so there was nowhere
-- to record that a class happened, was missed, or was cancelled. One table
-- serves both modes because the downstream state is identical: customer
-- calendar, trainer classes and admin reporting all read these rows.
--
-- Reuses `plans` as the subscription (it already carries user, dates, amount,
-- payment_status and the Razorpay ids). The SCHEDULE source differs by mode
-- and stays where it already lives:
--   online  → online_batches (days, start/end time, trainer, meeting config)
--   offline → society + day set + time slot, trainer via trainer_slots
--
-- Additive & idempotent.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS batch_id        uuid REFERENCES public.online_batches(id),
  ADD COLUMN IF NOT EXISTS trainer_id      uuid,
  ADD COLUMN IF NOT EXISTS duration_months integer,
  ADD COLUMN IF NOT EXISTS society_id      uuid REFERENCES public.societies(id),
  ADD COLUMN IF NOT EXISTS day_set_id      uuid,
  ADD COLUMN IF NOT EXISTS time_slot       text;

CREATE INDEX IF NOT EXISTS plans_batch_idx   ON public.plans (batch_id);
CREATE INDEX IF NOT EXISTS plans_trainer_idx ON public.plans (trainer_id);
CREATE INDEX IF NOT EXISTS plans_society_idx ON public.plans (society_id);

CREATE TABLE IF NOT EXISTS public.training_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  training_mode text NOT NULL,               -- 'offline' | 'online'
  batch_id      uuid REFERENCES public.online_batches(id),
  society_id    uuid REFERENCES public.societies(id),
  trainer_id    uuid,
  session_date  date NOT NULL,
  time_slot     text,
  -- scheduled | completed | missed | cancelled | trainer_off | paused
  status        text NOT NULL DEFAULT 'scheduled',
  attended      boolean,
  marked_by     uuid,
  marked_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One session per subscription per day. This is what makes generation safe to
-- re-run: a repeated activation, a webhook replay or an admin edit re-inserts
-- the same rows and the conflict clause turns them into no-ops.
CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_unique
  ON public.training_sessions (plan_id, session_date);

CREATE INDEX IF NOT EXISTS training_sessions_user_idx    ON public.training_sessions (user_id, session_date);
CREATE INDEX IF NOT EXISTS training_sessions_trainer_idx ON public.training_sessions (trainer_id, session_date);
CREATE INDEX IF NOT EXISTS training_sessions_batch_idx   ON public.training_sessions (batch_id, session_date);

/**
 * Generates every session for one paid subscription, offline or online.
 *
 * Idempotent — safe to call from the verify endpoint, the webhook, a pause
 * recalculation and an admin edit. Existing rows keep their attendance; only
 * schedule fields are refreshed, so re-running after a time change updates
 * times without erasing history.
 *
 * Never generates outside [start_date, end_date], so a subscription cannot run
 * on past its expiry because sessions remain unused.
 */
CREATE OR REPLACE FUNCTION public.generate_sessions(_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p      record;
  b      record;
  days   text[];
  slot   text;
  trn    uuid;
  made   integer := 0;
BEGIN
  SELECT pl.* INTO p FROM public.plans pl WHERE pl.id = _plan_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Only a paid subscription gets a schedule. NULL payment_status predates the
  -- gateway and counts as collected outside the app.
  IF p.payment_status IS NOT NULL AND p.payment_status <> 'success' THEN RETURN 0; END IF;
  IF p.start_date IS NULL OR p.end_date IS NULL THEN RETURN 0; END IF;

  IF p.training_mode = 'online' THEN
    IF p.batch_id IS NULL THEN RETURN 0; END IF;
    SELECT ob.* INTO b FROM public.online_batches ob WHERE ob.id = p.batch_id;
    IF NOT FOUND THEN RETURN 0; END IF;
    days := b.days;
    slot := b.start_time || ' – ' || b.end_time;
    trn  := COALESCE(p.trainer_id, b.trainer_id);
  ELSE
    -- Offline: the day pattern and slot are on the subscription itself.
    days := p.training_days;
    slot := p.time_slot;
    trn  := p.trainer_id;
    -- Trainer may still be unassigned (offline personal is assigned by an
    -- admin after payment); sessions are still laid out so the customer sees
    -- their schedule immediately.
  END IF;

  IF days IS NULL OR array_length(days, 1) IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.training_sessions AS s (
    plan_id, user_id, training_mode, batch_id, society_id, trainer_id,
    session_date, time_slot, status
  )
  SELECT
    p.id, p.user_id, COALESCE(p.training_mode, 'offline'), p.batch_id, p.society_id, trn,
    d::date, slot,
    CASE
      -- A customer pause wins over a trainer off-day: same lost class, but the
      -- calendar should say why it was the customer's break.
      WHEN EXISTS (
        SELECT 1 FROM public.pauses pz
         WHERE pz.user_id = p.user_id AND pz.status = 'active'
           AND d::date BETWEEN pz.from_date AND pz.to_date
      ) THEN 'paused'
      WHEN trn IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.trainer_off_times o
         WHERE o.trainer_id = trn
           AND d::date BETWEEN o.from_date AND o.to_date
      ) THEN 'trainer_off'
      ELSE 'scheduled'
    END
  FROM generate_series(p.start_date::timestamp, p.end_date::timestamp, interval '1 day') AS d
  WHERE trim(to_char(d, 'FMDay')) = ANY (days)
  ON CONFLICT (plan_id, session_date) DO UPDATE
     SET trainer_id = EXCLUDED.trainer_id,
         batch_id   = EXCLUDED.batch_id,
         society_id = EXCLUDED.society_id,
         time_slot  = EXCLUDED.time_slot,
         status     = EXCLUDED.status
     -- Never overwrite a session someone already marked.
     WHERE s.attended IS NULL AND s.status IN ('scheduled', 'paused', 'trainer_off');

  GET DIAGNOSTICS made = ROW_COUNT;
  RETURN made;
END;
$$;

/**
 * Moves finished subscriptions to 'completed' and closes leftover sessions.
 * Idempotent — running it twice changes nothing the second time.
 */
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (timezone('Asia/Kolkata', now()))::date;
  n     integer := 0;
BEGIN
  -- Classes that never happened and never will.
  UPDATE public.training_sessions
     SET status = 'missed'
   WHERE status = 'scheduled' AND session_date < today;

  UPDATE public.plans
     SET status = 'completed', updated_at = now()
   WHERE status = 'active' AND end_date < today;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sessions(uuid)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_subscriptions()   TO anon, authenticated, service_role;
