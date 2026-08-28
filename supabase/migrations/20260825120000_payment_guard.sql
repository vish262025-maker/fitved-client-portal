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
