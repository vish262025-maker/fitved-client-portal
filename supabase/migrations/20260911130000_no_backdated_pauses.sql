-- Past-dated pauses: the admin may, the customer and trainer may not.
--
-- A pause says "these classes will not happen". From the customer's Pause
-- page or the trainer's pause dialog, a pause starts today or later — neither
-- should be able to rewrite a class that is already over.
--
-- The admin is the exception, on purpose. Customers tell FitVed about a
-- missed class after the fact — Ashwani's 9–11 Sept pause was entered by the
-- admin on the 11th — and when the admin records it, it has to take effect:
-- the class comes off the customer's count, their calendar shows it paused,
-- and the plan is extended. (20260911120000 is what makes the database honour
-- a pause that arrives after its class was already closed as taken.)
--
-- Every screen now records who put the pause in (created_by): the customer's
-- own id, their trainer's, or the admin's. A past start date is accepted only
-- when created_by is an admin or super admin.
--
-- With the anon key and open RLS, created_by is whatever the caller sends, so
-- this is not a security boundary; it keeps every screen, and anything else
-- that writes pauses, to the same rule.
--
-- Only INSERT is checked. Editing dates happens only in the admin tab, which
-- may use any date; status-only changes (auto-complete, "End") and deletes
-- are untouched. Existing pauses are not touched.
--
-- "Today" is India time, the same clock expire_subscriptions() closes
-- classes by.
--
-- Idempotent: safe to run again if an earlier version of this file was run.

CREATE OR REPLACE FUNCTION public.pause_dates_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (timezone('Asia/Kolkata', now()))::date;
BEGIN
  IF NEW.to_date < NEW.from_date THEN
    RAISE EXCEPTION 'A pause must end on or after the day it starts.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.from_date < today
     AND NOT (
       NEW.created_by IS NOT NULL AND (
         EXISTS (SELECT 1 FROM public.admins       a WHERE a.id = NEW.created_by) OR
         EXISTS (SELECT 1 FROM public.super_admins s WHERE s.id = NEW.created_by)
       )
     )
  THEN
    RAISE EXCEPTION 'A pause can''t start in the past. Pick today or a later date.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pause_dates_guard_trg ON public.pauses;
CREATE TRIGGER pause_dates_guard_trg
  BEFORE INSERT ON public.pauses
  FOR EACH ROW EXECUTE FUNCTION public.pause_dates_guard();
