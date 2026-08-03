# Documents

## Purpose

Defines the Documents module — upload, categorization, sensitivity flagging, and viewing behavior for Office files and PDFs (per the Document entity in `Data_Model.md`). Folder-level permissions and structure are fully covered in `Folder_Permissions.md` and are not repeated here; cross-cutting search across Documents, Photos, and Family Knowledge is covered in `Search.md`, not duplicated here.

## Goals

- Make categorization effortless by having the AI prompt for it at upload time, rather than requiring a manual dropdown hunt.
- Give the uploader control over sensitivity by default, while keeping the Super Admin as a backstop who can override or restrict further.
- Keep MVP scope honest — download-only viewing for now, in-app preview clearly marked as a near-term upgrade.

## User Stories

- As a family member, I want the AI to ask me what category a document belongs to when I upload it, instead of hunting through a dropdown.
- As a family member, I want to mark a document sensitive myself when I upload it, if I know it should be gated.
- As the Super Admin, I want the ability to override a document's sensitivity setting or make something private if needed, even after it's uploaded.
- As a family member, I want to open a document I have access to, even if for now that just means downloading it.

## Features

- **AI-prompted categorization at upload.** When a document is uploaded, the AI asks the uploader for its category (e.g., tax, medical, school), consistent with the same prompting pattern used for Photos.
- **Uploader sets sensitivity, Super Admin can override.** The uploader sets the `is_sensitive` flag at upload time. The Super Admin can override this flag later on **any** document, any time — either raising or lowering sensitivity — regardless of the uploader's original setting, from the Documents list's toggle or the Edit Document modal. (2026-07-31) A non-admin uploader can also change sensitivity on **their own** document after the fact, but only from the Edit Document modal (Content page, or reached via Accept on a categorization suggestion) — the list's toggle stays Super-Admin-only, so an ordinary family member has exactly one path to this, and only for what they uploaded. Enforced server-side (`PATCH /api/documents/[id]`) as "Super Admin, or the uploader" — the UI just doesn't surface the list toggle to anyone else.
- **Download-only for MVP.** Opening a document downloads it; there's no in-app preview yet. In-app preview is a clearly planned near-term upgrade (see Future Enhancements).
- **Standard folder permissions apply.** Uploading to a folder requires Edit access on that folder, same as any other content addition — nothing document-specific beyond what `Folder_Permissions.md` already defines.
- **Search lives elsewhere.** Any search/filter across documents is covered in `Search.md` — this module doesn't duplicate that behavior.
- **Pick from existing categories, or add a new one.** (2026-07-30) Editing a document's category (e.g. via Accept on an Advisor suggestion, `AI_Suggestions.md`) shows a single-select list of categories already in use, rather than a blank text box — avoids retyping/mistyping an existing one. A Super Admin can rename a category (cascades to every document using it) or delete one (blocked until nothing uses it) from their profile page ("Document Categories" section, `Users.md`). One category per document for now — see `Data_Model.md`'s Future Enhancements for multi-category.

## Screen Layout

- **Document list (per folder):** shows documents within a folder, with title, category, and sensitivity indicator.
- **Upload flow:** select file → AI prompts for category → uploader sets sensitivity (default off) → confirm.
- **Document detail:** title, category, sensitivity flag, uploaded_by, uploaded_at, folder location, download action.
- Sensitive documents are visually marked, consistent with the same pattern already used for AI_Memory (`AI_Memory.md`) and Family Knowledge.

## Data Stored

Uses the existing **Document** entity from `Data_Model.md` — no new fields required beyond what's already there (`category`, `is_sensitive`, `folder_id`, `uploaded_by`, `uploaded_at`). No changes needed.

## AI Responsibilities

- Prompts the uploader for category at upload time, per the pattern established in `Photos.md`'s upload-time metadata prompting.
- Uses `category` to power recommendations, per `Data_Model.md`'s existing note on AI recommendations.
- Respects `is_sensitive` for any outside-transmission scenario, per `AI_Permissions.md`.

## Permissions

- **Upload:** requires Edit access on the target folder (per `Folder_Permissions.md`) — same rule as any other content addition, no document-specific exception.
- **View/Download:** requires View access on the folder containing the document.
- **Sensitivity override:** Super Admin, on any document, from either entry point. The uploader, on their own document only, from the Edit Document modal only (2026-07-31).
- **Category:** anyone who can see the document (View access to its folder) — no Edit access required. (2026-07-31) Folder Edit access is about adding/removing content; categorizing something already there is lighter-weight and shouldn't be blocked by it, especially for a document someone uploaded themselves into a shared folder they don't have Edit rights on.
- **Delete:** requires the `delete_content` permission (per `Authorization.md`), same as any other content type.

## Dependencies

- Builds on `Data_Model.md` (Document entity), `Folder_Permissions.md` (upload/view rules), `AI_Permissions.md` (sensitivity handling), and `Photos.md` (shared upload-prompting pattern).
- Defers to `Search.md` for cross-document search/filtering.

## Future Enhancements

- In-app document preview, rather than download-only.
- Document versioning (already noted as a commercial-only item in `Data_Model.md`).
- Support for additional file types beyond Office/PDF (CAD, STL — already noted in `Data_Model.md`, `System_Overview.md`).

## Questions

None currently open.
