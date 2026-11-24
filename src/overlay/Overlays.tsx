import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { EpisodeProps, TimedLine } from "../types";

const FONT = '"Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", Arial, sans-serif';

const outline = (px: number, color = "#111") =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${(Math.cos(a) * px).toFixed(1)}px ${(Math.sin(a) * px).toFixed(1)}px 0 ${color}`;
  }).join(",");

export const HookCard: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const out = interpolate(frame, [fps * 2.4, fps * 2.8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (out <= 0) return null;
  return (
    <div style={{ position: "absolute", top: 230, left: 60, right: 60, display: "flex", justifyContent: "center", opacity: out }}>
      <div
        style={{
          transform: `scale(${0.6 + 0.4 * inS}) rotate(${(1 - inS) * -6 - 1.5}deg)`,
          background: "#fff",
          color: "#111",
          fontFamily: FONT,
          fontSize: 78,
          lineHeight: 1.1,
          padding: "26px 40px",
          borderRadius: 28,
          textAlign: "center",
          boxShadow: "0 14px 0 #111",
          border: "6px solid #111",
          maxWidth: 900,
        }}
      >
        {text}
      </div>
    </div>
  );
};

function chunkWords(line: TimedLine) {
  const chunks: { start: number; end: number; words: TimedLine["words"] }[] = [];
  let cur: TimedLine["words"] = [];
  for (const w of line.words) {
    cur.push(w);
    if (cur.length >= 3 || /[.,!?;:…]$/.test(w.text)) {
      chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
      cur = [];
    }
  }
  if (cur.length) chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
  return chunks;
}

export const Captions: React.FC<{ ep: EpisodeProps }> = ({ ep }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const line = ep.lines.find((l) => frame >= l.startFrame && frame < l.startFrame + l.durationFrames + 4);
  if (!line) return null;
  const t = (frame - line.startFrame) / fps;
  const chunks = chunkWords(line);
  const chunk = chunks.find((c) => t < c.end + 0.05) ?? chunks[chunks.length - 1];
  const chunkStartFrame = line.startFrame + Math.round(chunk.start * fps);
  const pop = spring({ frame: frame - chunkStartFrame, fps, config: { damping: 14, mass: 0.5 } });
  const who = ep.characters[line.who];
  return (
    <div style={{ position: "absolute", top: 1440, left: 70, right: 70, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 40,
          color: "#fff",
          background: who.accent,
          padding: "8px 26px",
          borderRadius: 999,
          border: "4px solid #111",
          alignSelf: line.who === "boy" ? "flex-start" : "flex-end",
        }}
      >
        {who.name}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 92,
          lineHeight: 1.08,
          textAlign: "center",
          color: "#fff",
          textShadow: outline(7),
          transform: `scale(${0.85 + 0.15 * pop})`,
          textTransform: "uppercase",
        }}
      >
        {chunk.words.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          return (
            <span key={i} style={{ color: active ? "#ffe14d" : "#fff" }}>
              {w.text}
              {i < chunk.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const EndCard: React.FC<{ text: string; from: number }> = ({ text, from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from) return null;
  const s = spring({ frame: frame - from, fps, config: { damping: 13 } });
  return (
    <div style={{ position: "absolute", top: 260, left: 60, right: 60, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          transform: `translateY(${(1 - s) * -60}px)`,
          opacity: s,
          fontFamily: FONT,
          fontSize: 60,
          color: "#fff",
          textShadow: outline(5),
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
};
