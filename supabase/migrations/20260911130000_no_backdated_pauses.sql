-- A pause can only be about today or later.
--
-- A pause says "these classes will not happen". Said about a class that is
-- already over, it rewrites history. The customer's Pause page and the
-- trainer's pause dialog hid past dates in their date pickers, but the admin
-- Pauses tab had plain date inputs with no limit and nothing checked on save
-- — which is how Ashwani's 9–11 Sept pause was entered at 11:47 on the 11th,
-- after the 10 Sept class had already been closed as taken.
--
-- And a date picker is not a rule: with the anon key and open RLS, anything
-- that reaches the REST API directly skips every screen. So the database
-- holds the line, with the same rule every screen applies (pauseRules.ts):
--
--   • a new pause starts today or later;
--   • editing a pause may only move dates that are today or later — so a
--     running pause can still be extended, or ended early (to_date moved back
--     as far as yesterday), but its past days stay exactly as they were;
--   • a status-only change (auto-complete, "End") is untouched.
--
-- Deleting is deliberately not blocked: removing a customer clears their
-- pauses, and an admin must be able to remove a pause entered by mistake.
--
-- "Today" is India time, the same clock expire_subscriptions() closes
-- classes by. Existing pauses, past or present, are not touched.
--
-- Additive & idempotent.

CREATE OR REPLACE FUNCTION public.pause_dates_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  today date := (timezone('Asia/Kolkata', now()))::date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.to_date < NEW.from_date THEN
      RAISE EXCEPTION 'A pause must end on or after the day it starts.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.from_date < today THEN
      RAISE EXCEPTION 'A pause can''t start in the past. Pick today or a later date.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only the dates a change actually affects have to be today+.
  IF NEW.from_date IS DISTINCT FROM OLD.from_date
     OR NEW.to_date IS DISTINCT FROM OLD.to_date THEN
    IF NEW.to_date < NEW.from_date THEN
      RAISE EXCEPTION 'A pause must end on or after the day it starts.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.from_date IS DISTINCT FROM OLD.from_date
       AND LEAST(NEW.from_date, OLD.from_date) < today THEN
      RAISE EXCEPTION 'Past classes can''t be changed. Only today or later dates can be moved.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.to_date IS DISTINCT FROM OLD.to_date
       AND LEAST(NEW.to_date, OLD.to_date) < today - 1 THEN
      RAISE EXCEPTION 'Past classes can''t be changed. Only today or later dates can be moved.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pause_dates_guard_trg ON public.pauses;
CREATE TRIGGER pause_dates_guard_trg
  BEFORE INSERT OR UPDATE ON public.pauses
  FOR EACH ROW EXECUTE FUNCTION public.pause_dates_guard();
