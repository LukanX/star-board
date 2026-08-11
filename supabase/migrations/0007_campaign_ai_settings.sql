create table public.campaign_ai_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  enabled_model_ids text[] not null default array[
    'openai/gpt-4o-mini',
    'google/gemini-2.5-flash',
    'openai/gpt-4o',
    'openai/gpt-image-1',
    'google/gemini-2.5-flash-image',
    'bytedance-seed/seedream-4.5'
  ]::text[],
  updated_at timestamptz not null default timezone('utc', now()),
  check (cardinality(enabled_model_ids) > 0)
);

alter table public.campaign_ai_settings enable row level security;

create policy "campaign members can read AI settings" on public.campaign_ai_settings
  for select using (public.is_campaign_member(campaign_id));

create policy "GMs manage campaign AI settings" on public.campaign_ai_settings
  for all using (public.is_campaign_gm(campaign_id))
  with check (public.is_campaign_gm(campaign_id));

grant select, insert, update, delete on table public.campaign_ai_settings to authenticated;
