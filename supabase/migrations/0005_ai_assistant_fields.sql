alter table public.npcs
  add column if not exists art_subject text;

alter table public.factions
  add column if not exists art_subject text,
  add column if not exists art_provider text;

alter table public.jobs
  add column if not exists art_subject text,
  add column if not exists hook text;

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_kind_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_kind_check
  check (kind in ('mission', 'npc', 'faction', 'image'));