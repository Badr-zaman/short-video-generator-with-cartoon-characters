import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { EMOTIONS } from "../src/types.ts";
import { QUEUE_DIR, ROOT, ensureDir, loadConfig, slugify } from "./paths.ts";
import { EpisodeSchema } from "./schema.ts";

// Plain-language idea → episode YAML.
// Uses a free local model through Ollama if it is running; otherwise writes a template to fill in.

function writerPrompt(idea: string) {
  const cfg = loadConfig();
  const example = fs.readFileSync(path.join(ROOT, "episodes", "examples", "rent.yaml"), "utf8");
  return `You write scripts for 30-55 second comedy shorts starring two one-year-old babies:
${cfg.characters.boy.name} (who: boy) and ${cfg.characters.girl.name} (who: girl). They talk like tiny adults about grown-up problems.

Rules:
- Output ONLY YAML in exactly the format of the example. No prose, no code fences.
- 8 to 12 lines. Each line under 18 words. Total spoken words 75-115.
- First line is the hook. Last line is the punchline. Escalate in between.
- emotion must be one of: ${EMOTIONS.join(", ")}.
- Keep it wholesome: no bathing, diapers being changed, danger, or anything unsafe for kids.
- hashtags: 3-6 words, letters only, no '#'.

Example:
${example}

Write a new episode about: ${idea}`;
}

async function ollamaAvailable(url: string) {
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function newEpisodeFromIdea(idea: string): Promise<{ file: string; source: "ollama" | "template" }> {
  const cfg = loadConfig();
  ensureDir(QUEUE_DIR);
  const slug = slugify(idea);
  const file = path.join(QUEUE_DIR, `${slug}.yaml`);

  if (await ollamaAvailable(cfg.llm.ollamaUrl)) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      process.stdout.write(`  asking local model ${cfg.llm.model} (attempt ${attempt})… `);
      const r = await fetch(`${cfg.llm.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.llm.model, prompt: writerPrompt(idea), stream: false, options: { temperature: 0.9 } }),
      });
      const text: string = ((await r.json()) as { response?: string }).response ?? "";
      const yamlText = text.replace(/^```(?:yaml)?\s*/m, "").replace(/```\s*$/m, "").trim();
      try {
        const ep = EpisodeSchema.parse(YAML.parse(yamlText));
        fs.writeFileSync(file, `# Drafted by ${cfg.llm.model} from: "${idea}"\n# Edit freely, then: npm run render -- ${path.relative(ROOT, file)}\n` + YAML.stringify(ep));
        console.log("ok");
        return { file, source: "ollama" };
      } catch {
        console.log("invalid, retrying");
      }
    }
  }

  const template = {
    title: idea.charAt(0).toUpperCase() + idea.slice(1),
    hook: "WRITE A 3-6 WORD HOOK",
    setting: "nursery",
    lines: [
      { who: "boy", emotion: "shocked", text: "First line: the hook, said out loud." },
      { who: "girl", emotion: "smug", text: "Reply that escalates." },
      { who: "boy", emotion: "angry", text: "Push back." },
      { who: "girl", emotion: "laughing", text: "The punchline." },
    ],
    hashtags: ["babies", "funny"],
  };
  fs.writeFileSync(
    file,
    `# Idea: "${idea}"\n# No local model running, so this is a template. Fill it in by hand,\n# or ask Claude Code in this folder: "write the episode in ${path.relative(ROOT, file)}".\n` +
      YAML.stringify(template),
  );
  return { file, source: "template" };
}
