-- Make the subscription→trainer→session chain self-maintaining.
--
-- THE DEFECT THIS FIXES (verified against the live database):
-- A plan created through the admin Plan tab came out with trainer_id,
-- society_id, time_slot and training_mode all NULL, and zero sessions. The
-- earlier backfill was a one-time repair, so linkage was only ever correct for
-- rows that existed the day it ran. Every customer added afterwards would be
-- invisible on their trainer's dashboard with an empty calendar.
--
-- Fixing it in the booking pages would only cover the paths that go through
-- them. These triggers cover every path — admin panel, purchase flow, webhook,
-- SQL editor — because they live on the tables themselves.
--
-- Additive & idempotent.

/**
 * Fill a plan's linkage from the customer's profile when it wasn't supplied.
 * Explicit values always win; this only completes what was left blank.
 */
CREATE OR REPLACE FUNCTION public.plan_fill_linkage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr record;
  po record;
BEGIN
  SELECT p.trainer_id, p.society_id, p.time_slot, p.class_mode
    INTO pr
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  IF FOUND THEN
    NEW.trainer_id    := COALESCE(NEW.trainer_id, pr.trainer_id);
    NEW.society_id    := COALESCE(NEW.society_id, pr.society_id);
    NEW.time_slot     := COALESCE(NEW.time_slot, pr.time_slot);
    NEW.training_mode := COALESCE(NEW.training_mode, pr.class_mode, 'offline');
  ELSE
    NEW.training_mode := COALESCE(NEW.training_mode, 'offline');
  END IF;

  -- Prefer what the catalogue says the plan is.
  IF NEW.training_type IS NULL AND NEW.plan_option_id IS NOT NULL THEN
    SELECT o.training_type INTO po FROM public.plan_options o WHERE o.id = NEW.plan_option_id;
    IF FOUND THEN NEW.training_type := po.training_type; END IF;
  END IF;

  -- Online 1-to-1 is the only track with no batch; everything else here is the
  -- society/batch model, which is group training.
  NEW.training_type := COALESCE(NEW.training_type, 'group');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_fill_linkage_trg ON public.plans;
CREATE TRIGGER plan_fill_linkage_trg
  BEFORE INSERT OR UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.plan_fill_linkage();

/**
 * Keep the calendar in step with the subscription.
 * generate_sessions() is idempotent and never overwrites a marked session, so
 * firing it on every schedule change is safe.
 */
CREATE OR REPLACE FUNCTION public.plan_sync_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A subscription that is no longer running must stop producing classes.
  IF NEW.status <> 'active' THEN
    UPDATE public.training_sessions
       SET status = 'cancelled'
     WHERE plan_id = NEW.id
       AND status = 'scheduled'
       AND session_date > (timezone('Asia/Kolkata', now()))::date;
    RETURN NULL;
  END IF;

  PERFORM public.generate_sessions(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS plan_sync_sessions_trg ON public.plans;
CREATE TRIGGER plan_sync_sessions_trg
  AFTER INSERT OR UPDATE OF
    start_date, end_date, training_days, time_slot, trainer_id, batch_id,
    society_id, payment_status, training_mode, training_type, status
  ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.plan_sync_sessions();

/**
 * Reassigning a customer's trainer, society or slot must reach their running
 * subscription — otherwise the new trainer never sees them. Updating the plan
 * cascades into the two triggers above, which rebuild the calendar.
 */
CREATE OR REPLACE FUNCTION public.profile_sync_plans()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.plans
     SET trainer_id    = NEW.trainer_id,
         society_id    = COALESCE(NEW.society_id, society_id),
         time_slot     = COALESCE(NEW.time_slot, time_slot),
         training_mode = COALESCE(training_mode, NEW.class_mode, 'offline'),
         updated_at    = now()
   WHERE user_id = NEW.id
     AND status = 'active'
     -- Online subscriptions take their trainer from the batch, not the
     -- customer's offline society assignment.
     AND COALESCE(training_mode, 'offline') <> 'online';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS profile_sync_plans_trg ON public.profiles;
CREATE TRIGGER profile_sync_plans_trg
  AFTER UPDATE OF trainer_id, society_id, time_slot, class_mode ON public.profiles
  FOR EACH ROW
  WHEN (OLD.trainer_id IS DISTINCT FROM NEW.trainer_id
     OR OLD.society_id IS DISTINCT FROM NEW.society_id
     OR OLD.time_slot  IS DISTINCT FROM NEW.time_slot
     OR OLD.class_mode IS DISTINCT FROM NEW.class_mode)
  EXECUTE FUNCTION public.profile_sync_plans();

/** Rebuild the calendars a trainer's availability change affects. */
CREATE OR REPLACE FUNCTION public.offtime_sync_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid := COALESCE(NEW.trainer_id, OLD.trainer_id);
  r   record;
BEGIN
  FOR r IN
    SELECT id FROM public.plans WHERE trainer_id = tid AND status = 'active'
  LOOP
    PERFORM public.generate_sessions(r.id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS offtime_sync_sessions_trg ON public.trainer_off_times;
CREATE TRIGGER offtime_sync_sessions_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_off_times
  FOR EACH ROW EXECUTE FUNCTION public.offtime_sync_sessions();

/** Same for a customer pause — their own classes flip to 'paused' and back. */
CREATE OR REPLACE FUNCTION public.pause_sync_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := COALESCE(NEW.user_id, OLD.user_id, NEW.client_id, OLD.client_id);
  r   record;
BEGIN
  FOR r IN
    SELECT id FROM public.plans WHERE user_id = uid AND status = 'active'
  LOOP
    PERFORM public.generate_sessions(r.id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS pause_sync_sessions_trg ON public.pauses;
CREATE TRIGGER pause_sync_sessions_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.pauses
  FOR EACH ROW EXECUTE FUNCTION public.pause_sync_sessions();

-- Repair every existing row through the same path the triggers use, so the
-- current data matches what the rules would have produced.
UPDATE public.plans p
   SET trainer_id    = COALESCE(p.trainer_id, pr.trainer_id),
       society_id    = COALESCE(p.society_id, pr.society_id),
       time_slot     = COALESCE(p.time_slot, pr.time_slot),
       training_mode = COALESCE(p.training_mode, pr.class_mode, 'offline'),
       updated_at    = now()
  FROM public.profiles pr
 WHERE pr.id = p.user_id
   AND p.status = 'active';
