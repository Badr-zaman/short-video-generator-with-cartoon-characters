import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import React, { useLayoutEffect } from "react";
import * as THREE from "three";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Captions, EndCard, HookCard } from "./overlay/Overlays";
import { Baby, type BabyPose } from "./scene/Baby";
import { BABY_SCALE, BABY_X, BABY_Y, cameraFor, type CamState } from "./scene/camera";
import { EMOTION_STYLE, blink, idleMouth, mixStyles, speakingMouth } from "./scene/face";
import { Set } from "./scene/Set";
import type { CharacterId, EpisodeProps, ShortProps, TimedLine } from "./types";

const CameraRig: React.FC<{ cam: CamState }> = ({ cam }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(...cam.pos);
    camera.fov = cam.fov;
    camera.near = 0.1;
    camera.far = 60;
    camera.lookAt(new THREE.Vector3(...cam.target));
    camera.updateProjectionMatrix();
  }, [camera, cam]);
  return null;
};

function currentLineIndex(lines: TimedLine[], frame: number) {
  let idx = 0;
  for (let i = 0; i < lines.length; i++) if (lines[i].startFrame <= frame) idx = i;
  return idx;
}

function poseFor(id: CharacterId, ep: EpisodeProps, frame: number, fps: number): BabyPose {
  const time = frame / fps;
  const idx = currentLineIndex(ep.lines, frame);
  const line = ep.lines[idx];
  const prev = ep.lines[idx - 1];
  const isSpeaker = line.who === id;
  const talking = isSpeaker && frame >= line.startFrame && frame < line.startFrame + line.durationFrames;
  const emotionOf = (l: TimedLine | undefined) => (!l ? "neutral" : l.who === id ? l.emotion : l.reaction);
  const emotion = emotionOf(line);
  const k = Math.min(1, Math.max(0, (frame - line.startFrame) / 6));
  const style = mixStyles(EMOTION_STYLE[emotionOf(prev)], EMOTION_STYLE[emotion], k);
  const fIn = frame - line.startFrame;
  const mouth = talking ? speakingMouth(line, fIn / fps, fIn, style) : idleMouth(style, time, emotion);
  const amp = talking ? line.amp[Math.min(line.amp.length - 1, fIn)] ?? 0 : 0;
  const other = id === "boy" ? 1 : -1; // direction of the other baby
  const yaw = talking ? (line.shot === "two" ? other * 0.12 : other * 0.03) : line.who !== id ? other * 0.42 : other * 0.15;
  const seed = id === "boy" ? 3 : 8;
  return { time, mouth, style, emotion, blink: blink(time, seed), yaw, lookX: talking ? 0 : other * 0.8, amp, talking, seed };
}

const Scene: React.FC<{ ep: EpisodeProps }> = ({ ep }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const idx = currentLineIndex(ep.lines, frame);
  const line = ep.lines[idx];
  const next = ep.lines[idx + 1];
  const shotStart = frame < ep.lines[0].startFrame ? 0 : line.startFrame;
  const shotEnd = next ? next.startFrame : ep.durationInFrames;
  const cam = cameraFor(frame < ep.lines[0].startFrame ? ep.lines[0] : line, frame - shotStart, shotEnd - shotStart, fps);
  return (
    <>
      <CameraRig cam={cam} />
      <Set setting={ep.setting} time={frame / fps} />
      {(["boy", "girl"] as const).map((id) => (
        <group key={id} position={[BABY_X[id], BABY_Y, 0]} scale={BABY_SCALE}>
          <Baby kind={id} look={ep.characters[id]} pose={poseFor(id, ep, frame, fps)} />
        </group>
      ))}
    </>
  );
};

export const Short: React.FC<ShortProps> = ({ episode }) => {
  const { width, height } = useVideoConfig();
  if (!episode) {
    return (
      <AbsoluteFill style={{ background: "#222", color: "#fff", fontSize: 48, padding: 80, fontFamily: "sans-serif" }}>
        No episode prepared yet. Run: npm run prepare-ep -- episodes/examples/rent.yaml
      </AbsoluteFill>
    );
  }
  const last = episode.lines[episode.lines.length - 1];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: 50, position: [0, 1.3, 6.9] }} gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={1}>
        <Scene ep={episode} />
      </ThreeCanvas>
      <Captions ep={episode} />
      <HookCard text={episode.hook} />
      {episode.endCard && <EndCard text={episode.endCard} from={last.startFrame + last.durationFrames + 4} />}
      {episode.lines.map((l, i) => (
        <Sequence key={i} from={l.startFrame} durationInFrames={l.durationFrames + 2} layout="none">
          <Audio src={staticFile(l.audioSrc)} />
        </Sequence>
      ))}
      {episode.music && <Audio src={staticFile(episode.music)} volume={episode.musicVolume} loop />}
    </AbsoluteFill>
  );
};
