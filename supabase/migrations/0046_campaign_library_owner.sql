create function public.keep_campaign_creator_immutable()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'Campaign creator cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.keep_campaign_creator_immutable() from public, anon, authenticated;

create trigger campaigns_keep_creator_immutable
before update of created_by on public.campaigns
for each row execute function public.keep_campaign_creator_immutable();
