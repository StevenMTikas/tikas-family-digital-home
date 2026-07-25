# Data Flow

## Purpose

Traces how data actually moves through Tikas Family Digital Home for several concrete, representative scenarios. Where other architecture docs describe components and rules in isolation (`Application_Architecture.md`, `AI_Architecture.md`, `File_Connector_Architecture.md`, `Security_Architecture.md`), this document walks through how those pieces work together for a real interaction, start to finish. This is a living document — expected to be updated as real usage patterns emerge.

## Goals

- Make the interactions between architecture pieces concrete rather than abstract.
- Surface any gaps or inconsistencies between the individual architecture docs by tracing them together.
- Give a fast reference for "what actually happens when X occurs," without re-deriving it from five separate documents each time.

## Scenario 1: Malachi Asks the Assistant a Question

1. Malachi opens the app on his phone (trusted device, logged in indefinitely per `Security_Architecture.md`) and types a question to the Assistant.
2. The frontend calls the shared API client (`/lib/api`), which hits the Assistant's route under `/app/api/`.
3. The route calls the central AI service (`/lib/core/ai`).
4. The AI service checks Malachi's permissions via `/lib/core/permissions` — the Assistant can only use data Malachi himself has access to.
5. The Assistant agent starts with the **narrowest context**: Malachi's AI_Memory plus whatever's directly relevant to the question.
6. If that's insufficient, it expands into the full Data Model (per `AI_Architecture.md`'s "start narrow, expand as needed" rule) — still scoped to Malachi's permissions.
7. If answering requires reaching outside the home network, the flow pauses: the AI presents exactly what it wants to send/request. Malachi can only approve this if he holds the "Approve Outside Calls" permission — which, per `Security_Architecture.md`, is off by default for a child's account. If he doesn't have it, the AI tells him directly that he lacks the required permission and names the admin to contact (e.g., *"You do not have the required permission to perform this task. Reach out to your admin, Dad."*). The task is not completed. In addition, a message is sent to the **Super Admin's Admin Dashboard** noting that the user attempted to reach outside the home network and was blocked — this is a passive notification for awareness, not an active escalation the admin must act on.
8. The response streams back to Malachi's screen.
9. The interaction is logged via `/lib/core/logging`.

## Scenario 2: Photo Syncs from Vee's Phone

1. At the scheduled daily sync time, Vee's phone connector wakes automatically in the background.
2. It scans its designated folders only (e.g., camera roll) — per `File_Connector_Architecture.md`, never the full device.
3. It detects a new photo added since the last sync and sends **metadata only** (filename, date, thumbnail, folder location) to the host via the Connector API.
4. The host creates a new Photo metadata record (per `Data_Model.md`), attributed to Vee as the owning User.
5. The actual image file stays on Vee's phone — it is not copied to the host at this point.
6. Next time anyone (with permission) opens the app and views that photo, the host requests the full file from Vee's phone connector on demand.
7. If the app prompts for categorization ("Who is in this picture?" / "Where was it taken?" / "What event is this from?"), those answers populate the Photo's tags/location/event fields.

## Scenario 3: Guardian Generates a Suggestion Overnight

1. On its background schedule, the Guardian agent runs independently of any user action (per `AI_Architecture.md`, using the smaller/faster model).
2. It reviews system and family health signals it has permission to see — e.g., upcoming events, task status, recent document uploads — through `/lib/core/permissions`, same as any other AI request.
3. It determines something's worth surfacing (e.g., an upcoming event with no reminder set) and generates a suggestion.
4. The suggestion is stored as an `AI_Suggestion` record (per `Data_Model.md`), linked to the relevant user(s).
5. A real-time notification is queued for delivery next time the relevant family member is active (see Scenario 5 for the notification path itself).
6. When the family member sees the suggestion on their Dashboard, they can respond with a thumbs up/down, which is written back to the `AI_Suggestion` record and feeds into refining that user's AI_Memory over time.

