create or replace function public.attach_ai_generation_image(
  p_generation_run_id uuid,
  p_image_path text,
  p_image_media_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    return false;
  end if;

  update public.ai_generation_runs as generation_run
  set image_path = p_image_path,
      image_media_type = p_image_media_type
  where generation_run.id = p_generation_run_id
    and generation_run.kind = 'image'
    and generation_run.purpose = 'entity-art'
    and generation_run.status = 'complete'
    and generation_run.image_path is null
    and generation_run.image_media_type is null
    and generation_run.requested_by = (select auth.uid())
    and p_image_media_type in ('image/png', 'image/jpeg', 'image/webp')
    and p_image_path = generation_run.campaign_id::text
      || '/' || (select auth.uid())::text
      || '/image-' || generation_run.id::text
      || '.' || case p_image_media_type
        when 'image/png' then 'png'
        when 'image/jpeg' then 'jpg'
        when 'image/webp' then 'webp'
      end
    and (
      public.is_campaign_gm(generation_run.campaign_id)
      or (
        generation_run.target_kind = 'character'
        and generation_run.target_character_id is not null
        and exists (
          select 1
          from public.characters as character_record
          where character_record.campaign_id = generation_run.campaign_id
            and character_record.id = generation_run.target_character_id
            and character_record.owner_id = (select auth.uid())
        )
      )
    );

  return found;
end;
$function$;

revoke all on function public.attach_ai_generation_image(uuid, text, text) from public;
grant execute on function public.attach_ai_generation_image(uuid, text, text) to authenticated;