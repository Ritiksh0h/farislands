# Far Islands — Production Build Plan

*Rebuild of the Far Islands web game as a launchable product. Scope: the full game — 3 basic modes (Classic, Gold Rush, Gold Production) × 2 add-on toggles (Stormy Sea, Timely Turns; both = Intense Battle) = 9 configurations, driven by one mode-parameterized engine. Companion doc: `farislands-rules-spec.md`.*

---

## Cross-cutting standards (true in every phase — the definition of done)

- **Server-authoritative, always.** The client renders state and sends *intents*; the server validates via `legalMoves` and computes outcomes. The client never decides game results. This is the single rule that fixes the original's biggest flaw.
- **CI-gated merges.** Every PR must pass typecheck + lint + tests before merge. Red = blocked.
- **No secrets in the repo, ever.** `.env` gitignored; `.env.example` holds keys only; env validated with Zod at boot so a missing var fails on startup, not mid-game.
- **Tests are the proof of correctness**, especially for the engine. "It ran" ≠ "it's correct."
- **ponytail scope:** ON (full) for client, lobby, UI, plumbing; OFF (or lite) for the rules engine and the bot, where completeness beats terseness.
- **Fix, don't port** the §15 bugs from the rules spec as you implement each area.

## Environments

`dev` (local) → `staging` (prod mirror, seeded test data) → `prod`. Nothing reaches prod that hasn't passed staging.

## Effort key

🟢 light · 🟡 medium · 🟠 heavy · 🔴 heaviest. (Relative weights, not calendar estimates — pace depends on you. Overall this is a multi-month build; Phases 1 and 5 are the bulk.)

---

## Phase 0 — Foundations 🟢
**Goal:** a clean, CI-gated monorepo skeleton.
**Build:** pnpm workspaces (`client` / `server` / `shared`); TypeScript strict everywhere; Biome (lint + format); Vitest + Playwright configured; GitHub Actions (typecheck + lint + test on PR); pre-commit hook (lint-staged); a real `.gitignore` (node_modules, `.env`, logs, dist); `.env.example`; Zod env loader; README; branch protection.
**Done when:** on a fresh clone, `pnpm install && typecheck && lint && test` all pass in CI; no secrets committed; CI blocks merges on failure.
**Depends:** —

## Phase 1 — Rules engine core (mode-parameterized) 🔴
**Goal:** the pure, deterministic, server-authoritative engine for the full game shape, with the Gold Production config working (logic only).
**Build (in `shared`):** typed `GameState` + Zod schemas; a `ModeConfig` type (setup preset, economy, relaunch on/off, paper-required-to-buy, `stormsEnabled`, `turnTimerEnabled`); pure `createGame(config, players, seed)`, `legalMoves(state)`, `applyMove(state, move)`; **seeded RNG**; rules split into modules — movement, launching, economy, weapons (exact §7 footprints), storms, islands, victory, turn engine, command-base protection. Encode every rule from the spec; fix the §15 bugs (card keyed on card, command-base immunity, single `loss`, no infinite turn loop). Vitest unit tests per rule **plus invariant tests** (gold conserved, turn always advances, no illegal state reachable).
**Done when:** full rule coverage green; engine is pure (no I/O, no module globals); a scripted Gold Production game runs start→win deterministically from a seed; illegal moves rejected.
**Depends:** 0. **Do not rush this — it's the foundation everything else stands on.**

## Phase 2 — AI bot (MCTS) 🟡
**Goal:** a tunable opponent plugged into the same engine.
**Build:** `bot(state, difficulty) => move`; easy = greedy heuristic, medium/hard = **MCTS with determinized rollouts** (difficulty = simulation budget); a self-play harness (bot vs bot to completion) that doubles as an engine fuzzer; a per-move latency budget.
**Done when:** self-play runs to completion with zero engine errors; only legal moves emitted; difficulty tiers measurably differ; latency within budget.
**Depends:** 1. *(Modes without Stormy Sea are fully turn-based → the bot is simpler and stronger there; storms just add stochasticity the rollouts absorb.)*

## Phase 3 — Playable vertical slice (the launchable core) 🟠
**Goal:** play Gold Production vs the bot in a browser, end to end, on the real architecture.
**Build:** minimal Socket.io server; live game state in **Redis** keyed by room (engine stays pure; server orchestrates); **intent protocol** — client sends intents, server validates via `legalMoves`, broadcasts new state (server-authority made real); coin/storm/turn timers wired from the spec's cadences; minimal React board that renders `GameState` and sends intents; one hardcoded room, 1 human + 1 bot. No auth, no lobby.
**Done when:** a full Gold Production game vs bot is playable in-browser start→finish; the server rejects illegal client intents; storms/coins/timer fire correctly; game state survives a server restart (via Redis).
**Depends:** 1, 2. **This milestone proves the entire stack.**

