alter table public.campaign_notes
  add column revision integer not null default 1 check (revision > 0);

create or replace function public.guard_campaign_note_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.campaign_id is distinct from old.campaign_id
    or new.author_id is distinct from old.author_id then
    raise exception 'Campaign note identity cannot be changed';
  end if;

  if new.visibility is distinct from old.visibility
    and not public.is_campaign_gm(old.campaign_id) then
    raise exception 'Only a campaign GM can change note visibility';
  end if;

  if new.episode_id is distinct from old.episode_id
    and old.author_id is distinct from auth.uid()
    and not public.is_campaign_gm(old.campaign_id) then
    raise exception 'Only the note author or a campaign GM can change its episode';
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger guard_campaign_note_update
before update on public.campaign_notes
for each row execute procedure public.guard_campaign_note_update();

drop policy if exists "authors or GMs update notes" on public.campaign_notes;

create policy "members update player notes and GMs update private notes"
  on public.campaign_notes
  for update
  using (
    public.is_campaign_member(campaign_id)
    and (visibility = 'player' or public.is_campaign_gm(campaign_id))
  )
  with check (
    public.is_campaign_member(campaign_id)
    and (visibility = 'player' or public.is_campaign_gm(campaign_id))
  );

revoke update on public.campaign_notes from authenticated;
grant update (title, body_markdown, episode_id, visibility)
  on public.campaign_notes to authenticated;