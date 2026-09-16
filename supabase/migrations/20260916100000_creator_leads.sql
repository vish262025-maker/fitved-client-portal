-- Creator-partner campaign leads (Instagram teaser -> landing page -> interest
-- form), kept separate from `leads`/`b2b_leads`: different shape, different
-- funnel stage (curiosity, not a service enquiry), same "public inserts,
-- nobody else reads via the anon key" pattern.
--
-- `goal` is a comma-joined list of the multi-select options chosen (e.g.
-- "lose_weight,feel_stronger") — plain text, not an array/jsonb column,
-- since one creator's fixed 4-option question doesn't need either yet.
CREATE TABLE IF NOT EXISTS public.creator_leads (
  id             uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     timestamptz DEFAULT now() NOT NULL,
  creator        text    NOT NULL,   -- e.g. "swati_singh"
  campaign       text    NOT NULL,   -- e.g. "mostlymumma" — which page/drop this came from
  name           text    NOT NULL,
  phone          text    NOT NULL,
  goal           text,               -- comma-joined selections, nullable (optional question)
  activity_level text,               -- single selection, nullable (optional question)
  source         text
);

ALTER TABLE public.creator_leads ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a lead from a public creator landing page.
-- Deliberately no SELECT/UPDATE/DELETE policy: the anon key used by the
-- browser can write but not read this table, so a lead's name/phone can't be
-- scraped client-side. View rows in the Supabase table editor, same as
-- `leads` and `b2b_leads` today.
CREATE POLICY "anyone can submit a creator lead"
ON public.creator_leads FOR INSERT
WITH CHECK (true);
