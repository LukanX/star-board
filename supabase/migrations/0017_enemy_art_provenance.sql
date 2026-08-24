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
