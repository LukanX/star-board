create or replace function public.promote_job_to_episode(target_campaign_id uuid, target_job_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  target_job public.jobs;
  new_episode_id uuid;
begin
  select * into target_job
  from public.jobs
  where id = target_job_id
    and campaign_id = target_campaign_id
    and status = 'open'
  for update;

  if target_job.id is null or not public.is_campaign_gm(target_campaign_id) then
    raise exception 'Only an authorized GM can promote an open job in this campaign';
  end if;

  insert into public.episodes (campaign_id, source_job_id, place_id, created_by, title, summary, player_context_markdown)
  values (target_job.campaign_id, target_job.id, target_job.place_id, auth.uid(), target_job.title, target_job.summary, target_job.player_notes_markdown)
  returning id into new_episode_id;

  update public.jobs
  set status = 'promoted', updated_at = timezone('utc', now()), updated_by = auth.uid()
  where id = target_job.id;

  return new_episode_id;
end;
$$;