## Scenario 4: AI Requests Outside-Call Approval

1. Any agent (Assistant, Advisor, or Guardian) determines it needs to reach outside the home network to fulfill a task.
2. The request routes through `/lib/core/ai`, which checks whether the requesting user holds the **"Approve Outside Calls"** permission.
3. The AI presents the **specific data/content** it wants to send or request — never a generic "may I access the internet?" prompt (per `Security_Architecture.md`).
4. The approving user must already have access to the underlying data through their normal permissions — approval never grants new access, it only authorizes an outbound action on data they could already see.
5. If approved, the call is made, and the outcome (what was sent, when, by whom) is logged as a security event via `/lib/core/logging`.
6. If denied, or if the requesting user lacks the "Approve Outside Calls" permission entirely, no call is made. The AI tells the user directly that they lack the required permission and names the admin they should contact — e.g., *"You do not have the required permission to perform this task. Reach out to your admin, Dad."* The task does not complete. A message is also sent to the **Super Admin's Admin Dashboard** noting the attempt — this is passive awareness, not an active approval request; the blocked task stays blocked unless the user separately asks an admin to grant them the permission.

## Scenario 5: A Notification Reaches a Family Member

1. Something in the system determines a notification is needed — most commonly a Guardian/Advisor suggestion (Scenario 3), an event reminder (per `Data_Model.md`'s Event reminder field), or a security event relevant to that user (e.g., Vee being notified of activity on Malachi's account, per `Security_Architecture.md`).
2. The triggering module calls the notification path with the recipient, text, and (if applicable) a link back to the related `AI_Suggestion`.
3. **MVP delivers this in real time only** — the notification is pushed to the recipient's active session/device immediately; there is no persisted notification history yet (per `Data_Model.md`'s MVP scope note).
4. If the notification relates to a suggestion, the family member's thumbs up/down response (if given) is written back to the linked `AI_Suggestion` record.
5. *(Future, once notification history is built: the notification itself — time, text, liked/not — would also be persisted as its own record for later review.)*

## Scenario 6: Document Upload and Categorization

1. A family member uploads a document (Office file or PDF, per MVP scope) through the Documents module.
2. The upload is placed in a Folder, which determines its permission boundary (per `Data_Model.md`, `Security_Architecture.md`).
3. The AI (or the uploader manually) assigns a category (e.g., tax, medical, school) to the document.
4. That category is later used by the AI to power recommendations — e.g., surfacing a relevant document when it's contextually useful to a request, subject to the requesting user's permissions on that document's folder.

## Scenario 7: Vee Exercises Admin Scope Over Malachi's Account

1. Vee, holding scoped Admin access limited to Malachi's account (per `Security_Architecture.md`), opens the Administration module.
2. `/lib/core/permissions` confirms her admin scope covers the action she's attempting (e.g., adjusting a parental control setting, reviewing his activity log) — and would reject any attempt to act outside that scope (e.g., she cannot access Dad's private folders through this same admin path).
3. Any change she makes is logged as a security event, same as any permission or device change (per `Security_Architecture.md`'s logging requirements).
4. If her action affects Malachi's experience directly (e.g., a new restriction), it takes effect on his account immediately — no separate sync or delay.

## Dependencies

- This document consolidates and depends on all of `01_System_Architecture` — `System_Overview.md`, `Security_Architecture.md`, `Data_Model.md`, `Application_Architecture.md`, `AI_Architecture.md`, and `File_Connector_Architecture.md`. It introduces no new rules of its own; it only traces how the existing rules interact.

## Future Enhancements

- Add scenarios as real usage patterns emerge post-MVP (per your note — this doc is expected to grow over time rather than being finalized now).
- Once notification history is built, update Scenario 5 to reflect persisted records rather than real-time-only delivery.

## Questions

None currently open — update this section as new scenarios or edge cases surface.
