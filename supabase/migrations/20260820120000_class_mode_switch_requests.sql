-- Class mode (Online/Offline) selection + admin-approved switch requests.
-- Additive & idempotent. Features degrade gracefully until this is run.

-- 1. Store the chosen class mode on the customer profile.
--    Allowed values enforced app-side: 'online' | 'offline' | NULL (not chosen yet).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_mode text;

-- 2. Switch requests: customer asks, admin approves/rejects.
CREATE TABLE IF NOT EXISTS public.mode_switch_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  assigned_admin_id uuid,
  current_mode      text,
  requested_mode    text NOT NULL,          -- 'online' | 'offline'
  status            text NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS mode_switch_requests_admin_idx  ON public.mode_switch_requests (assigned_admin_id);
CREATE INDEX IF NOT EXISTS mode_switch_requests_user_idx   ON public.mode_switch_requests (user_id);
CREATE INDEX IF NOT EXISTS mode_switch_requests_status_idx ON public.mode_switch_requests (status);

-- Anon-key + open-RLS reality (matches the rest of this project).
ALTER TABLE public.mode_switch_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "mode_switch_requests_all" ON public.mode_switch_requests
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
