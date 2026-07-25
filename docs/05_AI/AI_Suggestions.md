# AI Suggestions

## Purpose

Defines the lifecycle and feedback mechanics of an individual AI suggestion — expiration, dismissal vs. thumbs-down, how feedback actually shapes future behavior, and what happens when a suggestion is accepted. This document complements `Advisor.md`, which covers *what* gets suggested, *where* suggestions display, and what triggers them — this document covers what happens to a suggestion *after* it exists, regardless of which agent (Advisor or Guardian, per `Advisor.md`'s cross-role triggering) created it.

## Goals

- Keep the suggestion list self-cleaning — expired, no-longer-relevant suggestions shouldn't linger and clutter the Dashboard or contextual views.
- Distinguish a neutral dismiss from an active thumbs-down, since they teach the AI different things.
- Let feedback genuinely shape tone and future suggestion quality over time, without hard-coded suppression rules that could make the system feel rigid or opaque.
- Make "accepting" a suggestion feel like real help (pre-filled, ready to review) while keeping a human as the final decision-maker for MVP.

## User Stories

- As a family member, I don't want to see suggestions that are no longer relevant just because no one got around to dismissing them.
- As a family member, I want a quick way to just clear a suggestion I don't care about, separate from telling the AI it was actually unhelpful.
- As a family member, when I accept a suggestion, I want it to take me somewhere useful with the details already filled in, so accepting actually saves me effort.
- As the Super Admin, I want feedback to genuinely shape how the AI behaves over time, not just sit in a database unused.

## Features

### Natural Expiration

- A suggestion **expires automatically** when it's no longer relevant — most commonly because its related event/date has passed, or another clear factor makes it moot (e.g., the task it referenced was completed through another path, the document it flagged was already categorized).
- Expired suggestions are removed from active display (Dashboard/contextual views) without requiring the user to dismiss them manually.
- Expiration is distinct from dismissal/feedback — an expired suggestion wasn't rejected, it just became irrelevant with time.

### Dismiss vs. Thumbs-Down

Two distinct, separate actions:

| Action | Meaning | Weight |
|---|---|---|
| **Dismiss** | Neutral — "not right now" / "not for me," no judgment on quality | Lighter signal |
| **Thumbs-down** | Active — "this wasn't a good/helpful suggestion" | Stronger negative signal than a dismiss |

Both clear the suggestion from active display; the difference is in what gets recorded and how strongly it factors into future behavior.

### How Feedback Shapes Future Behavior

- Feedback (thumbs-up, thumbs-down, dismiss) **informs tone and preference over time** via AI_Memory (per `AI_Architecture.md`, `AI_Memory.md`) — it does not trigger hard suppression rules (e.g., there's no fixed "3 thumbs-down = never show this category again" logic).
- A pattern of negative feedback on a particular type of suggestion should gradually make that type less likely to surface, as a natural consequence of the AI learning the person's preferences — not because of an explicit override rule.
- This keeps the system flexible: a person who thumbs-down document suggestions for a while but then genuinely wants one isn't permanently blocked from ever seeing that category again.

### Accepting a Suggestion (MVP Behavior)

- Accepting a suggestion **navigates the user to the relevant section** of the app (e.g., accepting a "set a reminder?" suggestion takes them to that event's reminder setting).
- The AI **pre-fills as much information as it reasonably can** in that section — potentially everything needed to complete the action.
- **The user always reviews before anything is finalized** — accepting a suggestion never silently completes an action on its own for MVP; it prepares the action and hands it to the human for a final look and confirmation.
- This is a deliberate MVP boundary consistent with the suggest-only constraint in `AI_Permissions.md` — the AI still isn't taking the action itself, it's making the human's job as easy as possible.
- **Commercial version:** more automated acceptance (e.g., accept = done, no review step) is worth exploring later — noted in Future Enhancements, not built for MVP.

### Equal Treatment Regardless of Origin

- For MVP, every `AI_Suggestion` is treated identically for lifecycle/feedback purposes **regardless of which agent created it** — whether it originated from Advisor's own logic or from a Guardian handoff (per `Advisor.md`'s cross-role triggering), it follows the same expiration, dismiss/thumbs-down, and acceptance behavior.
- Worth revisiting once real usage shows whether Guardian-originated suggestions behave differently in practice (e.g., different urgency expectations).

## Screen Layout

- Each suggestion, wherever displayed (Dashboard or contextual, per `Advisor.md`), shows three actions: **Accept**, **Dismiss**, and **Thumbs-down** (with thumbs-up as the positive counterpart when a suggestion is accepted or found helpful).
- No separate screen is needed for suggestion management — this is handled inline wherever a suggestion appears.

## Data Stored

Extends the existing **AI_Suggestion** entity (`Data_Model.md`) with lifecycle fields:

| Field | Notes |
|---|---|
| feedback | existing field — extend to support: thumbs_up / thumbs_down / dismissed / none |
| expired | new — boolean, set automatically when the suggestion is no longer relevant |
| expired_at | new |
| expired_reason | new — brief note on why (e.g., "related event passed," "task completed elsewhere") |
| accepted_at | new — when the user accepted and was routed to complete the action |

## AI Responsibilities

- Evaluates active suggestions for continued relevance and marks them expired automatically when conditions change (e.g., a linked event's date passes).
- Records feedback (thumbs-up/down/dismiss) and folds it into the relevant user's AI_Memory over time (per `AI_Memory.md`), without applying rigid suppression logic.
- When a suggestion is accepted, pre-fills the destination screen with as much relevant information as it can reasonably determine, while never finalizing the action without human review.

## Permissions

- No new permission concepts — suggestions and their feedback remain scoped to the user they were generated for, per the existing permission model (`Authorization.md`, `Folder_Permissions.md`).

## Dependencies

- Builds on `Advisor.md` (suggestion generation, triggers, display), `Guardian.md` (cross-role suggestion handoff), `AI_Memory.md` (where feedback ultimately gets folded in), and `Data_Model.md` (AI_Suggestion entity).

## Future Enhancements

- More automated acceptance in a commercial version (e.g., skipping the review step for certain low-risk suggestion types).
- Differentiated lifecycle/feedback handling for Guardian-originated vs. Advisor-originated suggestions, if usage reveals they warrant it.

## Questions

None currently open.
