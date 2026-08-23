# AI Architecture

## Purpose

Defines the technical design of the AI engine underneath Tikas Family Digital Home — the models used, how memory and context work, how the three AI roles are implemented, and how prompting is structured. This document covers the *engine*; behavior and personality for each role belong in `05_AI/Assistant.md`, `Advisor.md`, and `Guardian.md`.

## Goals

- Keep the AI fast and focused by default, only reaching for deeper context when a request genuinely needs it.
- Let the AI improve over time from real feedback (thumbs up/down) rather than static rules alone.
- Keep the three AI roles cleanly separated as individual agents, while sharing one consistent foundation (family rules, tone, boundaries) across all of them.

## Models

- Runs locally via **Ollama**.
- **Initial candidate: Llama 3.x** (e.g., Llama 3.1 8B) for the Assistant and Advisor roles — chosen for strong instruction-following and solid tool-use/function-calling support, which matters since the AI needs to call into permissions and data lookups, not just converse.
- **Guardian** (background monitoring, runs more frequently but needs less depth per check) may use a smaller/faster model (e.g., Llama 3.2 3B) — final sizing to be tuned against actual host hardware.
- **Qwen** remains a candidate worth benchmarking against Llama, particularly at smaller sizes where it's sometimes more capable per compute — final model selection is logged as an open decision in `Decision_Log.md`, not locked in here, since Ollama makes swapping models straightforward.
- **Responses are streamed** to the UI rather than returned whole, for a faster-feeling experience.
- **Tools are only offered when the question plausibly needs them** (2026-07-31) — `lib/core/ai/tools.ts`'s `messageNeedsTools()` is a cheap keyword check (task/event/schedule/etc. vocabulary), not an LLM call. Offering `ASSISTANT_TOOLS` unconditionally on every message was the main trigger for the model attempting a fake tool call on a question with nothing to do with schedules or tasks (e.g. "give me the text of Amos 3:3").
- **Malformed tool-call output never reaches the user as raw text** (2026-07-31) — `ollamaChatStream` (`lib/core/ai/ollama.ts`) sniffs the leading edge of streamed content for the shape of a tool call written as literal JSON (e.g. `{"name": "get_open_tasks", ...}`) instead of using Ollama's real `tool_calls` field. If detected, it's converted into an actual tool call rather than streamed verbatim; a plain reply streams through with no added delay once it's clear this isn't happening.
- **Hybrid local/frontier routing for the Assistant** (2026-08-01, `lib/core/ai/frontier.ts`) — a configured frontier connection (Anthropic API, `claude-opus-5`, see `ANTHROPIC_API_KEY` in `.env.example`) handles two cases local-only couldn't cover well, both built on top of the tool-relevance check above:
  - **Automatic routing, no approval needed.** In `streamAssistantReply` (`lib/core/ai/index.ts`), routing is decided over a short recent window of the conversation (last `FRONTIER_HISTORY_WINDOW` messages, currently 6, queried directly from the DB with `source`), not just the newest message — but a user turn and an assistant turn are checked differently. A **user** turn uses the same `messageNeedsTools()` keyword check that gates tool offering. An **assistant** turn is checked by its recorded `source`, not by keyword: a locally-answered reply may carry real family data that doesn't necessarily contain any `messageNeedsTools()` keyword at all (e.g. "Malachi has a dentist appointment"), so keyword-scanning assistant text wouldn't actually catch the real risk — and it produces false positives on ordinary assistant text that happens to contain a keyword for unrelated reasons (found live: a Bible translation's "...for tomorrow the LORD will do wonders..." tripped "tomorrow"). Only when *every* turn in the window passes its check does it stream from the frontier model instead of Ollama (`source: "frontier"` recorded on the message), sending that recent window as real conversation turns — still no AI_Memory, and never anything outside the window. Falls back to local whenever any recent turn needs family data (by either check), or no frontier connection is configured. This is also the practical fix for the leaked-prompt-fragment failure mode that motivated this: a question needing no tools/memory is now never given them in the first place. **Revised 2026-08-01** after a real usability complaint ("the assistant doesn't see previous chats," `Future_Ideas.md`'s history of this design) — the original version sent only the single bare question with zero history, which broke follow-ups like "and verse 4?" for any exchange that stayed off task/schedule topics. The windowed, source-aware check restores that continuity without weakening the original guarantee.
  - **Thumbs-down escalation, gated by outside-call approval.** New per-message feedback on Assistant replies (see `Assistant.md`) lets a user rate a local-sourced reply down and, if they hold both `approveOutsideCalls` and `approveSensitiveOutsideTransmission` (`AI_Permissions.md` — AI_Memory content sent this way is treated as sensitive by default), preview and confirm sending the question, the specific AI_Memory facts used, and the local answer to the frontier model for a second opinion.
  - **Provider is hardcoded to Anthropic for MVP** — see `Future_Ideas.md` for the deferred multi-provider/bring-your-own-key design intended for a commercial release.
- **Performance target:** as fast as the host hardware allows for MVP — no fixed latency requirement yet.
- **Voice speech-to-text runs separately, via Whisper** (`Voice.md`, `Decision_Log.md` #009) — `lib/core/ai/whisper.ts` loads `whisper-base.en` through `@huggingface/transformers` (ONNX Runtime, not Ollama) as a module-level singleton, transcribing tap-to-talk audio in-process with no outside call. Not part of the Assistant/Advisor/Guardian chat-completion models above; a separate local model serving a separate purpose.

## Memory: Hybrid Model

The AI does not treat every interaction as a blank slate, but it also doesn't load a user's entire history on every request. It uses a two-tier hybrid:

### Tier 1 — AI_Memory (primary, fast)
A lightweight, curated store of **distilled, important facts** about each user — preferences, recurring patterns, and things worth remembering long-term (e.g., "Malachi has soccer practice Tuesdays," "Dad prefers terse answers"). This is checked first for any request.

**The write side is real as of 2026-08-01** (`lib/core/ai/memory-extraction.ts`) — until then, the create/reinforce functions existed but nothing ever called them, so this store was permanently empty in practice. A daily, per-user background pass distills a handful of durable facts from a person's recent Assistant conversation plus their own upcoming events/tasks (small/fast model, same cadence discipline as Guardian/Advisor); a thumbs-up on an `AI_Suggestion` also creates/reinforces one directly. See `AI_Memory.md` for the full design and `Assistant.md`'s `get_user_profile` tool for how another family member can be looked up (subject to the same visibility rule as everywhere else).

| Field | Notes |
|---|---|
| id | |
| user_id | |
| fact | the distilled memory item |
| source | where it came from (explicit statement, inferred pattern, suggestion feedback) |
| confidence | how certain the AI is this is still accurate |
| last_reinforced_at | updated when the fact is confirmed relevant again |

AI_Memory is refined over time using `AI_Suggestion` feedback (thumbs up/down) and observed usage patterns — it's a summary layer the AI curates, not a raw duplicate of other tables.

### Tier 2 — Full Data Model (secondary, on demand)
The complete set of tables from `Data_Model.md` (Events, Tasks, Documents, Photos, Memory, Family_Knowledge, etc.) serve as the **backup/deeper source**. The AI queries these only when AI_Memory alone isn't sufficient to answer a request well.

### Context Depth: Start Narrow, Expand as Needed
For any given request, the AI:
1. Starts with the **most focused context possible** — AI_Memory plus whatever's directly relevant to the current module/request.
2. Only pulls in **broader context** (other modules, deeper Data Model queries) if the focused context isn't enough to give a good answer.

This keeps typical responses fast and keeps the AI from over-reaching into data it doesn't need for a given task — which also limits unnecessary exposure to data outside the immediate permission scope of the request.

## The Three Roles: Separate Agents

Assistant, Advisor, and Guardian are implemented as **separate agent processes**, not one engine with mode-switching:

- **Assistant** — runs on-demand, responding to direct requests from a family member.
- **Advisor** — runs on-demand or triggered by context (e.g., generating a suggestion when relevant data changes), producing recommendations rather than direct answers.
- **Guardian** — runs on a schedule in the background, monitoring system and family health without being asked, using the smaller/faster model noted above.

All three route through the same central `/lib/core/ai` service (per `Application_Architecture.md`) for permission checks, outside-call approval, and logging — the separation is at the agent/process level, not in how they interact with the rest of the system.

## Shared Prompt Structure

Every AI interaction, regardless of which agent is running, is assembled from three stacked layers:

1. **Base Layer** (always included) — Family Rules, Core Principles, tone, and boundaries. This is what keeps every agent's behavior consistent with the household's values regardless of which role or module triggered it.
2. **Role Layer** — the specific instructions for whichever agent is running (Assistant vs. Advisor vs. Guardian), defining that role's purpose and how it should behave. Detailed in the respective `05_AI` docs.
3. **Context Layer** — the focused, request-specific data pulled from AI_Memory and (if needed) the full Data Model, per the "start narrow, expand as needed" approach above.

This structure means updating a family rule or core principle only requires editing the Base Layer once, rather than every module's AI prompts individually.

## AI Responsibilities (Engine-Level)

- Enforce permission scoping and outside-call approval before any request reaches Ollama or leaves the host, via `/lib/core/ai` (per `Security_Architecture.md`, `Application_Architecture.md`).
- Record `AI_Suggestion` entries with thumbs up/down feedback, and use that feedback to refine AI_Memory over time.
- Keep Guardian's background checks running on schedule without requiring user initiation.
- Log every AI interaction through the shared logging service.

## Dependencies

- Builds on `Technology_Stack.md`, `Security_Architecture.md`, `Data_Model.md`, and `Application_Architecture.md`.
- Feeds directly into `05_AI/Assistant.md`, `Advisor.md`, `Guardian.md`, `AI_Memory.md`, `AI_Suggestions.md`, and `Conversation_Rules.md`.

## Future Enhancements

- Formal benchmarking of Llama vs. Qwen (and specific model sizes) against actual host hardware, to be logged in `Decision_Log.md` once decided.
- Possible model specialization beyond Assistant/Advisor vs. Guardian if performance or quality demands it.
- More sophisticated confidence-decay logic for AI_Memory (e.g., facts that haven't been reinforced in a long time fading in priority).

## Questions

- Should AI_Memory facts ever be visible/editable by the family member they're about (e.g., a settings screen showing "what the AI knows about you"), or should this stay fully internal to the AI for now?
- For the Advisor role specifically — should it always require an explicit trigger (e.g., "new event added"), or can it also run on its own periodic schedule similar to Guardian?
