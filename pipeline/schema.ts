import { z } from "zod";
import { EMOTIONS, SETTINGS, SHOTS } from "../src/types.ts";

// The episode file format. This is the ONLY thing you need to write to make a new short.
export const LineSchema = z.object({
  who: z.enum(["boy", "girl"]),
  text: z.string().min(1).max(220),
  emotion: z.enum(EMOTIONS).default("neutral"),
  reaction: z.enum(EMOTIONS).optional(), // the other baby's face during this line
  shot: z.enum(SHOTS).default("auto"),
  pause: z.number().min(0).max(3).optional(), // seconds of silence after this line
});

export const EpisodeSchema = z.object({
  title: z.string().min(3).max(90),
  hook: z.string().min(2).max(60),
  setting: z.enum(SETTINGS).default("nursery"),
  lines: z.array(LineSchema).min(2).max(30),
  description: z.string().max(1500).optional(),
  hashtags: z.array(z.string().regex(/^[A-Za-z0-9_]+$/, "hashtags: letters/numbers only, no #")).max(15).default([]),
  music: z.string().optional(),
  endCard: z.string().max(60).nullable().optional(),
});

export type Episode = z.infer<typeof EpisodeSchema>;
export type EpisodeLine = z.infer<typeof LineSchema>;

const LookSchema = z.object({ skin: z.string(), hair: z.string(), outfit: z.string(), accent: z.string() });

// classic: one resample by `pitch`. toddler: pitch in Hz + voice size + livelier intonation (see pipeline/tts.ts).
const ToddlerVoiceSchema = z.object({
  name: z.string(),
  style: z.literal("toddler"),
  voice: z.string(),
  pitchHz: z.number().min(150).max(600),
  size: z.number().min(1).max(1.5).default(1.2),
  expressiveness: z.number().min(0.5).max(2).default(1.3),
  tempo: z.number().min(0.5).max(1.6),
  look: LookSchema,
});
const ClassicVoiceSchema = z.object({
  name: z.string(),
  style: z.literal("classic").default("classic"),
  voice: z.string(),
  pitch: z.number().min(0.7).max(2),
  tempo: z.number().min(0.5).max(1.6),
  look: LookSchema,
});
const VoiceSchema = z.union([ToddlerVoiceSchema, ClassicVoiceSchema]);

export const StudioConfigSchema = z.object({
  video: z.object({
    fps: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    minSeconds: z.number(),
    maxSeconds: z.number(),
    leadIn: z.number(),
    gapBetweenLines: z.number(),
    tail: z.number(),
  }),
  characters: z.object({ boy: VoiceSchema, girl: VoiceSchema }),
  music: z.object({ volume: z.number().min(0).max(1) }),
  llm: z.object({ ollamaUrl: z.string(), model: z.string() }),
  endCard: z.string().nullable().optional(),
});
export type StudioConfig = z.infer<typeof StudioConfigSchema>;
