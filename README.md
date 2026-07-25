# Tikas Family Digital Home

A self-hosted, local-first family organization system. See `docs/README.md` for the full documentation index — this file covers getting the project running.

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run db:init              # creates db/tikas.db from db/schema.sql
npm run dev
```

Requires [Ollama](https://ollama.com) running locally for AI features — see `docs/01_System_Architecture/AI_Architecture.md` for model selection guidance, and `.env.example` for the expected `OLLAMA_HOST`/`OLLAMA_MODEL` values.

## Project Structure

```
app/            Next.js App Router — one folder per module (dashboard, calendar, tasks, ...)
app/api/        API routes, one per module, plus app/api/connectors (deliberately separate — see docs)
lib/core/       Shared services every module routes through: permissions, ai, logging
lib/api/        Thin typed API clients, one file per module
components/     Shared, reusable UI components
db/             schema.sql (generated from Data_Model.md) and init.js
docs/           The complete project specification — read this before building anything
```

## Before You Build Anything

This project was fully specified before any code was written. `docs/` contains ~58 documents covering vision, architecture, every module's behavior, permissions, the AI system, and development practices. **Read the relevant doc(s) before implementing a feature** — `CLAUDE.md` (read automatically by Claude Code) points to where to start and the non-negotiable rules that apply throughout.

Two documents worth knowing about specifically:
- `docs/07_Development/MVP.md` — what's actually in scope right now
- `docs/07_Development/Future_Ideas.md` — everything deliberately deferred, so you don't accidentally reinvent something that was already thought about and postponed

## Status

This scaffold reflects the documentation as of its generation. `db/schema.sql` is a starting point derived from `Data_Model.md`, not a finished migration — cross-check against the source doc before relying on it. Every module page and API route in `app/` is a placeholder pointing back to its spec, except `app/dashboard` and `app/api/tasks`, which are worked examples showing the intended pattern.
