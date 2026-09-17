create or replace function public.create_campaign_visual_style_with_preview(
  p_campaign_id uuid,
  p_name text,
  p_visual_style text,
  p_status text,
  p_wizard_inputs jsonb,
  p_generation_run_id uuid,
  p_prompt text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_style_id uuid;
begin
  if (p_generation_run_id is null) <> (p_prompt is null) then
    raise exception 'A preview generation run and prompt must be provided together' using errcode = '22023';
  end if;

  new_style_id := public.create_campaign_visual_style(p_campaign_id, p_name, p_visual_style, p_status, p_wizard_inputs);

  if p_generation_run_id is not null then
    perform public.attach_campaign_visual_style_preview(
      new_style_id,
      p_generation_run_id,
      p_prompt,
      encode(extensions.digest(p_visual_style, 'sha256'), 'hex'),
      1
    );
  end if;

  return new_style_id;
end;
$$;

create or replace function public.create_and_apply_campaign_visual_style_with_preview(
  p_campaign_id uuid,
  p_name text,
  p_visual_style text,
  p_wizard_inputs jsonb,
  p_generation_run_id uuid,
  p_prompt text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_style_id uuid;
begin
  if (p_generation_run_id is null) <> (p_prompt is null) then
    raise exception 'A preview generation run and prompt must be provided together' using errcode = '22023';
  end if;

  new_style_id := public.create_and_apply_campaign_visual_style(p_campaign_id, p_name, p_visual_style, p_wizard_inputs);

  if p_generation_run_id is not null then
    perform public.attach_campaign_visual_style_preview(
      new_style_id,
      p_generation_run_id,
      p_prompt,
      encode(extensions.digest(p_visual_style, 'sha256'), 'hex'),
      1
    );
  end if;

  return new_style_id;
end;
$$;

create or replace function public.update_campaign_visual_style_with_preview(
  p_style_id uuid,
  p_name text,
  p_visual_style text,
  p_status text,
  p_wizard_inputs jsonb,
  p_expected_revision integer,
  p_generation_run_id uuid,
  p_prompt text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (p_generation_run_id is null) <> (p_prompt is null) then
    raise exception 'A preview generation run and prompt must be provided together' using errcode = '22023';
  end if;

  perform public.update_campaign_visual_style(p_style_id, p_name, p_visual_style, p_status, p_wizard_inputs, p_expected_revision);

  if p_generation_run_id is not null then
    perform public.attach_campaign_visual_style_preview(
      p_style_id,
      p_generation_run_id,
      p_prompt,
      encode(extensions.digest(p_visual_style, 'sha256'), 'hex'),
      p_expected_revision + 1
    );
  end if;
end;
$$;

create or replace function public.update_and_apply_campaign_visual_style_with_preview(
  p_style_id uuid,
  p_name text,
  p_visual_style text,
  p_wizard_inputs jsonb,
  p_expected_revision integer,
  p_generation_run_id uuid,
  p_prompt text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (p_generation_run_id is null) <> (p_prompt is null) then
    raise exception 'A preview generation run and prompt must be provided together' using errcode = '22023';
  end if;

  perform public.update_and_apply_campaign_visual_style(p_style_id, p_name, p_visual_style, p_wizard_inputs, p_expected_revision);

  if p_generation_run_id is not null then
    perform public.attach_campaign_visual_style_preview(
      p_style_id,
      p_generation_run_id,
      p_prompt,
      encode(extensions.digest(p_visual_style, 'sha256'), 'hex'),
      p_expected_revision + 1
    );
  end if;
end;
$$;

revoke all on function public.create_campaign_visual_style_with_preview(uuid, text, text, text, jsonb, uuid, text) from public;
revoke all on function public.create_and_apply_campaign_visual_style_with_preview(uuid, text, text, jsonb, uuid, text) from public;
revoke all on function public.update_campaign_visual_style_with_preview(uuid, text, text, text, jsonb, integer, uuid, text) from public;
revoke all on function public.update_and_apply_campaign_visual_style_with_preview(uuid, text, text, jsonb, integer, uuid, text) from public;

grant execute on function public.create_campaign_visual_style_with_preview(uuid, text, text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.create_and_apply_campaign_visual_style_with_preview(uuid, text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.update_campaign_visual_style_with_preview(uuid, text, text, text, jsonb, integer, uuid, text) to authenticated;
grant execute on function public.update_and_apply_campaign_visual_style_with_preview(uuid, text, text, jsonb, integer, uuid, text) to authenticated;
