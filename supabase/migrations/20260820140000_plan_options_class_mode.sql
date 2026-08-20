-- Split the plan catalog by class mode (Online vs Offline) in addition to
-- training type. Additive & idempotent. Existing plans default to "offline".
ALTER TABLE public.plan_options
  ADD COLUMN IF NOT EXISTS class_mode text NOT NULL DEFAULT 'offline';

UPDATE public.plan_options SET class_mode = 'offline' WHERE class_mode IS NULL;

CREATE INDEX IF NOT EXISTS plan_options_class_mode_idx ON public.plan_options (class_mode);
