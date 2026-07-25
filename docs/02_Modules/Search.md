# Search

## Purpose

Defines cross-cutting search across Documents, Photos, and Family Knowledge — the three content types identified as needing search that spans beyond any single module. For MVP this is a dedicated search screen; the underlying search capability is architected so the Assistant can be wired into the same logic later without duplicating it.

## Goals

- Give one genuinely useful search experience across content types, rather than three separate, inconsistent per-module searches.
- Build the search capability as a shared service now, so a future conversational search through the Assistant is a new *entry point* into the same logic, not a rewrite.
- Respect permission scoping fully — search should never reveal that sensitive or restricted content exists to someone who shouldn't see it.

## User Stories

- As a family member, I want to search once and see relevant Documents, Photos, and Family Knowledge items together, not three separate searches.
- As a family member, I want to eventually just ask the Assistant something like "find every photo with Malachi" and get the same results a manual search would give.
- As a family member, I want sensitive content to only appear in my search results if I actually have access to it — not hidden entirely, but not shown to someone who shouldn't see it either.

## Features

- **Scope: Documents, Photos, Family Knowledge for MVP.** Search spans exactly these three content types, consistent with the original cross-cutting need identified when `Documents.md` and `Photos.md` deferred search here. Expanding to Memory, Tasks, and Calendar is a planned future direction, not built now.
- **Dedicated search screen for MVP.** A single search bar/screen where a user searches across all three content types at once, using the vector search capability set up in `Technology_Stack.md` (ChromaDB or SQLite-based vector search, per that document's still-open decision) for semantic matching, not just keyword matching — e.g., "church outreach" should surface relevantly tagged Photos even without an exact text match.
- **Built as a shared service, for future Assistant integration.** Search logic lives as its own shared capability (consistent with the hybrid module + shared-core-service pattern already established in `Application_Architecture.md` for permissions/AI/logging) rather than being embedded directly in the search screen's code. This means a future conversational search through the Assistant calls the same underlying logic as the dedicated search screen, rather than duplicating it.
- **Permission-scoped results, sensitive content included when accessible.** Search results only ever include content the searching user already has permission to see (per `Folder_Permissions.md`). Sensitive-flagged items appear in results normally for users who already have access — visually marked sensitive, consistent with how they're marked elsewhere (`Documents.md`, `Photos.md`, `Family_Knowledge.md`) — rather than being excluded from search results outright.

## Screen Layout

- **Search bar/screen:** a single input, returning grouped or mixed results across Documents, Photos, and Family Knowledge.
- **Result cards:** each result shows enough context to identify it (title/thumbnail, content type, category/tags), with a sensitive-content indicator where applicable, matching the visual pattern already used in each source module.
- Tapping a result navigates to that item's detail view in its home module (`Documents.md`, `Photos.md`, or `Family_Knowledge.md`).

## Data Stored

- No new entities. Search operates over existing **Document**, **Photo**, and **Family_Knowledge_Item** (and **Password_Entry**, per `Family_Knowledge.md`) records already defined in `Data_Model.md`, using their existing `category`/`tags`/`content` fields plus the vector index built on top of them.

## AI Responsibilities

- The vector search index is built and queried using the local AI stack (per `AI_Architecture.md`), not an outside call — this is a local semantic search capability, not something requiring frontier-model reasoning.
- No suggestion-generation role here — Search is a direct, user-initiated action, not an Advisor/Guardian behavior.
- **Future:** when the Assistant is wired into this same search service, it will follow the same permission scoping described above — a conversational query never returns anything the requesting user couldn't already find through the dedicated search screen.

## Permissions

- Results are filtered by the searching user's existing folder/content permissions (per `Folder_Permissions.md`, `Authorization.md`) — no new permission concept, but strictly enforced at the search-service level so results never leak content a user shouldn't see, sensitive or otherwise.

## Dependencies

- Builds on `Technology_Stack.md` (vector search decision, still open per `Decision_Log.md` #005), `Documents.md`, `Photos.md`, `Family_Knowledge.md` (source content and their deferred references to this document), `Folder_Permissions.md` (permission scoping), and `Application_Architecture.md` (shared-service pattern).

## Future Enhancements

- Expand search scope to Memory, Tasks, and Calendar events.
- Wire the Assistant into this same search service for conversational, natural-language search (e.g., "show me all church outreach pictures," "find every photo with Malachi") — explicitly planned, built on the same underlying logic as the MVP search screen rather than a separate system.

## Questions

None currently open.
