-- ═══════════════════════════════════════════════════════════════════════════
-- FitVed — remaining migrations (RESUME after the 42P17 failure).
--
-- The previous run stopped at the class_key generated column: date->text is
-- only STABLE (it depends on DateStyle), which Postgres refuses in a
-- generated expression. It now uses days-since-epoch, which is integer
-- arithmetic and immutable.
--
-- Everything before that point already applied. Safe to run this whole file
-- again: every statement is idempotent and nothing is deleted.
--
-- Supabase → SQL Editor → New query → paste → Run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 20260825180000_self_maintaining_sessions.sql
-- ───────────────────────────────────────────────────────────────────
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


-- ───────────────────────────────────────────────────────────────────
-- 20260825190000_class_instances.sql
-- ───────────────────────────────────────────────────────────────────
-- One completed SLOT = one class taken. Customers must never multiply it.
--
-- THE DEFECT (measured on live data): training_sessions holds one row per
-- CUSTOMER per date, so counting rows counts attendance, not classes. Suma's
-- August read 95 classes when she actually taught 20 — a 4.8x overstatement.
-- Trainers whose batches currently hold one client were unaffected, which is
-- why it went unnoticed.
--
-- Rather than a second table, this gives every row the identity of the class
-- instance it belongs to. Group rows sharing a trainer + date + slot + batch
-- collapse to one key; personal rows are their own class. "Classes taken" is
-- then COUNT(DISTINCT class_key) and attendance stays one row per customer.
--
-- Additive & idempotent. No row is deleted or rewritten.

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS class_key text
  GENERATED ALWAYS AS (
    CASE
      WHEN COALESCE(training_type, 'group') = 'group' THEN
        COALESCE(training_mode, 'offline')
        || '|' || COALESCE(trainer_id::text, '-')
        -- date->text depends on the DateStyle setting, so it is only STABLE
        -- and Postgres rejects it in a generated column (42P17). Days since
        -- the epoch is integer arithmetic, which is immutable.
        || '|' || (session_date - DATE '1970-01-01')::text
        || '|' || COALESCE(time_slot, '-')
        || '|' || COALESCE(batch_id::text, society_id::text, '-')
      -- Personal training is one trainer, one customer, one slot: the row IS
      -- the class.
      ELSE id::text
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS sessions_class_key_idx ON public.training_sessions (class_key);
CREATE INDEX IF NOT EXISTS sessions_trainer_month_idx
  ON public.training_sessions (trainer_id, service_mode, status, session_date);

/**
 * Classes actually taught by a trainer, per service mode, per month.
 *
 * Counts distinct class instances with status 'completed' only — future,
 * cancelled, paused and trainer-off sessions are excluded by definition.
 */
CREATE OR REPLACE FUNCTION public.trainer_class_counts(_trainer_id uuid)
RETURNS TABLE (service_mode text, month text, classes integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.service_mode,
         to_char(s.session_date, 'YYYY-MM') AS month,
         COUNT(DISTINCT s.class_key)::int   AS classes
    FROM public.training_sessions s
   WHERE s.trainer_id = _trainer_id
     AND s.status = 'completed'
   GROUP BY s.service_mode, to_char(s.session_date, 'YYYY-MM')
   ORDER BY month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.trainer_class_counts(uuid) TO anon, authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────
-- 20260825200000_trainer_clients_plan_state.sql
-- ───────────────────────────────────────────────────────────────────
-- Trainer roster: show every client in the batch, including ended plans.
--
-- THE DEFECT: get_trainer_clients() joined only the ACTIVE plan, so a client
-- whose plan had finished came back with end_date and training_days NULL.
-- On mobile that made them look like they had no plan at all, while the
-- desktop roster showed them properly — the same customer, two different
-- answers.
--
-- The batch membership is the society + slot on the profile and does not end
-- when a plan does. This returns each client's MOST RECENT plan whatever its
-- status, plus an explicit plan_state so the UI can label them rather than
-- silently blanking their details.
--
-- Return type gains a column, so the function must be dropped and recreated.

DROP FUNCTION IF EXISTS public.get_trainer_clients(uuid);

CREATE FUNCTION public.get_trainer_clients(_trainer_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  society_id uuid,
  time_slot text,
  training_days text[],
  end_date date,
  is_paused_today boolean,
  plan_state text          -- 'active' | 'expired' | 'none'
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT COALESCE(
      CASE WHEN public.has_role(auth.uid(), 'admin') THEN _trainer_id END,
      (SELECT t.id FROM public.trainers t WHERE t.user_id = auth.uid() LIMIT 1),
      _trainer_id
    ) AS trainer_id
  ),
  roster AS (
    SELECT p.id, p.name, p.phone, p.society_id, p.time_slot
      FROM public.profiles p, me
     WHERE p.trainer_id = me.trainer_id
  ),
  latest AS (
    -- Most recent plan per client, regardless of status.
    SELECT DISTINCT ON (pl.user_id)
           pl.user_id, pl.training_days, pl.end_date, pl.status
      FROM public.plans pl
      JOIN roster r ON r.id = pl.user_id
     ORDER BY pl.user_id, pl.created_at DESC
  )
  SELECT r.id, r.name, r.phone, r.society_id, r.time_slot,
         l.training_days,
         l.end_date,
         EXISTS (
           SELECT 1 FROM public.pauses pz
            WHERE pz.user_id = r.id AND pz.status = 'active'
              AND (timezone('Asia/Kolkata', now()))::date BETWEEN pz.from_date AND pz.to_date
         ) AS is_paused_today,
         CASE
           WHEN l.user_id IS NULL THEN 'none'
           WHEN l.status = 'active'
            AND (l.end_date IS NULL OR l.end_date >= (timezone('Asia/Kolkata', now()))::date)
             THEN 'active'
           ELSE 'expired'
         END AS plan_state
    FROM roster r
    LEFT JOIN latest l ON l.user_id = r.id;
$$;

-- The app authenticates with the publishable key and its own session layer,
-- so the trainer dashboard calls this as anon. Kept as-is; the function still
-- exposes no DOB, amount or payment column.
GRANT EXECUTE ON FUNCTION public.get_trainer_clients(uuid) TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────────
-- 20260825210000_sessions_for_all_plans.sql
-- ───────────────────────────────────────────────────────────────────
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


-- ───────────────────────────────────────────────────────────────────
-- 20260825220000_pause_absences.sql
-- ───────────────────────────────────────────────────────────────────
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


-- ── Verification ───────────────────────────────────────────────────────────
-- 1. class_key exists and collapses a batch to one class per slot.
SELECT COUNT(*) AS attendance_rows, COUNT(DISTINCT class_key) AS classes
  FROM public.training_sessions WHERE status = 'completed';

-- 2. Roster now reports plan state (ended plans stay visible).
SELECT g.plan_state, COUNT(*) AS clients
  FROM public.trainers t
  CROSS JOIN LATERAL public.get_trainer_clients(t.id) g
 GROUP BY g.plan_state ORDER BY g.plan_state;

-- 3. Session statuses.
SELECT status, COUNT(*) FROM public.training_sessions GROUP BY status ORDER BY status;
