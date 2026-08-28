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
