# Data Model

## Purpose

Defines the major entities in Tikas Family Digital Home, their key fields, and how they relate to each other. This is a conceptual/logical model — a shared vocabulary for module docs and implementation — not a literal database migration file. Field lists are MVP-scoped; commercial-only additions (like document versioning) are called out explicitly rather than built in now.

## Goals

- Give every module doc a consistent set of entities to reference instead of each inventing its own.
- Make relationships between entities explicit (who owns what, what links to what) before implementation starts.
- Flag MVP vs. future-scope decisions directly on the entities they affect, so `Application_Architecture.md` and actual schema work don't have to guess.

## Entities

### User
Represents a family member.

| Field | Notes |
|---|---|
| id | |
| username | |
| password_hash | |
| full_name | |
| relationship | e.g., Dad, Mom, Son |
| date_of_birth | |
| photo | profile photo |
| contact_info | phone/email |
| hobbies_interests | list — feeds AI personalization/suggestions |
| calendar_color | assigned per user for shared calendar display; auto-assigned from a palette for each new family member (see Calendar.md) |
| ai_enabled | boolean, true by default — per-user AI on/off toggle (see AI.md) |
| role | Super Admin / Admin (scoped) / Basic User |
| admin_scope | list of child user_ids this Admin is scoped to (e.g., Vee's admin_scope = [Malachi]); designed to support multiple children per family, not just one (see Authorization.md) |
| approve_outside_calls | boolean permission, off by default, off by default for a child (see Security_Architecture.md) |
| manage_devices | boolean permission, off by default (see Authorization.md) |
| manage_parental_controls | boolean permission, off by default, only meaningful for a scoped Admin (see Authorization.md) |
| view_child_activity_logs | boolean permission, off by default, only meaningful for a scoped Admin (see Authorization.md) |
| delete_content | boolean permission, off by default (see Authorization.md) |
| manage_folder_permissions | boolean permission, off by default (see Authorization.md) |
| approve_sensitive_outside_transmission | boolean permission, off by default for adults; cannot be granted to any user flagged as a minor, enforced at the system level (see AI_Permissions.md) |

### Device
Represents a trusted computer or phone running a connector.

| Field | Notes |
|---|---|
| id | |
| user_id | the family member this device belongs to — used to tailor AI responses to that person |
| device_type | computer / phone |
| device_name | |
| status | trusted / revoked |
| added_by | admin who added it |
| auth_token | connector's credential, generated and shown once when an admin enables sync for this device; NULL for a device trusted only for login (see File_Connector_Architecture.md, Security_Architecture.md) |
| designated_folders | list of folder-type strings (`camera_photos`, `documents`) the connector scans on this device — decided per-device, not uniform across all devices, so e.g. Vee's phone can sync Camera Roll + Downloads while Malachi's computer only syncs a school-documents folder (see File_Connector_Architecture.md's Questions) |
| added_at | |
| last_sync_at | connectors sync once/day for MVP; see System_Overview.md |
| is_host_device | true for exactly one row — the host machine itself, scanned in-process rather than by a real connector (see File_Connector_Architecture.md's "Host Self-Scan") |

### Device_Watched_Path
The actual filesystem paths a device's connector (or the host's own self-scan) watches — set from the Admin dashboard, per File_Connector_Architecture.md's "Host- and Dashboard-Managed Folders" section. Distinct from `Device.designated_folders`, which only records which folder *types* are enabled, not real paths.

| Field | Notes |
|---|---|
| id | |
| device_id | |
| folder_type | camera_photos / documents |
| path | a real path on that device's filesystem, entered as free text — no remote folder browser (see File_Connector_Architecture.md) |
| added_at | |
| last_scan_status | ok / not_found / unset — the host can't see a remote filesystem itself; this is fed back by the connector's sync payload (or the host self-scan directly) after actually trying the path |
| last_scan_at | |

### Connector_Exclusion
The "Don't sync again" record for a connector-synced item (Phase 8, `File_Connector_Architecture.md`'s "Don't Sync This Again" section). A connector always reports its full current view of a designated folder with no memory of host-side deletes, so deleting a synced Document/Photo would otherwise reappear on the next sync — this table makes that deletion stick.

| Field | Notes |
|---|---|
| device_id | composite primary key with source_path |
| source_path | the exact path as last reported by that device's connector |
| excluded_at | |

### Event (Calendar)

| Field | Notes |
|---|---|
| id | |
| title | |
| description | |
| date_time | |
| created_by | |
| visibility | public (default) / private — private events are only visible to the creator and admins (see Calendar.md) |
| category | optional, one of a fixed set: Budget / Home Repair / Chores / Medical / School / Social/Family (see Calendar.md) |
| reminder_lead_time | AI/system reminds as the date approaches; delivered as a real-time Notification (see Calendar.md) |
| reminder_sent_at | set once the scheduler has fired this event's reminder, so it never fires twice (Phase 6) |
| recurrence_id | shared by every occurrence of one recurring series; NULL for a one-off event. Each occurrence is its own independent row — there's no separate "recurrence rule" entity (see Calendar.md, `lib/core/recurrence.ts`) |
| recurrence_frequency | daily / weekly / biweekly / monthly / yearly, or NULL if not recurring — same value copied onto every occurrence in a series |
| recurrence_until | internal bookkeeping only — if set on any row in a series, caps how far the scheduler's rolling-window generator extends it (stamped when a "this and future" delete truncates the series) |

### Event_Assignment
Join table — an event can be assigned to multiple family members.

| Field | Notes |
|---|---|
| event_id | |
| user_id | |

### Task

| Field | Notes |
|---|---|
| id | |
| title | |
| description | optional detail text — used by Tasks.md's Task detail and Add/Edit Task screens; missing from this entity in an earlier pass, added to match |
| owner_id | single owner for MVP |
| due_date | |
| status | not done / done |
| created_by | |
| assigned_by | user who assigned the task; equals owner_id for self-assigned tasks. Only an Admin/Super Admin can set this to someone other than the owner (see Tasks.md) |
| visibility | public (default) / private — same model as Event visibility (see Calendar.md) |
| reminder_sent_at | set once the scheduler has fired this task's due-date reminder (Phase 6) |
| recurrence_id | shared by every occurrence of one recurring series; NULL for a one-off task. Each occurrence is its own independent row, starting fresh at status 'not_done' (see Tasks.md, `lib/core/recurrence.ts`) |
| recurrence_frequency | daily / weekly / biweekly / monthly / yearly, or NULL if not recurring |
| recurrence_until | internal bookkeeping only — see the matching Event field above |

*Sub-tasks are not in MVP scope — flat task list only. See Future Enhancements.*

### Subject

The manageable list backing a homework Task's subject (2026-08-03, see `Homeschool.md`). Follows the same pattern as Document Category below — a Super Admin can rename (cascades to every `Homework_Detail` referencing it) or delete (blocked while any `Homework_Detail` still uses it) from their profile page's "Subjects" section. Unlike Document Category, there's no auto-create-on-write path from a free-text field — Subject is only ever set through the managed picker on the Add/Edit Task form, which offers a "+ New subject" option backed by this same table.

| Field | Notes |
|---|---|
| id | |
| name | e.g. Math, Reading, Science, History — free text, unique, Super-Admin-managed |

### Homework_Detail

One row per homework Task — a companion to Task (see `Homeschool.md`), not new columns on Task itself, since these fields are meaningless for the other ~95% of Tasks (chores, errands). This row's existence is what marks a Task as homework; there's no separate boolean flag.

| Field | Notes |
|---|---|
| task_id | FK to Task, unique — one Homework_Detail per Task |
| subject_id | FK to Subject |
| curriculum_reference | optional free text, e.g. "Saxon Math Lesson 42," "Reading Log Week 3" |
| grade_or_score | optional free text, e.g. "B+", "18/20", "Complete" — deliberately loose typing, homeschool grading isn't standardized |
| parent_notes | optional free text |
| signed_off_by | FK to User; who reviewed it — a real second checkpoint beyond the owner marking the Task `done`, since "I did it" and "a parent reviewed it" are different events in a homeschool context |
| signed_off_at | |

*`grade_or_score`, `parent_notes`, and `signed_off_by`/`signed_off_at` are writable by an Admin/Super Admin only, regardless of who assigned the underlying Task — see `Homeschool.md`'s Permissions section for why this is a narrow exception to Tasks.md's normal "assigner or admin can edit" rule.*

### Document

| Field | Notes |
|---|---|
| id | |
| file | Office file or PDF for MVP |
| title | |
| folder_id | determines permission boundary |
| category | e.g., tax, medical, school — used for AI recommendations. Free-text, but kept in sync with the Document Category list below (see that entity) |
| is_sensitive | boolean — flags content requiring the extra sensitive-data outside-transmission gate (see AI_Permissions.md); unavailable to minors regardless of other permissions |
| uploaded_by | |
| uploaded_at | |
| source_device_id | set when this document arrived via a connector sync rather than a direct upload; NULL otherwise (see File_Connector_Architecture.md) |
| source_path | the file's original path on the source device — needed to request the actual bytes later |
| source_modified_at | the device's last-reported modification time for this file — compared on each sync to tell a genuine edit (invalidates an already-fetched copy) apart from the same unchanged file being reported again |
| sync_status | `local` (uploaded directly) / `metadata_only` (connector reported it, file not yet pulled) / `fetched` (connector-sourced and the file is now on the host) |
| removed_from_source_at | set, not deleted, if a later sync no longer finds the file on the device — keeps the record in case a Memory or elsewhere still references it (resolves File_Connector_Architecture.md's open Question on this) |
| file_requested_at | set when a family member opens/downloads a `metadata_only` document, so the source device's connector knows to upload it on its next check-in |
| embedding | vector embedding over title/category for cross-content search (Phase 6, see Search.md) |

*No versioning in MVP — each document is the current file only. Versioning is a commercial-app requirement, not MVP. See Future Enhancements.*

### Document Category

The manageable list backing Document's free-text `category` field (2026-07-30). Kept in sync automatically: saving a document with a category name not yet on this list inserts it. A Super Admin can rename a category (cascades to every document using the old name, from their profile page's "Document Categories" section) or delete one (blocked while any document still uses it — must be reassigned first). One category per document for MVP; see Future Enhancements for multi-category support.

| Field | Notes |
|---|---|
| id | |
| name | unique |
| created_by | |
| created_at | |

### Folder
Represents a permission boundary for documents (and potentially other content types).

| Field | Notes |
|---|---|
| id | |
| name | |
| owner_id | |
| parent_folder_id | null for top-level folders; enables nested subfolders |
| inherits_permissions | boolean — true by default for subfolders; can only be overridden by the Super Admin (see Folder_Permissions.md) |
| permissions | per-user or per-role View/Edit/Delete grants (see Folder_Permissions.md for the full model) |
| is_shared_family_folder | boolean flag identifying the one built-in whole-family folder, viewable by all family members by default |

### Photo

| Field | Notes |
|---|---|
| id | |
| file | |
| uploaded_by | |
| uploaded_at | |
| location | optional |
| tags | people and other tags, hashtag-style (e.g., #Malachi, #church-outreach) |
| visibility | public (default) / private — same model as Event/Task visibility (see Photos.md, Calendar.md, Tasks.md) |
| is_sensitive | boolean — same flag/behavior as Document and Family_Knowledge_Item (see AI_Permissions.md, Photos.md) |
| event_link | optional link to a related Event, populated from the AI's "what event is this from?" prompt (see Photos.md) |
| source_device_id, source_path, source_modified_at, sync_status, removed_from_source_at, file_requested_at | same meaning as Document's connector-sourced fields above (see File_Connector_Architecture.md) |
| thumbnail | small preview image sent with metadata at sync time, so a `metadata_only` photo still renders something before the full file is fetched |
| embedding | vector embedding over tags/location for cross-content search (Phase 6, see Search.md) |

The AI can prompt the uploader to help categorize a new photo at upload time — e.g., *"Who is in this picture?" / "Where was it taken?" / "What event is this from?"* — populating tags/location/event linkage. These tags are what later power searches like "show me all church outreach pictures" or "find every photo with Malachi."

### Memory
A richer, story-like record — can be text-only, photo-only, document-only, or any combination; no attachment is required (see Memory.md).

| Field | Notes |
|---|---|
| id | |
| title | |
| caption_notes | |
| event_link | optional link to a related Event |
| visibility | public (default) / private — same model as Event/Task/Photo visibility |
| is_sensitive | boolean — same flag/behavior as Document, Photo, and Family_Knowledge_Item |
| created_by | |
| created_at | |

### Memory_Photo
Join table — a Memory can include multiple Photos, and (in principle) a Photo could be referenced by more than one Memory.

| Field | Notes |
|---|---|
| memory_id | |
| photo_id | |

### Memory_Document
Join table, same pattern as Memory_Photo — a Memory can include multiple Documents (see Memory.md).

| Field | Notes |
|---|---|
| memory_id | |
| document_id | |

### Family_Knowledge_Item
A general-purpose "family safety deposit box" entry — contact info, medical contacts, home improvement records, insurance documents, and similar. **Shared-service passwords use the dedicated Password_Entry entity below instead of this general entity** (see Family_Knowledge.md).

| Field | Notes |
|---|---|
| id | |
| category | e.g., contact, medical, home_improvement, insurance |
| title | |
| content | the actual info (text or attached document reference) |
| is_sensitive | boolean — flags content requiring the extra sensitive-data outside-transmission gate (see AI_Permissions.md); unavailable to minors regardless of other permissions |
| folder_id / permissions | governs who can view this item — some entries (e.g., a general contact) may be visible to everyone; others (e.g., a specific medical record) may be restricted |
| created_by | |
| updated_at | |
| embedding | vector embedding for cross-content search (Phase 6, see Search.md, `lib/core/search`) |

### Password_Entry
Structured, browser-manager-style credential storage — kept separate from the free-text Family_Knowledge_Item shape (see Family_Knowledge.md).

| Field | Notes |
|---|---|
| id | |
| service_name | e.g., "Netflix," "Electric Company Portal" |
| username | |
| password | stored using the general "encrypted whenever possible" approach for MVP (see Security_Architecture.md); stronger, dedicated encryption is a required upgrade before use beyond this one family |
| url | optional |
| notes | optional |
| folder_id / permissions | same model as Family_Knowledge_Item |
| is_sensitive | true by default, always — credentials are inherently sensitive |
| created_by | |
| updated_at | |
| embedding | vector embedding over service_name/notes/url only — the password itself is never embedded (Phase 6, see Search.md) |

### Conversation
A saved chat thread between a user and the Assistant (per Assistant.md).

| Field | Notes |
|---|---|
| id | |
| user_id | owner of this conversation; private by default, not visible to other users including admins |
| title | auto-generated from content, or user-renamed |
| created_at | |
| updated_at | |

### Message
An individual message within a Conversation.

| Field | Notes |
|---|---|
| id | |
| conversation_id | |
| role | user / assistant |
| content | |
| created_at | |

### Email_Account
A user's Standing Integration Connection to their personal email account (see Email.md, Security_Architecture.md). No raw email content is persisted — only the connection itself.

| Field | Notes |
|---|---|
| id | |
| user_id | one per user for MVP; multiple accounts per user planned for future |
| provider | |
| email_address | |
| status | connected / revoked |
| connected_at | |
| imap_host, imap_port, imap_username, encrypted_password | connection details needed to fetch a live summary on demand (Phase 6) — not in this entity's original design, added because "no raw email content persisted" still requires reconnecting each time; the password is encrypted the same way Password_Entry's is (`lib/crypto/secret-box`), under its own "email" context |

### AI_Memory
The AI's curated, per-user store of distilled facts — the first, fastest context layer the AI checks (Tier 1 memory, per `AI_Architecture.md`). See `AI_Memory.md` for full detail.

| Field | Notes |
|---|---|
| id | |
| user_id | |
| fact | the distilled memory item |
| category | Preferences / Routines & Patterns / Relationships & Context — tag-based, one unified pool per user |
| source | explicit statement, inferred pattern, or suggestion feedback |
| confidence | decays automatically without reinforcement |
| last_reinforced_at | |
| is_sensitive | same flag/behavior as Document and Family_Knowledge_Item |
| flagged | set by the user the entry is about; cleared when Super Admin resolves it |
| flagged_at | |

### AI_Suggestion
A stored record of a suggestion the AI made — enables the AI to learn from what each family member finds valuable over time.

| Field | Notes |
|---|---|
| id | |
| user_id | who the suggestion was shown to |
| module | which part of the system generated it (Dashboard, Calendar, etc.) |
| trigger_type | event / weekly_check — how this suggestion was generated (see Advisor.md) |
| display_context | dashboard, or contextual + which module — governs where it's shown and against which display limit (10 on Dashboard, 2 contextual, see Advisor.md) |
| relevancy_score | used to prioritize which suggestions display when more exist than the display limit allows; relevancy first, most recent as tiebreak (see Advisor.md) |
| related_entity_id | id of the specific event/task/document/etc. this suggestion is about — not a DB-enforced FK since it can point at different tables depending on `module`; needed so automatic expiration (AI_Suggestions.md) can re-check whether that item's flagged condition still holds |
| content | the suggestion text |
| generated_at | |
| expired | boolean, set automatically when no longer relevant (see AI_Suggestions.md) |
| expired_at | |
| expired_reason | brief note, e.g. "related event passed," "task completed elsewhere" |
| accepted_at | when the user accepted and was routed to complete the action |
| feedback | thumbs_up / thumbs_down / dismissed / none — dismiss is a neutral signal, thumbs_down is a stronger negative signal (see AI_Suggestions.md) |
| feedback_at | |
| suggested_value | a single structured value alongside `content`'s prose, e.g. one specific document category — lets Accept pre-fill something unambiguous. NULL for suggestion types with nothing structured to suggest yet (see AI_Suggestions.md) |

### Notification

| Field | Notes |
|---|---|
| id | |
| user_id | recipient |
| text | |
| created_at | |
| related_suggestion_id | optional link to an AI_Suggestion, when applicable |
| related_event_id, related_task_id | optional link to the Event/Task a reminder is about (Phase 6) — same pattern as related_suggestion_id, backing Notifications.md's tap-routing rule |
| liked | optional thumbs up/down, when applicable |
| severity | routine (default) / urgent — determines visual treatment, e.g. red for urgent (see Notifications.md, Guardian.md) |

*MVP delivers notifications real-time only. Persisting notification history (time, text, liked/not) with this table is a near-term enhancement, not core MVP — see Future Enhancements.*

### Family_Message

(2026-07-31) A plain human-to-family channel on the family-wide Dashboard view — see `Dashboard.md`'s "Family Message Board" section.

| Field | Notes |
|---|---|
| id | |
| text | |
| posted_by | who posted it — an Admin or Super Admin only (see Dashboard.md's Permissions) |
| created_at | |
| updated_at | changes on edit; UI shows "(edited)" when it differs from created_at |

*Unlike Notification, no cap or expiry — a message stays until the poster (or the Super Admin, as a backstop) deletes it. Editing is restricted to the original poster only, even for the Super Admin.*

### Push_Subscription
A browser/device's Web Push registration (Phase 6, see Notifications.md's "Android push for MVP"). Not part of the module doc's own Data Stored section — this is the storage the feature genuinely needs, not a new family-data concept; a user can hold more than one (e.g. phone + desktop Chrome).

| Field | Notes |
|---|---|
| id | |
| user_id | |
| endpoint | unique per browser/device push registration |
| p256dh, auth | the subscription's encryption keys, required to send an encrypted push payload |
| created_at | |

## Relationships (Summary)

- **User** → has many **Devices**
- **User** → has many **Conversations**, each with many **Messages**
- **User** → has many **AI_Memory** entries
- **User** → has one **Email_Account** (MVP; multiple planned for future)
- **User** → created/owns many **Events, Tasks, Documents, Photos, Memories, Family_Knowledge_Items, Password_Entries**
- **Event** ↔ **User** — many-to-many via **Event_Assignment**
- **Memory** ↔ **Photo** — many-to-many via **Memory_Photo**
- **Memory** ↔ **Document** — many-to-many via **Memory_Document**
- **Memory** → optionally links to one **Event**
- **Document** and **Family_Knowledge_Item** → belong to a **Folder**, which defines their permission boundary
- **AI_Suggestion** → belongs to one **User**; optionally referenced by a **Notification**
- **Task** → optionally has one **Homework_Detail**, which belongs to one **Subject** (see `Homeschool.md`)

## AI Responsibilities

- Reads `hobbies_interests` and usage patterns per User to tailor Dashboard suggestions and general AI behavior — including which Device a request came from, to help personalize responses to the right person.
- Prompts users for photo metadata at upload time (who/where/what event) rather than requiring manual tagging.
- Uses Document `category` and Family_Knowledge `category` fields to power recommendations (e.g., surfacing an insurance document when relevant).
- Every AI-generated suggestion is stored as an `AI_Suggestion` record, with thumbs up/down feedback captured against it — this feedback loop is the mechanism for the AI learning what each person values, referenced in `05_AI/AI_Suggestions.md`.

## Permissions

- All permission logic ultimately traces back to **Folder** permissions (Documents, Family_Knowledge) and direct ownership (Events, Tasks, Photos, Memories).
- Per `Security_Architecture.md`, a user can only approve sending a piece of data outside the home if they already have access to it through these same permission structures — there is no separate "approval-only" access tier.

## Dependencies

- Builds on `System_Overview.md` (users, devices, host/connector model) and `Security_Architecture.md` (permissions, approval scoping).
- Feeds into every module doc in `02_Modules`, and into `01_System_Architecture/API_Reference.md` once written.

## Future Enhancements

- Document versioning (commercial-app requirement, not MVP).
- Sub-tasks.
- Persistent notification history table (time, text, liked/not) — noted above as a near-term but post-MVP addition.
- Support for additional file types beyond Office/PDF (CAD, STL) — will require new Document-like fields (e.g., file type-specific metadata).
- Possible expansion of Family_Knowledge_Item into more structured sub-types (e.g., a dedicated Password entry with stronger encryption than a general text note).
- Multiple categories per document (currently one) — would need a many-to-many table and updates everywhere a document's category is read (Content page, Advisor, search).

## Questions

- For **Event reminders** — should the lead time be configurable per event (e.g., "remind me 1 day before" vs. "1 week before"), or a single system-wide default for MVP?
