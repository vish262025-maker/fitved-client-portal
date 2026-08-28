-- service_mode as a first-class property of plans and sessions.
--
-- A trainer works in four independent tracks — offline personal, offline group,
-- online personal, online group — and nothing may leak between them. Until now
-- the mode had to be inferred (society present? batch present?), which is
-- exactly what makes counts and calendars bleed into each other.
--
-- training_mode already existed; this adds training_type alongside it and
-- derives a single stored service_mode from the pair, so every query can filter
-- on one indexed column instead of reconstructing the mode.
--
-- Backfill: every existing plan is offline and society-batch based — the
-- historical FitVed model, which is group training. Offline personal only
-- became purchasable with the new booking flow, so it has no legacy rows.
--
-- Additive & idempotent. No record is deleted or overwritten with a guess
-- where real information already exists.

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS training_type text;

-- Prefer what the booking actually said; fall back to the historical model.
UPDATE public.plans p
   SET training_type = b.training_type
  FROM public.booking_requests b
 WHERE b.user_id = p.user_id
   AND b.training_type IS NOT NULL
   AND p.training_type IS NULL;

UPDATE public.plans
   SET training_type = 'group'
 WHERE training_type IS NULL
   AND COALESCE(training_mode, 'offline') = 'offline';

UPDATE public.plans
   SET training_type = 'group'
 WHERE training_type IS NULL AND batch_id IS NOT NULL;

UPDATE public.plans
   SET training_type = 'personal'
 WHERE training_type IS NULL;

UPDATE public.plans
   SET training_mode = 'offline'
 WHERE training_mode IS NULL;

-- Sessions inherit the mode of the subscription that produced them.
UPDATE public.training_sessions s
   SET training_type = p.training_type,
       training_mode = COALESCE(s.training_mode, p.training_mode)
  FROM public.plans p
 WHERE p.id = s.plan_id
   AND (s.training_type IS DISTINCT FROM p.training_type OR s.training_mode IS NULL);

-- One indexed column to filter on, derived rather than stored by hand so it
-- can never drift from the pair it is built from.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS service_mode text
  GENERATED ALWAYS AS (
    COALESCE(training_mode, 'offline') || '_' || COALESCE(training_type, 'group')
  ) STORED;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS service_mode text
  GENERATED ALWAYS AS (
    COALESCE(training_mode, 'offline') || '_' || COALESCE(training_type, 'group')
  ) STORED;

CREATE INDEX IF NOT EXISTS plans_service_mode_idx    ON public.plans (service_mode);
CREATE INDEX IF NOT EXISTS sessions_service_mode_idx ON public.training_sessions (service_mode);
CREATE INDEX IF NOT EXISTS sessions_trainer_mode_idx
  ON public.training_sessions (trainer_id, service_mode, session_date);

-- Regenerate sessions with the mode stamped on them.
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
      WHEN EXISTS (
        SELECT 1 FROM public.pauses pz
         WHERE pz.user_id = p.user_id AND pz.status = 'active'
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

-- Correction: expire_subscriptions() marked every past 'scheduled' session
-- 'missed', which brands classes that were actually delivered as missed. In
-- FitVed a class happens unless a pause or a trainer off-day says otherwise —
-- that is exactly how the old derived dashboard counted "classes taken".
-- 'missed' must mean someone explicitly recorded an absence.
UPDATE public.training_sessions
   SET status = 'completed'
 WHERE status = 'missed' AND attended IS NULL;

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
  -- A past class with nothing recorded against it was delivered.
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
