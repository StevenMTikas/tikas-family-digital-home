# Future Ideas

## Purpose

A running collection of ideas, features, and enhancements that are explicitly **out of scope for MVP** but worth remembering. Some are pulled from "Future Enhancements" sections scattered across other documents (consolidated here for one place to browse); others are new feature concepts that fit the project's philosophy but haven't been scoped into a module yet. This is a living document — expected to grow throughout development.

## New Feature Concepts (Not Yet Tied to a Specific Module Doc)

Ideas that build naturally on the existing architecture (Advisor suggestions, Family Knowledge, Memory, Assistant) without requiring new subsystems:

- **Household inventory nudges** — Advisor suggests restocking based on patterns in usage/mentions.
- **Escalating birthday/anniversary reminders** — beyond a calendar event, Advisor proactively suggests gift ideas or reservations ahead of time, based on AI_Memory patterns.
- **Maintenance reminders from Family Knowledge** — e.g., flagging an HVAC filter change or an insurance renewal, using the same weekly-check pattern Guardian already runs.
- **3D printing project follow-through** — Advisor flags a stalled project the same way it flags stalled Tasks (a personal touch specific to this family's interests).
- **"On this day" memories** — surface a Memory from a prior year on its anniversary, using existing Memory/Photo entities and a Guardian-style scheduled check.
- **Auto-suggested Memory ↔ Family Knowledge linking** — e.g., linking renovation photos to the related home-improvement record.
- **Emergency info quick-view** — an always-accessible view of just the most critical Family Knowledge items (medical contacts, allergies, emergency contacts), without digging through folders.
- **Chore/responsibility tracking** — recurring household responsibilities (distinct from one-off Tasks), with light AI nudging when something's been skipped.
- **"Ask the house" as a flagship Assistant use case** — highlighting queries like "what's everyone doing this weekend" once enough family data has accumulated to make this genuinely useful.
- **Voice-first mode** — for hands-busy moments (cooking, driving, chores), building on the planned Voice module and the "every screen supports voice where practical" rule.
- **Family meeting/check-in mode** — a structured weekly view, possibly tied to the family-wide Morning Briefing, meant to be reviewed together rather than individually.
- **Guardian-flagged "quiet" patterns as a gentle prompt, not just a report** — e.g., a low-key nudge to the person themselves ("haven't seen you in a bit") rather than only a fact surfaced to parents, keeping the tone about connection rather than surveillance.

## Outside Frontier Model — Other Candidate Uses

Beyond the photo-to-event extraction feature already built into `Assistant.md` (see `Decision_Log.md` #007), other tasks that would genuinely benefit from a frontier model's greater capability, following the same outside-call approval pattern:

- Document extraction beyond flyers (insurance cards, medical forms, tax documents, receipts).
- Handwriting recognition (school notes, handwritten recipes, doctor's notes).
- Voice transcription in noisy/complex conditions (multiple speakers, background noise, accents).
- Large-scale photo search/tagging (e.g., face/scene recognition across thousands of photos) beyond the simple manual-prompt tagging built for MVP.
- Complex reasoning over long documents (e.g., summarizing a lengthy insurance policy or contract).
- Recipe/meal-plan generation from a photo of fridge/pantry contents.
- Translation for non-English documents or conversations, if relevant to the family.

## Physical / Hardware Direction

- **Family assistant robot** — a longer-term concept of extending the existing AI "brain" (Assistant/Advisor/Guardian, permissions model, AI_Memory) onto a mobile robot body capable of physical tasks around the house. The software architecture is largely hardware-agnostic and could extend to a "Robot" device type; the harder open problems are physical (locomotion, manipulation, safety around family members) rather than the software design already in place. Would require new physical-presence/consent rules beyond current data-permission rules (e.g., "can this robot enter a specific room") before being seriously scoped.

## Consolidated from Other Documents' "Future Enhancements" Sections

Organized by area, for reference — see the linked document for full context on each.

### Technology & Hosting
- Migrate to PostgreSQL if/when multi-writer contention becomes a real bottleneck (`Technology_Stack.md`)
- Revisit hosting (e.g., a home server or NAS) if desktop uptime becomes unreliable (`Technology_Stack.md`)
- Evaluate larger or fine-tuned local models as hardware allows (`Technology_Stack.md`)
- Fix Ollama's GPU/CUDA acceleration on the host — currently forced to CPU-only inference (`OLLAMA_LLM_LIBRARY=cpu`) after a CUDA stack-buffer-overrun crash on this machine's GTX 1060 (driver 566.14, CUDA 12.7); likely an Ollama/driver version mismatch rather than a hardware limitation. CPU inference works but is slow (cold model load ~10-70s) — fixing this would meaningfully improve Assistant/Advisor/Guardian response latency (`Technology_Stack.md`, `AI_Architecture.md`)
- Full encryption in transit and at rest if the system moves toward a commercial/cloud-facing product (`Security_Architecture.md`)
- Cloud backup storage with mandatory encryption (`Security_Architecture.md`)
- Introduce a proper state management library only if Server Components + Context prove insufficient (`Application_Architecture.md`)
- Expand the Connector API if sync needs become more complex than a daily scheduled pull (`Application_Architecture.md`)
- Non-technical installer/pairing flow for connectors, for a commercial version (`File_Connector_Architecture.md`)
- Manual "sync now" option for connectors (`File_Connector_Architecture.md`)
- Duplicate detection and auto-renaming for near-identical synced files (`File_Connector_Architecture.md`)
- Expansion of designated connector folder types beyond camera/photos and documents (`File_Connector_Architecture.md`)

### Data & Documents
- Document versioning (`Data_Model.md`)
- Recurring tasks and sub-tasks (`Data_Model.md`)
- Persistent notification history (time, text, liked/not), beyond MVP's real-time-only delivery (`Data_Model.md`, `Data_Flow.md`)
- Support for additional file types beyond Office/PDF — CAD, STL, relevant to 3D printing (`Data_Model.md`, `System_Overview.md`)
- More structured Family_Knowledge_Item sub-types (e.g., a dedicated Password entry with stronger encryption) (`Data_Model.md`)
- Auto-generated default folder structure per user role, for a commercial version (`Folder_Permissions.md`)
- Additional shared folders beyond the single whole-family folder (e.g., parents-only shared folder) (`Folder_Permissions.md`)

### Permissions & Security
- Self-service or email-based password recovery, if the system gains a way to reach users outside the app (`Authentication.md`, `Security_Architecture.md`)
- Reduced-trust/guest access from a non-admin-added device (`Authentication.md`)
- Failed-login lockout/throttling, if the system becomes reachable outside a closed home network (`Authentication.md`)
- Finer-grained permission grants (e.g., "can edit Calendar but not Documents") (`Authorization.md`)
- Permission templates/presets (e.g., one-click "standard teenager" set) (`Authorization.md`)
- Expanded parental controls, full detail in a future Parental_Controls module (`Security_Architecture.md`, `Guardian.md`)
- Opt-in, higher-depth family monitoring levels for parents, beyond MVP's fact-only observations (`Guardian.md`)

### AI & Agents
- Formal benchmarking of Llama vs. Qwen (and specific sizes) against actual host hardware (`AI_Architecture.md`)
- Possible model specialization beyond Assistant/Advisor vs. Guardian (`AI_Architecture.md`)
- More sophisticated confidence-decay logic for AI_Memory (`AI_Architecture.md`)
- Distinct handling for sensitive AI_Memory entries, separate from Documents/Family Knowledge treatment (`AI_Memory.md`)
- Richer AI_Memory categorization if the flat category list proves insufficient (`AI_Memory.md`)
- Evaluate giving Guardian limited autonomous authority once suggestion trust is established (`AI_Permissions.md`, `Advisor.md`)
- Expand the definition of "sensitive" data categories as usage clarifies real needs (`AI_Permissions.md`)
- More automated suggestion acceptance (skipping the review step) for low-risk suggestion types (`AI_Suggestions.md`)
- Differentiated lifecycle/feedback handling for Guardian- vs. Advisor-originated suggestions (`AI_Suggestions.md`)
- Refine the Advisor suggestion-type starter list based on real household usage (`Advisor.md`)
- Selectable standard Assistant personalities/tone presets, for a commercial version (`Assistant.md`)
- Possible shared/family-visible Assistant conversations, distinct from private one-on-one chats (`Assistant.md`)
- Configurable Morning Briefing delivery timing per user, or first-open-of-day generation (`Morning_Briefing.md`)
- Richer family-wide Morning Briefing features (e.g., cross-family scheduling conflict highlights) (`Morning_Briefing.md`)
- More specific, tested Conversation Rules guidance as real conversations reveal edge cases (`Conversation_Rules.md`)
- Email and/or text delivery for Guardian's urgent alerts, in the commercial version (`Guardian.md`)
- Reassessment of Guardian's monitoring frequency for the commercial version (`Guardian.md`)
- Expansion of Guardian's system health/security/family-pattern starter lists (`Guardian.md`)

### Development & Documentation
- Replace `API_Reference.md`'s route skeletons with real, documented endpoints incrementally as each module is built (`API_Reference.md`)
- Add request/response examples per real endpoint once they exist (`API_Reference.md`)
- Document rate-limiting/throttling conventions if they become necessary (`API_Reference.md`)
- Continue adding scenarios to `Data_Flow.md` as real usage patterns emerge

## Dependencies

This document has no dependencies of its own — it exists to catch anything *out of scope* from every other document. As ideas here become real, they should be moved into the relevant module/architecture doc and removed from this list.

## Questions

None — this document is meant to accumulate open-ended ideas, not resolve them.
