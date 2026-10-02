// Deterministic shuffling. Every random choice in practice (scramble order, hidden words, blanks)
// comes from a seed, so tests can control it. The app seeds each exercise from a per-visit session
// seed plus the passage, mode, and attempt.

/** Small, fast seeded PRNG (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combines strings and numbers into a 32-bit seed (FNV-1a). */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Fisher–Yates shuffle with a seed. Returns a new array. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A shuffled order of 0…n-1 for the word scramble. With two or more items the result never keeps
 * the original order (it would give the answer away).
 */
export function scrambleOrder(n: number, seed: number): number[] {
  const order = shuffle(
    Array.from({ length: n }, (_, i) => i),
    seed,
  );
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}
