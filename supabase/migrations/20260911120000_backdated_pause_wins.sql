-- A pause entered after the fact still takes its classes back.
--
-- THE DEFECT (verified against the live database, 11 Sept 2026):
-- generate_sessions() re-applies pauses to a plan's classes whenever a pause
-- is inserted, but its ON CONFLICT clause only rewrites rows that are still
-- 'scheduled', 'paused' or 'trainer_off':
--
--     WHERE s.attended IS NULL AND s.status IN ('scheduled', 'paused', 'trainer_off')
--
-- expire_subscriptions() ages every past 'scheduled' class to 'completed'
-- overnight. So a pause entered even one day late — Ashwani's 9–11 Sept pause
-- was saved at 11:47 on the 11th — arrives to find the 10 Sept class already
-- 'completed', and is not allowed to touch it. The pause is recorded, the
-- plan is extended for it, and yet the calendar ticks the class as attended
-- and the dashboard counts it as used.
--
-- Six classes across three customers were in that state.
--
-- A 'completed' row nobody marked (attended and marked_by both empty) is the
-- nightly job's bookkeeping, not a record of attendance — nothing in the app
-- writes either column yet. A pause outranks it. A class a person actually
-- marked is still never touched.
--
-- Everything else is unchanged from 20260827140000.
--
-- Additive & idempotent.

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

  -- Online GROUP takes its schedule from the batch everyone shares. Online
  -- PERSONAL has no batch — it is one-to-one, arranged around the customer —
  -- so its schedule lives on the plan itself, exactly as offline does.
  IF p.training_mode = 'online' AND p.batch_id IS NOT NULL THEN
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
               -- The slot is the whole point: a 7:30 off-time does not cancel
               -- the 9:00 class.
               AND (
                 o.time_slot IS NULL
                 OR slot IS NULL
                 OR public.norm_slot(o.time_slot) = public.norm_slot(slot)
               )
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
     WHERE s.attended IS NULL
       AND (
         s.status IN ('scheduled', 'paused', 'trainer_off')
         -- An auto-aged class that a pause or a trainer's day off turns out to
         -- cover. Only in that direction: an unmarked past class is never
         -- reset to 'scheduled' just because generate_sessions ran again.
         OR (s.status = 'completed'
             AND s.marked_by IS NULL
             AND EXCLUDED.status IN ('paused', 'trainer_off'))
       );

  GET DIAGNOSTICS made = ROW_COUNT;
  RETURN made;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sessions(uuid) TO anon, authenticated, service_role;

-- Repair: re-run every active plan through the corrected function, the same
-- path the pause trigger uses, so existing rows match what the rules produce.
-- Touches only unmarked rows; a class someone marked is left exactly as is.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id FROM public.plans p
     WHERE p.status = 'active'
       AND (p.payment_status IS NULL OR p.payment_status = 'success')
  LOOP
    PERFORM public.generate_sessions(r.id);
  END LOOP;
END $$;

-- Plans that have already finished are not regenerated above; repair their
-- pause-covered classes directly, under the same "nobody marked it" guard.
UPDATE public.training_sessions s
   SET status = 'paused'
 WHERE s.status = 'completed'
   AND s.attended IS NULL
   AND s.marked_by IS NULL
   AND EXISTS (
     SELECT 1 FROM public.pauses pz
      WHERE (pz.user_id = s.user_id OR pz.client_id = s.user_id)
        AND s.session_date BETWEEN pz.from_date AND pz.to_date
   );
