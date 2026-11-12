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
  -- An optimistic edit conflict is not a retryable database serialization failure.
  if current_updated_at is distinct from p_expected_updated_at then raise exception 'Subject changed; refresh before replacing art' using errcode = 'PT409'; end if;
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
