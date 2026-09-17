do $$
declare
  function_definition text;
begin
  for function_definition in
    select replace(
      pg_get_functiondef(routine.oid),
      'using errcode = ''40001''',
      'using errcode = ''P0001'''
    )
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
        'update_campaign_visual_style',
        'update_and_apply_campaign_visual_style',
        'attach_campaign_visual_style_preview'
      )
      and pg_get_functiondef(routine.oid) like '%using errcode = ''40001''%'
  loop
    execute function_definition;
  end loop;
end;
$$;
