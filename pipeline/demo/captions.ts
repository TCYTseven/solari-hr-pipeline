// Pure helpers for the demo agent: step labels, key mapping and WebVTT captions.
import type { DemoAction, DemoStep } from "../../lib/types";
import { redact, truncate } from "../util";

/** Map a computer-toolset member name to the dashboard's DemoAction. */
export function toDemoAction(member: string): DemoAction {
  switch (member) {
    case "left_click":
    case "right_click":
    case "middle_click":
    case "double_click":
    case "triple_click":
    case "left_click_drag":
    case "left_mouse_down":
    case "left_mouse_up":
    case "mouse_move":
      return "click";
    case "type":
      return "type";
    case "key":
    case "hold_key":
      return "key";
    case "scroll":
      return "scroll";
    case "wait":
      return "wait";
    case "screenshot":
    case "zoom":
    case "cursor_position":
      return "screenshot";
    default:
      return "command";
  }
}

const KEY_NAMES: Record<string, string> = {
  ctrl: "Control", control: "Control", shift: "Shift", alt: "Alt", option: "Alt", opt: "Alt",
  super: "Meta", meta: "Meta", cmd: "Meta", command: "Meta", win: "Meta", windows: "Meta",
  return: "Enter", enter: "Enter", kp_enter: "Enter", backspace: "Backspace", escape: "Escape", esc: "Escape",
  tab: "Tab", space: "Space", delete: "Delete", del: "Delete", insert: "Insert", home: "Home", end: "End",
  page_down: "PageDown", pagedown: "PageDown", next: "PageDown", page_up: "PageUp", pageup: "PageUp", prior: "PageUp",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
  minus: "Minus", equal: "Equal", plus: "+", comma: ",", period: ".", slash: "/", semicolon: ";",
};

/** xdotool-style combo ("ctrl+shift+t", "Return", "Page_Down") to Playwright ("Control+Shift+t", "Enter"). */
export function toPlaywrightKey(combo: string): string {
  return combo
    .split(/\+(?!$)/)
    .map((raw) => {
      const k = raw.trim();
      const mapped = KEY_NAMES[k.toLowerCase()];
      if (mapped) return mapped;
      if (/^f([1-9]|1[0-2])$/i.test(k)) return k.toUpperCase();
      return k;
    })
    .join("+");
}

/** Human-readable key combo for captions: "ctrl+a" -> "Ctrl+A", "Return" -> "Enter". */
export function prettyKey(combo: string): string {
  return toPlaywrightKey(combo)
    .split("+")
    .map((k) => (k === "Control" ? "Ctrl" : k.length === 1 ? k.toUpperCase() : k.replace(/^Arrow/, "")))
    .join("+");
}

export interface LabelContext {
  /** Text of the element under the pointer, when the surface can tell. */
  target?: string | null;
  /** The focused field is a password input. */
  password?: boolean;
  secrets?: string[];
}

type Input = Record<string, unknown>;

function coord(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number") ? [v[0] as number, v[1] as number] : null;
}

/** Short caption for one action, e.g. `Clicked Add Store` or `Typed "shopify.com/..."`. Never contains secrets. */
export function labelFor(member: string, input: Input, ctx: LabelContext = {}): string {
  const secrets = ctx.secrets ?? [];
  const clean = (s: string, n: number) => truncate(redact(s, secrets), n);
  const at = () => {
    if (ctx.target) return clean(ctx.target, 40);
    const c = coord(input.coordinate);
    return c ? `(${Math.round(c[0])}, ${Math.round(c[1])})` : "the current position";
  };
  switch (member) {
    case "left_click":
      return `Clicked ${at()}`;
    case "double_click":
      return `Double-clicked ${at()}`;
    case "triple_click":
      return `Triple-clicked ${at()}`;
    case "right_click":
      return `Right-clicked ${at()}`;
    case "middle_click":
      return `Middle-clicked ${at()}`;
    case "mouse_move":
      return `Pointed at ${at()}`;
    case "left_click_drag": {
      const a = coord(input.start_coordinate);
      const b = coord(input.coordinate);
      return a && b ? `Dragged from (${a[0]}, ${a[1]}) to (${b[0]}, ${b[1]})` : "Dragged the pointer";
    }
    case "left_mouse_down":
      return "Pressed the mouse button";
    case "left_mouse_up":
      return "Released the mouse button";
    case "type": {
      if (ctx.password) return "Typed a password";
      const text = String(input.text ?? "");
      const shown = redact(text, secrets);
      if (shown !== text && shown.replace(/•/g, "").trim() === "") return "Typed a secret";
      return `Typed "${truncate(shown, 32)}"`;
    }
    case "key": {
      const repeat = typeof input.repeat === "number" && input.repeat > 1 ? ` ${input.repeat}x` : "";
      return `Pressed ${prettyKey(String(input.text ?? ""))}${repeat}`;
    }
    case "hold_key":
      return `Held ${prettyKey(String(input.text ?? ""))}`;
    case "scroll": {
      const dir = String(input.scroll_direction ?? "down");
      return ctx.target ? `Scrolled ${dir} on ${clean(ctx.target, 30)}` : `Scrolled ${dir}`;
    }
    case "wait":
      return `Waited ${Number(input.duration ?? 1)}s`;
    case "screenshot":
      return "Looked at the screen";
    case "zoom":
      return "Zoomed in";
    case "cursor_position":
      return "Checked the pointer position";
    default:
      return clean(member.replace(/_/g, " "), 40);
  }
}

function vttTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const frac = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(frac, 3)}`;
}

/**
 * WebVTT captions from the step log. Cues never overlap: each runs until the
 * next cue (at most 6 s; the last one 4 s, clipped to `durationSec`). Steps
 * less than `minCueSec` apart are merged into one cue ("Clicked Email · Typed
 * "jane@example.com""), up to three labels, so fast bursts stay readable.
 */
export function toVtt(steps: DemoStep[], durationSec?: number, minCueSec = 1.2): string {
  const sorted = [...steps].sort((a, b) => a.t - b.t);
  const groups: DemoStep[][] = [];
  for (let i = 0; i < sorted.length; ) {
    const group = [sorted[i]!];
    let j = i + 1;
    while (j < sorted.length && group.length < 3 && sorted[j]!.t - group[0]!.t < minCueSec) group.push(sorted[j++]!);
    groups.push(group);
    i = j;
  }
  const cues: string[] = ["WEBVTT", ""];
  groups.forEach((g, i) => {
    const start = g[0]!.t;
    const next = groups[i + 1]?.[0]?.t;
    let end = next != null ? Math.min(next, start + 6) : start + 4;
    if (durationSec != null && durationSec > start) end = Math.min(end, durationSec);
    if (end <= start) end = start + 0.5;
    const text = g.map((s) => s.label.replace(/-->/g, "->").replace(/\n+/g, " ")).join(" · ");
    cues.push(String(i + 1), `${vttTime(start)} --> ${vttTime(end)}`, text, "");
  });
  return cues.join("\n");
}
