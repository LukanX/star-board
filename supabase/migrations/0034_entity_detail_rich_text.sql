alter table public.characters
  add column if not exists physical_description_is_markdown boolean not null default false;

alter table public.npcs
  add column if not exists description_is_markdown boolean not null default false;

alter table public.places
  add column if not exists description_is_markdown boolean not null default false;

alter table public.factions
  add column if not exists description_is_markdown boolean not null default false;

alter table public.enemies
  add column if not exists player_description_is_markdown boolean not null default false;

create or replace function public.create_enemy_with_details(p_campaign_id uuid, p_public jsonb, p_details jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  new_enemy_id uuid;
  source_snapshot_value jsonb;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_public) <> 'object' or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Enemy payloads must be JSON objects' using errcode = '22023';
  end if;

  insert into public.enemies (
    campaign_id,
    author_id,
    name,
    player_description,
    player_description_is_markdown,
    is_revealed,
    art_path,
    updated_by
  ) values (
    p_campaign_id,
    auth.uid(),
    p_public ->> 'name',
    coalesce(p_public ->> 'playerDescription', ''),
    coalesce((p_public ->> 'playerDescriptionIsMarkdown')::boolean, false),
    coalesce((p_public ->> 'isRevealed')::boolean, false),
    nullif(p_public ->> 'artPath', ''),
    auth.uid()
  ) returning id into new_enemy_id;

  source_snapshot_value := case
    when jsonb_typeof(p_details -> 'sourceSnapshot') = 'object' then p_details -> 'sourceSnapshot'
    else null
  end;

  insert into public.enemy_details (
    enemy_id, campaign_id, level, size, rarity, traits, family, stat_block,
    gm_notes_markdown, origin, art_subject, art_prompt, art_provider,
    source_provider, source_external_id, source_content_hash, source_snapshot, updated_by
  ) values (
    new_enemy_id,
    p_campaign_id,
    (p_details ->> 'level')::smallint,
    p_details ->> 'size',
    p_details ->> 'rarity',
    array(select jsonb_array_elements_text(case when jsonb_typeof(p_details -> 'traits') = 'array' then p_details -> 'traits' else '[]'::jsonb end)),
    nullif(p_details ->> 'family', ''),
    p_details -> 'statBlock',
    coalesce(p_details ->> 'gmNotesMarkdown', ''),
    coalesce(p_details ->> 'origin', 'manual'),
    nullif(p_details ->> 'artSubject', ''),
    nullif(p_details ->> 'artPrompt', ''),
    nullif(p_details ->> 'artProvider', ''),
    source_snapshot_value ->> 'provider',
    case when (source_snapshot_value ->> 'externalId') ~ '^[0-9]+$' then (source_snapshot_value ->> 'externalId')::bigint else null end,
    source_snapshot_value ->> 'contentHash',
    source_snapshot_value,
    auth.uid()
  );

  return new_enemy_id;
end;
$function$;

