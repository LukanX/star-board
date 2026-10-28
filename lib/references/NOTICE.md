# Reference data

Source metadata is pinned to the free Foundry SF2e system, release **1.6.1**,
commit `28d9d156f252d084371d994dc359509b49eadf18`, maintained by the PF2e/SF2e
system developers in [foundryvtt/pf2e](https://github.com/foundryvtt/pf2e).

The bundled catalog contains document identifiers, names, publication metadata,
source hashes/links, and legacy AI-authored anatomy profiles and class-role
hints. They have not been independently human-reviewed.
These profiles are not quotations, official rules text, or a
claim of Paizo/Foundry endorsement. Naming lists, source lore/prose, images,
maps, rule elements, and premium modules are excluded.

Per-record publication/license labels describe the source and do not imply that
every field in a source document is reusable. Review the upstream
[ORC notice](https://github.com/foundryvtt/pf2e/blob/sf2e-1.6.1/static/licenses/ORCLicense.md),
[OGL notice](https://github.com/foundryvtt/pf2e/blob/sf2e-1.6.1/static/licenses/OpenGameLicense.md),
and [licensing overview](https://github.com/foundryvtt/pf2e/blob/sf2e-1.6.1/README.md)
before expanding the allowlist. This project is unofficial.

The original artifact contains 60 ancestries and eight classes. Its five
AI-written anatomy profiles are retired from active ancestry search and
generation; they remain only for artifact/history compatibility. They are not
copied into editable records, used as defaults, or substituted for empty fields.
Six AI-authored class-role summaries remain active and are labeled accordingly.
No ancestry has naming-list coverage.

The separate creature-trait artifact contains 292 configured creature-trait
identities, slugs, English labels and pinned source links. Extraction resolves
literal maps/spreads statically without executing upstream TypeScript. It does
not import rule descriptions, arbitrary weapon/action trait namespaces, or
creature mechanics. Shared display labels do not merge distinct trait slugs.

Supabase stores the installation-wide System library separately from this
imported metadata. Appearance, lore and trait guidance start empty and are
explicitly user-entered, not official or necessarily human-authored. Editors
must have permission to use their submitted material. Source notes are
attribution supplied by editors, not proof of reuse permission, and do not
enter generation prompts. Campaign context switches initially default off.
Generations retain exact revision/hash provenance without copying submitted
prose into usage logs.

Normal builds use the checked-in artifact without network access. Explicitly
refresh it using `npm run references:refresh -- --source C:\path\to\pinned-checkout`
or `npm run references:refresh -- --download`. Refresh verifies the pinned source,
but is not approval to expand the content categories.
Refresh creature-trait metadata using `npm run references:traits-refresh` with
the same explicit source/download options. Seed reviewed metadata changes
through a new forward migration; do not overwrite authored library revisions.

The separate `wiki-coverage.generated.json` report is metadata discovery only.
It contains candidate/canonical article URLs, revision identifiers, section
hashes, and counts, not wiki paragraphs or excerpts. Its identities remain
unreviewed and its excerpt-reuse permissions unresolved. A successful article
lookup, citation, or AI-input crawler signal does not establish permission to
republish contributor text or send it to a provider.

See the wiki's [copyright policy](https://starfinderwiki.com/wiki/StarfinderWiki:Copyrights)
and Paizo's [current Community Use Policy](https://paizo.com/licenses/communityuse).
Do not assume the older policy reproduced on the wiki establishes the rights
needed for this application. No StarfinderWiki appearance prose is currently
bundled into runtime generation. Wiki-content integration remains stopped;
the metadata-only audit is separate from the user-entered System library.
