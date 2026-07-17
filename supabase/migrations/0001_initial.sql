create extension if not exists pgcrypto;

create type public.campaign_role as enum ('gm', 'player');
create type public.job_status as enum ('draft', 'open', 'promoted', 'archived');
create type public.note_visibility as enum ('player', 'gm');
create type public.episode_status as enum ('planned', 'active', 'complete', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Crew member',
  avatar_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  system text not null default 'Starfinder 2e',
  description text not null default '',
  art_style_suffix text not null default 'Retro-futurist, cinematic, strange but hopeful.',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.campaign_role not null default 'player',
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, user_id)
);

create table public.campaign_join_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz,
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.factions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  status text not null default 'active',
  art_path text,
  art_prompt text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (campaign_id, name)
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  species text not null default '',
  class_name text not null default '',
  level integer not null default 1 check (level between 1 and 20),
  backstory_markdown text not null default '',
  art_path text,
  art_prompt text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.npcs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  species text not null default '',
  role text not null default '',
  description text not null default '',
  player_notes_markdown text not null default '',
  art_path text,
  art_prompt text,
  art_provider text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '',
  player_notes_markdown text not null default '',
  giver_npc_id uuid references public.npcs(id) on delete set null,
  giver_faction_id uuid references public.factions(id) on delete set null,
  status public.job_status not null default 'draft',
  art_path text,
  art_prompt text,
  art_provider text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null,
  check ((case when giver_npc_id is not null then 1 else 0 end + case when giver_faction_id is not null then 1 else 0 end) = 1)
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_job_id uuid unique references public.jobs(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '',
  player_context_markdown text not null default '',
  status public.episode_status not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.npc_gm_notes (
  npc_id uuid primary key references public.npcs(id) on delete cascade,
  body_markdown text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.job_gm_notes (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  body_markdown text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.episode_gm_notes (
  episode_id uuid primary key references public.episodes(id) on delete cascade,
  body_markdown text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.campaign_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  body_markdown text not null default '',
  visibility public.note_visibility not null default 'player',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.job_votes (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, user_id)
);

create table public.ai_generation_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('mission', 'npc', 'image')),
  mode text not null default 'create',
  model text,
  prompt_hash text,
  input_tokens integer,
  output_tokens integer,
  status text not null default 'complete' check (status in ('complete', 'failed')),
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.validate_job_giver_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  giver_campaign_id uuid;
begin
  if (new.giver_npc_id is null) = (new.giver_faction_id is null) then
    raise exception 'A job must have exactly one NPC or faction giver';
  end if;

  if new.giver_npc_id is not null then
    select campaign_id into giver_campaign_id from public.npcs where id = new.giver_npc_id;
  else
    select campaign_id into giver_campaign_id from public.factions where id = new.giver_faction_id;
  end if;

  if giver_campaign_id is null or giver_campaign_id <> new.campaign_id then
    raise exception 'Job giver must belong to the same campaign';
  end if;

  return new;
end;
$$;

create trigger validate_job_giver_campaign
before insert or update of campaign_id, giver_npc_id, giver_faction_id on public.jobs
for each row execute procedure public.validate_job_giver_campaign();

create or replace function public.validate_episode_source_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_campaign_id uuid;
begin
  if new.source_job_id is null then
    return new;
  end if;

  select campaign_id into source_campaign_id from public.jobs where id = new.source_job_id;

  if source_campaign_id is null or source_campaign_id <> new.campaign_id then
    raise exception 'Episode source job must belong to the same campaign';
  end if;

  return new;
end;
$$;

create trigger validate_episode_source_campaign
before insert or update of campaign_id, source_job_id on public.episodes
for each row execute procedure public.validate_episode_source_campaign();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Crew member'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.create_campaign(campaign_name text, campaign_description text default '')
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_campaign_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  insert into public.profiles (id)
  values (auth.uid())
  on conflict (id) do nothing;

  insert into public.campaigns (created_by, name, description)
  values (auth.uid(), campaign_name, coalesce(campaign_description, ''))
  returning id into new_campaign_id;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (new_campaign_id, auth.uid(), 'gm');

  return new_campaign_id;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_campaign_member(target_campaign_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = target_campaign_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_gm(target_campaign_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = target_campaign_id and user_id = auth.uid() and role = 'gm'
  );
$$;

create or replace function public.cast_job_vote(target_campaign_id uuid, target_job_id uuid)
returns public.job_votes
language plpgsql
security definer set search_path = public
as $$
declare
  job_campaign_id uuid;
  result public.job_votes;
begin
  select campaign_id into job_campaign_id
  from public.jobs
  where id = target_job_id
    and campaign_id = target_campaign_id
    and status = 'open';

  if job_campaign_id is null or not public.is_campaign_member(target_campaign_id) then
    raise exception 'Job is not open or campaign membership is missing';
  end if;

  if exists (
    select 1 from public.campaign_members
    where campaign_id = target_campaign_id and user_id = auth.uid() and role <> 'player'
  ) then
    raise exception 'Only players can vote on jobs';
  end if;

  insert into public.job_votes (campaign_id, user_id, job_id)
  values (target_campaign_id, auth.uid(), target_job_id)
  on conflict (campaign_id, user_id) do update
  set job_id = excluded.job_id, updated_at = timezone('utc', now())
  returning * into result;

  return result;
end;
$$;

create or replace function public.clear_job_vote(target_campaign_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_member(target_campaign_id) then
    raise exception 'Campaign membership is missing';
  end if;

  delete from public.job_votes
  where campaign_id = target_campaign_id and user_id = auth.uid();
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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

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

  insert into public.campaign_members (campaign_id, user_id, role)
  values (link.campaign_id, auth.uid(), 'player')
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

create or replace function public.promote_job_to_episode(target_campaign_id uuid, target_job_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  target_job public.jobs;
  new_episode_id uuid;
begin
  select * into target_job
  from public.jobs
  where id = target_job_id
    and campaign_id = target_campaign_id
    and status = 'open'
  for update;

  if target_job.id is null or not public.is_campaign_gm(target_campaign_id) then
    raise exception 'Only an authorized GM can promote an open job in this campaign';
  end if;

  insert into public.episodes (campaign_id, source_job_id, created_by, title, summary, player_context_markdown)
  values (target_job.campaign_id, target_job.id, auth.uid(), target_job.title, target_job.summary, target_job.player_notes_markdown)
  returning id into new_episode_id;

  update public.jobs
  set status = 'promoted', updated_at = timezone('utc', now()), updated_by = auth.uid()
  where id = target_job.id;

  return new_episode_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_join_links enable row level security;
alter table public.factions enable row level security;
alter table public.characters enable row level security;
alter table public.npcs enable row level security;
alter table public.jobs enable row level security;
alter table public.episodes enable row level security;
alter table public.npc_gm_notes enable row level security;
alter table public.job_gm_notes enable row level security;
alter table public.episode_gm_notes enable row level security;
alter table public.campaign_notes enable row level security;
alter table public.job_votes enable row level security;
alter table public.ai_generation_runs enable row level security;

create policy "profiles are visible to their owner" on public.profiles for select using (id = auth.uid());
create policy "campaign members can read crew profiles" on public.profiles for select using (
  exists (
    select 1
    from public.campaign_members viewer_members
    join public.campaign_members target_members
      on target_members.campaign_id = viewer_members.campaign_id
    where viewer_members.user_id = auth.uid()
      and target_members.user_id = profiles.id
  )
);
create policy "profiles can update themselves" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members can read campaigns" on public.campaigns for select using (public.is_campaign_member(id));
create policy "GMs can update campaigns" on public.campaigns for update using (public.is_campaign_gm(id)) with check (public.is_campaign_gm(id));
create policy "GMs can delete campaigns" on public.campaigns for delete using (public.is_campaign_gm(id));

create policy "members can read membership" on public.campaign_members for select using (public.is_campaign_member(campaign_id));
create policy "GMs can update membership" on public.campaign_members for update using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));
create policy "GMs can remove membership" on public.campaign_members for delete using (public.is_campaign_gm(campaign_id));

create policy "GMs manage join links" on public.campaign_join_links for all using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));

create policy "members read factions" on public.factions for select using (public.is_campaign_member(campaign_id));
create policy "GMs manage factions" on public.factions for all using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));

