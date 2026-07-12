import { describe, expect, it } from "vitest";
import {
  GOLD_PRODUCTION_CONFIG,
  ISLAND_DEF,
  PLAYER_COLORS,
  WEAPON_OFFSETS,
} from "./constants.js";
import { createGame } from "./createGame.js";
import { applyMove, legalMoves, moveKey } from "./movement.js";
import type {
  GameState,
  PlayerColor,
  ShipState,
  WeaponCard,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Test state builder — 2-player (purple=p0, green=p1) with overrideable ships
// ---------------------------------------------------------------------------

const P0 = "player-purple";
const P1 = "player-green";

function makeState(
  opts: {
    ships?: ShipState[];
    currentPlayerIndex?: 0 | 1;
    islandOwnership?: Partial<Record<PlayerColor, string | null>>;
  } = {},
): GameState {
  const defaultShips: ShipState[] = [
    {
      id: "purple-cruiser",
      type: "cruiser",
      ownerId: P0,
      pos: ISLAND_DEF.purple.commandBase,
      blocked: false,
    },
    {
      id: "green-cruiser",
      type: "cruiser",
      ownerId: P1,
      pos: ISLAND_DEF.green.commandBase,
      blocked: false,
    },
  ];

  return {
    phase: "playing",
    mode: GOLD_PRODUCTION_CONFIG,
    players: [
      {
        id: P0,
        color: "purple",
        gold: 1000,
        papers: 0,
        hand: [],
        inventory: [],
        defeated: false,
      },
      {
        id: P1,
        color: "green",
        gold: 1000,
        papers: 0,
        hand: [],
        inventory: [],
        defeated: false,
      },
    ],
    currentPlayerIndex: opts.currentPlayerIndex ?? 0,
    turnNumber: 1,
    board: {
      ships: opts.ships ?? defaultShips,
      gold: [],
      papers: [],
    },
    islandOwnership: {
      purple: P0,
      yellow: null,
      green: P1,
      red: null,
      ...opts.islandOwnership,
    },
    hq: {
      gold: 4000,
      cards: { missile: 12, pirate: 4, jammer: 4, defence: 4 },
    },
    pendingAttack: null,
    rngSeed: 1,
    winner: null,
  };
}

// Narrows to plain movement actions — the movement describes below query
// states where no other action type can exist (no cards, no inventories).
function moveActions(state: GameState) {
  return legalMoves(state).filter((m) => m.type === "move");
}

// ---------------------------------------------------------------------------
// Cruiser / corvette — king-1 (all 8 Moore neighbors)
// ---------------------------------------------------------------------------

describe("legalMoves: cruiser / corvette", () => {
  it("from (4,4): exactly 8 Moore neighbors are legal", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
      ],
    });
    const moves = moveActions(state).filter(
      (m) => m.shipId === "purple-cruiser",
    );
    expect(moves).toHaveLength(8);
    for (const [dc, dr] of [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      expect(
        moves.some((m) => m.to.col === 4 + dc && m.to.row === 4 + dr),
      ).toBe(true);
    }
  });

  it("distance-2 square (4,6) is NOT legal from (4,4)", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
      ],
    });
    expect(
      moveActions(state).some((m) => m.to.col === 4 && m.to.row === 6),
    ).toBe(false);
  });

  it("own ship at (5,5) blocks that square", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
        {
          id: "purple-corvette",
          type: "corvette",
          ownerId: P0,
          pos: { col: 5, row: 5 },
          blocked: false,
        },
      ],
    });
    expect(
      moveActions(state).some(
        (m) =>
          m.shipId === "purple-cruiser" && m.to.col === 5 && m.to.row === 5,
      ),
    ).toBe(false);
  });

  it("enemy NOT on their own base → can ram", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: { col: 5, row: 5 },
          blocked: false,
        },
      ],
    });
    expect(
      moveActions(state).some(
        (m) =>
          m.shipId === "purple-cruiser" && m.to.col === 5 && m.to.row === 5,
      ),
    ).toBe(true);
  });

  it("enemy on their OWN command base → cannot ram (base protection §3)", () => {
    const greenBase = ISLAND_DEF.green.commandBase; // (1,4)
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: greenBase.col + 1, row: greenBase.row },
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: greenBase,
          blocked: false,
        },
      ],
    });
    expect(
      moveActions(state).some(
        (m) =>
          m.shipId === "purple-cruiser" &&
          m.to.col === greenBase.col &&
          m.to.row === greenBase.row,
      ),
    ).toBe(false);
  });

  it("enemy at a base it does NOT own → can ram (protection is per-owner)", () => {
    // Green corvette sits at yellow's command base (4,1).
    // Nobody owns yellow's island in a 2-player game → green is NOT base-protected there.
    const yellowBase = ISLAND_DEF.yellow.commandBase; // (4,1)
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: yellowBase.col - 1, row: yellowBase.row },
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: yellowBase,
          blocked: false,
        },
      ],
      // islandOwnership.yellow remains null — green doesn't own it
    });
    expect(
      moveActions(state).some(
        (m) =>
          m.shipId === "purple-cruiser" &&
          m.to.col === yellowBase.col &&
          m.to.row === yellowBase.row,
      ),
    ).toBe(true);
  });

  it("blocked ship has zero legal moves", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: true,
        },
      ],
    });
    expect(
      moveActions(state).filter((m) => m.shipId === "purple-cruiser"),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Destroyer — 1-2 orthogonal, no diagonal
// ---------------------------------------------------------------------------

describe("legalMoves: destroyer", () => {
  const d = (pos = { col: 4, row: 4 }, extra: ShipState[] = []) =>
    makeState({
      ships: [
        {
          id: "purple-destroyer",
          type: "destroyer",
          ownerId: P0,
          pos,
          blocked: false,
        },
        ...extra,
      ],
    });

  it("all 4 orthogonal 1-zone moves from (4,4)", () => {
    const moves = moveActions(d()).filter(
      (m) => m.shipId === "purple-destroyer",
    );
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 3 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 5)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 3)).toBe(true);
  });

  it("diagonal (5,5) is NOT legal for destroyer", () => {
    expect(
      moveActions(d()).some(
        (m) =>
          m.shipId === "purple-destroyer" && m.to.col === 5 && m.to.row === 5,
      ),
    ).toBe(false);
  });

  it("2-zone orthogonal (6,4) is legal when (5,4) is clear", () => {
    expect(
      moveActions(d()).some(
        (m) =>
          m.shipId === "purple-destroyer" && m.to.col === 6 && m.to.row === 4,
      ),
    ).toBe(true);
  });

  it("enemy at (5,4) → RAM_THROUGH: emits (5,4), deduped to exactly one entry", () => {
    const state = d({ col: 4, row: 4 }, [
      {
        id: "green-corvette",
        type: "corvette",
        ownerId: P1,
        pos: { col: 5, row: 4 },
        blocked: false,
      },
    ]);
    const hits = moveActions(state).filter(
      (m) =>
        m.shipId === "purple-destroyer" && m.to.col === 5 && m.to.row === 4,
    );
    expect(hits).toHaveLength(1);
  });

  it("own ship at (5,4) blocks both (5,4) and (6,4)", () => {
    const state = d({ col: 4, row: 4 }, [
      {
        id: "purple-corvette",
        type: "corvette",
        ownerId: P0,
        pos: { col: 5, row: 4 },
        blocked: false,
      },
    ]);
    const moves = moveActions(state).filter(
      (m) => m.shipId === "purple-destroyer",
    );
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 4)).toBe(false);
    expect(moves.some((m) => m.to.col === 6 && m.to.row === 4)).toBe(false);
  });

  it("diagonal 2-zone (6,6) is NOT legal for destroyer", () => {
    expect(
      moveActions(d()).some(
        (m) =>
          m.shipId === "purple-destroyer" && m.to.col === 6 && m.to.row === 6,
      ),
    ).toBe(false);
  });

  it("near-edge: (8,4) legal from (7,4); out-of-bounds (9,4) and (10,4) filtered", () => {
    const moves = moveActions(d({ col: 7, row: 4 })).filter(
      (m) => m.shipId === "purple-destroyer",
    );
    expect(moves.some((m) => m.to.col === 8 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 9 && m.to.row === 4)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Submarine — 1 orthogonal OR 2 diagonal (not 1 diagonal, not 2 orthogonal)
// ---------------------------------------------------------------------------

describe("legalMoves: submarine", () => {
  const s = (pos = { col: 4, row: 4 }, extra: ShipState[] = []) =>
    makeState({
      ships: [
        {
          id: "purple-sub",
          type: "submarine",
          ownerId: P0,
          pos,
          blocked: false,
        },
        ...extra,
      ],
    });

  it("all 4 orthogonal 1-zone moves from (4,4)", () => {
    const moves = moveActions(s()).filter((m) => m.shipId === "purple-sub");
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 3 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 5)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 3)).toBe(true);
  });

  it("diagonal 1-zone (5,5) is NOT legal for submarine", () => {
    expect(
      moveActions(s()).some(
        (m) => m.shipId === "purple-sub" && m.to.col === 5 && m.to.row === 5,
      ),
    ).toBe(false);
  });

  it("2-zone diagonal (6,6) is legal when (5,5) is clear", () => {
    expect(
      moveActions(s()).some(
        (m) => m.shipId === "purple-sub" && m.to.col === 6 && m.to.row === 6,
      ),
    ).toBe(true);
  });

  it("enemy at (5,5) NOT on base → RAM_THROUGH: emits (5,5), NOT (6,6)", () => {
    const state = s({ col: 4, row: 4 }, [
      {
        id: "green-corvette",
        type: "corvette",
        ownerId: P1,
        pos: { col: 5, row: 5 },
        blocked: false,
      },
    ]);
    const moves = moveActions(state).filter((m) => m.shipId === "purple-sub");
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 5)).toBe(true);
    expect(moves.some((m) => m.to.col === 6 && m.to.row === 6)).toBe(false);
  });

  it("own ship at (5,5) blocks both (5,5) and (6,6)", () => {
    const state = s({ col: 4, row: 4 }, [
      {
        id: "purple-corvette",
        type: "corvette",
        ownerId: P0,
        pos: { col: 5, row: 5 },
        blocked: false,
      },
    ]);
    const moves = moveActions(state).filter((m) => m.shipId === "purple-sub");
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 5)).toBe(false);
    expect(moves.some((m) => m.to.col === 6 && m.to.row === 6)).toBe(false);
  });

  it("base-protected enemy at intermediate (green base (1,4)) blocks both intermediate and far", () => {
    // Sub at (0,3), enemy at green's base (1,4) owned by green.
    // 2-diagonal: intermediate=(1,4)=greenBase, far=(2,5).
    const greenBase = ISLAND_DEF.green.commandBase; // (1,4)
    const subPos = { col: greenBase.col - 1, row: greenBase.row - 1 }; // (0,3)
    const farPos = { col: greenBase.col + 1, row: greenBase.row + 1 }; // (2,5)
    const state = makeState({
      ships: [
        {
          id: "purple-sub",
          type: "submarine",
          ownerId: P0,
          pos: subPos,
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: greenBase,
          blocked: false,
        },
      ],
    });
    const moves = moveActions(state).filter((m) => m.shipId === "purple-sub");
    expect(moves.some((m) => posEq(m.to, greenBase))).toBe(false);
    expect(moves.some((m) => posEq(m.to, farPos))).toBe(false);
  });

  it("base-protected enemy at FAR square blocks that square", () => {
    // Sub at (3,6), green cruiser at green's base (1,4).
    // 2-diagonal from (3,6): intermediate=(2,5) clear, far=(1,4)=green's base, green-protected.
    const greenBase = ISLAND_DEF.green.commandBase; // (1,4)
    const subPos = { col: greenBase.col + 2, row: greenBase.row + 2 }; // (3,6)
    const state = makeState({
      ships: [
        {
          id: "purple-sub",
          type: "submarine",
          ownerId: P0,
          pos: subPos,
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: greenBase,
          blocked: false,
        },
      ],
    });
    const moves = moveActions(state).filter((m) => m.shipId === "purple-sub");
    expect(moves.some((m) => posEq(m.to, greenBase))).toBe(false);
  });

  it("2-zone orthogonal (6,4) is NOT legal for submarine", () => {
    expect(
      moveActions(s()).some(
        (m) => m.shipId === "purple-sub" && m.to.col === 6 && m.to.row === 4,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMove consequences
// ---------------------------------------------------------------------------

describe("applyMove", () => {
  it("returns a new object reference (immutable)", () => {
    const state = makeState();
    const legal = legalMoves(state);
    const result = applyMove(state, legal[0]!);
    expect(result).not.toBe(state);
  });

  it("ram: enemy ship removed from board", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: { col: 5, row: 5 },
          blocked: false,
        },
      ],
    });
    const result = applyMove(state, {
      type: "move",
      shipId: "purple-cruiser",
      to: { col: 5, row: 5 },
    });
    expect(result.board.ships.some((s) => s.id === "green-corvette")).toBe(
      false,
    );
  });

  it("ram enemy cruiser: enemy marked defeated, ALL their ships removed", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: { col: 5, row: 5 },
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: { col: 3, row: 3 },
          blocked: false,
        },
      ],
    });
    const result = applyMove(state, {
      type: "move",
      shipId: "purple-cruiser",
      to: { col: 5, row: 5 },
    });
    expect(result.players.find((p) => p.id === P1)?.defeated).toBe(true);
    expect(result.board.ships.some((s) => s.ownerId === P1)).toBe(false);
  });

  it("illegal move throws", () => {
    const state = makeState();
    expect(() =>
      applyMove(state, {
        type: "move",
        shipId: "purple-cruiser",
        to: { col: 4, row: 6 },
      }),
    ).toThrow("illegal move");
  });

  it("island capture: ownership transfers to attacker", () => {
    const greenBase = ISLAND_DEF.green.commandBase; // (1,4)
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: greenBase.col + 1, row: greenBase.row },
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
      ],
    });
    const result = applyMove(state, {
      type: "move",
      shipId: "purple-cruiser",
      to: greenBase,
    });
    expect(result.islandOwnership.green).toBe(P0);
  });

  it("capturing last island defeats prior owner and removes their ships", () => {
    const greenBase = ISLAND_DEF.green.commandBase;
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: greenBase.col + 1, row: greenBase.row },
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
      ],
    });
    const result = applyMove(state, {
      type: "move",
      shipId: "purple-cruiser",
      to: greenBase,
    });
    expect(result.players.find((p) => p.id === P1)?.defeated).toBe(true);
    expect(result.board.ships.some((s) => s.ownerId === P1)).toBe(false);
  });

  it("defeated player's gold transferred to captor on island capture", () => {
    const greenBase = ISLAND_DEF.green.commandBase;
    const base = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: greenBase.col + 1, row: greenBase.row },
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
      ],
    });
    const state = structuredClone(base) as GameState;
    state.players[1]!.gold = 500;
    const result = applyMove(state, {
      type: "move",
      shipId: "purple-cruiser",
      to: greenBase,
    });
    expect(result.players.find((p) => p.id === P0)?.gold).toBe(1000 + 500);
  });

  it("turn advances to the next player after a move", () => {
    const state = makeState();
    const result = applyMove(state, legalMoves(state)[0]!);
    expect(result.currentPlayerIndex).toBe(1);
  });

  it("turnNumber increments when index wraps past player 0", () => {
    const state = makeState({ currentPlayerIndex: 1 });
    const result = applyMove(state, legalMoves(state)[0]!);
    expect(result.turnNumber).toBe(2);
  });

  it("turn advance skips defeated players (4-player game)", () => {
    const full = createGame(
      GOLD_PRODUCTION_CONFIG,
      ["p1", "p2", "p3", "p4"],
      42,
    );
    const state = structuredClone(full) as GameState;
    // Defeat player at index 1 artificially
    state.players[1]!.defeated = true;
    state.board.ships = state.board.ships.filter((s) => s.ownerId !== "p2");
    const result = applyMove(state, legalMoves(state)[0]!);
    expect(result.currentPlayerIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// RAM_THROUGH: submarine stops and rams at diagonal intermediate
// ---------------------------------------------------------------------------

describe("RAM_THROUGH — submarine stops at diagonal intermediate", () => {
  it("sub lands at (5,5) and rams enemy there; (6,6) is not reached", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-sub",
          type: "submarine",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: { col: 5, row: 5 },
          blocked: false,
        },
      ],
    });
    const result = applyMove(state, {
      type: "move",
      shipId: "purple-sub",
      to: { col: 5, row: 5 },
    });
    expect(result.board.ships.find((s) => s.id === "purple-sub")?.pos).toEqual({
      col: 5,
      row: 5,
    });
    expect(result.board.ships.some((s) => s.id === "green-corvette")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

describe("createGame", () => {
  it("same seed → deterministic output", () => {
    const a = createGame(GOLD_PRODUCTION_CONFIG, ["alice", "bob"], 99);
    const b = createGame(GOLD_PRODUCTION_CONFIG, ["alice", "bob"], 99);
    expect(a).toEqual(b);
  });

  it("3 players → throws", () => {
    expect(() =>
      createGame(GOLD_PRODUCTION_CONFIG, ["a", "b", "c"], 1),
    ).toThrow("player count must be 2 or 4");
  });

  it("4 players: each cruiser at its color's command base", () => {
    const state = createGame(
      GOLD_PRODUCTION_CONFIG,
      ["p1", "p2", "p3", "p4"],
      1,
    );
    expect(state.players).toHaveLength(4);
    for (const player of state.players) {
      const base = ISLAND_DEF[player.color].commandBase;
      const cruiser = state.board.ships.find(
        (s) => s.ownerId === player.id && s.type === "cruiser",
      );
      expect(cruiser?.pos).toEqual(base);
    }
  });

  it("2 players: exactly 2 colors used; unused colors have null ownership", () => {
    const state = createGame(GOLD_PRODUCTION_CONFIG, ["alice", "bob"], 1);
    expect(state.players).toHaveLength(2);
    const used = new Set(state.players.map((p) => p.color));
    for (const c of PLAYER_COLORS) {
      if (!used.has(c)) {
        expect(state.islandOwnership[c]).toBeNull();
      }
    }
  });

  it("2 players: colors are always an opposite pair (purple/green or red/yellow)", () => {
    const validPairs = [
      new Set(["purple", "green"]),
      new Set(["red", "yellow"]),
    ];
    for (let seed = 0; seed < 20; seed++) {
      const state = createGame(GOLD_PRODUCTION_CONFIG, ["a", "b"], seed);
      const colors = new Set(state.players.map((p) => p.color));
      expect(
        validPairs.some(
          (pair) =>
            pair.size === colors.size &&
            [...pair].every((c) => colors.has(c as PlayerColor)),
        ),
      ).toBe(true);
    }
  });

  it("Gold Production: cruiser on board, 6-ship inventory, papers at lighthouses", () => {
    const state = createGame(GOLD_PRODUCTION_CONFIG, ["alice", "bob"], 1);
    expect(state.board.papers).toHaveLength(4);
    for (const player of state.players) {
      expect(player.inventory).toHaveLength(6); // destroyer + sub + 4 corvettes
    }
  });
});

// ---------------------------------------------------------------------------
// Helper used in RAM_THROUGH base-protection test
// ---------------------------------------------------------------------------
function posEq(
  a: { col: number; row: number },
  b: { col: number; row: number },
): boolean {
  return a.col === b.col && a.row === b.row;
}

// ---------------------------------------------------------------------------
// Launching + economy
// ---------------------------------------------------------------------------

describe("legalMoves: launches", () => {
  it("affordable launch appears in legalMoves", () => {
    const purpleBase = ISLAND_DEF.purple.commandBase; // (7,4)
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: purpleBase,
          blocked: false,
        },
      ],
    });
    // Give purple player a corvette in inventory and enough gold
    const s = structuredClone(state) as GameState;
    s.players[0]!.inventory = [{ id: "purple-corvette-1", type: "corvette" }];
    s.players[0]!.gold = 1000;

    const launches = legalMoves(s).filter((m) => m.type === "launch");
    // Purple owns purple's island; 9 zones, but (7,4) is occupied by cruiser
    expect(launches.length).toBeGreaterThan(0);
    expect(launches.every((m) => m.type === "launch")).toBe(true);
  });

  it("unaffordable launch NOT in legalMoves (gold < cost + premium)", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: ISLAND_DEF.purple.commandBase,
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    // destroyer costs 300; set gold to 299
    s.players[0]!.inventory = [{ id: "purple-destroyer", type: "destroyer" }];
    s.players[0]!.gold = 299;

    const launches = legalMoves(s).filter((m) => m.type === "launch");
    expect(launches).toHaveLength(0);
  });

  it("unaffordable due to premium NOT in legalMoves", () => {
    // Purple (6,4) has premium 200. Corvette cost 100. Total 300.
    // Gold = 299 → can't afford the 200-premium zone.
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: ISLAND_DEF.purple.commandBase,
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    s.players[0]!.inventory = [{ id: "purple-corvette-1", type: "corvette" }];
    s.players[0]!.gold = 299; // can afford 100-premium zones (cost 200) but not 200-premium (cost 300)

    const launches = legalMoves(s).filter((m) => m.type === "launch");
    // Can still launch to free/100-premium zones (cost 100 and 200) but not (6,4) (cost 300)
    expect(launches.some((m) => m.to.col === 6 && m.to.row === 4)).toBe(false);
    // But can reach free zones (total 100 ≤ 299)
    expect(launches.length).toBeGreaterThan(0);
  });

  it("launch onto occupied zone NOT in legalMoves", () => {
    const purpleBase = ISLAND_DEF.purple.commandBase; // (7,4)
    // Block (7,5) with purple's own corvette on the board
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: purpleBase,
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: { col: 7, row: 5 },
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    s.players[0]!.inventory = [{ id: "purple-corvette-1", type: "corvette" }];
    s.players[0]!.gold = 1000;

    const launches = legalMoves(s).filter((m) => m.type === "launch");
    expect(launches.some((m) => m.to.col === 7 && m.to.row === 5)).toBe(false);
  });

  it("launch onto non-owned island NOT in legalMoves", () => {
    // Purple doesn't own yellow's island; launching to yellow's zones illegal
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: ISLAND_DEF.purple.commandBase,
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    s.players[0]!.inventory = [{ id: "purple-corvette-1", type: "corvette" }];
    s.players[0]!.gold = 1000;

    const yellowBase = ISLAND_DEF.yellow.commandBase;
    const launches = legalMoves(s).filter((m) => m.type === "launch");
    // None of the launches should target yellow's zone
    const yellowLaunches = launches.filter(
      (m) =>
        Math.abs(m.to.col - yellowBase.col) <= 1 &&
        Math.abs(m.to.row - yellowBase.row) <= 1,
    );
    expect(yellowLaunches).toHaveLength(0);
  });

  it("cruiser never appears as a launch candidate", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: ISLAND_DEF.purple.commandBase,
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    // Force a cruiser into inventory (artificial — wouldn't happen in real play)
    s.players[0]!.inventory = [{ id: "purple-cruiser-2", type: "cruiser" }];
    s.players[0]!.gold = 9999;

    const launches = legalMoves(s).filter((m) => m.type === "launch");
    expect(launches).toHaveLength(0);
  });

  it("launches only offered for current player's inventory, not opponent's", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: ISLAND_DEF.purple.commandBase,
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    s.players[0]!.inventory = [];
    s.players[0]!.gold = 1000;
    // Give opponent a corvette in inventory
    s.players[1]!.inventory = [{ id: "green-corvette-1", type: "corvette" }];

    const launches = legalMoves(s).filter((m) => m.type === "launch");
    // No launches since current player has empty inventory
    expect(launches).toHaveLength(0);
    // And the opponent's ship should not appear
    expect(launches.some((m) => m.shipId === "green-corvette-1")).toBe(false);
  });
});

