create table public.system_library_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);
create index system_library_admins_grantor on public.system_library_admins(granted_by);
alter table public.system_library_admins enable row level security;
revoke all on public.system_library_admins from anon, authenticated;
grant select on public.system_library_admins to authenticated;
create policy system_admins_self_read on public.system_library_admins for select to authenticated
  using (user_id = (select auth.uid()));

create function public.is_system_library_admin()
returns boolean language sql stable security invoker set search_path = ''
as $function$
  select auth.uid() is not null and exists(
    select 1 from public.system_library_admins where user_id = auth.uid()
  );
$function$;
revoke all on function public.is_system_library_admin() from public, anon;
grant execute on function public.is_system_library_admin() to authenticated;

create function public.list_system_library_users(
  p_query text default '', p_limit integer default 25, p_after_email text default null, p_after_id uuid default null
) returns setof jsonb language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not public.is_system_library_admin() then
    raise exception 'Library administrator access is required' using errcode = '42501';
  end if;
  if p_query is null or length(p_query) > 160 or p_limit is null or p_limit not between 1 and 50
    or (p_after_email is null) <> (p_after_id is null)
    or (p_after_email is not null and length(p_after_email) not between 1 and 320) then
    raise exception 'Invalid directory query' using errcode = '22023';
  end if;
  return query
    select jsonb_build_object(
      'userId', u.id, 'email', u.email, 'accountName', p.display_name,
      'access', case when a.user_id is not null then 'administrator' when e.user_id is not null then 'editor' else 'read-only' end,
      'editorGrantedAt', e.granted_at
    )
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.system_library_admins a on a.user_id = u.id
    left join public.system_library_editors e on e.user_id = u.id
    where u.deleted_at is null and u.is_anonymous is not true and nullif(u.email, '') is not null
      and (position(lower(btrim(p_query)) in lower(u.email)) > 0 or position(lower(btrim(p_query)) in lower(p.display_name)) > 0)
      and (p_after_email is null or (lower(u.email), u.id) > (lower(p_after_email), p_after_id))
    order by lower(u.email), u.id
    limit p_limit + 1;
end;
$function$;
revoke all on function public.list_system_library_users(text, integer, text, uuid) from public, anon;
grant execute on function public.list_system_library_users(text, integer, text, uuid) to authenticated;

create function public.set_system_library_editor(p_user_id uuid, p_can_edit boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  target_email text;
  granted timestamptz;
begin
  if not public.is_system_library_admin() then
    raise exception 'Library administrator access is required' using errcode = '42501';
  end if;
  if p_user_id is null or p_can_edit is null then
    raise exception 'A target account and editing permission are required' using errcode = '22023';
  end if;
  select email into target_email from auth.users
    where id = p_user_id and deleted_at is null and is_anonymous is not true and nullif(email, '') is not null
    for update;
  if not found then raise exception 'Registered account not found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.system_library_admins where user_id = p_user_id) then
    raise exception 'Administrator editing access is inherited and cannot be changed here' using errcode = 'PT409';
  end if;
  if p_can_edit then
    insert into public.system_library_editors(user_id, granted_by) values(p_user_id, auth.uid())
      on conflict(user_id) do nothing;
  else
    delete from public.system_library_editors where user_id = p_user_id;
  end if;
  select granted_at into granted from public.system_library_editors where user_id = p_user_id;
  return jsonb_build_object(
    'userId', p_user_id, 'email', target_email,
    'accountName', (select display_name from public.profiles where id = p_user_id),
    'access', case when granted is null then 'read-only' else 'editor' end,
    'editorGrantedAt', granted
  );
end;
$function$;
revoke all on function public.set_system_library_editor(uuid, boolean) from public, anon;
grant execute on function public.set_system_library_editor(uuid, boolean) to authenticated;

create or replace function public.save_system_reference(
  p_reference_id text, p_expected_revision integer, p_appearance text, p_lore text, p_trait_context text, p_source_notes text
) returns integer language plpgsql security definer set search_path = ''
as $function$
declare
  entry_kind text;
  previous_revision integer;
begin
  if auth.uid() is null or not (
    public.is_system_library_admin() or exists(select 1 from public.system_library_editors where user_id = auth.uid())
  ) then
    raise exception 'Library editor access is required' using errcode = '42501';
  end if;
  select kind into entry_kind from public.system_reference_entries where reference_id = p_reference_id for update;
  if not found then raise exception 'Reference not found' using errcode = 'P0002'; end if;
  select coalesce(max(revision), 0) into previous_revision from public.system_reference_revisions where reference_id = p_reference_id;
  if p_expected_revision is distinct from previous_revision then
    raise exception 'This reference changed after you opened it. Reload before saving.' using errcode = 'PT409';
  end if;
  insert into public.system_reference_revisions(reference_id, kind, revision, appearance, lore, trait_context, source_notes, authored_by)
    values(p_reference_id, entry_kind, previous_revision + 1, p_appearance, p_lore, p_trait_context, p_source_notes, auth.uid());
  return previous_revision + 1;
end;
$function$;
