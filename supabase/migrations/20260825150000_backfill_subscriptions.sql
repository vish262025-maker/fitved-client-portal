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
