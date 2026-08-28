alter table public.ai_generation_runs
  add column if not exists draft jsonb;

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_draft_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_draft_check
  check (draft is null or (kind = 'enemy' and status = 'complete' and jsonb_typeof(draft) = 'object'));