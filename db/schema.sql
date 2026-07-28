-- Tikas Family Digital Home — initial SQLite schema
-- Generated directly from docs/01_System_Architecture/Data_Model.md.
-- This is a starting point, not a finished migration: field types are reasonable
-- defaults, not verified against every downstream doc. Cross-check against
-- Data_Model.md, Folder_Permissions.md, and AI_Permissions.md before relying on it.
--
-- Conventions: snake_case fields (per Coding_Standards.md), TEXT for ids (UUIDs
-- generated at the application layer), INTEGER 0/1 for booleans (SQLite has no
-- native boolean type), TEXT for timestamps (ISO 8601).

PRAGMA foreign_keys = ON;

-- ── User ─────────────────────────────────────────────────────────────
-- See Data_Model.md, Authorization.md, AI_Permissions.md
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    relationship TEXT,
    date_of_birth TEXT,
    photo TEXT,
    contact_info TEXT,
    hobbies_interests TEXT,               -- JSON array
    calendar_color TEXT,
    ai_enabled INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'basic_user')),
    admin_scope TEXT,                     -- JSON array of user ids this admin is scoped to
    approve_outside_calls INTEGER NOT NULL DEFAULT 0,
    manage_devices INTEGER NOT NULL DEFAULT 0,
    manage_parental_controls INTEGER NOT NULL DEFAULT 0,
    view_child_activity_logs INTEGER NOT NULL DEFAULT 0,
    delete_content INTEGER NOT NULL DEFAULT 0,
    manage_folder_permissions INTEGER NOT NULL DEFAULT 0,
    -- Never 1 for a minor — enforce in application logic, not just this default.
    approve_sensitive_outside_transmission INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Device ───────────────────────────────────────────────────────────
-- See Security_Architecture.md (device trust model), File_Connector_Architecture.md
-- (connector pairing). auth_token/designated_folders are only set once an
-- admin actually enables a connector for this device (Phase 5) — a device
-- trusted only for login (Phase 1) leaves both NULL.
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    device_type TEXT NOT NULL CHECK (device_type IN ('computer', 'phone')),
    device_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'trusted' CHECK (status IN ('trusted', 'revoked')),
    added_by TEXT NOT NULL REFERENCES users(id),
    auth_token TEXT,                      -- connector's credential; shown once at pairing time
    designated_folders TEXT,              -- JSON array of folder-type strings, e.g. ["camera_photos","documents"]
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_sync_at TEXT
);

-- ── Connector Exclusion ──────────────────────────────────────────────
-- "Don't sync this again" — a family member deletes a connector-synced
-- item (e.g. a receipt photo) that's still present on the source device.
-- Without this, the next full sync would just re-report it and it would
-- silently reappear as metadata_only (the connector always reports its
-- entire current view; the host has no memory of a deleted row). Recording
-- the excluded path here lets applySyncBatch skip it permanently, even
-- though the file itself is untouched on the device. See
-- File_Connector_Architecture.md.
CREATE TABLE connector_exclusions (
    device_id TEXT NOT NULL REFERENCES devices(id),
    source_path TEXT NOT NULL,
    excluded_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (device_id, source_path)
);

-- ── Folder ───────────────────────────────────────────────────────────
-- See Folder_Permissions.md
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    parent_folder_id TEXT REFERENCES folders(id),
    inherits_permissions INTEGER NOT NULL DEFAULT 1,
    permissions TEXT,                     -- JSON: per-user/role View/Edit/Delete grants
    is_shared_family_folder INTEGER NOT NULL DEFAULT 0
);

-- ── Event (Calendar) ─────────────────────────────────────────────────
-- See Calendar.md
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date_time TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    category TEXT CHECK (category IN ('Budget', 'Home Repair', 'Chores', 'Medical', 'School', 'Social/Family')),
    reminder_lead_time TEXT,
    reminder_sent_at TEXT               -- set once the scheduler fires this event's reminder, so it never fires twice
);

CREATE TABLE event_assignments (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (event_id, user_id)
);

-- ── Task ─────────────────────────────────────────────────────────────
-- See Tasks.md. Flat structure only for MVP — no sub-tasks, no recurrence.
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    -- Missing from the original Data_Model.md Task entity even though
    -- Tasks.md's own Screen Layout (Task detail, Add/Edit Task) and the
    -- design handoff both use it — added here to match.
    description TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id),
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'not_done' CHECK (status IN ('not_done', 'done')),
    created_by TEXT NOT NULL REFERENCES users(id),
    assigned_by TEXT NOT NULL REFERENCES users(id),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    reminder_sent_at TEXT               -- set once the scheduler fires this task's due-date reminder
);

