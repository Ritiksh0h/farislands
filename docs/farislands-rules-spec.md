# Far Islands — Complete Game Rules Specification

*Sources: the official EFFE Studios **Rule Book V4** (canonical design), the web implementation's code (`gameLogic.js`, `socker.js`), and the client how-to-play pages. Where the rulebook and the code differ, the **rulebook is the design intent** and the code's behavior is flagged as a deviation/bug.*

> **Big reframe:** the existing web app implements **one configuration** of the game — **Gold Production + Stormy Sea + Timely Turns**. The full game is **3 basic modes × up to 3 add-on modes = 9 ways to play**. The rebuilt rules engine should be **mode-parameterized** (a mode config drives setup, economy, relaunch, and the buy-requires-paper rule) rather than hardcoding one variant. See §11.

---

## 1. Overview & victory

2–4 player, turn-based naval strategy — a physical board game with a companion app (FIHQ). Goal: defeat every other player.

**A player is defeated if any one holds:** their **cruiser is destroyed**; **or** they own **0 islands**; **or** they **refuse/are unable to take a turn**.

**Turn order:** youngest player starts, play proceeds **clockwise**. Exactly **one action per turn**.

---

## 2. Components

- Map ×1 (the board).
- **28 ships** = 4 colors × 7: 1 cruiser, 1 destroyer, 1 submarine, 4 corvettes.
- **24 weapon cards**: 12 missile, 4 pirate, 4 jammer, 4 defence.
- **4 research-paper cards**.
- **4000 gold** = 40 coins × 100 gold each.

---

## 3. The board (9×9)

Columns **A–I**, rows **1–9**; a zone is e.g. **"E4"**. Four islands (colored shields) on the four sides, four lighthouses in the corners, **treasure land** in the center.

- **Command base** = the shield zone of an island. A ship sitting on its **own command base is protected from other ships' basic moves** — but **NOT from weapons or storms**. Command bases are **free launching zones** (no premium).
- **Launching zones:** 9 per island. You may launch **only on your own island's** zones. Some zones carry a **launch premium** (0/100/200) — exact premiums per color in §12.

---

## 4. Turn actions (choose one per turn)

1. **Move a ship** — move, or ram to destroy (§5, §6).
2. **Buy a weapon** — a **random** card from HQ (keep the type secret). Requires holding a research paper in **Classic & Gold Rush** modes.
3. **Use a weapon** — one target zone within the card's range; **no ship movement** (§7). **Defence** is the exception: usable **any time** to counter an attack.
4. **Launch a ship** — from inventory, pay cost + premium. **Not available in Gold Rush** (no relaunch there).

---

## 5. Movement (confirmed from rulebook diagrams + how-to-play)

| Ship | Movement | Relaunch | Weapon |
|---|---|---|---|
| **Cruiser** (king) | 1 zone, any of 8 directions | **Never** | Missile |
| **Corvette** | 1 zone, any of 8 directions | mode-dependent | Defence |
| **Destroyer** | 1 or 2 zones **orthogonally** (no diagonal) | mode-dependent | Pirate |
| **Submarine** | 1 zone orthogonally **or** 2 zones **diagonally** | mode-dependent | Jammer |

**Ramming = capture:** moving onto an occupied zone destroys the ship there — **except** a ship on its **own command base** is immune to basic-move capture (§3). No strength/dice.
**Auto-pickup:** landing on gold/paper collects it; landing on an enemy command base captures the island (§6).
**2-zone intermediate (RAM_THROUGH):** a 2-zone move is legal even when the intermediate is occupied by a rammable enemy. `legalMoves` resolves the actual stopping position: if the intermediate holds a rammable enemy, the move is emitted with `to = intermediate` (ship stops and rams there; the far square is never reached). The intermediate is blocked — and the move is illegal — when it holds a friendly ship or a base-protected enemy. This covers the submarine correctly: an enemy on the diagonal intermediate is reachable via the 2-zone diagonal, stopping and ramming there.

---

## 6. Islands & capture

Move a ship onto an **enemy command base** to capture that island — its shield and launching zones transfer to you. A defeated player's **non-fleet resources** (gold, papers, cards) sit under their island and are **claimed by whoever captures it**. Own **0 islands → defeated**.

---

## 7. Weapons — exact ranges (read from the card diagrams)

