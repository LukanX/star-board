alter table public.characters
  alter column owner_id drop not null,
  add column is_active boolean not null default true;

update public.characters
set owner_id = null
where not exists (
  select 1
  from public.campaign_members
  where campaign_members.campaign_id = characters.campaign_id
    and campaign_members.user_id = characters.owner_id
);

alter table public.characters
  drop constraint if exists characters_owner_id_fkey,
  add constraint characters_campaign_owner_fkey
    foreign key (campaign_id, owner_id)
    references public.campaign_members (campaign_id, user_id)
    on delete set null (owner_id);

create index if not exists characters_campaign_owner_idx
  on public.characters (campaign_id, owner_id);

create or replace function public.reassign_character_owner(
  target_campaign_id uuid,
  target_character_id uuid,
  new_owner_id uuid
)
returns public.characters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.campaign_role;
  member_record record;
  character_record public.characters;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  for member_record in
    select user_id, role
    from public.campaign_members
    where campaign_id = target_campaign_id
      and user_id in (actor_id, new_owner_id)
    order by user_id
    for update
  loop
    if member_record.user_id = actor_id then
      actor_role := member_record.role;
    end if;
  end loop;

  if actor_role is null then
    raise exception 'Campaign membership is required';
  end if;

  if new_owner_id is not null and not exists (
    select 1
    from public.campaign_members
    where campaign_id = target_campaign_id
      and user_id = new_owner_id
  ) then
    raise exception 'Character owner must be a campaign member';
  end if;

  select *
  into character_record
  from public.characters
  where id = target_character_id
    and campaign_id = target_campaign_id
  for update;

  if character_record.id is null then
    raise exception 'Character was not found';
  end if;

  if character_record.owner_id is distinct from actor_id and actor_role <> 'gm' then
    raise exception 'Only the character owner or a campaign GM can reassign ownership';
  end if;

  update public.characters
  set owner_id = new_owner_id,
      updated_at = timezone('utc', now()),
      updated_by = actor_id
  where id = target_character_id
    and campaign_id = target_campaign_id
  returning * into character_record;

  return character_record;
end;
$$;

revoke all on function public.reassign_character_owner(uuid, uuid, uuid) from public;
grant execute on function public.reassign_character_owner(uuid, uuid, uuid) to authenticated;

revoke update on table public.characters from authenticated;
grant update (
  name,
  species,
  class_name,
  level,
  backstory_markdown,
  physical_description,
  art_subject,
  art_path,
  art_prompt,
  art_provider,
  is_active,
  updated_by
) on table public.characters to authenticated;

drop policy if exists "owners create characters" on public.characters;
create policy "members create characters" on public.characters
  for insert with check (
    public.is_campaign_member(campaign_id)
    and (
      owner_id = (select auth.uid())
      or (
        public.is_campaign_gm(campaign_id)
        and (
          owner_id is null
          or exists (
            select 1
            from public.campaign_members
            where campaign_members.campaign_id = characters.campaign_id
              and campaign_members.user_id = characters.owner_id
          )
        )
      )
    )
  );

drop policy if exists "owners or GMs update characters" on public.characters;
create policy "owners or GMs update characters" on public.characters
  for update using (
    public.is_campaign_member(campaign_id)
    and (owner_id = (select auth.uid()) or public.is_campaign_gm(campaign_id))
  ) with check (
    public.is_campaign_member(campaign_id)
    and (owner_id = (select auth.uid()) or public.is_campaign_gm(campaign_id))
  );

drop policy if exists "owners or GMs delete characters" on public.characters;
create policy "owners or GMs delete characters" on public.characters
  for delete using (
    public.is_campaign_member(campaign_id)
    and (owner_id = (select auth.uid()) or public.is_campaign_gm(campaign_id))
  );
