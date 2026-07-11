/**
 * Seeded mulberry32 PRNG. Pure function — no side effects, no Math.random.
 * The seed is stored in GameState.rngSeed and threaded through each call.
 */

/** Returns [value in [0, 1), nextSeed]. */
export function rngNext(seed: number): [number, number] {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, seed];
}

/** Returns [integer in [0, n), nextSeed]. */
export function rngInt(seed: number, n: number): [number, number] {
  const [v, next] = rngNext(seed);
  return [Math.floor(v * n), next];
}
