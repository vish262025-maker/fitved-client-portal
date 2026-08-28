-- Fix signups that lose the customer's details.
--
-- THE DEFECT: the signup wizard kept name/phone/DOB in localStorage and mailed
-- a Firebase link. Gmail opens links in whatever browser it likes, so the link
-- routinely landed in a browser that had none of that data — producing an
-- email-verified visitor with no details, i.e. the blank profile.
--
-- The details now live server-side against a random token, and only that token
-- travels in the link. Any browser can therefore finish the signup.
--
-- Deliberately NOT putting the details in the URL: date of birth is this app's
-- password, and a URL ends up in the mail body, browser history and referrer
-- headers.
--
-- The table is never readable directly — anon has no select/update/delete
-- grant. It is written and consumed only through the two SECURITY DEFINER
-- functions below, and consuming deletes the row, so a token works once.

CREATE TABLE IF NOT EXISTS public.pending_signups (
  token       text PRIMARY KEY,
  email       text NOT NULL,
  name        text NOT NULL,
  phone       text NOT NULL,
  dob         date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE INDEX IF NOT EXISTS pending_signups_email_idx ON public.pending_signups (email);

ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;
-- No policies: direct access is impossible for anon/authenticated. Everything
-- goes through the definer functions.

REVOKE ALL ON public.pending_signups FROM anon, authenticated;

/** Stashes a signup and returns its one-time token. */
CREATE OR REPLACE FUNCTION public.create_pending_signup(
  _email text, _name text, _phone text, _dob date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text := encode(gen_random_bytes(24), 'hex');
BEGIN
  DELETE FROM public.pending_signups WHERE expires_at < now();
  -- One live signup per email: re-sending replaces the previous attempt.
  DELETE FROM public.pending_signups WHERE lower(email) = lower(_email);

  INSERT INTO public.pending_signups (token, email, name, phone, dob)
  VALUES (t, lower(_email), _name, _phone, _dob);

  RETURN t;
END;
$$;

/**
 * Exchanges a token for the stashed details, once.
 * The row is deleted as it is read, so a leaked link cannot be replayed.
 */
CREATE OR REPLACE FUNCTION public.consume_pending_signup(_token text)
RETURNS TABLE (email text, name text, phone text, dob date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  DELETE FROM public.pending_signups p
   WHERE p.token = _token
     AND p.expires_at > now()
  RETURNING p.email, p.name, p.phone, p.dob;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pending_signup(text, text, text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pending_signup(text) TO anon, authenticated;
