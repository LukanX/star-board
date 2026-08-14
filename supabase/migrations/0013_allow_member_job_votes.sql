create or replace function public.cast_job_vote(target_campaign_id uuid, target_job_id uuid)
returns public.job_votes
language plpgsql
security definer set search_path = public
as $$
declare
  job_campaign_id uuid;
  result public.job_votes;
begin
  select campaign_id into job_campaign_id
  from public.jobs
  where id = target_job_id
    and campaign_id = target_campaign_id
    and status = 'open';

  if job_campaign_id is null or not public.is_campaign_member(target_campaign_id) then
    raise exception 'Job is not open or campaign membership is missing';
  end if;

  insert into public.job_votes (campaign_id, user_id, job_id)
  values (target_campaign_id, auth.uid(), target_job_id)
  on conflict (campaign_id, user_id) do update
  set job_id = excluded.job_id, updated_at = timezone('utc', now())
  returning * into result;

  return result;
end;
$$;