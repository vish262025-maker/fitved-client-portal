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
