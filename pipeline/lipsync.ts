import { phonemize } from "phonemizer";
import type { MouthCue, Viseme, WordTiming } from "../src/types.ts";

// Lip sync without external binaries.
// We know the exact text we spoke, so: text → IPA phonemes (eSpeak-NG via WASM) → mouth shapes,
// then spread those shapes over the parts of the audio that are actually voiced.

const DIGRAPHS = ["eɪ", "aɪ", "aʊ", "oʊ", "ɔɪ", "tʃ", "dʒ", "əʊ", "ɪə", "eə", "ʊə"];

const VISEME_OF: Record<string, Viseme> = {
  m: "A", b: "A", p: "A",
  f: "G", v: "G",
  l: "H",
  w: "F", u: "F", ʊ: "F", uː: "F",
  o: "E", ɔ: "E", oʊ: "E", ɔɪ: "E", əʊ: "E", ɒ: "E",
  ɑ: "D", a: "D", aɪ: "D", aʊ: "D", æ: "D",
  ɛ: "C", e: "C", eɪ: "C", ʌ: "C", ə: "C", ɚ: "C", ɜ: "C", ɐ: "C", ᵻ: "C", i: "C", ɪ: "C", ɪə: "C", eə: "C", ʊə: "F",
};
const VOWELS = new Set(["ɑ", "a", "aɪ", "aʊ", "æ", "ɛ", "e", "eɪ", "ʌ", "ə", "ɚ", "ɜ", "ɐ", "ᵻ", "i", "ɪ", "o", "ɔ", "oʊ", "ɔɪ", "u", "ʊ", "ɒ", "əʊ", "ɪə", "eə", "ʊə"]);

function tokenizeIPA(ipa: string): string[] {
  const clean = ipa.replace(/[ˈˌːˑ‿]/g, "");
  const out: string[] = [];
  for (let i = 0; i < clean.length; ) {
    const two = clean.slice(i, i + 2);
    if (DIGRAPHS.includes(two)) {
      out.push(two);
      i += 2;
      continue;
    }
    const c = clean[i];
    if (/\s/.test(c)) out.push(" ");
    else if (/[a-zA-Zɑæɐɒʌəɚɛɜɪʊᵻɔθðʃʒŋɹɾʔçɡ]/.test(c)) out.push(c);
    i++;
  }
  return out;
}

/** Per-10ms RMS, plus which windows count as speech (short dips inside words are bridged). */
function analyse(samples: Float32Array, sr: number) {
  const win = Math.floor(sr * 0.01);
  const n = Math.ceil(samples.length / win);
  const rms = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let s = 0;
    const a = w * win;
    const b = Math.min(samples.length, a + win);
    for (let i = a; i < b; i++) s += samples[i] * samples[i];
    rms[w] = Math.sqrt(s / Math.max(1, b - a));
  }
  const sorted = Array.from(rms).sort((x, y) => x - y);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  const thr = p95 * 0.12;
  const voiced = Array.from(rms, (r) => r > thr);
  // bridge gaps shorter than 90ms (stop consonants, word joins)
  let lastOn = -1;
  for (let w = 0; w < n; w++) {
    if (voiced[w]) {
      if (lastOn >= 0 && w - lastOn - 1 > 0 && w - lastOn - 1 <= 9) for (let k = lastOn + 1; k < w; k++) voiced[k] = true;
      lastOn = w;
    }
  }
  return { rms, voiced, p95, winSec: 0.01 };
}

/** Map "speech time" (only voiced windows count) back to real time. */
function makeSpeechClock(voiced: boolean[], winSec: number) {
  const voicedIdx: number[] = [];
  voiced.forEach((v, i) => v && voicedIdx.push(i));
  const total = voicedIdx.length * winSec;
  const toReal = (speechT: number) => {
    if (!voicedIdx.length) return speechT;
    const k = Math.min(voicedIdx.length - 1, Math.max(0, Math.floor(speechT / winSec)));
    const frac = speechT / winSec - Math.floor(speechT / winSec);
    return (voicedIdx[k] + Math.min(1, frac)) * winSec;
  };
  return { total, toReal };
}

export async function buildLipSync(text: string, samples: Float32Array, sr: number, fps: number) {
  const { rms, voiced, p95, winSec } = analyse(samples, sr);
  const clock = makeSpeechClock(voiced, winSec);
  const duration = samples.length / sr;

  // --- mouth cues ---
  const ipa = (await phonemize(text, "en-us")).join(" ");
  const tokens = tokenizeIPA(ipa);
  const weighted = tokens.map((t) => ({ t, w: t === " " ? 0.35 : VOWELS.has(t) ? 2.2 : 1 }));
  const totalW = weighted.reduce((s, x) => s + x.w, 0) || 1;
  const cues: MouthCue[] = [];
  let acc = 0;
  for (const { t, w } of weighted) {
    const s0 = (acc / totalW) * clock.total;
    acc += w;
    const s1 = (acc / totalW) * clock.total;
    const v: Viseme = t === " " ? "B" : VISEME_OF[t] ?? "B";
    const start = clock.toReal(s0);
    const end = clock.toReal(s1);
    const prev = cues[cues.length - 1];
    if (prev && prev.v === v && Math.abs(prev.end - start) < 0.02) prev.end = end;
    else cues.push({ start, end, v });
  }
  // rest shapes in silent stretches
  const withRest: MouthCue[] = [];
  let t = 0;
  for (const c of cues) {
    if (c.start - t > 0.12) withRest.push({ start: t, end: c.start, v: "X" });
    withRest.push(c);
    t = c.end;
  }
  if (duration - t > 0.05) withRest.push({ start: t, end: duration, v: "X" });

  // --- word timings for captions (spread over speech time by phoneme-ish weight) ---
  const words = text.split(/\s+/).filter(Boolean);
  const ww = words.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, "").length) + 1.5);
  const wTotal = ww.reduce((a, b) => a + b, 0);
  const wordTimings: WordTiming[] = [];
  let wa = 0;
  words.forEach((w, i) => {
    const s0 = (wa / wTotal) * clock.total;
    wa += ww[i];
    const s1 = (wa / wTotal) * clock.total;
    wordTimings.push({ text: w, start: clock.toReal(s0), end: clock.toReal(s1) });
  });

  // --- loudness per video frame (drives jaw + head bob) ---
  const frames = Math.ceil(duration * fps);
  const amp: number[] = [];
  for (let f = 0; f < frames; f++) {
    const a = Math.floor((f / fps) / winSec);
    const b = Math.max(a + 1, Math.floor(((f + 1) / fps) / winSec));
    let m = 0;
    for (let k = a; k < b && k < rms.length; k++) m = Math.max(m, rms[k]);
    amp.push(Math.round(Math.min(1, m / p95) * 100) / 100);
  }

  return { cues: withRest.map(round), words: wordTimings.map(round), amp, duration };
}

function round<T extends { start: number; end: number }>(x: T): T {
  return { ...x, start: Math.round(x.start * 1000) / 1000, end: Math.round(x.end * 1000) / 1000 };
}
