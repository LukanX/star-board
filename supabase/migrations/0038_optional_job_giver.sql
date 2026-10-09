alter table public.jobs drop constraint jobs_check;

alter table public.jobs
  add constraint jobs_at_most_one_giver
  check (giver_npc_id is null or giver_faction_id is null);

create or replace function public.validate_job_giver_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  giver_campaign_id uuid;
begin
  if new.giver_npc_id is not null and new.giver_faction_id is not null then
    raise exception 'A job may have at most one NPC or faction giver';
  end if;

  if new.giver_npc_id is null and new.giver_faction_id is null then
    return new;
  end if;

  if new.giver_npc_id is not null then
    select campaign_id into giver_campaign_id from public.npcs where id = new.giver_npc_id;
  else
    select campaign_id into giver_campaign_id from public.factions where id = new.giver_faction_id;
  end if;

  if giver_campaign_id is null or giver_campaign_id <> new.campaign_id then
    raise exception 'Job giver must belong to the same campaign';
  end if;

  return new;
end;
$$;
