# User Flows

## Purpose

Traces the step-by-step screen-to-screen paths a family member takes through representative tasks in the app — first login, everyday actions (add event, upload a photo), using the Assistant, and admin-specific flows. Where `Data_Flow.md` traces how data moves through the system's architecture, this document traces what the *person* actually taps through, screen by screen. Like `Data_Flow.md`, this is a living document, expected to grow as more screens are designed.

## Goals

- Make sure every flow feels consistent with `Navigation.md`'s structure and `Design_Language.md`'s tone — calm, uncluttered, never more steps than necessary.
- Surface any friction or missing steps before real screens get built, the same way `Data_Flow.md` surfaced gaps in the architecture.
- Give a fast reference for "how does someone actually get from A to B," without re-deriving it from individual module docs each time.

## User Stories

- As a new family member, I want my first login to be simple, even though it only works from a device an admin already added.
- As a family member, I want adding an event or task to take just a few taps from wherever I am.
- As a family member, I want uploading a photo to feel quick, even with the AI asking me a couple of questions.
- As the Super Admin, I want adding a new family member to be a straightforward, guided form.

## Features (Representative Flows)

### 1. First Login (New User, Trusted Device)

1. Super Admin creates the account via **Add User** (`Users.md`) and adds the family member's device (`Security_Architecture.md`'s device trust model), giving them the initial username/password.
2. On that trusted device, the family member opens the app and lands on the **login screen** (`Authentication.md`) — username and password only, no other fields.
3. On successful login, they land on their **Dashboard** (`Dashboard.md`), showing the Morning Briefing.
4. Session stays logged in indefinitely on this device — no further login screens unless signed out manually.

### 2. Adding an Event

1. From the **Dashboard**, tap the **Add event** quick action (`Dashboard.md`), or navigate to **Calendar** (`Navigation.md`) and tap add directly.
2. Fill the **Add Event** form (`Calendar.md`): title, description, date/time, assign to family member(s), visibility (public by default), reminder lead time.
3. Confirm — event appears on the shared weekly calendar, color-coded to the creator (`Calendar.md`'s per-person colors).

### 3. Uploading a Photo

1. From **Content → Photos** (`Navigation.md`, `Photos.md`), tap upload and select a photo.
2. The AI prompts: *"Who is in this picture?" / "Where was it taken?" / "What event is this from?"* (`Photos.md`).
3. User answers what they know (can skip any question) — tags, location, and event link populate accordingly.
4. User sets visibility (public by default) and sensitivity (off by default) — confirm.
5. Photo appears in the shared gallery, visible to the family unless marked private.

### 4. Using the Assistant (Text or Voice)

1. Tap the **persistent chat bubble** (`Assistant.md`), available from any screen.
2. Type a question, or tap-to-talk (`Voice.md`) and speak it.
3. Assistant responds — streamed text, and spoken aloud if local text-to-speech is enabled (`Voice.md`).
4. If the Assistant needs a clarifying detail, it asks — otherwise it answers directly (`Assistant.md`).
5. Conversation is saved automatically to the chat history sidebar for that user (`Assistant.md`).

### 5. Connecting Email (Standing Integration Connection)

1. From **AI Settings** or **Email** (`AI.md`, `Email.md`), tap **Connect Email Account**.
2. User authorizes their personal email account — this act of connecting is itself the consent (`Security_Architecture.md`'s Standing Integration Connection model) — no separate approval prompt.
3. Returns to the app; the Email summary card now shows unread/important counts and links to open specific messages.

### 6. Admin: Adding a New Family Member

1. Super Admin opens **Administration → Add User** (`Administration.md`, `Users.md`).
2. Fills the required fields: name, relationship, date of birth, initial username/password, role.
3. If the new member is a child, Super Admin optionally assigns admin_scope to a parent (`Authorization.md`).
4. Super Admin adds the family member's device (`Security_Architecture.md`) so they can log in.
5. New account is ready — family member proceeds through the First Login flow above.

### 7. Reviewing and Acting on an Advisor Suggestion

1. Suggestion appears on the **Dashboard** (up to 10) or contextually within a module (up to 2), per `Advisor.md`'s display rules.
2. User can **Accept** (routes to the relevant screen, pre-filled, for review before confirming — `AI_Suggestions.md`), **Dismiss** (neutral), or **thumbs-down** (negative feedback).
3. If accepted, user reviews the pre-filled screen and confirms — nothing saves automatically without this review step.

## Screen Layout

- Not applicable directly — each flow above references the screens already defined in their respective module docs; this document sequences them rather than designing new screens.

## Data Stored

- None new — every flow operates on entities already defined across `Data_Model.md`.

## AI Responsibilities

- None new — flows reflect existing AI behavior (Assistant, Advisor, photo-tagging prompts) as already defined in their respective documents.

## Permissions

- None new — every flow respects the permission model already established (`Authorization.md`, `Folder_Permissions.md`); this document doesn't introduce new access rules, only sequences of screens.

## Dependencies

- Builds on and sequences `Authentication.md`, `Dashboard.md`, `Calendar.md`, `Photos.md`, `Assistant.md`, `Voice.md`, `Email.md`, `Administration.md`, `Users.md`, `Advisor.md`, and `AI_Suggestions.md`.

## Future Enhancements

- Add more flows as additional screens are designed (e.g., Family Knowledge item creation, Memory creation, password entry management) — this document is expected to grow, similar to `Data_Flow.md`.

## Questions

None currently open.
