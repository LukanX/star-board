alter table public.characters
  add column if not exists physical_description text not null default '',
  add column if not exists art_subject text;

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_kind_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_kind_check
  check (kind in ('mission', 'npc', 'faction', 'place', 'character', 'image'));
