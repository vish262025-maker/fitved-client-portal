-- Fix: resolve_session_join() fails with 42702 "column reference status is
-- ambiguous", so Join Session returns 400 for every online customer.
--
-- The function's RETURNS TABLE declares an OUT parameter named `status`, and
-- the active-plan lookup compared an UNQUALIFIED `status` against it — Postgres
-- can't tell whether that means the OUT parameter or plans.status, so it
-- refuses the whole call. Every reference is qualified with an alias now.
--
-- CREATE OR REPLACE only; the signature and return shape are unchanged.

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
  SELECT br.* INTO b FROM public.booking_requests br
   WHERE br.id = _booking_id AND br.user_id = _user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- 2. Online only, and not a cancelled booking.
  IF b.training_mode <> 'online' OR b.status = 'cancelled' THEN
    RETURN QUERY SELECT 'not_online'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- 3. There must be an active plan covering today.
  --    `p.status` — qualified, so it can never be read as the OUT parameter.
  SELECT p.* INTO pl FROM public.plans p
   WHERE p.user_id = _user_id AND p.status = 'active'
   ORDER BY p.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_plan'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;
  IF local_now::date < pl.start_date OR local_now::date > pl.end_date THEN
    RETURN QUERY SELECT 'plan_expired'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, server_now; RETURN;
  END IF;

  -- 4. The batch/slot the customer is booked into.
  SELECT ob.* INTO bt FROM public.online_batches ob WHERE ob.id = b.batch_id;
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

GRANT EXECUTE ON FUNCTION public.resolve_session_join(uuid, uuid) TO anon, authenticated;
