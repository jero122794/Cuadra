// Game modes: how each one builds its starting state.
import { newGame, parseLayout, type NewGameOptions } from "../core/engine.ts";
import { hashSeed, randomSeed } from "../core/rng.ts";
import type { GameState, Goal, PoolName, Rules } from "../core/types.ts";
import levelsData from "../levels/levels.json";

export type ModeId = "classic" | "level" | "daily" | "stone" | "bomb" | "rush";

export interface LevelDef {
  id: number;
  seed: number;
  goal: Goal;
  moves: number;
  pool: PoolName;
  layout?: string[];
  rules?: Partial<Rules>;
}

export const LEVELS = levelsData as LevelDef[];

export interface ExtremeDef {
  id: "stone" | "bomb" | "rush";
  unlockAfterLevel: number;
  rules: Rules;
}

export const EXTREMES: ExtremeDef[] = [
  { id: "stone", unlockAfterLevel: 10, rules: { pool: "normal", stoneEvery: 4 } },
  { id: "bomb", unlockAfterLevel: 20, rules: { pool: "normal", bombEvery: 7, bombFuse: 6 } },
  { id: "rush", unlockAfterLevel: 30, rules: { pool: "hard", moveSeconds: 10 } }
];

export const DAILY_MOVES = 30;

/** Local calendar date, so the challenge changes at the player's midnight. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function levelOptions(level: LevelDef): NewGameOptions {
  return {
    seed: level.seed,
    goal: level.goal,
    moves: level.moves,
    rules: { pool: level.pool, ...level.rules },
    preset: level.layout ? parseLayout(level.layout, level.seed) : undefined
  };
}

export function startMode(mode: ModeId, levelId?: number): GameState {
  switch (mode) {
    case "level": {
      const level = LEVELS.find(l => l.id === levelId);
      if (!level) throw new Error(`Unknown level ${levelId}`);
      return newGame(levelOptions(level));
    }
    case "daily":
      return newGame({
        seed: hashSeed("daily-" + todayKey()),
        goal: { type: "maxScore" },
        moves: DAILY_MOVES,
        rules: { pool: "normal" }
      });
    case "stone":
    case "bomb":
    case "rush": {
      const ex = EXTREMES.find(e => e.id === mode)!;
      return newGame({ seed: randomSeed(), goal: { type: "endless" }, rules: ex.rules });
    }
    default:
      return newGame({ seed: randomSeed(), goal: { type: "endless" }, rules: { pool: "normal" } });
  }
}
