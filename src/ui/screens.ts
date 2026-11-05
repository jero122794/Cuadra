// Home, level select and settings screens.
import { t } from "../i18n.ts";
import { EXTREMES, LEVELS, todayKey, type ModeId } from "../modes/modes.ts";
import { getPlayer, renamePlayer, shortId } from "../services/player.ts";
import {
  getProgress, getSettings, highestCleared, isLevelUnlocked, loadSession, resetProgress, setSettings, totalStars
} from "../services/progress.ts";
import { button, h, icon, stars, toast } from "./dom.ts";

export interface Nav {
  play(mode: ModeId, levelId?: number): void;
  resume(): void;
  levels(): void;
  settings(): void;
  home(): void;
}

function brand(): HTMLElement {
  return h("h1", { class: "brand" },
    h("span", { class: "brand-mark", attrs: { "aria-hidden": "true" } }, h("i"), h("i"), h("i"), h("i")),
    h("span", { text: "Cuadra" })
  );
}

/** Tile used for every secondary choice on the home screen. */
function tile(opts: {
  title: string; meta: string; accent: string; locked?: boolean; onClick: () => void; cls?: string; progress?: number;
}): HTMLButtonElement {
  return h("button", {
    class: "tile-btn" + (opts.locked ? " locked" : "") + (opts.cls ? " " + opts.cls : ""),
    attrs: { type: "button", ...(opts.locked ? { "aria-disabled": "true" } : {}) },
    style: { "--accent": opts.accent },
    on: { click: () => opts.onClick() }
  },
    h("span", { class: "tile-top" },
      h("span", { class: "swatch", attrs: { "aria-hidden": "true" } }),
      opts.locked ? icon("lock") : null
    ),
    h("span", { class: "tile-title", text: opts.title }),
    h("span", { class: "tile-meta", text: opts.meta }),
    opts.progress !== undefined
      ? h("span", { class: "bar", attrs: { "aria-hidden": "true" } }, h("i", { style: { width: `${Math.round(opts.progress * 100)}%` } }))
      : null
  ) as HTMLButtonElement;
}

export function homeScreen(nav: Nav): HTMLElement {
  const p = getProgress();
  const player = getPlayer();
  const session = loadSession();
  const cleared = highestCleared();

  const header = h("header", { class: "home-head" },
    brand(),
    button(icon("gear"), () => nav.settings(), "icon-btn", { "aria-label": t("settings") })
  );
  const hello = h("p", { class: "hello", text: player.name });

  // One primary action. A saved game takes priority over starting a new one.
  const best = p.best.classic ?? 0;
  const hero = h("div", { class: "hero" });
  if (session) {
    hero.append(
      button(h("span", { class: "hero-label" }, icon("play"), t("resume")), () => nav.resume(), "btn hero-btn"),
      button(t("newGame"), () => nav.play("classic"), "btn secondary")
    );
  } else {
    hero.append(
      button(h("span", { class: "hero-label big" }, icon("play"), t("play")), () => nav.play("classic"), "btn hero-btn"),
      h("p", { class: "hero-sub", text: best ? t("classicBest", { n: best }) : t("classic") })
    );
  }

  const nextLevel = Math.min(cleared + 1, LEVELS.length);
  const daily = p.daily[todayKey()];
  const secondary = h("div", { class: "tile-grid two" },
    tile({
      title: t("levels"),
      meta: cleared >= LEVELS.length ? t("allDone") : t("nextLevel", { n: nextLevel }),
      accent: "var(--t3)",
      progress: totalStars() / (LEVELS.length * 3),
      onClick: () => nav.levels()
    }),
    tile({
      title: t("daily"),
      meta: daily ? t("dailyBest", { n: daily }) : t("dailyNew"),
      accent: "var(--t2)",
      onClick: () => nav.play("daily")
    })
  );

  const extremes = h("div", { class: "tile-grid three" },
    ...EXTREMES.map((ex, i) => {
      const locked = cleared < ex.unlockAfterLevel;
      const bestEx = p.best[ex.id];
      return tile({
        title: t(ex.id),
        meta: locked ? t("lockedShort", { n: ex.unlockAfterLevel }) : bestEx ? `${t("best")} ${bestEx}` : t("play"),
        accent: ["var(--stone)", "var(--t5)", "var(--t4)"][i],
        locked,
        cls: "compact",
        onClick: () => (locked ? toast(t("unlockToast", { n: ex.unlockAfterLevel })) : nav.play(ex.id))
      });
    })
  );

  return h("section", { class: "screen home" },
    header, hello,
    h("div", { class: "home-main" }, hero, secondary),
    h("h2", { class: "section-label", text: t("extremes") }),
    extremes
  );
}

