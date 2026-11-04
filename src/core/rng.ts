// Small deterministic RNG (mulberry32). Its whole state is one number, so a
// game in progress can be saved, restored, and replayed exactly. Daily
// challenges and levels use fixed seeds so every player gets the same pieces.

export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** Mutable wrapper used inside a single engine step. */
export class Rng {
  state: number;
  constructor(state: number) {
    this.state = state;
  }
  next(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

/** FNV-1a hash of a string, used to turn "daily-2026-11-04" into a seed. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
