create or replace function public.validate_campaign_note_episode()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  episode_campaign_id uuid;
begin
  if new.episode_id is null then
    return new;
  end if;

  select campaign_id into episode_campaign_id
  from public.episodes
  where id = new.episode_id;

  if episode_campaign_id is null or episode_campaign_id <> new.campaign_id then
    raise exception 'Note episode must belong to the same campaign';
  end if;

  return new;
end;
$$;

create trigger validate_campaign_note_episode
before insert or update of campaign_id, episode_id on public.campaign_notes
for each row execute procedure public.validate_campaign_note_episode();

create policy "GMs create GM notes" on public.campaign_notes
for insert with check (
  author_id = auth.uid()
  and visibility = 'gm'
  and public.is_campaign_gm(campaign_id)
);