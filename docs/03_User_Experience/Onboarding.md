# Onboarding

## Purpose

Defines onboarding for two distinct cases: the very first Super Admin setup (before any household exists in the system) and a new family member's first login (already covered step-by-step in `User_Flows.md`). For MVP, both drop the person straight into existing screens with no guided walkthrough — this document establishes that as a deliberate MVP choice, not an oversight, and flags a guided walkthrough as a real requirement for any future or commercial release.

## Goals

- Keep MVP onboarding honest and simple: no walkthrough, just the existing screens used in sequence.
- Clearly mark guided onboarding as a real future requirement — not a "someday maybe," but something that will need to be properly specified before any release beyond this one family.

## User Stories

- As the Super Admin, I want to be able to set up the household using the screens that already exist, without waiting on a polished setup wizard.
- As a new family member, I want to land on my Dashboard right after my first login, without an unnecessary tour getting in my way.
- As the Super Admin, I want it clearly noted that a real walkthrough will be needed before this could go to other families, so it isn't forgotten.

## Features

- **No guided walkthrough for MVP.** Neither the Super Admin's initial setup nor a new family member's first login includes a tour, tooltip sequence, or wizard for MVP.
- **Super Admin initial setup uses existing screens in sequence:** the host application starts, the Super Admin account exists as the first identity on the host device, then the Super Admin proceeds through **Add User** (`Users.md`, `Administration.md`) for each family member — that alone is enough for a family member to log in and use the app, per `Authentication.md`'s correction note (login is username/password only for MVP, not device-gated). **Folder Management** (`Folder_Management.md`) is optional, only if any non-default folder setup is needed. **Device Management** (`Security_Architecture.md`) is a separate, also-optional step for pairing a family member's computer as a **file connector** (`File_Connector_Architecture.md`) — it has nothing to do with whether that person can log in.
- **New family member's first login** follows exactly the flow already defined in `User_Flows.md`'s "First Login" scenario — straight to the Dashboard, no tour.
- **Future guided walkthrough — explicitly planned, not yet specified.** A real onboarding walkthrough (for both the Super Admin's initial setup and a new family member's first experience) is marked as required before any future or commercial release, with actual content/steps to be spec'd out later as its own effort (see Future Enhancements).

## Screen Layout

- None new for MVP — onboarding reuses the existing Add User, Folder Management, Device Management, and Login/Dashboard screens already defined elsewhere, in the sequence described above.

## Data Stored

- None new — onboarding doesn't introduce new entities, only a sequence of existing actions.

## AI Responsibilities

- None — no AI-guided onboarding for MVP. A future walkthrough might reasonably involve the Assistant introducing itself, but that's explicitly deferred, not designed here.

## Permissions

- None new — the Super Admin setup sequence and new-user first login both rely entirely on permission rules already defined in `Authorization.md` and `Security_Architecture.md`.

## Dependencies

- Builds on `Users.md`, `Administration.md`, `Folder_Management.md`, `Security_Architecture.md`, `Authentication.md`, and `User_Flows.md`'s First Login scenario.

## Future Enhancements

- **A real guided walkthrough** for both first-time Super Admin setup and a new family member's first login — explicitly required before any release beyond this one family, not optional polish. Full content and step sequence to be spec'd out as its own dedicated effort when that time comes.
- Possible Assistant-led onboarding ("let me show you around") once the walkthrough itself is designed.

## Questions

None currently open.