describe("applyMove: launch", () => {
  // Helper: purple player at their base, corvette in inventory, 1000 gold
  function launchState(): GameState {
    const purpleBase = ISLAND_DEF.purple.commandBase;
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: purpleBase,
          blocked: false,
        },
        {
          id: "green-cruiser",
          type: "cruiser",
          ownerId: P1,
          pos: ISLAND_DEF.green.commandBase,
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    s.players[0]!.inventory = [{ id: "purple-corvette-1", type: "corvette" }];
    s.players[0]!.gold = 1000;
    return s;
  }

  it("ship moves from inventory to board at target zone", () => {
    const state = launchState();
    // Launch to (8,4) — a free zone of purple's island
    const result = applyMove(state, {
      type: "launch",
      shipId: "purple-corvette-1",
      to: { col: 8, row: 4 },
    });
    expect(result.board.ships.some((s) => s.id === "purple-corvette-1")).toBe(
      true,
    );
    expect(
      result.board.ships.find((s) => s.id === "purple-corvette-1")?.pos,
    ).toEqual({ col: 8, row: 4 });
    expect(
      result.players[0]!.inventory.some((s) => s.id === "purple-corvette-1"),
    ).toBe(false);
  });

  it("player.gold decremented by cost + premium", () => {
    const state = launchState();
    // (7,5) has premium 100; corvette cost 100 → total 200
    const result = applyMove(state, {
      type: "launch",
      shipId: "purple-corvette-1",
      to: { col: 7, row: 5 },
    });
    expect(result.players[0]!.gold).toBe(1000 - 200);
  });

  it("gold conservation: player.gold + hq.gold unchanged by a launch", () => {
    const state = launchState();
    const before = state.players[0]!.gold + state.hq.gold;
    const result = applyMove(state, {
      type: "launch",
      shipId: "purple-corvette-1",
      to: { col: 7, row: 5 }, // premium 100, cost 100 → 200 transferred
    });
    const after = result.players[0]!.gold + result.hq.gold;
    expect(after).toBe(before);
  });

  it("hq.gold increased by cost + premium", () => {
    const state = launchState();
    const hqBefore = state.hq.gold;
    const result = applyMove(state, {
      type: "launch",
      shipId: "purple-corvette-1",
      to: { col: 7, row: 5 }, // premium 100, cost 100 → 200
    });
    expect(result.hq.gold).toBe(hqBefore + 200);
  });

  it("illegal launch throws", () => {
    const state = launchState();
    // Attempt to launch to green's island (not owned by purple)
    expect(() =>
      applyMove(state, {
        type: "launch",
        shipId: "purple-corvette-1",
        to: ISLAND_DEF.green.commandBase,
      }),
    ).toThrow("illegal move");
  });
});

