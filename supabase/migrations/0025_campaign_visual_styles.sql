create table public.campaign_visual_styles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  visual_style text not null check (visual_style = btrim(visual_style) and char_length(visual_style) between 1 and 1200),
  status text not null default 'draft' check (status in ('draft', 'ready')),
  wizard_inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(wizard_inputs) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  preview_generation_run_id uuid references public.ai_generation_runs(id) on delete set null,
  preview_path text check (preview_path is null or preview_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/style-preview-[0-9a-fA-F-]{36}\.(png|jpg|webp)$'),
  preview_media_type text check (preview_media_type is null or preview_media_type in ('image/png', 'image/jpeg', 'image/webp')),
  preview_prompt text check (preview_prompt is null or char_length(preview_prompt) between 1 and 3000),
  preview_provider text check (preview_provider is null or char_length(preview_provider) between 1 and 120),
  preview_model text check (preview_model is null or char_length(preview_model) between 1 and 240),
  preview_subject text check (preview_subject is null or char_length(preview_subject) between 1 and 1200),
  preview_aspect_ratio text check (preview_aspect_ratio is null or char_length(preview_aspect_ratio) between 3 and 8),
  preview_size text check (preview_size is null or char_length(preview_size) between 1 and 32),
  preview_style_hash text check (preview_style_hash is null or preview_style_hash ~ '^[0-9a-f]{64}$'),
  preview_created_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index campaign_visual_styles_campaign_name_idx
  on public.campaign_visual_styles (campaign_id, lower(name));

create index campaign_visual_styles_campaign_id_idx
  on public.campaign_visual_styles (campaign_id, updated_at desc);

create index campaign_visual_styles_preview_path_idx
  on public.campaign_visual_styles (campaign_id, preview_path)
  where preview_path is not null;

alter table public.campaign_visual_styles enable row level security;

create policy "campaign GMs can read visual styles" on public.campaign_visual_styles
  for select using (public.is_campaign_gm(campaign_id));

grant select on table public.campaign_visual_styles to authenticated;

insert into public.campaign_visual_styles (campaign_id, name, visual_style, status, wizard_inputs, created_by, created_at, updated_at)
select campaign.id, 'Original Campaign Style', campaign.visual_style, 'ready', '{}'::jsonb, campaign.created_by, campaign.created_at, campaign.updated_at
from public.campaigns as campaign
where not exists (
  select 1
  from public.campaign_visual_styles as existing_style
  where existing_style.campaign_id = campaign.id
);

alter table public.ai_generation_runs
  add column if not exists purpose text not null default 'entity-art',
  add column if not exists visual_style_hash text,
  add column if not exists image_subject text;

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_kind_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_kind_check
  check (kind in ('mission', 'npc', 'faction', 'place', 'character', 'image', 'enemy', 'visual-style'));

alter table public.ai_generation_runs
  drop constraint if exists ai_generation_runs_target_kind_check;

alter table public.ai_generation_runs
  add constraint ai_generation_runs_target_kind_check
  check (target_kind is null or target_kind in ('character', 'npc', 'faction', 'job', 'place', 'enemy', 'visual-style'));

alter table public.ai_generation_runs
  add constraint ai_generation_runs_image_subject_check
  check (image_subject is null or char_length(image_subject) between 1 and 1200);

alter table public.ai_generation_runs
  add constraint ai_generation_runs_purpose_check
  check (purpose in ('entity-art', 'style-preview'));

alter table public.ai_generation_runs
  add constraint ai_generation_runs_visual_style_hash_check
  check (visual_style_hash is null or visual_style_hash ~ '^[0-9a-f]{64}$');

create or replace function public.create_campaign_visual_style(
  p_campaign_id uuid,
  p_name text,
  p_visual_style text,
  p_status text default 'draft',
  p_wizard_inputs jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_style_id uuid;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 1 and 80 then
    raise exception 'Style name must be trimmed and between 1 and 80 characters' using errcode = '22023';
  end if;

  if p_visual_style is null or p_visual_style <> btrim(p_visual_style) or char_length(p_visual_style) not between 1 and 1200 then
    raise exception 'Visual style must be trimmed and between 1 and 1200 characters' using errcode = '22023';
  end if;

  if p_status not in ('draft', 'ready') then
    raise exception 'Visual style status is invalid' using errcode = '22023';
  end if;

  if p_wizard_inputs is null or jsonb_typeof(p_wizard_inputs) <> 'object' then
    raise exception 'Visual style wizard inputs must be an object' using errcode = '22023';
  end if;

  insert into public.campaign_visual_styles (campaign_id, name, visual_style, status, wizard_inputs, created_by)
  values (p_campaign_id, p_name, p_visual_style, p_status, p_wizard_inputs, auth.uid())
  returning id into new_style_id;

  return new_style_id;
end;
$$;

create or replace function public.create_and_apply_campaign_visual_style(
  p_campaign_id uuid,
  p_name text,
  p_visual_style text,
  p_wizard_inputs jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_style_id uuid;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  new_style_id := public.create_campaign_visual_style(p_campaign_id, p_name, p_visual_style, 'ready', p_wizard_inputs);

  update public.campaigns
  set visual_style = p_visual_style,
      updated_at = timezone('utc', now())
  where id = p_campaign_id;

  return new_style_id;
end;
$$;

create or replace function public.update_campaign_visual_style(
  p_style_id uuid,
  p_name text,
  p_visual_style text,
  p_status text,
  p_wizard_inputs jsonb,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  style_campaign_id uuid;
begin
  select campaign_id into style_campaign_id
  from public.campaign_visual_styles
  where id = p_style_id;

  if style_campaign_id is null then
    raise exception 'Visual style was not found' using errcode = 'P0002';
  end if;

  if auth.uid() is null or not public.is_campaign_gm(style_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 1 and 80 then
    raise exception 'Style name must be trimmed and between 1 and 80 characters' using errcode = '22023';
  end if;

  if p_visual_style is null or p_visual_style <> btrim(p_visual_style) or char_length(p_visual_style) not between 1 and 1200 then
    raise exception 'Visual style must be trimmed and between 1 and 1200 characters' using errcode = '22023';
  end if;

  if p_status not in ('draft', 'ready') then
    raise exception 'Visual style status is invalid' using errcode = '22023';
  end if;

  if p_wizard_inputs is null or jsonb_typeof(p_wizard_inputs) <> 'object' then
    raise exception 'Visual style wizard inputs must be an object' using errcode = '22023';
  end if;

  update public.campaign_visual_styles
  set name = p_name,
      visual_style = p_visual_style,
      status = p_status,
      wizard_inputs = p_wizard_inputs,
      revision = revision + 1,
      updated_at = timezone('utc', now())
  where id = p_style_id
    and revision = p_expected_revision;

  if not found then
    raise exception 'Visual style was changed by another request' using errcode = '40001';
  end if;
end;
$$;

create or replace function public.update_and_apply_campaign_visual_style(
  p_style_id uuid,
  p_name text,
  p_visual_style text,
  p_wizard_inputs jsonb,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  style_campaign_id uuid;
begin
  select campaign_id into style_campaign_id
  from public.campaign_visual_styles
  where id = p_style_id;

  if style_campaign_id is null then
    raise exception 'Visual style was not found' using errcode = 'P0002';
  end if;

  if auth.uid() is null or not public.is_campaign_gm(style_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 1 and 80 then
    raise exception 'Style name must be trimmed and between 1 and 80 characters' using errcode = '22023';
  end if;

  if p_visual_style is null or p_visual_style <> btrim(p_visual_style) or char_length(p_visual_style) not between 1 and 1200 then
    raise exception 'Visual style must be trimmed and between 1 and 1200 characters' using errcode = '22023';
  end if;

  if p_wizard_inputs is null or jsonb_typeof(p_wizard_inputs) <> 'object' then
    raise exception 'Visual style wizard inputs must be an object' using errcode = '22023';
  end if;

  update public.campaign_visual_styles
  set name = p_name,
      visual_style = p_visual_style,
      status = 'ready',
      wizard_inputs = p_wizard_inputs,
      revision = revision + 1,
      updated_at = timezone('utc', now())
  where id = p_style_id
    and revision = p_expected_revision;

  if not found then
    raise exception 'Visual style was changed by another request' using errcode = '40001';
  end if;

  update public.campaigns
  set visual_style = p_visual_style,
      updated_at = timezone('utc', now())
  where id = style_campaign_id;
end;
$$;

create or replace function public.apply_campaign_visual_style(
  p_campaign_id uuid,
  p_style_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  applied_style text;
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  select visual_style into applied_style
  from public.campaign_visual_styles
  where id = p_style_id
    and campaign_id = p_campaign_id
    and status = 'ready';

  if applied_style is null then
    raise exception 'A ready visual style from this campaign is required' using errcode = 'P0002';
  end if;

  update public.campaigns
  set visual_style = applied_style,
      updated_at = timezone('utc', now())
  where id = p_campaign_id;
end;
$$;

create or replace function public.delete_campaign_visual_style(
  p_style_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  style_campaign_id uuid;
begin
  select campaign_id into style_campaign_id
  from public.campaign_visual_styles
  where id = p_style_id;

  if style_campaign_id is null then
    raise exception 'Visual style was not found' using errcode = 'P0002';
  end if;

  if auth.uid() is null or not public.is_campaign_gm(style_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  delete from public.campaign_visual_styles where id = p_style_id;
end;
$$;

create or replace function public.attach_campaign_visual_style_preview(
  p_style_id uuid,
  p_generation_run_id uuid,
  p_prompt text,
  p_style_hash text,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  style_campaign_id uuid;
  run_campaign_id uuid;
  run_requested_by uuid;
  run_prompt_hash text;
  run_style_hash text;
  run_path text;
  run_media_type text;
  run_provider text;
  run_model text;
  run_subject text;
  run_aspect_ratio text;
  run_size text;
begin
  select campaign_id into style_campaign_id
  from public.campaign_visual_styles
  where id = p_style_id;

  if style_campaign_id is null then
    raise exception 'Visual style was not found' using errcode = 'P0002';
  end if;

  if auth.uid() is null or not public.is_campaign_gm(style_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  select campaign_id, requested_by, prompt_hash, visual_style_hash, image_path, image_media_type, provider, coalesce(effective_model, model), image_subject, aspect_ratio, size
  into run_campaign_id, run_requested_by, run_prompt_hash, run_style_hash, run_path, run_media_type, run_provider, run_model, run_subject, run_aspect_ratio, run_size
  from public.ai_generation_runs
  where id = p_generation_run_id
    and kind = 'image'
    and purpose = 'style-preview'
    and target_kind = 'visual-style'
    and status = 'complete';

  if run_campaign_id is null or run_campaign_id <> style_campaign_id or run_requested_by <> auth.uid() or run_path is null then
    raise exception 'A completed style preview from this campaign is required' using errcode = '22023';
  end if;

  if p_prompt is null or char_length(p_prompt) not between 1 and 3000 or encode(digest(p_prompt, 'sha256'), 'hex') is distinct from run_prompt_hash then
    raise exception 'The preview prompt does not match the completed generation' using errcode = '22023';
  end if;

  if p_style_hash is null or p_style_hash is distinct from run_style_hash then
    raise exception 'The preview style does not match the completed generation' using errcode = '22023';
  end if;

  update public.campaign_visual_styles
  set preview_generation_run_id = p_generation_run_id,
      preview_path = run_path,
      preview_media_type = run_media_type,
      preview_prompt = p_prompt,
      preview_provider = run_provider,
      preview_model = run_model,
      preview_subject = run_subject,
      preview_aspect_ratio = run_aspect_ratio,
      preview_size = run_size,
      preview_style_hash = p_style_hash,
      preview_created_at = timezone('utc', now()),
      revision = revision + 1,
      updated_at = timezone('utc', now())
  where id = p_style_id
    and revision = p_expected_revision;

  if not found then
    raise exception 'Visual style was changed by another request' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.create_campaign_visual_style(uuid, text, text, text, jsonb) from public;
revoke all on function public.create_and_apply_campaign_visual_style(uuid, text, text, jsonb) from public;
revoke all on function public.update_campaign_visual_style(uuid, text, text, text, jsonb, integer) from public;
revoke all on function public.update_and_apply_campaign_visual_style(uuid, text, text, jsonb, integer) from public;
revoke all on function public.apply_campaign_visual_style(uuid, uuid) from public;
revoke all on function public.delete_campaign_visual_style(uuid) from public;
revoke all on function public.attach_campaign_visual_style_preview(uuid, uuid, text, text, integer) from public;

grant execute on function public.create_campaign_visual_style(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.create_and_apply_campaign_visual_style(uuid, text, text, jsonb) to authenticated;
grant execute on function public.update_campaign_visual_style(uuid, text, text, text, jsonb, integer) to authenticated;
grant execute on function public.update_and_apply_campaign_visual_style(uuid, text, text, jsonb, integer) to authenticated;
grant execute on function public.apply_campaign_visual_style(uuid, uuid) to authenticated;
grant execute on function public.delete_campaign_visual_style(uuid) to authenticated;
grant execute on function public.attach_campaign_visual_style_preview(uuid, uuid, text, text, integer) to authenticated;