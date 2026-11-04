// Sound (Web Audio, no files to ship) and vibration (native Haptics on
// Android/iOS, navigator.vibrate on the web when available).
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { getSettings } from "./progress.ts";

let audio: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType = "triangle", vol = 0.08, delay = 0) {
  if (!getSettings().sound) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio = audio || new Ctx();
    const t0 = audio.currentTime + delay;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.destination);
    o.start(t0);
    o.stop(t0 + dur);
  } catch {
    /* audio unavailable */
  }
}

function buzz(style: "light" | "medium" | "heavy") {
  if (!getSettings().haptics) return;
  if (Capacitor.isNativePlatform()) {
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    Haptics.impact({ style: map[style] }).catch(() => {});
  } else if (navigator.vibrate) {
    navigator.vibrate(style === "heavy" ? 40 : style === "medium" ? 20 : 8);
  }
}

export const fx = {
  pick() { tone(520, 0.06); buzz("light"); },
  place() { tone(300, 0.09, "square", 0.05); buzz("light"); },
  clear(lines: number) {
    for (let i = 0; i < Math.min(lines + 2, 5); i++) tone(520 + i * 130, 0.12, "triangle", 0.07, i * 0.06);
    buzz("medium");
  },
  crack() { tone(180, 0.08, "sawtooth", 0.05); },
  tick() { tone(880, 0.03, "sine", 0.03); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.08, i * 0.09)); buzz("medium"); },
  lose() { tone(330, 0.2, "sine", 0.08); tone(247, 0.35, "sine", 0.08, 0.18); buzz("heavy"); }
};
