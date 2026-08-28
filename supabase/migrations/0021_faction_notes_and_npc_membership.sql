alter table public.factions
  add column if not exists player_notes_markdown text not null default '';

alter table public.npcs
  add column if not exists faction_id uuid references public.factions(id) on delete set null;

create index if not exists npcs_faction_id_idx
  on public.npcs (faction_id);

create table public.faction_gm_notes (
  faction_id uuid primary key references public.factions(id) on delete cascade,
  body_markdown text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create or replace function public.validate_npc_faction_campaign()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  faction_campaign_id uuid;
begin
  if new.faction_id is null then
    return new;
  end if;

  select campaign_id
  into faction_campaign_id
  from public.factions
  where id = new.faction_id;

  if faction_campaign_id is null or faction_campaign_id <> new.campaign_id then
    raise exception 'NPC faction must belong to the same campaign';
  end if;

  return new;
end;
$function$;

create trigger validate_npc_faction_campaign
before insert or update of campaign_id, faction_id on public.npcs
for each row execute procedure public.validate_npc_faction_campaign();

alter table public.faction_gm_notes enable row level security;

create policy "GMs manage faction private notes" on public.faction_gm_notes
for all to authenticated
using (
  (select public.is_campaign_gm((select campaign_id from public.factions where id = faction_id)))
)
with check (
  (select public.is_campaign_gm((select campaign_id from public.factions where id = faction_id)))
);

revoke all on public.faction_gm_notes from anon;
grant select, insert, update, delete on public.faction_gm_notes to authenticated;

create or replace function public.create_faction_with_details(
  p_campaign_id uuid,
  p_public jsonb,
  p_details jsonb default '{}'::jsonb,
  p_member_npc_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  new_faction_id uuid;
  npc_record record;
  selected_npc_count integer := 0;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if p_public is null or jsonb_typeof(p_public) <> 'object' then
    raise exception 'Faction payload must be a JSON object' using errcode = '22023';
  end if;

  if p_details is null then
    p_details := '{}'::jsonb;
  elsif jsonb_typeof(p_details) <> 'object' then
    raise exception 'Faction details must be a JSON object' using errcode = '22023';
  end if;

  if p_member_npc_ids is not null then
    if exists (
      select 1
      from unnest(p_member_npc_ids) as requested_npc(id)
      where requested_npc.id is null
    ) then
      raise exception 'Faction member NPC IDs cannot be null' using errcode = '22023';
    end if;

    if exists (
      select requested_npc.id
      from unnest(p_member_npc_ids) as requested_npc(id)
      group by requested_npc.id
      having count(*) > 1
    ) then
      raise exception 'Faction member NPC IDs must be unique' using errcode = '22023';
    end if;

    for npc_record in
      select id
      from public.npcs
      where campaign_id = p_campaign_id
        and id = any(p_member_npc_ids)
      order by id
      for update
    loop
      selected_npc_count := selected_npc_count + 1;
    end loop;

    if selected_npc_count <> cardinality(p_member_npc_ids) then
      raise exception 'Every faction member NPC must belong to the campaign' using errcode = '22023';
    end if;
  end if;

  insert into public.factions (
    campaign_id,
    author_id,
    name,
    description,
    status,
    place_id,
    player_notes_markdown,
    art_subject,
    art_path,
    art_prompt,
    art_provider,
    updated_by
  ) values (
    p_campaign_id,
    auth.uid(),
    p_public ->> 'name',
    coalesce(p_public ->> 'description', ''),
    coalesce(p_public ->> 'status', 'active'),
    nullif(p_public ->> 'placeId', '')::uuid,
    coalesce(p_public ->> 'playerNotesMarkdown', ''),
    nullif(p_public ->> 'artSubject', ''),
    nullif(p_public ->> 'artPath', ''),
    nullif(p_public ->> 'artPrompt', ''),
    nullif(p_public ->> 'artProvider', ''),
    auth.uid()
  )
  returning id into new_faction_id;

  if p_details ? 'gmNotesMarkdown' and nullif(p_details ->> 'gmNotesMarkdown', '') is not null then
    insert into public.faction_gm_notes (faction_id, body_markdown, updated_by)
    values (new_faction_id, p_details ->> 'gmNotesMarkdown', auth.uid());
  end if;

  if p_member_npc_ids is not null and cardinality(p_member_npc_ids) > 0 then
    update public.npcs
    set faction_id = new_faction_id,
        updated_at = timezone('utc', now()),
        updated_by = auth.uid()
    where campaign_id = p_campaign_id
      and id = any(p_member_npc_ids);
  end if;

  return new_faction_id;
end;
$function$;

create or replace function public.update_faction_with_details(
  p_campaign_id uuid,
  p_faction_id uuid,
  p_public jsonb,
  p_details jsonb default '{}'::jsonb,
  p_member_npc_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  faction_record record;
  npc_record record;
  selected_npc_count integer := 0;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if p_public is null or jsonb_typeof(p_public) <> 'object' then
    raise exception 'Faction payload must be a JSON object' using errcode = '22023';
  end if;

  if p_details is null then
    p_details := '{}'::jsonb;
  elsif jsonb_typeof(p_details) <> 'object' then
    raise exception 'Faction details must be a JSON object' using errcode = '22023';
  end if;

  select id
  into faction_record
  from public.factions
  where id = p_faction_id
    and campaign_id = p_campaign_id
  for update;

  if faction_record.id is null then
    raise exception 'Faction was not found in this campaign' using errcode = 'P0002';
  end if;

  if p_member_npc_ids is not null then
    if exists (
      select 1
      from unnest(p_member_npc_ids) as requested_npc(id)
      where requested_npc.id is null
    ) then
      raise exception 'Faction member NPC IDs cannot be null' using errcode = '22023';
    end if;

    if exists (
      select requested_npc.id
      from unnest(p_member_npc_ids) as requested_npc(id)
      group by requested_npc.id
      having count(*) > 1
    ) then
      raise exception 'Faction member NPC IDs must be unique' using errcode = '22023';
    end if;

    for npc_record in
      select id
      from public.npcs
      where campaign_id = p_campaign_id
        and (faction_id = p_faction_id or id = any(p_member_npc_ids))
      order by id
      for update
    loop
      if npc_record.id = any(p_member_npc_ids) then
        selected_npc_count := selected_npc_count + 1;
      end if;
    end loop;

    if selected_npc_count <> cardinality(p_member_npc_ids) then
      raise exception 'Every faction member NPC must belong to the campaign' using errcode = '22023';
    end if;
  end if;

  update public.factions
  set name = case when p_public ? 'name' then p_public ->> 'name' else name end,
      description = case when p_public ? 'description' then p_public ->> 'description' else description end,
      status = case when p_public ? 'status' then p_public ->> 'status' else status end,
      place_id = case when p_public ? 'placeId' then nullif(p_public ->> 'placeId', '')::uuid else place_id end,
      player_notes_markdown = case when p_public ? 'playerNotesMarkdown' then coalesce(p_public ->> 'playerNotesMarkdown', '') else player_notes_markdown end,
      art_subject = case when p_public ? 'artSubject' then nullif(p_public ->> 'artSubject', '') else art_subject end,
      art_path = case when p_public ? 'artPath' then nullif(p_public ->> 'artPath', '') else art_path end,
      art_prompt = case when p_public ? 'artPrompt' then nullif(p_public ->> 'artPrompt', '') else art_prompt end,
      art_provider = case when p_public ? 'artProvider' then nullif(p_public ->> 'artProvider', '') else art_provider end,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where id = p_faction_id
    and campaign_id = p_campaign_id;

  if p_details ? 'gmNotesMarkdown' then
    if nullif(p_details ->> 'gmNotesMarkdown', '') is null then
      delete from public.faction_gm_notes
      where faction_id = p_faction_id;
    else
      insert into public.faction_gm_notes (faction_id, body_markdown, updated_by)
      values (p_faction_id, p_details ->> 'gmNotesMarkdown', auth.uid())
      on conflict (faction_id) do update
      set body_markdown = excluded.body_markdown,
          updated_at = timezone('utc', now()),
          updated_by = auth.uid();
    end if;
  end if;

  if p_member_npc_ids is not null then
    update public.npcs
    set faction_id = null,
        updated_at = timezone('utc', now()),
        updated_by = auth.uid()
    where campaign_id = p_campaign_id
      and faction_id = p_faction_id
      and not (id = any(p_member_npc_ids));

    if cardinality(p_member_npc_ids) > 0 then
      update public.npcs
      set faction_id = p_faction_id,
          updated_at = timezone('utc', now()),
          updated_by = auth.uid()
      where campaign_id = p_campaign_id
        and id = any(p_member_npc_ids);
    end if;
  end if;

  return p_faction_id;
end;
$function$;

revoke all on function public.create_faction_with_details(uuid, jsonb, jsonb, uuid[]) from public;
grant execute on function public.create_faction_with_details(uuid, jsonb, jsonb, uuid[]) to authenticated;
revoke all on function public.update_faction_with_details(uuid, uuid, jsonb, jsonb, uuid[]) from public;
grant execute on function public.update_faction_with_details(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;