describe("ram: relaunchEnabled — destroyed non-cruiser returns to inventory", () => {
  it("relaunchEnabled=true: rammed corvette returned to enemy inventory", () => {
    // GOLD_PRODUCTION_CONFIG has relaunchEnabled: true
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: { col: 5, row: 5 },
          blocked: false,
        },
      ],
    });
    const result = applyMove(state, {
      type: "move",
      shipId: "purple-cruiser",
      to: { col: 5, row: 5 },
    });
    expect(result.board.ships.some((s) => s.id === "green-corvette")).toBe(
      false,
    );
    expect(
      result.players
        .find((p) => p.id === P1)
        ?.inventory.some((s) => s.id === "green-corvette"),
    ).toBe(true);
  });

  it("relaunchEnabled=false: rammed corvette NOT returned to inventory", () => {
    const state = makeState({
      ships: [
        {
          id: "purple-cruiser",
          type: "cruiser",
          ownerId: P0,
          pos: { col: 4, row: 4 },
          blocked: false,
        },
        {
          id: "green-corvette",
          type: "corvette",
          ownerId: P1,
          pos: { col: 5, row: 5 },
          blocked: false,
        },
      ],
    });
    const s = structuredClone(state) as GameState;
    s.mode = { ...s.mode, relaunchEnabled: false };

    const result = applyMove(s, {
      type: "move",
      shipId: "purple-cruiser",
      to: { col: 5, row: 5 },
    });
    expect(result.board.ships.some((sh) => sh.id === "green-corvette")).toBe(
      false,
    );
    expect(
      result.players
        .find((p) => p.id === P1)
        ?.inventory.some((sh) => sh.id === "green-corvette"),
    ).toBe(false);
  });

  it("rammed corvette can be relaunched on owner's next turn (relaunch is a loop)", () => {
    // Construct the post-ram state: green-corvette already in P1's inventory, P1's turn
    const state = makeState({ currentPlayerIndex: 1 });
    const s = structuredClone(state) as GameState;
    s.players[1]!.inventory = [{ id: "green-corvette", type: "corvette" }];
    // Green cruiser sits at (1,4) — commandBase is occupied. Pick (0,4): free, no premium, cost=100.
    const target = { col: 0, row: 4 };

    const launchOffer = legalMoves(s).find(
      (m) =>
        m.type === "launch" &&
        m.shipId === "green-corvette" &&
        posEq(m.to, target),
    );
    expect(launchOffer).toBeDefined();

    const next = applyMove(s, launchOffer!);
    expect(
      next.board.ships.some(
        (sh) => sh.id === "green-corvette" && posEq(sh.pos, target),
      ),
    ).toBe(true);
    expect(
      next.players
        .find((p) => p.id === P1)
        ?.inventory.some((sh) => sh.id === "green-corvette"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Weapons (§7)
// ---------------------------------------------------------------------------

function withHand(
  state: GameState,
  idx: number,
  hand: WeaponCard[],
): GameState {
  const s = structuredClone(state) as GameState;
  s.players[idx]!.hand = [...hand];
  return s;
}

// Per-type card counts across all hands + HQ — the conservation invariant
function cardTotals(state: GameState): Record<WeaponCard, number> {
  const totals = { ...state.hq.cards };
  for (const p of state.players) {
    for (const c of p.hand) totals[c] += 1;
  }
  return totals;
}

const enemyAt = (col: number, row: number): ShipState => ({
  id: `enemy-${col}-${row}`,
  type: "corvette",
  ownerId: P1,
  pos: { col, row },
  blocked: false,
});

describe("legalMoves: missile range", () => {
  const cruiser = (blocked = false): ShipState => ({
    id: "purple-cruiser",
    type: "cruiser",
    ownerId: P0,
    pos: { col: 4, row: 4 },
    blocked,
  });

  it("enemies at all 8 distance-2 offsets → exactly 8 missile targets", () => {
    const offsets = WEAPON_OFFSETS.missile;
    const state = withHand(
      makeState({
        ships: [cruiser(), ...offsets.map((o) => enemyAt(4 + o.dc, 4 + o.dr))],
      }),
      0,
      ["missile"],
    );
    const weapons = legalMoves(state).filter((m) => m.type === "useWeapon");
    expect(weapons).toHaveLength(8);
    for (const o of offsets) {
      expect(
        weapons.some((m) => m.to.col === 4 + o.dc && m.to.row === 4 + o.dr),
      ).toBe(true);
    }
  });

  it("distance-1 and distance-3 enemies NOT offered", () => {
    const state = withHand(
      makeState({ ships: [cruiser(), enemyAt(5, 4), enemyAt(7, 4)] }),
      0,
      ["missile"],
    );
    expect(
      legalMoves(state).filter((m) => m.type === "useWeapon"),
    ).toHaveLength(0);
  });

  it("empty in-range zone NOT offered", () => {
    const state = withHand(makeState({ ships: [cruiser()] }), 0, ["missile"]);
    expect(
      legalMoves(state).filter((m) => m.type === "useWeapon"),
    ).toHaveLength(0);
  });

  it("own ship in range NOT offered", () => {
    const state = withHand(
      makeState({
        ships: [
          cruiser(),
          {
            id: "purple-corvette",
            type: "corvette",
            ownerId: P0,
            pos: { col: 6, row: 4 },
            blocked: false,
          },
        ],
      }),
      0,
      ["missile"],
    );
    expect(
      legalMoves(state).filter((m) => m.type === "useWeapon"),
    ).toHaveLength(0);
  });

  it("no missile card in hand → no missile moves", () => {
    const state = makeState({ ships: [cruiser(), enemyAt(6, 4)] });
    expect(
      legalMoves(state).filter((m) => m.type === "useWeapon"),
    ).toHaveLength(0);
  });

  it("blocked cruiser cannot fire", () => {
    const state = withHand(
      makeState({ ships: [cruiser(true), enemyAt(6, 4)] }),
      0,
      ["missile"],
    );
    expect(
      legalMoves(state).filter((m) => m.type === "useWeapon"),
    ).toHaveLength(0);
  });

  it("CAN target an enemy on its own command base (weapons ignore base protection §3)", () => {
    const greenBase = ISLAND_DEF.green.commandBase; // (1,4), owned by P1
    const state = withHand(
      makeState({
        ships: [
          {
            id: "purple-cruiser",
            type: "cruiser",
            ownerId: P0,
            pos: { col: greenBase.col + 2, row: greenBase.row },
            blocked: false,
          },
          {
            id: "green-cruiser",
            type: "cruiser",
            ownerId: P1,
            pos: greenBase,
            blocked: false,
          },
        ],
      }),
      0,
      ["missile"],
    );
    expect(
      legalMoves(state).some(
        (m) => m.type === "useWeapon" && posEq(m.to, greenBase),
      ),
    ).toBe(true);
  });
});

describe("legalMoves: pirate range", () => {
  const destroyer: ShipState = {
    id: "purple-destroyer",
    type: "destroyer",
    ownerId: P0,
    pos: { col: 4, row: 4 },
    blocked: false,
  };

  it("4 diagonal targets × 3 steal choices", () => {
    const state = withHand(
      makeState({
        ships: [
          destroyer,
          enemyAt(6, 6),
          enemyAt(6, 2),
          enemyAt(2, 6),
          enemyAt(2, 2),
        ],
      }),
      0,
      ["pirate"],
    );
    const weapons = legalMoves(state).filter((m) => m.type === "useWeapon");
    expect(weapons).toHaveLength(12);
    for (const o of WEAPON_OFFSETS.pirate) {
      const steals = weapons
        .filter((m) => m.to.col === 4 + o.dc && m.to.row === 4 + o.dr)
        .map((m) => m.steal)
        .sort();
      expect(steals).toEqual(["cards", "gold", "papers"]);
    }
  });

  it("orthogonal distance-2 enemy NOT offered", () => {
    const state = withHand(
      makeState({ ships: [destroyer, enemyAt(6, 4)] }),
      0,
      ["pirate"],
    );
    expect(
      legalMoves(state).filter((m) => m.type === "useWeapon"),
    ).toHaveLength(0);
  });
});

describe("legalMoves: jammer range", () => {
  const sub: ShipState = {
    id: "purple-sub",
    type: "submarine",
    ownerId: P0,
    pos: { col: 4, row: 4 },
    blocked: false,
  };

  it("exactly the 4 orthogonal distance-2 targets", () => {
    const state = withHand(
      makeState({
        ships: [
          sub,
          enemyAt(6, 4),
          enemyAt(2, 4),
          enemyAt(4, 6),
          enemyAt(4, 2),
        ],
      }),
      0,
      ["jammer"],
    );
    const weapons = legalMoves(state).filter((m) => m.type === "useWeapon");
    expect(weapons).toHaveLength(4);
    for (const o of WEAPON_OFFSETS.jammer) {
      expect(
        weapons.some((m) => m.to.col === 4 + o.dc && m.to.row === 4 + o.dr),
      ).toBe(true);
    }
  });

  it("diagonal enemy NOT offered", () => {
    const state = withHand(makeState({ ships: [sub, enemyAt(6, 6)] }), 0, [
      "jammer",
    ]);
    expect(
      legalMoves(state).filter((m) => m.type === "useWeapon"),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Defence interrupt
// ---------------------------------------------------------------------------

// Purple cruiser (4,4) missiles the green corvette at (6,4); green cruiser
// parked on green's base. Returns the PENDED state.
function pendMissile(
  extra: ShipState[] = [],
  greenHand: WeaponCard[] = [],
): GameState {
  const base = makeState({
    ships: [
      {
        id: "purple-cruiser",
        type: "cruiser",
        ownerId: P0,
        pos: { col: 4, row: 4 },
        blocked: false,
      },
      {
        id: "green-corvette",
        type: "corvette",
        ownerId: P1,
        pos: { col: 6, row: 4 },
        blocked: false,
      },
      {
        id: "green-cruiser",
        type: "cruiser",
        ownerId: P1,
        pos: ISLAND_DEF.green.commandBase,
        blocked: false,
      },
      ...extra,
    ],
  });
  const s = withHand(withHand(base, 0, ["missile"]), 1, greenHand);
  return applyMove(s, {
    type: "useWeapon",
    shipId: "purple-cruiser",
    to: { col: 6, row: 4 },
  });
}

describe("defence interrupt: attack pends", () => {
  it("useWeapon sets pendingAttack; target alive; card hand→HQ; turn NOT advanced", () => {
    const pended = pendMissile();
    expect(pended.pendingAttack).toEqual({
      attackingShipId: "purple-cruiser",
      targetShipId: "green-corvette",
      steal: null,
    });
    expect(pended.board.ships.some((s) => s.id === "green-corvette")).toBe(
      true,
    );
    expect(pended.players[0]!.hand).toEqual([]);
    expect(pended.hq.cards.missile).toBe(13);
    expect(pended.currentPlayerIndex).toBe(0);
    expect(pended.phase).toBe("playing");
  });

  it("while pending, legalMoves returns ONLY defender options", () => {
    const moves = legalMoves(pendMissile());
    expect(moves.length).toBeGreaterThan(0);
    expect(
      moves.every((m) => m.type === "defend" || m.type === "decline"),
    ).toBe(true);
  });

  it("defender with no defence card → decline is the only option", () => {
    expect(legalMoves(pendMissile())).toEqual([{ type: "decline" }]);
  });

  it("defend offered with card + adjacent unblocked corvette (not the target itself)", () => {
    const cv2: ShipState = {
      id: "green-corvette-2",
      type: "corvette",
      ownerId: P1,
      pos: { col: 6, row: 5 },
      blocked: false,
    };
    const moves = legalMoves(pendMissile([cv2], ["defence"]));
    expect(moves).toHaveLength(2);
    expect(
      moves.some((m) => m.type === "defend" && m.shipId === "green-corvette-2"),
    ).toBe(true);
    expect(
      moves.some((m) => m.type === "defend" && m.shipId === "green-corvette"),
    ).toBe(false);
  });

  it("no self-defence: a lone targeted corvette holding defence cannot protect itself", () => {
    expect(legalMoves(pendMissile([], ["defence"]))).toEqual([
      { type: "decline" },
    ]);
  });

  it("card but no corvette in range → decline only", () => {
    const farCv: ShipState = {
      id: "green-corvette-2",
      type: "corvette",
      ownerId: P1,
      pos: { col: 0, row: 8 },
      blocked: false,
    };
    expect(legalMoves(pendMissile([farCv], ["defence"]))).toEqual([
      { type: "decline" },
    ]);
  });

  it("blocked adjacent corvette cannot defend", () => {
    const blockedCv: ShipState = {
      id: "green-corvette-2",
      type: "corvette",
      ownerId: P1,
      pos: { col: 6, row: 5 },
      blocked: true,
    };
    expect(legalMoves(pendMissile([blockedCv], ["defence"]))).toEqual([
      { type: "decline" },
    ]);
  });
});

describe("defence interrupt: resolution", () => {
  const cv2: ShipState = {
    id: "green-corvette-2",
    type: "corvette",
    ownerId: P1,
    pos: { col: 6, row: 5 },
    blocked: false,
  };

  it("defend: both cards to HQ, target spared, turn advances", () => {
    const pended = pendMissile([cv2], ["defence"]);
    const r = applyMove(pended, { type: "defend", shipId: "green-corvette-2" });
    expect(r.hq.cards.missile).toBe(13);
    expect(r.hq.cards.defence).toBe(5);
    expect(r.players[1]!.hand).toEqual([]);
    expect(r.board.ships.some((s) => s.id === "green-corvette")).toBe(true);
    expect(r.pendingAttack).toBeNull();
    expect(r.currentPlayerIndex).toBe(1);
    expect(r.phase).toBe("playing");
  });

  it("decline missile: non-cruiser destroyed → owner inventory (relaunchEnabled)", () => {
    const r = applyMove(pendMissile(), { type: "decline" });
    expect(r.board.ships.some((s) => s.id === "green-corvette")).toBe(false);
    expect(r.players[1]!.inventory.some((s) => s.id === "green-corvette")).toBe(
      true,
    );
    expect(r.pendingAttack).toBeNull();
    expect(r.currentPlayerIndex).toBe(1);
  });

  it("decline missile with relaunchEnabled=false: ship vanishes", () => {
    const base = withHand(
      makeState({
        ships: [
          {
            id: "purple-cruiser",
            type: "cruiser",
            ownerId: P0,
            pos: { col: 4, row: 4 },
            blocked: false,
          },
          enemyAt(6, 4),
          {
            id: "green-cruiser",
            type: "cruiser",
            ownerId: P1,
            pos: ISLAND_DEF.green.commandBase,
            blocked: false,
          },
        ],
      }),
      0,
      ["missile"],
    );
    base.mode = { ...base.mode, relaunchEnabled: false };
    const pended = applyMove(base, {
      type: "useWeapon",
      shipId: "purple-cruiser",
      to: { col: 6, row: 4 },
    });
    const r = applyMove(pended, { type: "decline" });
    expect(r.board.ships.some((s) => s.id === "enemy-6-4")).toBe(false);
    expect(r.players[1]!.inventory).toHaveLength(0);
  });

  it("decline missile on a cruiser: 2-player game finishes, attacker wins", () => {
    const state = withHand(
      makeState({
        ships: [
          {
            id: "purple-cruiser",
            type: "cruiser",
            ownerId: P0,
            pos: { col: 4, row: 4 },
            blocked: false,
          },
          {
            id: "green-cruiser",
            type: "cruiser",
            ownerId: P1,
            pos: { col: 6, row: 4 },
            blocked: false,
          },
        ],
      }),
      0,
      ["missile"],
    );
    const pended = applyMove(state, {
      type: "useWeapon",
      shipId: "purple-cruiser",
      to: { col: 6, row: 4 },
    });
    const r = applyMove(pended, { type: "decline" });
    expect(r.players[1]!.defeated).toBe(true);
    expect(r.phase).toBe("finished");
    expect(r.winner).toBe(P0);
  });

  it("4-player mid-game elimination: turn advances to next LIVING player, game NOT finished", () => {
    const full = createGame(
      GOLD_PRODUCTION_CONFIG,
      ["p1", "p2", "p3", "p4"],
      7,
    );
    const s = structuredClone(full) as GameState;
    const attacker = s.players[0]!;
    const victim = s.players[1]!;
    const atkCruiser = s.board.ships.find((sh) => sh.ownerId === attacker.id)!;
    const vicCruiser = s.board.ships.find((sh) => sh.ownerId === victim.id)!;
    atkCruiser.pos = { col: 4, row: 4 };
    vicCruiser.pos = { col: 6, row: 4 };
    attacker.hand = ["missile"];

    const pended = applyMove(s, {
      type: "useWeapon",
      shipId: atkCruiser.id,
      to: { col: 6, row: 4 },
    });
    const r = applyMove(pended, { type: "decline" });
    expect(r.players[1]!.defeated).toBe(true);
    expect(r.board.ships.some((sh) => sh.ownerId === victim.id)).toBe(false);
    expect(r.phase).toBe("playing");
    expect(r.currentPlayerIndex).toBe(2);
  });

  it("decline jammer: target blocked and contributes no moves on its owner's turn", () => {
    const state = withHand(
      makeState({
        ships: [
          {
            id: "purple-sub",
            type: "submarine",
            ownerId: P0,
            pos: { col: 4, row: 4 },
            blocked: false,
          },
          {
            id: "green-corvette",
            type: "corvette",
            ownerId: P1,
            pos: { col: 6, row: 4 },
            blocked: false,
          },
          {
            id: "green-cruiser",
            type: "cruiser",
            ownerId: P1,
            pos: ISLAND_DEF.green.commandBase,
            blocked: false,
          },
        ],
      }),
      0,
      ["jammer"],
    );
    const pended = applyMove(state, {
      type: "useWeapon",
      shipId: "purple-sub",
      to: { col: 6, row: 4 },
    });
    const r = applyMove(pended, { type: "decline" });
    expect(r.board.ships.find((s) => s.id === "green-corvette")?.blocked).toBe(
      true,
    );
    // Now green's turn: the jammed corvette contributes nothing
    expect(r.currentPlayerIndex).toBe(1);
    const greenMoves = legalMoves(r);
    expect(
      greenMoves.some((m) => "shipId" in m && m.shipId === "green-corvette"),
    ).toBe(false);
    expect(greenMoves.length).toBeGreaterThan(0); // cruiser still moves
  });
});

describe("pirate steals", () => {
  // Purple destroyer (4,4) with a pirate card; green corvette at (6,6)
  function pirateState(): GameState {
    return withHand(
      makeState({
        ships: [
          {
            id: "purple-destroyer",
            type: "destroyer",
            ownerId: P0,
            pos: { col: 4, row: 4 },
            blocked: false,
          },
          enemyAt(6, 6),
          {
            id: "green-cruiser",
            type: "cruiser",
            ownerId: P1,
            pos: ISLAND_DEF.green.commandBase,
            blocked: false,
          },
        ],
      }),
      0,
      ["pirate"],
    );
  }

  function steal(state: GameState, choice: "gold" | "papers" | "cards") {
    const pended = applyMove(state, {
      type: "useWeapon",
      shipId: "purple-destroyer",
      to: { col: 6, row: 6 },
      steal: choice,
    });
    return applyMove(pended, { type: "decline" });
  }

  it("steal gold: full transfer, total conserved", () => {
    const state = pirateState();
    state.players[1]!.gold = 700;
    const before =
      state.players[0]!.gold + state.players[1]!.gold + state.hq.gold;
    const r = steal(state, "gold");
    expect(r.players[0]!.gold).toBe(1000 + 700);
    expect(r.players[1]!.gold).toBe(0);
    expect(r.players[0]!.gold + r.players[1]!.gold + r.hq.gold).toBe(before);
  });

  it("steal papers: full transfer", () => {
    const state = pirateState();
    state.players[1]!.papers = 3;
    const r = steal(state, "papers");
    expect(r.players[0]!.papers).toBe(3);
    expect(r.players[1]!.papers).toBe(0);
  });

  it("steal cards: hands merge, per-type totals conserved", () => {
    const state = withHand(pirateState(), 1, ["jammer", "defence"]);
    const before = cardTotals(state);
    const r = steal(state, "cards");
    expect(r.players[0]!.hand.sort()).toEqual(["defence", "jammer"]);
    expect(r.players[1]!.hand).toEqual([]);
    expect(cardTotals(r)).toEqual(before);
  });

  it("steal from empty is LEGAL and a conserving no-op", () => {
    const state = pirateState();
    state.players[1]!.gold = 0; // and hand is already empty
    const legal = legalMoves(state);
    expect(
      legal.some((m) => m.type === "useWeapon" && m.steal === "cards"),
    ).toBe(true);
    expect(
      legal.some((m) => m.type === "useWeapon" && m.steal === "gold"),
    ).toBe(true);

    const before = cardTotals(state);
    const r = steal(state, "cards");
    expect(r.players[0]!.hand).toEqual([]); // pirate card went to HQ at attack time
    expect(cardTotals(r)).toEqual(before);

    // steal gold at 0 gold: equally legal, transfers nothing
    const r2 = steal(state, "gold");
    expect(r2.players[0]!.gold).toBe(1000);
    expect(r2.players[1]!.gold).toBe(0);
  });
});

describe("weapons: illegal moves", () => {
  it("useWeapon at an out-of-range zone throws", () => {
    const state = withHand(
      makeState({
        ships: [
          {
            id: "purple-cruiser",
            type: "cruiser",
            ownerId: P0,
            pos: { col: 4, row: 4 },
            blocked: false,
          },
          enemyAt(5, 4),
        ],
      }),
      0,
      ["missile"],
    );
    expect(() =>
      applyMove(state, {
        type: "useWeapon",
        shipId: "purple-cruiser",
        to: { col: 5, row: 4 },
      }),
    ).toThrow("illegal move");
  });

  it("pirate without a steal choice throws", () => {
    const state = withHand(
      makeState({
        ships: [
          {
            id: "purple-destroyer",
            type: "destroyer",
            ownerId: P0,
            pos: { col: 4, row: 4 },
            blocked: false,
          },
          enemyAt(6, 6),
        ],
      }),
      0,
      ["pirate"],
    );
    expect(() =>
      applyMove(state, {
        type: "useWeapon",
        shipId: "purple-destroyer",
        to: { col: 6, row: 6 },
      }),
    ).toThrow("illegal move");
  });

  it("defend and decline throw when no attack pends", () => {
    const state = makeState();
    expect(() =>
      applyMove(state, { type: "defend", shipId: "purple-cruiser" }),
    ).toThrow("illegal move");
    expect(() => applyMove(state, { type: "decline" })).toThrow("illegal move");
  });

  it("move and launch throw while an attack pends", () => {
    const pended = pendMissile();
    expect(() =>
      applyMove(pended, {
        type: "move",
        shipId: "purple-cruiser",
        to: { col: 4, row: 5 },
      }),
    ).toThrow("illegal move");
    expect(() =>
      applyMove(pended, {
        type: "launch",
        shipId: "green-corvette-9",
        to: { col: 0, row: 4 },
      }),
    ).toThrow("illegal move");
  });

  it("a second useWeapon while an attack pends throws (no nesting)", () => {
    // Green cruiser at (2,4) COULD missile the purple cruiser at (4,4) on its
    // own turn — prove the pending state alone is what blocks it.
    const greenCruiser: ShipState = {
      id: "green-cruiser-attacker",
      type: "cruiser",
      ownerId: P1,
      pos: { col: 2, row: 4 },
      blocked: false,
    };
    const nested = {
      type: "useWeapon",
      shipId: "green-cruiser-attacker",
      to: { col: 4, row: 4 },
    } as const;

    // Counterfactual: legal for green when nothing pends
    const noPend = withHand(
      makeState({
        ships: [
          {
            id: "purple-cruiser",
            type: "cruiser",
            ownerId: P0,
            pos: { col: 4, row: 4 },
            blocked: false,
          },
          greenCruiser,
        ],
        currentPlayerIndex: 1,
      }),
      1,
      ["missile"],
    );
    expect(legalMoves(noPend).some((m) => moveKey(m) === moveKey(nested))).toBe(
      true,
    );

    // With purple's attack pending, the same intent throws
    const pended = pendMissile([greenCruiser], ["missile"]);
    expect(() => applyMove(pended, nested)).toThrow("illegal move");
  });
});

describe("weapons: invariants", () => {
  it("card totals conserved through attack→defend and attack→decline", () => {
    const cv2: ShipState = {
      id: "green-corvette-2",
      type: "corvette",
      ownerId: P1,
      pos: { col: 6, row: 5 },
      blocked: false,
    };
    // defend path
    const pendedD = pendMissile([cv2], ["defence"]);
    const totals = { missile: 13, pirate: 4, jammer: 4, defence: 4 };
    // (attacker started with 1 missile: 12 HQ + 1 hand = 13 total; defence 4+1=5)
    expect(cardTotals(pendedD)).toEqual({ ...totals, defence: 5 });
    const defended = applyMove(pendedD, {
      type: "defend",
      shipId: "green-corvette-2",
    });
    expect(cardTotals(defended)).toEqual({ ...totals, defence: 5 });

    // decline path
    const pended = pendMissile();
    expect(cardTotals(pended)).toEqual(totals);
    const declined = applyMove(pended, { type: "decline" });
    expect(cardTotals(declined)).toEqual(totals);
  });

  it("moveKey: every action type yields a distinct key on confusable fields", () => {
    const to = { col: 3, row: 3 };
    const keys = [
      moveKey({ type: "move", shipId: "x", to }),
      moveKey({ type: "launch", shipId: "x", to }),
      moveKey({ type: "useWeapon", shipId: "x", to }),
      moveKey({ type: "useWeapon", shipId: "x", to, steal: "gold" }),
      moveKey({ type: "defend", shipId: "x" }),
      moveKey({ type: "decline" }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
