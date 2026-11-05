// Picks the ad provider for the platform the game is running on and applies
// the frequency policy, so ads never interrupt more often than AD_POLICY allows.
// Every ad call shows a loading state while the network fetches the ad, and
// gives up after AD_TIMEOUT_MS so the player is never stuck on a blank screen.
import { Capacitor } from "@capacitor/core";
import { t } from "../../i18n.ts";
import { showLoader } from "../../ui/dom.ts";
import { AD_POLICY } from "./config.ts";
import { PortalAds, portalSdk } from "./portal-ads.ts";
import { TestAds } from "./test-ads.ts";
import type { AdProvider } from "./types.ts";

const AD_TIMEOUT_MS = 10_000;

let provider: AdProvider = new TestAds();
let gamesSinceAd = 0;
let lastAdAt = 0;

export async function initAds(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { AdMobAds } = await import("./admob-ads.ts");
      provider = new AdMobAds();
    } else {
      const sdk = portalSdk();
      if (sdk) provider = new PortalAds(sdk);
    }
    await provider.init();
  } catch {
    provider = new TestAds();
  }
  return provider.name;
}

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), AD_TIMEOUT_MS))]);
}

export const ads = {
  get name() {
    return provider.name;
  },
  gameplayStart: () => provider.gameplayStart(),
  gameplayStop: () => provider.gameplayStop(),
  /** Resolves true only when the player watched the ad and earned the reward. */
  async rewarded(): Promise<boolean> {
    const hide = showLoader(t("loadingAd"));
    try {
      return await withTimeout(provider.rewarded(), false);
    } catch {
      return false;
    } finally {
      hide();
    }
  },
  /** Call when a game ends; shows an interstitial only when the policy allows. */
  async afterGame(): Promise<void> {
    gamesSinceAd++;
    const now = Date.now();
    const cooled = now - lastAdAt >= AD_POLICY.minSecondsBetweenInterstitials * 1000;
    if (gamesSinceAd < AD_POLICY.interstitialEveryGames || !cooled) return;
    gamesSinceAd = 0;
    lastAdAt = now;
    const hide = showLoader(t("loading"));
    try {
      await withTimeout(provider.interstitial(), undefined);
    } catch {
      /* no ad: carry on */
    } finally {
      hide();
    }
  }
};
