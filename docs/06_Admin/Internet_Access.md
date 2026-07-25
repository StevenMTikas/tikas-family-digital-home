# Internet Access

## Purpose

Defines the Internet Access screen — a focused, actionable view of everything that reaches outside the home network: who holds outside-call permissions, which Standing Integration Connections (per `Security_Architecture.md`) are active, and recent outside-call activity. Where `Logs.md` is the full chronological security record, this screen is organized around *what's currently allowed to reach outside the home*, with the ability to act on it directly (revoke a connection, adjust a permission) rather than just review history.

## Goals

- Give the Super Admin one place to answer "what can leave this house right now, and who can make that happen?"
- Make revoking a Standing Integration Connection or an outside-call permission a direct action from this screen, not something requiring a trip through Users or Email separately.
- Keep this screen complementary to `Logs.md`, not a duplicate of it — this is current-state and action-oriented; Logs is historical record.

## User Stories

- As the Super Admin, I want to see at a glance who currently has "Approve Outside Calls" or the sensitive-data permission, and revoke it directly if needed.
- As the Super Admin, I want to see every active Standing Integration Connection (email accounts, weather) across the family, and revoke one directly if needed.
- As the Super Admin, I want a quick view of recent outside-call activity without opening the full Logs screen.

## Features

- **Outside-call permission holders.** A list of every user who currently holds `approve_outside_calls` and/or `approve_sensitive_outside_transmission` (per `Authorization.md`, `AI_Permissions.md`), with a direct revoke action. Since `approve_sensitive_outside_transmission` can never be granted to a minor, this list structurally can never include Malachi for that permission — reinforcing the rule visually, not just enforcing it silently.
- **Active Standing Integration Connections.** A list of every active connection under the Standing Integration Connection model (per `Security_Architecture.md`) — currently Email accounts (`Email.md`) per user, and the system-level Weather connection (`Dashboard.md`) — with a direct revoke action per connection.
- **Recent outside-call activity summary.** A condensed, recent-activity view of outside-call approvals/denials and blocked attempts (pulling from the same data `Logs.md` records), with a link to the full `Logs.md` screen for anything older or more detailed.

## Screen Layout

- **Permissions section:** table of users × outside-call-related permissions, each with a revoke control.
- **Connections section:** list of active Standing Integration Connections across the family, each showing user, service, connected date, and a revoke control.
- **Recent Activity section:** a short, recent-first list of outside-call approvals/denials/blocked attempts, with a "view full log" link into `Logs.md`.

## Data Stored

- No new entities — this screen composes existing data: the relevant User permission fields (`approve_outside_calls`, `approve_sensitive_outside_transmission`, per `Data_Model.md`), the `Email_Account` entity (per `Data_Model.md`, `Email.md`), and the same security event log data `Logs.md` displays (per `Security_Architecture.md`).

## AI Responsibilities

- None — this is a pure admin review/action screen. It reflects permission and connection state the AI already respects elsewhere (`AI_Permissions.md`, `Security_Architecture.md`); it doesn't introduce new AI behavior.

## Permissions

- **Super Admin only**, consistent with `Administration.md`'s existing rule that this kind of system-wide oversight isn't part of a scoped Admin's reduced view.
- Revoking a permission or connection from this screen uses the same underlying actions already defined elsewhere (`Authorization.md`'s permission management, `Email.md`'s connection revocation) — this screen is a faster entry point into those actions, not a new mechanism.

## Dependencies

- Builds on `Security_Architecture.md` (Standing Integration Connection model, outside-call approval rules), `Authorization.md` (permission fields), `Email.md` and `Dashboard.md` (the two current Standing Integration Connection types), `AI_Permissions.md` (sensitive-data gate), and `Logs.md` (shared underlying activity data).

## Future Enhancements

- As more Standing Integration Connection types are added (per `Future_Ideas.md`'s frontier-model candidate list), this screen's Connections section grows to include them without requiring redesign, since it's already built around the general Standing Integration Connection model rather than hardcoding Email/Weather specifically.

## Questions

None currently open.