Offsets `(dx,dy)` are relative to the acting ship; each weapon hits **one** target zone within its footprint.

| Weapon | Ship | Target zones | Effect |
|---|---|---|---|
| **Missile** | Cruiser | The **8 zones at distance 2**: `(±2,0),(0,±2),(±2,±2)` | Destroy any ship in the target zone |
| **Pirate** | Destroyer | The **4 diagonal** zones: `(±2,±2)` | Steal from the enemy there: **all gold OR all weapons OR all research papers** |
| **Jammer** | Submarine | The **4 orthogonal** zones: `(±2,0),(0,±2)` | **Block** the target ship — a blocked ("sleeping") ship can't move or use any weapon |
| **Defence** | Corvette | The **8 adjacent** zones (distance 1) | Counter any enemy weapon used on a ship there, **or unblock** a blocked ship. **Usable at any time** |

(Elegant symmetry: missile = pirate's diagonals ∪ jammer's orthogonals.)

**Defence coverage (settled decision):** Defence covers the 8 zones adjacent to the defending corvette (Chebyshev distance exactly 1), per the card diagram. A corvette CANNOT defend its own zone — a lone corvette holding a defence card cannot protect itself; a second friendly corvette must be adjacent to the target. (The original implementation used distance ≤1, allowing self-defence; we follow the card diagram instead. Flagged as a candidate to revisit in playtesting.)

**Economy:** price = **500 − 100 × (research papers held)** (3 papers → 200). Random draw, kept secret, single-use, returned to HQ after use, and using it does **not** move the ship. Non-defence weapons only on your turn.

---

## 8. Research papers

4 total, one under each corner lighthouse. Each held paper reduces weapon cost by **100**. In **Classic & Gold Rush** you must hold ≥1 to buy weapons at all. **First ship to a lighthouse** takes its paper (later arrivals get nothing). You can **steal** a paper from an adjacent island by reaching the **opposite-corner** lighthouse.

---

## 9. Gold & HQ

40 coins × 100 = 4000 gold; the game currency for all trades. **HQ** is the central unit: sells weapons, produces and places gold, and collects launch costs + premiums. How you get gold depends on the mode (§11).

---

## 10. Blocked ships & internal trades

