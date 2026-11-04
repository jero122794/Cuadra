// Game screen: board, tray, drag and drop, HUD per mode, end-of-game dialogs.
import { canContinue, canPlace, fullLines, play, placeOnPreview, revive, starsFor, timeout } from "../core/engine.ts";
import { shapeSize } from "../core/shapes.ts";
import type { Cell, GameState, Piece, PlayEvents } from "../core/types.ts";
import { t } from "../i18n.ts";
import { DAILY_MOVES, LEVELS, todayKey, type ModeId } from "../modes/modes.ts";
import { ads } from "../services/ads/index.ts";
import { fx } from "../services/feedback.ts";
import {
  clearSession, getProgress, recordLevel, recordScore, saveSession
} from "../services/progress.ts";
import { button, confetti, h, icon, stars } from "./dom.ts";

export interface GameNav {
  home(): void;
  restart(mode: ModeId, levelId?: number): void;
}

const MODE_TITLE: Record<ModeId, () => string> = {
  classic: () => t("classic"),
  level: () => t("level"),
  daily: () => t("daily"),
  stone: () => t("stone"),
  bomb: () => t("bomb"),
  rush: () => t("rush")
};

function cellColor(cell: Cell): string {
  if (cell.kind === "stone") return "var(--stone)";
  if (cell.kind === "bomb") return "var(--bomb)";
  return `var(--t${cell.color})`;
}

