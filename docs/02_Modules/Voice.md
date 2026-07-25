# Voice

## Purpose

Defines the Voice module — tap-to-talk input and, if feasible locally, spoken output, scoped to the Assistant for MVP. Wake-word activation and app-wide voice support are explicitly noted as future direction, not built now.

## Goals

- Keep MVP voice interaction simple and privacy-respecting: tap-to-talk only, no always-listening microphone.
- Stay local-first for processing, consistent with the rest of the system's privacy stance — accept weaker performance in noisy conditions for now rather than reaching outside the home by default.
- Scope MVP tightly to the Assistant, while keeping the door open to the "every screen supports voice where practical" principle from `Cursor_Project_Rules.md` as a real future direction, not an afterthought.

## User Stories

- As a family member, I want to press a button and speak to the Assistant, rather than typing.
- As a family member, I want the Assistant to speak its response back to me, when that's feasible.
- As a family member, I want my house to not be listening for a wake word all the time in this first version.
- As the Super Admin, I want voice kept local for MVP so we can see how well it performs before considering an outside fallback.

## Features

- **Tap-to-talk activation.** The user presses a button to start speaking; there's no passive listening or wake-word detection in MVP.
- **Local speech-to-text.** Voice input is transcribed using local processing (via the host's AI stack, per `AI_Architecture.md`) — no outside call for MVP, consistent with `Future_Ideas.md`'s note that noisy-condition transcription is a *future* candidate for an outside frontier model, not a current one.
- **Local text-to-speech, if feasible.** If local text-to-speech can produce acceptable quality on the host hardware, the Assistant speaks its response back, not just displaying text. If local quality proves poor, this degrades gracefully to text-only output rather than blocking the feature (see Questions).
- **Assistant-only scope for MVP.** Voice input/output is available within the Assistant's chat interface (`Assistant.md`) only — not yet wired into other screens/modules.
- **Future direction, explicitly noted:** a user-configurable wake word for hands-free activation, and expanding voice support app-wide per `Cursor_Project_Rules.md`'s "every screen supports voice where practical" principle — both are real planned directions, not abandoned ideas (see Future Enhancements).

## Screen Layout

- **Within the Assistant chat interface** (per `Assistant.md`'s persistent chat bubble and panel): a tap-to-talk microphone control alongside the existing text input.
- While speaking/listening, a clear visual indicator shows the app is actively capturing audio (and stops immediately when the button is released or tapped again) — reinforcing that this is deliberate, tap-initiated input, not passive listening.
- If text-to-speech is enabled, a simple control to mute/replay the spoken response, without requiring the user to dig into settings.

## Data Stored

- No new entities. Voice input becomes a standard Assistant **Message** (per `Data_Model.md`'s Conversation/Message entities from `Assistant.md`) once transcribed — voice itself isn't persisted as audio, only the resulting text.

## AI Responsibilities

- Transcribes tap-to-talk input locally, then hands it to the Assistant agent exactly as if it were typed — no special-cased AI behavior beyond the input method itself.
- If text-to-speech is enabled, converts the Assistant's text response to speech locally before/alongside displaying it.
- Follows the same permission, logging, and outside-call rules as any other Assistant interaction (per `Assistant.md`, `AI_Architecture.md`) — voice is an input/output method, not a separate permission scope.

## Permissions

- No new permission concepts — voice interaction with the Assistant follows the same permission model as typed interaction with the Assistant (per `Assistant.md`).

## Dependencies

- Builds on `Assistant.md` (scope, chat interface), `AI_Architecture.md` (local model, streaming), `Data_Model.md` (Conversation/Message entities), and `Cursor_Project_Rules.md` (the "every screen supports voice where practical" principle this module partially fulfills and partially defers).

## Future Enhancements

- **User-configurable wake word**, for hands-free activation in a commercial release — explicitly planned, not just theoretical.
- **App-wide voice support**, expanding beyond the Assistant to other screens/modules, fulfilling `Cursor_Project_Rules.md`'s "every screen supports voice where practical" principle more fully than MVP does.
- **Outside-call fallback for noisy-condition transcription**, if local-only processing proves insufficient in practice — already flagged in `Future_Ideas.md` as a frontier-model candidate.

## Questions

- If local text-to-speech quality turns out to be poor on the host hardware, is text-only output an acceptable MVP fallback, or is spoken output important enough to be a blocking requirement worth revisiting hardware/model choices for?
