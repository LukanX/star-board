create table public.places (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  parent_place_id uuid references public.places(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  kind text not null default 'location' check (char_length(kind) between 1 and 80),
  description text not null default '',
  player_notes_markdown text not null default '',
  art_subject text,
  art_path text,
  art_prompt text,
  art_provider text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create unique index places_root_name_idx
  on public.places (campaign_id, lower(name))
  where parent_place_id is null;

create unique index places_child_name_idx
  on public.places (campaign_id, parent_place_id, lower(name))
  where parent_place_id is not null;

create table public.place_gm_notes (
  place_id uuid primary key references public.places(id) on delete cascade,
  body_markdown text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.npcs
  add column if not exists place_id uuid references public.places(id) on delete set null;

alter table public.factions
  add column if not exists place_id uuid references public.places(id) on delete set null;

alter table public.jobs
  add column if not exists place_id uuid references public.places(id) on delete set null;

alter table public.episodes
  add column if not exists place_id uuid references public.places(id) on delete set null;

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

  with recursive descendants(id) as (
    select new.parent_place_id
    union all
    select child.id
    from public.places child
    join descendants parent on child.parent_place_id = parent.id
  )
  select exists(select 1 from descendants where id = new.id)
  into creates_cycle;

  if creates_cycle then
    raise exception 'A place cannot be moved beneath one of its descendants';
  end if;

  return new;
end;
$$;

create trigger validate_place_parent
before insert or update of campaign_id, parent_place_id on public.places
for each row execute procedure public.validate_place_parent();

create or replace function public.validate_place_link_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  place_campaign_id uuid;
begin
  if new.place_id is null then
    return new;
  end if;

  select campaign_id into place_campaign_id
  from public.places
  where id = new.place_id;

  if place_campaign_id is null or place_campaign_id <> new.campaign_id then
    raise exception 'Place must belong to the same campaign';
  end if;

  return new;
end;
$$;

create trigger validate_npc_place_campaign
before insert or update of campaign_id, place_id on public.npcs
for each row execute procedure public.validate_place_link_campaign();

create trigger validate_faction_place_campaign
before insert or update of campaign_id, place_id on public.factions
for each row execute procedure public.validate_place_link_campaign();

create trigger validate_job_place_campaign
before insert or update of campaign_id, place_id on public.jobs
for each row execute procedure public.validate_place_link_campaign();

create trigger validate_episode_place_campaign
before insert or update of campaign_id, place_id on public.episodes
for each row execute procedure public.validate_place_link_campaign();

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_kind_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_kind_check
  check (kind in ('mission', 'npc', 'faction', 'place', 'image'));

alter table public.places enable row level security;
alter table public.place_gm_notes enable row level security;

create policy "members read places" on public.places for select using (public.is_campaign_member(campaign_id));
create policy "GMs manage places" on public.places for all using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));

create policy "GMs manage place private notes" on public.place_gm_notes for all using (
  public.is_campaign_gm((select campaign_id from public.places where id = place_id))
) with check (
  public.is_campaign_gm((select campaign_id from public.places where id = place_id))
);

grant select, insert, update, delete on public.places to authenticated;
grant select, insert, update, delete on public.place_gm_notes to authenticated;