create or replace function public.campaign_narrative_style_tags_valid(tags text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    cardinality(tags) <= 8
    and (array_ndims(tags) is null or array_ndims(tags) = 1)
    and not exists (
      select 1
      from unnest(tags) as entries(tag)
      where tag is null
        or tag <> btrim(tag)
        or char_length(tag) not between 1 and 32
        or tag ~ '[[:cntrl:]]'
    )
    and not exists (
      select 1
      from unnest(tags) as entries(tag)
      group by lower(tag)
      having count(*) > 1
    ),
    false
  );
$$;

revoke all on function public.campaign_narrative_style_tags_valid(text[]) from public, anon;
grant execute on function public.campaign_narrative_style_tags_valid(text[]) to authenticated;

create table public.campaign_narrative_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  setting text not null default '' check (
    setting = btrim(setting)
    and char_length(setting) <= 1200
  ),
  style_tags text[] not null default '{}'::text[] check (
    public.campaign_narrative_style_tags_valid(style_tags)
  ),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.campaign_narrative_settings enable row level security;

create policy "GMs manage campaign narrative settings" on public.campaign_narrative_settings
  for all to authenticated
  using ((select public.is_campaign_gm(campaign_id)))
  with check ((select public.is_campaign_gm(campaign_id)));

revoke all on table public.campaign_narrative_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.campaign_narrative_settings to authenticated;