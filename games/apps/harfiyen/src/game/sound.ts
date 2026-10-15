import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The game's sounds, made on the spot with the Web Audio API (no files to
 * load): a soft "ting" when the other side's move lands, a low double
 * knock for a nudge, and a small pop for the other player's chat line.
 * Browsers only let a page make sound after the player has touched it, so
 * the audio starts on the first tap or key.
 * A switch in the top bar turns them off, remembered in this browser.
 */

const KEY = "harfiyen:sound:v1";

let on: boolean | undefined;
const listeners = new Set<() => void>();

export function soundOn(): boolean {
  if (on === undefined) {
    try {
      on = localStorage.getItem(KEY) !== "false";
    } catch {
      on = true;
    }
  }
  return on;
}

export function setSoundOn(next: boolean): void {
  on = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // for this visit only
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundOn(): boolean {
  return useSyncExternalStore(subscribe, soundOn, soundOn);
}

/** Forgets what's cached, for tests. */
export function resetSoundCache(): void {
  on = undefined;
}

type AudioContextClass = typeof AudioContext;
let audio: AudioContext | null = null;

/** The page's one AudioContext, woken if the browser put it to sleep; null where there is none. */
function context(): AudioContext | null {
  if (!audio) {
    const Context =
      (globalThis as { AudioContext?: AudioContextClass }).AudioContext ??
      (globalThis as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
    if (!Context) return null;
    try {
      audio = new Context();
    } catch {
      return null;
    }
  }
  if (audio.state === "suspended") void audio.resume().catch(() => {});
  return audio;
}

/** Starts the audio on the player's first tap or key, as browsers require; once. */
export function unlockAudioOnGesture(): void {
  const unlock = (): void => {
    context();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

/** One partial: a sine that rises in a few ms and fades away. */
function tone(c: AudioContext, out: AudioNode, at: number, from: number, to: number, gain: number, length: number, type: OscillatorType = "sine"): void {
  const osc = c.createOscillator();
  const level = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + length);
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  level.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(level).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** The synthesis itself, apart from the switch: a seam for tests. */
export const synth = {
  /** A small bell, ~150 ms: two soft partials a fifth and a bit apart. */
  ting(): void {
    const c = context();
    if (!c || c.state !== "running") return;
    const at = c.currentTime + 0.01;
    tone(c, c.destination, at, 1568, 1568, 0.09, 0.16);
    tone(c, c.destination, at, 2637, 2637, 0.035, 0.11);
  },
  /** Two low knocks, ~300 ms: a falling thump with a click on top, twice. */
  nudge(): void {
    const c = context();
    if (!c || c.state !== "running") return;
    const at = c.currentTime + 0.01;
    for (const offset of [0, 0.16]) {
      tone(c, c.destination, at + offset, 190, 70, 0.32, 0.12, "triangle");
      tone(c, c.destination, at + offset, 900, 400, 0.05, 0.03, "square");
    }
  },
  /** A soft bubble, ~80 ms: a sine sliding up an octave, with a faint click at its start. */
  pop(): void {
    const c = context();
    if (!c || c.state !== "running") return;
    const at = c.currentTime + 0.01;
    tone(c, c.destination, at, 440, 880, 0.11, 0.08);
    tone(c, c.destination, at, 1800, 1200, 0.015, 0.02, "triangle");
  },
};

export function playTing(): void {
  if (soundOn()) synth.ting();
}

export function playNudge(): void {
  if (soundOn()) synth.nudge();
}

export function playPop(): void {
  if (soundOn()) synth.pop();
}

/**
 * A ting when the other side's move lands on this table: the log grew and
 * its newest turn isn't the player's. Not for the table as first seen, nor
 * a new game.
 */
export function useTingOnTheirMove(table: { id: string; log: readonly { player: number }[] }, me: number): void {
  const seen = useRef({ id: table.id, length: table.log.length });
  useEffect(() => {
    const before = seen.current;
    seen.current = { id: table.id, length: table.log.length };
    if (before.id !== table.id || table.log.length <= before.length) return;
    if (table.log[table.log.length - 1]?.player !== me) playTing();
  }, [table, me]);
}
