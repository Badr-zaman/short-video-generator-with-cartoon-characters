import type { Emotion, MouthCue, TimedLine, Viseme } from "../types";

// Pure functions: "what does the face look like at this frame?"

export type MouthPose = { open: number; wide: number; smile: number; teeth: number; tongue: number };

const VISEME_POSE: Record<Viseme, Omit<MouthPose, "smile">> = {
  X: { open: 0.0, wide: 0.8, teeth: 0, tongue: 0 },
  A: { open: 0.0, wide: 0.72, teeth: 0, tongue: 0 },
  B: { open: 0.28, wide: 0.92, teeth: 1, tongue: 0 },
  C: { open: 0.5, wide: 1.0, teeth: 0.6, tongue: 0 },
  D: { open: 0.85, wide: 1.0, teeth: 0.4, tongue: 0.6 },
  E: { open: 0.6, wide: 0.66, teeth: 0, tongue: 0.3 },
  F: { open: 0.3, wide: 0.46, teeth: 0, tongue: 0 },
  G: { open: 0.16, wide: 0.86, teeth: 1, tongue: 0 },
  H: { open: 0.5, wide: 0.9, teeth: 0.5, tongue: 1 },
};

export type FaceStyle = {
  smile: number; // -1 frown .. 1 big smile
  browTilt: number; // + angry (inner down), - sad (inner up)
  browLift: number;
  eyeOpen: number; // 1 normal, >1 wide, <1 squint
  happyEyes: number; // 0..1 crescent "^ ^" eyes
  blush: number;
  tears: number;
  idleMouth: Omit<MouthPose, "smile">; // mouth when not speaking
  headTilt: number;
  energy: number; // body bounce amount
};

const closed = VISEME_POSE.X;
export const EMOTION_STYLE: Record<Emotion, FaceStyle> = {
  neutral: { smile: 0.25, browTilt: 0, browLift: 0, eyeOpen: 1, happyEyes: 0, blush: 0.35, tears: 0, idleMouth: closed, headTilt: 0, energy: 0.4 },
  happy: { smile: 0.9, browTilt: -0.1, browLift: 0.04, eyeOpen: 1, happyEyes: 0.3, blush: 0.6, tears: 0, idleMouth: { ...closed, open: 0.15 }, headTilt: 0.08, energy: 0.8 },
  smug: { smile: 0.6, browTilt: 0.15, browLift: 0.02, eyeOpen: 0.62, happyEyes: 0, blush: 0.4, tears: 0, idleMouth: closed, headTilt: -0.12, energy: 0.3 },
  shocked: { smile: 0, browTilt: -0.15, browLift: 0.12, eyeOpen: 1.3, happyEyes: 0, blush: 0.2, tears: 0, idleMouth: { open: 0.6, wide: 0.55, teeth: 0, tongue: 0 }, headTilt: 0, energy: 1.2 },
  sad: { smile: -0.7, browTilt: -0.45, browLift: 0.04, eyeOpen: 0.85, happyEyes: 0, blush: 0.3, tears: 0.2, idleMouth: closed, headTilt: 0.1, energy: 0.2 },
  crying: { smile: -0.9, browTilt: -0.55, browLift: 0.06, eyeOpen: 0.45, happyEyes: 0, blush: 0.8, tears: 1, idleMouth: { open: 0.4, wide: 0.9, teeth: 0.2, tongue: 0 }, headTilt: 0.05, energy: 1 },
  angry: { smile: -0.5, browTilt: 0.5, browLift: -0.03, eyeOpen: 0.8, happyEyes: 0, blush: 0.7, tears: 0, idleMouth: closed, headTilt: 0, energy: 1 },
  confused: { smile: -0.15, browTilt: 0.25, browLift: 0.05, eyeOpen: 1.05, happyEyes: 0, blush: 0.3, tears: 0, idleMouth: { ...closed, wide: 0.5 }, headTilt: 0.22, energy: 0.3 },
  laughing: { smile: 1, browTilt: -0.2, browLift: 0.06, eyeOpen: 0.3, happyEyes: 1, blush: 0.9, tears: 0, idleMouth: { open: 0.7, wide: 1, teeth: 1, tongue: 0.5 }, headTilt: 0.12, energy: 1.4 },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function cueAt(cues: MouthCue[], t: number): { cur: Viseme; prev: Viseme; since: number } {
  for (let i = 0; i < cues.length; i++) {
    if (t < cues[i].end) return { cur: cues[i].v, prev: i > 0 ? cues[i - 1].v : "X", since: Math.max(0, t - cues[i].start) };
  }
  return { cur: "X", prev: cues[cues.length - 1]?.v ?? "X", since: 1 };
}

/** Mouth for a speaking character at `t` seconds into its line. */
export function speakingMouth(line: TimedLine, t: number, frameInLine: number, style: FaceStyle): MouthPose {
  const { cur, prev, since } = cueAt(line.cues, t);
  const k = Math.min(1, since / 0.06); // 60ms blend between shapes
  const a = VISEME_POSE[prev];
  const b = VISEME_POSE[cur];
  const amp = line.amp[Math.min(line.amp.length - 1, Math.max(0, frameInLine))] ?? 0;
  const loud = 0.55 + 0.6 * amp;
  return {
    open: lerp(a.open, b.open, k) * loud,
    wide: lerp(a.wide, b.wide, k),
    teeth: lerp(a.teeth, b.teeth, k),
    tongue: lerp(a.tongue, b.tongue, k),
    smile: style.smile * 0.6,
  };
}

export function idleMouth(style: FaceStyle, time: number, emotion: Emotion): MouthPose {
  const m = style.idleMouth;
  // laughing/crying mouths wobble
  const wobble = emotion === "laughing" ? 0.25 * Math.abs(Math.sin(time * 14)) : emotion === "crying" ? 0.12 * Math.sin(time * 9) : 0;
  return { ...m, open: Math.max(0, m.open + wobble), smile: style.smile };
}

/** Deterministic blink: returns eyelid closure 0..1. */
export function blink(time: number, seed: number): number {
  const period = 3.1 + (seed % 7) * 0.23;
  const phase = (time + seed * 0.37) % period;
  const d = 0.14;
  if (phase > d) return 0;
  return Math.sin((phase / d) * Math.PI);
}

export function mixStyles(a: FaceStyle, b: FaceStyle, t: number): FaceStyle {
  const n = (k: keyof FaceStyle) => lerp(a[k] as number, b[k] as number, t);
  return {
    smile: n("smile"), browTilt: n("browTilt"), browLift: n("browLift"), eyeOpen: n("eyeOpen"), happyEyes: n("happyEyes"),
    blush: n("blush"), tears: n("tears"), headTilt: n("headTilt"), energy: n("energy"),
    idleMouth: t < 0.5 ? a.idleMouth : b.idleMouth,
  };
}