create policy "members read characters" on public.characters for select using (public.is_campaign_member(campaign_id));
create policy "owners create characters" on public.characters for insert with check (owner_id = auth.uid() and public.is_campaign_member(campaign_id));
create policy "owners or GMs update characters" on public.characters for update using (owner_id = auth.uid() or public.is_campaign_gm(campaign_id)) with check (owner_id = auth.uid() or public.is_campaign_gm(campaign_id));
create policy "owners or GMs delete characters" on public.characters for delete using (owner_id = auth.uid() or public.is_campaign_gm(campaign_id));

create policy "members read NPCs" on public.npcs for select using (public.is_campaign_member(campaign_id));
create policy "GMs manage NPCs" on public.npcs for all using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));

create policy "members read visible jobs" on public.jobs for select using (public.is_campaign_member(campaign_id) and status in ('open', 'promoted', 'archived'));
create policy "GMs manage jobs" on public.jobs for all using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));

create policy "members read episodes" on public.episodes for select using (public.is_campaign_member(campaign_id));
create policy "GMs manage episodes" on public.episodes for all using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));

create policy "GMs manage NPC private notes" on public.npc_gm_notes for all using (
  public.is_campaign_gm((select campaign_id from public.npcs where id = npc_id))
) with check (
  public.is_campaign_gm((select campaign_id from public.npcs where id = npc_id))
);
create policy "GMs manage job private notes" on public.job_gm_notes for all using (
  public.is_campaign_gm((select campaign_id from public.jobs where id = job_id))
) with check (
  public.is_campaign_gm((select campaign_id from public.jobs where id = job_id))
);
create policy "GMs manage episode private notes" on public.episode_gm_notes for all using (
  public.is_campaign_gm((select campaign_id from public.episodes where id = episode_id))
) with check (
  public.is_campaign_gm((select campaign_id from public.episodes where id = episode_id))
);

