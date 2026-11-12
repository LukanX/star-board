alter table public.ai_generation_runs drop constraint ai_generation_runs_purpose_check;
alter table public.ai_generation_runs add constraint ai_generation_runs_purpose_check
  check (purpose in ('entity-art', 'style-preview', 'studio-art', 'studio-prompt'));
