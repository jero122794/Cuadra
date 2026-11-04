// Adapter for HTML5 game portals. Written for the CrazyGames SDK v3 shape
// (window.CrazyGames.SDK). Check the portal's current documentation before
// publishing: SDK names and callbacks change between versions.
import type { AdProvider } from "./types.ts";

interface CrazySdk {
  init?: () => Promise<void>;
  ad: {
    requestAd(type: "midgame" | "rewarded", callbacks: {
      adStarted?: () => void;
      adFinished?: () => void;
      adError?: (e: unknown) => void;
    }): void;
  };
  game: { gameplayStart(): void; gameplayStop(): void };
}

export function portalSdk(): CrazySdk | null {
  const w = window as unknown as { CrazyGames?: { SDK?: CrazySdk } };
  return w.CrazyGames?.SDK ?? null;
}

export class PortalAds implements AdProvider {
  readonly name = "portal";
  constructor(private sdk: CrazySdk) {}

  async init() {
    await this.sdk.init?.();
  }

  private request(type: "midgame" | "rewarded"): Promise<boolean> {
    return new Promise(resolve => {
      try {
        this.sdk.ad.requestAd(type, {
          adFinished: () => resolve(true),
          adError: () => resolve(false)
        });
      } catch {
        resolve(false);
      }
    });
  }

  async interstitial() {
    await this.request("midgame");
  }
  rewarded() {
    return this.request("rewarded");
  }
  gameplayStart() {
    try { this.sdk.game.gameplayStart(); } catch { /* ignore */ }
  }
  gameplayStop() {
    try { this.sdk.game.gameplayStop(); } catch { /* ignore */ }
  }
}
