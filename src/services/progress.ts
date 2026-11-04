import type { GameState } from "../core/types.ts";
import type { ModeId } from "../modes/modes.ts";
import { load, remove, save } from "./storage.ts";

export interface Progress {
  /** Best stars per level id (1–3). */
  stars: Record<number, number>;
  best: Partial<Record<ModeId, number>>;
  /** Best daily score per date key. */
  daily: Record<string, number>;
  gamesPlayed: number;
}

const EMPTY: Progress = { stars: {}, best: {}, daily: {}, gamesPlayed: 0 };

let progress: Progress = { ...EMPTY, ...load<Partial<Progress>>("progress", {}) };

export function getProgress(): Progress {
  return progress;
}

function persist() {
  save("progress", progress);
}

export function highestCleared(): number {
  const ids = Object.keys(progress.stars).map(Number).filter(id => progress.stars[id] > 0);
  return ids.length ? Math.max(...ids) : 0;
}

export function isLevelUnlocked(id: number): boolean {
  return id <= highestCleared() + 1;
}

export function totalStars(): number {
  return Object.values(progress.stars).reduce((a, b) => a + b, 0);
}

export function recordLevel(id: number, stars: number) {
  if (stars > (progress.stars[id] ?? 0)) progress = { ...progress, stars: { ...progress.stars, [id]: stars } };
  persist();
}

/** Returns true when the score beats the previous best for that mode. */
export function recordScore(mode: ModeId, score: number, dateKey?: string): boolean {
  let isBest = false;
  if (mode === "daily" && dateKey) {
    const prev = progress.daily[dateKey] ?? 0;
    isBest = score > prev;
    if (isBest) progress = { ...progress, daily: { ...progress.daily, [dateKey]: score } };
  } else {
    const prev = progress.best[mode] ?? 0;
    isBest = score > prev;
    if (isBest) progress = { ...progress, best: { ...progress.best, [mode]: score } };
  }
  progress = { ...progress, gamesPlayed: progress.gamesPlayed + 1 };
  persist();
  return isBest;
}

export function resetProgress() {
  progress = { ...EMPTY };
  persist();
  clearSession();
}

// ----- Game in progress, so the app can resume after the phone kills it -----
export interface Session {
  mode: ModeId;
  levelId?: number;
  state: GameState;
}

export function saveSession(s: Session) {
  save("session", s);
}
export function loadSession(): Session | null {
  const s = load<Session | null>("session", null);
  return s && s.state && s.state.status === "playing" ? s : null;
}
export function clearSession() {
  remove("session");
}

// ----- Settings -----
export interface Settings {
  sound: boolean;
  haptics: boolean;
}
let settings: Settings = { sound: true, haptics: true, ...load<Partial<Settings>>("settings", {}) };
export function getSettings(): Settings {
  return settings;
}
export function setSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  save("settings", settings);
}
