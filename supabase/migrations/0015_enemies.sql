create table public.enemies (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  player_description text not null default '' check (char_length(player_description) <= 4000),
  is_revealed boolean not null default false,
  art_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (id, campaign_id),
  check (not is_revealed or char_length(btrim(player_description)) > 0)
);

create table public.enemy_details (
  enemy_id uuid primary key references public.enemies(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  level smallint not null check (level between -1 and 25),
  size text not null check (size in ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan')),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'unique')),
  traits text[] not null default '{}'::text[] check (
    cardinality(traits) <= 32 and array_position(traits, '') is null
  ),
  family text check (family is null or char_length(family) <= 160),
  stat_block jsonb not null check (
    jsonb_typeof(stat_block) = 'object' and stat_block ->> 'schemaVersion' = '1'
  ),
  gm_notes_markdown text not null default '' check (char_length(gm_notes_markdown) <= 20000),
  origin text not null default 'manual' check (origin in ('manual', 'ai', 'aon')),
  art_subject text check (art_subject is null or char_length(art_subject) <= 1600),
  art_prompt text check (art_prompt is null or char_length(art_prompt) <= 4000),
  art_provider text check (art_provider is null or char_length(art_provider) <= 80),
  source_provider text check (source_provider is null or source_provider = 'aon'),
  source_external_id bigint check (source_external_id is null or source_external_id > 0),
  source_content_hash text check (source_content_hash is null or source_content_hash ~ '^[a-f0-9]{64}$'),
  source_snapshot jsonb check (source_snapshot is null or jsonb_typeof(source_snapshot) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null,
  foreign key (enemy_id, campaign_id) references public.enemies(id, campaign_id) on delete cascade,
  check (
    (origin = 'aon' and source_provider = 'aon' and source_external_id is not null and source_content_hash is not null and source_snapshot is not null)
    or (origin <> 'aon' and source_provider is null and source_external_id is null and source_content_hash is null and source_snapshot is null)
  )
);

create index enemies_campaign_revealed_name_idx
  on public.enemies (campaign_id, lower(name))
  where is_revealed;

create index enemies_campaign_level_name_idx
  on public.enemy_details (campaign_id, level, enemy_id);

create index enemy_details_campaign_idx
  on public.enemy_details (campaign_id);

create index enemy_details_traits_gin_idx
  on public.enemy_details using gin (traits);

create index enemies_campaign_art_path_idx
  on public.enemies (campaign_id, art_path)
  where art_path is not null;

create index enemy_details_campaign_art_path_idx
  on public.enemy_details (campaign_id, art_subject)
  where art_subject is not null;

create unique index enemy_details_aon_identity_idx
  on public.enemy_details (campaign_id, source_provider, source_external_id)
  where source_provider = 'aon' and source_external_id is not null;

alter table public.enemies enable row level security;
alter table public.enemy_details enable row level security;

create policy "members read revealed enemies" on public.enemies
for select to authenticated
using (
  (select public.is_campaign_member(campaign_id))
  and (is_revealed or (select public.is_campaign_gm(campaign_id)))
);

create policy "GMs manage enemies" on public.enemies
for all to authenticated
using ((select public.is_campaign_gm(campaign_id)))
with check ((select public.is_campaign_gm(campaign_id)));

create policy "GMs read enemy details" on public.enemy_details
for select to authenticated
using ((select public.is_campaign_gm(campaign_id)));

create policy "GMs manage enemy details" on public.enemy_details
for all to authenticated
using ((select public.is_campaign_gm(campaign_id)))
with check ((select public.is_campaign_gm(campaign_id)));

grant select, insert, update, delete on public.enemies to authenticated;
grant select, insert, update, delete on public.enemy_details to authenticated;

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
    is_revealed,
    art_path,
    updated_by
  ) values (
    p_campaign_id,
    auth.uid(),
    p_public ->> 'name',
    coalesce(p_public ->> 'playerDescription', ''),
    coalesce((p_public ->> 'isRevealed')::boolean, false),
    nullif(p_public ->> 'artPath', ''),
    auth.uid()
  ) returning id into new_enemy_id;

  source_snapshot_value := case
    when jsonb_typeof(p_details -> 'sourceSnapshot') = 'object' then p_details -> 'sourceSnapshot'
    else null
  end;

  insert into public.enemy_details (
    enemy_id,
    campaign_id,
    level,
    size,
    rarity,
    traits,
    family,
    stat_block,
    gm_notes_markdown,
    origin,
    art_subject,
    art_prompt,
    art_provider,
    source_provider,
    source_external_id,
    source_content_hash,
    source_snapshot,
    updated_by
  ) values (
    new_enemy_id,
    p_campaign_id,
    (p_details ->> 'level')::smallint,
    p_details ->> 'size',
    p_details ->> 'rarity',
    array(
      select jsonb_array_elements_text(
        case when jsonb_typeof(p_details -> 'traits') = 'array' then p_details -> 'traits' else '[]'::jsonb end
      )
    ),
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

create or replace function public.update_enemy_with_details(p_campaign_id uuid, p_enemy_id uuid, p_public jsonb, p_details jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  source_snapshot_value jsonb;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
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

  if not found then
    raise exception 'Enemy was not found in this campaign' using errcode = 'P0002';
  end if;

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

  if not found then
    raise exception 'Enemy details were not found in this campaign' using errcode = 'P0002';
  end if;

  return p_enemy_id;
end;
$function$;

create or replace function public.reimport_enemy_from_source(
  p_campaign_id uuid,
  p_enemy_id uuid,
  p_expected_source_hash text,
  p_source jsonb
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
  where enemy_id = p_enemy_id and campaign_id = p_campaign_id;

  if not found then
    raise exception 'Enemy was not found in this campaign' using errcode = 'P0002';
  end if;

  if current_source_hash = new_source_hash then
    return p_enemy_id;
  end if;

  if current_source_hash is distinct from p_expected_source_hash then
    raise exception 'The enemy source changed after this preview was created' using errcode = '40001';
  end if;

  update public.enemies
  set name = p_source ->> 'name',
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

grant execute on function public.create_enemy_with_details(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.update_enemy_with_details(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.reimport_enemy_from_source(uuid, uuid, text, jsonb) to authenticated;

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_kind_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_kind_check
  check (kind in ('mission', 'npc', 'faction', 'place', 'character', 'image', 'enemy'));

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_target_kind_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_target_kind_check
  check (target_kind is null or target_kind in ('character', 'npc', 'faction', 'job', 'place', 'enemy'));

drop policy if exists "members can read campaign art" on storage.objects;

create policy "members can read campaign art" on storage.objects for select
using (
  bucket_id = 'campaign-art'
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (
    (select public.is_campaign_gm((storage.foldername(name))[1]::uuid))
    or storage.filename(name) not like 'enemy-%'
    or exists (
      select 1
      from public.enemies
      where campaign_id = (storage.foldername(name))[1]::uuid
        and art_path = name
        and is_revealed
    )
  )
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
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (storage.foldername(name))[2]::uuid = (select auth.uid())
  and (
    storage.filename(name) not like 'enemy-%'
    or (select public.is_campaign_gm((storage.foldername(name))[1]::uuid))
  )
)
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

drop policy if exists "owners can delete campaign art" on storage.objects;

create policy "owners can delete campaign art" on storage.objects for delete
using (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and (select public.is_campaign_member((storage.foldername(name))[1]::uuid))
  and (storage.foldername(name))[2]::uuid = (select auth.uid())
  and (
    storage.filename(name) not like 'enemy-%'
    or (select public.is_campaign_gm((storage.foldername(name))[1]::uuid))
  )
);