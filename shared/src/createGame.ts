import {
  INITIAL_HQ,
  ISLAND_DEF,
  LIGHTHOUSES,
  PLAYER_COLORS,
} from "./constants.js";
import { rngInt } from "./rng.js";
import type {
  GameState,
  IslandOwnership,
  ModeConfig,
  PlayerColor,
} from "./schemas.js";

export function createGame(
  config: ModeConfig,
  playerIds: string[],
  seed: number,
): GameState {
  if (config.id !== "gold-production") throw new Error("unsupported mode");
  if (playerIds.length !== 2 && playerIds.length !== 4)
    throw new Error("player count must be 2 or 4");

  let rng = seed;

  // Assign colors — seeded, deterministic
  let colors: PlayerColor[];
  if (playerIds.length === 4) {
    const shuffled = [...PLAYER_COLORS];
    for (let i = 3; i > 0; i--) {
      let idx: number;
      [idx, rng] = rngInt(rng, i + 1);
      [shuffled[i], shuffled[idx]] = [shuffled[idx]!, shuffled[i]!];
    }
    colors = shuffled;
  } else {
    let pairIdx: number;
    [pairIdx, rng] = rngInt(rng, 2);
    colors = pairIdx === 0 ? ["purple", "green"] : ["red", "yellow"];
  }

  const islandOwnership: IslandOwnership = {
    purple: null,
    yellow: null,
    green: null,
    red: null,
  };
  for (let i = 0; i < colors.length; i++) {
    islandOwnership[colors[i]!] = playerIds[i]!;
  }

  const players = colors.map((color, i) => ({
    id: playerIds[i]!,
    color,
    gold: config.startGold,
    papers: 0,
    hand: [] as [],
    inventory: [
      { id: `${color}-destroyer`, type: "destroyer" as const },
      { id: `${color}-submarine`, type: "submarine" as const },
      { id: `${color}-corvette-1`, type: "corvette" as const },
      { id: `${color}-corvette-2`, type: "corvette" as const },
      { id: `${color}-corvette-3`, type: "corvette" as const },
      { id: `${color}-corvette-4`, type: "corvette" as const },
    ],
    defeated: false,
  }));

  const ships = colors.map((color, i) => ({
    id: `${color}-cruiser`,
    type: "cruiser" as const,
    ownerId: playerIds[i]!,
    pos: ISLAND_DEF[color].commandBase,
    blocked: false,
  }));

  const papers = config.papersAtLighthouses
    ? LIGHTHOUSES.map((pos) => ({ pos }))
    : [];

  return {
    phase: "playing",
    mode: config,
    players,
    currentPlayerIndex: 0,
    turnNumber: 1,
    board: { ships, gold: [], papers },
    islandOwnership,
    hq: structuredClone(INITIAL_HQ),
    rngSeed: rng,
    winner: null,
  };
}
