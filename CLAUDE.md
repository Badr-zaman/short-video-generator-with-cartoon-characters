# Offscreen studio — notes for Claude

This repo renders 30–55 s vertical comedy shorts starring two 3D cartoon babies,
**Leo** (`who: boy`) and **Mia** (`who: girl`). Everything runs locally and free.
Always run `source ~/.nvm/nvm.sh && nvm use` first (Node 20).

## When the user asks for a video in plain language

e.g. "make one where the babies discover Monday mornings", "do 3 episodes about daycare drama"

1. Write `episodes/queue/<short-kebab-name>.yaml` in the exact format of
   `episodes/examples/rent.yaml` (schema: `pipeline/schema.ts`). Don't change code to make an episode.
2. Render it: `npm run render -- episodes/queue/<name>.yaml` (≈30 s on this Mac).
3. Report the output folder: `output/<name>/short.mp4`, `thumbnail.png`, `upload.txt`.
   If render fails because it's over 55 s, cut or shorten lines and re-run.

### Writing rules (what makes these work)
- 8–12 lines, each under ~18 words, ~75–115 spoken words total → lands at 30–55 s (about 0.37 s per word at the current speed).
- Line 1 is the hook (said out loud); `hook:` is a 2–6 word on-screen version of it, in caps.
- Escalate every line; the **last line is the punchline**. Babies talk like tiny adults about grown-up problems
  (rent, meetings, group chats, diets, taxes) and get it hilariously wrong.
- `emotion` per line: neutral, happy, smug, shocked, sad, crying, angry, confused, laughing.
  Vary them — the faces are the comedy. Optional `reaction:` sets the listener's face.
- Optional `shot:` close | two | zoom (default auto). Optional `pause:` seconds after a line (comic timing).
- `setting:` nursery | playroom | night. `hashtags:` 3–6 lowercase words, no `#`.
- Wholesome only: no bathing, diaper changes, danger, or anything unsafe or suggestive.
- Write numbers and abbreviations as words ("twenty bucks", not "$20") so the voice reads them right.

## Where things live
- `studio.config.yaml` — names, voices (Leo uses `style: toddler`, Mia `style: classic`), pitch, speed, colours, length limits (no code changes needed).
- `src/` — Remotion + Three.js scene (`scene/Baby.tsx` character, `scene/Set.tsx` rooms, `scene/camera.ts` shots,
  `scene/face.ts` expressions/mouth shapes, `overlay/` captions + hook card).
- `pipeline/` — Node CLI: TTS (Kokoro, local), lip sync (eSpeak phonemes → mouth shapes), render, metadata.
- Use the Remotion **Node API** (`pipeline/render.ts`) or `npx remotion` with the config as is.
