# Memory

## Purpose

Defines the Memory module — richer, story-like records that can include photos, other file types (documents), text-only entries, or any combination, built on the existing Memory entity (`Data_Model.md`). Resolves the open question from `Data_Model.md`: a Memory does not require a photo — it can be text-only, or attach any mix of photos and documents.

## Goals

- Let a Memory be genuinely flexible — a moment worth capturing doesn't always come with a photo attached.
- Keep Memory consistent with the visibility/sensitivity patterns already established across Documents, Photos, Calendar, and Tasks, rather than inventing new rules.
- Keep the relationship between a Memory and its attachments (photos, documents) clean and extensible, rather than hardcoding "photos only."

## User Stories

- As a family member, I want to write a memory down even if I don't have a photo to go with it.
- As a family member, I want to attach one or more photos to a memory, the way I already can.
- As a family member, I want to attach a document to a memory too — for example, a program from a recital alongside the photos from that night.
- As a family member, I want my memories visible to the family by default, with the option to keep one private.

## Features

- **Flexible content.** A Memory can be text-only (title + caption/notes), photo-only, document-only, or any combination — there's no requirement to attach anything.
- **Multiple attachment types.** A Memory can link to any number of **Photos** (via the existing `Memory_Photo` join) and any number of **Documents** (via a new `Memory_Document` join, same pattern) — a memory isn't limited to photos alone.
- **Public by default, private by choice.** Same visibility model as Calendar, Tasks, and Photos — visible to the family by default, with the option to mark a specific memory private.
- **Sensitivity flag.** Same `is_sensitive` flag used elsewhere (Documents, Photos, Family Knowledge), for the cases where it's relevant.
- **Optional event linkage.** A Memory can optionally link to a related Event, same as it already could — useful for tying a memory to something that was on the calendar.

## Screen Layout

- **Memory feed:** a scrollable, story-like view of memories the viewer has access to (public memories from all family members, plus their own private ones) — closer to a journal/timeline than a folder browser.
- **Create/Edit Memory:** title, caption/notes (free text), optional photo attachment(s), optional document attachment(s), optional event link, visibility toggle, sensitivity flag.
- **Memory detail:** displays whatever combination of text, photos, and documents were attached — a text-only memory simply shows its title and notes without empty photo/document sections.

## Data Stored

Extends the existing **Memory** entity (`Data_Model.md`) with:

| Field | Notes |
|---|---|
| visibility | public (default) / private — same model as Event/Task/Photo visibility |
| is_sensitive | boolean — same flag/behavior as Document, Photo, and Family_Knowledge_Item |

**New: Memory_Document** — join table, same pattern as the existing `Memory_Photo`:

| Field | Notes |
|---|---|
| memory_id | |
| document_id | |

No change needed to `Memory_Photo` — it already supports a Memory having zero, one, or multiple Photos, which combined with the new `Memory_Document` join and no required-attachment rule fully supports text-only, photo-only, document-only, or mixed memories.

## AI Responsibilities

- Advisor may suggest turning a cluster of recent photos into a Memory, per its existing starter list in `Advisor.md` — no new suggestion type introduced here, just confirming Memory is the destination for that suggestion.
- Respects the `is_sensitive` flag identically to other content types for any outside-transmission scenario (per `AI_Permissions.md`).

## Permissions

- **View:** all family members can view public memories by default; private memories are visible only to their creator and admins.
- **Create:** any family member.
- **Sensitivity override:** Super Admin only, consistent with `Documents.md` and `Photos.md`.
- **Delete:** requires the `delete_content` permission (per `Authorization.md`), same as any other content type.
- Attaching a Photo or Document to a Memory requires the attaching user already have View access to that Photo/Document — attaching doesn't grant new access, it links content the user could already see.

## Dependencies

- Builds on `Data_Model.md` (Memory, Memory_Photo entities, with the additions above), `Photos.md` and `Documents.md` (attachment sources), `AI_Permissions.md` (sensitivity handling), and `Calendar.md`/`Tasks.md` (shared visibility pattern).

## Future Enhancements

- None currently identified beyond what's already noted elsewhere (e.g., possible Memory ↔ Family Knowledge linking, noted in `Future_Ideas.md`).

## Questions

None currently open.
