import React from "react";
import type { SettingId } from "../types";

type Palette = { wall: string; floor: string; rug: string; dots: string; blocks: string[]; sky: string; ground: string; key: number; night: boolean };

const PALETTES: Record<SettingId, Palette> = {
  nursery: { wall: "#f7dcc0", floor: "#d9ad80", rug: "#f3eee6", dots: "#f0c9a6", blocks: ["#ef6f6c", "#5fb7e5", "#f6c445", "#7ccf8a"], sky: "#fff4e6", ground: "#c99c74", key: 2.2, night: false },
  playroom: { wall: "#cfe6f5", floor: "#e7c995", rug: "#ffd6e0", dots: "#b5d8ee", blocks: ["#ff8a5b", "#6c8cff", "#ffd23f", "#3ec7a0"], sky: "#f2fbff", ground: "#d8b98a", key: 2.3, night: false },
  night: { wall: "#2b3266", floor: "#3a3d68", rug: "#545a95", dots: "#f6e7a1", blocks: ["#9a8cff", "#5fb7e5", "#f6c445", "#ef6f6c"], sky: "#8fa2ff", ground: "#20244a", key: 1.1, night: true },
};

// Deterministic pseudo-random so every render is identical.
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const Set: React.FC<{ setting: SettingId; time: number }> = ({ setting, time }) => {
  const p = PALETTES[setting];
  return (
    <group>
      <hemisphereLight args={[p.sky, p.ground, p.night ? 0.7 : 1.1]} />
      <directionalLight position={[-3, 5, 6]} intensity={p.key} color={p.night ? "#c7cfff" : "#fff1de"} />
      <directionalLight position={[4, 4, -3]} intensity={p.night ? 0.9 : 0.8} color={p.night ? "#9fb4ff" : "#ffe3c4"} />
      <ambientLight intensity={0.25} />
      {p.night && <pointLight position={[2.6, 2.2, 0.8]} intensity={6} distance={7} color="#ffcf7a" />}

      {/* wall + floor */}
      <mesh position={[0, 6, -2.6]}>
        <planeGeometry args={[30, 16]} />
        <meshStandardMaterial color={p.wall} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 4]}>
        <planeGeometry args={[30, 14]} />
        <meshStandardMaterial color={p.floor} roughness={0.85} />
      </mesh>
      {/* skirting board */}
      <mesh position={[0, 0.12, -2.55]}>
        <boxGeometry args={[30, 0.24, 0.08]} />
        <meshStandardMaterial color="#fffaf3" roughness={0.6} />
      </mesh>
      {/* rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.2]} scale={[1.6, 1, 1]}>
        <circleGeometry args={[1.9, 48]} />
        <meshStandardMaterial color={p.rug} roughness={1} />
      </mesh>

      {/* wall pattern: dots or stars */}
      {Array.from({ length: 34 }).map((_, i) => {
        const x = -5 + rand(i) * 10;
        const y = 0.8 + rand(i + 100) * 6;
        const r = p.night ? 0.05 + rand(i + 7) * 0.05 : 0.09 + rand(i + 7) * 0.08;
        const tw = p.night ? 0.6 + 0.4 * Math.sin(time * 2 + i) : 1;
        return (
          <mesh key={i} position={[x, y, -2.58]}>
            <circleGeometry args={[r, p.night ? 5 : 20]} />
            <meshBasicMaterial color={p.dots} transparent opacity={tw} />
          </mesh>
        );
      })}

      {/* picture frame / window */}
      <group position={[-1.9, 3.3, -2.55]}>
        <mesh>
          <boxGeometry args={[1.3, 1.0, 0.06]} />
          <meshStandardMaterial color="#fffaf3" />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[1.12, 0.82]} />
          <meshStandardMaterial color={p.night ? "#141838" : "#bfe3ff"} />
        </mesh>
        {p.night ? (
          <mesh position={[0.25, 0.15, 0.05]}>
            <circleGeometry args={[0.16, 24]} />
            <meshBasicMaterial color="#fff3b0" />
          </mesh>
        ) : (
          <mesh position={[-0.2, -0.1, 0.05]}>
            <circleGeometry args={[0.22, 24]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )}
      </group>

      {/* alphabet blocks */}
      {[
        [-2.3, -0.9, 0.0],
        [-1.95, -0.6, 0.5],
        [-2.15, -0.75, 0],
        [2.25, -0.8, 0.3],
        [2.55, -1.2, -0.2],
      ].map(([x, z, r], i) => {
        const stackY = i === 2 ? 0.75 : 0.25;
        return (
          <mesh key={i} position={[x, stackY, z + (i === 2 ? 0.15 : 0)]} rotation={[0, r, 0]}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color={p.blocks[i % p.blocks.length]} roughness={0.6} />
          </mesh>
        );
      })}
      {/* a ball */}
      <mesh position={[1.9, 0.3, 0.9]}>
        <sphereGeometry args={[0.3, 32, 24]} />
        <meshStandardMaterial color={p.blocks[0]} roughness={0.4} />
      </mesh>
    </group>
  );
};
