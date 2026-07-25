# Dashboard Layout

## Purpose

Provides the detailed visual and responsive layout specification for the Dashboard — exact section ordering, visual hierarchy, and how the layout adapts between mobile and desktop. `Dashboard.md` already defines *what* appears on the Dashboard (Morning Briefing, weather, suggestions, quick actions, Family Dashboard link); this document defines precisely *how it's arranged*, so it doesn't duplicate that content.

## Goals

- Give the Dashboard a clear, scannable visual hierarchy — the most time-sensitive information should be the easiest to see first.
- Make the mobile-to-desktop adaptation a genuine responsive layout, not two disconnected designs, consistent with `Navigation.md`'s "same structure, different presentation" approach.
- Keep the layout calm and uncluttered, honoring `Core_Principles.md`'s "reduce complexity, don't add to it."

## User Stories

- As a family member, I want the most important thing (today's schedule) to be the first thing I see, with everything else clearly secondary.
- As a family member, I want the Dashboard to feel equally natural whether I'm on my phone or a larger screen.

## Features

- **Top-to-bottom section order (mobile):**
  1. Weather (small, glanceable, top corner or banner — not dominant)
  2. Morning Briefing content (today's events, tasks due) — the primary focus
  3. Suggestions area (up to 10, per `Advisor.md`)
  4. Quick-action shortcuts
  5. Family Dashboard link (clearly visible, not buried at the very bottom)
- **Desktop adaptation:** the same five elements arranged in a wider, multi-column layout rather than a single vertical stack — e.g., Morning Briefing content as the largest, most prominent column, with weather, suggestions, and quick actions arranged alongside rather than stacked below. Same content, same relative priority, different use of available width.
- **Visual hierarchy:** Morning Briefing content is visually largest/most prominent; weather and quick actions are visually smaller/lighter-weight, supporting the "glanceable, not primary" role defined for them in `Dashboard.md`.
- **Consistent spacing/density.** Enough whitespace between sections that the Dashboard reads as organized sections, not one dense block — directly supporting `Dashboard.md`'s "stay scannable, don't overwhelm" principle.

## Screen Layout

*(This document's Features section above **is** the screen layout specification — restated here only to confirm it sits below `Navigation.md`'s tab bar/sidebar and above no other chrome, i.e., the Dashboard is the content area within the app's standard navigation frame, not a full-screen takeover.)*

## Data Stored

- None — this is a pure layout/presentation document with no data implications beyond what `Dashboard.md` already defines.

## AI Responsibilities

- None — layout doesn't affect AI behavior; it only affects how existing AI-generated content (suggestions) is visually arranged.

## Permissions

- None beyond what's already defined in `Dashboard.md` — this document doesn't change who sees what, only how it's arranged for whoever sees it.

## Dependencies

- Builds directly on `Dashboard.md` (content/features this layout arranges) and `Navigation.md` (the surrounding nav frame this layout sits within).

## Future Enhancements

- User-customizable section ordering, if a fixed order proves too rigid once real usage patterns emerge (echoes the same future item already noted in `Dashboard.md`).

## Questions

None currently open.
