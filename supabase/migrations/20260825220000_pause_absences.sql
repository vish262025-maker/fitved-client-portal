-- A pause counts wherever its dates fall, not only while it is still running.
--
-- THE DEFECT: generate_sessions() marked a session 'paused' only when the
-- pause row was status = 'active'. A pause is flipped to 'completed' the day
-- it ends, so every FINISHED pause stopped counting — the classes it covered
-- came out 'scheduled' and were then closed as 'completed', as if the client
-- had attended. Absences silently disappeared from the calendar once the
-- pause was over.
--
-- The date range is what matters; the status only says whether it is running
-- today. Both user_id and client_id are checked because the pauses table
-- carries both.
--
-- Idempotent, and never touches a session someone has already marked.

CREATE OR REPLACE FUNCTION public.generate_sessions(_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p    record;
  b    record;
  days text[];
  slot text;
  trn  uuid;
  made integer := 0;
BEGIN
  SELECT pl.* INTO p FROM public.plans pl WHERE pl.id = _plan_id;
  IF NOT FOUND THEN RETURN 0; END IF;

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
    days := p.training_days;
    slot := p.time_slot;
    trn  := p.trainer_id;
  END IF;

  IF days IS NULL OR array_length(days, 1) IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.training_sessions AS s (
    plan_id, user_id, training_mode, training_type, batch_id, society_id,
    trainer_id, session_date, time_slot, status
  )
  SELECT
    p.id, p.user_id, COALESCE(p.training_mode, 'offline'), COALESCE(p.training_type, 'group'),
    p.batch_id, p.society_id, trn, d::date, slot,
    CASE
      -- Any pause covering this date, finished or not.
      WHEN EXISTS (
        SELECT 1 FROM public.pauses pz
         WHERE (pz.user_id = p.user_id OR pz.client_id = p.user_id)
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
     SET trainer_id    = EXCLUDED.trainer_id,
         batch_id      = EXCLUDED.batch_id,
         society_id    = EXCLUDED.society_id,
         training_mode = EXCLUDED.training_mode,
         training_type = EXCLUDED.training_type,
         time_slot     = EXCLUDED.time_slot,
         status        = EXCLUDED.status
     WHERE s.attended IS NULL AND s.status IN ('scheduled', 'paused', 'trainer_off');

  GET DIAGNOSTICS made = ROW_COUNT;
  RETURN made;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sessions(uuid) TO anon, authenticated, service_role;

-- Repair sessions that a finished pause should have covered.
UPDATE public.training_sessions s
   SET status = 'paused'
 WHERE s.attended IS NULL
   AND s.status IN ('scheduled', 'completed')
   AND EXISTS (
     SELECT 1 FROM public.pauses pz
      WHERE (pz.user_id = s.user_id OR pz.client_id = s.user_id)
        AND s.session_date BETWEEN pz.from_date AND pz.to_date
   );

-- Never let expiry re-close a paused class as delivered.
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
  UPDATE public.training_sessions
     SET status = 'completed'
   WHERE status = 'scheduled' AND session_date < today AND attended IS NULL;

  UPDATE public.plans
     SET status = 'completed', updated_at = now()
   WHERE status = 'active' AND end_date < today;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO anon, authenticated, service_role;
