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
- **Hybrid local/frontier routing** (2026-08-01, see `AI_Architecture.md` for the engine-level design). Two mechanisms, both built on top of a configured Anthropic connection (`claude-opus-5` for MVP — see `Future_Ideas.md` for the deferred multi-provider/bring-your-own-key plan for a commercial release):
  - **Automatic, no approval needed.** A recent stretch of the conversation that plausibly needs no family data or tools (e.g., "what's a good substitute for buttermilk?", or a follow-up like "and verse 4?" in a thread that's stayed off family topics) is routed straight to the frontier model instead of the local model — invisible to the user beyond a small "via Claude" label on the reply, since nothing family-specific is ever sent. If an earlier message in that recent stretch does look family-related, the whole exchange falls back to local instead — a follow-up question alone looking clean isn't enough on its own.
  - **Thumbs-down escalation.** Every Assistant reply gets a 👍/👎 control. Rating a locally-sourced reply down offers — only to a user holding both "Approve Outside Calls" and the sensitive-data outside-transmission gate (`AI_Permissions.md`) — a second opinion from the frontier model. Before anything is sent, a preview shows exactly what would go out: the original question, the AI_Memory facts the local model had, and its own answer. Declining just leaves the thumbs-down recorded as feedback.
- **Identity awareness** (built 2026-08-01) — the system prompt now states who the Assistant is currently speaking with (name and role). Previously it had no way to know, and would say so honestly if asked — a real gap a user hit directly.
- **Cross-user profile lookup, matching the household's general visibility rule** (built 2026-08-01, `get_user_profile` tool) — "what do you know about [name]" now actually works, rather than the Assistant truthfully saying it has no persistent memory (which, before this, was accurate: nothing had ever written to AI_Memory — see `AI_Memory.md`'s now-real write paths). Visibility: a user can always ask about themselves; an Admin can ask about someone in their `admin_scope` only if also granted "View Child Activity Logs" (`Authorization.md`); a Super Admin can ask about anyone. A denied lookup is relayed to the user honestly (the Assistant never works around it or guesses). **This is scoped to AI_Memory profile facts only — it does not expose another person's actual chat history**, which stays governed by the unchanged rule below.

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
| source | `local` / `frontier` — which model produced this reply (2026-08-01, hybrid routing); always `local` for a `user`-role row |
| feedback | `thumbs_up` / `thumbs_down` / null (2026-08-01) — per-message rating on an assistant reply, distinct from `AI_Suggestion`'s card-level feedback (`AI_Suggestions.md`) |

A Conversation's messages feed the Assistant's short-term context for that thread; longer-term personalization still comes from AI_Memory (`AI_Architecture.md`), not from re-reading full chat history each time.

## AI Responsibilities

- Runs on-demand, only when a user opens the chat bubble and sends a message — no background/scheduled behavior (that's Guardian's role).
- Follows the shared prompt structure from `AI_Architecture.md`: Base Layer (family rules/tone) → Role Layer (Assistant-specific instructions: be broadly helpful, prioritize family data, ask clarifying questions only when needed) → Context Layer (starts narrow — the current conversation plus AI_Memory — expanding to the full Data Model only if needed).
- Determines, per query, whether a family-data answer or a general-knowledge answer is more relevant, favoring family data when both are plausible.
- Asks a clarifying question only when necessary, or when the user has indicated (in that conversation or as a standing preference) that they want to be asked.
- Routes through `/lib/core/ai` for permission checks, outside-call approval (including the sensitive-data gate, per `AI_Permissions.md`), and logging — same as every other AI interaction.
- For photo-to-event extraction specifically: sends only the image (not any other family data) to the external frontier model, receives structured JSON in return, validates it against the expected event schema, and pre-fills the Event creation screen — never saving the event without explicit user confirmation.
- For hybrid routing: decides per-message, before offering tools/AI_Memory, whether the question plausibly needs family data at all — routing to the frontier model automatically if not, and to the local model with full context otherwise. For thumbs-down escalation, only offers the option when the reply came from the local model and the requesting user holds both required permissions, and always shows the exact outbound payload before sending.
- States who it's currently speaking with at the top of every prompt (name + role), and offers `get_user_profile` for cross-user AI_Memory lookups — see the Identity awareness / Cross-user profile lookup features above for the exact visibility rule.

## Permissions

- The Assistant only ever sees and uses data the requesting user already has permission to access (folder permissions, `Authorization.md`) — no broader visibility than that user has themselves, **except** the `get_user_profile` lookup above, which deliberately extends visibility to AI_Memory profile facts for an Admin's scoped users (with permission) or anyone for a Super Admin — matching `AI_Memory.md`'s own view rule, not a separate one invented here.
- Chat history (Conversations/Messages) is private to the user who created it by default — no other family member can read someone else's Assistant conversations, including admins, unless a future permission is explicitly designed for that (not built for MVP). **Unchanged by the above** — `get_user_profile` exposes AI_Memory's distilled facts about a person, never their raw conversation transcripts.

## Dependencies

- Builds on `AI_Architecture.md` (engine, memory, prompt structure), `AI_Permissions.md` and `Authorization.md` (permission scoping), and `Data_Model.md` (new Conversation/Message entities).
- Feeds into `Advisor.md` and `Guardian.md` by contrast (both differ from Assistant in trigger and scope) and into `Conversation_Rules.md` for finer behavioral detail.

## Future Enhancements

- Selectable standard personalities (e.g., a small set of tone presets) for a commercial version, rather than only the MVP's gradual per-user learning.
- Possible shared/family-visible conversations for questions relevant to the whole household, distinct from private one-on-one chats.

## Questions

- Should conversation titles be auto-generated by the AI (like many chat tools do after the first message), or does the user name each conversation themselves?
- Is there a limit on how many past conversations are kept, or do they persist indefinitely for MVP?
