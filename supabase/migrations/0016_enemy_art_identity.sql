create or replace function public.can_read_campaign_art(target_campaign_id uuid, target_path text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (
    select 1
    from public.enemies
    where campaign_id = target_campaign_id
      and art_path = target_path
  )
  or exists (
    select 1
    from public.enemies
    where campaign_id = target_campaign_id
      and art_path = target_path
      and is_revealed
  );
$$;

create or replace function public.can_manage_campaign_art(target_campaign_id uuid, target_path text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_campaign_gm(target_campaign_id)
    or not exists (
      select 1
      from public.enemies
      where campaign_id = target_campaign_id
        and art_path = target_path
    );
$$;

revoke all on function public.can_read_campaign_art(uuid, text) from public;
grant execute on function public.can_read_campaign_art(uuid, text) to authenticated;
revoke all on function public.can_manage_campaign_art(uuid, text) from public;
grant execute on function public.can_manage_campaign_art(uuid, text) to authenticated;

create or replace function public.validate_enemy_details_art_provenance()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $function$
declare
  enemy_art_path text;
begin
  select art_path into enemy_art_path
  from public.enemies
  where id = new.enemy_id and campaign_id = new.campaign_id;

  if enemy_art_path is null and (new.art_prompt is not null or new.art_provider is not null) then
    raise exception 'Enemy artwork provenance requires an approved artwork path' using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function public.validate_enemy_art_provenance()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $function$
declare
  enemy_art_prompt text;
  enemy_art_provider text;
begin
  select art_prompt, art_provider into enemy_art_prompt, enemy_art_provider
  from public.enemy_details
  where enemy_id = new.id and campaign_id = new.campaign_id;

  if new.art_path is null and (enemy_art_prompt is not null or enemy_art_provider is not null) then
    raise exception 'Enemy artwork provenance requires an approved artwork path' using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists enemy_details_art_provenance_trigger on public.enemy_details;
create constraint trigger enemy_details_art_provenance_trigger
after insert or update of enemy_id, campaign_id, art_prompt, art_provider on public.enemy_details
deferrable initially deferred for each row
execute function public.validate_enemy_details_art_provenance();

drop trigger if exists enemy_art_provenance_trigger on public.enemies;
create constraint trigger enemy_art_provenance_trigger
after insert or update of id, campaign_id, art_path on public.enemies
deferrable initially deferred for each row
execute function public.validate_enemy_art_provenance();

drop function if exists public.reimport_enemy_from_source(uuid, uuid, text, jsonb);

create function public.reimport_enemy_from_source(
  p_campaign_id uuid,
  p_enemy_id uuid,
  p_expected_source_hash text,
  p_source jsonb,
  p_authored jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  current_source_hash text;
  source_snapshot_value jsonb;
  new_source_hash text;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  source_snapshot_value := case
    when jsonb_typeof(p_source -> 'sourceSnapshot') = 'object' then p_source -> 'sourceSnapshot'
    else null
  end;
  new_source_hash := source_snapshot_value ->> 'contentHash';

  select source_content_hash
  into current_source_hash
  from public.enemy_details
  where enemy_id = p_enemy_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'Enemy was not found in this campaign' using errcode = 'P0002';
  end if;

  if current_source_hash is distinct from p_expected_source_hash then
    raise exception 'The enemy source changed after this preview was created' using errcode = '40001';
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
      source_external_id = case when (source_snapshot_value ->> 'externalId') ~ '^[0-9]+$' then (source_snapshot_value ->> 'externalId')::bigint else null end,
      source_content_hash = new_source_hash,
      source_snapshot = source_snapshot_value,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where enemy_id = p_enemy_id and campaign_id = p_campaign_id;

  return p_enemy_id;
end;
$function$;

revoke execute on function public.create_enemy_with_details(uuid, jsonb, jsonb) from public;
grant execute on function public.create_enemy_with_details(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb) from public;
grant execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb, jsonb) to authenticated;

drop policy if exists "members can read campaign art" on storage.objects;

create policy "members can read campaign art" on storage.objects for select
using (
  bucket_id = 'campaign-art'
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (
    (select public.is_campaign_gm((storage.foldername(name))[1]::uuid))
    or public.can_read_campaign_art((storage.foldername(name))[1]::uuid, name)
  )
);

drop policy if exists "members can upload campaign art" on storage.objects;

create policy "members can upload campaign art" on storage.objects for insert
with check (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (storage.foldername(name))[2]::uuid = (select auth.uid())
);

drop policy if exists "owners can update campaign art" on storage.objects;

create policy "owners can update campaign art" on storage.objects for update
using (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
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
