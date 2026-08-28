-- FitVed — all remaining migrations, in dependency order.
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Every statement is idempotent: running it twice is safe.
-- Generated 2026-08-25.

-- ═══════════════════════════════════════════════════════════════
-- 20260825120000_payment_guard.sql
-- ═══════════════════════════════════════════════════════════════
-- Make gateway payments unforgeable from the browser.
--
-- The app ships an anon key with open RLS, so without this trigger anyone
-- could open the console and run
--     update plans set payment_status = 'success' where id = '…'
-- and hand themselves a paid subscription. Server-side signature checking is
-- worthless if the client can simply write the result it wants.
--
-- The rule: only the service role — i.e. the /api/payments/* functions, which
-- alone hold SUPABASE_SERVICE_ROLE_KEY — may mark a plan paid or touch the
-- gateway columns. Everything the admin UI does today still works, because
-- plans collected in cash keep payment_status NULL and are never gateway rows.
--
-- Additive & idempotent.

CREATE OR REPLACE FUNCTION public.guard_plan_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The serverless functions run as service_role; migrations run as postgres.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A client may open an unpaid plan, never a paid one.
    IF NEW.payment_status = 'success' THEN
      RAISE EXCEPTION 'payment_status "success" may only be set by the payment service';
    END IF;
    IF NEW.razorpay_order_id IS NOT NULL
       OR NEW.razorpay_payment_id IS NOT NULL
       OR NEW.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'gateway fields may only be set by the payment service';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE. Only *changes* are policed: an untouched 'success' row must stay
  -- editable, or admins could no longer edit a paid customer's schedule.
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status = 'success' THEN
    RAISE EXCEPTION 'payment_status "success" may only be set by the payment service';
  END IF;

  IF NEW.razorpay_order_id   IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id
     OR NEW.activated_at     IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'gateway fields may only be set by the payment service';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_plan_payment_trg ON public.plans;
CREATE TRIGGER guard_plan_payment_trg
  BEFORE INSERT OR UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_plan_payment();

-- Same reasoning for the money ledger: a client must not be able to invent a
-- gateway payment record to make revenue reports agree with a forged plan.
CREATE OR REPLACE FUNCTION public.guard_billing_gateway()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.razorpay_order_id IS NOT NULL OR NEW.razorpay_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'gateway fields may only be set by the payment service';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.razorpay_order_id   IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id THEN
    RAISE EXCEPTION 'gateway fields may only be set by the payment service';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_billing_gateway_trg ON public.billing_history;
CREATE TRIGGER guard_billing_gateway_trg
  BEFORE INSERT OR UPDATE ON public.billing_history
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_gateway();


-- ═══════════════════════════════════════════════════════════════
-- 20260825130000_no_mid_term_cancellation.sql
-- ═══════════════════════════════════════════════════════════════
-- A purchased plan runs its full term.
--
-- Business rule: once a customer has paid, the subscription cannot be
-- cancelled part-way through. Customers have no cancel action at all, and
-- nothing in the app may quietly end a paid plan as a side effect of some
-- other operation — which is exactly what used to happen when an admin
-- cancelled an online booking.
--
-- The one exception is a deliberate admin decision (a refund or dispute).
-- That is allowed, but it is not silent: the same statement must record who
-- did it, when, and why. An UPDATE that flips the status without that
-- evidence is rejected by the database, so an accidental or programmatic
-- cancellation cannot happen.
--
-- Additive & idempotent.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION public.guard_plan_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today       date := (timezone('Asia/Kolkata', now()))::date;
  was_running boolean;
  now_ended   boolean;
  is_paid     boolean;
BEGIN
  was_running := OLD.status = 'active';
  now_ended   := NEW.status IN ('stopped', 'cancelled');

  -- Only police the active → cancelled transition. Everything else (editing a
  -- paid plan's schedule, letting it complete on time, reactivating) is
  -- untouched.
  IF NOT (was_running AND now_ended) THEN
    RETURN NEW;
  END IF;

  -- NULL payment_status means collected outside the app, which still counts as
  -- purchased. Only a gateway plan that never completed payment is unpaid.
  is_paid := OLD.payment_status IS NULL OR OLD.payment_status = 'success';

  -- An unpaid plan was never bought, so ending it is not a cancellation.
  IF NOT is_paid THEN
    RETURN NEW;
  END IF;

  -- Past its end date it is over anyway; that is expiry, not cancellation.
  IF OLD.end_date IS NOT NULL AND today > OLD.end_date THEN
    RETURN NEW;
  END IF;

  -- Paid and still inside its term: allowed only as a recorded exception.
  IF NEW.cancellation_reason IS NULL
     OR btrim(NEW.cancellation_reason) = ''
     OR NEW.cancelled_by IS NULL THEN
    RAISE EXCEPTION
      'This plan is paid for and still running until %. A paid plan cannot be cancelled mid-term without a recorded reason.',
      OLD.end_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stamp the time server-side so the audit trail can't be back-dated.
  NEW.cancelled_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_plan_cancellation_trg ON public.plans;
CREATE TRIGGER guard_plan_cancellation_trg
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_plan_cancellation();

-- Deleting the row would sidestep the trigger entirely, so a paid, in-term
-- plan cannot be deleted either.
CREATE OR REPLACE FUNCTION public.guard_plan_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (timezone('Asia/Kolkata', now()))::date;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN OLD;
  END IF;

  IF OLD.status = 'active'
     AND (OLD.payment_status IS NULL OR OLD.payment_status = 'success')
     AND (OLD.end_date IS NULL OR today <= OLD.end_date) THEN
    RAISE EXCEPTION
      'This plan is paid for and still running until %. Cancel it with a reason instead of deleting it.',
      OLD.end_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_plan_delete_trg ON public.plans;
CREATE TRIGGER guard_plan_delete_trg
  BEFORE DELETE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_plan_delete();


-- ═══════════════════════════════════════════════════════════════
-- 20260825140000_training_sessions.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- 20260825150000_backfill_subscriptions.sql
-- ═══════════════════════════════════════════════════════════════
-- Carry existing customers onto the subscription/session model.
--
-- Online customers created through the old booking flow have their assignment
-- on `booking_requests` (batch, trainer, plan) while their subscription lives
-- on `plans`. The new flow keeps everything on `plans`, so this copies the
-- assignment across and lays out the sessions those customers should already
-- have had.
--
-- Non-destructive: booking_requests rows are left exactly as they are, and a
-- plan that already carries an assignment is never overwritten.

UPDATE public.plans p
   SET training_mode = 'online',
       training_type = COALESCE(p.training_type, b.training_type),
       batch_id      = COALESCE(p.batch_id, b.batch_id),
       trainer_id    = COALESCE(p.trainer_id, b.trainer_id),
       plan_option_id = COALESCE(p.plan_option_id, b.plan_option_id),
       booking_request_id = COALESCE(p.booking_request_id, b.id),
       updated_at    = now()
  FROM public.booking_requests b
 WHERE b.user_id = p.user_id
   AND b.training_mode = 'online'
   AND b.status <> 'cancelled'
   AND p.training_mode IS DISTINCT FROM 'offline';

-- Fill in duration and the honest term end for anything already priced to a
-- catalogue plan but still missing its duration.
UPDATE public.plans p
   SET duration_months = o.duration_months
  FROM public.plan_options o
 WHERE p.plan_option_id = o.id
   AND p.duration_months IS NULL;

-- Existing online plans were collected outside the app; keep them paid so no
-- current customer is locked out by the new payment gate.
UPDATE public.plans
   SET payment_status = 'success'
 WHERE training_mode = 'online'
   AND payment_status IS DISTINCT FROM 'success'
   AND razorpay_order_id IS NULL
   AND status = 'active';

-- Lay out the sessions for every active online subscription. Idempotent, so
-- re-running this migration cannot duplicate anyone's calendar.
-- Offline subscriptions predate the mode column and keep their schedule on
-- the customer profile (society + time slot). Copy it onto the plan so the
-- session generator has one place to read from.
UPDATE public.plans p
   SET training_mode = COALESCE(p.training_mode, 'offline'),
       society_id    = COALESCE(p.society_id, pr.society_id),
       time_slot     = COALESCE(p.time_slot, pr.time_slot),
       trainer_id    = COALESCE(p.trainer_id, pr.trainer_id)
  FROM public.profiles pr
 WHERE pr.id = p.user_id
   AND p.training_mode IS DISTINCT FROM 'online';

-- Lay out sessions for every active subscription, offline and online.
-- Idempotent, so re-running this migration cannot duplicate anyone's calendar.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.plans WHERE status = 'active' LOOP
    PERFORM public.generate_sessions(r.id);
  END LOOP;
END $$;

-- Close out anything already past its end date.
SELECT public.expire_subscriptions();


