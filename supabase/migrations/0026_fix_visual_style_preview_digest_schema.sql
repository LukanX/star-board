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

  if p_prompt is null or char_length(p_prompt) not between 1 and 3000 or encode(extensions.digest(p_prompt, 'sha256'), 'hex') is distinct from run_prompt_hash then
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

revoke all on function public.attach_campaign_visual_style_preview(uuid, uuid, text, text, integer) from public;
grant execute on function public.attach_campaign_visual_style_preview(uuid, uuid, text, text, integer) to authenticated;