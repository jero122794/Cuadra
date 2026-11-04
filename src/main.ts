// Fonts ship inside the app (Latin subset only) so they work offline.
import "@fontsource/bungee/latin-400.css";
import "@fontsource/rubik/latin-400.css";
import "@fontsource/rubik/latin-500.css";
import "@fontsource/rubik/latin-700.css";
import "./styles.css";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { lang } from "./i18n.ts";
import { startMode, type ModeId } from "./modes/modes.ts";
import { initAds } from "./services/ads/index.ts";
import { loadSession } from "./services/progress.ts";
import { gameScreen } from "./ui/game.ts";
import { homeScreen, levelsScreen, settingsScreen, type Nav } from "./ui/screens.ts";

document.documentElement.lang = lang;
const root = document.getElementById("app")!;

type Route = "home" | "levels" | "settings" | "game";
let route: Route = "home";
let disposeCurrent: (() => void) | null = null;

function mount(el: HTMLElement, r: Route, dispose?: () => void) {
  disposeCurrent?.();
  disposeCurrent = dispose ?? null;
  route = r;
  root.replaceChildren(el);
  window.scrollTo(0, 0);
}

const nav: Nav = {
  home: () => mount(homeScreen(nav), "home"),
  levels: () => mount(levelsScreen(nav), "levels"),
  settings: () => mount(settingsScreen(nav), "settings"),
  play: (mode: ModeId, levelId?: number) => {
    const g = gameScreen(startMode(mode, levelId), mode, levelId, {
      home: () => (mode === "level" ? nav.levels() : nav.home()),
      restart: (m, id) => nav.play(m, id)
    });
    mount(g.el, "game", g.dispose);
  },
  resume: () => {
    const s = loadSession();
    if (!s) return nav.home();
    const g = gameScreen(s.state, s.mode, s.levelId, {
      home: () => nav.home(),
      restart: (m, id) => nav.play(m, id)
    });
    mount(g.el, "game", g.dispose);
  }
};

// Android hardware back button.
if (Capacitor.isNativePlatform()) {
  App.addListener("backButton", () => {
    if (route === "home") App.exitApp();
    else nav.home();
  });
}

nav.home();
initAds();
