import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const PositionSchema = z.object({
  col: z.number().int().min(0).max(8),
  row: z.number().int().min(0).max(8),
});

export const PlayerColorSchema = z.enum(["purple", "yellow", "green", "red"]);
export const ShipTypeSchema = z.enum([
  "cruiser",
  "destroyer",
  "submarine",
  "corvette",
]);
export const WeaponCardSchema = z.enum([
  "missile",
  "pirate",
  "jammer",
  "defence",
]);

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------

export const ShipStateSchema = z.object({
  id: z.string(),
  type: ShipTypeSchema,
  ownerId: z.string(),
  pos: PositionSchema,
  blocked: z.boolean(), // true = jammed by Jammer weapon
});

export const InventoryShipSchema = z.object({
  id: z.string(),
  type: ShipTypeSchema,
});

// ---------------------------------------------------------------------------
// Player — islandColors intentionally absent; derive from islandOwnership
// ---------------------------------------------------------------------------

export const PlayerStateSchema = z.object({
  id: z.string(),
  color: PlayerColorSchema,
  gold: z.number().int().min(0),
  papers: z.number().int().min(0),
  hand: z.array(WeaponCardSchema),
  inventory: z.array(InventoryShipSchema),
  defeated: z.boolean(),
});

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export const GoldTokenSchema = z.object({
  pos: PositionSchema,
  amount: z.number().int().positive(),
});

export const BoardPaperSchema = z.object({ pos: PositionSchema });

export const BoardStateSchema = z.object({
  ships: z.array(ShipStateSchema),
  gold: z.array(GoldTokenSchema),
  papers: z.array(BoardPaperSchema),
});

// ---------------------------------------------------------------------------
// HQ and mode
// ---------------------------------------------------------------------------

export const HQStateSchema = z.object({
  gold: z.number().int().min(0),
  cards: z.object({
    missile: z.number().int().min(0),
    pirate: z.number().int().min(0),
    jammer: z.number().int().min(0),
    defence: z.number().int().min(0),
  }),
});

export const ModeConfigSchema = z.object({
  id: z.enum(["gold-production", "classic", "gold-rush"]),
  startGold: z.number().int(),
  startFleetInInventory: z.boolean(),
  papersAtLighthouses: z.boolean(),
  requiresPaperToBuy: z.boolean(),
  relaunchEnabled: z.boolean(),
  stormsEnabled: z.boolean(),
  turnTimerEnabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Island ownership — single source of truth; null = unclaimed neutral terrain
// ---------------------------------------------------------------------------

export const IslandOwnershipSchema = z.object({
  purple: z.string().nullable(),
  yellow: z.string().nullable(),
  green: z.string().nullable(),
  red: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export const GameStateSchema = z.object({
  phase: z.enum(["playing", "finished"]),
  mode: ModeConfigSchema,
  players: z.array(PlayerStateSchema),
  currentPlayerIndex: z.number().int().min(0),
  turnNumber: z.number().int().min(1),
  board: BoardStateSchema,
  islandOwnership: IslandOwnershipSchema,
  hq: HQStateSchema,
  rngSeed: z.number().int(),
  winner: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Move (discriminated union — move-only for Phase 1)
// ---------------------------------------------------------------------------

export const MoveActionSchema = z.object({
  type: z.literal("move"),
  shipId: z.string(),
  to: PositionSchema,
});

export const MoveSchema = z.discriminatedUnion("type", [MoveActionSchema]);

// ---------------------------------------------------------------------------
// Inferred TypeScript types (single source of truth — no separate types.ts)
// ---------------------------------------------------------------------------

export type Position = z.infer<typeof PositionSchema>;
export type PlayerColor = z.infer<typeof PlayerColorSchema>;
export type ShipType = z.infer<typeof ShipTypeSchema>;
export type WeaponCard = z.infer<typeof WeaponCardSchema>;
export type ShipState = z.infer<typeof ShipStateSchema>;
export type InventoryShip = z.infer<typeof InventoryShipSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type GoldToken = z.infer<typeof GoldTokenSchema>;
export type BoardPaper = z.infer<typeof BoardPaperSchema>;
export type BoardState = z.infer<typeof BoardStateSchema>;
export type HQState = z.infer<typeof HQStateSchema>;
export type ModeConfig = z.infer<typeof ModeConfigSchema>;
export type IslandOwnership = z.infer<typeof IslandOwnershipSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type MoveAction = z.infer<typeof MoveActionSchema>;
export type Move = z.infer<typeof MoveSchema>;

// ---------------------------------------------------------------------------
// Parse helpers (for server-side validation of untrusted input)
// ---------------------------------------------------------------------------

export function parseGameState(raw: unknown): GameState {
  return GameStateSchema.parse(raw);
}

export function parseMove(raw: unknown): Move {
  return MoveSchema.parse(raw);
}
