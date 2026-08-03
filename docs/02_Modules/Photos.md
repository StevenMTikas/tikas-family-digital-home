# Photos

## Purpose

Defines the Photos module — upload, AI-prompted tagging, visibility, and sensitivity handling for the Photo entity (`Data_Model.md`). Covers how photos differ from Documents (no folder requirement, public-by-default visibility) while staying consistent with established patterns elsewhere in the app.

## Goals

- Make tagging effortless through AI prompting at upload time, so photos are searchable later without manual busywork.
- Default to sharing (public/visible to the family) since photos are usually meant to be enjoyed together, while still allowing privacy when wanted.
- Apply the same sensitivity protection already established for Documents and Family Knowledge, for the cases where it's relevant.

## User Stories

- As a family member, I want the AI to ask who's in a photo and where it was taken when I upload it, instead of tagging everything manually.
- As a family member, I want my photos visible to the family by default, since that's usually the point of taking them.
- As a family member, I want the option to keep a specific photo private if I choose.
- As a family member, I want to later search things like "show me all church outreach pictures" or "find every photo with Malachi," based on the tags applied at upload.

## Features

- **AI-prompted tagging at upload.** When a photo is uploaded, the AI prompts the uploader — *"Who is in this picture?" / "Where was it taken?" / "What event is this from?"* — populating tags, location, and event linkage (per `Data_Model.md`'s existing description of this behavior).
- **Public by default, private by choice.** A photo is visible to the whole family by default, same pattern as Calendar and Tasks — the uploader can mark a specific photo private if they don't want it shown to others.
- **No folder requirement for internal family visibility.** Unlike Documents, Photos don't require folder placement for the family's own use — visibility among family members is governed directly by the public/private setting on the photo itself, not by a folder permission structure. *(2026-08 addition: every photo is still auto-filed, invisibly to the uploader, into one internal default "Family Photos" folder — this exists solely so a Super Admin can grant an External Viewer access via the existing Folder Permissions system, per `Authorization.md`'s External Viewer role. It has no effect on internal visibility rules, which remain exactly as described above.)*
- **Sensitivity flag.** Photos support the same `is_sensitive` flag used by Documents and Family Knowledge Items, for cases where it's relevant (e.g., a medical-related photo) — subject to the same outside-transmission gate rules in `AI_Permissions.md`.
- **Hashtag-style tags power later search.** Tags applied at upload (people, event, other descriptors) are what later enable queries like "show me all church outreach pictures" or "find every photo with Malachi" — actual search behavior lives in `Search.md`, not duplicated here.

## Screen Layout

- **Photo grid/gallery:** shows photos the viewer has access to (public photos from all family members, plus their own private ones), with tag/thumbnail info visible at a glance.
- **Upload flow:** select photo(s) → AI prompts for who/where/event → uploader sets visibility (public by default) and sensitivity (off by default) → confirm.
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

- Prompts the uploader for tagging metadata at upload time (who/where/what event), per the pattern this module shares with `Documents.md`.
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

- Future (commercial) duplicate detection and auto-renaming for near-identical photos, already noted in `File_Connector_Architecture.md`.

## Questions

None currently open.
