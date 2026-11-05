// Pure game rules. No DOM, no timers, no randomness outside the seeded RNG
// streams stored in the state. Every function returns a new state.
import { Rng } from "./rng.ts";
import { SINGLE, orientations, poolTable, rotateShape } from "./shapes.ts";
import type {
  Cell, GameState, Goal, Grid, Piece, PlayEvents, PoolName, Rules, Shape
} from "./types.ts";

export const COLORS = 6;
export const POINTS = {
  gem: 15,
  bombDefused: 20,
  boardClear: 100
};

export interface NewGameOptions {
  seed: number;
  goal: Goal;
  rules: Rules;
  size?: number;
  moves?: number | null;
  preset?: Grid;
}

export function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => Array<Cell | null>(size).fill(null));
}

export function cloneGrid(g: Grid): Grid {
  return g.map(row => row.map(c => (c ? { ...c } : null)));
}

export function countGems(g: Grid): number {
  let n = 0;
  for (const row of g) for (const c of row) if (c?.kind === "gem") n++;
  return n;
}

export function canPlace(g: Grid, shape: Shape, r: number, c: number): boolean {
  const size = g.length;
  for (const [dr, dc] of shape) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= size || cc >= size || g[rr][cc]) return false;
  }
  return true;
}

export function fitsAnywhere(g: Grid, shape: Shape): boolean {
  for (let r = 0; r < g.length; r++)
    for (let c = 0; c < g.length; c++)
      if (canPlace(g, shape, r, c)) return true;
  return false;
}

/** True if the piece fits somewhere in any of its 90° orientations. */
export function fitsWithRotation(g: Grid, shape: Shape): boolean {
  return orientations(shape).some(o => fitsAnywhere(g, o));
}

export function hasMove(state: GameState): boolean {
  return state.tray.some(p => p && fitsWithRotation(state.grid, p.shape));
}

/** Rotate tray piece `idx` 90° clockwise. Free: it does not count as a move. */
export function rotatePiece(s: GameState, idx: number): GameState {
  const p = s.tray[idx];
  if (s.status !== "playing" || !p) return s;
  const tray = s.tray.slice();
  tray[idx] = { ...p, shape: rotateShape(p.shape) };
  return { ...s, tray };
}

/** Board as it would look with the piece placed (for the drag preview). */
export function placeOnPreview(g: Grid, piece: Piece, r: number, c: number): Grid {
  const n = g.map(row => row.slice());
  for (const [dr, dc] of piece.shape) n[r + dr][c + dc] = { kind: "tile", color: piece.color };
  return n;
}

export function fullLines(g: Grid): { rows: number[]; cols: number[] } {
  const rows: number[] = [], cols: number[] = [];
  for (let i = 0; i < g.length; i++) {
    if (g[i].every(Boolean)) rows.push(i);
    if (g.every(row => row[i])) cols.push(i);
  }
  return { rows, cols };
}

export function lineScore(cells: number, lines: number, combo: number): number {
  if (!lines) return cells;
  return cells + 10 * lines * lines + (combo > 1 ? 10 * (combo - 1) * lines : 0);
}

function drawPiece(rng: Rng, pool: PoolName): Piece {
  const t = poolTable(pool);
  const x = rng.next() * t.total;
  let i = t.cumulative.findIndex(v => x < v);
  if (i < 0) i = t.shapes.length - 1;
  return { shape: t.shapes[i], color: 1 + rng.int(COLORS) };
}

/**
 * Always draws exactly three pieces so the sequence stays identical for every
 * player on the same seed. If none fits, the first becomes a single block,
 * without consuming randomness.
 */
export function dealTray(g: Grid, rng: Rng, pool: PoolName): Piece[] {
  const tray = [drawPiece(rng, pool), drawPiece(rng, pool), drawPiece(rng, pool)];
  if (!tray.some(p => fitsWithRotation(g, p.shape))) tray[0] = { shape: SINGLE, color: tray[0].color };
  return tray;
}

