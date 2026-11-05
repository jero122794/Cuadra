// Game screen: board, tray, three ways to place a piece (drag, tap-then-tap,
// keyboard), HUD per mode and end-of-game dialogs.
//
// Placing without dragging is required by WCAG 2.2 SC 2.5.7 (Dragging
// Movements) and SC 2.1.1 (Keyboard); it is also easier on small phones.
import { canContinue, canPlace, fitsAnywhere, fullLines, hasMove, play, placeOnPreview, revive, starsFor, timeout } from "../core/engine.ts";
import { shapeSize } from "../core/shapes.ts";
import type { Cell, GameState, Piece, PlayEvents } from "../core/types.ts";
import { t } from "../i18n.ts";
import { DAILY_MOVES, LEVELS, todayKey, type ModeId } from "../modes/modes.ts";
import { ads } from "../services/ads/index.ts";
import { fx } from "../services/feedback.ts";
import { clearSession, getProgress, recordLevel, recordScore, saveSession } from "../services/progress.ts";
import { button, confetti, h, icon, liveRegion, stars, toast, trapFocus } from "./dom.ts";

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

const DRAG_THRESHOLD = 6;

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
  const top = h("header", { class: "topbar" },
    button(icon("back"), () => nav.home(), "icon-btn", { "aria-label": t("home") }),
    h("h1", { class: "topbar-title", text: title }),
    h("div", { class: "hud-score-wrap", attrs: { "aria-label": t("score") } }, scoreEl, h("div", { class: "label", text: t("score") }))
  );

  const goalText = h("div", { class: "goal-text" });
  const chips = h("div", { class: "chips" });
  const timerFill = h("div", { class: "timer-fill" });
  const timer = h("div", { class: "timer", attrs: { role: "progressbar", "aria-label": t("rush"), "aria-valuemin": "0", "aria-valuemax": "100" } }, timerFill);
  timer.hidden = !game.rules.moveSeconds;
  const goalbar = h("div", { class: "goalbar" }, goalText, chips);

  const board = h("div", {
    class: "board",
    attrs: { role: "application", tabindex: "0", "aria-label": t("boardLabel"), "aria-roledescription": "tablero" }
  });
  board.style.setProperty("--n", String(size));
  const cells: HTMLDivElement[] = [];
  for (let i = 0; i < size * size; i++) {
    const c = h("div", { class: "cell", attrs: { "aria-hidden": "true" } });
    c.dataset.i = String(i);
    cells.push(c);
    board.append(c);
  }
  const boardWrap = h("div", { class: "board-wrap" }, board);
  const tray = h("div", { class: "tray", attrs: { role: "group", "aria-label": "Piezas" } });
  const hint = h("p", { class: "hint", text: t("hint") });
  hint.hidden = getProgress().gamesPlayed > 2;
  const announcer = liveRegion();

  const el = h("section", { class: "screen game" }, top, goalbar, timer, boardWrap, tray, hint, announcer);

  // ---------- Selection (tap / keyboard) ----------
  let selected: number | null = null;
  let cursor = { r: 0, c: 0 };
  let hoverCell: number | null = null;

  function select(idx: number | null, focusBoard = false) {
    selected = idx !== null && game.tray[idx] ? idx : null;
    if (selected !== null) {
      const p = game.tray[selected]!;
      const { h: ph, w } = shapeSize(p.shape);
      cursor = clampCursor(Math.floor((size - ph) / 2), Math.floor((size - w) / 2), p);
      board.classList.add("armed");
      fx.pick();
      if (focusBoard) {
        board.focus();
        announceCursor();
      }
    } else {
      board.classList.remove("armed");
    }
    renderTray();
    renderBoard(previewFor());
  }

  function clampCursor(r: number, c: number, p: Piece) {
    const { h: ph, w } = shapeSize(p.shape);
    return { r: Math.max(0, Math.min(size - ph, r)), c: Math.max(0, Math.min(size - w, c)) };
  }

  /** Top-left for a piece centred on a tapped cell. */
  function anchorAt(cellIndex: number, p: Piece) {
    const { h: ph, w } = shapeSize(p.shape);
    const r = Math.floor(cellIndex / size), c = cellIndex % size;
    return clampCursor(r - Math.floor((ph - 1) / 2), c - Math.floor((w - 1) / 2), p);
  }

  function previewFor(): { piece: Piece; r: number; c: number; bad: boolean } | undefined {
    if (selected === null) return undefined;
    const p = game.tray[selected];
    if (!p) return undefined;
    const pos = hoverCell !== null ? anchorAt(hoverCell, p) : cursor;
    return { piece: p, ...pos, bad: !canPlace(game.grid, p.shape, pos.r, pos.c) };
  }

  function announceCursor() {
    const pv = previewFor();
    if (!pv) return;
    announcer.textContent = t("cursorAt", { r: pv.r + 1, c: pv.c + 1, fit: pv.bad ? t("notFits") : t("fits") });
  }

  function tryPlaceSelected(pos: { r: number; c: number }) {
    if (selected === null) return;
    const p = game.tray[selected];
    if (!p) return;
    if (!canPlace(game.grid, p.shape, pos.r, pos.c)) {
      toast(t("noFit"), "error");
      board.classList.remove("nope");
      void board.offsetWidth;
      board.classList.add("nope");
      return;
    }
    const idx = selected;
    selected = null;
    hoverCell = null;
    board.classList.remove("armed");
    commit(idx, pos.r, pos.c);
  }

  board.addEventListener("click", e => {
    if (drag || game.status !== "playing") return;
    const target = (e.target as HTMLElement).closest(".cell") as HTMLElement | null;
    if (!target) return;
    if (selected === null) {
      toast(t("selectFirst"));
      return;
    }
    const p = game.tray[selected]!;
    tryPlaceSelected(anchorAt(Number(target.dataset.i), p));
  });

  board.addEventListener("pointermove", e => {
    if (drag || selected === null || e.pointerType !== "mouse") return;
    const target = (e.target as HTMLElement).closest(".cell") as HTMLElement | null;
    const i = target ? Number(target.dataset.i) : null;
    if (i === hoverCell) return;
    hoverCell = i;
    renderBoard(previewFor());
  });
  board.addEventListener("pointerleave", () => {
    if (hoverCell === null) return;
    hoverCell = null;
    renderBoard(previewFor());
  });

  board.addEventListener("keydown", e => {
    if (game.status !== "playing") return;
    if (/^[1-3]$/.test(e.key)) {
      e.preventDefault();
      const idx = Number(e.key) - 1;
      if (game.tray[idx]) select(idx, true);
      return;
    }
    if (selected === null) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const first = game.tray.findIndex(p => p && fitsAnywhere(game.grid, p.shape));
        if (first >= 0) select(first, true);
        else toast(t("selectFirst"));
      }
      return;
    }
    const p = game.tray[selected]!;
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      hoverCell = null;
      cursor = clampCursor(cursor.r + moves[e.key][0], cursor.c + moves[e.key][1], p);
      renderBoard(previewFor());
      announceCursor();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tryPlaceSelected(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      const idx = selected;
      select(null);
      (tray.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null)?.focus();
    }
  });

  // ---------- Rendering ----------
  function renderHud() {
    scoreEl.textContent = String(game.score);
    chips.innerHTML = "";
    const g = game.goal;
    if (g.type === "score") goalText.textContent = t("goalScore", { n: g.target });
    else if (g.type === "lines") goalText.textContent = t("goalLines", { n: g.target });
    else if (g.type === "gems") goalText.textContent = t("goalGems");
    else if (g.type === "maxScore") goalText.textContent = t("goalDaily", { n: DAILY_MOVES });
    else if (mode === "stone" || mode === "bomb" || mode === "rush") goalText.textContent = t(`${mode}Sub` as "stoneSub");
    else goalText.textContent = t("classicSub");

    const chip = (label: string, value: string, warn = false) =>
      chips.append(h("span", { class: "chip" + (warn ? " warn" : "") }, h("small", { text: label }), value));
    if (g.type === "lines") chip(t("linesDone"), `${Math.min(game.lines, g.target)}/${g.target}`);
    if (g.type === "gems") chip(t("gemsLeft"), String(game.gemsLeft));
    if (g.type === "score") chip(t("score"), `${Math.min(game.score, g.target)}/${g.target}`);
    if (g.type === "endless") chip(t("best"), String(Math.max(getProgress().best[mode] ?? 0, game.score)));
    if (game.movesLimit !== null) {
      const left = game.movesLimit - game.moves;
      chip(t("movesLeft"), String(left), left <= 3);
    }
  }

  function renderBoard(preview?: { piece: Piece; r: number; c: number; bad?: boolean }) {
    const prev = new Set<number>();
    const rows = new Set<number>(), cols = new Set<number>();
    if (preview) {
      for (const [dr, dc] of preview.piece.shape) prev.add((preview.r + dr) * size + preview.c + dc);
      if (!preview.bad) {
        const l = fullLines(placeOnPreview(game.grid, preview.piece, preview.r, preview.c));
        l.rows.forEach(r => rows.add(r));
        l.cols.forEach(c => cols.add(c));
      }
    }
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        const cellEl = cells[i];
        const cell = game.grid[r][c];
        let cls = "cell";
        cellEl.textContent = "";
        if (cell) {
          cls += " filled k-" + cell.kind;
          cellEl.style.setProperty("--c", cellColor(cell));
          if (cell.kind === "stone" && cell.hp === 1) cls += " cracked";
          if (cell.kind === "bomb") {
            cellEl.textContent = String(cell.fuse ?? "");
            if ((cell.fuse ?? 9) <= 2) cls += " danger";
          }
          if (prev.has(i) && preview?.bad) cls += " clash";
        } else if (prev.has(i)) {
          cls += preview?.bad ? " preview bad" : " preview";
          cellEl.style.setProperty("--c", `var(--t${preview!.piece.color})`);
        }
        if (rows.has(r) || cols.has(c)) cls += " will-clear";
        for (const keep of ["flash", "spawn", "placed", "boom"]) if (cellEl.classList.contains(keep)) cls += " " + keep;
        cellEl.className = cls;
      }
  }

  function pieceNode(p: Piece, tile: string, gap: string, tag: "div" | "button" = "div"): HTMLElement {
    const { h: ph, w } = shapeSize(p.shape);
    const node = tag === "button" ? h("button", { class: "piece", attrs: { type: "button" } }) : h("div", { class: "piece" });
    node.style.gridTemplateColumns = `repeat(${w}, ${tile})`;
    node.style.gridTemplateRows = `repeat(${ph}, ${tile})`;
    node.style.gap = gap;
    for (const [r, c] of p.shape) {
      const tEl = h("div", { class: "tile", attrs: { "aria-hidden": "true" } });
      tEl.style.gridRow = String(r + 1);
      tEl.style.gridColumn = String(c + 1);
      tEl.style.setProperty("--c", `var(--t${p.color})`);
      node.append(tEl);
    }
    return node;
  }

  function renderTray() {
    const hadFocus = tray.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.idx : undefined;
    tray.innerHTML = "";
    game.tray.forEach((p, idx) => {
      const slot = h("div", { class: "slot" + (selected === idx ? " selected" : "") });
      if (p) {
        const node = pieceNode(p, "var(--mini)", "3px", "button") as HTMLButtonElement;
        node.dataset.idx = String(idx);
        const fits = game.status === "playing" && fitsAnywhere(game.grid, p.shape);
        let label = t("pieceLabel", { i: idx + 1, n: p.shape.length });
        if (!fits) {
          node.classList.add("dead");
          node.setAttribute("aria-disabled", "true");
          label += `, ${t("pieceNoFit")}`;
        }
        node.setAttribute("aria-label", label);
        node.setAttribute("aria-pressed", String(selected === idx));
        node.addEventListener("pointerdown", onPiecePointerDown);
        node.addEventListener("keydown", e => {
          if ((e.key === "Enter" || e.key === " ") && fits) {
            e.preventDefault();
            select(idx, true);
          }
        });
        slot.append(node);
      }
      tray.append(slot);
    });
    if (hadFocus !== undefined) (tray.querySelector(`[data-idx="${hadFocus}"]`) as HTMLElement | null)?.focus();
  }

  function geometry() {
    const a = cells[0].getBoundingClientRect();
    const b = cells[1].getBoundingClientRect();
    return { left: a.left, top: a.top, size: a.width, pitch: b.left - a.left };
  }

  function sizeMini() {
    // Fit the largest piece (5 tiles long) inside one slot, whether the tray is
    // a row under the board (phones) or a column beside it (desktop).
    const { size: cs } = geometry();
    const slot = tray.querySelector(".slot")?.getBoundingClientRect();
    const slotW = slot ? slot.width : tray.clientWidth / 3;
    const slotH = slot && slot.height > 40 ? slot.height : Infinity;
    const mini = Math.max(11, Math.min(cs * 0.62, (slotW - 20) / 5, (slotH - 20) / 5));
    tray.style.setProperty("--mini", `${mini}px`);
  }

  function renderAll() {
    renderHud();
    renderBoard(previewFor());
    renderTray();
    requestAnimationFrame(sizeMini);
  }

  function floatText(main: string, sub?: string) {
    const f = h("div", { class: "float", text: main, attrs: { "aria-hidden": "true" } });
    if (sub) f.append(h("small", { text: sub }));
    boardWrap.append(f);
    setTimeout(() => f.remove(), 950);
  }

  // ---------- Drag & drop (a press that moves becomes a drag; a tap selects) ----------
  interface Drag {
    idx: number; piece: Piece; ghost: HTMLElement; src: HTMLElement;
    width: number; height: number; lift: number; pid: number;
    target: { r: number; c: number } | null;
  }
  let drag: Drag | null = null;
  let press: { idx: number; x: number; y: number; pid: number; src: HTMLElement; type: string } | null = null;

  function onPiecePointerDown(e: PointerEvent) {
    if (game.status !== "playing" || drag) return;
    const src = e.currentTarget as HTMLElement;
    const idx = Number(src.dataset.idx);
    if (!game.tray[idx] || src.classList.contains("dead")) return;
    e.preventDefault();
    press = { idx, x: e.clientX, y: e.clientY, pid: e.pointerId, src, type: e.pointerType };
  }

  function beginDrag(e: PointerEvent) {
    if (!press) return;
    const { idx, src } = press;
    const piece = game.tray[idx]!;
    const geo = geometry();
    const gap = geo.pitch - geo.size;
    const ghost = pieceNode(piece, `${geo.size}px`, `${gap}px`);
    ghost.className = "piece ghost";
    document.body.append(ghost);
    const { h: ph, w } = shapeSize(piece.shape);
    const width = w * geo.pitch - gap;
    const height = ph * geo.pitch - gap;
    const lift = press.type === "mouse" ? 0 : height / 2 + geo.size * 1.1;
    drag = { idx, piece, ghost, src, width, height, lift, pid: press.pid, target: null };
    press = null;
    selected = null;
    hoverCell = null;
    board.classList.remove("armed");
    src.classList.add("lifted");
    hint.hidden = true;
    fx.pick();
    moveDrag(e);
  }

  function moveDrag(e: PointerEvent) {
    if (press && e.pointerId === press.pid) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD) beginDrag(e);
      return;
    }
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
    if (press && e.pointerId === press.pid) {
      // A tap: toggle selection of this piece.
      const idx = press.idx;
      press = null;
      select(selected === idx ? null : idx);
      return;
    }
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    d.ghost.remove();
    d.src.classList.remove("lifted");
    if (d.target) commit(d.idx, d.target.r, d.target.c);
    else renderBoard();
    // Let the click that follows pointerup see that a drag just happened.
    setTimeout(() => { drag = null; }, 0);
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
    timer.setAttribute("aria-valuenow", String(Math.round((left / total) * 100)));
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
    const result = play(game, idx, r, c);
    game = result.state;
    renderAll();
    effects(result.events);
    const ev = result.events;
    announcer.textContent = [t("placedAnnounce", { n: ev.gained }), ev.lines ? t("linesAnnounce", { n: ev.lines }) : ""].filter(Boolean).join(". ");
    if (game.status === "playing") {
      saveSession({ mode, levelId, state: game });
      startClock();
      if (document.activeElement === board || document.activeElement === document.body) {
        const next = game.tray.findIndex(p => p);
        if (board === document.activeElement && next >= 0) announceCursor();
      }
    } else {
      setTimeout(endGame, result.events.exploded ? 700 : 450);
    }
  }

  function effects(ev: PlayEvents) {
    for (const [r, c] of ev.placed) {
      const cellEl = cells[r * size + c];
      if (!game.grid[r][c]) continue;
      cellEl.classList.add("placed");
      setTimeout(() => cellEl.classList.remove("placed"), 300);
    }
    if (ev.cleared.length) {
      const avgR = ev.cleared.reduce((a, x) => a + x.r, 0) / ev.cleared.length;
      const avgC = ev.cleared.reduce((a, x) => a + x.c, 0) / ev.cleared.length;
      confetti(boardWrap, 14 + ev.lines * 10, ((avgC + 0.5) / size) * 100, ((avgR + 0.5) / size) * 100);
    }
    for (const { r, c, cell } of ev.cleared) {
      const cellEl = cells[r * size + c];
      cellEl.style.setProperty("--fc", cellColor(cell));
      cellEl.classList.add("flash");
      setTimeout(() => cellEl.classList.remove("flash"), 420);
    }
    for (const { r, c } of ev.spawned) {
      const cellEl = cells[r * size + c];
      cellEl.classList.add("spawn");
      setTimeout(() => cellEl.classList.remove("spawn"), 500);
    }
    if (ev.exploded) {
      const cellEl = cells[ev.exploded[0] * size + ev.exploded[1]];
      cellEl.classList.add("boom");
      setTimeout(() => cellEl.classList.remove("boom"), 650);
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
  let releaseFocus: (() => void) | null = null;
  let recorded = false;
  let lastBest = false;
  let lastStars = 0;

  function closeOverlay() {
    releaseFocus?.();
    releaseFocus = null;
    overlay?.remove();
    overlay = null;
  }

  function record() {
    if (recorded) return;
    recorded = true;
    if (game.status === "won") {
      lastStars = starsFor(game);
      if (levelId) recordLevel(levelId, lastStars);
      clearSession();
    } else if (game.status === "finished") {
      lastBest = recordScore("daily", game.score, todayKey());
      clearSession();
    } else if (!canContinue(game)) {
      if (mode !== "level") lastBest = recordScore(mode, game.score);
      clearSession();
    }
  }

  function endGame() {
    if (disposed) return;
    cancelAnimationFrame(raf);
    ads.gameplayStop();
    select(null);
    if (!canContinue(game)) record();

    let titleText: string;
    if (game.status === "won") { titleText = t("won"); fx.win(); }
    else if (game.status === "finished") { titleText = t("finished"); fx.win(); }
    else {
      titleText = { noRoom: t("lostNoRoom"), bomb: t("lostBomb"), time: t("lostTime"), moves: t("lostMoves") }[game.lostReason ?? "noRoom"];
      fx.lose();
    }

    const actions = h("div", { class: "dialog-actions" });
    const leave = (fn: () => void) => async () => {
      record();
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
          board.focus();
        } else {
          toast(t("adUnavailable"), "error");
          endGame();
        }
      }));
    }
    const hasNext = game.status === "won" && levelId && LEVELS.some(l => l.id === levelId + 1);
    if (hasNext) actions.append(button(t("next"), leave(() => nav.restart("level", levelId! + 1))));
    const retryLabel = mode === "level" ? t("retry") : t("again");
    const retryIsPrimary = !hasNext && !(game.status === "lost" && canContinue(game));
    actions.append(button(retryLabel, leave(() => nav.restart(mode, levelId)), retryIsPrimary ? "btn" : "btn secondary"));
    actions.append(button(t("home"), leave(() => nav.home()), "btn ghost"));

    const scoreLine = game.status === "finished"
      ? h("div", { class: "label", text: `${t("todayBest")}: ${getProgress().daily[todayKey()] ?? game.score}` })
      : h("div", { class: "label", text: t("score") });

    const dialog = h("div", { class: "dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "end-title" } },
      h("h2", { text: titleText, attrs: { id: "end-title" } }),
      game.status === "won" ? stars(lastStars || starsFor(game)) : null,
      h("div", {}, h("div", { class: "final", text: String(game.score) }), scoreLine),
      lastBest && game.score > 0 ? h("div", { class: "new-best", text: t("newBest") }) : null,
      actions
    );
    overlay = h("div", { class: "overlay" }, dialog);
    el.append(overlay);
    releaseFocus = trapFocus(dialog);
    if (game.status === "won" || game.status === "finished" || lastBest) confetti(overlay, 70, 50, 35);
    (actions.querySelector("button") as HTMLButtonElement | null)?.focus();
  }

  // ---------- Start ----------
  // A resumed save can have no move left (the app was closed on the last move).
  if (game.status === "playing" && !hasMove(game)) game = { ...game, status: "lost", lostReason: "noRoom" };
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
      releaseFocus?.();
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