create or replace function public.update_enemy_with_details(
  p_campaign_id uuid,
  p_enemy_id uuid,
  p_public jsonb,
  p_details jsonb,
  p_expected_updated_at timestamptz,
  p_expected_source_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  current_updated_at timestamptz;
  current_source_hash text;
  source_snapshot_value jsonb;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_public) <> 'object' or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Enemy payloads must be JSON objects' using errcode = '22023';
  end if;

  select updated_at into current_updated_at
  from public.enemies
  where id = p_enemy_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'Enemy was not found in this campaign' using errcode = 'P0002';
  end if;
  if current_updated_at is distinct from p_expected_updated_at then
    raise exception 'The enemy changed after this edit was opened' using errcode = '40001';
  end if;

  select source_content_hash into current_source_hash
  from public.enemy_details
  where enemy_id = p_enemy_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'Enemy details were not found in this campaign' using errcode = 'P0002';
  end if;
  if current_source_hash is distinct from p_expected_source_hash then
    raise exception 'The enemy source changed after this edit was opened' using errcode = '40001';
  end if;

  source_snapshot_value := case
    when jsonb_typeof(p_details -> 'sourceSnapshot') = 'object' then p_details -> 'sourceSnapshot'
    else null
  end;

  update public.enemies
  set name = p_public ->> 'name',
      player_description = coalesce(p_public ->> 'playerDescription', ''),
      player_description_is_markdown = coalesce((p_public ->> 'playerDescriptionIsMarkdown')::boolean, false),
      is_revealed = coalesce((p_public ->> 'isRevealed')::boolean, false),
      art_path = nullif(p_public ->> 'artPath', ''),
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where id = p_enemy_id and campaign_id = p_campaign_id;

  update public.enemy_details
  set level = (p_details ->> 'level')::smallint,
      size = p_details ->> 'size',
      rarity = p_details ->> 'rarity',
      traits = array(select jsonb_array_elements_text(case when jsonb_typeof(p_details -> 'traits') = 'array' then p_details -> 'traits' else '[]'::jsonb end)),
      family = nullif(p_details ->> 'family', ''),
      stat_block = p_details -> 'statBlock',
      gm_notes_markdown = coalesce(p_details ->> 'gmNotesMarkdown', ''),
      origin = coalesce(p_details ->> 'origin', 'manual'),
      art_subject = nullif(p_details ->> 'artSubject', ''),
      art_prompt = nullif(p_details ->> 'artPrompt', ''),
      art_provider = nullif(p_details ->> 'artProvider', ''),
      source_provider = source_snapshot_value ->> 'provider',
      source_external_id = case when (source_snapshot_value ->> 'externalId') ~ '^[0-9]+$' then (source_snapshot_value ->> 'externalId')::bigint else null end,
      source_content_hash = source_snapshot_value ->> 'contentHash',
      source_snapshot = source_snapshot_value,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where enemy_id = p_enemy_id and campaign_id = p_campaign_id;

  return p_enemy_id;
end;
$function$;

