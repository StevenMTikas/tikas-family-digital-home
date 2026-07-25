# Cursor Project Rules

These rules are the constitution for every coding session on Tikas Family Digital Home. They are not suggestions. If a task conflicts with a rule, the rule wins — stop and raise the conflict rather than working around it.

## Family & Trust

1. **Never bypass permissions.** Not for convenience, not for debugging, not "just this once."
2. **AI must always obey folder permissions.** The AI has no special access beyond what the acting user is allowed.
3. **No feature should violate Family Rules.** Family_Rules.md outranks feature requests.
4. **Family data never leaves the local network without explicit, per-action consent.** This includes AI calls to any hosted/cloud model — local-first is the default, not the fallback.
5. **AI actions are always logged and explainable.** If the Assistant, Advisor, or Guardian did something, a family member can ask "why" and get a real, specific answer — never a black box.

## Reliability & Safety

6. **Offline first, internet by explicit user approval.** The Digital Home should keep working when the internet doesn't.
7. **Every destructive action is reversible.** Deletes are soft-deletes with a recovery window by default — not permanent, not immediate.
8. **Fail loud, not silent.** If monitoring, backups, or the AI itself fails, the family is notified. The system never just quietly stops working.
9. **Remote access never exposes the home server directly to the open internet.** Use a private network layer (e.g., Tailscale) — no open port-forwarding.

## Product Behavior

10. **Every screen supports voice where practical.**
11. **The dashboard should learn slowly.** Earn trust with quiet, correct suggestions before acting more boldly. No sudden, surprising behavior changes.
12. **Everything is modular.** A module should be understandable, testable, and removable on its own.

## Engineering Discipline

13. **Keep dependencies minimal.** Every new dependency is a liability a solo developer has to maintain forever. Prefer fewer moving parts (e.g., one language, one database) over marginal convenience.
14. **Dependencies are version-pinned.** No silent breaking changes from an update six months from now.
15. **Prioritize maintainability over cleverness.**
16. **Code should be readable by a solo developer months later.** If it needs a comment to explain *what* it does, rewrite it; comments are for *why*.
17. **Docs before code.** No feature is implemented until its module doc (Purpose → Questions) exists and is current. The docs are the source of truth, not an afterthought written after the fact.
18. **All timestamps are stored in UTC, displayed in family-local time.** No exceptions, no shortcuts — this bites you later in Calendar and Tasks.

## When in Doubt

If a request isn't covered by a rule above, default to the most cautious, most reversible, most transparent option — and ask before proceeding.
