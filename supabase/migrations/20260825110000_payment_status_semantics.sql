-- Correction to 20260824130000, which is already applied to the live database.
--
-- THE BUG IT FIXES (live regression, not hypothetical):
-- 20260824130000 created plans.payment_status as NOT NULL DEFAULT 'pending'.
-- Every plan an admin creates from here on therefore starts life "pending",
-- and the app treats a pending subscription as unpaid — so a customer who paid
-- cash would be locked out of their own dashboard the moment the plan is made.
--
-- THE CORRECTED MEANING:
--   NULL       – money collected outside the app (cash/UPI). The default, and
--                how every plan has always worked here.
--   'pending'  – a gateway payment is in flight
--   'success'  – the payment service verified a Razorpay signature
--   'failed' / 'cancelled' – the attempt ended without money moving
--
-- Only gateway-tracked plans can ever be "unpaid", which is what keeps the
-- offline business working unchanged while online payments become strict.

ALTER TABLE public.plans ALTER COLUMN payment_status DROP DEFAULT;
ALTER TABLE public.plans ALTER COLUMN payment_status DROP NOT NULL;

-- Any row sitting at 'pending' today got there from the old default, not from
-- a real payment attempt — no Razorpay order has ever been raised. Restore
-- those to "collected outside the app" so nobody is locked out.
UPDATE public.plans
   SET payment_status = NULL
 WHERE payment_status = 'pending'
   AND razorpay_order_id IS NULL;

/**
 * Replaces the version in 20260824130000 with two corrections:
 *   1. NULL payment_status now means paid (see above).
 *   2. Every column reference is alias-qualified. An unqualified one can be
 *      read as a declared variable and make Postgres reject the call with
 *      42702 — the defect that took down resolve_session_join().
 */
CREATE OR REPLACE FUNCTION public.subscription_status(_plan_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p       record;
  today   date := (timezone('Asia/Kolkata', now()))::date;
  paused  boolean;
BEGIN
  SELECT pl.* INTO p FROM public.plans pl WHERE pl.id = _plan_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF p.payment_status IS NOT NULL AND p.payment_status <> 'success'
    THEN RETURN 'pending_payment'; END IF;
  IF p.status IN ('stopped', 'cancelled') THEN RETURN 'cancelled'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pauses pz
     WHERE pz.user_id = p.user_id AND pz.status = 'active'
       AND today BETWEEN pz.from_date AND pz.to_date
  ) INTO paused;
  IF paused THEN RETURN 'paused'; END IF;

  IF today > p.end_date THEN RETURN 'expired'; END IF;
  RETURN 'active';
END;
$$;

-- Used by the live-session gate: an unpaid subscription must not open a
-- meeting, however the plan row's own `status` column reads.
CREATE OR REPLACE FUNCTION public.session_plan_is_usable(_user_id uuid, _on date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plans p
     WHERE p.user_id = _user_id
       AND p.status = 'active'
       AND (p.payment_status IS NULL OR p.payment_status = 'success')
       AND _on BETWEEN p.start_date AND p.end_date
  );
$$;

GRANT EXECUTE ON FUNCTION public.subscription_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_plan_is_usable(uuid, date) TO anon, authenticated;
