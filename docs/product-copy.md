# Product Copy Glossary

Star Board uses plain English with a small amount of tabletop flavor. Product copy should tell people what a control, page, status, or permission means without requiring them to decode a fictional operations vocabulary.

## Preferred Terms

| Prefer | Instead of | Use for |
| --- | --- | --- |
| Campaign manager | Campaign operations / command center | Product and page metadata |
| Campaigns | Campaign manifest | Campaign selection |
| Campaign members | Crew access | Membership and permissions |
| Job board | Mission control | Jobs and mission management |
| Job draft | Signal / transmission | Job status and draft counts |
| Visual style | Visual language | Art settings and style fields |
| Campaign artwork | Visual signal | Image generation |
| Account settings | Profile sync | Account footer/status |
| Campaign data connected | Supabase sync active | Connection/status text |
| Access levels | Clearance | Permission explanations |

## Copy Boundaries

These are product-owned phrases and may be revised:

- Headings, labels, buttons, placeholders, helper text, loading states, error states, empty states, tooltips, accessible names, and status messages.
- Display labels derived from application state, such as `DRAFT JOB`.
- Metadata descriptions and invitation/account language.

These are intentionally not part of the copy cleanup:

- Campaign names, descriptions, jobs, episodes, notes, NPCs, factions, characters, and other user-authored or generated campaign content.
- Test fixtures that represent campaign content.
- AI prompt instructions and text sent to providers.
- Database fields, API contracts, route segments, status enum values, CSS class names, and runtime identifiers such as `AbortSignal` or `authSignal`.

When a product phrase is repeated, keep the replacement literal and consistent. Do not add a runtime translation or copy registry for this cleanup.
