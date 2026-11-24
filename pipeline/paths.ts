import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { StudioConfigSchema, type StudioConfig } from "./schema.ts";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const GENERATED_DIR = path.join(PUBLIC_DIR, "generated");
export const CACHE_DIR = path.join(ROOT, ".cache");
export const OUTPUT_DIR = path.join(ROOT, "output");
export const EPISODES_DIR = path.join(ROOT, "episodes");
export const QUEUE_DIR = path.join(EPISODES_DIR, "queue");
export const DONE_DIR = path.join(EPISODES_DIR, "done");
export const MUSIC_DIR = path.join(ROOT, "assets", "music");

export function loadConfig(): StudioConfig {
  const raw = YAML.parse(fs.readFileSync(path.join(ROOT, "studio.config.yaml"), "utf8"));
  return StudioConfigSchema.parse(raw);
}

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "episode"
  );
}
