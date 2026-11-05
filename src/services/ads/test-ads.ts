// Stand-in used on the plain web build: a short countdown screen marked as a
// test ad, so the reward and interstitial flows can be tried end to end.
import { t } from "../../i18n.ts";
import type { AdProvider } from "./types.ts";

function countdown(seconds: number): Promise<void> {
  return new Promise(resolve => {
    const el = document.createElement("div");
    el.className = "ad-sim";
    el.setAttribute("role", "status");
    const num = document.createElement("b");
    const label = document.createElement("span");
    label.textContent = t("testAd");
    el.append(num, label);
    document.body.appendChild(el);
    let left = seconds;
    num.textContent = String(left);
    const timer = setInterval(() => {
      left--;
      num.textContent = String(left);
      if (left <= 0) {
        clearInterval(timer);
        el.remove();
        resolve();
      }
    }, 1000);
  });
}

/** Real networks take a moment to fetch an ad; simulate it so the loading state is visible. */
const fakeFetch = () => new Promise(resolve => setTimeout(resolve, 700));

export class TestAds implements AdProvider {
  readonly name = "test";
  async init() {}
  async interstitial() {
    await fakeFetch();
    await countdown(2);
  }
  async rewarded() {
    await fakeFetch();
    await countdown(3);
    return true;
  }
  gameplayStart() {}
  gameplayStop() {}
}
