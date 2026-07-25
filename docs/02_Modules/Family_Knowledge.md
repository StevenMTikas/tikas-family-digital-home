# Family Knowledge

## Purpose

Defines the Family Knowledge module — the general-purpose "family safety deposit box" built on the existing `Family_Knowledge_Item` entity (`Data_Model.md`), plus a new, structured **Password Entry** type for shared-service credentials. Resolves the open encryption question from `Data_Model.md`: MVP keeps password storage simple, consistent with the general "encrypted whenever possible" rule, with stronger/dedicated encryption flagged as a required upgrade beyond this one family's use.

## Goals

- Give the family one trusted place for shared reference info — contacts, medical info, home records, insurance — using the existing flexible `Family_Knowledge_Item` shape.
- Give passwords their own structured, browser-manager-style fields, since a free-text blob is a poor fit for credentials specifically.
- Be honest about MVP's encryption limits for passwords, and flag clearly that this needs real hardening before the system is used by anyone beyond this one family.

## User Stories

- As a family member, I want a single place to find shared contact info, medical info, and important records without digging through Documents.
- As a family member, I want to store a shared streaming service password in a structured way — service, username, password — like a browser password manager, not a paragraph of text.
- As the Super Admin, I want to know this is simple for MVP but isn't yet strong enough encryption to trust with a wider audience than my own family.

## Features

- **General Family Knowledge items.** Contact info, medical contacts, home improvement records, insurance documents, and similar — using the existing flexible `Family_Knowledge_Item` entity, categorized and folder-scoped per `Folder_Permissions.md`.
- **Structured Password Entries.** A distinct entry type specifically for credentials, with dedicated fields (service name, username, password, URL, notes) rather than free text — modeled after a typical browser password manager.
- **MVP-level encryption for passwords.** Consistent with the general "encrypted whenever possible" rule already established (`Security_Architecture.md`), password entries get the same treatment as any other sensitive content for now — no separate, stronger encryption scheme yet. This is explicitly flagged as **not sufficient for anything beyond this single family's private use** and must be revisited before any wider release (see Future Enhancements).
- **Same permission model as other Family Knowledge items.** Password Entries live within the same folder-permission system as general items — some may be visible to everyone (a shared streaming password), others restricted (see Permissions below).

## Screen Layout

- **Family Knowledge browser:** organized by category (contact, medical, home_improvement, insurance, passwords, etc.), reflecting the folder structure it lives in.
- **General item detail/edit:** title, category, content (free text or attached document reference).
- **Password Entry detail/edit:** service name, username, password (masked by default, revealed on request), URL, notes — a distinct, structured form rather than the general item's free-text field.
- Sensitive items (including all Password Entries by default — see Data Stored) are visually marked, consistent with the pattern used elsewhere.

## Data Stored

Uses the existing **Family_Knowledge_Item** entity from `Data_Model.md` for general items — no changes needed there.

**New: Password_Entry**

| Field | Notes |
|---|---|
| id | |
| service_name | e.g., "Netflix," "Electric Company Portal" |
| username | |
| password | stored using the same "encrypted whenever possible" approach as other sensitive content for MVP (see Security_Architecture.md) — flagged for stronger, dedicated encryption before any release beyond this family |
| url | optional |
| notes | optional |
| folder_id / permissions | same model as Family_Knowledge_Item — governs who can view/edit this entry |
| is_sensitive | true by default for every Password Entry — credentials are inherently sensitive |
| created_by | |
| updated_at | |

## AI Responsibilities

- Uses `category` on general Family Knowledge items to power recommendations, same as `Documents.md`.
- Respects `is_sensitive` (always true for Password Entries) for any outside-transmission scenario, per `AI_Permissions.md` — meaning a Password Entry could never be sent outside the home by a minor's account, and requires the sensitive-data gate for anyone else.
- The AI does not autonomously reveal a stored password in a response without the requesting user having direct view access to that specific entry — same permission scoping as any other content.

## Permissions

- **View/Edit/Delete:** governed by folder permissions, same model as `Family_Knowledge_Item` and `Documents.md` — some entries may be visible to everyone (e.g., a shared streaming password), others restricted to specific family members.
- **Password Entries are always treated as sensitive**, regardless of folder visibility — meaning even a "visible to everyone" password entry still requires the sensitive-data outside-transmission gate before it could be sent outside the home, and is never available for that gate on a minor's account.

## Dependencies

- Builds on `Data_Model.md` (Family_Knowledge_Item entity, plus the new Password_Entry entity), `Folder_Permissions.md` (permission model), `Security_Architecture.md` (encryption baseline), and `AI_Permissions.md` (sensitivity handling).

## Future Enhancements

- **Stronger, dedicated encryption for Password Entries** before this system is used by any family beyond the original MVP household — explicitly flagged as a requirement, not a nice-to-have, before wider release.
- Possible additional structured sub-types within Family Knowledge beyond passwords (e.g., a dedicated medical-record type), if general free-text items prove insufficient.

## Questions

None currently open.
