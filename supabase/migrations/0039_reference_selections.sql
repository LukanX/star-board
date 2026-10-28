alter table public.characters
  add column ancestry_reference_id text,
  add column ancestry_catalog_version text,
  add column class_reference_id text,
  add column class_catalog_version text,
  add constraint characters_ancestry_reference_pair check (
    (ancestry_reference_id is null and ancestry_catalog_version is null)
    or (
      ancestry_reference_id is not null and ancestry_catalog_version is not null
      and ancestry_reference_id ~ '^sf2e[.]ancestries[.]Item[.][A-Za-z0-9]{16}$'
      and length(ancestry_catalog_version) between 1 and 100
      and ancestry_catalog_version ~ '^[A-Za-z0-9.-]+$'
    )
  ),
  add constraint characters_class_reference_pair check (
    (class_reference_id is null and class_catalog_version is null)
    or (
      class_reference_id is not null and class_catalog_version is not null
      and class_reference_id ~ '^sf2e[.]classes[.]Item[.][A-Za-z0-9]{16}$'
      and length(class_catalog_version) between 1 and 100
      and class_catalog_version ~ '^[A-Za-z0-9.-]+$'
    )
  );

alter table public.npcs
  add column ancestry_reference_id text,
  add column ancestry_catalog_version text,
  add constraint npcs_ancestry_reference_pair check (
    (ancestry_reference_id is null and ancestry_catalog_version is null)
    or (
      ancestry_reference_id is not null and ancestry_catalog_version is not null
      and ancestry_reference_id ~ '^sf2e[.]ancestries[.]Item[.][A-Za-z0-9]{16}$'
      and length(ancestry_catalog_version) between 1 and 100
      and ancestry_catalog_version ~ '^[A-Za-z0-9.-]+$'
    )
  );

grant update (
  ancestry_reference_id, ancestry_catalog_version,
  class_reference_id, class_catalog_version
) on public.characters to authenticated;

alter table public.ai_generation_runs
  add column reference_sources jsonb,
  add constraint ai_generation_runs_reference_sources_shape check (
    reference_sources is null or case when jsonb_typeof(reference_sources) = 'array'
      then jsonb_array_length(reference_sources) <= 2 and octet_length(reference_sources::text) <= 4096
      else false end
  );
