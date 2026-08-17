-- Per-admin ownership of marketing posts (additive — safe to run more than once).
--
-- Each admin manages their own promo cards, so a brand-new admin's Marketing
-- page starts empty instead of showing another admin's posts. Nullable column,
-- nothing removed. The public marketing feed shown to customers/trainers is
-- unchanged — it still surfaces every live post.

ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS assigned_admin_id uuid;

CREATE INDEX IF NOT EXISTS marketing_posts_assigned_admin_idx ON public.marketing_posts (assigned_admin_id);

-- Backfill: existing posts belong to the original (earliest) admin, keeping
-- them in that admin's dashboard while new admins start with a clean slate.
UPDATE public.marketing_posts
   SET assigned_admin_id = (SELECT id FROM public.admins ORDER BY created_at ASC LIMIT 1)
 WHERE assigned_admin_id IS NULL;
