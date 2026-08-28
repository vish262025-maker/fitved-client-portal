-- Fix: the payment and delete guards never blocked anything.
--
-- Both were declared SECURITY DEFINER, which makes current_user the function's
-- OWNER (postgres) rather than the calling role. Their first line is
--     IF current_user IN ('service_role','postgres','supabase_admin') THEN RETURN NEW;
-- so every call took the exempt path and the guard was a no-op. Verified
-- against the live database: an anon INSERT carrying payment_status='success'
-- and a fake razorpay_order_id was accepted, and an anon DELETE of a paid,
-- running plan succeeded.
--
-- The cancellation guard was unaffected because it never consults current_user.
--
-- These trigger functions only read NEW/OLD and raise — they need no elevated
-- rights — so they are recreated as SECURITY INVOKER. current_user is then the
-- role PostgREST switched to: 'anon' / 'authenticated' for the browser,
-- 'service_role' for the payment endpoints.

CREATE OR REPLACE FUNCTION public.guard_plan_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
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

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status = 'success' THEN
    RAISE EXCEPTION 'payment_status "success" may only be set by the payment service';
  END IF;

  IF NEW.razorpay_order_id     IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id
     OR NEW.activated_at        IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'gateway fields may only be set by the payment service';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_billing_gateway()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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

  IF NEW.razorpay_order_id     IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id THEN
    RAISE EXCEPTION 'gateway fields may only be set by the payment service';
  END IF;

  RETURN NEW;
END;
$$;

-- Deleting a customer must still work: that flow removes the profile and every
-- plan, including paid ones. It runs as anon, so the delete guard would block
-- it. Admin deletion is a deliberate act with its own confirmation, so exempt
-- it via a session flag the delete path sets.
CREATE OR REPLACE FUNCTION public.guard_plan_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  today  date := (timezone('Asia/Kolkata', now()))::date;
  purge  text := current_setting('fitved.purge_customer', true);
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN OLD;
  END IF;
  IF purge = 'on' THEN
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

/** Lets the admin "delete customer" flow remove paid plans deliberately. */
CREATE OR REPLACE FUNCTION public.purge_customer(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('fitved.purge_customer', 'on', true);
  DELETE FROM public.plans WHERE user_id = _user_id;
  PERFORM set_config('fitved.purge_customer', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_customer(uuid) TO anon, authenticated, service_role;
