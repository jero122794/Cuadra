export type CellKind = "tile" | "gem" | "stone" | "bomb";

export interface Cell {
  kind: CellKind;
  /** Palette index 1..6 for tiles and gems; 0 for stones and bombs. */
  color: number;
  /** Stones: hits left before they break (2 = whole, 1 = cracked). */
  hp?: number;
  /** Bombs: moves left before they explode. */
  fuse?: number;
}

export type Grid = (Cell | null)[][];
export type Shape = ReadonlyArray<readonly [number, number]>;

export interface Piece {
  shape: Shape;
  color: number;
}

export type PoolName = "easy" | "normal" | "hard";

export interface Rules {
  pool: PoolName;
  /** Drop a stone on a random empty cell every N moves. */
  stoneEvery?: number;
  /** Drop a bomb every N moves, with this fuse. */
  bombEvery?: number;
  bombFuse?: number;
  /** Seconds allowed per move (enforced by the UI clock, which calls timeout()). */
  moveSeconds?: number;
}

export type Goal =
  | { type: "endless" }
  | { type: "score"; target: number }
  | { type: "lines"; target: number }
  | { type: "gems" }
  /** Play a fixed number of moves and score as much as possible (daily challenge). */
  | { type: "maxScore" };

export type Status = "playing" | "won" | "lost" | "finished";
export type LostReason = "noRoom" | "bomb" | "time" | "moves";

export interface GameState {
  size: number;
  grid: Grid;
  tray: (Piece | null)[];
  pieceRng: number;
  spawnRng: number;
  rules: Rules;
  goal: Goal;
  score: number;
  lines: number;
  gemsLeft: number;
  moves: number;
  movesLimit: number | null;
  combo: number;
  status: Status;
  lostReason?: LostReason;
  continued: boolean;
}

export interface PlayEvents {
  placed: [number, number][];
  cleared: { r: number; c: number; cell: Cell }[];
  lines: number;
  gained: number;
  combo: number;
  boardClear: boolean;
  gemsBroken: number;
  stonesCracked: number;
  bombsDefused: number;
  spawned: { r: number; c: number; cell: Cell }[];
  exploded: [number, number] | null;
}
