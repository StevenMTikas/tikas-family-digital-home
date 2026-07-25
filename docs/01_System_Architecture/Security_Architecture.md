# Security Architecture

## Purpose

Defines how Tikas Family Digital Home authenticates users, trusts devices, protects data, and governs the system's one deliberate opening to the outside world — the AI's outside-call approval flow. This document is the security source of truth; other docs (Permissions, AI_Permissions, Backup) should defer to it rather than redefine these rules.

## Goals

- Keep the system fully local and self-contained by default, with the outside world reachable only through a single, visible, permissioned door.
- Make trust explicit — a user, a device, and a permission are three separate things, and each must be granted deliberately.
- Keep the MVP simple (username/password, local-only, no in-transit encryption) while being honest about what would need to change for a commercial version.

## Authentication

- Family members log in with a **username and password**.
- On **trusted home devices**, sessions stay logged in indefinitely — no forced re-authentication.
- Password resets can only be performed by the **Super Admin (Dad)**, done manually. There is no self-service or email-based recovery flow in the MVP, since the system has no external email service by default.
- No separate authentication tier for Malachi — same username/password mechanism as any adult account. His restrictions are permission-based, not authentication-based (see Permissions and Parental Controls below).

## Device Trust

- A device (computer or phone) must be **explicitly added by an admin** through the Admin dashboard before its connector can talk to the host. There is no self-registration.
- Admins can **revoke** a device at any time from the dashboard — for example, a lost phone or a retired computer. A revoked device's connector immediately loses the ability to sync with the host.
- Device trust is separate from user login — a device being trusted does not itself grant a person any data access beyond what their account's permissions allow.

## Data Protection

- Data should be **encrypted whenever possible.** Concretely, for the MVP:
  - Data at rest (the SQLite database and stored files on the host) should be encrypted on disk where practical.
  - Data in transit between connectors/phones and the host is **not encrypted for MVP**, since it never leaves the home network.
  - If this system is ever developed into a commercial or cloud-facing product, **all data — at rest and in transit — would need to be encrypted**, and the local-network exception above would no longer apply.
- Backups are stored **locally for now**; cloud backup storage is a planned future enhancement, at which point backup encryption becomes mandatory rather than optional (see `Backup.md`).

## The Outside-Call Approval Flow

This is the system's one deliberate opening to the internet, and it works the same way regardless of which module triggers it:

1. The AI determines it needs to make a call outside the home network to fulfill a request.
2. Before making the call, it presents the requesting user with **exactly what it's about to send or request** — not a generic "may I access the internet?" prompt, but the specific data/content involved.
3. The user reviews and approves or denies.
4. The call is only made after explicit approval, and only by a user who holds the **"Approve Outside Calls"** permission (see Permissions below).

**Approval is scoped to what the approving user can already see.** A user can only approve sending a piece of data outside if they already have access to that data through their normal permissions. For example: Malachi cannot approve sending a tax document stored in one of Dad's private folders, even if he holds the outside-call permission in general — because he doesn't have access to that file in the first place. Approval never grants new data access; it only authorizes an outbound action on data the approver could already see.

## Standing Integration Connections (Distinct from AI-Initiated Outside Calls)

The outside-call approval flow above governs **AI-initiated** requests — the AI deciding, on its own, that it needs to send or fetch something outside the home. A separate category exists for **user-initiated, standing connections to an external service** — e.g., a weather source, or a family member's personal email account (see `Email.md`, `Dashboard.md`).

