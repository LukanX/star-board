-- Keep generated drafts private until they are approved or attached to a revealed enemy.
create or replace function public.can_read_campaign_art(target_campaign_id uuid, target_path text)
returns boolean
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select public.is_campaign_member(target_campaign_id)
    and (
      public.is_campaign_gm(target_campaign_id)
      or exists (
        select 1
        from public.enemies
        where campaign_id = target_campaign_id
          and art_path = target_path
          and is_revealed
      )
      or (
        not exists (
          select 1
          from public.enemies
          where campaign_id = target_campaign_id
            and art_path = target_path
        )
        and (
          not exists (
            select 1
            from public.ai_generation_runs
            where campaign_id = target_campaign_id
              and image_path = target_path
          )
          or exists (
            select 1
            from public.ai_generation_runs
            where campaign_id = target_campaign_id
              and image_path = target_path
              and requested_by = auth.uid()
          )
        )
      )
    );
$$;

create or replace function public.can_manage_campaign_art(target_campaign_id uuid, target_path text)
returns boolean
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select public.is_campaign_member(target_campaign_id)
    and (
      public.is_campaign_gm(target_campaign_id)
      or (
        not exists (
          select 1
          from public.enemies
          where campaign_id = target_campaign_id
            and art_path = target_path
        )
        and (
          not exists (
            select 1
            from public.ai_generation_runs
            where campaign_id = target_campaign_id
              and image_path = target_path
          )
          or exists (
            select 1
            from public.ai_generation_runs
            where campaign_id = target_campaign_id
              and image_path = target_path
              and requested_by = auth.uid()
          )
        )
      )
    );
$$;

revoke all on function public.can_read_campaign_art(uuid, text) from public;
grant execute on function public.can_read_campaign_art(uuid, text) to authenticated;
revoke all on function public.can_manage_campaign_art(uuid, text) from public;
grant execute on function public.can_manage_campaign_art(uuid, text) to authenticated;

create index if not exists ai_generation_runs_image_path_idx
  on public.ai_generation_runs (campaign_id, image_path)
  where image_path is not null;

drop policy if exists "members can read campaign art" on storage.objects;

create policy "members can read campaign art" on storage.objects for select
using (
  bucket_id = 'campaign-art'
  and public.can_read_campaign_art((storage.foldername(name))[1]::uuid, name)
);

drop policy if exists "members can upload campaign art" on storage.objects;

create policy "members can upload campaign art" on storage.objects for insert
with check (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (storage.foldername(name))[2]::uuid = (select auth.uid())
  and (
    storage.filename(name) not like 'enemy-%'
    or (select public.is_campaign_gm((storage.foldername(name))[1]::uuid))
  )
);

drop policy if exists "owners can update campaign art" on storage.objects;

create policy "owners can update campaign art" on storage.objects for update
using (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and public.is_campaign_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2]::uuid = (select auth.uid())
  and public.can_manage_campaign_art((storage.foldername(name))[1]::uuid, name)
)
with check (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (storage.foldername(name))[2]::uuid = (select auth.uid())
  and public.can_manage_campaign_art((storage.foldername(name))[1]::uuid, name)
);

drop policy if exists "owners can delete campaign art" on storage.objects;

create policy "owners can delete campaign art" on storage.objects for delete
using (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (storage.foldername(name))[2]::uuid = (select auth.uid())
  and public.can_manage_campaign_art((storage.foldername(name))[1]::uuid, name)
);

-- Keep source identity and parsed fields coherent even for direct RPC callers.
create or replace function public.validate_enemy_source_provenance()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $function$
declare
  parent_name text;
  source_payload jsonb;
  source_url text;
  source_external_id text;
  source_url_external_id text;
