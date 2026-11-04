import { describe, expect, it } from "vitest";
import {
  canPlace, canContinue, dealTray, emptyGrid, fitsAnywhere, fullLines, lineScore, newGame, parseLayout,
  play, revive, starsFor, timeout
} from "../src/core/engine.ts";
import { Rng, hashSeed } from "../src/core/rng.ts";
import { SINGLE } from "../src/core/shapes.ts";
import type { GameState, Piece } from "../src/core/types.ts";

const single = (color = 1): Piece => ({ shape: SINGLE, color });

function withTray(s: GameState, tray: (Piece | null)[]): GameState {
  return { ...s, tray };
}

describe("placement", () => {
  it("rejects overlaps and out-of-bounds", () => {
    const g = parseLayout(["1.......", "........", "........", "........", "........", "........", "........", "........"]);
    expect(canPlace(g, SINGLE, 0, 0)).toBe(false);
    expect(canPlace(g, SINGLE, 0, 1)).toBe(true);
    expect(canPlace(g, [[0, 0], [0, 1]], 0, 7)).toBe(false);
  });
});

describe("lines and score", () => {
  it("clears a row and a column at once", () => {
    const rows = Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => ((r === 3 || c === 3) && !(r === 3 && c === 3) ? "1" : ".")).join("")
    );
    let s = newGame({ seed: 1, goal: { type: "endless" }, rules: { pool: "normal" }, preset: parseLayout(rows) });
    s = withTray(s, [single(), single(), single()]);
    const { state, events } = play(s, 0, 3, 3);
    expect(events.lines).toBe(2);
    expect(events.boardClear).toBe(true);
    expect(state.grid.every(row => row.every(x => !x))).toBe(true);
    expect(events.gained).toBe(lineScore(1, 2, 1) + 100);
  });

  it("builds combos on consecutive clears", () => {
    expect(lineScore(3, 0, 0)).toBe(3);
    expect(lineScore(1, 2, 1)).toBe(41);
    expect(lineScore(5, 1, 3)).toBe(35);
  });

  it("detects full lines", () => {
    const g = emptyGrid(8);
    for (let c = 0; c < 8; c++) g[5][c] = { kind: "tile", color: 2 };
    expect(fullLines(g)).toEqual({ rows: [5], cols: [] });
  });
});

describe("special cells", () => {
  it("stones need two clears", () => {
    const row = "s111111.";
    const rows = [row, ...Array(7).fill("........")];
    let s = newGame({ seed: 2, goal: { type: "endless" }, rules: { pool: "normal" }, preset: parseLayout(rows) });
    s = withTray(s, [single(), single(), single()]);
    const first = play(s, 0, 0, 7);
    expect(first.events.stonesCracked).toBe(1);
    expect(first.state.grid[0][0]).toMatchObject({ kind: "stone", hp: 1 });
    let s2 = withTray(first.state, [single(), single(), single()]);
    for (let c = 1; c < 8; c++) s2 = withTray(play(s2, 0, 0, c).state, [single(), single(), single()]);
    expect(s2.grid[0][0]).toBeNull();
  });

  it("gems count toward the goal and win the level", () => {
    const rows = ["g111111.", ...Array(7).fill("........")];
    let s = newGame({ seed: 3, goal: { type: "gems" }, rules: { pool: "normal" }, moves: 10, preset: parseLayout(rows) });
    expect(s.gemsLeft).toBe(1);
    s = withTray(s, [single(), single(), single()]);
    const { state, events } = play(s, 0, 0, 7);
    expect(events.gemsBroken).toBe(1);
    expect(state.status).toBe("won");
    expect(starsFor(state)).toBe(3);
  });

  it("a bomb explodes when its fuse runs out", () => {
    const rows = ["b.......", ...Array(7).fill("........")];
    const preset = parseLayout(rows);
    preset[0][0] = { kind: "bomb", color: 0, fuse: 2 };
    let s = newGame({ seed: 4, goal: { type: "endless" }, rules: { pool: "normal" }, preset });
    s = withTray(s, [single(), single(), single()]);
    s = play(s, 0, 7, 7).state;
    expect(s.status).toBe("playing");
    s = play(s, 1, 7, 6).state;
    expect(s.status).toBe("lost");
    expect(s.lostReason).toBe("bomb");
  });

  it("spawns stones on schedule in extreme rules", () => {
    let s = newGame({ seed: 5, goal: { type: "endless" }, rules: { pool: "normal", stoneEvery: 2 } });
    s = withTray(s, [single(), single(), single()]);
    s = play(s, 0, 0, 0).state;
    const r = play(s, 1, 0, 1);
    expect(r.events.spawned).toHaveLength(1);
    expect(r.events.spawned[0].cell.kind).toBe("stone");
  });
});

describe("game flow", () => {
  it("runs out of moves on limited levels", () => {
    let s = newGame({ seed: 6, goal: { type: "score", target: 9999 }, rules: { pool: "normal" }, moves: 1 });
    s = withTray(s, [single(), single(), single()]);
    s = play(s, 0, 0, 0).state;
    expect(s.status).toBe("lost");
    expect(s.lostReason).toBe("moves");
  });

  it("finishes the daily challenge instead of losing", () => {
    let s = newGame({ seed: 7, goal: { type: "maxScore" }, rules: { pool: "normal" }, moves: 1 });
    s = withTray(s, [single(), single(), single()]);
    expect(play(s, 0, 0, 0).state.status).toBe("finished");
  });

  it("allows one revive per game", () => {
    let s = newGame({ seed: 8, goal: { type: "endless" }, rules: { pool: "normal" } });
    s = timeout(s);
    expect(canContinue(s)).toBe(true);
    s = revive(s);
    expect(s.status).toBe("playing");
    expect(canContinue(timeout(s))).toBe(false);
  });

  it("deals the same pieces for the same seed", () => {
    const a = dealTray(emptyGrid(8), new Rng(hashSeed("daily-2026-11-04")), "normal");
    const b = dealTray(emptyGrid(8), new Rng(hashSeed("daily-2026-11-04")), "normal");
    expect(a).toEqual(b);
  });

  it("never deals an unplayable hand when a single block fits", () => {
    const g = emptyGrid(8);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!(r === 4 && c === 4)) g[r][c] = { kind: "stone", color: 0, hp: 2 };
    for (let seed = 1; seed <= 50; seed++) {
      const tray = dealTray(g, new Rng(seed), "hard");
      expect(tray.some(p => fitsAnywhere(g, p.shape))).toBe(true);
    }
  });
});
