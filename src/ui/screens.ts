// Home, level select and settings screens.
import { t } from "../i18n.ts";
import { EXTREMES, LEVELS, todayKey, type ModeId } from "../modes/modes.ts";
import { getPlayer, renamePlayer, shortId } from "../services/player.ts";
import {
  getProgress, getSettings, highestCleared, isLevelUnlocked, loadSession, resetProgress, setSettings, totalStars
} from "../services/progress.ts";
import { button, h, icon, stars } from "./dom.ts";

export interface Nav {
  play(mode: ModeId, levelId?: number): void;
  resume(): void;
  levels(): void;
  settings(): void;
  home(): void;
}

function brand(): HTMLElement {
  return h("div", { class: "brand" },
    h("span", { class: "brand-mark", attrs: { "aria-hidden": "true" } }, h("i"), h("i"), h("i"), h("i")),
    h("span", { text: "Cuadra" })
  );
}

function modeCard(opts: {
  title: string; sub: string; meta?: string; locked?: string; accent: string; onClick: () => void;
}): HTMLElement {
  const card = h("button", {
    class: "mode-card" + (opts.locked ? " locked" : ""),
    attrs: { type: "button", ...(opts.locked ? { "aria-disabled": "true" } : {}) },
    style: { "--accent": opts.accent },
    on: { click: () => { if (!opts.locked) opts.onClick(); } }
  },
    h("span", { class: "mode-swatch", attrs: { "aria-hidden": "true" } }),
    h("span", { class: "mode-body" },
      h("span", { class: "mode-title", text: opts.title }),
      h("span", { class: "mode-sub", text: opts.locked ?? opts.sub })
    ),
    opts.locked ? icon("lock") : opts.meta ? h("span", { class: "mode-meta", text: opts.meta }) : null
  );
  return card;
}

export function homeScreen(nav: Nav): HTMLElement {
  const p = getProgress();
  const player = getPlayer();
  const session = loadSession();
  const cleared = highestCleared();

  const header = h("div", { class: "home-head" },
    brand(),
    button(icon("gear"), () => nav.settings(), "icon-btn", { "aria-label": t("settings") })
  );
  const hello = h("p", { class: "hello" }, player.name, h("span", { class: "pid", text: ` · ${shortId(player)}` }));

  const resume = session
    ? button(h("span", { class: "with-ico" }, icon("play"), t("resume")), () => nav.resume(), "btn resume")
    : null;

  const daily = p.daily[todayKey()];
  const list = h("div", { class: "modes" },
    modeCard({ title: t("classic"), sub: t("classicSub"), meta: p.best.classic ? `${t("best")} ${p.best.classic}` : undefined, accent: "var(--t1)", onClick: () => nav.play("classic") }),
    modeCard({ title: t("levels"), sub: t("levelsSub"), meta: `★ ${totalStars()}/${LEVELS.length * 3}`, accent: "var(--t3)", onClick: () => nav.levels() }),
    modeCard({ title: t("daily"), sub: t("dailySub"), meta: daily ? `${t("best")} ${daily}` : todayKey().slice(5).replace("-", "/"), accent: "var(--t2)", onClick: () => nav.play("daily") })
  );

  const extremes = h("div", { class: "modes" },
    ...EXTREMES.map((ex, i) => modeCard({
      title: t(ex.id),
      sub: t(`${ex.id}Sub` as "stoneSub"),
      meta: p.best[ex.id] ? `${t("best")} ${p.best[ex.id]}` : undefined,
      locked: cleared >= ex.unlockAfterLevel ? undefined : t("lockedAfter", { n: ex.unlockAfterLevel }),
      accent: ["var(--stone)", "var(--t5)", "var(--t4)"][i],
      onClick: () => nav.play(ex.id)
    }))
  );

  return h("section", { class: "screen home" },
    header, hello, resume,
    list,
    h("h3", { class: "section-label", text: t("extremes") }),
    extremes
  );
}

