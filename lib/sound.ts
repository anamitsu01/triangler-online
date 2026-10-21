"use client";

// Tiny synthesized sound effects (Web Audio, no audio files). Browsers only
// allow audio after a user gesture, so the context is created lazily and
// unlocked on the first pointer/key press.

export type SoundName = "select" | "place" | "complete" | "bonus" | "fanfare";

const MUTE_KEY = "kokki:muted";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable; the toggle still works for this page
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call once on mount: unlocks audio on the first user interaction. */
export function installAudioUnlock(): () => void {
  const unlock = () => audio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

/** A short pitched tone with an attack/decay envelope. */
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.5, slideTo?: number) {
  const a = ctx!;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function play(name: SoundName, opts: { volume?: number } = {}) {
  if (muted) return;
  const a = audio();
  if (!a || a.state !== "running") return;
  const now = a.currentTime;
  const v = opts.volume ?? 1;

  switch (name) {
    case "select": // ピッ
      tone(1320, now, 0.07, "square", 0.12 * v);
      break;
    case "place": // ポン: a card landing on a role
      tone(660, now, 0.12, "triangle", 0.35 * v, 880);
      tone(1320, now + 0.05, 0.1, "sine", 0.12 * v);
      break;
    case "bonus": // two quick sparkles: an extra card has turned up
      [988, 1319, 1760].forEach((f, i) => tone(f, now + 0.12 + i * 0.06, 0.16, "square", 0.1 * v));
      tone(2093, now + 0.3, 0.3, "sine", 0.16 * v);
      break;
    case "fanfare": {
      // The game is decided: three quick calls, a climb, and a held chord. 2s in all.
      const brass = (freq: number, at: number, dur: number, vol: number) => {
        tone(freq, now + at, dur, "sawtooth", vol * v);
        tone(freq, now + at, dur, "square", vol * 0.5 * v);
      };
      brass(523, 0, 0.16, 0.16);
      brass(523, 0.18, 0.16, 0.16);
      brass(523, 0.36, 0.16, 0.16);
      brass(659, 0.54, 0.3, 0.17);
      brass(784, 0.86, 0.3, 0.17);
      // Final chord, ringing out until the 2s mark.
      brass(1047, 1.18, 0.82, 0.18);
      brass(784, 1.18, 0.82, 0.1);
      brass(659, 1.18, 0.82, 0.1);
      tone(262, now + 1.18, 0.82, "triangle", 0.25 * v);
      break;
    }
    case "complete": // rising fanfare, a beat after the card lands
      [523, 659, 784, 1047].forEach((f, i) => tone(f, now + 0.15 + i * 0.09, 0.28, "triangle", 0.3 * v));
      tone(1568, now + 0.55, 0.5, "sine", 0.2 * v);
      break;
  }
}
