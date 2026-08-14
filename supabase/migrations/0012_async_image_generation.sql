alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_status_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_status_check
  check (status in ('pending', 'running', 'complete', 'failed'));

alter table public.ai_generation_runs
  add column if not exists target_kind text,
  add column if not exists aspect_ratio text,
  add column if not exists size text,
  add column if not exists image_path text,
  add column if not exists image_media_type text,
  add column if not exists error_message text;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_target_kind_check
  check (target_kind is null or target_kind in ('character', 'npc', 'faction', 'job', 'place'));

create policy "GMs update their AI runs" on public.ai_generation_runs for update using (
  requested_by = auth.uid() and public.is_campaign_gm(campaign_id)
) with check (
  requested_by = auth.uid() and public.is_campaign_gm(campaign_id)
);