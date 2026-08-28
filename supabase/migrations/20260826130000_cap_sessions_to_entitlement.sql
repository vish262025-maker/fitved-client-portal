-- Generate only the classes the customer actually bought.
--
-- THE DEFECT: generate_sessions() laid out every slot between start and end
-- date. A 2-month term at 3 days/week is ~26 slots, so a customer who bought
-- 10 sessions saw 26 classes on their calendar — 16 they are not entitled to.
--
-- The term is the OUTER BOUND (the plan expires on its end date even if
-- sessions remain), and total_sessions is the ENTITLEMENT. Classes stop at
-- whichever comes first.
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
  cap  integer;
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

  -- No entitlement recorded (legacy rows) means "every slot in the term",
  -- which is how those plans have always behaved.
  cap := NULLIF(COALESCE(p.total_sessions, 0), 0);

  INSERT INTO public.training_sessions AS s (
    plan_id, user_id, training_mode, training_type, batch_id, society_id,
    trainer_id, session_date, time_slot, status
  )
  SELECT plan_id, user_id, tmode, ttype, bid, sid, tid, sdate, tslot, st
  FROM (
    SELECT *,
           -- Classes actually delivered up to and including this date. Lost
           -- ones (pause / trainer off) are not counted, so the customer still
           -- receives everything they paid for.
           SUM(CASE WHEN st IN ('paused', 'trainer_off') THEN 0 ELSE 1 END)
             OVER (ORDER BY sdate ROWS UNBOUNDED PRECEDING) AS delivered_so_far
    FROM (
      SELECT
        p.id AS plan_id, p.user_id,
        COALESCE(p.training_mode, 'offline') AS tmode,
        COALESCE(p.training_type, 'group')   AS ttype,
        p.batch_id AS bid, p.society_id AS sid, trn AS tid,
        d::date AS sdate, slot AS tslot,
        CASE
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
        END AS st
      FROM generate_series(p.start_date::timestamp, p.end_date::timestamp, interval '1 day') AS d
      WHERE trim(to_char(d, 'FMDay')) = ANY (days)
    ) AS slots
  ) AS picked
  WHERE cap IS NULL OR delivered_so_far <= cap
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

-- Remove classes beyond the entitlement. Only unmarked, still-scheduled ones:
-- anything already taught or recorded stays as history.
WITH ranked AS (
  SELECT s.id,
         SUM(CASE WHEN s.status IN ('paused', 'trainer_off') THEN 0 ELSE 1 END)
           OVER (PARTITION BY s.plan_id ORDER BY s.session_date ROWS UNBOUNDED PRECEDING)
           AS delivered_so_far,
         p.total_sessions
    FROM public.training_sessions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE COALESCE(p.total_sessions, 0) > 0
)
DELETE FROM public.training_sessions t
 USING ranked r
 WHERE t.id = r.id
   AND r.delivered_so_far > r.total_sessions
   AND t.attended IS NULL
   AND t.status = 'scheduled';
