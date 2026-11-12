alter table public.ai_generation_runs drop constraint ai_generation_runs_purpose_check;
alter table public.ai_generation_runs add constraint ai_generation_runs_purpose_check
  check (purpose in ('entity-art', 'style-preview', 'studio-art'));
alter table public.ai_generation_runs drop constraint ai_generation_runs_target_kind_check;
alter table public.ai_generation_runs add constraint ai_generation_runs_target_kind_check
  check (target_kind is null or target_kind in ('character','npc','faction','job','place','enemy','visual-style','scene','battlemap'));
alter table public.ai_generation_runs add column studio_manifest_hash text
  check (studio_manifest_hash is null or studio_manifest_hash ~ '^[0-9a-f]{64}$');
alter table public.ai_generation_runs add constraint studio_generation_shape check (
  (purpose = 'studio-art' and kind = 'image' and target_kind in ('scene','battlemap') and studio_manifest_hash is not null)
  or (purpose <> 'studio-art' and coalesce(target_kind, '') not in ('scene','battlemap'))
);

create table public.campaign_art_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  caption text not null default '' check (char_length(caption) <= 2000),
  kind text not null check (kind in ('scene','battlemap')),
  path text not null unique,
  media_type text not null check (media_type in ('image/png','image/jpeg','image/webp')),
  generation_run_id uuid unique references public.ai_generation_runs(id) on delete set null,
  prompt text not null check (char_length(prompt) between 1 and 3000),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object' and octet_length(manifest::text) <= 30000),
  model text not null,
  provider text not null default 'openrouter',
  aspect_ratio text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, id),
  check (split_part(path, '/', 1) = campaign_id::text and split_part(path, '/', 3) ~ '^studio-[0-9a-f-]{36}\.(png|jpg|webp)$')
);
create index campaign_art_assets_campaign_created_idx on public.campaign_art_assets(campaign_id, created_at desc, id);
create index campaign_art_assets_creator_idx on public.campaign_art_assets(created_by);

create table public.campaign_art_publications (
  asset_id uuid primary key,
  campaign_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  caption text not null default '' check (char_length(caption) <= 2000),
  path text not null,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, asset_id) references public.campaign_art_assets(campaign_id, id) on delete cascade
);
create index campaign_art_publications_campaign_idx on public.campaign_art_publications(campaign_id, created_at desc, asset_id);
create index campaign_art_publications_path_idx on public.campaign_art_publications(campaign_id, path);

create table public.campaign_art_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  asset_id uuid references public.campaign_art_assets(id) on delete set null,
  target_kind text not null check (target_kind in ('character','npc','enemy','place')),
  target_id uuid not null,
  path text not null unique,
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now()
);
create index campaign_art_assignments_campaign_idx on public.campaign_art_assignments(campaign_id, target_kind, target_id);
create index campaign_art_assignments_asset_idx on public.campaign_art_assignments(asset_id);

alter table public.campaign_art_assets enable row level security;
alter table public.campaign_art_publications enable row level security;
alter table public.campaign_art_assignments enable row level security;
create policy "GMs read Studio assets" on public.campaign_art_assets for select to authenticated
  using (public.is_campaign_gm(campaign_id));
create policy "Members read published art" on public.campaign_art_publications for select to authenticated
  using (public.is_campaign_member(campaign_id));
create policy "GMs read art provenance" on public.campaign_art_assignments for select to authenticated
  using (public.is_campaign_gm(campaign_id));
grant select on public.campaign_art_assets, public.campaign_art_publications, public.campaign_art_assignments to authenticated;

