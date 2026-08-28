-- Subscription lifecycle: make `plans` a real subscription record.
--
-- `plans` is already the single source of truth for the calendar, active-plan
-- card, session counts and billing, so this EXTENDS it rather than adding a
-- parallel subscription table.
--
-- What it adds:
--   * commercial terms preserved separately from extensions
--       original_end_date  – what was sold
--       pause_extension_days – days added by pauses/off-days
--       end_date           – current validity (already exists; stays the
--                            authoritative "valid until")
--   * payment/audit fields, so a subscription can be traced to its payment
--   * idempotency guards, so a repeated payment callback cannot activate
--     twice or create a second subscription
--
-- Additive & idempotent. Nothing existing is modified or dropped.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_option_id       uuid,
  ADD COLUMN IF NOT EXISTS training_mode        text,      -- 'offline' | 'online'
  ADD COLUMN IF NOT EXISTS training_type        text,      -- 'group' | 'personal'
  ADD COLUMN IF NOT EXISTS original_end_date    date,
  ADD COLUMN IF NOT EXISTS pause_extension_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status       text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS razorpay_order_id    text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id  text,
  ADD COLUMN IF NOT EXISTS activated_at         timestamptz,
  ADD COLUMN IF NOT EXISTS booking_request_id   uuid;

-- Existing rows were sold on their current end date.
UPDATE public.plans SET original_end_date = end_date WHERE original_end_date IS NULL;

-- Existing plans predate the gateway; they were collected offline.
UPDATE public.plans SET payment_status = 'success'
 WHERE payment_status = 'pending' AND status IN ('active', 'completed', 'stopped');

CREATE INDEX IF NOT EXISTS plans_payment_status_idx ON public.plans (payment_status);
CREATE INDEX IF NOT EXISTS plans_booking_idx        ON public.plans (booking_request_id);

-- One subscription per payment, and per booking: a repeated verification
-- callback hits these instead of creating a second subscription.
CREATE UNIQUE INDEX IF NOT EXISTS plans_razorpay_payment_unique
  ON public.plans (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plans_booking_unique
  ON public.plans (booking_request_id) WHERE booking_request_id IS NOT NULL;

-- Payment audit trail lives with the existing money ledger, not a new one.
ALTER TABLE public.billing_history
  ADD COLUMN IF NOT EXISTS currency            text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS razorpay_order_id   text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS billing_razorpay_payment_unique
  ON public.billing_history (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

-- Pause history: explains exactly how a subscription got extended.
-- Extensions are applied per pause record, and `applied` makes re-processing
-- the same pause a no-op instead of a double extension.
ALTER TABLE public.pauses
  ADD COLUMN IF NOT EXISTS plan_id          uuid,
  ADD COLUMN IF NOT EXISTS extension_days   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by        uuid;

CREATE INDEX IF NOT EXISTS pauses_plan_idx ON public.pauses (plan_id);

/**
 * Subscription status derived from the record itself — never stored stale.
 *   pending_payment | cancelled | paused | expired | active
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
  SELECT * INTO p FROM public.plans WHERE id = _plan_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF p.payment_status <> 'success' THEN RETURN 'pending_payment'; END IF;
  IF p.status = 'stopped' THEN RETURN 'cancelled'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pauses
     WHERE user_id = p.user_id AND status = 'active'
       AND today BETWEEN from_date AND to_date
  ) INTO paused;
  IF paused THEN RETURN 'paused'; END IF;

  IF today > p.end_date THEN RETURN 'expired'; END IF;
  RETURN 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.subscription_status(uuid) TO anon, authenticated;

