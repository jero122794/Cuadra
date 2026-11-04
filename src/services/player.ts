// Phase 1 identity: an anonymous ID created on the device plus a nickname.
// No personal data is collected. In phase 2 this ID can be linked to a cloud
// account (Google Play Games / Game Center) without losing progress.
import { load, save } from "./storage.ts";

export interface Player {
  id: string;
  name: string;
  createdAt: string;
}

function uuid(): string {
  const c = typeof crypto !== "undefined" ? (crypto as Partial<Crypto>) : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let current: Player | null = null;

export function getPlayer(): Player {
  if (current) return current;
  let p = load<Player | null>("player", null);
  if (!p || !p.id) {
    const id = uuid();
    p = { id, name: `Jugador ${id.slice(0, 4).toUpperCase()}`, createdAt: new Date().toISOString() };
    save("player", p);
  }
  current = p;
  return p;
}

export function renamePlayer(name: string): Player {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 16);
  const p = { ...getPlayer(), name: clean || getPlayer().name };
  current = p;
  save("player", p);
  return p;
}

/** Short form shown to the player, e.g. "7F3A-91C2". */
export function shortId(p: Player): string {
  return p.id.replace(/-/g, "").slice(0, 8).toUpperCase().replace(/(.{4})/, "$1-");
}
