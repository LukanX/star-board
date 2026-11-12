alter table public.ai_generation_runs
  add column operation text not null default 'generate' check (operation in ('generate', 'redo', 'edit')),
  add column parent_run_id uuid references public.ai_generation_runs(id) on delete set null,
  add column edit_source_kind text check (edit_source_kind is null or edit_source_kind in ('draft', 'saved-art', 'studio-asset'));

alter table public.ai_generation_runs add constraint ai_generation_runs_edit_source_check
  check ((operation = 'edit') = (edit_source_kind is not null));

create index ai_generation_runs_parent_idx on public.ai_generation_runs (campaign_id, parent_run_id)
  where parent_run_id is not null;
