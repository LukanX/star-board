drop policy if exists "GMs and character owners read AI runs" on public.ai_generation_runs;

create policy "GMs and character owners read AI runs"
  on public.ai_generation_runs
  for select using (
    public.is_campaign_gm(campaign_id)
    or (
      kind = 'image'
      and purpose = 'entity-art'
      and target_kind = 'character'
      and target_character_id is not null
      and exists (
        select 1
        from public.characters
        where characters.campaign_id = ai_generation_runs.campaign_id
          and characters.id = ai_generation_runs.target_character_id
          and characters.owner_id = auth.uid()
      )
    )
  );