A **blocked (jammed)** ship is kept in a "sleeping" position and **cannot move or use weapons** until unblocked (by a **defence** card, or a jammer toggling it back — the client's "stop or start"). **Players may trade internally at any time.** (The web code never implemented trading — §15.)

---

## 11. The nine modes

**Pick one basic mode** (each has a different setup + economy):

### Classic
- **Start:** 1000 gold, 1 random weapon, 1 research paper; **fixed formation** — cruiser on the command base, destroyer & submarine on either side (player's choice), corvettes behind the cruiser. Formation locked once placed.
- Must hold a paper to buy weapons. Steal 1 paper from adjacent islands via the opposite-corner lighthouse.
- **Gold:** given upfront.

### Gold Rush
- **Start:** fleet only (no other resources); formation — cruiser on base, submarine leading, destroyer behind cruiser, two corvettes either side of the destroyer. **2000 gold on the map** (400 in the treasure zone + 200 in each surrounding zone). A paper under each lighthouse.
- Must hold a paper to buy weapons. First ship to a lighthouse takes its paper. **No relaunch** (Launch action disabled). 4-player: once all placed gold is collected, **2000 gold is replenished** the same way.
- **Gold:** collected from the map.

### Gold Production
- **Start:** 1000 gold; cruiser on base; **rest of fleet in inventory**. A paper under each lighthouse. Uses the FIHQ app.
- First ship to a lighthouse takes its paper. Steal via opposite-corner lighthouse. The app announces production zones **regularly**; HQ places **200 gold**; ships in or reaching a zone collect it.
- **Gold:** both upfront and produced.

**Add-on modes** (combine with any basic mode; multiple allowed):

- **Stormy Sea:** the app pre-warns of a storm in a specific **row + column**; a storm sound plays on arrival; every ship in the storm area is **destroyed** (shields do **not** protect). Digital cadence in §12.
- **Timely Turns:** **60 s per turn**; over time → pay **100 gold for +60 s** (repeatable); **skipping is not allowed** (→ defeat).
- **Intense Battle:** both add-ons at once.

> **The current web app = Gold Production + Stormy Sea + Timely Turns.**

---

## 12. Digital implementation values (from the web code)

For the web version specifically (Gold Production + add-ons):

- **Launch premiums** (spawn zones with a cost; all others free), by color and base:
  - purple (base 7,4): (7,5)=100, (7,3)=100, (6,4)=200
  - yellow (base 4,1): (3,1)=100, (5,1)=100, (4,2)=200
  - green (base 1,4): (1,5)=100, (1,3)=100, (2,4)=200
  - red (base 4,7): (3,7)=100, (5,7)=100, (4,6)=200
- **HQ:** starts 4000 gold; card stock missile 12 / pirate 4 / jammer 4 / defence 4.
- **Coin cadence:** every ~70–85 s (2p) or ~130–145 s (4p); 200 gold per drop in the treasure zone.
- **Storm cadence:** ~230–260 s grace at start; then 2p → warning every ~65–80 s, lands ~130–150 s later; 4p → ~125–145 s, lands ~230–260 s later. Storm = one full row + one full column.
- **Turn timer:** 60 s + 100 gold/60 s extension.
- **Turn order:** the code uses a **random** start + fixed color rotation; the **rulebook** says youngest-first, clockwise. Pick one for the rebuild.

---

## 13. Randomness → the AI bot

Stochastic sources (all server-side): color/base assignment, first player, **coin location** (recurring), **storm location** (recurring), **which card you draw**. Because coins, storms, and draws are random and occur during play, the game is **stochastic** → use **MCTS with determinized rollouts** (difficulty = simulation count), not plain minimax. **Seed all RNG** for reproducible tests/replays.

---

## 14. Socket event contract (current web API)

- **Lobby/rooms:** createRoom, CreateOrJoinRooms, joinRoom/joinedRoom, leaveRoom, getRooms, getRoomById, kickPlayer, startGame/startGameMsg, GetReady, getInGame
- **Gameplay:** gameMovesMsg, spawnShipMsg, buyWeaponCard/buyWeaponCardMsg, useWeaponCardMsg, defenseCardMsg, payForNotToMoveMsg, goldSpawnMsg, stormWarningMsg, stormClearMsg, win/WinMsg, loss/lossMsg
- **Chat:** chat message, directMessage, joinMessage, leaveMessage
- **Friends/presence:** inviteFriend, friendAdded/friendDeleted, friendRequest{Sent,Received,Accepted}, playerOnline/playerOffline, ping, disconnecting

---

## 15. Deviations & bugs in the existing code (fix, don't port)

1. **No server-side move validation** (`gameMoves`) — executes any from/to; fully cheatable. Server must own `legalMoves`.
2. **Weapon ranges not enforced server-side** (`useWeaponCard`) — applies to any `{x,y}`; enforce the footprints in §7.
3. **Card effect keyed on ship, not card** — `switch (weaponCard && shipInfo)` short-circuits to ship; key effects on the card.
4. **Command-base protection not implemented** — the code lets you ram a ship on its own base; §3 says you can't.
5. **Only one mode implemented** — build the engine mode-parameterized (§11).
6. **4-player economy broken at start** — HQ pays out its whole 4000; coinSpawn refuses at 0. Rebalance.
7. **Disconnect/reconnect non-functional** — reads `.socketid` off an array; never matches.
8. **Turn-advance infinite loop** — `getNextPlayerIndex` `while(true)` with no exit when nobody is active.
9. **Weapon-card item collection type bug** (object += number); **HQ.gold `=== 0` guard** goes stale once negative; **two divergent `loss` fns**; **client-supplied trusted params** (from/to, minusGold, playerNo).
10. **Global mutable module state** (`rooms`, `gameBoard`) — move live state to Redis; make the engine pure.
11. **Internal trading never built** — decide whether to include it (§10).

---

## 16. Remaining open items

1. **Exact starting-formation coordinates** for **Classic** and **Gold Rush** — the rulebook shows formations as pictures; precise zone coordinates are needed before building those modes. (Gold Production starts the fleet in inventory, so this is not blocking the current build.)
2. **Internal trading** — §10 describes player-to-player trading at any time, but the original web app never implemented it. Decide whether to include it before building the economy slice.

Everything else is fully specified and ready to build as pure, tested TypeScript.
