// AdMob for the Android and iOS apps (via @capacitor-community/admob).
import { Capacitor } from "@capacitor/core";
import { AdMob, AdmobConsentStatus } from "@capacitor-community/admob";
import { ADMOB } from "./config.ts";
import type { AdProvider } from "./types.ts";

export class AdMobAds implements AdProvider {
  readonly name = "admob";
  private ids = Capacitor.getPlatform() === "ios" ? ADMOB.ios : ADMOB.android;

  async init() {
    await AdMob.initialize({ initializeForTesting: ADMOB.useTestAds });
    try {
      // Google's consent form (required for players in the EU/UK).
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        await AdMob.showConsentForm();
      }
    } catch {
      /* consent not configured yet in AdMob: ads still load as non-personalised where required */
    }
    if (Capacitor.getPlatform() === "ios") {
      try {
        await AdMob.requestTrackingAuthorization();
      } catch {
        /* the player can decline; ads still work */
      }
    }
  }

  async interstitial() {
    try {
      await AdMob.prepareInterstitial({ adId: this.ids.interstitial, isTesting: ADMOB.useTestAds });
      await AdMob.showInterstitial();
    } catch {
      /* no fill or offline: carry on without an ad */
    }
  }

  async rewarded() {
    try {
      await AdMob.prepareRewardVideoAd({ adId: this.ids.rewarded, isTesting: ADMOB.useTestAds });
      const reward = await AdMob.showRewardVideoAd();
      return !!reward;
    } catch {
      return false;
    }
  }

  gameplayStart() {}
  gameplayStop() {}
}