-- ── Document ─────────────────────────────────────────────────────────
-- See Documents.md. No versioning for MVP. Connector-sourced fields (Phase 5,
-- File_Connector_Architecture.md): a connector-synced document arrives as
-- metadata only — `file` is '' and sync_status is 'metadata_only' until a
-- family member requests it and the source device's connector uploads the
-- actual bytes on its next check-in. removed_from_source_at is set (not
-- deleted) if a later sync no longer sees the file on the device, since it
-- may still be referenced by a Memory elsewhere in the system.
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    file TEXT NOT NULL,                   -- storage path/reference; '' until fetched
    title TEXT NOT NULL,
    folder_id TEXT REFERENCES folders(id),
    category TEXT,
    is_sensitive INTEGER NOT NULL DEFAULT 0,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    source_device_id TEXT REFERENCES devices(id),
    source_path TEXT,                     -- original path on the source device
    source_modified_at TEXT,              -- the device's last-reported mtime; distinguishes a real edit from an unchanged re-sync
    sync_status TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN ('local', 'metadata_only', 'fetched')),
    removed_from_source_at TEXT,
    file_requested_at TEXT,               -- set when a family member asks for a not-yet-fetched file
    embedding TEXT                        -- JSON float array over title/category, per Search.md; see lib/core/search
);

-- ── Photo ────────────────────────────────────────────────────────────
-- See Photos.md. No dedup for MVP. See Document's comment above for the
-- connector-sourced fields shared with Phase 5; `thumbnail` additionally
-- lets a metadata-only photo still render something before the full file
-- is fetched (File_Connector_Architecture.md: "a thumbnail" is part of
-- what syncs on every check-in, unlike the full file).
CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    file TEXT NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    location TEXT,
    tags TEXT,                            -- JSON array
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    is_sensitive INTEGER NOT NULL DEFAULT 0,
    event_link TEXT REFERENCES events(id),
    source_device_id TEXT REFERENCES devices(id),
    source_path TEXT,
    source_modified_at TEXT,              -- see Document's comment above
    sync_status TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN ('local', 'metadata_only', 'fetched')),
    removed_from_source_at TEXT,
    file_requested_at TEXT,
    thumbnail TEXT,                       -- small base64 data URI, sent with metadata at sync time
    embedding TEXT                        -- JSON float array over tags/location, per Search.md; see lib/core/search
);

-- ── Memory ───────────────────────────────────────────────────────────
-- See Memory.md. Text-only, photo-only, document-only, or any combination.
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    caption_notes TEXT,
    event_link TEXT REFERENCES events(id),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    is_sensitive INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE memory_photos (
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    photo_id TEXT NOT NULL REFERENCES photos(id),
    PRIMARY KEY (memory_id, photo_id)
);

CREATE TABLE memory_documents (
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id),
    PRIMARY KEY (memory_id, document_id)
);

-- ── Family Knowledge ─────────────────────────────────────────────────
-- See Family_Knowledge.md. Passwords use the separate password_entries table below.
CREATE TABLE family_knowledge_items (
    id TEXT PRIMARY KEY,
    category TEXT,
    title TEXT NOT NULL,
    content TEXT,
    is_sensitive INTEGER NOT NULL DEFAULT 0,
    folder_id TEXT REFERENCES folders(id),
    created_by TEXT NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    embedding TEXT                       -- JSON float array, per Search.md; see lib/core/search
);

-- ── Password Entry ───────────────────────────────────────────────────
-- See Family_Knowledge.md. MVP-level encryption only — see Security_Architecture.md
-- and Decision_Log.md for the flagged requirement to harden this before any
-- release beyond this one family.
CREATE TABLE password_entries (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    username TEXT,
    password TEXT NOT NULL,               -- encrypt at the application layer before insert
    url TEXT,
    notes TEXT,
    folder_id TEXT REFERENCES folders(id),
    is_sensitive INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    embedding TEXT                       -- JSON float array over service_name/notes/url only — the password itself is never embedded
);

-- ── Assistant Conversations ──────────────────────────────────────────
-- See Assistant.md
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Email Account (Standing Integration Connection) ─────────────────
-- See Email.md, Security_Architecture.md. No raw email content stored.
-- IMAP connection fields (imap_host/imap_port/imap_username/encrypted_password)
-- aren't in Email.md's own Data Stored table — added here because fetching a
-- live summary on demand genuinely requires reconnecting each time, not
-- because a raw email content record is being kept. The password is
-- encrypted the same way Password Entries are (lib/crypto/secret-box), under
-- its own "email" context.
CREATE TABLE email_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    provider TEXT NOT NULL,
    email_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'revoked')),
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    imap_host TEXT,
    imap_port INTEGER,
    imap_username TEXT,
    encrypted_password TEXT
);

