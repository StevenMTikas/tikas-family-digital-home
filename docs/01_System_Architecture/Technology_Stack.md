# Technology Stack

## Purpose

Defines the technologies Tikas Family Digital Home is built on, and the reasoning behind each choice, so the stack stays consistent as the project grows and so a solo developer can revisit the "why" months later.

## Frontend

- **React**
- **Next.js**
- **Tailwind CSS**
- **Progressive Web App (PWA)**

**Why:** One codebase can run in a browser and be installed on Android and iPhone like a native app, without paying for app store fees or going through app store review initially.

## Backend

- **Next.js API routes**
- **Node.js**

**Why:** Keeps frontend and backend in a single language (JavaScript/TypeScript) and a single codebase — fewer moving parts for a solo developer to maintain.

## Database

- **SQLite** for the MVP
- Upgrade path to **PostgreSQL** later if concurrency or scale requires it

**Why:** Zero-configuration, file-based, and sufficient for a single-family household's data volume. See `Decision_Log.md` for tradeoffs (notably write concurrency).

## AI

- **Ollama**, running locally
- Open-source models (e.g., Qwen, Llama)

**Why:** Keeps family data on the local network by default, in line with Cursor_Project_Rules.md ("family data never leaves the local network without explicit, per-action consent").

## File / Semantic Search

- **ChromaDB** or **SQLite with vector search** (e.g., `sqlite-vec`)

**Why:** Enables the AI to search family documents and knowledge semantically, not just by keyword. Final choice to be confirmed in `Decision_Log.md`.

## Development

- **Cursor IDE**

## Hosting

- Personal desktop computer, initially self-hosted

**Why:** No hosting cost during MVP; keeps all family data physically at home. Remote access is provided through a private network layer (e.g., Tailscale) rather than exposing the machine directly to the internet — see `Security_Architecture.md`.

## Minimum Hardware Notes

*To be filled in once a specific Ollama model is selected for the MVP — model size determines minimum RAM/CPU/GPU requirements for acceptable response times.*

## Dependencies

Per Cursor_Project_Rules.md: dependencies are kept minimal and version-pinned. Any new dependency added to this stack should be logged in `Decision_Log.md` with its reasoning.

## Future Enhancements

- Migrate to PostgreSQL if/when multi-writer contention becomes a real bottleneck
- Revisit hosting (e.g., a home server or NAS) if desktop uptime becomes unreliable
- Evaluate larger or fine-tuned local models as hardware allows

## Questions

- Which specific Ollama model(s) will be used for the MVP, and what are their hardware requirements?
- ChromaDB vs. SQLite vector search — final decision pending (see Decision_Log.md)
