import type { EpisodeProps } from "../src/types.ts";
import type { Episode } from "./schema.ts";

const BASE_TAGS = ["babies", "funnybaby", "cutebaby", "animation", "3danimation", "comedy", "shorts"];

export function buildMetadata(ep: Episode, props: EpisodeProps) {
  const tags = [...new Set([...ep.hashtags.map((h) => h.toLowerCase()), ...BASE_TAGS])].slice(0, 15);
  const hashLine = tags.map((t) => `#${t}`).join(" ");
  const names = `${props.characters.boy.name} & ${props.characters.girl.name}`;
  const description = (ep.description?.trim() || `${names}: ${ep.hook}`) + `\n\nOriginal animated characters.\n\n${hashLine}`;
  return {
    seconds: Math.round((props.durationInFrames / props.fps) * 10) / 10,
    youtube: {
      title: `${ep.title} #shorts`.slice(0, 100),
      description,
      tags,
      madeForKids: false,
      alteredOrSyntheticContent: false, // stylised cartoon — not realistic; change if you go photoreal
      category: "Comedy",
    },
    tiktok: {
      caption: `${ep.title} ${hashLine}`.slice(0, 2200),
      aiGeneratedLabel: "Recommended: turn on 'AI-generated content' (voices are synthetic).",
    },
  };
}

export function metadataText(m: ReturnType<typeof buildMetadata>) {
  return [
    `LENGTH: ${m.seconds}s`,
    "",
    "=== YOUTUBE SHORTS ===",
    `Title: ${m.youtube.title}`,
    `Made for kids: No   |   Category: ${m.youtube.category}`,
    "Description:",
    m.youtube.description,
    "",
    `Tags: ${m.youtube.tags.join(", ")}`,
    "",
    "=== TIKTOK ===",
    m.tiktok.caption,
    m.tiktok.aiGeneratedLabel,
    "",
  ].join("\n");
}