create table public.campaign_art_cleanup (
  path text primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index campaign_art_cleanup_campaign_idx on public.campaign_art_cleanup(campaign_id);
alter table public.campaign_art_cleanup enable row level security;
create policy "GMs read art cleanup" on public.campaign_art_cleanup for select to authenticated using (public.is_campaign_gm(campaign_id));
create policy "GMs finish art cleanup" on public.campaign_art_cleanup for delete to authenticated using (public.is_campaign_gm(campaign_id));
grant select, delete on public.campaign_art_cleanup to authenticated;

create function public.queue_studio_entity_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.art_path is not distinct from new.art_path then return new; end if;
  insert into public.campaign_art_cleanup(path, campaign_id)
    select path, campaign_id from public.campaign_art_assignments
    where campaign_id = old.campaign_id and target_id = old.id and path = old.art_path
    on conflict (path) do nothing;
  delete from public.campaign_art_assignments where campaign_id = old.campaign_id and target_id = old.id and path = old.art_path;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger character_studio_art_cleanup after update of art_path or delete on public.characters for each row execute function public.queue_studio_entity_cleanup();
create trigger npc_studio_art_cleanup after update of art_path or delete on public.npcs for each row execute function public.queue_studio_entity_cleanup();
create trigger enemy_studio_art_cleanup after update of art_path or delete on public.enemies for each row execute function public.queue_studio_entity_cleanup();
create trigger place_studio_art_cleanup after update of art_path or delete on public.places for each row execute function public.queue_studio_entity_cleanup();
revoke all on function public.queue_studio_entity_cleanup() from public;

create or replace function public.approve_studio_art(
  p_campaign_id uuid, p_asset_id uuid, p_run_id uuid, p_title text, p_caption text,
  p_prompt text, p_manifest_text text, p_path text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  run public.ai_generation_runs;
  existing_id uuid;
begin
  if not public.is_campaign_gm(p_campaign_id) or (select auth.uid()) is null then
    raise exception 'GM access required' using errcode = '42501';
  end if;
  select * into run from public.ai_generation_runs where id = p_run_id and campaign_id = p_campaign_id for update;
  if not found or run.requested_by <> (select auth.uid()) or run.status <> 'complete'
    or run.purpose <> 'studio-art' or run.kind <> 'image' or run.image_path is null
    or encode(extensions.digest(p_prompt, 'sha256'), 'hex') is distinct from run.prompt_hash
    or encode(extensions.digest(p_manifest_text, 'sha256'), 'hex') is distinct from run.studio_manifest_hash
  then raise exception 'The completed Studio draft could not be verified' using errcode = '22023'; end if;
  select id into existing_id from public.campaign_art_assets where generation_run_id = p_run_id;
  if found then return existing_id; end if;
  if p_path <> (p_campaign_id::text || '/' || (select auth.uid())::text || '/studio-' || p_asset_id::text ||
    case run.image_media_type when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' else '' end)
    or not exists (select 1 from storage.objects where bucket_id = 'campaign-art' and name = p_path)
  then raise exception 'The durable image copy is missing or invalid' using errcode = '22023'; end if;
  insert into public.campaign_art_assets(id, campaign_id, title, caption, kind, path, media_type,
    generation_run_id, prompt, manifest, model, provider, aspect_ratio, created_by)
  values (p_asset_id, p_campaign_id, p_title, p_caption, run.target_kind, p_path, run.image_media_type,
    run.id, p_prompt, p_manifest_text::jsonb, coalesce(run.effective_model, run.model), run.provider, run.aspect_ratio, (select auth.uid()));
  return p_asset_id;
end;
$$;

create or replace function public.manage_studio_art(
  p_campaign_id uuid, p_asset_id uuid, p_action text, p_title text default null, p_caption text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare asset public.campaign_art_assets;
begin
  if not public.is_campaign_gm(p_campaign_id) then raise exception 'GM access required' using errcode = '42501'; end if;
  select * into asset from public.campaign_art_assets where campaign_id = p_campaign_id and id = p_asset_id for update;
  if not found then raise exception 'Artwork not found' using errcode = 'P0002'; end if;
  if p_action = 'edit' then
    update public.campaign_art_assets set title = p_title, caption = p_caption, updated_at = now() where id = asset.id;
  elsif p_action = 'share' then
    insert into public.campaign_art_publications(asset_id,campaign_id,title,caption,path)
      values (asset.id,asset.campaign_id,p_title,p_caption,asset.path)
      on conflict (asset_id) do update set title = excluded.title, caption = excluded.caption;
  elsif p_action = 'unshare' then
    delete from public.campaign_art_publications where asset_id = asset.id;
  elsif p_action = 'delete' then
    insert into public.campaign_art_cleanup(path,campaign_id) values(asset.path,asset.campaign_id) on conflict (path) do nothing;
    delete from public.campaign_art_assets where id = asset.id;
  else raise exception 'Invalid artwork action' using errcode = '22023';
  end if;
  return asset.path;
end;
$$;

create or replace function public.assign_studio_art(
  p_campaign_id uuid, p_asset_id uuid, p_kind text, p_target_id uuid, p_expected_updated_at timestamptz, p_path text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  asset public.campaign_art_assets;
  target_table text;
  previous_path text;
  current_updated_at timestamptz;
begin
  if not public.is_campaign_gm(p_campaign_id) then raise exception 'GM access required' using errcode = '42501'; end if;
  select * into asset from public.campaign_art_assets where campaign_id = p_campaign_id and id = p_asset_id for update;
  if not found then raise exception 'Artwork not found' using errcode = 'P0002'; end if;
  target_table := case p_kind when 'character' then 'characters' when 'npc' then 'npcs' when 'enemy' then 'enemies' when 'place' then 'places' end;
  if target_table is null then raise exception 'Invalid subject kind' using errcode = '22023'; end if;
  execute format('select art_path, updated_at from public.%I where campaign_id = $1 and id = $2 for update', target_table)
    into previous_path, current_updated_at using p_campaign_id, p_target_id;
  if current_updated_at is null then raise exception 'Subject not found in this campaign' using errcode = 'P0002'; end if;
  if current_updated_at is distinct from p_expected_updated_at then raise exception 'Subject changed; refresh before replacing art' using errcode = '40001'; end if;
  if split_part(p_path,'/',1) <> p_campaign_id::text
    or split_part(p_path,'/',2) <> (select auth.uid())::text
    or split_part(p_path,'/',3) !~ ('^' || p_kind || '-[0-9a-f-]{36}\.(png|jpg|webp)$')
    or not exists (select 1 from storage.objects where bucket_id = 'campaign-art' and name = p_path)
  then raise exception 'Invalid entity image copy' using errcode = '22023'; end if;
  if p_kind = 'enemy' then
    update public.enemies set art_path = p_path where campaign_id = p_campaign_id and id = p_target_id;
    update public.enemy_details set art_prompt = null, art_provider = null, art_subject = null
      where campaign_id = p_campaign_id and enemy_id = p_target_id;
  else
    execute format('update public.%I set art_path = $3, art_prompt = null, art_provider = null, art_subject = null where campaign_id = $1 and id = $2', target_table)
      using p_campaign_id,p_target_id,p_path;
  end if;
  insert into public.campaign_art_assignments(campaign_id,asset_id,target_kind,target_id,path,provenance)
    values(p_campaign_id,asset.id,p_kind,p_target_id,p_path,
      jsonb_build_object('prompt',asset.prompt,'manifest',asset.manifest,'model',asset.model,'provider',asset.provider));
  return previous_path;
end;
$$;

revoke all on function public.approve_studio_art(uuid,uuid,uuid,text,text,text,text,text) from public;
revoke all on function public.manage_studio_art(uuid,uuid,text,text,text) from public;
revoke all on function public.assign_studio_art(uuid,uuid,text,uuid,timestamptz,text) from public;
grant execute on function public.approve_studio_art(uuid,uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.manage_studio_art(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.assign_studio_art(uuid,uuid,text,uuid,timestamptz,text) to authenticated;

create or replace function public.can_read_campaign_art(target_campaign_id uuid, target_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_campaign_member(target_campaign_id) and (
    public.is_campaign_gm(target_campaign_id)
    or case when split_part(target_path,'/',3) like 'studio-%' then
      exists (select 1 from public.campaign_art_publications where campaign_id = target_campaign_id and path = target_path)
    else (
      exists (select 1 from public.enemies where campaign_id = target_campaign_id and art_path = target_path and is_revealed)
      or (
        not exists (select 1 from public.enemies where campaign_id = target_campaign_id and art_path = target_path)
        and (
          not exists (select 1 from public.ai_generation_runs where campaign_id = target_campaign_id and image_path = target_path)
          or exists (select 1 from public.ai_generation_runs where campaign_id = target_campaign_id and image_path = target_path and requested_by = (select auth.uid()))
        )
      )
    ) end
  );
$$;

create or replace function public.can_manage_campaign_art(target_campaign_id uuid, target_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_campaign_member(target_campaign_id) and (
    public.is_campaign_gm(target_campaign_id) or (
      split_part(target_path,'/',3) not like 'studio-%'
      and not exists (select 1 from public.enemies where campaign_id = target_campaign_id and art_path = target_path)
      and (not exists (select 1 from public.ai_generation_runs where campaign_id = target_campaign_id and image_path = target_path)
        or exists (select 1 from public.ai_generation_runs where campaign_id = target_campaign_id and image_path = target_path and requested_by = (select auth.uid())))
    )
  );
$$;

create or replace function public.attach_ai_generation_image(p_generation_run_id uuid,p_image_path text,p_image_media_type text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return false; end if;
  update public.ai_generation_runs as run set image_path = p_image_path,image_media_type = p_image_media_type
  where run.id = p_generation_run_id and run.kind = 'image' and run.purpose in ('entity-art','studio-art')
    and run.status = 'complete' and run.image_path is null and run.image_media_type is null
    and run.requested_by = (select auth.uid()) and p_image_media_type in ('image/png','image/jpeg','image/webp')
    and p_image_path = run.campaign_id::text || '/' || (select auth.uid())::text || '/'
      || case when run.purpose = 'studio-art' then 'studio-draft-' else 'image-' end || run.id::text
      || case p_image_media_type when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' end
    and (public.is_campaign_gm(run.campaign_id) or (
      run.purpose = 'entity-art' and run.target_kind = 'character'
      and exists (select 1 from public.characters where campaign_id = run.campaign_id and id = run.target_character_id and owner_id = (select auth.uid()))
    ));
  return found;
end;
$$;

create policy "Only GMs upload Studio objects" on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'campaign-art' or split_part(name,'/',3) not like 'studio-%'
  or public.is_campaign_gm((storage.foldername(name))[1]::uuid));

create policy "Studio images are immutable" on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'campaign-art' or split_part(name,'/',3) not like 'studio-%')
with check (bucket_id <> 'campaign-art' or split_part(name,'/',3) not like 'studio-%');

create policy "GMs clean unreferenced Studio objects" on storage.objects for delete to authenticated
using (bucket_id = 'campaign-art' and split_part(name,'/',3) like 'studio-%'
  and public.is_campaign_gm((storage.foldername(name))[1]::uuid));
create policy "Keep durable Studio images" on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'campaign-art' or not exists (
  select 1 from public.campaign_art_assets where path = name
));
