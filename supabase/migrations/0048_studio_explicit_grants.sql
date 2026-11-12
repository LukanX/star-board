revoke all on public.campaign_art_assets, public.campaign_art_publications,
  public.campaign_art_assignments, public.campaign_art_cleanup from anon, authenticated;
grant select on public.campaign_art_assets, public.campaign_art_publications,
  public.campaign_art_assignments to authenticated;
grant select, delete on public.campaign_art_cleanup to authenticated;
