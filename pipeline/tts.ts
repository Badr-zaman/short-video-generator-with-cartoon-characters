import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Emotion } from "../src/types.ts";
import { CACHE_DIR, ensureDir } from "./paths.ts";
import { EMOTION_VOICE, medianHz, pitchTrack, psola, soften } from "./voicefx.ts";
import { pitchShiftByResample, readWav, trimAndNormalize, writeWav } from "./wav.ts";

// Local, free text-to-speech: Kokoro-82M (Apache-2.0) running on ONNX in Node.
// First use downloads the model (~90 MB) into the Hugging Face cache; after that it's offline.
//
// Two voice styles (set per character in studio.config.yaml):
//   classic — one resample by `pitch` (higher and smaller together).
//   toddler — pitch raised to `pitchHz` while the voice shrinks only by `size`, with
//             livelier intonation and per-emotion delivery (see voicefx.ts).

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const FX_VERSION = 5; // bump when toddler processing changes, to invalidate the cache
type Kokoro = { generate: (text: string, o: { voice: string; speed: number }) => Promise<{ audio: Float32Array; sampling_rate: number }>; voices: Record<string, unknown> };
let tts: Kokoro | null = null;

async function getTTS(): Promise<Kokoro> {
  if (!tts) {
    const { KokoroTTS } = await import("kokoro-js");
    process.stdout.write("  loading Kokoro voice model… ");
    tts = (await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" })) as unknown as Kokoro;
    console.log("ok");
  }
  return tts;
}

export async function listVoices(): Promise<string[]> {
  return Object.keys((await getTTS()).voices);
}

export type VoiceSettings =
  | { style?: "classic"; voice: string; pitch: number; tempo: number }
  | { style: "toddler"; voice: string; pitchHz: number; size: number; expressiveness: number; tempo: number };

const CALIBRATION = "Hello there! How are you doing today? I am doing very well, thank you so much for asking.";

/** The voice's natural median pitch in Hz, measured once and cached. */
async function baselineHz(voice: string): Promise<number> {
  const dir = path.join(CACHE_DIR, "tts");
  ensureDir(dir);
  const file = path.join(dir, `baseline-${voice}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")).hz;
  const out = await (await getTTS()).generate(CALIBRATION, { voice, speed: 1 });
  const hz = medianHz(pitchTrack(out.audio, out.sampling_rate, Math.round(0.005 * out.sampling_rate))) || 200;
  fs.writeFileSync(file, JSON.stringify({ voice, hz }));
  return hz;
}

/** Speak `text` in the character's voice, return path to a cached WAV (trimmed, normalised). */
export async function speak(text: string, v: VoiceSettings, emotion: Emotion = "neutral"): Promise<{ file: string; seconds: number }> {
  const dir = path.join(CACHE_DIR, "tts");
  ensureDir(dir);
  const keyParts =
    v.style === "toddler"
      ? [text, v.voice, v.pitchHz, v.size, v.tempo, v.expressiveness, emotion, FX_VERSION]
      : [text, v.voice, v.pitch, v.tempo, 2];
  const key = crypto.createHash("sha1").update(JSON.stringify(keyParts)).digest("hex").slice(0, 16);
  const file = path.join(dir, `${key}.wav`);
  if (!fs.existsSync(file)) {
    const engine = await getTTS();
    if (v.style === "toddler") {
      const emo = EMOTION_VOICE[emotion];
      const base = await baselineHz(v.voice);
      const total = (v.pitchHz * emo.pitch) / base; // overall pitch multiplier
      const size = Math.min(total, v.size); // never shrink more than we raise the pitch
      // the final resample by `size` speeds speech up, so ask Kokoro for a slower delivery
      const speed = Math.min(2, Math.max(0.5, (v.tempo * emo.tempo) / size));
      const out = await engine.generate(text, { voice: v.voice, speed });
      const sr = out.sampling_rate;
      const raised = psola(out.audio, sr, { factor: total / size, expressiveness: v.expressiveness, wobbleHz: emo.wobbleHz, wobble: emo.wobble });
      writeWav(file, trimAndNormalize(soften(pitchShiftByResample(raised, size)), sr), sr);
    } else {
      // Final tempo = kokoroSpeed * pitch, so compensate for the speed-up the pitch shift causes.
      const speed = Math.min(2, Math.max(0.5, v.tempo / v.pitch));
      const out = await engine.generate(text, { voice: v.voice, speed });
      writeWav(file, trimAndNormalize(pitchShiftByResample(out.audio, v.pitch), out.sampling_rate), out.sampling_rate);
    }
  }
  const { samples, sampleRate } = readWav(file);
  return { file, seconds: samples.length / sampleRate };
}
