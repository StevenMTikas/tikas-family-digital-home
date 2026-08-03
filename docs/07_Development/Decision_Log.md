# Decision Log

Purpose: a lightweight record of significant technical and product decisions, and the reasoning behind them, so a solo developer doesn't have to reconstruct "why did I do it this way?" months later. Add a new entry any time a meaningful, hard-to-reverse decision is made.

Format per entry: **Decision → Context → Alternatives Considered → Reasoning → Status**

---

## 001 — Self-host on personal desktop, not cloud

**Context:** Need somewhere to run the app and store family data.
**Alternatives considered:** Cloud VPS, managed hosting, NAS.
**Reasoning:** No hosting cost during MVP; keeps family data physically at home, aligning with the "family data never leaves the local network without consent" rule.
**Status:** Active — revisit if desktop uptime/reliability becomes a problem.

## 002 — Remote access via private network layer (e.g., Tailscale), not port-forwarding

**Context:** Family members need to reach the app from outside the home network.
**Alternatives considered:** Direct port-forwarding + reverse proxy exposed to the internet.
**Reasoning:** Port-forwarding exposes the home server directly to the open internet, which is an unacceptable risk for a system holding family documents and photos. A private network layer keeps the server unreachable except by devices the family has explicitly authorized.
**Status:** Implemented 2026-07-28 — Tailscale installed on the host machine (Windows service, starts automatically) and confirmed working from a phone on cellular data (off the home network entirely), reaching the app at its Tailscale address. Each additional device (family member's phone/computer) needs the Tailscale app installed and signed into the same account to join the private network — this isn't automatic just because the host is set up.

## 003 — SQLite for MVP, PostgreSQL later if needed

**Context:** Need a database for the MVP.
**Alternatives considered:** PostgreSQL from day one.
**Reasoning:** SQLite is zero-configuration and file-based, which fits a single-family data volume and a solo developer's need for simplicity. Tradeoff: SQLite has a single-writer lock, which can cause contention if multiple family members write simultaneously (e.g., two people editing the calendar at once). Mitigated with short transactions and WAL mode for the MVP; PostgreSQL is the upgrade path if this becomes a real bottleneck.
**Status:** Active — monitor for write-concurrency issues.

## 004 — Local AI via Ollama, not a hosted/cloud model

**Context:** Need an AI backend for the Assistant/Advisor/Guardian roles.
**Alternatives considered:** Hosted APIs (e.g., cloud LLM providers).
**Reasoning:** Keeps family conversations and data on the local network by default — directly supports the "family data never leaves the local network without explicit, per-action consent" rule. Tradeoff: local open-source models are less capable than the largest hosted models, and require adequate local hardware.
**Status:** Active — specific model(s) still to be chosen; see open question in Technology_Stack.md.

## 005 — Vector search: ChromaDB vs. SQLite-based vector search

**Context:** Need semantic search over family documents/knowledge for the AI to use.
**Alternatives considered:** ChromaDB (separate service, Python dependency); `sqlite-vec`/`sqlite-vss` (stays within the existing SQLite database, no new language/runtime).
**Reasoning:** Not yet finalized. `sqlite-vec` better fits the "keep dependencies minimal" and "one language/one database" preferences, since ChromaDB would introduce a Python dependency into an otherwise Node-based stack. ChromaDB may offer more mature tooling out of the box.
**Status:** Open — decide before implementing File Search / Documents module.

## 006 — Frontend/backend: React + Next.js + Tailwind, PWA distribution

**Context:** Need a way to reach family members on both Android and iPhone without app store overhead.
**Alternatives considered:** Native iOS/Android apps; React Native.
**Reasoning:** A single PWA codebase runs in-browser and installs like an app on both platforms without app store fees or review, at the cost of some native-platform capabilities (notably iOS push notification reliability — flagged for early testing).
**Status:** Active — validate iOS PWA push notification behavior early in development.

---

## 007 — Photo-to-event extraction via outside frontier model, not local AI

**Context:** Users want to snap a photo of something (e.g., a school flyer) and have an event auto-created from it. Local vision models (small enough to run on home hardware via Ollama) aren't yet reliable enough at OCR + layout reasoning + date/time extraction to do this well.
**Alternatives considered:** Attempt extraction with a local vision model only; skip this feature entirely for MVP.
**Reasoning:** Frontier cloud vision models are meaningfully better at this chained task (OCR + layout understanding + structured extraction) than what fits on home hardware today. Rather than compromise on quality or skip the feature, this routes through the existing outside-call approval flow: the user sees exactly what's being sent (the photo) before it goes anywhere, a frontier model returns structured JSON, and the resulting event is pre-filled for human review — never auto-saved. This content is treated as sensitive by default (see `AI_Permissions.md`), so it also requires the sensitive-data gate, which is unavailable to a minor's account. Implemented as an Assistant capability (`Assistant.md`), not an Advisor suggestion, since it's user-initiated rather than proactive.
**Status:** Active — specific frontier model/provider still open (see Open Decisions below).

---

## 008 — Tailscale Funnel on a second port, for external family viewer access

**Context:** A relative outside the household (e.g. a grandparent) wants view-only web access to Photos and the Family Board, without joining the household's Tailscale network — a real request, not hypothetical. Decision #002 established that the whole app is reachable only via the private Tailscale network, explicitly rejecting direct internet exposure as an unacceptable risk. This is a genuine, deliberate exception to that reasoning, not a silent reversal of it.
**Alternatives considered:** (a) Give the external relative a Tailscale account and add them to the tailnet — rejected as too much setup friction for someone the household doesn't want managing their own VPN client, and it would grant reachability to the *entire* app surface, not a curated subset; (b) a per-person signed/magic link with no real account — rejected in favor of real, individually revocable username/password credentials per person, the household's explicit choice when this was scoped; (c) expose the whole app via Funnel and rely on in-app role gating alone — rejected because that makes the network-layer protection soft (app-code-dependent) rather than hard, for the entire app, when only two features actually need it; (d) *initially attempted:* path-scoped Funnel on the same port 443 the whole app already uses — this turned out not to be possible (see Status) and was corrected before going live for real.
**Reasoning:** The original plan assumed `tailscale funnel` could expose only specific paths on the app's existing port while leaving other paths on that same port tailnet-only. That assumption was wrong — Funnel's public/private toggle applies per hostname:port, not per path, so enabling it for one path exposes everything `tailscale serve` has mounted on that port. The corrected, verified-working design instead runs **two separate Tailscale HTTPS listeners**: port 443 keeps mounting the whole app tailnet-only exactly as before (Funnel never enabled there), and a new port 8443 mounts *only* the five external routes (`/family-view`, `/api/family-view`, `/api/photos`, `/api/family-board`, `/_next`) with Funnel enabled solely on that port. A brand-new `external_viewer` role (`Authorization.md`) with its own login surface (`/family-view/login`), unable to authenticate on the family's own `/login` and vice versa, means no family member's credentials are ever reachable from the open internet even indirectly regardless of which port serves them. The newly-public login surface also gets a minimum security bar the internal login intentionally still lacks (per Decision #002's original "tailnet is the boundary" reasoning): failed-login lockout and a finite session TTL, both scoped to this one surface only. See `Security_Architecture.md`'s "External Family Viewer Access" section for the full design.
**Status:** Built and deployed to production 2026-08 (schema, permissions, auth, routes, admin UX all live-verified; production server rebuilt and restarted). **Real incident during rollout:** the first Funnel attempt (path-scoped on port 443) briefly made the entire app publicly reachable — including `/login`, `/dashboard`, `/api/admin` — for roughly a minute before being caught via `tailscale funnel status --json` and immediately disabled (`tailscale funnel --https=443 off`, which turned out to also tear down port 443's serve mount entirely, requiring a second immediate fix to restore normal tailnet access). Corrected to the two-port design above, verified end-to-end: port 443 unaffected and tailnet-only, port 8443 serves only the five intended routes (confirmed `/dashboard` and `/api/users` 404 on port 8443 rather than falling through to the main app), `AllowFunnel` in `tailscale funnel status --json` lists only port 8443.

---

## Open Decisions (not yet finalized)

- Ollama model selection and hardware minimums
- ChromaDB vs. SQLite vector search (see #005)
- Frontier model/provider for photo-to-event extraction (see #007) — open to any provider at this point; also needs a data-retention policy check before committing
- Whether/when to introduce a Disaster Recovery doc, once backup strategy beyond the local desktop is defined