create policy "members read player notes" on public.campaign_notes for select using (public.is_campaign_member(campaign_id) and (visibility = 'player' or public.is_campaign_gm(campaign_id)));
create policy "members create their player notes" on public.campaign_notes for insert with check (author_id = auth.uid() and visibility = 'player' and public.is_campaign_member(campaign_id));
create policy "authors or GMs update notes" on public.campaign_notes for update using (author_id = auth.uid() or public.is_campaign_gm(campaign_id)) with check ((author_id = auth.uid() and visibility = 'player') or public.is_campaign_gm(campaign_id));
create policy "authors or GMs delete notes" on public.campaign_notes for delete using (author_id = auth.uid() or public.is_campaign_gm(campaign_id));

create policy "members read votes" on public.job_votes for select using (public.is_campaign_member(campaign_id));

create policy "GMs read AI runs" on public.ai_generation_runs for select using (public.is_campaign_gm(campaign_id));
create policy "GMs create AI runs" on public.ai_generation_runs for insert with check (requested_by = auth.uid() and public.is_campaign_gm(campaign_id));

revoke all on function public.create_campaign(text, text) from public;
grant execute on function public.create_campaign(text, text) to authenticated;
revoke all on function public.is_campaign_member(uuid) from public;
grant execute on function public.is_campaign_member(uuid) to authenticated;
revoke all on function public.is_campaign_gm(uuid) from public;
grant execute on function public.is_campaign_gm(uuid) to authenticated;
revoke all on function public.cast_job_vote(uuid, uuid) from public;
grant execute on function public.cast_job_vote(uuid, uuid) to authenticated;
revoke all on function public.clear_job_vote(uuid) from public;
grant execute on function public.clear_job_vote(uuid) to authenticated;
revoke all on function public.redeem_campaign_join_link(text) from public;
grant execute on function public.redeem_campaign_join_link(text) to authenticated;
revoke all on function public.promote_job_to_episode(uuid, uuid) from public;
grant execute on function public.promote_job_to_episode(uuid, uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('campaign-art', 'campaign-art', false)
on conflict (id) do nothing;

create policy "members can read campaign art" on storage.objects for select using (
  bucket_id = 'campaign-art' and public.is_campaign_member((storage.foldername(name))[1]::uuid)
);
create policy "members can upload campaign art" on storage.objects for insert with check (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and public.is_campaign_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2]::uuid = auth.uid()
);
create policy "owners can update campaign art" on storage.objects for update using (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and public.is_campaign_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2]::uuid = auth.uid()
) with check (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and public.is_campaign_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2]::uuid = auth.uid()
);
create policy "owners can delete campaign art" on storage.objects for delete using (
  bucket_id = 'campaign-art'
  and array_length(storage.foldername(name), 1) = 2
  and public.is_campaign_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2]::uuid = auth.uid()
);
