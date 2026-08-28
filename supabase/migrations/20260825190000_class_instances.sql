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
