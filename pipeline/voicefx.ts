// "Toddler" voice style, pure TypeScript (no ffmpeg/sox). Used by characters with `style: toddler`.
//
// A toddler's voice is much higher than an adult's (≈350–450 Hz vs ≈200 Hz) but the
// "size" of the voice (formants) is only a little higher. Plain resampling raises both
// together. So this style splits it in two:
//   1. TD-PSOLA raises the pitch while keeping formants and duration.
//   2. A small resample (`size`) then makes the voice sound smaller.
// PSOLA also lets the pitch move over time: wider intonation (`expressiveness`) and a
// wobble for crying/giggling.

import type { Emotion } from "../src/types.ts";

/** Per-emotion delivery: pitch and speed multipliers, plus an optional pitch wobble. */
export const EMOTION_VOICE: Record<Emotion, { pitch: number; tempo: number; wobbleHz?: number; wobble?: number }> = {
  neutral: { pitch: 1, tempo: 1 },
  happy: { pitch: 1.06, tempo: 1.03 },
  smug: { pitch: 0.95, tempo: 0.94 },
  shocked: { pitch: 1.12, tempo: 1.08 },
  sad: { pitch: 0.94, tempo: 0.9 },
  crying: { pitch: 1.04, tempo: 0.92, wobbleHz: 6, wobble: 0.06 },
  angry: { pitch: 1.05, tempo: 1.08 },
  confused: { pitch: 1.03, tempo: 0.96 },
  laughing: { pitch: 1.08, tempo: 1.05, wobbleHz: 7.5, wobble: 0.07 },
};

const MIN_HZ = 70;
const MAX_HZ = 650;

/** Pitch track: one F0 value per `hop` samples (0 = unvoiced), normalised autocorrelation. */
export function pitchTrack(x: Float32Array, sr: number, hop: number): Float32Array {
  const win = Math.round(0.03 * sr);
  const minLag = Math.floor(sr / MAX_HZ);
  const maxLag = Math.ceil(sr / MIN_HZ);
  const frames = Math.ceil(x.length / hop);
  const f0 = new Float32Array(frames);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const r = new Float32Array(maxLag + 1);
  for (let k = 0; k < frames; k++) {
    const s = k * hop - (win >> 1);
    if (s < 0 || s + win + maxLag >= x.length) continue;
    let e = 0;
    for (let i = 0; i < win; i++) e += x[s + i] * x[s + i];
    if (Math.sqrt(e / win) < peak * 0.05) continue;
    let best = 0;
    let bl = 0;
    for (let L = minLag; L <= maxLag; L++) {
      let num = 0;
      let e2 = 0;
      for (let i = 0; i < win; i++) {
        const b = x[s + i + L];
        num += x[s + i] * b;
        e2 += b * b;
      }
      const v = num / Math.sqrt(e * e2 + 1e-12);
      r[L] = v;
      if (v > best) {
        best = v;
        bl = L;
      }
    }
    if (best < 0.55) continue;
    const half = Math.round(bl / 2); // avoid octave-down errors
    if (half >= minLag && r[half] > best * 0.9) bl = half;
    f0[k] = sr / bl;
  }
  // 5-point median filter on voiced frames to kill octave blips
  const out = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    if (!f0[k]) continue;
    const w: number[] = [];
    for (let j = k - 2; j <= k + 2; j++) if (f0[j]) w.push(f0[j]);
    w.sort((a, b) => a - b);
    out[k] = w[w.length >> 1];
  }
  return out;
}

export function medianHz(track: Float32Array): number {
  const v = Array.from(track).filter((f) => f > 0).sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
}

type Mark = { pos: number; period: number; f0: number };

