# Photos

## Purpose

Defines the Photos module — upload, tagging, visibility, and sensitivity handling for the Photo entity (`Data_Model.md`). Covers how photos differ from Documents (no folder requirement, public-by-default visibility) while staying consistent with established patterns elsewhere in the app.

**Corrected 2026-08-03:** this document previously described AI-prompted tagging ("Who is in this picture?" / "Where was it taken?" / "What event is this from?") as a built MVP feature. It was never actually wired up — the AI layer (`lib/core/ai`, Phase 3) exists and has since gained substantial capability (hybrid local/frontier routing, `Assistant.md`), but nothing connects it to the upload flow. The upload form uses plain manual text fields (who/event/tags as a comma-separated field) with no AI involvement. See Future Enhancements below — AI-prompted tagging is still a genuine planned feature, just not built yet.

## Goals

- Make tagging effortless — currently via a manual comma-separated field at upload; AI prompting is a planned enhancement (see Future Enhancements) that would remove the manual busywork.
- Default to sharing (public/visible to the family) since photos are usually meant to be enjoyed together, while still allowing privacy when wanted.
- Apply the same sensitivity protection already established for Documents and Family Knowledge, for the cases where it's relevant.

## User Stories

- As a family member, I want the AI to ask who's in a photo and where it was taken when I upload it, instead of tagging everything manually. *(Not yet built — see Future Enhancements; today this is a manual comma-separated field.)*
- As a family member, I want my photos visible to the family by default, since that's usually the point of taking them.
- As a family member, I want the option to keep a specific photo private if I choose.
- As a family member, I want to later search things like "show me all church outreach pictures" or "find every photo with Malachi," based on the tags applied at upload.

## Features

- **Manual tagging at upload (MVP as built).** The uploader enters who/event/tags as a comma-separated free-text field. **AI-prompted tagging is not yet built** — see Future Enhancements for the originally-planned version where the AI prompts *"Who is in this picture?" / "Where was it taken?" / "What event is this from?"* and populates tags, location, and event linkage itself.
- **Public by default, private by choice.** A photo is visible to the whole family by default, same pattern as Calendar and Tasks — the uploader can mark a specific photo private if they don't want it shown to others.
- **No folder requirement for internal family visibility.** Unlike Documents, Photos don't require folder placement for the family's own use — visibility among family members is governed directly by the public/private setting on the photo itself, not by a folder permission structure. *(2026-08 addition: every photo is still auto-filed, invisibly to the uploader, into one internal default "Family Photos" folder — this exists solely so a Super Admin can grant an External Viewer access via the existing Folder Permissions system, per `Authorization.md`'s External Viewer role. It has no effect on internal visibility rules, which remain exactly as described above.)*
- **Sensitivity flag.** Photos support the same `is_sensitive` flag used by Documents and Family Knowledge Items, for cases where it's relevant (e.g., a medical-related photo) — subject to the same outside-transmission gate rules in `AI_Permissions.md`.
- **Hashtag-style tags power later search.** Tags applied at upload (people, event, other descriptors) are what later enable queries like "show me all church outreach pictures" or "find every photo with Malachi" — actual search behavior lives in `Search.md`, not duplicated here.

## Screen Layout

- **Photo grid/gallery:** shows photos the viewer has access to (public photos from all family members, plus their own private ones), with tag/thumbnail info visible at a glance.
- **Upload flow:** select photo(s) → uploader enters who/event/tags manually (comma-separated field; AI prompting not yet built, see Future Enhancements) → uploader sets visibility (public by default) and sensitivity (off by default) → confirm.
- **Photo detail:** image, tags, location, linked event (if any), uploaded_by, uploaded_at, visibility, sensitivity indicator.
- Sensitive photos are visually marked, consistent with the same pattern used elsewhere (`Documents.md`, `AI_Memory.md`).

## Data Stored

Extends the existing **Photo** entity (`Data_Model.md`) with:

| Field | Notes |
|---|---|
| visibility | public (default) / private — same model as Event/Task visibility (see Calendar.md, Tasks.md) |
| is_sensitive | boolean — same flag/behavior as Document and Family_Knowledge_Item (see AI_Permissions.md) |
| event_link | optional link to a related Event, populated from the AI's "what event is this from?" prompt |

## AI Responsibilities

- **Not yet built:** prompting the uploader for tagging metadata at upload time (who/where/what event), per the pattern this module was meant to share with `Documents.md`. Tagging today is manual, unrelated to the AI layer.
- Respects the `is_sensitive` flag identically to Documents and Family Knowledge for any outside-transmission scenario (per `AI_Permissions.md`).
- Powers later search/filtering based on applied tags — actual search mechanics live in `Search.md`.

## Permissions

- **View:** all family members can view public photos by default; private photos are visible only to the uploader and admins. An External Viewer (`Authorization.md`) sees only public, non-sensitive photos in a folder a Super Admin has explicitly granted them — sensitive photos are always excluded for this role regardless of folder grant, a conservative default for content leaving the home network. See `lib/photos/visibility.ts`.
- **Upload:** any family member.
- **Sensitivity override:** Super Admin only, consistent with `Documents.md`'s pattern.
- **Delete:** requires the `delete_content` permission (per `Authorization.md`), same as any other content type.

## Dependencies

- Builds on `Data_Model.md` (Photo entity, with the additions above), `AI_Permissions.md` (sensitivity handling), `Calendar.md`/`Tasks.md` (shared visibility pattern), and `Documents.md` (shared upload-prompting pattern).
- Defers to `Search.md` for cross-photo search/filtering, and to `Memory.md` for how photos combine into Memories.

## Future Enhancements

- **AI-prompted tagging at upload** — the originally-planned feature described above (Purpose/Features): the AI asks *"Who is in this picture?" / "Where was it taken?" / "What event is this from?"* and populates tags, location, and event linkage itself, instead of the current manual comma-separated field. Not yet built despite the AI layer existing since Phase 3.
- Future (commercial) duplicate detection and auto-renaming for near-identical photos, already noted in `File_Connector_Architecture.md`.

## Questions

None currently open.
