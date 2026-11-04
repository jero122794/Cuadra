import type { PoolName, Shape } from "./types.ts";

// Every shape is normalised so its top row is 0 and its left column is 0.
export const SHAPES: Shape[] = [
  [[0, 0]],
  [[0, 0], [0, 1]], [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 1], [1, 1], [2, 1], [2, 0]],
  [[0, 0], [0, 1], [1, 0], [2, 0]], [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [1, 2]], [[0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 1], [1, 1], [2, 1], [1, 0]],
  [[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 1], [1, 1], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]
];

export const SINGLE: Shape = [[0, 0]];

function weight(shape: Shape, pool: PoolName): number {
  const n = shape.length;
  if (pool === "easy") return n <= 3 ? 3 : n >= 6 ? 0.4 : 1;
  if (pool === "hard") return n >= 5 ? 2.2 : n <= 2 ? 0.5 : 1;
  return 1;
}

const tables = new Map<PoolName, { shapes: Shape[]; cumulative: number[]; total: number }>();

export function poolTable(pool: PoolName) {
  let t = tables.get(pool);
  if (!t) {
    let total = 0;
    const cumulative: number[] = [];
    for (const s of SHAPES) {
      total += weight(s, pool);
      cumulative.push(total);
    }
    t = { shapes: SHAPES, cumulative, total };
    tables.set(pool, t);
  }
  return t;
}

export function shapeSize(shape: Shape): { h: number; w: number } {
  let h = 0, w = 0;
  for (const [r, c] of shape) {
    h = Math.max(h, r + 1);
    w = Math.max(w, c + 1);
  }
  return { h, w };
}
