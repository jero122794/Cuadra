type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  style?: Partial<Record<string, string>>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.style) for (const [k, v] of Object.entries(props.style)) if (v !== undefined) el.style.setProperty(k, v);
  if (props.on) for (const [k, fn] of Object.entries(props.on)) if (fn) el.addEventListener(k, fn);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "number" ? String(c) : c);
  }
  return el;
}

export function button(label: string | Node, onClick: () => void, cls = "btn", attrs: Record<string, string> = {}): HTMLButtonElement {
  return h("button", { class: cls, attrs: { type: "button", ...attrs }, on: { click: () => onClick() } }, label);
}

export const icons = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.5 6.6-.8z"/></svg>'
};

export function icon(name: keyof typeof icons, cls = "ico"): HTMLSpanElement {
  const s = h("span", { class: cls, attrs: { "aria-hidden": "true" } });
  s.innerHTML = icons[name];
  return s;
}

// ---------- Shared UI states ----------

export function spinner(cls = "spinner"): HTMLSpanElement {
  return h("span", { class: cls, attrs: { "aria-hidden": "true" } });
}

/**
 * Puts a button into its busy state while `work` runs: disabled, spinner,
 * aria-busy, and a label saying what is happening. Restores it afterwards.
 */
export async function withBusy<T>(btn: HTMLButtonElement, label: string, work: () => Promise<T>): Promise<T> {
  const before = [...btn.childNodes];
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.replaceChildren(spinner(), h("span", { text: label }));
  try {
    return await work();
  } finally {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.replaceChildren(...before);
  }
}

/** Full-screen loading state for work that blocks the whole screen (ads). */
export function showLoader(label: string): () => void {
  const el = h("div", { class: "loader-screen", attrs: { role: "status", "aria-live": "polite" } },
    spinner("spinner big"), h("span", { text: label }));
  document.body.append(el);
  return () => el.remove();
}

let toastRegion: HTMLElement | null = null;
let toastTimer = 0;

/** One short message at a time, announced to screen readers. */
export function toast(message: string, kind: "info" | "success" | "error" = "info"): void {
  if (!toastRegion) {
    toastRegion = h("div", { class: "toast-region", attrs: { role: "status", "aria-live": "polite" } });
    document.body.append(toastRegion);
  }
  clearTimeout(toastTimer);
  toastRegion.replaceChildren(h("div", { class: `toast ${kind}`, text: message }));
  toastTimer = window.setTimeout(() => toastRegion?.replaceChildren(), 2600);
}

/** Keeps Tab inside `container` (dialogs). Returns a cleanup function. */
export function trapFocus(container: HTMLElement): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = [...container.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex]:not([tabindex='-1'])")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}

/** Text only screen readers hear. */
export function liveRegion(): HTMLElement {
  return h("div", { class: "sr-only", attrs: { "aria-live": "polite", "aria-atomic": "true" } });
}

const CONFETTI_COLORS =["var(--t1)", "var(--t2)", "var(--t3)", "var(--t4)", "var(--t5)", "var(--t6)", "#ffffff"];

/** Burst of confetti from (x, y) in percent of the container. Removes itself. */
export function confetti(container: HTMLElement, count: number, x = 50, y = 50): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const layer = h("div", { class: "confetti", attrs: { "aria-hidden": "true" } });
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 140;
    const piece = h("i");
    piece.style.setProperty("--x", `${x}%`);
    piece.style.setProperty("--y", `${y}%`);
    piece.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * dist + 60}px`);
    piece.style.setProperty("--rot", `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.setProperty("--c", CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    piece.style.animationDelay = `${Math.random() * 80}ms`;
    layer.append(piece);
  }
  container.append(layer);
  setTimeout(() => layer.remove(), 1300);
}

export function stars(n: number, of = 3): HTMLSpanElement {
  const wrap = h("span", { class: "stars", attrs: { "aria-label": `${n}/${of}` } });
  for (let i = 0; i < of; i++) wrap.append(icon("star", i < n ? "star on" : "star"));
  return wrap;
}
