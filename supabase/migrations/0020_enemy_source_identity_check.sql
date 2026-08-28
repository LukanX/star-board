-- Keep the source identifier, canonical URL, and source snapshot aligned for
-- databases that already applied the earlier workflow-hardening migrations.
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