# Email

## Purpose

Defines the Email module — a lightweight, per-user email connection that surfaces useful summary information (unread count, flagged-important count, a link to open the message) rather than a full email client. Uses the **Standing Integration Connection** model (`Security_Architecture.md`) rather than the AI-initiated outside-call approval flow, since the user connecting their own email account is itself the consent.

## Goals

- Give a genuinely useful at-a-glance email summary without rebuilding a full email client — consistent with "reduce complexity, don't add to it" (`Core_Principles.md`).
- Let any family member, including a minor, connect their own personal email account, since it's their own data — while still treating email content as sensitive for anything that happens with it afterward.
- Keep MVP scope disciplined: one account per user, summary-level info only, no compose/send.

## User Stories

- As a family member, I want to see at a glance how many unread emails I have and how many look important, without opening my email app.
- As a family member, I want a direct link to open a flagged-important email in my actual email provider.
- As Malachi, I want to be able to connect my own email the same way anyone else can, since it's my own account.
- As the Super Admin, I want confidence that email content is still handled carefully even though connecting an account doesn't require the usual outside-call approval.

## Features

- **Read-only summary, not a full client.** Shows total unread count, a count of messages flagged as likely important, and links to open a specific message in the user's actual email provider — no in-app compose, send, reply, or full inbox browsing for MVP.
- **Standing Integration Connection.** Connecting an email account uses the model defined in `Security_Architecture.md`: the user's act of connecting is the consent, no separate "Approve Outside Calls" permission or per-fetch approval prompt is required — available to any user, including a minor, since it's their own account.
- **One account per user for MVP.** Each family member can connect a single personal email account. Support for multiple accounts per user is a planned future upgrade (see Future Enhancements).
- **"Important" flagging via local AI.** The determination of which unread messages look important is made locally (via Ollama, per `AI_Architecture.md`) — this doesn't require an outside frontier-model call the way photo extraction does, since it's a lighter classification task on already-fetched summary data.
- **Sensitive by default, same as photo extraction.** Email content is treated as sensitive by default (per `AI_Permissions.md`). This doesn't block the initial connection or summary (that's covered by the Standing Integration Connection model above), but it does mean: if the AI ever wants to take a further outside-bound action using something found in an email (e.g., extracting an event mention and sending it to an outside frontier model, similar to `Assistant.md`'s photo-to-event pattern), that specific step requires the sensitive-data outside-transmission gate — and remains unavailable to a minor's account, even though connecting the email itself was allowed.

## Screen Layout

- **Email summary card** (likely surfaced on the Dashboard or within this module's own screen): unread count, important count, and a short list of the flagged-important messages with subject/sender and a link to open in the user's actual email provider.
- **Connect Email Account:** a simple setup flow where a user links their personal email account — the connecting action itself serves as consent, per the Standing Integration Connection model.
- No inbox browsing, compose, or reply screens for MVP.

## Data Stored

**New: Email_Account** (the Standing Integration Connection record for this service)

| Field | Notes |
|---|---|
| id | |
| user_id | one per user for MVP; multiple accounts per user planned for future |
| provider | |
| email_address | |
| status | connected / revoked |
| connected_at | |

- No raw email content is persisted — the unread/important summary is fetched and displayed live, similar to how `Dashboard.md`'s weather widget doesn't persist weather data as a lasting family record.

## AI Responsibilities

- Classifies unread messages as likely important using the local AI model, not an outside frontier model, for MVP.
- Treats any email-derived content as sensitive by default for any further outside-bound action (per `AI_Permissions.md`), even though the initial read/summary itself doesn't require the sensitive-data gate.
- Does not autonomously act on email content (e.g., auto-creating a task or event from an email) for MVP — any such action would go through the same suggest-only, human-review pattern as the rest of the system (per `AI_Suggestions.md`), not automatically.

## Permissions

- **Connect/view own email summary:** any user, including a minor — governed by the Standing Integration Connection model, not the general permission system.
- **Any further outside-bound use of email content:** requires the sensitive-data outside-transmission gate (per `AI_Permissions.md`), unavailable to a minor's account.
- **Revoke:** the connecting user, or an admin, can revoke an Email_Account connection at any time.

## Dependencies

- Builds on `Security_Architecture.md` (Standing Integration Connection model), `AI_Permissions.md` (sensitive-by-default handling), `AI_Architecture.md` (local classification), and `AI_Suggestions.md` (suggest-only pattern for any follow-on action).

## Future Enhancements

- Support for multiple email accounts per user.
- Possible AI-suggested actions derived from email content (e.g., "this looks like an event — add it to your calendar?"), following the same Advisor suggestion pattern used elsewhere, once the sensitive-content handling above is well-tested.
- Full inbox browsing or reply capability, if ever warranted — not currently planned, since the intent is a lightweight summary, not a full client.

## Questions

None currently open.
