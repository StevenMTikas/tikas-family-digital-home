# Design Language

## Purpose

Establishes the visual identity for Tikas Family Digital Home — color palette, typography, shape/spacing language, and motion principles — so every screen feels like one coherent product rather than a collection of separately-designed features. Deliberately avoids generic "AI-generated" design defaults (cream-and-terracotta, near-black-and-neon, broadsheet-with-hairlines) in favor of choices specific to this product's actual identity: a warm, dependable presence in the home, not a piece of software performing warmth.

## Goals

- Make the app feel like the "dependable household member" described in `Vision.md` — warm and approachable, not clinical or corporate.
- Keep the calendar's per-person colors (blue/purple/red, `Calendar.md`) as a self-contained system — the app's own palette must work well alongside them without competing, and must generalize cleanly to other families' color choices in a future commercial release.
- Take one real, specific point of view rather than defaulting to safe, forgettable choices.

## User Stories

- As a family member, I want the app to feel warm and calm, not sterile or overly "techy."
- As a family member, I want the interface to feel consistent everywhere I go in the app.
- As the Super Admin, I want a design system generic enough that another family, with their own calendar color choices, wouldn't feel like they're using "someone else's app."

## Features

### Color Palette

The concept: **warm evening light in a home that's actually lived in** — not a sterile "smart home" aesthetic, and deliberately not the cream/terracotta combination that's become a generic AI-product tell. The base leans slightly warm-gray rather than cream; the primary accent is a muted amber/honey (lamplight, not orange-alert), balanced by a deep warm plum for trust/depth, with a quiet sage as a sparingly-used tertiary.

| Token | Hex | Role |
|---|---|---|
| `--color-base` | `#F6F3EE` | Page background — warm off-white, softer and grayer than a cream/parchment default |
| `--color-surface` | `#FFFFFF` | Card/panel surfaces, for gentle lift off the base |
| `--color-ink` | `#3A342C` | Primary text — warm charcoal, not pure black |
| `--color-ink-muted` | `#6B6055` | Secondary text, captions, timestamps — darkened from `#7A6F60` during design review; the original failed WCAG AA (~4.4:1) against `--color-base`, this passes (~5.5:1) |
| `--color-accent` | `#C98A3E` | Primary accent — muted amber/honey; used for primary actions, active states |
| `--color-accent-strong` | `#9C6A2E` | Same hue family as `--color-accent`, for any filled control with a white label (Accept, Save, Add, primary CTAs) — `--color-accent` fails WCAG AA for white text (~2.9:1), this passes (~4.66:1) |
| `--color-trust` | `#4B3F5E` | Secondary accent — deep warm plum; used for Guardian/security-related UI, headers, emphasis |
| `--color-calm` | `#7A8B6F` | Tertiary accent — quiet sage; used sparingly for success states, positive confirmations |
| `--color-urgent` | `#B23A3A` | Reserved for Guardian's urgent alerts only (`Notifications.md`, `Guardian.md`) — never used decoratively |

This palette is intentionally separate from the calendar's per-person colors — nothing here competes with blue/purple/red, and none of these five tokens should ever be reassigned as a person's calendar color.

### Typography

- **Display face:** a warm, humanist slab-serif (e.g., in the family of Fraunces or Tiempos) — used with restraint, for the app name, section headers, and the Morning Briefing's greeting. Carries the "dependable, established" feeling without tipping into the generic high-contrast-serif-on-cream look.
- **Body face:** Public Sans — settled from the earlier "Inter or Public Sans" open choice once the design handoff used Public Sans throughout; a rounded-but-legible humanist sans with slightly softened letterforms, used for all body text, labels, and controls. Approachable without being childish.
- **Utility face:** the body face's own tabular/mono-adjacent numerals for timestamps, counts, and data (weather, task counts) — no separate monospace face needed for MVP.

### Shape & Spacing

- **Rounded, not sharp.** Cards, buttons, and inputs use generous corner radii (12–16px) — reinforcing "warm and approachable" over "clean and minimal." This is a deliberate departure from the sharp-edged, broadsheet-style default.
- **Generous whitespace.** Consistent with `Dashboard_Layout.md`'s "calm, scannable, not overwhelming" principle — spacing errs toward more breathing room, not density.
- **Soft elevation, not hard shadows.** Cards lift off the background with a soft, diffuse shadow (low opacity, large blur) rather than a crisp drop shadow — reinforcing softness over sharpness.

### Motion

- **Quiet by default**, consistent with the AI's own "stays in the background" principle (`Core_Principles.md`). Transitions are short and subtle (150–200ms), used to orient (e.g., a suggestion sliding in) rather than to entertain.
- **One deliberate moment, not scattered effects.** If there's a signature motion moment, it's the Morning Briefing's content gently settling into place on open — a single, calm arrival, not a page full of independently animated elements.

### Signature Element

A soft, radial **"warm glow"** treatment — a gentle amber gradient bloom, used once per screen at most, behind the single most important element (e.g., behind the Morning Briefing's greeting, or behind an urgent Guardian alert's icon in a restrained way that doesn't compete with `--color-urgent`). This is the one place the palette's warmth becomes literal light — used sparingly enough to stay a signature, not a pattern.

## Screen Layout

- Not applicable directly — this document defines the tokens and principles other layout documents (`Dashboard_Layout.md`, future screen-specific layouts) apply.

## Data Stored

- None — this is a design specification, not a data document.

## AI Responsibilities

- None — purely visual/design guidance.

## Permissions

- None — applies uniformly across the entire app regardless of role.

## Dependencies

- Informs every screen and module doc going forward, particularly `Dashboard_Layout.md`, `Navigation.md`, and any future UI work in `03_User_Experience` and beyond.
- Respects the existing calendar color system (`Calendar.md`) as a separate, protected palette.

## Future Enhancements

- **Dark mode.** Explicitly deferred — MVP is light-mode only, but dark mode is planned and should be designed as a true second palette (not just inverted values) when it's tackled, to preserve the warm feeling rather than defaulting to a cold dark theme.
- Accessibility contrast audit once real screens exist (the amber accent in particular should be checked against `--color-base` for text-on-accent use cases).

## Questions

None currently open.