export function newGame(o: NewGameOptions): GameState {
  const size = o.preset?.length ?? o.size ?? 8;
  const grid = o.preset ? cloneGrid(o.preset) : emptyGrid(size);
  const pieceRng = new Rng(o.seed >>> 0);
  const spawnRng = new Rng((o.seed ^ 0x9e3779b9) >>> 0);
  const tray = dealTray(grid, pieceRng, o.rules.pool);
  const state: GameState = {
    size,
    grid,
    tray,
    pieceRng: pieceRng.state,
    spawnRng: spawnRng.state,
    rules: o.rules,
    goal: o.goal,
    score: 0,
    lines: 0,
    gemsLeft: countGems(grid),
    moves: 0,
    movesLimit: o.moves ?? null,
    combo: 0,
    status: "playing",
    continued: false
  };
  return hasMove(state) ? state : { ...state, status: "lost", lostReason: "noRoom" };
}

export function goalReached(s: GameState): boolean {
  switch (s.goal.type) {
    case "score": return s.score >= s.goal.target;
    case "lines": return s.lines >= s.goal.target;
    case "gems": return s.gemsLeft === 0;
    default: return false;
  }
}

function spawn(grid: Grid, rng: Rng, cell: Cell): { r: number; c: number } | null {
  const empty: [number, number][] = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid.length; c++)
      if (!grid[r][c]) empty.push([r, c]);
  const pick = rng.int(Math.max(empty.length, 1));
  if (!empty.length) return null;
  const [r, c] = empty[pick];
  grid[r][c] = cell;
  return { r, c };
}

/** Place tray piece `idx` with its top-left at (r, c). Throws on an illegal move. */
export function play(s: GameState, idx: number, r: number, c: number): { state: GameState; events: PlayEvents } {
  if (s.status !== "playing") throw new Error("Game is over");
  const piece = s.tray[idx];
  if (!piece) throw new Error("Empty tray slot");
  if (!canPlace(s.grid, piece.shape, r, c)) throw new Error("Piece does not fit");

  const grid = cloneGrid(s.grid);
  const placed: [number, number][] = [];
  for (const [dr, dc] of piece.shape) {
    grid[r + dr][c + dc] = { kind: "tile", color: piece.color };
    placed.push([r + dr, c + dc]);
  }

  // Clear full rows and columns.
  const lines = fullLines(grid);
  const nLines = lines.rows.length + lines.cols.length;
  const hit = new Set<number>();
  lines.rows.forEach(rr => { for (let cc = 0; cc < s.size; cc++) hit.add(rr * s.size + cc); });
  lines.cols.forEach(cc => { for (let rr = 0; rr < s.size; rr++) hit.add(rr * s.size + cc); });

  const cleared: PlayEvents["cleared"] = [];
  let gemsBroken = 0, stonesCracked = 0, bombsDefused = 0;
  for (const key of hit) {
    const rr = Math.floor(key / s.size), cc = key % s.size;
    const cell = grid[rr][cc]!;
    if (cell.kind === "stone" && (cell.hp ?? 1) > 1) {
      grid[rr][cc] = { ...cell, hp: (cell.hp ?? 2) - 1 };
      stonesCracked++;
      continue;
    }
    if (cell.kind === "gem") gemsBroken++;
    if (cell.kind === "bomb") bombsDefused++;
    cleared.push({ r: rr, c: cc, cell });
    grid[rr][cc] = null;
  }

  const combo = nLines ? s.combo + 1 : 0;
  let gained = lineScore(piece.shape.length, nLines, combo)
    + gemsBroken * POINTS.gem + bombsDefused * POINTS.bombDefused;
  const boardClear = nLines > 0 && grid.every(row => row.every(x => !x));
  if (boardClear) gained += POINTS.boardClear;

  // Bombs tick after every move; any that reaches zero explodes.
  let exploded: [number, number] | null = null;
  for (let rr = 0; rr < s.size; rr++)
    for (let cc = 0; cc < s.size; cc++) {
      const cell = grid[rr][cc];
      if (cell?.kind === "bomb") {
        const fuse = (cell.fuse ?? 1) - 1;
        grid[rr][cc] = { ...cell, fuse };
        if (fuse <= 0 && !exploded) exploded = [rr, cc];
      }
    }

  const moves = s.moves + 1;
  const spawnRng = new Rng(s.spawnRng);
  const spawned: PlayEvents["spawned"] = [];
  const { stoneEvery, bombEvery, bombFuse } = s.rules;
  if (!exploded && stoneEvery && moves % stoneEvery === 0) {
    const cell: Cell = { kind: "stone", color: 0, hp: 2 };
    const at = spawn(grid, spawnRng, cell);
    if (at) spawned.push({ ...at, cell });
  }
  if (!exploded && bombEvery && moves % bombEvery === 0) {
    const cell: Cell = { kind: "bomb", color: 0, fuse: bombFuse ?? 6 };
    const at = spawn(grid, spawnRng, cell);
    if (at) spawned.push({ ...at, cell });
  }

  let tray = s.tray.slice();
  tray[idx] = null;
  const pieceRng = new Rng(s.pieceRng);
  if (tray.every(p => !p)) tray = dealTray(grid, pieceRng, s.rules.pool);

  let next: GameState = {
    ...s,
    grid,
    tray,
    pieceRng: pieceRng.state,
    spawnRng: spawnRng.state,
    score: s.score + gained,
    lines: s.lines + nLines,
    gemsLeft: s.gemsLeft - gemsBroken,
    moves,
    combo
  };

  if (goalReached(next)) next = { ...next, status: "won" };
  else if (exploded) next = { ...next, status: "lost", lostReason: "bomb" };
  else if (next.movesLimit !== null && moves >= next.movesLimit)
    next = next.goal.type === "maxScore" ? { ...next, status: "finished" } : { ...next, status: "lost", lostReason: "moves" };
  else if (!hasMove(next))
    next = next.goal.type === "maxScore" ? { ...next, status: "finished" } : { ...next, status: "lost", lostReason: "noRoom" };

  return {
    state: next,
    events: {
      placed, cleared, lines: nLines, gained, combo, boardClear,
      gemsBroken, stonesCracked, bombsDefused, spawned, exploded
    }
  };
}

