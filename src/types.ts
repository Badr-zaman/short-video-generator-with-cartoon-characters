// Shared between the Remotion scene (src/) and the Node pipeline (pipeline/).
// The pipeline turns an episode YAML into an `EpisodeProps` object; the scene only renders it.

export const EMOTIONS = [
  "neutral",
  "happy",
  "smug",
  "shocked",
  "sad",
  "crying",
  "angry",
  "confused",
  "laughing",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const SHOTS = ["auto", "close", "two", "zoom"] as const;
export type Shot = (typeof SHOTS)[number];

export type CharacterId = "boy" | "girl";

// Rhubarb-style mouth shapes (Preston Blair set). X = rest.
export type Viseme = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";

export type MouthCue = { start: number; end: number; v: Viseme }; // seconds, relative to line start
export type WordTiming = { text: string; start: number; end: number }; // seconds, relative to line start

export type CharacterLook = {
  name: string;
  skin: string;
  hair: string;
  outfit: string;
  accent: string; // bow / name-tag color
};

export type TimedLine = {
  who: CharacterId;
  text: string;
  emotion: Emotion;
  reaction: Emotion; // what the *other* baby does while this line plays
  shot: Exclude<Shot, "auto">;
  startFrame: number;
  durationFrames: number;
  audioSrc: string; // path relative to /public
  cues: MouthCue[];
  words: WordTiming[];
  amp: number[]; // loudness 0..1 per video frame of this line
};

export type EpisodeProps = {
  slug: string;
  title: string;
  hook: string;
  fps: number;
  durationInFrames: number;
  setting: SettingId;
  characters: Record<CharacterId, CharacterLook>;
  lines: TimedLine[];
  music: string | null; // path relative to /public
  musicVolume: number;
  endCard: string | null;
};

export const SETTINGS = ["nursery", "playroom", "night"] as const;
export type SettingId = (typeof SETTINGS)[number];

// Studio-preview wrapper: when `episode` is null the composition loads public/generated/latest.json.
export type ShortProps = { episode: EpisodeProps | null };
