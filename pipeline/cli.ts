import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { newEpisodeFromIdea } from "./ideas.ts";
import { DONE_DIR, QUEUE_DIR, ROOT, ensureDir, loadConfig } from "./paths.ts";
import { prepareEpisode, readEpisode } from "./prepare.ts";
import { renderEpisode } from "./render.ts";
import { listVoices, speak } from "./tts.ts";

const HELP = `Offscreen studio

  npm run new    -- "babies argue about who mom loves more"   plain-language idea → episodes/queue/<name>.yaml
  npm run render -- episodes/queue/<name>.yaml [--draft]      episode → output/<name>/short.mp4 (+ thumbnail, upload text)
  npm run queue                                               render everything in episodes/queue, move to episodes/done
  npm run prepare-ep -- <episode.yaml>                        voices + lip sync only, then preview with: npm run studio
  npm run studio                                              live preview/editor in the browser
  npm run voices                                              write a sample of every voice to output/voices/
  npm run doctor                                              check the setup
`;

async function render(file: string, draft: boolean) {
  const started = Date.now();
  console.log(`\n▶ ${path.relative(ROOT, file)}`);
  const ep = readEpisode(file);
  const { props, warnings } = await prepareEpisode(file);
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  const { outDir } = await renderEpisode(props, ep, { draft });
  const secs = (props.durationInFrames / props.fps).toFixed(1);
  console.log(`  ✓ ${secs}s short in ${((Date.now() - started) / 1000).toFixed(0)}s → ${path.relative(ROOT, outDir)}/`);
  return outDir;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const args = rest.filter((a) => !a.startsWith("--"));

  switch (cmd) {
    case "new": {
      const idea = args.join(" ").trim();
      if (!idea) throw new Error('Give an idea, e.g. npm run new -- "babies discover Monday mornings"');
      const { file, source } = await newEpisodeFromIdea(idea);
      console.log(source === "ollama" ? `Drafted ${path.relative(ROOT, file)} — review it, then render.` : `Template written to ${path.relative(ROOT, file)}.`);
      break;
    }
    case "prepare": {
      if (!args[0]) throw new Error("Usage: npm run prepare-ep -- <episode.yaml>");
      const { warnings } = await prepareEpisode(path.resolve(args[0]));
      warnings.forEach((w) => console.log(`  ⚠ ${w}`));
      console.log("Ready. Preview with: npm run studio");
      break;
    }
    case "render": {
      if (!args[0]) throw new Error("Usage: npm run render -- <episode.yaml> [--draft]");
      await render(path.resolve(args[0]), flags.has("--draft"));
      break;
    }
    case "queue": {
      ensureDir(QUEUE_DIR);
      ensureDir(DONE_DIR);
      const files = fs.readdirSync(QUEUE_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
      if (!files.length) return console.log("Queue is empty (episodes/queue/).");
      let ok = 0;
      for (const f of files) {
        const full = path.join(QUEUE_DIR, f);
        try {
          await render(full, false);
          fs.renameSync(full, path.join(DONE_DIR, f));
          ok++;
        } catch (e) {
          console.error(`  ✗ ${f}: ${(e as Error).message}`);
        }
      }
      console.log(`\nDone: ${ok}/${files.length} rendered.`);
      break;
    }
    case "voices": {
      const dir = path.join(ROOT, "output", "voices");
      ensureDir(dir);
      const cfg = loadConfig();
      const sample = "Excuse me? Nobody told me naps were optional!";
      for (const id of ["boy", "girl"] as const) {
        const c = cfg.characters[id];
        const { file } = await speak(sample, c);
        fs.copyFileSync(file, path.join(dir, `_current-${id}-${c.name}.wav`));
      }
      for (const v of (await listVoices()).filter((v) => v.startsWith("a"))) {
        const { file } = await speak(sample, { voice: v, pitch: 1.38, tempo: 0.95 });
        fs.copyFileSync(file, path.join(dir, `${v}.wav`));
        console.log(`  ${v}`);
      }
      console.log(`Samples in output/voices/. Set the voice settings per character in studio.config.yaml.`);
      break;
    }
    case "doctor": {
      const major = Number(process.versions.node.split(".")[0]);
      console.log(`node ${process.versions.node} ${major >= 18 ? "✓" : "✗ need 18+ (run: nvm use)"}`);
      console.log(`cpu ${os.cpus()[0]?.model}, ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM`);
      const free = fs.statfsSync(ROOT);
      console.log(`free disk ${((free.bavail * free.bsize) / 2 ** 30).toFixed(1)} GB (each short ≈ 10–30 MB)`);
      const cfg = loadConfig();
      console.log(`config ✓  (${cfg.characters.boy.name} + ${cfg.characters.girl.name}, max ${cfg.video.maxSeconds}s)`);
      try {
        await fetch(`${cfg.llm.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
        console.log(`ollama ✓ (${cfg.llm.model}) — "npm run new" will draft scripts`);
      } catch {
        console.log(`ollama – not running: "npm run new" writes templates (optional, free: https://ollama.com)`);
      }
      const { seconds } = await speak("Testing.", cfg.characters.boy);
      console.log(`voice ✓ (${seconds.toFixed(2)}s test clip)`);
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  console.error(`\n✗ ${(e as Error).message}`);
  process.exit(1);
});
