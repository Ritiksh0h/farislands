import { ISLAND_DEF, PLAYER_COLORS, SHIP_COST } from "./constants.js";
import type {
  GameState,
  IslandOwnership,
  Move,
  PlayerColor,
  Position,
  ShipState,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function posEq(a: Position, b: Position): boolean {
  return a.col === b.col && a.row === b.row;
}

function shipAt(ships: ShipState[], pos: Position): ShipState | undefined {
  return ships.find((s) => posEq(s.pos, pos));
}

function midpoint(from: Position, to: Position): Position {
  return { col: (from.col + to.col) / 2, row: (from.row + to.row) / 2 };
}

function inBounds(p: Position): boolean {
  return p.col >= 0 && p.col <= 8 && p.row >= 0 && p.row <= 8;
}

function isOnOwnBase(
  pos: Position,
  ownerId: string,
  ownership: IslandOwnership,
): boolean {
  for (const color of PLAYER_COLORS) {
    if (posEq(ISLAND_DEF[color].commandBase, pos)) {
      return ownership[color as PlayerColor] === ownerId;
    }
  }
  return false;
}

// Returns the island color whose 3×3 zone contains pos, or undefined.
function islandColorOfZone(pos: Position): PlayerColor | undefined {
  return PLAYER_COLORS.find((c) => {
    const b = ISLAND_DEF[c].commandBase;
    return Math.abs(pos.col - b.col) <= 1 && Math.abs(pos.row - b.row) <= 1;
  }) as PlayerColor | undefined;
}

function zonePremium(pos: Position): number {
  const color = islandColorOfZone(pos);
  return color
    ? (ISLAND_DEF[color].launchPremiums[`${pos.col},${pos.row}`] ?? 0)
    : 0;
}

// Candidate far-square positions before RAM_THROUGH resolution.
function candidates(ship: ShipState): {
  oneZone: Position[];
  twoZone: Position[];
} {
  const { col, row } = ship.pos;

  if (ship.type === "cruiser" || ship.type === "corvette") {
    const oneZone: Position[] = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        oneZone.push({ col: col + dc, row: row + dr });
      }
    }
    return { oneZone, twoZone: [] };
  }

  const orth1: Position[] = [
    { col: col + 1, row },
    { col: col - 1, row },
    { col, row: row + 1 },
    { col, row: row - 1 },
  ];

  if (ship.type === "destroyer") {
    return {
      oneZone: orth1,
      twoZone: [
        { col: col + 2, row },
        { col: col - 2, row },
        { col, row: row + 2 },
        { col, row: row - 2 },
      ],
    };
  }

  // submarine: 1 orthogonal OR 2 diagonal
  return {
    oneZone: orth1,
    twoZone: [
      { col: col + 2, row: row + 2 },
      { col: col + 2, row: row - 2 },
      { col: col - 2, row: row + 2 },
      { col: col - 2, row: row - 2 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function legalMoves(state: GameState): Move[] {
  const currentPlayer = state.players[state.currentPlayerIndex]!;
  const { ships } = state.board;
  const { islandOwnership } = state;

  const seen = new Set<string>();
  const moves: Move[] = [];

  const emitMove = (shipId: string, to: Position) => {
    const key = `move:${shipId}:${to.col},${to.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    moves.push({ type: "move", shipId, to });
  };

  // Board-ship moves
  for (const ship of ships) {
    if (ship.ownerId !== currentPlayer.id || ship.blocked) continue;

    const { oneZone, twoZone } = candidates(ship);

    for (const target of oneZone) {
      if (!inBounds(target)) continue;
      const occ = shipAt(ships, target);
      if (occ) {
        if (occ.ownerId === currentPlayer.id) continue;
        if (isOnOwnBase(target, occ.ownerId, islandOwnership)) continue;
      }
      emitMove(ship.id, target);
    }

    for (const far of twoZone) {
      if (!inBounds(far)) continue;
      const m = midpoint(ship.pos, far);
      const midOcc = shipAt(ships, m);

      if (midOcc) {
        if (midOcc.ownerId === currentPlayer.id) continue;
        if (isOnOwnBase(m, midOcc.ownerId, islandOwnership)) continue;
        // Rammable enemy at intermediate — RAM_THROUGH: actual stop = m
        emitMove(ship.id, m);
        continue;
      }

      // Intermediate clear — evaluate far square
      const farOcc = shipAt(ships, far);
      if (farOcc) {
        if (farOcc.ownerId === currentPlayer.id) continue;
        if (isOnOwnBase(far, farOcc.ownerId, islandOwnership)) continue;
      }
      emitMove(ship.id, far);
    }
  }

  // Launch moves — only when mode allows (§4: "Not available in Gold Rush")
  if (state.mode.relaunchEnabled) {
    for (const color of PLAYER_COLORS) {
      if (islandOwnership[color as PlayerColor] !== currentPlayer.id) continue;
      const base = ISLAND_DEF[color].commandBase;

      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const zone: Position = { col: base.col + dc, row: base.row + dr };
          if (shipAt(ships, zone)) continue; // occupied

          const premium = zonePremium(zone);

          for (const invShip of currentPlayer.inventory) {
            if (invShip.type === "cruiser") continue; // never launchable
            const cost = SHIP_COST[invShip.type] ?? 0;
            if (currentPlayer.gold < cost + premium) continue;
            moves.push({ type: "launch", shipId: invShip.id, to: zone });
          }
        }
      }
    }
  }

  return moves;
}

// Mutates `state` (expected to be a structuredClone). Removes all ships of the
// defeated player and transfers their liquid resources to the captor.
function eliminatePlayer(
  state: GameState,
  defeatedId: string,
  captorId: string,
): void {
  const defeated = state.players.find((p) => p.id === defeatedId)!;
  const captor = state.players.find((p) => p.id === captorId)!;

  defeated.defeated = true;
  captor.gold += defeated.gold;
  captor.papers += defeated.papers;
  defeated.gold = 0;
  defeated.papers = 0;
  defeated.hand = [];
  state.board.ships = state.board.ships.filter((s) => s.ownerId !== defeatedId);
}

function advanceTurn(next: GameState): void {
  const total = next.players.length;
  const prevIdx = next.currentPlayerIndex;
  let idx = prevIdx;
  for (let i = 0; i < total; i++) {
    idx = (idx + 1) % total;
    if (!next.players[idx]!.defeated) break;
  }
  if (idx <= prevIdx) next.turnNumber += 1;
  next.currentPlayerIndex = idx;
}

export function applyMove(state: GameState, move: Move): GameState {
  const legal = legalMoves(state);
  const ok = legal.some(
    (m) =>
      m.type === move.type && m.shipId === move.shipId && posEq(m.to, move.to),
  );

  if (!ok) throw new Error("illegal move");

  const next = structuredClone(state);
  const currentPlayer = next.players[next.currentPlayerIndex]!;
  const target = move.to;

  // -------------------------------------------------------------------------
  // Launch
  // -------------------------------------------------------------------------
  if (move.type === "launch") {
    const invIdx = currentPlayer.inventory.findIndex(
      (s) => s.id === move.shipId,
    );
    const invShip = currentPlayer.inventory[invIdx]!;
    const cost = SHIP_COST[invShip.type] ?? 0;
    const premium = zonePremium(target);

    currentPlayer.gold -= cost + premium;
    next.hq.gold += cost + premium;
    currentPlayer.inventory.splice(invIdx, 1);
    next.board.ships.push({
      id: invShip.id,
      type: invShip.type,
      ownerId: currentPlayer.id,
      pos: target,
      blocked: false,
    });

    advanceTurn(next);
    return next;
  }

  // -------------------------------------------------------------------------
  // Move
  // -------------------------------------------------------------------------
  const ship = next.board.ships.find((s) => s.id === move.shipId)!;
  const enemy = next.board.ships.find(
    (s) => s.ownerId !== currentPlayer.id && posEq(s.pos, target),
  );

  ship.pos = target;

  // Ram
  if (enemy) {
    next.board.ships = next.board.ships.filter((s) => s.id !== enemy.id);
    if (enemy.type === "cruiser") {
      eliminatePlayer(next, enemy.ownerId, currentPlayer.id);
    } else if (next.mode.relaunchEnabled) {
      // Non-cruiser returns to enemy inventory for future relaunch
      const enemyPlayer = next.players.find((p) => p.id === enemy.ownerId);
      if (enemyPlayer && !enemyPlayer.defeated) {
        enemyPlayer.inventory.push({ id: enemy.id, type: enemy.type });
      }
    }
  }

  // Pick up gold
  const gIdx = next.board.gold.findIndex((g) => posEq(g.pos, target));
  if (gIdx !== -1) {
    currentPlayer.gold += next.board.gold[gIdx]!.amount;
    next.board.gold.splice(gIdx, 1);
  }

  // Pick up paper
  const pIdx = next.board.papers.findIndex((p) => posEq(p.pos, target));
  if (pIdx !== -1) {
    currentPlayer.papers += 1;
    next.board.papers.splice(pIdx, 1);
  }

  // Island capture: landing on an enemy-owned command base
  for (const color of PLAYER_COLORS) {
    if (!posEq(ISLAND_DEF[color].commandBase, target)) continue;
    const priorOwner = next.islandOwnership[color as PlayerColor];
    if (priorOwner === null || priorOwner === currentPlayer.id) break;

    next.islandOwnership[color as PlayerColor] = currentPlayer.id;
    const remaining = PLAYER_COLORS.filter(
      (c) => next.islandOwnership[c as PlayerColor] === priorOwner,
    );
    if (remaining.length === 0) {
      eliminatePlayer(next, priorOwner, currentPlayer.id);
    }
    break;
  }

  // Game-over check
  const alive = next.players.filter((p) => !p.defeated);
  if (alive.length === 1) {
    next.phase = "finished";
    next.winner = alive[0]!.id;
    return next;
  }

  advanceTurn(next);
  return next;
}
