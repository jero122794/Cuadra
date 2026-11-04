// Generates src/levels/levels.json.
// Each level is built from its own seed, then calibrated against the greedy
// bot: targets are set below what the bot reaches, and the final level is
// replayed to prove the bot can win it. Run: npm run levels
import { writeFileSync } from "node:fs";
import { autoplay } from "../src/core/bot.ts";
import { fullLines, newGame, parseLayout } from "../src/core/engine.ts";
import { Rng, hashSeed } from "../src/core/rng.ts";
import type { Goal, PoolName, Rules } from "../src/core/types.ts";

interface LevelDef {
  id: number;
  seed: number;
  goal: Goal;
  moves: number;
  pool: PoolName;
  layout?: string[];
  rules?: Partial<Rules>;
}

const N = 8;
const COUNT = 30;

function makeLayout(seed: number, tiles: number, gems: number, stones: number): string[] {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const g: string[][] = Array.from({ length: N }, () => Array(N).fill("."));
    const free = () => {
      for (;;) {
        const r = rng.int(N), c = rng.int(N);
        if (g[r][c] === ".") return [r, c] as const;
      }
    };
    // Tiles grow from the bottom like a half-built wall.
    for (let i = 0; i < Math.min(tiles, 22); i++) {
      const c = rng.int(N);
      let r = N - 1;
      while (r >= 0 && g[r][c] !== ".") r--;
      if (r >= Math.floor(N / 2)) g[r][c] = String(1 + rng.int(6));
    }
    for (let i = 0; i < gems; i++) { const [r, c] = free(); g[r][c] = "g"; }
    for (let i = 0; i < stones; i++) { const [r, c] = free(); g[r][c] = "s"; }
    const rows = g.map(r => r.join(""));
    const lines = fullLines(parseLayout(rows));
    if (!lines.rows.length && !lines.cols.length) return rows;
  }
  throw new Error("Could not build a layout without full lines");
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function build(id: number): LevelDef {
  const t = (id - 1) / (COUNT - 1);
  const pool: PoolName = id <= 8 ? "easy" : id <= 24 ? "normal" : "hard";
  const tightness = lerp(0.72, 0.97, t);

  for (let variant = 0; variant < 40; variant++) {
    const seed = hashSeed(`cuadra-level-${id}-${variant}`);
    let layout: string[] | undefined;
    let kind: "score" | "lines" | "gems";

    if (id <= 5) kind = "score";
    else if (id <= 10) kind = "lines";
    else if (id <= 15) { kind = id % 2 ? "score" : "lines"; layout = makeLayout(seed, 6 + id, 0, 0); }
    else if (id <= 22) { kind = "gems"; layout = makeLayout(seed, 4 + id, 2 + Math.floor((id - 16) / 2), 0); }
    else if (id <= 27) { kind = "lines"; layout = makeLayout(seed, 10 + id, 0, 2 + Math.floor((id - 23) / 2)); }
    else { kind = "gems"; layout = makeLayout(seed, 14 + id, 4 + (id - 28), 2); }

    const preset = layout ? parseLayout(layout, seed) : undefined;
    const rules: Rules = { pool };

    if (kind === "gems") {
      const probe = autoplay(newGame({ seed, goal: { type: "gems" }, moves: 80, rules, preset }));
      if (probe.status !== "won") continue;
      const moves = Math.max(probe.moves + 2, Math.ceil(probe.moves * lerp(1.8, 1.2, t)));
      const level: LevelDef = { id, seed, goal: { type: "gems" }, moves, pool, layout };
      if (verify(level)) return level;
      continue;
    }

    // 1) See what the bot reaches in a fixed budget and set the goal a bit below it.
    const budget = Math.round(lerp(16, 30, t));
    const probe = autoplay(newGame({ seed, goal: { type: "maxScore" }, moves: budget, rules, preset }));
    let goal: Goal;
    if (kind === "score") {
      const target = Math.max(20, Math.floor((probe.score * tightness) / 10) * 10);
      goal = { type: "score", target };
    } else {
      if (probe.lines < 2) continue;
      goal = { type: "lines", target: Math.max(2, Math.floor(probe.lines * lerp(0.75, 1, t))) };
    }
    // 2) Give the player some slack over the moves the bot needed to win.
    const race = autoplay(newGame({ seed, goal, moves: 80, rules, preset }));
    if (race.status !== "won") continue;
    const moves = Math.max(race.moves + 2, Math.ceil(race.moves * lerp(1.7, 1.15, t)));
    const level: LevelDef = { id, seed, goal, moves, pool, ...(layout ? { layout } : {}) };
    if (verify(level)) return level;
  }
  throw new Error(`Level ${id}: no winnable variant found`);
}

function verify(l: LevelDef): boolean {
  const preset = l.layout ? parseLayout(l.layout, l.seed) : undefined;
  const end = autoplay(newGame({ seed: l.seed, goal: l.goal, moves: l.moves, rules: { pool: l.pool, ...l.rules }, preset }));
  return end.status === "won";
}

const levels: LevelDef[] = [];
for (let id = 1; id <= COUNT; id++) {
  const l = build(id);
  levels.push(l);
  const g = l.goal.type === "score" ? `score ${l.goal.target}` : l.goal.type === "lines" ? `lines ${l.goal.target}` : "gems";
  console.log(`level ${String(id).padStart(2)}  ${l.pool.padEnd(6)} ${g.padEnd(10)} moves ${l.moves}`);
}
writeFileSync(new URL("../src/levels/levels.json", import.meta.url), JSON.stringify(levels, null, 1) + "\n");
console.log(`Wrote ${levels.length} levels`);
