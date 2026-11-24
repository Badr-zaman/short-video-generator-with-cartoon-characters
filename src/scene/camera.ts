import type { CharacterId, TimedLine } from "../types";

// Both babies sit side by side on the rug, facing the camera.
export const BABY_SCALE = 0.6;
export const BABY_X: Record<CharacterId, number> = { boy: -0.84, girl: 0.84 };
export const BABY_Y = 2.62 * BABY_SCALE; // so the bottom sits on the floor
export const HEAD_Y = BABY_Y; // head centre in world units

export type CamState = { pos: [number, number, number]; target: [number, number, number]; fov: number };

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * Camera for a given line and frame-in-line. Hard cuts between lines, slow push-ins within.
 * - two:   both babies, full bodies, side by side
 * - close: the speaker's whole sitting body, the other baby half in frame
 * - zoom:  punch-in on the speaker's face (punchlines, big reactions)
 */
export function cameraFor(line: TimedLine | undefined, frameInShot: number, shotLength: number, fps: number): CamState {
  const p = Math.min(1, frameInShot / Math.max(1, shotLength));
  if (!line || line.shot === "two") {
    const d = 6.6 - 0.35 * p;
    return { pos: [0, 2.05, d], target: [0, 1.32, 0], fov: 50 };
  }
  const hx = BABY_X[line.who];
  if (line.shot === "close") {
    const d = 4.7 - 0.3 * p;
    return { pos: [hx * 0.5, 1.6, d], target: [hx * 0.5, 1.12, 0], fov: 42 };
  }
  // zoom
  const side = hx < 0 ? 1 : -1; // camera sits slightly toward the other baby
  const z = easeOut(frameInShot / (fps * 0.18));
  const shake = frameInShot < fps * 0.3 ? Math.sin(frameInShot * 2.3) * 0.03 * (1 - frameInShot / (fps * 0.3)) : 0;
  return {
    pos: [hx + side * 0.35 + shake, HEAD_Y + 0.2 + shake * 0.5, 3.8],
    target: [hx + side * 0.05, HEAD_Y - 0.35, 0],
    fov: 52 - 10 * z,
  };
}
