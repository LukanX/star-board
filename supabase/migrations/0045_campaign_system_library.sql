create table public.campaign_system_library_editors (
  campaign_id uuid not null,
  user_id uuid not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (campaign_id, user_id),
  foreign key (campaign_id, user_id)
    references public.campaign_members(campaign_id, user_id) on delete cascade
);
create index campaign_system_library_editors_user_campaign
  on public.campaign_system_library_editors(user_id, campaign_id);
alter table public.campaign_system_library_editors enable row level security;
revoke all on public.campaign_system_library_editors from anon, authenticated;

create table public.campaign_system_reference_revisions (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  reference_id text not null,
  kind text not null,
  revision integer not null check (revision > 0),
  appearance text not null default '' check (length(appearance) <= 4000),
  lore text not null default '' check (length(lore) <= 8000),
  trait_context text not null default '' check (length(trait_context) <= 4000),
  source_notes text not null default '' check (length(source_notes) <= 2000),
  authored_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, reference_id, revision),
  foreign key (reference_id, kind)
    references public.system_reference_entries(reference_id, kind) on delete cascade,
  check (
    (kind = 'ancestry' and trait_context = '')
    or (kind = 'creature_trait' and appearance = '' and lore = '')
  )
);
alter table public.campaign_system_reference_revisions enable row level security;
revoke all on public.campaign_system_reference_revisions from anon, authenticated;
grant select on public.campaign_system_reference_revisions to authenticated;

create function public.is_campaign_system_library_owner(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.campaigns
    where id = p_campaign_id and created_by = auth.uid()
  );
$function$;
revoke all on function public.is_campaign_system_library_owner(uuid) from public, anon;
grant execute on function public.is_campaign_system_library_owner(uuid) to authenticated;