create or replace function public.reimport_enemy_from_source(
  p_campaign_id uuid,
  p_enemy_id uuid,
  p_expected_source_hash text,
  p_source jsonb,
  p_authored jsonb,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  current_updated_at timestamptz;
  current_source_hash text;
  current_source_provider text;
  current_source_external_id bigint;
  source_snapshot_value jsonb;
  new_source_hash text;
  new_source_external_id bigint;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  source_snapshot_value := case
    when jsonb_typeof(p_source -> 'sourceSnapshot') = 'object' then p_source -> 'sourceSnapshot'
    else null
  end;
  new_source_hash := source_snapshot_value ->> 'contentHash';
  new_source_external_id := case when (source_snapshot_value ->> 'externalId') ~ '^[0-9]+$' then (source_snapshot_value ->> 'externalId')::bigint else null end;

  select updated_at into current_updated_at
  from public.enemies
  where id = p_enemy_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'Enemy was not found in this campaign' using errcode = 'P0002';
  end if;
  if current_updated_at is distinct from p_expected_updated_at then
    raise exception 'The enemy changed after this preview was created' using errcode = '40001';
  end if;

  select source_content_hash, source_provider, source_external_id
  into current_source_hash, current_source_provider, current_source_external_id
  from public.enemy_details
  where enemy_id = p_enemy_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'Enemy details were not found in this campaign' using errcode = 'P0002';
  end if;
  if current_source_hash is distinct from p_expected_source_hash then
    raise exception 'The enemy source changed after this preview was created' using errcode = '40001';
  end if;
  if current_source_provider = 'aon' and (source_snapshot_value ->> 'provider') is distinct from 'aon' then
    raise exception 'The enemy source provider changed after this preview was created' using errcode = '40001';
  end if;
  if current_source_provider = 'aon' and current_source_external_id is distinct from new_source_external_id then
    raise exception 'The enemy source identity changed after this preview was created' using errcode = '40001';
  end if;

  update public.enemies
  set name = p_source ->> 'name',
      player_description = case when jsonb_exists(p_authored, 'playerDescription') then coalesce(p_authored ->> 'playerDescription', '') else player_description end,
      player_description_is_markdown = case when jsonb_exists(p_authored, 'playerDescriptionIsMarkdown') then coalesce((p_authored ->> 'playerDescriptionIsMarkdown')::boolean, false) else player_description_is_markdown end,
      is_revealed = case when jsonb_exists(p_authored, 'isRevealed') then coalesce((p_authored ->> 'isRevealed')::boolean, false) else is_revealed end,
      art_path = case when jsonb_exists(p_authored, 'artPath') then nullif(p_authored ->> 'artPath', '') else art_path end,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where id = p_enemy_id and campaign_id = p_campaign_id;

  update public.enemy_details
  set level = (p_source ->> 'level')::smallint,
      size = p_source ->> 'size',
      rarity = p_source ->> 'rarity',
      traits = array(select jsonb_array_elements_text(case when jsonb_typeof(p_source -> 'traits') = 'array' then p_source -> 'traits' else '[]'::jsonb end)),
      family = nullif(p_source ->> 'family', ''),
      stat_block = p_source -> 'statBlock',
      origin = 'aon',
      gm_notes_markdown = case when jsonb_exists(p_authored, 'gmNotesMarkdown') then coalesce(p_authored ->> 'gmNotesMarkdown', '') else gm_notes_markdown end,
      art_subject = case when jsonb_exists(p_authored, 'artSubject') then nullif(p_authored ->> 'artSubject', '') else art_subject end,
      art_prompt = case when jsonb_exists(p_authored, 'artPrompt') then nullif(p_authored ->> 'artPrompt', '') else art_prompt end,
      art_provider = case when jsonb_exists(p_authored, 'artProvider') then nullif(p_authored ->> 'artProvider', '') else art_provider end,
      source_provider = source_snapshot_value ->> 'provider',
      source_external_id = new_source_external_id,
      source_content_hash = new_source_hash,
      source_snapshot = source_snapshot_value,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where enemy_id = p_enemy_id and campaign_id = p_campaign_id;

  return p_enemy_id;
end;
$function$;

revoke execute on function public.create_enemy_with_details(uuid, jsonb, jsonb) from public;
revoke execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb, timestamptz, text) from public;
revoke execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb, timestamptz) from public;
grant execute on function public.create_enemy_with_details(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb, timestamptz, text) to authenticated;
grant execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb, timestamptz) to authenticated;

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
    if exists (select 1 from unnest(p_member_npc_ids) as requested_npc(id) where requested_npc.id is null) then
      raise exception 'Faction member NPC IDs cannot be null' using errcode = '22023';
    end if;
    if exists (
      select requested_npc.id from unnest(p_member_npc_ids) as requested_npc(id)
      group by requested_npc.id having count(*) > 1
    ) then
      raise exception 'Faction member NPC IDs must be unique' using errcode = '22023';
    end if;
    for npc_record in
      select id from public.npcs
      where campaign_id = p_campaign_id and id = any(p_member_npc_ids)
      order by id for update
    loop
      selected_npc_count := selected_npc_count + 1;
    end loop;
    if selected_npc_count <> cardinality(p_member_npc_ids) then
      raise exception 'Every faction member NPC must belong to the campaign' using errcode = '22023';
    end if;
  end if;

  insert into public.factions (
    campaign_id, author_id, name, description, description_is_markdown, status,
    place_id, player_notes_markdown, art_subject, art_path, art_prompt, art_provider, updated_by
  ) values (
    p_campaign_id, auth.uid(), p_public ->> 'name', coalesce(p_public ->> 'description', ''),
    coalesce((p_public ->> 'descriptionIsMarkdown')::boolean, false),
    coalesce(p_public ->> 'status', 'active'), nullif(p_public ->> 'placeId', '')::uuid,
    coalesce(p_public ->> 'playerNotesMarkdown', ''), nullif(p_public ->> 'artSubject', ''),
    nullif(p_public ->> 'artPath', ''), nullif(p_public ->> 'artPrompt', ''),
    nullif(p_public ->> 'artProvider', ''), auth.uid()
  ) returning id into new_faction_id;

  if p_details ? 'gmNotesMarkdown' and nullif(p_details ->> 'gmNotesMarkdown', '') is not null then
    insert into public.faction_gm_notes (faction_id, body_markdown, updated_by)
    values (new_faction_id, p_details ->> 'gmNotesMarkdown', auth.uid());
  end if;

  if p_member_npc_ids is not null and cardinality(p_member_npc_ids) > 0 then
    update public.npcs set faction_id = new_faction_id, updated_at = timezone('utc', now()), updated_by = auth.uid()
    where campaign_id = p_campaign_id and id = any(p_member_npc_ids);
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

  select id into faction_record from public.factions
  where id = p_faction_id and campaign_id = p_campaign_id for update;
  if faction_record.id is null then
    raise exception 'Faction was not found in this campaign' using errcode = 'P0002';
  end if;

  if p_member_npc_ids is not null then
    if exists (select 1 from unnest(p_member_npc_ids) as requested_npc(id) where requested_npc.id is null) then
      raise exception 'Faction member NPC IDs cannot be null' using errcode = '22023';
    end if;
    if exists (
      select requested_npc.id from unnest(p_member_npc_ids) as requested_npc(id)
      group by requested_npc.id having count(*) > 1
    ) then
      raise exception 'Faction member NPC IDs must be unique' using errcode = '22023';
    end if;
    for npc_record in
      select id from public.npcs
      where campaign_id = p_campaign_id and (faction_id = p_faction_id or id = any(p_member_npc_ids))
      order by id for update
    loop
      if npc_record.id = any(p_member_npc_ids) then selected_npc_count := selected_npc_count + 1; end if;
    end loop;
    if selected_npc_count <> cardinality(p_member_npc_ids) then
      raise exception 'Every faction member NPC must belong to the campaign' using errcode = '22023';
    end if;
  end if;

  update public.factions
  set name = case when p_public ? 'name' then p_public ->> 'name' else name end,
      description = case when p_public ? 'description' then p_public ->> 'description' else description end,
      description_is_markdown = case when p_public ? 'descriptionIsMarkdown' then coalesce((p_public ->> 'descriptionIsMarkdown')::boolean, false) else description_is_markdown end,
      status = case when p_public ? 'status' then p_public ->> 'status' else status end,
      place_id = case when p_public ? 'placeId' then nullif(p_public ->> 'placeId', '')::uuid else place_id end,
      player_notes_markdown = case when p_public ? 'playerNotesMarkdown' then coalesce(p_public ->> 'playerNotesMarkdown', '') else player_notes_markdown end,
      art_subject = case when p_public ? 'artSubject' then nullif(p_public ->> 'artSubject', '') else art_subject end,
      art_path = case when p_public ? 'artPath' then nullif(p_public ->> 'artPath', '') else art_path end,
      art_prompt = case when p_public ? 'artPrompt' then nullif(p_public ->> 'artPrompt', '') else art_prompt end,
      art_provider = case when p_public ? 'artProvider' then nullif(p_public ->> 'artProvider', '') else art_provider end,
      updated_at = timezone('utc', now()), updated_by = auth.uid()
  where id = p_faction_id and campaign_id = p_campaign_id;

  if p_details ? 'gmNotesMarkdown' then
    if nullif(p_details ->> 'gmNotesMarkdown', '') is null then
      delete from public.faction_gm_notes where faction_id = p_faction_id;
    else
      insert into public.faction_gm_notes (faction_id, body_markdown, updated_by)
      values (p_faction_id, p_details ->> 'gmNotesMarkdown', auth.uid())
      on conflict (faction_id) do update
      set body_markdown = excluded.body_markdown, updated_at = timezone('utc', now()), updated_by = auth.uid();
    end if;
  end if;

  if p_member_npc_ids is not null then
    update public.npcs set faction_id = null, updated_at = timezone('utc', now()), updated_by = auth.uid()
    where campaign_id = p_campaign_id and faction_id = p_faction_id and not (id = any(p_member_npc_ids));
    if cardinality(p_member_npc_ids) > 0 then
      update public.npcs set faction_id = p_faction_id, updated_at = timezone('utc', now()), updated_by = auth.uid()
      where campaign_id = p_campaign_id and id = any(p_member_npc_ids);
    end if;
  end if;
  return p_faction_id;
end;
$function$;

revoke all on function public.create_faction_with_details(uuid, jsonb, jsonb, uuid[]) from public;
grant execute on function public.create_faction_with_details(uuid, jsonb, jsonb, uuid[]) to authenticated;
revoke all on function public.update_faction_with_details(uuid, uuid, jsonb, jsonb, uuid[]) from public;
grant execute on function public.update_faction_with_details(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;
