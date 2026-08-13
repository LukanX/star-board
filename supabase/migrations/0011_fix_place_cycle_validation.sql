create or replace function public.validate_place_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_campaign_id uuid;
  creates_cycle boolean;
begin
  if new.parent_place_id is null then
    return new;
  end if;

  if new.id = new.parent_place_id then
    raise exception 'A place cannot be its own parent';
  end if;

  select campaign_id into parent_campaign_id
  from public.places
  where id = new.parent_place_id;

  if parent_campaign_id is null or parent_campaign_id <> new.campaign_id then
    raise exception 'Place parent must belong to the same campaign';
  end if;

  with recursive ancestors(id) as (
    select new.parent_place_id
    union all
    select parent.parent_place_id
    from public.places parent
    join ancestors child on child.id = parent.id
    where parent.parent_place_id is not null
  )
  select exists(select 1 from ancestors where id = new.id)
  into creates_cycle;

  if creates_cycle then
    raise exception 'A place cannot be moved beneath one of its descendants';
  end if;

  return new;
end;
$$;
