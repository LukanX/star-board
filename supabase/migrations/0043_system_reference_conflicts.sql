create or replace function public.save_system_reference(
  p_reference_id text, p_expected_revision integer, p_appearance text, p_lore text, p_trait_context text, p_source_notes text
) returns integer language plpgsql security definer set search_path = ''
as $function$
declare
  entry_kind text;
  previous_revision integer;
begin
  if auth.uid() is null or not exists (select 1 from public.system_library_editors where user_id = auth.uid()) then
    raise exception 'Library editor access is required' using errcode = '42501';
  end if;
  select kind into entry_kind from public.system_reference_entries where reference_id = p_reference_id for update;
  if not found then raise exception 'Reference not found' using errcode = 'P0002'; end if;
  select coalesce(max(revision), 0) into previous_revision from public.system_reference_revisions where reference_id = p_reference_id;
  if p_expected_revision is distinct from previous_revision then
    raise exception 'This reference changed after you opened it. Reload before saving.' using errcode = 'PT409';
  end if;
  insert into public.system_reference_revisions(reference_id, kind, revision, appearance, lore, trait_context, source_notes, authored_by)
    values(p_reference_id, entry_kind, previous_revision + 1, p_appearance, p_lore, p_trait_context, p_source_notes, auth.uid());
  return previous_revision + 1;
end;
$function$;

create or replace function public.replace_enemy_reference_selections(p_enemy_id uuid, p_references jsonb)
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
  select campaign_id into enemy_campaign from public.enemies where id = p_enemy_id;
  if auth.uid() is null or enemy_campaign is null or not public.is_campaign_gm(enemy_campaign) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;
  if p_references is null then return; end if;
  perform 1 from public.enemies where id = p_enemy_id for update;
  select traits into enemy_traits from public.enemy_details where enemy_id = p_enemy_id for update;
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
    ) then raise exception 'Reference metadata changed; reselect the reference' using errcode = 'PT409'; end if;
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
  update public.enemies set updated_at = now(), updated_by = auth.uid() where id = p_enemy_id;
end;
$function$;
