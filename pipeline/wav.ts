import fs from "node:fs";

// Minimal mono 16-bit PCM WAV reader/writer, so the pipeline needs no ffmpeg/sox.

export function writeWav(file: string, samples: Float32Array, sampleRate: number) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

export function readWav(file: string): { samples: Float32Array; sampleRate: number } {
  const buf = fs.readFileSync(file);
  const sampleRate = buf.readUInt32LE(24);
  // find "data" chunk
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      const n = size / 2;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(off + 8 + i * 2) / 0x8000;
      return { samples, sampleRate };
    }
    off += 8 + size;
  }
  throw new Error(`No data chunk in ${file}`);
}

/** Resample by `factor` (>1 = higher pitch and shorter), linear interpolation. */
export function pitchShiftByResample(input: Float32Array, factor: number): Float32Array {
  const outLen = Math.floor(input.length / factor);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * factor;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = input[i0] ?? 0;
    const b = input[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Trim leading/trailing near-silence and normalise peak level. */
export function trimAndNormalize(input: Float32Array, sampleRate: number, peak = 0.89): Float32Array {
  const thr = 0.01;
  let s = 0;
  while (s < input.length && Math.abs(input[s]) < thr) s++;
  let e = input.length - 1;
  while (e > s && Math.abs(input[e]) < thr) e--;
  const pad = Math.floor(sampleRate * 0.03);
  s = Math.max(0, s - pad);
  e = Math.min(input.length - 1, e + pad);
  const out = input.slice(s, e + 1);
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * peak;
  // 5ms fades to avoid clicks
  const f = Math.floor(sampleRate * 0.005);
  for (let i = 0; i < f && i < out.length; i++) {
    out[i] *= i / f;
    out[out.length - 1 - i] *= i / f;
  }
  return out;
}