## Phase 4 — Multiplayer, rooms, reconnection 🟠
**Goal:** real humans playing each other and bots, in managed rooms.
**Build:** lobby (create / join / browse); room lifecycle (wait → ready → start); **bots as first-class room members** (no socket; server drives their turn with a small human-feeling delay); human-vs-human over sockets; mode selection at room creation (Gold Production + the two toggles for now); **reconnection** with a grace window and optional bot-takeover of a dropped human (fixing the dead disconnect logic); Socket.io **Redis adapter** for multi-instance; presence.
**Done when:** 2–4 mixed human/bot players complete a game; a dropped player rejoins within the grace window; kick/leave handled; verified across ≥2 server instances.
**Depends:** 3. **← Launchable core ends here (single mode, real multiplayer + bots).** Consider a soft launch to validate before Phase 5.

## Phase 5 — The other basic modes (Classic + Gold Rush) 🔴
**Goal:** all three basic modes live → with the toggles, all 9 configurations.
**Build:** **Classic** `ModeConfig` + a **starting-formation placement phase** (rules + UI; player chooses destroyer/submarine sides) + start resources (1000 gold, 1 weapon, 1 paper) + paper-required-to-buy. **Gold Rush** `ModeConfig` + on-board gold placement (2000 = 400 center + 200 surrounding) + 4-player replenishment + no-relaunch + first-to-lighthouse papers. Pull exact formation coordinates from rule book pp. 6–7 (the one remaining data gap, §16.2). Bot must handle the placement phase + these economies. Tests per new mode.
**Done when:** Classic and Gold Rush each play start→win (human and bot); all 9 combinations selectable and test-covered; formations match the rule book.
**Depends:** 1–4. **This is the bulk of the "all nine" extra work.**

## Phase 6 — Accounts, persistence, social 🟠
**Goal:** identity + durable data + friends. *(Can run in parallel with Phase 5 — independent surface.)*
**Build:** **Better Auth** (email/password + Google + email verification + password reset), session validated on the Socket.io handshake; **Postgres + Prisma** with migrations (users, friend graph, match history, per-mode stats/rankings); friends + invites + presence; decide on internal-trade feature (build per §10 or defer). Secrets via env/secret manager.
**Done when:** all auth flows work incl. verify/reset; sockets authenticated; matches persisted; friends/invites functional; migrations run clean on a fresh DB.
**Depends:** 4.

## Phase 7 — Full client & UX 🟠
**Goal:** the complete, polished product UI. *(ponytail ON.)*
**Build:** rebuild all scenes (login/register, lobby, room, board, how-to-play, results, profile/stats); asset pipeline + **dedupe** (kill the triplicated images); sounds; responsive/mobile; accessibility basics; error boundaries; loading/empty states; mode-selection UX; optional spectate.
**Done when:** all flows navigable and polished on desktop + mobile; no dead assets; a11y basics pass; Playwright e2e green on the critical flows (login, create/join room, play a turn, finish a game).
**Depends:** 4–6.

## Phase 8 — Production hardening & launch 🟠
**Goal:** safe in front of real users at scale.
**Build:** deploy pipeline with rollback (client → Cloudflare Pages/Vercel; server → Railway with managed Postgres + Redis, or Fly.io); structured logging + error tracking (e.g. Sentry) + uptime/metrics (**not** 12 MB of committed logs); rate limiting + edge input validation; Socket.io **load/soak test** (concurrent rooms, reconnection storms); DB backups + verified restore; security pass (secrets rotated, OWASP basics, dependency audit); resolve the tiny §16 residuals; cost check; launch runbook.
**Done when:** staging mirrors prod; load test hits target concurrency at acceptable latency; monitoring + alerts live; backups + rollback tested; security/dependency audit clean.
**Depends:** all prior.

---

## Sequencing & parallelization

- **Critical path to a live product:** 0 → 1 → 2 → 3 → 4, then a soft launch of the single mode, then 5.
- **Parallel:** Phase 6 (auth/persistence) can proceed alongside Phase 5 (modes).
- **Phase 7** pulls together the surfaces from 4–6.
- **Launch gate (full game):** Phases 0–8 complete, all 9 modes test-covered, load + security + backup checks green.

## Top risks & mitigations

1. **Rushing Phase 1** → subtle rule bugs surface later and are expensive. *Mitigation:* tests + invariants before moving on; ponytail off; self-play (Phase 2) as a fuzzer.
2. **Generation outrunning verification** — Claude Code writes fast; correctness is gated by your tests, not its speed. *Mitigation:* spec → tests → implement, in that order.
3. **Scope creep from "all nine."** *Mitigation:* ship the single-mode core (through Phase 4) before pouring weeks into Phase 5.
4. **Server authority regressions** as features land. *Mitigation:* intents-only protocol; no client-computed outcomes; validate every intent server-side.
5. **Real-time at scale** (sockets, reconnection). *Mitigation:* Redis adapter early (Phase 4); load/soak test before launch (Phase 8).
