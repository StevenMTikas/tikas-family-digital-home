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
- **Uploader sets sensitivity, Super Admin can override.** The uploader sets the `is_sensitive` flag at upload time. The Super Admin can override this flag later — either raising or lowering sensitivity — or make a document private, regardless of the uploader's original setting.
- **Download-only for MVP.** Opening a document downloads it; there's no in-app preview yet. In-app preview is a clearly planned near-term upgrade (see Future Enhancements).
- **Standard folder permissions apply.** Uploading to a folder requires Edit access on that folder, same as any other content addition — nothing document-specific beyond what `Folder_Permissions.md` already defines.
- **Search lives elsewhere.** Any search/filter across documents is covered in `Search.md` — this module doesn't duplicate that behavior.

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
- **Sensitivity override:** Super Admin only.
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
