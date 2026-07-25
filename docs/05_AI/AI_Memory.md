# AI Memory

## Purpose

Defines the structure and lifecycle of AI_Memory — the curated, per-user store of distilled facts the AI relies on as its first, fastest layer of context (per `AI_Architecture.md`'s hybrid memory model). Covers categorization, sensitivity handling, decay over time, and how family members can flag entries even though they can't edit them directly (per `AI_Permissions.md`'s view-only rule).

## Goals

- Keep AI_Memory genuinely useful and current — old, unreinforced facts should fade rather than accumulate indefinitely as clutter or stale assumptions.
- Apply the same sensitivity protections already established for Documents and Family Knowledge, without inventing a separate rule set for MVP.
- Give family members a voice in what's remembered about them, even without direct edit access, by letting them flag entries for Super Admin review.

## User Stories

- As a family member, I want to see what the AI has learned about me, organized in a way I can actually browse and understand.
- As a family member, I want to flag something the AI remembered incorrectly, even though I can't edit it myself.
- As the Super Admin, I want old, unreinforced facts to naturally fade in priority rather than pile up forever.
- As a parent, I want sensitive inferences about my family members handled with the same care as sensitive documents.

## Features

### Categories

AI_Memory entries are organized into categories for browsing and structure, while remaining one unified pool per user (not split by module):

- **Preferences** — how someone likes to be communicated with (e.g., tone, brevity), general likes/dislikes.
- **Routines & Patterns** — recurring schedule patterns, habits (e.g., "soccer practice Tuesdays").
- **Relationships & Context** — family relationships, roles, and other contextual facts that help the AI respond appropriately.
- Categories are tags on entries in a single unified store, not separate storage — an entry can reasonably relate to more than one category if needed.

### Sensitivity

- An AI_Memory entry can be flagged **`is_sensitive`**, using the same flag already established for Documents and Family Knowledge Items (`Data_Model.md`, `AI_Permissions.md`).
- For MVP, a sensitive AI_Memory entry is treated the same as any other sensitive content — subject to the same extra outside-transmission gate (`AI_Permissions.md`), and categorically unavailable for that gate on a minor's account.
- **Commercial version:** sensitive AI_Memory entries will likely need handling distinct from sensitive documents (e.g., different retention rules, different visibility defaults) — flagged as a future refinement, not built for MVP.

### Decay Over Time

- Entries **fade in priority automatically** the longer they go without being reinforced, using the existing `confidence` and `last_reinforced_at` fields (`AI_Architecture.md`).
- A fact that hasn't been reinforced in a long time is deprioritized in what the AI actively draws on, rather than being deleted outright — it can still be reinforced again later if it resurfaces as relevant.
- Reinforcement happens the same way entries are created: from explicit statements, inferred patterns, or `AI_Suggestion` feedback (per `AI_Architecture.md`).

### Flagging (User-Initiated, Super Admin-Resolved)

- A family member can **flag** an AI_Memory entry about themselves as wrong or unwanted, even though they cannot edit AI_Memory directly (per `AI_Permissions.md`).
- A flagged entry is marked for the **Super Admin's** review — the Super Admin remains the only one who can actually edit or remove it, but the flag surfaces the request rather than requiring the family member to ask informally.
- Flagging doesn't immediately change how the entry is used by the AI; it queues it for Super Admin attention.

## Screen Layout

- A "What the AI Knows About Me" view, accessible from a user's own profile/settings, showing their AI_Memory entries grouped by category.
- Each entry shows its content and a way to **flag** it (visible to all users, viewing their own memory).
- Edit controls on entries are only visible/functional when the Super Admin is viewing (their own, or — with appropriate access — another family member's), consistent with `AI_Permissions.md`.
- Sensitive entries are visually marked, same pattern as sensitive Documents/Family Knowledge items.

## Data Stored

Extends the **AI_Memory** entity introduced in `AI_Architecture.md`:

| Field | Notes |
|---|---|
| id | |
| user_id | |
| fact | the distilled memory item |
| category | Preferences / Routines & Patterns / Relationships & Context (tag-based, one unified pool) |
| source | explicit statement, inferred pattern, or suggestion feedback |
| confidence | existing field — decays over time without reinforcement |
| last_reinforced_at | existing field |
| is_sensitive | new — same flag/behavior as Documents and Family_Knowledge_Items (see `Data_Model.md`) |
| flagged | new — boolean, set by the user the entry is about, cleared when the Super Admin resolves it |
| flagged_at | new |

## AI Responsibilities

- Continues to serve as the AI's first, fastest context layer (per `AI_Architecture.md`'s hybrid memory model) — checked before the full Data Model.
- Applies decay logic automatically — deprioritizing unreinforced entries in what it actively surfaces/relies on, without needing a human to intervene for routine fading.
- Respects the sensitivity flag identically to how it treats sensitive Documents/Family Knowledge for any outside-transmission scenario.
- Does not act on a flagged entry differently until the Super Admin resolves it — flagging is a signal for human review, not an automatic behavior change.

## Permissions

- **View:** every user can view their own AI_Memory.
- **Edit:** Super Admin only, for any user's AI_Memory (per `AI_Permissions.md`).
- **Flag:** every user can flag entries about themselves; this does not require any elevated permission.

## Dependencies

- Builds directly on `AI_Architecture.md` (Tier 1 memory design) and `AI_Permissions.md` (view/edit rules, sensitivity gate).
- Also touches `Data_Model.md` (new fields: `is_sensitive`, `flagged`, `flagged_at`, `category`) — to be added there for consistency.

## Future Enhancements

- Distinct handling for sensitive AI_Memory entries in a commercial version, separate from the current Documents/Family Knowledge-aligned treatment.
- Possible richer categorization if a flat category list proves insufficient as real usage grows.

## Questions

None currently open.
