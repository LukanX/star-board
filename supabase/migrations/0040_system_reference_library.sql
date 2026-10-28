create table public.system_library_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);
alter table public.system_library_editors enable row level security;
revoke all on public.system_library_editors from anon, authenticated;
grant select on public.system_library_editors to authenticated;
create policy system_editors_self_read on public.system_library_editors for select to authenticated
  using (user_id = (select auth.uid()));

create table public.system_reference_entries (
  reference_id text primary key check (length(reference_id) <= 120),
  kind text not null check (kind in ('ancestry', 'creature_trait')),
  name text not null check (length(name) between 1 and 160),
  catalog_version text not null check (length(catalog_version) between 1 and 100),
  source_url text not null check (source_url like 'https://github.com/foundryvtt/pf2e/%' and length(source_url) <= 500),
  publication text not null default '',
  unique (reference_id, kind)
);
create table public.system_reference_revisions (
  reference_id text not null,
  kind text not null,
  revision integer not null check (revision > 0),
  appearance text not null default '' check (length(appearance) <= 4000),
  lore text not null default '' check (length(lore) <= 8000),
  trait_context text not null default '' check (length(trait_context) <= 4000),
  source_notes text not null default '' check (length(source_notes) <= 2000),
  authored_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (reference_id, revision),
  foreign key (reference_id, kind) references public.system_reference_entries(reference_id, kind),
  check ((kind = 'ancestry' and trait_context = '') or (kind = 'creature_trait' and appearance = '' and lore = ''))
);
alter table public.system_reference_entries enable row level security;
alter table public.system_reference_revisions enable row level security;
revoke all on public.system_reference_entries, public.system_reference_revisions from anon, authenticated;
grant select on public.system_reference_entries, public.system_reference_revisions to authenticated;
create policy system_entries_read on public.system_reference_entries for select to authenticated using (true);
create policy system_revisions_read on public.system_reference_revisions for select to authenticated using (true);

create function public.read_system_references(p_ids text[] default null)
returns setof jsonb language sql stable security invoker set search_path = ''
as $function$
  select to_jsonb(e) || jsonb_build_object(
    'revision', coalesce(r.revision, 0), 'appearance', coalesce(r.appearance, ''),
    'lore', coalesce(r.lore, ''), 'trait_context', coalesce(r.trait_context, ''),
    'source_notes', coalesce(r.source_notes, ''), 'updated_at', r.created_at
  )
  from public.system_reference_entries e
  left join lateral (
    select * from public.system_reference_revisions r
    where r.reference_id = e.reference_id order by r.revision desc limit 1
  ) r on true
  where p_ids is null or e.reference_id = any(p_ids)
  order by e.name, e.reference_id;
$function$;
revoke all on function public.read_system_references(text[]) from public, anon;
grant execute on function public.read_system_references(text[]) to authenticated;

create function public.save_system_reference(
  p_reference_id text, p_expected_revision integer, p_appearance text, p_lore text, p_trait_context text, p_source_notes text
) returns integer language plpgsql security definer set search_path = ''
as $function$
declare
  entry_kind text;
  previous_revision integer;
begin
  if auth.uid() is null or not exists (select 1 from public.system_library_editors where user_id = auth.uid()) then
    raise exception 'Library editor access is required' using errcode = '42501';
  end if;
  select kind into entry_kind from public.system_reference_entries where reference_id = p_reference_id for update;
  if not found then raise exception 'Reference not found' using errcode = 'P0002'; end if;
  select coalesce(max(revision), 0) into previous_revision from public.system_reference_revisions where reference_id = p_reference_id;
  if p_expected_revision is distinct from previous_revision then
    raise exception 'This reference changed after you opened it. Reload before saving.' using errcode = '40001';
  end if;
  insert into public.system_reference_revisions(reference_id, kind, revision, appearance, lore, trait_context, source_notes, authored_by)
    values(p_reference_id, entry_kind, previous_revision + 1, p_appearance, p_lore, p_trait_context, p_source_notes, auth.uid());
  return previous_revision + 1;
end;
$function$;
revoke all on function public.save_system_reference(text, integer, text, text, text, text) from public, anon;
grant execute on function public.save_system_reference(text, integer, text, text, text, text) to authenticated;

create table public.campaign_system_reference_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  appearance boolean not null default false,
  lore boolean not null default false,
  creature_traits boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.campaign_system_reference_settings enable row level security;
revoke all on public.campaign_system_reference_settings from anon, authenticated;
grant select, insert, update on public.campaign_system_reference_settings to authenticated;
create policy system_settings_read on public.campaign_system_reference_settings for select to authenticated
  using (public.is_campaign_member(campaign_id));
create policy system_settings_insert on public.campaign_system_reference_settings for insert to authenticated
  with check (public.is_campaign_gm(campaign_id) and updated_by = (select auth.uid()));
create policy system_settings_update on public.campaign_system_reference_settings for update to authenticated
  using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id) and updated_by = (select auth.uid()));

alter table public.ai_generation_runs drop constraint ai_generation_runs_reference_sources_shape;
alter table public.ai_generation_runs add constraint ai_generation_runs_reference_sources_shape check (
  reference_sources is null or case when jsonb_typeof(reference_sources) = 'array'
    then jsonb_array_length(reference_sources) <= 34 and octet_length(reference_sources::text) <= 65536
    else false end
);
