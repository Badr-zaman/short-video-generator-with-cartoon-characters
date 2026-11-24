import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { CharacterId, EpisodeProps, Shot, TimedLine } from "../src/types.ts";
import { buildLipSync } from "./lipsync.ts";
import { GENERATED_DIR, MUSIC_DIR, PUBLIC_DIR, ensureDir, loadConfig, slugify } from "./paths.ts";
import { EpisodeSchema, type Episode } from "./schema.ts";
import { speak } from "./tts.ts";
import { readWav } from "./wav.ts";

export function readEpisode(file: string): Episode {
  const raw = YAML.parse(fs.readFileSync(file, "utf8"));
  const parsed = EpisodeSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(file)"}: ${i.message}`).join("\n");
    throw new Error(`Episode file ${path.basename(file)} is not valid:\n${msg}`);
  }
  return parsed.data;
}

function pickShot(shot: Shot, i: number, total: number, emotion: string): Exclude<Shot, "auto"> {
  if (shot !== "auto") return shot;
  if (i === 0) return "two";
  // Mostly keep both sitting babies in view; punch in only for the punchline and big shocks.
  if (i === total - 1 || emotion === "shocked") return "zoom";
  return i % 3 === 0 ? "two" : "close";
}

function defaultReaction(emotion: string) {
  switch (emotion) {
    case "smug": return "angry" as const;
    case "angry": return "shocked" as const;
    case "crying": return "smug" as const;
    case "laughing": return "laughing" as const;
    case "shocked": return "confused" as const;
    default: return "neutral" as const;
  }
}

/** Episode YAML → voice audio + lip sync + timeline. Writes public/generated/<slug>/props.json. */
export async function prepareEpisode(file: string): Promise<{ props: EpisodeProps; warnings: string[] }> {
  const ep = readEpisode(file);
  const cfg = loadConfig();
  const { fps } = cfg.video;
  const slug = slugify(path.basename(file, path.extname(file)));
  const outDir = path.join(GENERATED_DIR, slug);
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);
  const warnings: string[] = [];

  const lines: TimedLine[] = [];
  let cursor = Math.round(cfg.video.leadIn * fps);
  for (const [i, line] of ep.lines.entries()) {
    const who = line.who as CharacterId;
    const voice = cfg.characters[who];
    process.stdout.write(`  [${i + 1}/${ep.lines.length}] ${voice.name}: ${line.text.slice(0, 50)}\n`);
    const { file: wav } = await speak(line.text, voice, line.emotion);
    const name = `line-${String(i + 1).padStart(2, "0")}.wav`;
    fs.copyFileSync(wav, path.join(outDir, name));
    const { samples, sampleRate } = readWav(wav);
    const sync = await buildLipSync(line.text, samples, sampleRate, fps);
    const durationFrames = Math.ceil(sync.duration * fps);
    lines.push({
      who,
      text: line.text,
      emotion: line.emotion,
      reaction: line.reaction ?? defaultReaction(line.emotion),
      shot: pickShot(line.shot, i, ep.lines.length, line.emotion),
      startFrame: cursor,
      durationFrames,
      audioSrc: `generated/${slug}/${name}`,
      cues: sync.cues,
      words: sync.words,
      amp: sync.amp,
    });
    cursor += durationFrames + Math.round((line.pause ?? cfg.video.gapBetweenLines) * fps);
  }
  const durationInFrames = cursor + Math.round(cfg.video.tail * fps);
  const seconds = durationInFrames / fps;
  if (seconds > cfg.video.maxSeconds)
    throw new Error(`Episode is ${seconds.toFixed(1)}s — over the ${cfg.video.maxSeconds}s limit. Cut or shorten some lines.`);
  if (seconds < cfg.video.minSeconds)
    warnings.push(`Episode is only ${seconds.toFixed(1)}s (target ${cfg.video.minSeconds}–${cfg.video.maxSeconds}s). Consider adding a line or two.`);

  let music: string | null = null;
  if (ep.music) {
    const src = path.join(MUSIC_DIR, ep.music);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, `music${path.extname(src)}`));
      music = `generated/${slug}/music${path.extname(src)}`;
    } else warnings.push(`Music file assets/music/${ep.music} not found — rendering without music.`);
  }

  const props: EpisodeProps = {
    slug,
    title: ep.title,
    hook: ep.hook,
    fps,
    durationInFrames,
    setting: ep.setting,
    characters: {
      boy: { name: cfg.characters.boy.name, ...cfg.characters.boy.look },
      girl: { name: cfg.characters.girl.name, ...cfg.characters.girl.look },
    },
    lines,
    music,
    musicVolume: cfg.music.volume,
    endCard: ep.endCard === undefined ? cfg.endCard ?? null : ep.endCard,
  };
  fs.writeFileSync(path.join(outDir, "props.json"), JSON.stringify(props));
  fs.writeFileSync(path.join(GENERATED_DIR, "latest.json"), JSON.stringify(props)); // what the Studio preview shows
  ensureDir(PUBLIC_DIR);
  return { props, warnings };
}
