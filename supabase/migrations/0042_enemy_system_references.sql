create table public.enemy_reference_selections (
  enemy_id uuid not null references public.enemy_details(enemy_id) on delete cascade,
  reference_id text not null,
  kind text not null,
  catalog_version text not null check (length(catalog_version) between 1 and 100 and catalog_version ~ '^[A-Za-z0-9.-]+$'),
  primary key(enemy_id, reference_id),
  foreign key(reference_id, kind) references public.system_reference_entries(reference_id, kind)
);
create unique index enemy_single_ancestry_reference on public.enemy_reference_selections(enemy_id) where kind = 'ancestry';
alter table public.enemy_reference_selections enable row level security;
revoke all on public.enemy_reference_selections from anon, authenticated;
grant select on public.enemy_reference_selections to authenticated;
create policy enemy_references_gm_read on public.enemy_reference_selections for select to authenticated using (
  exists(select 1 from public.enemy_details d where d.enemy_id = enemy_reference_selections.enemy_id and public.is_campaign_gm(d.campaign_id))
);

create function public.replace_enemy_reference_selections(p_enemy_id uuid, p_references jsonb)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  enemy_campaign uuid;
  enemy_traits text[];
  selection jsonb;
  entry public.system_reference_entries;
  selection_kind text;
  selections jsonb;
begin
  select campaign_id, traits into enemy_campaign, enemy_traits from public.enemy_details where enemy_id = p_enemy_id for update;
  if auth.uid() is null or enemy_campaign is null or not public.is_campaign_gm(enemy_campaign) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;
  if p_references is null then return; end if;
  if jsonb_typeof(p_references) is distinct from 'object' or (p_references - 'ancestry' - 'creatureTraits') <> '{}'::jsonb
    or not (p_references ? 'ancestry') or jsonb_typeof(p_references -> 'creatureTraits') is distinct from 'array' then
    raise exception 'Invalid enemy reference selections' using errcode = '22023';
  end if;
  if jsonb_array_length(p_references -> 'creatureTraits') > 32 then
    raise exception 'At most 32 trait references are supported' using errcode = '22023';
  end if;
  selections := p_references -> 'creatureTraits';
  if p_references -> 'ancestry' <> 'null'::jsonb then selections := selections || jsonb_build_array(p_references -> 'ancestry'); end if;
  for selection in select value from jsonb_array_elements(selections) loop
    if jsonb_typeof(selection) is distinct from 'object' or (selection - 'id' - 'catalogVersion') <> '{}'::jsonb
      or jsonb_typeof(selection -> 'id') is distinct from 'string'
      or jsonb_typeof(selection -> 'catalogVersion') is distinct from 'string' then
      raise exception 'Invalid reference binding' using errcode = '22023';
    end if;
    select * into entry from public.system_reference_entries where reference_id = selection ->> 'id';
    selection_kind := case when selection = p_references -> 'ancestry' then 'ancestry' else 'creature_trait' end;
    if not found or entry.kind <> selection_kind then raise exception 'Reference kind mismatch' using errcode = '22023'; end if;
    if selection ->> 'catalogVersion' is distinct from entry.catalog_version and not exists(
      select 1 from public.enemy_reference_selections s where s.enemy_id = p_enemy_id and s.reference_id = entry.reference_id and s.catalog_version = selection ->> 'catalogVersion'
    ) then raise exception 'Reference metadata changed; reselect the reference' using errcode = '40001'; end if;
    if entry.kind = 'creature_trait' and not exists(select 1 from unnest(enemy_traits) trait where lower(btrim(trait)) = lower(entry.name)) then
      raise exception 'Reference does not match enemy traits' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(selections)) <> (select count(distinct value ->> 'id') from jsonb_array_elements(selections)) then
    raise exception 'Duplicate reference selections' using errcode = '22023';
  end if;
  delete from public.enemy_reference_selections where enemy_id = p_enemy_id;
  insert into public.enemy_reference_selections(enemy_id, reference_id, kind, catalog_version)
    select p_enemy_id, e.reference_id, e.kind, value ->> 'catalogVersion'
    from jsonb_array_elements(selections) selection(value) join public.system_reference_entries e on e.reference_id = value ->> 'id';
end;
$function$;
revoke all on function public.replace_enemy_reference_selections(uuid, jsonb) from public, anon;
grant execute on function public.replace_enemy_reference_selections(uuid, jsonb) to authenticated;

create function public.reconcile_enemy_trait_references()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  delete from public.enemy_reference_selections s using public.system_reference_entries e
    where s.enemy_id = new.enemy_id and s.reference_id = e.reference_id and s.kind = 'creature_trait'
      and not exists(select 1 from unnest(new.traits) trait where lower(btrim(trait)) = lower(e.name));
  return new;
end;
$function$;
revoke all on function public.reconcile_enemy_trait_references() from public, anon, authenticated;
create trigger enemy_trait_reference_cleanup after update of traits on public.enemy_details
  for each row execute function public.reconcile_enemy_trait_references();
-- Enemy write RPC definitions preserve existing authorization, source checks and concurrency.
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

  if p_details ? 'systemReferences' then
    perform public.replace_enemy_reference_selections(new_enemy_id, p_details -> 'systemReferences');
  end if;

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

  if p_details ? 'systemReferences' then
    perform public.replace_enemy_reference_selections(p_enemy_id, p_details -> 'systemReferences');
  end if;

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

  if p_authored ? 'systemReferences' then
    perform public.replace_enemy_reference_selections(p_enemy_id, p_authored -> 'systemReferences');
  end if;

  return p_enemy_id;
end;
$function$;