export function gameScreen(initial: GameState, mode: ModeId, levelId: number | undefined, nav: GameNav): { el: HTMLElement; dispose(): void } {
  let game = initial;
  const size = game.size;
  let disposed = false;

  // ---------- Layout ----------
  const scoreEl = h("div", { class: "hud-score", text: String(game.score) });
  const title = mode === "level" ? `${t("level")} ${levelId}` : MODE_TITLE[mode]();
  const top = h("div", { class: "topbar" },
    button(icon("back"), () => nav.home(), "icon-btn", { "aria-label": t("home") }),
    h("div", { class: "topbar-title", text: title }),
    h("div", { class: "hud-score-wrap" }, scoreEl, h("div", { class: "label", text: t("score") }))
  );

  const goalText = h("div", { class: "goal-text" });
  const chips = h("div", { class: "chips" });
  const timerFill = h("div", { class: "timer-fill" });
  const timer = h("div", { class: "timer", attrs: { role: "progressbar", "aria-label": "Tiempo" } }, timerFill);
  timer.hidden = !game.rules.moveSeconds;
  const goalbar = h("div", { class: "goalbar" }, goalText, chips);

  const board = h("div", { class: "board", attrs: { "aria-label": `Tablero ${size} por ${size}` } });
  board.style.setProperty("--n", String(size));
  const cells: HTMLDivElement[] = [];
  for (let i = 0; i < size * size; i++) {
    const c = h("div", { class: "cell" });
    cells.push(c);
    board.append(c);
  }
  const boardWrap = h("div", { class: "board-wrap" }, board);
  const tray = h("div", { class: "tray" });
  const hint = h("p", { class: "hint", text: t("hint") });
  hint.hidden = getProgress().gamesPlayed > 2;

  const el = h("section", { class: "screen game" }, top, goalbar, timer, boardWrap, tray, hint);

  // ---------- Rendering ----------
  function renderHud() {
    scoreEl.textContent = String(game.score);
    chips.innerHTML = "";
    const g = game.goal;
    if (g.type === "score") goalText.textContent = t("goalScore", { n: g.target });
    else if (g.type === "lines") goalText.textContent = t("goalLines", { n: g.target });
    else if (g.type === "gems") goalText.textContent = t("goalGems");
    else if (g.type === "maxScore") goalText.textContent = t("goalDaily", { n: DAILY_MOVES });
    else goalText.textContent = `${t("best")}: ${Math.max(getProgress().best[mode] ?? 0, game.score)}`;

    const chip = (label: string, value: string, warn = false) =>
      chips.append(h("span", { class: "chip" + (warn ? " warn" : "") }, h("small", { text: label }), value));
    if (g.type === "lines") chip(t("linesDone"), `${Math.min(game.lines, g.target)}/${g.target}`);
    if (g.type === "gems") chip(t("gemsLeft"), String(game.gemsLeft));
    if (g.type === "score") chip(t("score"), `${Math.min(game.score, g.target)}/${g.target}`);
    if (game.movesLimit !== null) {
      const left = game.movesLimit - game.moves;
      chip(t("movesLeft"), String(left), left <= 3);
    }
  }

  function renderBoard(preview?: { piece: Piece; r: number; c: number }) {
    const prev = new Set<number>();
    const rows = new Set<number>(), cols = new Set<number>();
    if (preview) {
      for (const [dr, dc] of preview.piece.shape) prev.add((preview.r + dr) * size + preview.c + dc);
      const l = fullLines(placeOnPreview(game.grid, preview.piece, preview.r, preview.c));
      l.rows.forEach(r => rows.add(r));
      l.cols.forEach(c => cols.add(c));
    }
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        const el = cells[i];
        const cell = game.grid[r][c];
        let cls = "cell";
        el.textContent = "";
        if (cell) {
          cls += " filled k-" + cell.kind;
          el.style.setProperty("--c", cellColor(cell));
          if (cell.kind === "stone" && cell.hp === 1) cls += " cracked";
          if (cell.kind === "bomb") {
            el.textContent = String(cell.fuse ?? "");
            if ((cell.fuse ?? 9) <= 2) cls += " danger";
          }
        } else if (prev.has(i)) {
          cls += " preview";
          el.style.setProperty("--c", `var(--t${preview!.piece.color})`);
        }
        if (rows.has(r) || cols.has(c)) cls += " will-clear";
        if (el.classList.contains("flash")) cls += " flash";
        if (el.classList.contains("spawn")) cls += " spawn";
        if (el.classList.contains("placed")) cls += " placed";
        el.className = cls;
      }
  }

  function pieceNode(p: Piece, tile: string, gap: string): HTMLDivElement {
    const { h: ph, w } = shapeSize(p.shape);
    const node = h("div", { class: "piece" });
    node.style.gridTemplateColumns = `repeat(${w}, ${tile})`;
    node.style.gridTemplateRows = `repeat(${ph}, ${tile})`;
    node.style.gap = gap;
    for (const [r, c] of p.shape) {
      const tEl = h("div", { class: "tile" });
      tEl.style.gridRow = String(r + 1);
      tEl.style.gridColumn = String(c + 1);
      tEl.style.setProperty("--c", `var(--t${p.color})`);
      node.append(tEl);
    }
    return node;
  }

  function renderTray() {
    tray.innerHTML = "";
    game.tray.forEach((p, idx) => {
      const slot = h("div", { class: "slot" });
      if (p) {
        const node = pieceNode(p, "var(--mini)", "3px");
        node.dataset.idx = String(idx);
        const fits = game.status === "playing" && game.tray[idx] && [...Array(size * size).keys()]
          .some(k => canPlace(game.grid, p.shape, Math.floor(k / size), k % size));
        if (!fits) node.classList.add("dead");
        node.addEventListener("pointerdown", startDrag);
        slot.append(node);
      }
      tray.append(slot);
    });
  }

  function geometry() {
    const a = cells[0].getBoundingClientRect();
    const b = cells[1].getBoundingClientRect();
    return { left: a.left, top: a.top, size: a.width, pitch: b.left - a.left };
  }

  function sizeMini() {
    const { size: cs } = geometry();
    const slotW = tray.clientWidth / 3 - 8;
    const mini = Math.max(11, Math.min(cs * 0.56, (slotW - 12) / 5));
    tray.style.setProperty("--mini", `${mini}px`);
  }

  function renderAll() {
    renderHud();
    renderBoard();
    renderTray();
    requestAnimationFrame(sizeMini);
  }

  function floatText(main: string, sub?: string) {
    const f = h("div", { class: "float", text: main });
    if (sub) f.append(h("small", { text: sub }));
    boardWrap.append(f);
    setTimeout(() => f.remove(), 950);
  }

  // ---------- Drag & drop ----------
  interface Drag {
    idx: number; piece: Piece; ghost: HTMLDivElement; src: HTMLElement;
    width: number; height: number; lift: number; pid: number;
    target: { r: number; c: number } | null;
  }
  let drag: Drag | null = null;

  function startDrag(e: PointerEvent) {
    if (game.status !== "playing" || drag) return;
    const src = e.currentTarget as HTMLElement;
    const idx = Number(src.dataset.idx);
    const piece = game.tray[idx];
    if (!piece) return;
    e.preventDefault();
    const geo = geometry();
    const gap = geo.pitch - geo.size;
    const ghost = pieceNode(piece, `${geo.size}px`, `${gap}px`);
    ghost.className = "piece ghost";
    document.body.append(ghost);
    const { h: ph, w } = shapeSize(piece.shape);
    const width = w * geo.pitch - gap;
    const height = ph * geo.pitch - gap;
    const lift = e.pointerType === "mouse" ? 0 : height / 2 + geo.size * 1.1;
    drag = { idx, piece, ghost, src, width, height, lift, pid: e.pointerId, target: null };
    src.classList.add("lifted");
    hint.hidden = true;
    fx.pick();
    moveDrag(e);
  }

  function moveDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pid) return;
    const x = e.clientX - drag.width / 2;
    const y = e.clientY - drag.height / 2 - drag.lift;
    drag.ghost.style.transform = `translate(${x}px, ${y}px)`;
    const geo = geometry();
    const c = Math.round((x - geo.left) / geo.pitch);
    const r = Math.round((y - geo.top) / geo.pitch);
    const ok = canPlace(game.grid, drag.piece.shape, r, c);
    const same = ok && drag.target && drag.target.r === r && drag.target.c === c;
    if (same || (!ok && !drag.target)) return;
    drag.target = ok ? { r, c } : null;
    renderBoard(ok ? { piece: drag.piece, r, c } : undefined);
  }

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    d.ghost.remove();
    d.src.classList.remove("lifted");
    if (d.target) commit(d.idx, d.target.r, d.target.c);
    else renderBoard();
  }

  window.addEventListener("pointermove", moveDrag, { passive: true });
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", sizeMini);

  // ---------- Move clock (Contrarreloj) ----------
  let deadline = 0;
  let remainingOnPause = 0;
  let raf = 0;
  function startClock() {
    if (!game.rules.moveSeconds || game.status !== "playing") return;
    deadline = performance.now() + game.rules.moveSeconds * 1000;
    tickClock();
  }
  function tickClock() {
    cancelAnimationFrame(raf);
    if (disposed || !game.rules.moveSeconds || game.status !== "playing") return;
    const total = game.rules.moveSeconds * 1000;
    const left = Math.max(0, deadline - performance.now());
    timerFill.style.transform = `scaleX(${left / total})`;
    timer.classList.toggle("low", left < 3000);
    if (left <= 0) {
      game = timeout(game);
      endGame();
      return;
    }
    raf = requestAnimationFrame(tickClock);
  }
  function onVisibility() {
    if (!game.rules.moveSeconds || game.status !== "playing") return;
    if (document.hidden) {
      remainingOnPause = Math.max(0, deadline - performance.now());
      cancelAnimationFrame(raf);
    } else {
      deadline = performance.now() + remainingOnPause;
      tickClock();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  // ---------- Moves ----------
  function commit(idx: number, r: number, c: number) {
    const before = game;
    const result = play(game, idx, r, c);
    game = result.state;
    renderAll();
    effects(result.events, before);
    if (game.status === "playing") {
      saveSession({ mode, levelId, state: game });
      startClock();
    } else {
      setTimeout(endGame, result.events.exploded ? 700 : 450);
    }
  }

  function effects(ev: PlayEvents, _before: GameState) {
    for (const [r, c] of ev.placed) {
      const el = cells[r * size + c];
      if (!game.grid[r][c]) continue;
      el.classList.add("placed");
      setTimeout(() => el.classList.remove("placed"), 300);
    }
    if (ev.cleared.length) {
      const avgR = ev.cleared.reduce((a, x) => a + x.r, 0) / ev.cleared.length;
      const avgC = ev.cleared.reduce((a, x) => a + x.c, 0) / ev.cleared.length;
      confetti(boardWrap, 14 + ev.lines * 10, ((avgC + 0.5) / size) * 100, ((avgR + 0.5) / size) * 100);
    }
    for (const { r, c, cell } of ev.cleared) {
      const el = cells[r * size + c];
      el.style.setProperty("--fc", cellColor(cell));
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 420);
    }
    for (const { r, c } of ev.spawned) {
      const el = cells[r * size + c];
      el.classList.add("spawn");
      setTimeout(() => el.classList.remove("spawn"), 500);
    }
    if (ev.exploded) {
      const el = cells[ev.exploded[0] * size + ev.exploded[1]];
      el.classList.add("boom");
      board.classList.add("shake");
      setTimeout(() => board.classList.remove("shake"), 500);
    }
    if (ev.lines) {
      fx.clear(ev.lines);
      const sub = ev.boardClear ? t("clean") : ev.combo > 1 ? `${t("combo")} ×${ev.combo}` : "";
      floatText(`+${ev.gained}`, sub);
    } else {
      fx.place();
    }
    if (ev.stonesCracked) fx.crack();
    if (ev.gained) {
      scoreEl.classList.remove("bump");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("bump");
    }
  }

  // ---------- End of game ----------
  let overlay: HTMLElement | null = null;
  function closeOverlay() {
    overlay?.remove();
    overlay = null;
  }

  function endGame() {
    if (disposed) return;
    cancelAnimationFrame(raf);
    ads.gameplayStop();
    renderTray();
    let titleText = "";
    let isBest = false;
    let starCount = 0;
    if (game.status === "won") {
      starCount = starsFor(game);
      if (levelId) recordLevel(levelId, starCount);
      titleText = t("won");
      fx.win();
      clearSession();
    } else if (game.status === "finished") {
      isBest = recordScore("daily", game.score, todayKey());
      titleText = t("finished");
      fx.win();
      clearSession();
    } else {
      titleText = {
        noRoom: t("lostNoRoom"), bomb: t("lostBomb"), time: t("lostTime"), moves: t("lostMoves")
      }[game.lostReason ?? "noRoom"];
      if (mode !== "level") isBest = recordScore(mode, game.score);
      fx.lose();
    }

    const actions = h("div", { class: "dialog-actions" });
    const after = (fn: () => void) => async () => {
      closeOverlay();
      await ads.afterGame();
      if (!disposed) fn();
    };

    if (game.status === "lost" && canContinue(game)) {
      actions.append(button(h("span", { class: "with-ico" }, icon("play"), t("continue")), async () => {
        closeOverlay();
        const rewarded = await ads.rewarded();
        if (disposed) return;
        if (rewarded) {
          game = revive(game);
          renderAll();
          saveSession({ mode, levelId, state: game });
          ads.gameplayStart();
          startClock();
        } else {
          endGame();
        }
      }));
    }
    if (game.status === "won" && levelId && LEVELS.some(l => l.id === levelId + 1)) {
      actions.append(button(t("next"), after(() => nav.restart("level", levelId + 1))));
    }
    if (game.status !== "won" || !levelId) {
      actions.append(button(mode === "level" ? t("retry") : t("again"), after(() => nav.restart(mode, levelId)),
        game.status === "lost" && canContinue(game) ? "btn secondary" : "btn"));
    } else {
      actions.append(button(t("retry"), after(() => nav.restart(mode, levelId)), "btn secondary"));
    }
    actions.append(button(t("home"), after(() => nav.home()), "btn ghost"));

    const scoreLine = game.status === "finished"
      ? h("div", { class: "label", text: `${t("todayBest")}: ${getProgress().daily[todayKey()] ?? game.score}` })
      : h("div", { class: "label", text: t("score") });

    overlay = h("div", { class: "overlay" },
      h("div", { class: "dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-label": titleText } },
        h("h2", { text: titleText }),
        game.status === "won" ? stars(starCount) : null,
        h("div", {}, h("div", { class: "final", text: String(game.score) }), scoreLine),
        isBest && game.score > 0 ? h("div", { class: "new-best", text: t("newBest") }) : null,
        actions
      )
    );
    el.append(overlay);
    if (game.status === "won" || game.status === "finished" || isBest) confetti(overlay, 70, 50, 35);
    (actions.querySelector("button") as HTMLButtonElement | null)?.focus();
  }

  // ---------- Start ----------
  renderAll();
  ads.gameplayStart();
  if (game.status === "playing") {
    saveSession({ mode, levelId, state: game });
    startClock();
  } else {
    setTimeout(endGame, 300);
  }

  return {
    el,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("resize", sizeMini);
      document.removeEventListener("visibilitychange", onVisibility);
      drag?.ghost.remove();
      ads.gameplayStop();
    }
  };
}
