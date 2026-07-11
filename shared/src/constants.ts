import type { HQState, ModeConfig, PlayerColor, Position } from "./schemas.js";

// ---------------------------------------------------------------------------
// Board layout
// ---------------------------------------------------------------------------

export const BOARD_SIZE = 9; // 0-indexed columns and rows: 0–8

export const TREASURE: Position = { col: 4, row: 4 };

export const LIGHTHOUSES: Position[] = [
  { col: 0, row: 0 },
  { col: 8, row: 0 },
  { col: 0, row: 8 },
  { col: 8, row: 8 },
];

// ---------------------------------------------------------------------------
// Island definitions — static board layout, never changes
// ---------------------------------------------------------------------------

export type IslandDef = {
  commandBase: Position;
  /** §12 non-zero launch premiums; key = 'col,row', value = gold cost */
  launchPremiums: Record<string, number>;
};

export const ISLAND_DEF: Record<PlayerColor, IslandDef> = {
  purple: {
    commandBase: { col: 7, row: 4 },
    launchPremiums: { "7,5": 100, "7,3": 100, "6,4": 200 },
  },
  yellow: {
    commandBase: { col: 4, row: 1 },
    launchPremiums: { "3,1": 100, "5,1": 100, "4,2": 200 },
  },
  green: {
    commandBase: { col: 1, row: 4 },
    launchPremiums: { "1,5": 100, "1,3": 100, "2,4": 200 },
  },
  red: {
    commandBase: { col: 4, row: 7 },
    launchPremiums: { "3,7": 100, "5,7": 100, "4,6": 200 },
  },
};

export const PLAYER_COLORS: PlayerColor[] = [
  "purple",
  "yellow",
  "green",
  "red",
];

// ---------------------------------------------------------------------------
// §16 open item — RESOLVED as RAM_THROUGH (option A)
//
// RAM_THROUGH = true: a 2-zone move is legal even when the intermediate is
// occupied by a rammable enemy. legalMoves emits { to: intermediate } — the
// ship stops and rams there; the far square is never reached.
//
// The intermediate is still blocked (move illegal) when:
//   • occupied by own ship, OR
//   • occupied by a base-protected enemy (base protection extends to jump path)
//
// This correctly handles the submarine: an enemy on the sub's diagonal
// intermediate is reachable via the 2-zone diagonal, resolving as a ram there.
// ---------------------------------------------------------------------------
export const RAM_THROUGH = true;

// ---------------------------------------------------------------------------
// Mode presets
// ---------------------------------------------------------------------------

export const GOLD_PRODUCTION_CONFIG: ModeConfig = {
  id: "gold-production",
  startGold: 1000,
  startFleetInInventory: true,
  papersAtLighthouses: true,
  requiresPaperToBuy: false,
  relaunchEnabled: true,
  stormsEnabled: false,
  turnTimerEnabled: false,
};

export const INITIAL_HQ: HQState = {
  gold: 4000,
  cards: { missile: 12, pirate: 4, jammer: 4, defence: 4 },
};
