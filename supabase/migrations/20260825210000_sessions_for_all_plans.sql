-- Session history must cover ended plans too.
--
-- THE DEFECT: sessions were only ever generated for plans with status
-- 'active'. A client whose 3-month plan finished in August therefore has no
-- session rows at all, so the trainer's calendar shows one attendee on a day
-- four people actually trained. History disappeared the moment a plan ended.
--
-- A session row IS the history. It should exist for every plan that was paid
-- for and had dates, whatever the plan's status is now. Only FUTURE classes
-- of a stopped plan should be cancelled.
--
-- Idempotent: generate_sessions() upserts and never overwrites a marked
-- session, so re-running this cannot duplicate or erase anything.

CREATE OR REPLACE FUNCTION public.plan_sync_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lay out the whole term first — including for plans that have since ended,
  -- because those rows are the record of classes that really happened.
  PERFORM public.generate_sessions(NEW.id);

  -- A subscription that is no longer running must not keep producing FUTURE
  -- classes; past ones stay exactly as they were.
  IF NEW.status <> 'active' THEN
    UPDATE public.training_sessions
       SET status = 'cancelled'
     WHERE plan_id = NEW.id
       AND status = 'scheduled'
       AND session_date > (timezone('Asia/Kolkata', now()))::date;
  END IF;

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

-- Backfill the history that was never generated, for every plan.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.plans ORDER BY start_date LOOP
    PERFORM public.generate_sessions(r.id);
  END LOOP;
END $$;

-- Classes in the past that nobody marked were delivered; future ones stay
-- scheduled. Stopped plans keep their history but lose future classes.
UPDATE public.training_sessions s
   SET status = 'completed'
 WHERE s.status = 'scheduled'
   AND s.attended IS NULL
   AND s.session_date < (timezone('Asia/Kolkata', now()))::date;

UPDATE public.training_sessions s
   SET status = 'cancelled'
  FROM public.plans p
 WHERE p.id = s.plan_id
   AND p.status <> 'active'
   AND s.status = 'scheduled'
   AND s.session_date > (timezone('Asia/Kolkata', now()))::date;
