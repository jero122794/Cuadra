// Greedy bot used to calibrate levels and to prove in tests that every level
// can be won. It is not used during play.
import { canPlace, play } from "./engine.ts";
import type { GameState, Grid } from "./types.ts";

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

export function bestMove(s: GameState): { idx: number; r: number; c: number } | null {
  let best: { idx: number; r: number; c: number } | null = null;
  let bestValue = -Infinity;
  s.tray.forEach((p, idx) => {
    if (!p) return;
    for (let r = 0; r < s.size; r++)
      for (let c = 0; c < s.size; c++) {
        if (!canPlace(s.grid, p.shape, r, c)) continue;
        const { state, events } = play(s, idx, r, c);
        const v = evaluate(state, events.gained, events.lines, events.gemsBroken, events.bombsDefused);
        if (v > bestValue) { bestValue = v; best = { idx, r, c }; }
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
    state = play(state, m.idx, m.r, m.c).state;
  }
  return state;
}
