-- Online live-session join: private meeting config + a server-side resolver.
--
-- The meeting platform and URL are ADMIN-ONLY implementation details. The
-- customer UI never selects them; it calls resolve_session_join(), which does
-- every check in the database (ownership, online plan, active plan, join
-- window, configured destination) and returns the URL only when all pass.
-- Time comes from the database clock, not the browser.
--
-- Additive & idempotent. Nothing existing is modified.

ALTER TABLE public.online_batches
  ADD COLUMN IF NOT EXISTS meeting_platform text,   -- 'google_meet' | 'zoom'
  ADD COLUMN IF NOT EXISTS meeting_url text;

-- How early a customer may join, in minutes.
CREATE OR REPLACE FUNCTION public.online_join_window_minutes()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;

/**
 * Resolves the meeting destination for one customer's next/current session.
 *
 * Returns exactly one row:
 *   status: 'ok' | 'not_found' | 'not_online' | 'no_plan' | 'plan_expired'
 *         | 'not_scheduled_today' | 'too_early' | 'ended' | 'not_configured'
 *   join_url: only populated when status = 'ok'
 *   starts_at / ends_at: today's session window (local), for the UI countdown
 *   server_now: database time, so the client never trusts its own clock
 */
CREATE OR REPLACE FUNCTION public.resolve_session_join(
  _user_id uuid,
  _booking_id uuid
)
RETURNS TABLE (
  status text,
  join_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  server_now timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b            record;
  bt           record;
  pl           record;
  tz           text := 'Asia/Kolkata';
  local_now    timestamp;
  today_name   text;
  s_time       time;
  e_time       time;
  s_at         timestamptz;
  e_at         timestamptz;
  win          integer := public.online_join_window_minutes();
BEGIN
  server_now := now();
  local_now  := timezone(tz, now());
  today_name := trim(to_char(local_now, 'FMDay'));

  -- 1. The booking must exist AND belong to this customer. Passing someone
  --    else's booking id simply returns not_found.
  SELECT * INTO b FROM public.booking_requests
   WHERE id = _booking_id AND user_id = _user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- 2. Online only, and not a cancelled booking.
  IF b.training_mode <> 'online' OR b.status = 'cancelled' THEN
    RETURN QUERY SELECT 'not_online'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- 3. There must be an active plan covering today.
  SELECT * INTO pl FROM public.plans
   WHERE user_id = _user_id AND status = 'active'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_plan'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;
  IF local_now::date < pl.start_date OR local_now::date > pl.end_date THEN
    RETURN QUERY SELECT 'plan_expired'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- 4. The batch/slot the customer is booked into.
  SELECT * INTO bt FROM public.online_batches WHERE id = b.batch_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_configured'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- 5. Does this batch actually run today?
  IF NOT (today_name = ANY (bt.days)) THEN
    RETURN QUERY SELECT 'not_scheduled_today'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- Times are stored as display text ("7:00 AM"); bad/missing values are
  -- treated as "not configured" rather than raising.
  BEGIN
    s_time := to_timestamp(bt.start_time, 'HH12:MI AM')::time;
    e_time := to_timestamp(bt.end_time,   'HH12:MI AM')::time;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'not_configured'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END;
  IF s_time IS NULL OR e_time IS NULL THEN
    RETURN QUERY SELECT 'not_configured'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  s_at := timezone(tz, (local_now::date + s_time));
  e_at := timezone(tz, (local_now::date + e_time));

  -- 6. Join window: opens `win` minutes before the start, closes at the end.
  IF now() < s_at - make_interval(mins => win) THEN
    RETURN QUERY SELECT 'too_early'::text, NULL::text, s_at, e_at, server_now; RETURN;
  END IF;
  IF now() > e_at THEN
    RETURN QUERY SELECT 'ended'::text, NULL::text, s_at, e_at, server_now; RETURN;
  END IF;

  -- 7. A destination must actually be configured.
  IF bt.meeting_url IS NULL OR btrim(bt.meeting_url) = '' THEN
    RETURN QUERY SELECT 'not_configured'::text, NULL::text, s_at, e_at, server_now; RETURN;
  END IF;

  RETURN QUERY SELECT 'ok'::text, bt.meeting_url, s_at, e_at, server_now;
END;
$$;

/**
 * Session state for the customer UI — the same checks WITHOUT ever returning
 * the URL, so the card can render its countdown/disabled state safely.
 */
CREATE OR REPLACE FUNCTION public.online_session_state(
  _user_id uuid,
  _booking_id uuid
)
RETURNS TABLE (
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  server_now timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.status, r.starts_at, r.ends_at, r.server_now
    FROM public.resolve_session_join(_user_id, _booking_id) r;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_session_join(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.online_session_state(uuid, uuid) TO anon, authenticated;