/** The move clock ran out (Contrarreloj). */
export function timeout(s: GameState): GameState {
  if (s.status !== "playing") return s;
  return { ...s, status: "lost", lostReason: "time" };
}

/** One rescue per game (after a rewarded ad): open the centre and deal again. */
export function canContinue(s: GameState): boolean {
  return s.status === "lost" && !s.continued;
}

export function revive(s: GameState): GameState {
  if (!canContinue(s)) return s;
  const grid = cloneGrid(s.grid);
  const lo = Math.floor(s.size / 2) - 2, hi = lo + 4;
  // Gems stay: they are the level's goal and must still be cleared by a line.
  for (let r = 0; r < s.size; r++)
    for (let c = 0; c < s.size; c++) {
      const cell = grid[r][c];
      const centre = r >= lo && r < hi && c >= lo && c < hi;
      if (cell?.kind === "bomb") grid[r][c] = { ...cell, fuse: Math.max(cell.fuse ?? 0, 4) };
      if (centre && cell && cell.kind !== "gem") grid[r][c] = null;
    }
  const pieceRng = new Rng(s.pieceRng);
  const tray = dealTray(grid, pieceRng, s.rules.pool);
  const movesLimit = s.movesLimit === null ? null : Math.max(s.movesLimit, s.moves) + 5;
  return {
    ...s,
    grid,
    tray,
    pieceRng: pieceRng.state,
    movesLimit,
    status: "playing",
    lostReason: undefined,
    continued: true
  };
}

/** 1–3 stars for a won level, from the share of moves left over. */
export function starsFor(s: GameState): number {
  if (s.status !== "won") return 0;
  if (s.movesLimit === null) return 3;
  const left = (s.movesLimit - s.moves) / s.movesLimit;
  return left >= 0.3 ? 3 : left >= 0.12 ? 2 : 1;
}

/** Parse a level layout: '.' empty, 'g' gem, 's' stone, 'b' bomb, '1'-'6' tile. */
export function parseLayout(rows: string[], colorSeed = 1): Grid {
  const rng = new Rng(colorSeed);
  return rows.map(row =>
    [...row].map(ch => {
      if (ch === ".") return null;
      if (ch === "g") return { kind: "gem", color: 1 + rng.int(COLORS) } as Cell;
      if (ch === "s") return { kind: "stone", color: 0, hp: 2 } as Cell;
      if (ch === "b") return { kind: "bomb", color: 0, fuse: 8 } as Cell;
      const n = Number(ch);
      if (n >= 1 && n <= COLORS) return { kind: "tile", color: n } as Cell;
      throw new Error(`Unknown layout character "${ch}"`);
    })
  );
}
