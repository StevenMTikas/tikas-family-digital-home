# Accessibility

## Purpose

Establishes baseline accessibility standards for Tikas Family Digital Home — contrast, keyboard/screen-reader support, text scaling, and how the existing Voice module contributes to accessibility, not just convenience. **WCAG 2.1 AA is the confirmed baseline for both desktop and mobile.**

## Goals

- Meet a recognized accessibility standard (WCAG 2.1 AA) as a baseline, rather than treating accessibility as an afterthought.
- Make sure `Design_Language.md`'s warm palette doesn't come at the cost of readable contrast — verify, don't assume.
- Recognize that Voice (`Voice.md`) already serves an accessibility purpose, not just a convenience one, and design with that dual role in mind.

## User Stories

- As a family member, I want text I can actually read comfortably, regardless of my eyesight.
- As a family member using voice, I want that to genuinely work as an alternative way to use the app, not just a novelty.
- As any user, I want the app to work with a screen reader if I need one, and to be navigable without relying on precise taps/clicks.

## Features

- **WCAG 2.1 AA as the baseline target, for both desktop and mobile.** Text contrast, focus indicators, and interactive element sizing aim to meet AA-level guidelines throughout, on both platforms — not just on marketing-style screens, and not a lighter standard for one platform versus the other.
- **Contrast audit against `Design_Language.md`'s palette.** The warm amber accent (`--color-accent`) in particular needs verification against the base background for any text-on-accent use — already flagged as an open item in `Design_Language.md`'s Future Enhancements, restated here as an accessibility requirement, not just a visual nice-to-have.
- **Keyboard and screen-reader support.** All interactive elements (buttons, forms, the Assistant chat bubble, quick actions) are reachable and operable via keyboard, with appropriate labels for screen readers — particularly important for the desktop experience (`Dashboard_Layout.md`'s desktop adaptation).
- **Text scaling.** The app respects system-level text size settings rather than fixing font sizes that can't be enlarged, consistent with `Design_Language.md`'s type scale being a starting point, not a hard limit.
- **Voice as an accessibility feature, not just a convenience one.** `Voice.md`'s tap-to-talk input and local text-to-speech output serve a real accessibility purpose for anyone who has difficulty typing or reading — this should inform how Voice is prioritized and tested, not just treated as a nice-to-have interaction mode.
- **Visible focus indicators.** Every interactive element shows a clear focus state when navigated via keyboard, not just on hover/tap.

## Screen Layout

- Not applicable directly — accessibility requirements apply across every screen already defined elsewhere, rather than introducing new screens of their own.

## Data Stored

- None — accessibility is an implementation standard, not a data concern.

## AI Responsibilities

- The Assistant should degrade gracefully for accessibility needs — e.g., if voice input/output is being used as an accessibility aid, responses should stay clear and well-structured for text-to-speech rather than assuming visual reading (per `Voice.md`, `Conversation_Rules.md`'s general tone guidance).

## Permissions

- None — accessibility standards apply uniformly regardless of role.

## Dependencies

- Builds on `Design_Language.md` (contrast/type scale, with the open audit item restated here), `Voice.md` (dual convenience/accessibility role), `Dashboard_Layout.md` (desktop keyboard navigation), and `Conversation_Rules.md` (Assistant tone/structure for text-to-speech).

## Future Enhancements

- Formal accessibility audit/testing pass once real screens exist, rather than relying on standards applied during design alone.
- Consider additional accommodations (e.g., high-contrast mode) if real usage or family needs reveal a gap beyond this baseline.

## Questions

None currently open.
