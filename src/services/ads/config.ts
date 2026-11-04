// AdMob ad unit IDs.
// The values below are Google's public TEST IDs: they always show test ads and
// never pay. Before publishing, create the app and two ad units (Interstitial,
// Rewarded) in your AdMob account, paste the real IDs here, and replace the
// test App ID in android/app/src/main/AndroidManifest.xml and ios/App/App/Info.plist.
export const ADMOB = {
  useTestAds: true,
  android: {
    interstitial: "ca-app-pub-3940256099942544/1033173712",
    rewarded: "ca-app-pub-3940256099942544/5224354917"
  },
  ios: {
    interstitial: "ca-app-pub-3940256099942544/4411468910",
    rewarded: "ca-app-pub-3940256099942544/1712485313"
  }
};

/** Show an interstitial at most once every N finished games, and not more often than this. */
export const AD_POLICY = {
  interstitialEveryGames: 3,
  minSecondsBetweenInterstitials: 90
};
