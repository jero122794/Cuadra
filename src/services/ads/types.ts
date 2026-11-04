// Every ad network sits behind this interface. The game only ever calls these
// methods, so switching between AdMob (Android/iOS), a web game portal SDK or
// the test stand-in changes nothing in the game code.
export interface AdProvider {
  readonly name: string;
  init(): Promise<void>;
  /** Full-screen ad between games. Resolves when it closes or fails. */
  interstitial(): Promise<void>;
  /** Rewarded ad. Resolves true only if the player earned the reward. */
  rewarded(): Promise<boolean>;
  gameplayStart(): void;
  gameplayStop(): void;
}
