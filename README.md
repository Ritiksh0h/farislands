# Far Islands

A 2–4 player, turn-based naval strategy game — web rebuild.

## Setup

```bash
cp .env.example .env   # fill in values
pnpm install
pnpm dev:server        # start server in dev mode
```

## Commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | TypeScript project-reference build (all packages) |
| `pnpm lint` | Biome lint + format check |
| `pnpm format` | Biome auto-format (write) |
| `pnpm test` | Vitest unit tests (node: shared+server, happy-dom: client) |
| `pnpm test:e2e` | Playwright e2e tests |
| `pnpm dev:server` | Start server in watch mode (tsx) |
| `pnpm dev:client` | Start Vite dev server |

## Workspace

```
client/   React + Vite frontend
server/   Node + Express + Socket.io backend
shared/   Pure game engine (@farislands/shared)
docs/     Game rules spec + production plan
```