export function levelsScreen(nav: Nav): HTMLElement {
  const p = getProgress();
  const grid = h("div", { class: "level-grid" });
  for (const l of LEVELS) {
    const unlocked = isLevelUnlocked(l.id);
    const kind = l.goal.type === "gems" ? "gem" : l.layout?.some(r => r.includes("s")) ? "stone" : "plain";
    grid.append(h("button", {
      class: `level-btn k-${kind}` + (unlocked ? "" : " locked") + (p.stars[l.id] ? " done" : ""),
      attrs: { type: "button", "aria-label": `${t("level")} ${l.id}`, ...(unlocked ? {} : { "aria-disabled": "true" }) },
      on: { click: () => { if (unlocked) nav.play("level", l.id); } }
    },
      h("span", { class: "level-num", text: String(l.id) }),
      unlocked ? stars(p.stars[l.id] ?? 0) : icon("lock")
    ));
  }
  return h("section", { class: "screen levels" },
    h("div", { class: "topbar" },
      button(icon("back"), () => nav.home(), "icon-btn", { "aria-label": t("back") }),
      h("div", { class: "topbar-title", text: t("levels") }),
      h("div", { class: "topbar-meta", text: `★ ${totalStars()}/${LEVELS.length * 3}` })
    ),
    grid
  );
}

export function settingsScreen(nav: Nav): HTMLElement {
  const player = getPlayer();
  const s = getSettings();

  const name = h("input", { attrs: { id: "player-name", type: "text", maxlength: "16", autocomplete: "nickname", value: player.name } });
  const saved = h("span", { class: "saved", text: "" });
  const nameRow = h("div", { class: "field" },
    h("label", { attrs: { for: "player-name" }, text: t("playerName") }),
    h("div", { class: "row" }, name, button(t("save"), () => {
      const p = renamePlayer(name.value);
      name.value = p.name;
      saved.textContent = "✓";
      setTimeout(() => (saved.textContent = ""), 1500);
    }, "btn small"), saved)
  );

  const idText = h("code", { class: "pid-full", text: player.id });
  const copyBtn = button(t("copy"), () => {
    const done = () => { copyBtn.textContent = t("copied"); setTimeout(() => (copyBtn.textContent = t("copy")), 1500); };
    navigator.clipboard?.writeText(player.id).then(done, () => {
      const range = document.createRange();
      range.selectNodeContents(idText);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }, "btn small secondary");
  const idRow = h("div", { class: "field" }, h("span", { class: "field-label", text: t("playerId") }), h("div", { class: "row" }, idText, copyBtn));

  const toggle = (key: "sound" | "haptics", label: string) => {
    const input = h("input", { attrs: { type: "checkbox", id: `set-${key}`, role: "switch" } });
    input.checked = s[key];
    input.addEventListener("change", () => setSettings({ [key]: input.checked }));
    return h("label", { class: "switch-row", attrs: { for: `set-${key}` } }, h("span", { text: label }), input);
  };

  const confirmBox = h("div", { class: "confirm" },
    h("p", { text: t("resetConfirm") }),
    h("div", { class: "row" },
      button(t("confirm"), () => { resetProgress(); nav.home(); }, "btn danger small"),
      button(t("cancel"), () => { confirmBox.hidden = true; resetBtn.hidden = false; }, "btn secondary small")
    )
  );
  confirmBox.hidden = true;
  const resetBtn = button(t("reset"), () => { confirmBox.hidden = false; resetBtn.hidden = true; }, "btn ghost danger-text");

  return h("section", { class: "screen settings" },
    h("div", { class: "topbar" },
      button(icon("back"), () => nav.home(), "icon-btn", { "aria-label": t("back") }),
      h("div", { class: "topbar-title", text: t("settings") }),
      h("div")
    ),
    h("div", { class: "panel" }, nameRow, idRow),
    h("div", { class: "panel" }, toggle("sound", t("sound")), toggle("haptics", t("haptics"))),
    h("div", { class: "panel" }, resetBtn, confirmBox),
    h("p", { class: "version", text: "Cuadra 1.0.0" })
  );
}