- A Standing Integration Connection is set up explicitly by the user connecting that specific service (e.g., linking their own email account). **The act of connecting itself is the consent** — there is no separate "Approve Outside Calls" permission gate for this category, and no per-instance approval prompt for each subsequent fetch.
- This is available to **any user, including a minor**, since it applies to that user's own account/data (e.g., Malachi connecting his own email) — it is not the same as the general "Approve Outside Calls" permission, which stays off by default for a child.
- Each Standing Integration Connection is scoped narrowly to the specific service it was set up for — connecting email doesn't grant any broader outside-call ability, and vice versa.
- Every fetch through a Standing Integration Connection is still logged as a security event, and the connection can be revoked by the user (or an admin) at any time, immediately stopping further access.
- **Content pulled in through a Standing Integration Connection can still be treated as sensitive** for what happens to it *afterward* — e.g., email content is treated as sensitive by default (per `Email.md`), meaning if the AI wants to take a further outside-bound action using that content (such as the photo-extraction pattern in `Assistant.md`), that subsequent step still requires the sensitive-data gate and remains unavailable to a minor's account, even though the initial connection itself was allowed.



Full detail lives in `04_Permissions`; this is the subset that's security-critical:

- **Super Admin (Dad):** full technical and family control, including password resets, device management, and permission grants.
- **Admin, scoped (Vee):** full admin control over Malachi's account and data; standard access otherwise.
- **Basic User (Malachi):** standard access to his own data and whatever else his permissions allow.
- **"Approve Outside Calls"** is a distinct, opt-in permission, independent of role:
  - Off by default for every account, including adults.
  - **Off by default for a child's account specifically, as a standing rule** — not something a family admin is expected to turn on casually for a minor.
  - Must be explicitly granted (or later revoked) by a family admin, at account setup or any time after.

## Security Event Logging

The following events are logged and visible to Dad (Super Admin), and to Vee for anything related to Malachi's account:

- Logins (and failed login attempts)
- Password resets
- Device additions and revocations
- Permission grants and changes (including "Approve Outside Calls")
- Every outside-call approval or denial — who approved it, what was sent, and when
- Every **blocked attempt** to reach outside the home network by a user who lacks the "Approve Outside Calls" permission — the user is told they lack the permission and who to contact, and the Super Admin receives a passive notification of the attempt on their Admin Dashboard (awareness only, not an active approval request)

This logging is the security backbone the Guardian and Admin Monitoring modules build on — it belongs here because it's a security requirement first, a monitoring feature second.

## Suggested Parental Control Rules (Starting List)

These are starting points for the future `Parental_Controls` module — flagged here because several are security-adjacent (they touch permissions and outside-call behavior directly). To be expanded when that module is designed:

- **No "Approve Outside Calls" by default** for a child's account (already established above).
- **Notify Vee** (and/or Dad) when Malachi's account triggers certain sensitive actions — e.g., an outside-call request, even if he can't approve it himself.
- **Time-of-day usage limits** or quiet hours, configurable per child.
- **Visibility, not secrecy:** Malachi's activity within the system (logins, requests, AI interactions) is visible to Vee/Dad, and this is a known, disclosed part of how the system works for his account — not hidden monitoring.
- **Content-type restrictions:** ability to flag certain document/photo categories as requiring admin review before Malachi's account can access or share them.
- **Graduated trust:** since he's a mature teen, permissions could be designed to expand over time (an admin-adjustable "trust level") rather than being fixed at a single restrictive default indefinitely.

## Dependencies

- Builds on `Technology_Stack.md` (SQLite, Ollama, Next.js) and `System_Overview.md` (host/connector boundary).
- Feeds directly into `04_Permissions/AI_Permissions.md`, `06_Admin/Monitoring.md`, `06_Admin/Logs.md`, and the future `Parental_Controls` module.

## Future Enhancements

- Full encryption in transit and at rest if the system moves toward a commercial/cloud-facing product.
- Cloud backup storage with mandatory encryption.
- Self-service or email-based password recovery, once/if the system has a way to reach users outside the app itself.
- Expanded parental controls, designed in detail in the future Parental_Controls module.

## Questions

- Should there be a maximum number of trusted devices per user, or is device count left unrestricted for now?
- For "encrypted whenever possible" at rest — is there a specific encryption approach you'd prefer investigated first (e.g., full-disk encryption on the host vs. database-level encryption), or should that be a technical decision made during implementation?
