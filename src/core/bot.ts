// Greedy bot used to calibrate levels and to prove in tests that every level
// can be won. It is not used during play.
import { canPlace, play } from "./engine.ts";
import { orientations } from "./shapes.ts";
import type { GameState, Grid, Shape } from "./types.ts";

function holes(g: Grid): number {
  const n = g.length;
  let h = 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (g[r][c]) continue;
      const blocked = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= n || cc >= n || !!g[rr][cc];
      if (blocked(r - 1, c) && blocked(r + 1, c) && blocked(r, c - 1) && blocked(r, c + 1)) h++;
    }
  return h;
}

function filled(g: Grid): number {
  let f = 0;
  for (const row of g) for (const x of row) if (x) f++;
  return f;
}

function gemPressure(g: Grid): number {
  const n = g.length;
  let p = 0;
  for (let i = 0; i < n; i++) {
    let rowGem = false, colGem = false, rowFill = 0, colFill = 0;
    for (let j = 0; j < n; j++) {
      if (g[i][j]) rowFill++;
      if (g[j][i]) colFill++;
      if (g[i][j]?.kind === "gem") rowGem = true;
      if (g[j][i]?.kind === "gem") colGem = true;
    }
    if (rowGem) p += (rowFill * rowFill) / n;
    if (colGem) p += (colFill * colFill) / n;
  }
  return p;
}

export function evaluate(next: GameState, gained: number, lines: number, gems: number, bombs: number): number {
  let v = gained * 4 + lines * 8 + gems * 60 + bombs * 40;
  if (next.status === "won") v += 100000;
  if (next.status === "lost") v -= 100000;
  v -= holes(next.grid) * 6;
  v -= filled(next.grid) * 0.8;
  if (next.goal.type === "gems") v += gemPressure(next.grid) * 2;
  return v;
}

export interface BotMove { idx: number; shape: Shape; r: number; c: number }

/** Best single move, trying every orientation of every tray piece (rotation is free). */
export function bestMove(s: GameState, rotate = true): BotMove | null {
  let best: BotMove | null = null;
  let bestValue = -Infinity;
  s.tray.forEach((p, idx) => {
    if (!p) return;
    for (const shape of rotate ? orientations(p.shape) : [p.shape]) {
      const tray = s.tray.slice();
      tray[idx] = { ...p, shape };
      const turned = { ...s, tray };
      for (let r = 0; r < s.size; r++)
        for (let c = 0; c < s.size; c++) {
          if (!canPlace(s.grid, shape, r, c)) continue;
          const { state, events } = play(turned, idx, r, c);
          const v = evaluate(state, events.gained, events.lines, events.gemsBroken, events.bombsDefused);
          if (v > bestValue) { bestValue = v; best = { idx, shape, r, c }; }
        }
    }
  });
  return best;
}

/** Play until the game ends or `maxMoves` is hit. */
export function autoplay(s: GameState, maxMoves = 400): GameState {
  let state = s;
  for (let i = 0; i < maxMoves && state.status === "playing"; i++) {
    const m = bestMove(state);
    if (!m) break;
    const tray = state.tray.slice();
    tray[m.idx] = { ...tray[m.idx]!, shape: m.shape };
    state = play({ ...state, tray }, m.idx, m.r, m.c).state;
  }
  return state;
}
