# Offscreen studio

Local, free studio that turns a short script into a 30–55 s vertical 3D cartoon short
starring two babies, **Leo** and **Mia**. No paid services; nothing leaves your machine.

Stack (all open source / free): Remotion + Three.js (3D scene → MP4), Kokoro-82M (voices, on-device),
eSpeak-NG phonemes (lip sync), Node 20.

## Make a video

```bash
source ~/.nvm/nvm.sh && nvm use        # once per terminal
npm run render -- episodes/examples/rent.yaml
```

Output in `output/<name>/`: `short.mp4` (1080×1920), `thumbnail.png`, and `upload.txt`
(title, description, hashtags for YouTube Shorts and TikTok, ready to paste).

### Three ways to start a new episode

1. **Ask Claude Code in this folder** in plain English: *"make an episode where the babies discover Monday mornings"*.
   It writes the script and renders it (rules are in `CLAUDE.md`).
2. **Write the YAML yourself**: copy `episodes/examples/rent.yaml` into `episodes/queue/`, edit the lines.
3. **Free local model** (optional): install [Ollama](https://ollama.com), run `ollama pull qwen2.5:3b`, then
   `npm run new -- "babies discover monday mornings"` drafts the script into `episodes/queue/`.

Then `npm run queue` renders everything in `episodes/queue/` and moves the scripts to `episodes/done/`.

### Episode format

```yaml
title: Baby finds out the crib isn't free     # video title
hook: "THE CRIB HAS RENT?!"                   # big on-screen text, first 2.5 s
setting: nursery                              # nursery | playroom | night
lines:
  - who: boy                                  # boy = Leo, girl = Mia
    emotion: shocked                          # neutral happy smug shocked sad crying angry confused laughing
    text: Mia! Mom says I have to pay rent for the crib.
  - who: girl
    emotion: smug
    reaction: angry                           # optional: the other baby's face during this line
    shot: zoom                                # optional: close | two | zoom (default: auto)
    pause: 0.6                                # optional: silence after the line, for comic timing
    text: Welcome to adulthood.
hashtags: [babies, funny, rent]
music: track.mp3                              # optional, from assets/music/
```

Aim for 8–12 short lines, about 75–115 words in total. The render stops with an error if the episode runs over 55 s.

## Other commands

| Command | What it does |
|---|---|
| `npm run studio` | Live preview in the browser (shows the last prepared episode) |
| `npm run prepare-ep -- <file.yaml>` | Voices + lip sync only, then refresh the Studio preview |
| `npm run voices` | Writes a sample of every voice to `output/voices/` to pick from |
| `npm run doctor` | Checks Node, disk, voice model, Ollama |

## Customising without code — `studio.config.yaml`
Character names, voices, voice style (classic or toddler), pitch, speaking speed, colours (skin, hair, outfit, accent),
length limits, gaps between lines, music volume, end-card text.

## Music
Only use tracks you're allowed to use (e.g. YouTube Audio Library). Drop them in `assets/music/`.

## Moving to another Mac
Copy the folder (without `node_modules/`, `.cache/`, `output/`), then `nvm install 20 && npm install`.
The voice model (~90 MB) downloads on first use. Apple Silicon M1 with 16 GB is enough.
