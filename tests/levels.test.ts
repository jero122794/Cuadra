import { describe, expect, it } from "vitest";
import { autoplay } from "../src/core/bot.ts";
import { fullLines, newGame, parseLayout } from "../src/core/engine.ts";
import { LEVELS, levelOptions, startMode, todayKey } from "../src/modes/modes.ts";

describe("levels", () => {
  it("has 30 levels numbered 1 to 30", () => {
    expect(LEVELS.map(l => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it.each(LEVELS.map(l => [l.id, l] as const))("level %i starts clean and can be won", (_id, level) => {
    if (level.layout) {
      const lines = fullLines(parseLayout(level.layout));
      expect(lines.rows.length + lines.cols.length).toBe(0);
    }
    const end = autoplay(newGame(levelOptions(level)));
    expect(end.status).toBe("won");
  });
});

describe("daily challenge", () => {
  it("gives everyone the same board and pieces on the same day", () => {
    const a = startMode("daily");
    const b = startMode("daily");
    expect(a.tray).toEqual(b.tray);
    expect(a.pieceRng).toBe(b.pieceRng);
  });

  it("uses the local calendar date", () => {
    expect(todayKey(new Date(2026, 10, 4, 23, 59))).toBe("2026-11-04");
  });
});