export function levelsScreen(nav: Nav): HTMLElement {
  const p = getProgress();
  const current = Math.min(highestCleared() + 1, LEVELS.length);
  const grid = h("div", { class: "level-grid" });
  for (const l of LEVELS) {
    const unlocked = isLevelUnlocked(l.id);
    const kind = l.goal.type === "gems" ? "gem" : l.layout?.some(r => r.includes("s")) ? "stone" : "plain";
    const earned = p.stars[l.id] ?? 0;
    const state = !unlocked ? "locked" : earned ? "done" : l.id === current ? "current" : "open";
    grid.append(h("button", {
      class: `level-btn k-${kind} ${state}`,
      attrs: {
        type: "button",
        "aria-label": `${t("level")} ${l.id}` + (unlocked ? `, ${earned}/3 ${t("stars")}` : ""),
        ...(unlocked ? {} : { "aria-disabled": "true" }),
        ...(state === "current" ? { "aria-current": "step" } : {})
      },
      on: { click: () => (unlocked ? nav.play("level", l.id) : toast(t("unlockToast", { n: l.id - 1 }))) }
    },
      h("span", { class: "level-num", text: String(l.id) }),
      unlocked ? stars(earned) : icon("lock")
    ));
  }
  return h("section", { class: "screen levels" },
    h("header", { class: "topbar" },
      button(icon("back"), () => nav.home(), "icon-btn", { "aria-label": t("back") }),
      h("h1", { class: "topbar-title", text: t("levels") }),
      h("div", { class: "topbar-meta", attrs: { "aria-label": `${totalStars()} / ${LEVELS.length * 3} ${t("stars")}` } },
        icon("star", "star on"), `${totalStars()}/${LEVELS.length * 3}`)
    ),
    grid
  );
}

export function settingsScreen(nav: Nav): HTMLElement {
  const player = getPlayer();
  const s = getSettings();

  const name = h("input", { attrs: { id: "player-name", type: "text", maxlength: "16", autocomplete: "nickname", value: player.name } });
  const saveBtn = button(t("save"), () => {
    const p = renamePlayer(name.value);
    name.value = p.name;
    saveBtn.disabled = true;
    toast(t("nameSaved"), "success");
  }, "btn small");
  saveBtn.disabled = true;
  name.addEventListener("input", () => { saveBtn.disabled = name.value.trim() === getPlayer().name || !name.value.trim(); });
  name.addEventListener("keydown", e => { if (e.key === "Enter" && !saveBtn.disabled) saveBtn.click(); });
  const nameRow = h("div", { class: "field" },
    h("label", { attrs: { for: "player-name" }, text: t("playerName") }),
    h("div", { class: "row" }, name, saveBtn)
  );

  const idText = h("code", { class: "pid-full", text: shortId(player) });
  const copyBtn = button(t("copy"), () => {
    navigator.clipboard?.writeText(player.id).then(() => toast(t("copied"), "success"), () => {
      const range = document.createRange();
      range.selectNodeContents(idText);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }, "btn small secondary");
  const idRow = h("div", { class: "field" }, h("span", { class: "field-label", text: t("playerId") }), h("div", { class: "row" }, idText, copyBtn));

  const toggle = (key: "sound" | "haptics", label: string) => {
    const input = h("input", { class: "switch", attrs: { type: "checkbox", id: `set-${key}`, role: "switch" } });
    input.checked = s[key];
    input.addEventListener("change", () => setSettings({ [key]: input.checked }));
    return h("label", { class: "switch-row", attrs: { for: `set-${key}` } }, h("span", { text: label }), input);
  };

  const confirmBox = h("div", { class: "confirm", attrs: { role: "alertdialog", "aria-label": t("reset") } },
    h("p", { text: t("resetConfirm") }),
    h("div", { class: "row" },
      button(t("confirm"), () => { resetProgress(); toast(t("progressReset"), "success"); nav.home(); }, "btn danger small"),
      button(t("cancel"), () => { confirmBox.hidden = true; resetBtn.hidden = false; resetBtn.focus(); }, "btn secondary small")
    )
  );
  confirmBox.hidden = true;
  const resetBtn = button(t("reset"), () => {
    confirmBox.hidden = false;
    resetBtn.hidden = true;
    (confirmBox.querySelector(".btn.secondary") as HTMLElement | null)?.focus();
  }, "btn danger-outline");

  return h("section", { class: "screen settings" },
    h("header", { class: "topbar" },
      button(icon("back"), () => nav.home(), "icon-btn", { "aria-label": t("back") }),
      h("h1", { class: "topbar-title", text: t("settings") }),
      h("div")
    ),
    h("div", { class: "panel" }, nameRow, idRow),
    h("div", { class: "panel" }, toggle("sound", t("sound")), toggle("haptics", t("haptics"))),
    h("div", { class: "panel" }, resetBtn, confirmBox),
    h("p", { class: "version", text: "Cuadra 1.0.0" })
  );
}
