import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { EpisodeProps } from "../src/types.ts";
import { OUTPUT_DIR, ROOT, ensureDir } from "./paths.ts";
import type { Episode } from "./schema.ts";
import { buildMetadata, metadataText } from "./metadata.ts";

let bundled: string | null = null;

export async function renderEpisode(props: EpisodeProps, ep: Episode, opts: { draft?: boolean } = {}) {
  // Bundle once per process; it copies /public (incl. generated audio) into the bundle.
  if (!bundled) {
    process.stdout.write("  bundling scene… ");
    bundled = await bundle({ entryPoint: path.join(ROOT, "src", "index.ts"), publicDir: path.join(ROOT, "public") });
    console.log("ok");
  } else {
    // later episodes in the same run: copy their generated folder into the bundle
    const src = path.join(ROOT, "public", "generated", props.slug);
    const dst = path.join(bundled, "public", "generated", props.slug);
    fs.cpSync(src, dst, { recursive: true });
  }

  const inputProps = { episode: props };
  const composition = await selectComposition({ serveUrl: bundled, id: "Short", inputProps });
  const outDir = path.join(OUTPUT_DIR, props.slug);
  ensureDir(outDir);
  const video = path.join(outDir, "short.mp4");
  const chromiumOptions = { gl: "angle" as const };

  let last = -1;
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: video,
    inputProps,
    chromiumOptions,
    crf: opts.draft ? 28 : 18,
    scale: opts.draft ? 0.5 : 1,
    audioBitrate: "192k",
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct !== last && pct % 5 === 0) {
        last = pct;
        process.stdout.write(`\r  rendering video… ${pct}%`);
      }
    },
  });
  console.log("");

  // Thumbnail: the moment the last (punchline) line starts, a few frames in.
  const punch = props.lines[props.lines.length - 1];
  await renderStill({
    composition,
    serveUrl: bundled,
    output: path.join(outDir, "thumbnail.png"),
    inputProps,
    chromiumOptions,
    frame: Math.min(props.durationInFrames - 1, punch.startFrame + 8),
  });

  const meta = buildMetadata(ep, props);
  fs.writeFileSync(path.join(outDir, "metadata.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(outDir, "upload.txt"), metadataText(meta));
  return { outDir, video };
}