-- ── AI Memory ────────────────────────────────────────────────────────
-- See AI_Memory.md, AI_Architecture.md
CREATE TABLE ai_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    fact TEXT NOT NULL,
    category TEXT CHECK (category IN ('preferences', 'routines_patterns', 'relationships_context')),
    source TEXT CHECK (source IN ('explicit_statement', 'inferred_pattern', 'suggestion_feedback')),
    confidence REAL NOT NULL DEFAULT 1.0,
    last_reinforced_at TEXT,
    is_sensitive INTEGER NOT NULL DEFAULT 0,
    flagged INTEGER NOT NULL DEFAULT 0,
    flagged_at TEXT
);

-- ── AI Suggestion ────────────────────────────────────────────────────
-- See AI_Suggestions.md, Advisor.md
CREATE TABLE ai_suggestions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    module TEXT,
    trigger_type TEXT CHECK (trigger_type IN ('event', 'weekly_check')),
    display_context TEXT,                 -- 'dashboard' or 'contextual:<module>'
    relevancy_score REAL,
    content TEXT NOT NULL,
    -- Missing from the original entity even though AI_Suggestions.md's
    -- automatic expiration ("its related event/date has passed") requires
    -- being able to re-check the specific item a suggestion is about.
    -- Not a DB-enforced FK since it can point at different tables per module.
    related_entity_id TEXT,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expired INTEGER NOT NULL DEFAULT 0,
    expired_at TEXT,
    expired_reason TEXT,
    accepted_at TEXT,
    feedback TEXT DEFAULT 'none' CHECK (feedback IN ('thumbs_up', 'thumbs_down', 'dismissed', 'none')),
    feedback_at TEXT
);

-- ── Notification ─────────────────────────────────────────────────────
-- See Notifications.md. MVP: real-time delivery, app enforces "last 10, hard
-- delete beyond that" — not expressed as a schema constraint here.
-- related_event_id/related_task_id back Notifications.md's tap-routing rule
-- ("tapping a reminder routes to the relevant Event/Task") — same pattern as
-- the existing related_suggestion_id, not a generic polymorphic reference.
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    related_suggestion_id TEXT REFERENCES ai_suggestions(id),
    related_event_id TEXT REFERENCES events(id),
    related_task_id TEXT REFERENCES tasks(id),
    liked INTEGER,
    severity TEXT NOT NULL DEFAULT 'routine' CHECK (severity IN ('routine', 'urgent'))
);

-- ── Push Subscription ────────────────────────────────────────────────
-- See Notifications.md's "Android push for MVP" — one row per browser/device
-- push registration (a user could have more than one, e.g. phone + desktop
-- Chrome). Not part of Data_Model.md's original entity list — added here as
-- the storage this feature genuinely needs, not a new "family data" concept.
CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Search vector index ──────────────────────────────────────────────
-- See Search.md, Decision_Log.md #005 (sqlite-vec chosen over ChromaDB).
-- One shared vec0 virtual table across all four searchable content types
-- (Document/Photo/Family_Knowledge_Item/Password_Entry) rather than one per
-- type — vec0 takes a single primary key column, and a household's total
-- content volume is small enough that scanning one combined index costs
-- nothing extra. content_key is "<type>:<id>" (see lib/core/search);
-- embedding dimension (768) matches the local nomic-embed-text model.
CREATE VIRTUAL TABLE vec_content USING vec0(
    content_key TEXT PRIMARY KEY,
    embedding FLOAT[768]
);

-- ── Security Event ───────────────────────────────────────────────────
-- See Security_Architecture.md (required event types) and Logs.md (Admin
-- review screen, 30-day retention — retention is enforced by the logging
-- service, not expressed as a schema constraint here). user_id is nullable
-- to cover failed logins against a username that doesn't match any account.
CREATE TABLE security_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    detail TEXT,                          -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes ──────────────────────────────────────────────────────────
-- Starting set covering the most common lookups. Add more as real query
-- patterns emerge — do not over-index prematurely.
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_tasks_owner_id ON tasks(owner_id);
CREATE INDEX idx_documents_folder_id ON documents(folder_id);
CREATE INDEX idx_photos_uploaded_by ON photos(uploaded_by);
CREATE INDEX idx_family_knowledge_folder_id ON family_knowledge_items(folder_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_ai_memory_user_id ON ai_memory(user_id);
CREATE INDEX idx_ai_suggestions_user_id ON ai_suggestions(user_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_created_at ON security_events(created_at);
CREATE INDEX idx_documents_source_device_id ON documents(source_device_id);
CREATE INDEX idx_photos_source_device_id ON photos(source_device_id);
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
