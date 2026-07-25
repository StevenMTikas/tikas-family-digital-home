# Assistant

## Purpose

Defines the behavior of the Assistant — the on-demand, conversational AI role family members interact with directly. Where `AI_Architecture.md` defines the underlying engine (models, memory, prompt structure) shared by all three agents, this document defines what makes the Assistant specifically behave the way it does: how it's reached, what it can answer, how it adapts per person, and how conversations are preserved.

## Goals

- Make the Assistant feel immediately reachable from anywhere in the app, without ever feeling like it's demanding attention.
- Let the Assistant be broadly useful (general knowledge, not just family data) while making sure family context always takes priority when relevant.
- Let each family member's experience of the Assistant gradually adapt to them personally, consistent with "the dashboard should learn slowly."

## User Stories

- As a family member, I want a persistent chat bubble available everywhere, so I can ask the Assistant something no matter what screen I'm on.
- As a family member, I want to ask both family-specific questions ("when's Malachi's next appointment?") and general questions ("what's a good substitute for buttermilk?") in the same place.
- As a family member, I want the Assistant to feel more like *my* assistant over time — remembering how I like to be talked to — without me having to configure anything.
- As a family member, I want to look back through my past conversations with the Assistant, similar to how chat history works in other AI chat tools.
- As a family member, I want the Assistant to ask me a clarifying question when it genuinely needs one to answer well, but not pepper me with questions for things it can reasonably figure out on its own.

## Features

- **Persistent chat bubble** — available on every screen, not confined to a dedicated tab. Tapping it opens the Assistant without navigating away from whatever the user was doing.
- **Chat history sidebar** — modeled after typical AI chat interfaces (e.g., a sidebar listing past conversations by title/date), reachable from the same chat bubble/panel. Users can open a past conversation and continue it, or start a new one.
- **Combined scope: family data + general knowledge.** The Assistant can answer general questions like a typical AI chatbot, but **family data takes priority** — if a question could be answered either generically or from the family's own information, the Assistant favors the family-specific answer.
- **Per-user adaptation over time.** The Assistant's tone/style adapts to each individual family member as it learns their preferences (via AI_Memory, per `AI_Architecture.md`) — e.g., naturally becoming more concise for someone who prefers short answers, without being told to.
- **Clarifying questions, only when needed.** The Assistant asks a follow-up question only if it genuinely can't answer well without one, or if the user has explicitly told it they want to be asked when it has questions. Otherwise, it makes its best reasonable attempt and proceeds — consistent with staying in the background rather than demanding attention.
- **Photo-to-event extraction.** A user can snap a photo of something (e.g., a school flyer) and ask the Assistant to extract event details from it. Since local models aren't yet reliable enough for this kind of image reasoning, this specific capability routes through the standard **outside-call approval flow** (`Security_Architecture.md`): the user sees exactly what's about to be sent (the photo) before it goes anywhere. A frontier model (provider TBD, see `Decision_Log.md`) returns structured data, which pre-fills a new Event for the user to review and confirm — never auto-created without that review, consistent with `AI_Suggestions.md`'s acceptance pattern. **This content is treated as sensitive by default** (per `AI_Permissions.md`), meaning it also requires the sensitive-data outside-transmission gate — which, per that gate's existing rule, is not available to a minor's account at all. Malachi cannot use this specific feature unless the underlying rule changes; he can still add events manually.

## Screen Layout

- **Chat bubble:** persistent, small, unobtrusive — visible in a consistent location across every screen in the app.
- **Chat panel (opened from the bubble):**
  - A sidebar listing past conversations (title, most recent first), similar to typical AI chat interfaces.
  - The main conversation view, with the active chat's message history and an input field.
  - A way to start a new conversation without losing access to past ones.
- No dedicated full-screen "Assistant" tab is required for MVP — the bubble is the entry point everywhere.

## Data Stored

Introduces two new entities to `Data_Model.md` to support persistent chat history:

### Conversation

| Field | Notes |
|---|---|
| id | |
| user_id | owner of this conversation |
| title | auto-generated from the conversation's content, or user-renamed |
| created_at | |
| updated_at | |

### Message

| Field | Notes |
|---|---|
| id | |
| conversation_id | |
| role | user / assistant |
| content | |
| created_at | |

A Conversation's messages feed the Assistant's short-term context for that thread; longer-term personalization still comes from AI_Memory (`AI_Architecture.md`), not from re-reading full chat history each time.

## AI Responsibilities

- Runs on-demand, only when a user opens the chat bubble and sends a message — no background/scheduled behavior (that's Guardian's role).
- Follows the shared prompt structure from `AI_Architecture.md`: Base Layer (family rules/tone) → Role Layer (Assistant-specific instructions: be broadly helpful, prioritize family data, ask clarifying questions only when needed) → Context Layer (starts narrow — the current conversation plus AI_Memory — expanding to the full Data Model only if needed).
- Determines, per query, whether a family-data answer or a general-knowledge answer is more relevant, favoring family data when both are plausible.
- Asks a clarifying question only when necessary, or when the user has indicated (in that conversation or as a standing preference) that they want to be asked.
- Routes through `/lib/core/ai` for permission checks, outside-call approval (including the sensitive-data gate, per `AI_Permissions.md`), and logging — same as every other AI interaction.
- For photo-to-event extraction specifically: sends only the image (not any other family data) to the external frontier model, receives structured JSON in return, validates it against the expected event schema, and pre-fills the Event creation screen — never saving the event without explicit user confirmation.

## Permissions

- The Assistant only ever sees and uses data the requesting user already has permission to access (folder permissions, `Authorization.md`) — no broader visibility than that user has themselves.
- Chat history (Conversations/Messages) is private to the user who created it by default — no other family member can read someone else's Assistant conversations, including admins, unless a future permission is explicitly designed for that (not built for MVP).

## Dependencies

- Builds on `AI_Architecture.md` (engine, memory, prompt structure), `AI_Permissions.md` and `Authorization.md` (permission scoping), and `Data_Model.md` (new Conversation/Message entities).
- Feeds into `Advisor.md` and `Guardian.md` by contrast (both differ from Assistant in trigger and scope) and into `Conversation_Rules.md` for finer behavioral detail.

## Future Enhancements

- Selectable standard personalities (e.g., a small set of tone presets) for a commercial version, rather than only the MVP's gradual per-user learning.
- Possible shared/family-visible conversations for questions relevant to the whole household, distinct from private one-on-one chats.

## Questions

- Should conversation titles be auto-generated by the AI (like many chat tools do after the first message), or does the user name each conversation themselves?
- Is there a limit on how many past conversations are kept, or do they persist indefinitely for MVP?
