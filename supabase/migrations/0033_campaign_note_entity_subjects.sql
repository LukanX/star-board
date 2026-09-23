alter table public.campaign_notes
  add column character_id uuid references public.characters(id) on delete cascade,
  add column npc_id uuid references public.npcs(id) on delete cascade,
  add column place_id uuid references public.places(id) on delete cascade,
  add column faction_id uuid references public.factions(id) on delete cascade,
  add column job_id uuid references public.jobs(id) on delete cascade,
  add column enemy_id uuid references public.enemies(id) on delete cascade,
  add constraint campaign_notes_single_scope_check
    check (num_nonnulls(episode_id, character_id, npc_id, place_id, faction_id, job_id, enemy_id) <= 1);

create index campaign_notes_character_scope_idx
  on public.campaign_notes (campaign_id, character_id, updated_at desc)
  where character_id is not null;
create index campaign_notes_npc_scope_idx
  on public.campaign_notes (campaign_id, npc_id, updated_at desc)
  where npc_id is not null;
create index campaign_notes_place_scope_idx
  on public.campaign_notes (campaign_id, place_id, updated_at desc)
  where place_id is not null;
create index campaign_notes_faction_scope_idx
  on public.campaign_notes (campaign_id, faction_id, updated_at desc)
  where faction_id is not null;
create index campaign_notes_job_scope_idx
  on public.campaign_notes (campaign_id, job_id, updated_at desc)
  where job_id is not null;
create index campaign_notes_enemy_scope_idx
  on public.campaign_notes (campaign_id, enemy_id, updated_at desc)
  where enemy_id is not null;

create or replace function public.validate_campaign_note_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  subject_campaign_id uuid;
begin
  if num_nonnulls(new.episode_id, new.character_id, new.npc_id, new.place_id, new.faction_id, new.job_id, new.enemy_id) > 1 then
    raise exception 'A campaign note can have only one episode or entity scope';
  end if;

  if new.episode_id is not null then
    select campaign_id into subject_campaign_id from public.episodes where id = new.episode_id;
  elsif new.character_id is not null then
    select campaign_id into subject_campaign_id from public.characters where id = new.character_id;
  elsif new.npc_id is not null then
    select campaign_id into subject_campaign_id from public.npcs where id = new.npc_id;
  elsif new.place_id is not null then
    select campaign_id into subject_campaign_id from public.places where id = new.place_id;
  elsif new.faction_id is not null then
    select campaign_id into subject_campaign_id from public.factions where id = new.faction_id;
  elsif new.job_id is not null then
    select campaign_id into subject_campaign_id from public.jobs where id = new.job_id;
  elsif new.enemy_id is not null then
    select campaign_id into subject_campaign_id from public.enemies where id = new.enemy_id;
  else
    return new;
  end if;

  if subject_campaign_id is null or subject_campaign_id <> new.campaign_id then
    raise exception 'Campaign note scope must belong to the same campaign';
  end if;

  return new;
end;
$$;

create trigger validate_campaign_note_scope
before insert or update of campaign_id, episode_id, character_id, npc_id, place_id, faction_id, job_id, enemy_id
on public.campaign_notes
for each row execute procedure public.validate_campaign_note_scope();

create or replace function public.can_read_campaign_note(
  target_campaign_id uuid,
  target_visibility public.note_visibility,
  target_job_id uuid,
  target_enemy_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_campaign_member(target_campaign_id) then
    return false;
  end if;

  if target_visibility = 'gm' then
    return public.is_campaign_gm(target_campaign_id);
  end if;

  if public.is_campaign_gm(target_campaign_id) then
    return true;
  end if;

  if target_job_id is not null then
    return exists (
      select 1 from public.jobs
      where id = target_job_id and campaign_id = target_campaign_id and status <> 'draft'
    );
  end if;

  if target_enemy_id is not null then
    return exists (
      select 1 from public.enemies
      where id = target_enemy_id and campaign_id = target_campaign_id and is_revealed
    );
  end if;

  return true;
end;
$$;

revoke all on function public.can_read_campaign_note(uuid, public.note_visibility, uuid, uuid) from public;
grant execute on function public.can_read_campaign_note(uuid, public.note_visibility, uuid, uuid) to authenticated;

drop policy if exists "members read player notes" on public.campaign_notes;
create policy "members read notes with visible scope"
  on public.campaign_notes
  for select
  using (public.can_read_campaign_note(campaign_id, visibility, job_id, enemy_id));

drop policy if exists "members create their player notes" on public.campaign_notes;
create policy "members create visible player notes"
  on public.campaign_notes
  for insert
  with check (
    author_id = auth.uid()
    and visibility = 'player'
    and public.can_read_campaign_note(campaign_id, visibility, job_id, enemy_id)
  );

drop policy if exists "GMs create GM notes" on public.campaign_notes;
create policy "GMs create GM notes"
  on public.campaign_notes
  for insert
  with check (
    author_id = auth.uid()
    and visibility = 'gm'
    and public.is_campaign_gm(campaign_id)
    and public.can_read_campaign_note(campaign_id, visibility, job_id, enemy_id)
  );

drop policy if exists "members update player notes and GMs update private notes" on public.campaign_notes;
create policy "members update shared notes and authors update entity notes"
  on public.campaign_notes
  for update
  using (
    public.can_read_campaign_note(campaign_id, visibility, job_id, enemy_id)
    and (
      public.is_campaign_gm(campaign_id)
      or (
        visibility = 'player'
        and (
          author_id = auth.uid()
          or num_nonnulls(character_id, npc_id, place_id, faction_id, job_id, enemy_id) = 0
        )
      )
    )
  )
  with check (
    public.can_read_campaign_note(campaign_id, visibility, job_id, enemy_id)
    and (
      public.is_campaign_gm(campaign_id)
      or (
        visibility = 'player'
        and (
          author_id = auth.uid()
          or num_nonnulls(character_id, npc_id, place_id, faction_id, job_id, enemy_id) = 0
        )
      )
    )
  );

drop policy if exists "authors or GMs delete notes" on public.campaign_notes;
create policy "members authors or GMs delete notes"
  on public.campaign_notes
  for delete
  using (
    public.is_campaign_member(campaign_id)
    and (author_id = auth.uid() or public.is_campaign_gm(campaign_id))
  );