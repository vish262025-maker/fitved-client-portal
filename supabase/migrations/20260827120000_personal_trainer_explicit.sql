-- Offline PERSONAL training must never inherit a trainer.
--
-- THE DEFECT THIS FIXES (verified against the live database):
-- plan_fill_linkage() fills a blank trainer_id from the customer's profile on
-- INSERT *and* UPDATE. That is right for group training — the society slot's
-- trainer is who teaches them. It is wrong for offline personal training,
-- which is sold as one-to-one and assigned by an admin after payment:
--
--   * a personal plan silently inherited the customer's GROUP trainer, so the
--     booking never appeared in Admin → Awaiting trainer, and a trainer gained
--     a one-to-one client nobody had assigned them;
--   * because the trigger also runs on UPDATE, setting trainer_id back to NULL
--     to fix such a row was immediately undone — COALESCE(NULL, profile) puts
--     the same trainer straight back.
--
-- Everything else about the trigger is unchanged: society, slot, mode and the
-- catalogue-derived training_type still fill in exactly as before, and an
-- explicitly supplied trainer_id still always wins.
--
-- Additive & idempotent.

CREATE OR REPLACE FUNCTION public.plan_fill_linkage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr record;
  po record;
  ttype text;
  tmode text;
BEGIN
  -- Resolve what KIND of plan this is first: whether the trainer may be
  -- inherited depends on it, so it cannot be decided afterwards.
  ttype := NEW.training_type;
  IF ttype IS NULL AND NEW.plan_option_id IS NOT NULL THEN
    SELECT o.training_type INTO po FROM public.plan_options o WHERE o.id = NEW.plan_option_id;
    IF FOUND THEN ttype := po.training_type; END IF;
  END IF;
  ttype := COALESCE(ttype, 'group');

  SELECT p.trainer_id, p.society_id, p.time_slot, p.class_mode
    INTO pr
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  IF FOUND THEN
    tmode := COALESCE(NEW.training_mode, pr.class_mode, 'offline');

    -- Offline personal: the trainer is assigned deliberately, by an admin,
    -- and stays NULL until then so the booking surfaces in the admin queue.
    IF tmode = 'offline' AND ttype = 'personal' THEN
      NEW.trainer_id := NEW.trainer_id;
    ELSE
      NEW.trainer_id := COALESCE(NEW.trainer_id, pr.trainer_id);
    END IF;

    NEW.society_id    := COALESCE(NEW.society_id, pr.society_id);
    NEW.time_slot     := COALESCE(NEW.time_slot, pr.time_slot);
    NEW.training_mode := tmode;
  ELSE
    NEW.training_mode := COALESCE(NEW.training_mode, 'offline');
  END IF;

  NEW.training_type := ttype;

  RETURN NEW;
END;
$$;

-- Recreate the trigger so the new body is definitely the one in force.
DROP TRIGGER IF EXISTS plan_fill_linkage_trg ON public.plans;
CREATE TRIGGER plan_fill_linkage_trg
  BEFORE INSERT OR UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.plan_fill_linkage();

-- Repair rows the old behaviour mis-assigned: offline personal subscriptions
-- bought through the gateway whose trainer was never chosen by an admin, but
-- copied from the customer's profile.
UPDATE public.plans p
   SET trainer_id = NULL
 WHERE p.training_mode = 'offline'
   AND p.training_type = 'personal'
   AND p.razorpay_order_id IS NOT NULL
   AND p.trainer_id IS NOT NULL
   AND p.trainer_id = (SELECT pr.trainer_id FROM public.profiles pr WHERE pr.id = p.user_id);
