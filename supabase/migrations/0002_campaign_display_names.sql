alter table public.campaign_members
  add column display_name text not null default 'Crew member';

alter table public.campaign_members
  add constraint campaign_members_display_name_length
  check (char_length(display_name) between 1 and 120);

update public.campaign_members members
set display_name = coalesce(nullif(trim(profiles.display_name), ''), 'Crew member')
from public.profiles profiles
where profiles.id = members.user_id;

create or replace function public.create_campaign(campaign_name text, campaign_description text default '')
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_campaign_id uuid;
  member_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  insert into public.profiles (id)
  values (auth.uid())
  on conflict (id) do nothing;

  select coalesce(nullif(trim(display_name), ''), 'Crew member')
  into member_display_name
  from public.profiles
  where id = auth.uid();

  insert into public.campaigns (created_by, name, description)
  values (auth.uid(), campaign_name, coalesce(campaign_description, ''))
  returning id into new_campaign_id;

  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (new_campaign_id, auth.uid(), 'gm', member_display_name);

  return new_campaign_id;
end;
$$;

create or replace function public.redeem_campaign_join_link(join_token_hash text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  link public.campaign_join_links;
  joined_campaign_id uuid;
  membership_created boolean;
  member_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  insert into public.profiles (id)
  values (auth.uid())
  on conflict (id) do nothing;

  select coalesce(nullif(trim(display_name), ''), 'Crew member')
  into member_display_name
  from public.profiles
  where id = auth.uid();

  select * into link
  from public.campaign_join_links
  where token_hash = join_token_hash
    and revoked_at is null
    and (expires_at is null or expires_at > timezone('utc', now()))
  for update;

  if link.id is null then
    raise exception 'Join link is invalid or expired';
  end if;

  if exists (
    select 1 from public.campaign_members
    where campaign_id = link.campaign_id and user_id = auth.uid()
  ) then
    return link.campaign_id;
  end if;

  if link.use_count >= link.max_uses then
    raise exception 'Join link has reached its use limit';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (link.campaign_id, auth.uid(), 'player', member_display_name)
  on conflict (campaign_id, user_id) do nothing
  returning true into membership_created;

  if membership_created then
    update public.campaign_join_links
    set use_count = use_count + 1
    where id = link.id;
  end if;

  joined_campaign_id := link.campaign_id;
  return joined_campaign_id;
end;
$$;

create or replace function public.set_campaign_display_name(target_campaign_id uuid, new_display_name text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_name text := trim(new_display_name);
  saved_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 1 and 120 then
    raise exception 'Display name must be between 1 and 120 characters';
  end if;

  update public.campaign_members
  set display_name = normalized_name
  where campaign_id = target_campaign_id
    and user_id = auth.uid()
  returning display_name into saved_name;

  if saved_name is null then
    raise exception 'Campaign membership is missing';
  end if;

  return saved_name;
end;
$$;

revoke all on function public.set_campaign_display_name(uuid, text) from public;
grant execute on function public.set_campaign_display_name(uuid, text) to authenticated;
