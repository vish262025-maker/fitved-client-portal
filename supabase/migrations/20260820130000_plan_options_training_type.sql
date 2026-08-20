-- Split the plan catalog by training type (Personal vs Group).
-- Additive & idempotent. Existing plans become "personal" so nothing changes
-- for current customers until Group plans are added.
ALTER TABLE public.plan_options
  ADD COLUMN IF NOT EXISTS training_type text NOT NULL DEFAULT 'personal';

UPDATE public.plan_options SET training_type = 'personal' WHERE training_type IS NULL;

CREATE INDEX IF NOT EXISTS plan_options_training_type_idx ON public.plan_options (training_type);