begin
  if new.origin <> 'aon' then
    return new;
  end if;

  if new.source_provider <> 'aon'
    or new.source_external_id is null
    or new.source_content_hash is null
    or new.source_snapshot is null
    or new.source_snapshot ->> 'provider' <> 'aon'
    or new.source_snapshot ->> 'system' <> 'Starfinder 2e'
    or new.source_snapshot ->> 'externalId' is null
    or new.source_snapshot ->> 'contentHash' <> new.source_content_hash
    or new.source_snapshot ->> 'externalId' <> new.source_external_id::text
  then
    raise exception 'Archives of Nethys provenance is incomplete or inconsistent' using errcode = '23514';
  end if;

  source_url := new.source_snapshot ->> 'canonicalUrl';
  source_external_id := new.source_snapshot ->> 'externalId';
  source_url_external_id := substring(source_url from '^https://2e\.aonsrd\.com/creatures/([0-9]+)-');
  if source_url is null
    or source_url !~ '^https://2e\.aonsrd\.com/creatures/[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$'
    or source_external_id !~ '^[0-9]+$'
    or source_url_external_id is distinct from source_external_id
  then
    raise exception 'Archives of Nethys provenance URL is invalid' using errcode = '23514';
  end if;

  select name into parent_name
  from public.enemies
  where id = new.enemy_id and campaign_id = new.campaign_id;

  source_payload := new.source_snapshot -> 'parsedPayload';
  if source_payload is null
    or source_payload <> jsonb_build_object(
      'name', parent_name,
      'level', new.level,
      'size', new.size,
      'rarity', new.rarity,
      'traits', new.traits,
      'family', new.family,
      'statBlock', new.stat_block
    )
  then
    raise exception 'Archives of Nethys parsed payload does not match the enemy record' using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists enemy_source_provenance_trigger on public.enemy_details;
create constraint trigger enemy_source_provenance_trigger
after insert or update of enemy_id, campaign_id, level, size, rarity, traits, family, stat_block, origin, source_provider, source_external_id, source_content_hash, source_snapshot on public.enemy_details
deferrable initially deferred for each row
execute function public.validate_enemy_source_provenance();

-- Prevent ordinary stale edits from restoring an older source or authored revision.
drop function if exists public.update_enemy_with_details(uuid, uuid, jsonb, jsonb);
drop function if exists public.update_enemy_with_details(uuid, uuid, jsonb, jsonb, timestamptz, text);

create function public.update_enemy_with_details(
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

  select updated_at
  into current_updated_at
  from public.enemies
  where id = p_enemy_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'Enemy was not found in this campaign' using errcode = 'P0002';
  end if;

  if current_updated_at is distinct from p_expected_updated_at then
    raise exception 'The enemy changed after this edit was opened' using errcode = '40001';
  end if;

  select source_content_hash
  into current_source_hash
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
      is_revealed = coalesce((p_public ->> 'isRevealed')::boolean, false),
      art_path = nullif(p_public ->> 'artPath', ''),
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where id = p_enemy_id and campaign_id = p_campaign_id;

  update public.enemy_details
  set level = (p_details ->> 'level')::smallint,
      size = p_details ->> 'size',
      rarity = p_details ->> 'rarity',
      traits = array(
        select jsonb_array_elements_text(
          case when jsonb_typeof(p_details -> 'traits') = 'array' then p_details -> 'traits' else '[]'::jsonb end
        )
      ),
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

drop function if exists public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb);
drop function if exists public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb, timestamptz);

create function public.reimport_enemy_from_source(
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

  select updated_at
  into current_updated_at
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
      is_revealed = case when jsonb_exists(p_authored, 'isRevealed') then coalesce((p_authored ->> 'isRevealed')::boolean, false) else is_revealed end,
      art_path = case when jsonb_exists(p_authored, 'artPath') then nullif(p_authored ->> 'artPath', '') else art_path end,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where id = p_enemy_id and campaign_id = p_campaign_id;

  update public.enemy_details
  set level = (p_source ->> 'level')::smallint,
      size = p_source ->> 'size',
      rarity = p_source ->> 'rarity',
      traits = array(
        select jsonb_array_elements_text(
          case when jsonb_typeof(p_source -> 'traits') = 'array' then p_source -> 'traits' else '[]'::jsonb end
        )
      ),
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

grant execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb, timestamptz, text) to authenticated;
grant execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb, timestamptz) to authenticated;
revoke execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb, timestamptz, text) from public;
revoke execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb, timestamptz) from public;
grant execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb, timestamptz, text) to authenticated;
grant execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb, timestamptz) to authenticated;
