alter table public.ai_generation_runs
  add column requested_resolution text,
  add column image_width integer,
  add column image_height integer,
  add column source_asset_id uuid;

alter table public.ai_generation_runs drop constraint ai_generation_runs_operation_check;
alter table public.ai_generation_runs add constraint ai_generation_runs_operation_check
  check (operation in ('generate', 'redo', 'edit', 'upscale'));
alter table public.ai_generation_runs add constraint ai_generation_runs_requested_resolution_check
  check (requested_resolution is null or requested_resolution in ('1K', '2K', '4K'));
alter table public.ai_generation_runs add constraint ai_generation_runs_dimensions_pair_check
  check ((image_width is null) = (image_height is null));
alter table public.ai_generation_runs add constraint ai_generation_runs_dimensions_range_check
  check (image_width is null or (image_width > 0 and image_height > 0 and image_width::bigint * image_height::bigint <= 64000000));
alter table public.ai_generation_runs add constraint ai_generation_runs_source_asset_operation_check
  check (source_asset_id is null or operation = 'upscale');
alter table public.ai_generation_runs add constraint ai_generation_runs_upscale_shape_check
  check (operation <> 'upscale' or (
    purpose = 'studio-art' and kind = 'image' and target_kind in ('scene', 'battlemap')
    and requested_resolution = '4K'
    and (source_asset_id is not null or status in ('complete', 'failed'))
  ));

create unique index ai_generation_runs_campaign_id_id_key on public.ai_generation_runs(campaign_id, id);
create index ai_generation_runs_source_asset_idx on public.ai_generation_runs(campaign_id, source_asset_id)
  where source_asset_id is not null;

alter table public.campaign_art_assets
  add column operation text not null default 'generate',
  add column requested_resolution text,
  add column image_width integer,
  add column image_height integer,
  add column source_asset_id uuid;

alter table public.campaign_art_assets add constraint campaign_art_assets_operation_check
  check (operation in ('generate', 'redo', 'edit', 'upscale'));
alter table public.campaign_art_assets add constraint campaign_art_assets_requested_resolution_check
  check (requested_resolution is null or requested_resolution in ('1K', '2K', '4K'));
alter table public.campaign_art_assets add constraint campaign_art_assets_dimensions_pair_check
  check ((image_width is null) = (image_height is null));
alter table public.campaign_art_assets add constraint campaign_art_assets_dimensions_range_check
  check (image_width is null or (image_width > 0 and image_height > 0 and image_width::bigint * image_height::bigint <= 64000000));
alter table public.campaign_art_assets add constraint campaign_art_assets_upscale_shape_check
  check (
    (operation = 'upscale' and requested_resolution = '4K' and image_width is not null and source_asset_id is distinct from id)
    or (operation <> 'upscale' and source_asset_id is null)
  );
create index campaign_art_assets_source_asset_idx on public.campaign_art_assets(campaign_id, source_asset_id)
  where source_asset_id is not null;

alter table public.ai_generation_runs add constraint ai_generation_runs_source_asset_campaign_fkey
  foreign key (campaign_id, source_asset_id)
  references public.campaign_art_assets(campaign_id, id)
  on delete set null (source_asset_id);
alter table public.campaign_art_assets add constraint campaign_art_assets_source_asset_campaign_fkey
  foreign key (campaign_id, source_asset_id)
  references public.campaign_art_assets(campaign_id, id)
  on delete set null (source_asset_id);

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
  insert into public.campaign_art_assets(
    id, campaign_id, title, caption, kind, path, media_type, generation_run_id, prompt, manifest,
    model, provider, aspect_ratio, created_by, operation, requested_resolution, image_width, image_height, source_asset_id
  )
  values (
    p_asset_id, p_campaign_id, p_title, p_caption, run.target_kind, p_path, run.image_media_type,
    run.id, p_prompt, p_manifest_text::jsonb, coalesce(run.effective_model, run.model), run.provider,
    run.aspect_ratio, (select auth.uid()), run.operation, run.requested_resolution,
    run.image_width, run.image_height, run.source_asset_id
  );
  return p_asset_id;
end;
$$;
