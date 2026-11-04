// Picks the ad provider for the platform the game is running on and applies
// the frequency policy, so ads never interrupt more often than AD_POLICY allows.
import { Capacitor } from "@capacitor/core";
import { AD_POLICY } from "./config.ts";
import { PortalAds, portalSdk } from "./portal-ads.ts";
import { TestAds } from "./test-ads.ts";
import type { AdProvider } from "./types.ts";

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

export const ads = {
  get name() {
    return provider.name;
  },
  gameplayStart: () => provider.gameplayStart(),
  gameplayStop: () => provider.gameplayStop(),
  rewarded: () => provider.rewarded(),
  /** Call when a game ends; shows an interstitial only when the policy allows. */
  async afterGame(): Promise<void> {
    gamesSinceAd++;
    const now = Date.now();
    const cooled = now - lastAdAt >= AD_POLICY.minSecondsBetweenInterstitials * 1000;
    if (gamesSinceAd >= AD_POLICY.interstitialEveryGames && cooled) {
      gamesSinceAd = 0;
      lastAdAt = now;
      await provider.interstitial();
    }
  }
};