function pitchMarks(x: Float32Array, sr: number, track: Float32Array, hop: number): Mark[] {
  const marks: Mark[] = [];
  const unvoicedP = Math.round(0.005 * sr);
  let t = 0;
  let prevVoiced = false;
  while (t < x.length) {
    const f = track[Math.min(track.length - 1, Math.floor(t / hop))];
    if (f > 0) {
      const P = Math.round(sr / f);
      // snap to the biggest positive peak near t (whole period when starting a voiced run)
      const from = prevVoiced ? t - Math.round(P * 0.25) : t;
      const to = prevVoiced ? t + Math.round(P * 0.25) : t + P;
      let best = Math.max(0, from);
      for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) if (x[i] > x[best]) best = i;
      if (marks.length && best <= marks[marks.length - 1].pos) best = marks[marks.length - 1].pos + 1;
      marks.push({ pos: best, period: P, f0: f });
      t = best + P;
      prevVoiced = true;
    } else {
      marks.push({ pos: t, period: unvoicedP, f0: 0 });
      t += unvoicedP;
      prevVoiced = false;
    }
  }
  return marks;
}

export type PsolaOptions = {
  /** pitch multiplier at the line's own median pitch */
  factor: number;
  /** >1 widens the intonation around the line's median (1 = unchanged) */
  expressiveness?: number;
  wobbleHz?: number;
  wobble?: number;
};

/** TD-PSOLA pitch shift: changes pitch, keeps duration and formants. */
export function psola(x: Float32Array, sr: number, o: PsolaOptions): Float32Array {
  const hop = Math.round(0.005 * sr);
  const track = pitchTrack(x, sr, hop);
  const ref = medianHz(track);
  if (!ref) return x.slice();
  const marks = pitchMarks(x, sr, track, hop);
  const k = o.expressiveness ?? 1;
  const out = new Float32Array(x.length);
  const wsum = new Float32Array(x.length);

  let j = 0;
  let ts = marks[0].pos;
  while (ts < x.length) {
    while (j + 1 < marks.length && marks[j + 1].pos <= ts) j++;
    const m = j + 1 < marks.length && marks[j + 1].pos - ts < ts - marks[j].pos ? marks[j + 1] : marks[j];
    const P = m.period;
    for (let i = -P; i <= P; i++) {
      const src = m.pos + i;
      const dst = ts + i;
      if (src < 0 || src >= x.length || dst < 0 || dst >= x.length) continue;
      const w = 0.5 - 0.5 * Math.cos((Math.PI * (i + P)) / P);
      out[dst] += x[src] * w;
      wsum[dst] += w;
    }
    if (m.f0 > 0) {
      let a = o.factor * Math.pow(m.f0 / ref, k - 1);
      if (o.wobble && o.wobbleHz) a *= 1 + o.wobble * Math.sin((2 * Math.PI * o.wobbleHz * ts) / sr);
      a = Math.min(2.8, Math.max(0.6, a));
      ts += Math.max(1, Math.round(P / a));
    } else {
      ts += P;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(wsum[i], 0.5);
  return matchLoudness(x, out, sr);
}

/**
 * Overlapping grains come out a little quieter in vowels than in hissy consonants, which
 * makes "s" sounds stand out after normalising. Restore the input's loudness envelope.
 */
function matchLoudness(ref: Float32Array, y: Float32Array, sr: number): Float32Array {
  const n = Math.round(0.02 * sr);
  const frames = Math.ceil(y.length / n);
  const gain = new Float32Array(frames + 1);
  for (let k = 0; k < frames; k++) {
    let a = 0;
    let b = 0;
    for (let i = k * n; i < Math.min(y.length, (k + 1) * n); i++) {
      a += ref[i] * ref[i];
      b += y[i] * y[i];
    }
    gain[k] = b > 1e-9 ? Math.min(1.8, Math.max(0.6, Math.sqrt(a / b))) : 1;
  }
  gain[frames] = gain[frames - 1] ?? 1;
  for (let i = 0; i < y.length; i++) {
    const p = i / n - 0.5;
    const k = Math.max(0, Math.floor(p));
    const t = Math.min(1, Math.max(0, p - k));
    y[i] *= gain[k] + (gain[Math.min(frames, k + 1)] - gain[k]) * t;
  }
  return y;
}

/** Gentle high-frequency softening (mild de-esser): babies don't hiss their "s" sounds. */
export function soften(x: Float32Array, amount = 0.6): Float32Array {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const lp = 0.25 * (x[i - 1] ?? x[i]) + 0.5 * x[i] + 0.25 * (x[i + 1] ?? x[i]);
    y[i] = x[i] * (1 - amount) + lp * amount;
  }
  return y;
}
