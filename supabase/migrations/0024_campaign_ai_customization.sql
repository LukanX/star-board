do $$
begin
  if exists (
    select 1
    from public.campaigns
    where art_style_suffix <> btrim(art_style_suffix)
      or char_length(btrim(art_style_suffix)) not between 1 and 1200
  ) then
    raise exception 'Campaign visual style contains a value outside the 1-1200 character trimmed contract';
  end if;
end;
$$;

alter table public.campaigns
  rename column art_style_suffix to visual_style;

alter table public.campaigns
  add constraint campaigns_visual_style_check
  check (visual_style = btrim(visual_style) and char_length(visual_style) between 1 and 1200);

create table public.campaign_openrouter_credentials (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  ciphertext text not null,
  initialization_vector text not null,
  authentication_tag text not null,
  encryption_key_id text not null check (char_length(encryption_key_id) between 1 and 64),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  key_label text not null default '' check (char_length(key_label) <= 200),
  key_limit_usd numeric(12, 6) check (key_limit_usd is null or key_limit_usd >= 0),
  key_remaining_usd numeric(12, 6) check (key_remaining_usd is null or key_remaining_usd >= 0),
  key_usage_usd numeric(12, 6) not null default 0 check (key_usage_usd >= 0),
  is_unlimited boolean not null default false,
  verification_status text not null default 'verified' check (verification_status in ('verified', 'invalid', 'error')),
  verification_error text check (verification_error is null or char_length(verification_error) <= 500),
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default timezone('utc', now()),
  last_verified_at timestamptz,
  allow_player_ai boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.campaign_openrouter_credentials enable row level security;

revoke all on table public.campaign_openrouter_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.campaign_openrouter_credentials to service_role;

create or replace function public.campaign_allows_player_ai(target_campaign_id uuid)
returns boolean
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.campaign_members
      where campaign_id = target_campaign_id and user_id = auth.uid()
    )
    and exists (
      select 1
      from public.campaign_openrouter_credentials
      where campaign_id = target_campaign_id
        and allow_player_ai
        and verification_status = 'verified'
    );
$$;

revoke all on function public.campaign_allows_player_ai(uuid) from public;
grant execute on function public.campaign_allows_player_ai(uuid) to authenticated;

drop policy if exists "GMs create AI runs" on public.ai_generation_runs;

create policy "GMs and opted-in players create AI runs" on public.ai_generation_runs
  for insert with check (
    requested_by = auth.uid()
    and (
      public.is_campaign_gm(campaign_id)
      or (
        kind = 'character'
        and public.campaign_allows_player_ai(campaign_id)
        and exists (
          select 1
          from public.campaign_members
          where campaign_id = ai_generation_runs.campaign_id
            and user_id = auth.uid()
            and role = 'player'
        )
      )
    )
  );

create or replace function public.update_campaign_ai_preferences(
  p_campaign_id uuid,
  p_visual_style text,
  p_enabled_model_ids text[] default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_gm(p_campaign_id) then
    raise exception 'Campaign GM access is required' using errcode = '42501';
  end if;

  if p_visual_style is null
    or p_visual_style <> btrim(p_visual_style)
    or char_length(p_visual_style) not between 1 and 1200
  then
    raise exception 'Campaign visual style must be trimmed and between 1 and 1200 characters' using errcode = '22023';
  end if;

  if p_enabled_model_ids is not null then
    if cardinality(p_enabled_model_ids) = 0
      or exists (
        select model_id
        from unnest(p_enabled_model_ids) as model_id
        group by model_id
        having count(*) > 1
      )
    then
      raise exception 'Campaign AI model IDs must be non-empty and unique' using errcode = '22023';
    end if;
  end if;

  update public.campaigns
  set visual_style = p_visual_style,
      updated_at = timezone('utc', now())
  where id = p_campaign_id;

  if p_enabled_model_ids is not null then
    insert into public.campaign_ai_settings (campaign_id, enabled_model_ids, updated_at)
    values (p_campaign_id, p_enabled_model_ids, timezone('utc', now()))
    on conflict (campaign_id) do update
    set enabled_model_ids = excluded.enabled_model_ids,
        updated_at = excluded.updated_at;
  end if;
end;
$$;

revoke all on function public.update_campaign_ai_preferences(uuid, text, text[]) from public;
grant execute on function public.update_campaign_ai_preferences(uuid, text, text[]) to authenticated;