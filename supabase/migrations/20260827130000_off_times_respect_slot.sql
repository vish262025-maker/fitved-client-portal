-- A trainer's day off applies to the SLOT it was booked for, not the whole day.
--
-- THE DEFECT (verified against the live database):
-- generate_sessions() matched trainer_off_times on trainer + date only, and
-- ignored the off-time's time_slot. Admin → Trainers records off-times two
-- ways: whole-day (time_slot NULL) and single-slot (e.g. "7:30 AM – 8:30 AM").
-- A trainer taking their 7:30 slot off was therefore marking EVERY customer's
-- class off that day, including the 9:00 batch that went ahead as normal.
--
-- The app's own plan maths already had this right: countLostTrainingDays()
-- only counts an off-time against a customer whose slot matches. So the two
-- disagreed, and the disagreement fell on the customer:
--
--   * their class was blanked out on the calendar though it actually ran;
--   * the trainer's dashboard showed a day off for a class they taught;
--   * no plan extension was given, because the app correctly saw no loss —
--     so the class was simply lost, and the customer received fewer classes
--     than they bought.
--
-- 28 classes across 18 customers were affected when this was written.
--
-- Slot text is hand-entered in several places, so it is compared with spacing,
-- dash style and case normalised. A customer with no slot recorded still
-- matches every off-time: without a slot we cannot prove their class ran, and
-- crediting a class that did happen is the safer error.
--
-- Idempotent, and never touches a session someone has already marked.

-- Slot text is typed by hand in the admin panel, the booking flow and the
-- trainer roster, so "7:00 AM â 8:00 AM" and "7:00 am - 8:00 am" are the same
-- slot and must compare equal. IMMUTABLE so it can be used in indexes later.
CREATE OR REPLACE FUNCTION public.norm_slot(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT regexp_replace(
           lower(translate(COALESCE(s, ''), '–—‐―', '----')),
           '\s', '', 'g');
$fn$;

GRANT EXECUTE ON FUNCTION public.norm_slot(text) TO anon, authenticated, service_role;

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
     WHERE s.attended IS NULL AND s.status IN ('scheduled', 'paused', 'trainer_off');

  GET DIAGNOSTICS made = ROW_COUNT;
  RETURN made;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sessions(uuid) TO anon, authenticated, service_role;

-- Rebuild every plan that a slot-specific off-time touched, so the classes it
-- wrongly cancelled come back. Sessions someone has already marked are left
-- alone by generate_sessions itself.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT s.plan_id
      FROM public.training_sessions s
      JOIN public.plans p ON p.id = s.plan_id
     WHERE s.status = 'trainer_off'
       AND p.status = 'active'
       AND (p.payment_status IS NULL OR p.payment_status = 'success')
  LOOP
    PERFORM public.generate_sessions(r.plan_id);
  END LOOP;
END $$;
