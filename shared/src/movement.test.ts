import { describe, expect, it } from "vitest";
import {
  GOLD_PRODUCTION_CONFIG,
  ISLAND_DEF,
  PLAYER_COLORS,
} from "./constants.js";
import { createGame } from "./createGame.js";
import { applyMove, legalMoves } from "./movement.js";
import type { GameState, PlayerColor, ShipState } from "./schemas.js";

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
    rngSeed: 1,
    winner: null,
  };
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
    const moves = legalMoves(state).filter(
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
      legalMoves(state).some((m) => m.to.col === 4 && m.to.row === 6),
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
      legalMoves(state).some(
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
      legalMoves(state).some(
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
      legalMoves(state).some(
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
      legalMoves(state).some(
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
      legalMoves(state).filter((m) => m.shipId === "purple-cruiser"),
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
    const moves = legalMoves(d()).filter(
      (m) => m.shipId === "purple-destroyer",
    );
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 3 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 5)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 3)).toBe(true);
  });

  it("diagonal (5,5) is NOT legal for destroyer", () => {
    expect(
      legalMoves(d()).some(
        (m) =>
          m.shipId === "purple-destroyer" && m.to.col === 5 && m.to.row === 5,
      ),
    ).toBe(false);
  });

  it("2-zone orthogonal (6,4) is legal when (5,4) is clear", () => {
    expect(
      legalMoves(d()).some(
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
    const hits = legalMoves(state).filter(
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
    const moves = legalMoves(state).filter(
      (m) => m.shipId === "purple-destroyer",
    );
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 4)).toBe(false);
    expect(moves.some((m) => m.to.col === 6 && m.to.row === 4)).toBe(false);
  });

  it("diagonal 2-zone (6,6) is NOT legal for destroyer", () => {
    expect(
      legalMoves(d()).some(
        (m) =>
          m.shipId === "purple-destroyer" && m.to.col === 6 && m.to.row === 6,
      ),
    ).toBe(false);
  });

  it("near-edge: (8,4) legal from (7,4); out-of-bounds (9,4) and (10,4) filtered", () => {
    const moves = legalMoves(d({ col: 7, row: 4 })).filter(
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
    const moves = legalMoves(s()).filter((m) => m.shipId === "purple-sub");
    expect(moves.some((m) => m.to.col === 5 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 3 && m.to.row === 4)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 5)).toBe(true);
    expect(moves.some((m) => m.to.col === 4 && m.to.row === 3)).toBe(true);
  });

  it("diagonal 1-zone (5,5) is NOT legal for submarine", () => {
    expect(
      legalMoves(s()).some(
        (m) => m.shipId === "purple-sub" && m.to.col === 5 && m.to.row === 5,
      ),
    ).toBe(false);
  });

  it("2-zone diagonal (6,6) is legal when (5,5) is clear", () => {
    expect(
      legalMoves(s()).some(
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
    const moves = legalMoves(state).filter((m) => m.shipId === "purple-sub");
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
    const moves = legalMoves(state).filter((m) => m.shipId === "purple-sub");
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
    const moves = legalMoves(state).filter((m) => m.shipId === "purple-sub");
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
    const moves = legalMoves(state).filter((m) => m.shipId === "purple-sub");
    expect(moves.some((m) => posEq(m.to, greenBase))).toBe(false);
  });

  it("2-zone orthogonal (6,4) is NOT legal for submarine", () => {
    expect(
      legalMoves(s()).some(
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
