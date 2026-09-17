alter table public.characters
  add constraint characters_campaign_id_id_key unique (campaign_id, id);

alter table public.ai_generation_runs
  add column target_character_id uuid,
  add constraint ai_generation_runs_target_character_fk
    foreign key (campaign_id, target_character_id)
    references public.characters (campaign_id, id)
    on delete set null (target_character_id),
  add constraint ai_generation_runs_target_character_check
    check (
      target_character_id is null
      or (
        purpose = 'entity-art'
        and (
          (kind = 'character' and target_kind is null)
          or (kind = 'image' and target_kind = 'character')
        )
      )
    );

create index ai_generation_runs_character_target_idx
  on public.ai_generation_runs (campaign_id, target_character_id, created_at desc)
  where target_character_id is not null;

drop policy if exists "GMs read AI runs" on public.ai_generation_runs;

create policy "GMs and character owners read AI runs" on public.ai_generation_runs
  for select using (
    public.is_campaign_gm(campaign_id)
    or (
      kind = 'image'
      and purpose = 'entity-art'
      and target_kind = 'character'
      and target_character_id is not null
      and requested_by = auth.uid()
      and exists (
        select 1
        from public.characters
        where characters.campaign_id = ai_generation_runs.campaign_id
          and characters.id = ai_generation_runs.target_character_id
          and characters.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "GMs and opted-in players create AI runs" on public.ai_generation_runs;

create policy "GMs and eligible character owners create AI runs" on public.ai_generation_runs
  for insert with check (
    requested_by = auth.uid()
    and (
      public.is_campaign_gm(campaign_id)
      or (
        public.campaign_allows_player_ai(campaign_id)
        and exists (
          select 1
          from public.campaign_members
          where campaign_members.campaign_id = ai_generation_runs.campaign_id
            and campaign_members.user_id = auth.uid()
            and campaign_members.role = 'player'
        )
        and target_character_id is not null
        and image_path is null
        and image_media_type is null
        and (
          (kind = 'character' and target_kind is null)
          or (kind = 'image' and target_kind = 'character' and purpose = 'entity-art')
        )
        and exists (
          select 1
          from public.characters
          where characters.campaign_id = ai_generation_runs.campaign_id
            and characters.id = ai_generation_runs.target_character_id
            and characters.owner_id = auth.uid()
        )
      )
    )
  );