create function public.is_campaign_system_library_editor(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and (
    public.is_campaign_system_library_owner(p_campaign_id)
    or exists (
      select 1 from public.campaign_system_library_editors
      where campaign_id = p_campaign_id and user_id = auth.uid()
    )
  );
$function$;
revoke all on function public.is_campaign_system_library_editor(uuid) from public, anon;
grant execute on function public.is_campaign_system_library_editor(uuid) to authenticated;

create policy campaign_system_reference_revisions_member_read
  on public.campaign_system_reference_revisions for select to authenticated
  using (
    public.is_campaign_member(campaign_id)
    or public.is_campaign_system_library_owner(campaign_id)
  );

insert into public.campaign_system_reference_revisions (
  campaign_id, reference_id, kind, revision, appearance, lore, trait_context,
  source_notes, authored_by, created_at
)
select campaigns.id, revisions.reference_id, revisions.kind, revisions.revision,
  revisions.appearance, revisions.lore, revisions.trait_context, revisions.source_notes,
  revisions.authored_by, revisions.created_at
from public.campaigns
cross join public.system_reference_revisions as revisions
on conflict (campaign_id, reference_id, revision) do nothing;

with previous_grants as (
  select user_id, granted_at, granted_by from public.system_library_editors
  union all
  select user_id, granted_at, granted_by from public.system_library_admins
), campaign_grants as (
  select distinct on (members.campaign_id, members.user_id)
    members.campaign_id, members.user_id, grants.granted_at, grants.granted_by
  from public.campaign_members as members
  join public.campaigns on campaigns.id = members.campaign_id
  join previous_grants as grants on grants.user_id = members.user_id
  where members.user_id <> campaigns.created_by
  order by members.campaign_id, members.user_id, grants.granted_at
)
insert into public.campaign_system_library_editors(campaign_id, user_id, granted_at, granted_by)
select campaign_id, user_id, granted_at, granted_by from campaign_grants
on conflict (campaign_id, user_id) do nothing;

create function public.get_campaign_system_library_access(p_campaign_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select jsonb_build_object(
    'owner', public.is_campaign_system_library_owner(p_campaign_id),
    'member', public.is_campaign_member(p_campaign_id),
    'canEdit', public.is_campaign_system_library_editor(p_campaign_id)
  )
  where exists (select 1 from public.campaigns where id = p_campaign_id)
  union all
  select jsonb_build_object('owner', false, 'member', false, 'canEdit', false)
  where not exists (select 1 from public.campaigns where id = p_campaign_id)
  limit 1;
$function$;
revoke all on function public.get_campaign_system_library_access(uuid) from public, anon;
grant execute on function public.get_campaign_system_library_access(uuid) to authenticated;

create function public.list_campaign_system_library_members(
  p_campaign_id uuid,
  p_query text default '',
  p_limit integer default 25,
  p_after_name text default null,
  p_after_id uuid default null
) returns setof jsonb language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not public.is_campaign_system_library_owner(p_campaign_id) then
    raise exception 'Campaign library owner access is required' using errcode = '42501';
  end if;
  if p_query is null or length(p_query) > 160
    or p_limit is null or p_limit not between 1 and 50
    or (p_after_name is null) <> (p_after_id is null)
    or (p_after_name is not null and length(p_after_name) not between 1 and 120) then
    raise exception 'Invalid campaign directory query' using errcode = '22023';
  end if;
  return query
    select jsonb_build_object(
      'userId', members.user_id,
      'displayName', members.display_name,
      'campaignRole', members.role,
      'access', case
        when members.user_id = campaigns.created_by then 'owner'
        when editors.user_id is not null then 'editor'
        else 'read-only'
      end,
      'editorGrantedAt', editors.granted_at
    )
    from public.campaign_members as members
    join public.campaigns on campaigns.id = members.campaign_id
    left join public.campaign_system_library_editors as editors
      on editors.campaign_id = members.campaign_id and editors.user_id = members.user_id
    where members.campaign_id = p_campaign_id
      and position(lower(btrim(p_query)) in lower(members.display_name)) > 0
      and (p_after_name is null or (lower(members.display_name), members.user_id) > (lower(p_after_name), p_after_id))
    order by lower(members.display_name), members.user_id
    limit p_limit + 1;
end;
$function$;
revoke all on function public.list_campaign_system_library_members(uuid, text, integer, text, uuid) from public, anon;
grant execute on function public.list_campaign_system_library_members(uuid, text, integer, text, uuid) to authenticated;

create function public.set_campaign_system_library_editor(
  p_campaign_id uuid, p_user_id uuid, p_can_edit boolean
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  campaign_owner uuid;
  member_name text;
  member_role public.campaign_role;
  granted timestamptz;
begin
  if not public.is_campaign_system_library_owner(p_campaign_id) then
    raise exception 'Campaign library owner access is required' using errcode = '42501';
  end if;
  if p_campaign_id is null or p_user_id is null or p_can_edit is null then
    raise exception 'A campaign, member and editing permission are required' using errcode = '22023';
  end if;
  select created_by into campaign_owner
  from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  if p_user_id = campaign_owner then
    raise exception 'Campaign owner editing access is inherited' using errcode = 'PT409';
  end if;
  select display_name, role into member_name, member_role
  from public.campaign_members
  where campaign_id = p_campaign_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Campaign member not found' using errcode = 'P0002'; end if;
  if p_can_edit then
    insert into public.campaign_system_library_editors(campaign_id, user_id, granted_by)
    values (p_campaign_id, p_user_id, auth.uid())
    on conflict (campaign_id, user_id) do nothing;
  else
    delete from public.campaign_system_library_editors
    where campaign_id = p_campaign_id and user_id = p_user_id;
  end if;
  select granted_at into granted
  from public.campaign_system_library_editors
  where campaign_id = p_campaign_id and user_id = p_user_id;
  return jsonb_build_object(
    'userId', p_user_id,
    'displayName', member_name,
    'campaignRole', member_role,
    'access', case when granted is null then 'read-only' else 'editor' end,
    'editorGrantedAt', granted
  );
end;
$function$;
revoke all on function public.set_campaign_system_library_editor(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_campaign_system_library_editor(uuid, uuid, boolean) to authenticated;

drop function public.read_system_references(text[]);
create function public.read_system_references(
  p_campaign_id uuid default null,
  p_ids text[] default null
) returns setof jsonb language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_campaign_id is not null
    and not public.is_campaign_member(p_campaign_id)
    and not public.is_campaign_system_library_owner(p_campaign_id) then
    raise exception 'Campaign membership is required' using errcode = '42501';
  end if;
  return query
    select to_jsonb(entries) || jsonb_build_object(
      'revision', coalesce(revisions.revision, 0),
      'appearance', coalesce(revisions.appearance, ''),
      'lore', coalesce(revisions.lore, ''),
      'trait_context', coalesce(revisions.trait_context, ''),
      'source_notes', coalesce(revisions.source_notes, ''),
      'updated_at', revisions.created_at
    )
    from public.system_reference_entries as entries
    left join lateral (
      select *
      from public.campaign_system_reference_revisions
      where campaign_id = p_campaign_id and reference_id = entries.reference_id
      order by revision desc
      limit 1
    ) as revisions on p_campaign_id is not null
    where p_ids is null or entries.reference_id = any(p_ids)
    order by entries.name, entries.reference_id;
end;
$function$;
revoke all on function public.read_system_references(uuid, text[]) from public, anon;
grant execute on function public.read_system_references(uuid, text[]) to authenticated;

drop function public.save_system_reference(text, integer, text, text, text, text);
create function public.save_system_reference(
  p_campaign_id uuid,
  p_reference_id text,
  p_expected_revision integer,
  p_appearance text,
  p_lore text,
  p_trait_context text,
  p_source_notes text
) returns integer language plpgsql security definer set search_path = ''
as $function$
declare
  entry_kind text;
  previous_revision integer;
begin
  if auth.uid() is null or not public.is_campaign_system_library_editor(p_campaign_id) then
    raise exception 'Campaign library editor access is required' using errcode = '42501';
  end if;
  if p_reference_id is null or p_expected_revision is null
    or p_appearance is null or p_lore is null or p_trait_context is null or p_source_notes is null then
    raise exception 'Reference content is invalid' using errcode = '22023';
  end if;
  select kind into entry_kind
  from public.system_reference_entries
  where reference_id = p_reference_id
  for update;
  if not found then raise exception 'Reference not found' using errcode = 'P0002'; end if;
  select coalesce(max(revision), 0) into previous_revision
  from public.campaign_system_reference_revisions
  where campaign_id = p_campaign_id and reference_id = p_reference_id;
  if p_expected_revision is distinct from previous_revision then
    raise exception 'This reference changed after you opened it. Reload before saving.' using errcode = 'PT409';
  end if;
  insert into public.campaign_system_reference_revisions(
    campaign_id, reference_id, kind, revision, appearance, lore, trait_context, source_notes, authored_by
  ) values (
    p_campaign_id, p_reference_id, entry_kind, previous_revision + 1,
    p_appearance, p_lore, p_trait_context, p_source_notes, auth.uid()
  );
  return previous_revision + 1;
end;
$function$;
revoke all on function public.save_system_reference(uuid, text, integer, text, text, text, text) from public, anon;
grant execute on function public.save_system_reference(uuid, text, integer, text, text, text, text) to authenticated;

drop function public.list_system_library_users(text, integer, text, uuid);
drop function public.set_system_library_editor(uuid, boolean);
drop function public.is_system_library_admin();
drop policy if exists system_revisions_read on public.system_reference_revisions;
revoke all on public.system_reference_revisions from anon, authenticated;
drop table public.system_library_admins;
drop table public.system_library_editors;
