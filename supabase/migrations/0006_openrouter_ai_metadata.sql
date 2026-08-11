alter table public.ai_generation_runs
  add column if not exists provider text,
  add column if not exists effective_model text,
  add column if not exists generation_id text,
  add column if not exists cost_usd numeric(12, 6);