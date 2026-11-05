import type { PoolName, Shape } from "./types.ts";

// Every shape is normalised so its top row is 0 and its left column is 0.
// BASES lists each piece once; all distinct 90° rotations are generated below,
// so a piece with four orientations is not dealt four times as often as a square.
// Mirror images are separate bases (pieces rotate but never flip).
interface Base {
  id: string;
  cells: Shape;
  /** Diagonal pieces touch only at corners; they feel harder and are dealt less often. */
  diagonal?: boolean;
}

const BASES: Base[] = [
  { id: "mono", cells: [[0, 0]] },
  { id: "i2", cells: [[0, 0], [0, 1]] },
  { id: "i3", cells: [[0, 0], [0, 1], [0, 2]] },
  { id: "i4", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: "i5", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: "o4", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: "o9", cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { id: "rect6", cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
  { id: "l3", cells: [[0, 0], [1, 0], [1, 1]] },
  { id: "l4", cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: "j4", cells: [[0, 1], [1, 1], [2, 1], [2, 0]] },
  { id: "t4", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: "s4", cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: "z4", cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: "corner5", cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
  // New pentominoes
  { id: "plus", cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
  { id: "u5", cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]] },
  { id: "t5", cells: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]] },
  { id: "p5", cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]] },
  { id: "q5", cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 1]] },
  { id: "w5", cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
  { id: "z5", cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]] },
  { id: "s5", cells: [[0, 1], [0, 2], [1, 1], [2, 0], [2, 1]] },
  { id: "y5", cells: [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]] },
  { id: "y5m", cells: [[0, 0], [1, 0], [1, 1], [2, 0], [3, 0]] },
  { id: "l5", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
  { id: "j5", cells: [[0, 1], [1, 1], [2, 1], [3, 1], [3, 0]] },
  // Diagonals: the grid's version of a 45° piece
  { id: "d2", cells: [[0, 0], [1, 1]], diagonal: true },
  { id: "d3", cells: [[0, 0], [1, 1], [2, 2]], diagonal: true },
  { id: "chevron", cells: [[0, 0], [1, 1], [0, 2]], diagonal: true }
];

export function normalize(shape: Shape): Shape {
  const minR = Math.min(...shape.map(([r]) => r));
  const minC = Math.min(...shape.map(([, c]) => c));
  return shape
    .map(([r, c]) => [r - minR, c - minC] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

const key = (s: Shape) => s.map(([r, c]) => `${r},${c}`).join(";");

/** 90° clockwise. */
export function rotateShape(shape: Shape): Shape {
  const maxR = Math.max(...shape.map(([r]) => r));
  return normalize(shape.map(([r, c]) => [c, maxR - r] as const));
}

/** The distinct orientations of a shape, starting with the shape itself. */
export function orientations(shape: Shape): Shape[] {
  const out: Shape[] = [];
  const seen = new Set<string>();
  let s = normalize(shape);
  for (let i = 0; i < 4; i++) {
    const k = key(s);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
    s = rotateShape(s);
  }
  return out;
}

export function canRotate(shape: Shape): boolean {
  return orientations(shape).length > 1;
}

interface Entry { shape: Shape; base: Base }
const ENTRIES: Entry[] = BASES.flatMap(base => orientations(base.cells).map(shape => ({ shape, base })));

/** Every orientation of every piece. */
export const SHAPES: Shape[] = ENTRIES.map(e => e.shape);
export const SINGLE: Shape = [[0, 0]];
export const BASE_COUNT = BASES.length;

function baseWeight(base: Base, pool: PoolName): number {
  const n = base.cells.length;
  if (base.diagonal) return pool === "easy" ? 0.3 : pool === "hard" ? 1.1 : 0.7;
  if (pool === "easy") return n <= 3 ? 3 : n >= 6 ? 0.4 : n === 5 ? 0.6 : 1;
  if (pool === "hard") return n >= 5 ? 2.2 : n <= 2 ? 0.5 : 1;
  return n === 5 ? 0.8 : 1;
}

const tables = new Map<PoolName, { shapes: Shape[]; cumulative: number[]; total: number }>();

export function poolTable(pool: PoolName) {
  let t = tables.get(pool);
  if (!t) {
    let total = 0;
    const cumulative: number[] = [];
    const perBase = new Map<string, number>();
    for (const e of ENTRIES) perBase.set(e.base.id, (perBase.get(e.base.id) ?? 0) + 1);
    for (const e of ENTRIES) {
      total += baseWeight(e.base, pool) / perBase.get(e.base.id)!;
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
