import React, { useMemo } from "react";
import * as THREE from "three";
import type { CharacterLook, Emotion } from "../types";
import type { FaceStyle, MouthPose } from "./face";

// A stylised procedural 3D baby built from primitives, sitting on the floor.
// Local units: head radius = 1 (before HEAD_SCALE), head centre = origin, bottom ≈ y -2.62.
// Cartoon proportions: oversized head, huge eyes, a few wisps of hair.
// Later this can be swapped for an MPFB2/Blender GLB with the same `BabyPose` inputs.

export type BabyPose = {
  time: number; // seconds
  mouth: MouthPose;
  style: FaceStyle;
  emotion: Emotion;
  blink: number; // 0 open .. 1 closed
  yaw: number; // head turn (radians, + looks toward +x)
  lookX: number; // eyes -1..1
  amp: number; // speech loudness 0..1 (0 when silent)
  talking: boolean;
  seed: number;
};

export type BabyKind = "boy" | "girl";

const HEAD_SCALE = 1.14;
const SKIN_SHEEN = new THREE.Color("#ffb6a3");
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Vertical alpha gradient so the hair fuzz fades out at its edge instead of looking like a cap. */
const FUZZ_FADE = (() => {
  const n = 64;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1); // 0 = edge of the fuzz, 1 = crown
    const a = Math.round(255 * Math.min(1, Math.pow(v, 0.8) * 1.4));
    data.set([a, a, a, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, 1, n);
  t.needsUpdate = true;
  return t;
})();

function useSkin(color: string) {
  return useMemo(
    () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.7, sheenColor: SKIN_SHEEN, sheenRoughness: 0.6, clearcoat: 0.05 }),
    [color],
  );
}
function useMat(color: string, roughness = 0.7) {
  return useMemo(() => new THREE.MeshStandardMaterial({ color, roughness }), [color, roughness]);
}

/** Position + rotation that puts a flat decal on the head sphere at (x, y), facing outwards. */
function onHead(x: number, y: number, lift = 0.02) {
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  const n = new THREE.Vector3(x, y, z).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, n);
  const e = new THREE.Euler().setFromQuaternion(q);
  const p = n.clone().multiplyScalar(1 + lift);
  return { position: [p.x, p.y, p.z] as [number, number, number], rotation: [e.x, e.y, e.z] as [number, number, number] };
}

/** A thin hair strand as a tube along a smooth curve. */
const Strand: React.FC<{ pts: number[][]; r?: number; material: THREE.Material }> = ({ pts, r = 0.022, material }) => {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return new THREE.TubeGeometry(curve, 28, r, 7, false);
  }, [pts, r]);
  return (
    <group>
      <mesh geometry={geo} material={material} />
      {/* rounded tip */}
      <mesh position={pts[pts.length - 1] as [number, number, number]} material={material}>
        <sphereGeometry args={[r, 8, 6]} />
      </mesh>
    </group>
  );
};

const BOY_STRANDS: number[][][] = [
  // the big curl on top
  [[0, 0.99, 0.08], [0.0, 1.2, 0.16], [0.1, 1.34, 0.08], [0.16, 1.28, -0.04], [0.08, 1.2, -0.04], [0.04, 1.25, 0.04]],
  [[-0.22, 0.97, 0.05], [-0.3, 1.14, 0.1], [-0.44, 1.2, 0.14]],
  [[0.24, 0.96, -0.08], [0.3, 1.14, -0.06], [0.44, 1.18, -0.12]],
  [[-0.06, 0.95, -0.28], [-0.1, 1.13, -0.36], [-0.22, 1.19, -0.32]],
];

const GIRL_STRANDS: number[][][] = [
  // sprout ponytail on top, fanning out like a little fountain
  [[0, 1.0, 0], [0, 1.2, 0.0], [-0.12, 1.4, 0.04], [-0.24, 1.42, 0.06]],
  [[0, 1.0, 0], [0, 1.2, 0.0], [0.12, 1.4, 0.02], [0.25, 1.4, 0.0]],
  [[0, 1.0, 0], [0, 1.22, -0.02], [-0.02, 1.46, -0.06], [-0.1, 1.52, -0.1]],
  [[0, 1.0, 0], [0, 1.22, 0.0], [0.05, 1.46, 0.06], [0.14, 1.5, 0.1]],
  // kiss curl on the forehead
  [[0.02, 0.85, 0.55], [0.04, 0.72, 0.72], [-0.06, 0.62, 0.8], [-0.13, 0.66, 0.76], [-0.09, 0.72, 0.7]],
  // little side wisps
  [[-0.55, 0.8, 0.25], [-0.68, 0.82, 0.35], [-0.76, 0.72, 0.42]],
  [[0.55, 0.8, 0.22], [0.68, 0.8, 0.32], [0.75, 0.7, 0.4]],
];

const Mouth: React.FC<{ m: MouthPose }> = ({ m }) => {
  const smile = THREE.MathUtils.clamp(m.smile, -1, 1);
  const w = 0.12 + 0.09 * m.wide;
  const h = 0.27 * Math.max(0, m.open);
  const cy = smile * 0.055;
  const upperMid = cy * 0.2 + h * 0.22 - Math.max(0, smile) * 0.012;
  const lowerMid = upperMid - (0.024 + h + Math.max(0, smile) * 0.055 * (1 - Math.min(1, h * 6)));

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w, cy);
    s.quadraticCurveTo(0, 2 * upperMid - cy, w, cy);
    s.quadraticCurveTo(0, 2 * lowerMid - cy, -w, cy);
    return s;
  }, [w, cy, upperMid, lowerMid]);

  const showTeeth = m.teeth > 0.3 && h > 0.04;
  const showTongue = m.tongue * m.open > 0.08 && h > 0.06;
  return (
    <group>
      <mesh renderOrder={2}>
        <shapeGeometry args={[shape, 24]} />
        <meshBasicMaterial color="#5c1626" polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {showTongue && (
        <mesh position={[0, lowerMid + h * 0.3, 0.003]} scale={[w * 0.55, Math.max(0.02, h * 0.3), 1]} renderOrder={3}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color="#e86a7d" polygonOffset polygonOffsetFactor={-3} />
        </mesh>
      )}
      {showTeeth &&
        [-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * 0.026, upperMid - 0.018, 0.005]} renderOrder={4}>
            <planeGeometry args={[0.042, Math.min(0.045, h * 0.5)]} />
            <meshBasicMaterial color="#fffaf2" polygonOffset polygonOffsetFactor={-4} />
          </mesh>
        ))}
    </group>
  );
};

const EYE_X = 0.37;
const EYE_Y = 0.04;
const EYE_R = 0.3;

const Eye: React.FC<{ side: -1 | 1; pose: BabyPose; lashes: boolean }> = ({ side, pose, lashes }) => {
  const { style, blink, lookX } = pose;
  const open = Math.max(0.06, style.eyeOpen * (1 - blink));
  const happy = style.happyEyes > 0.5 && blink < 0.5;
  const ix = lookX * 0.06;
  const lashAngles = [0.45, 0.8, 1.15];
  return (
    <group position={[side * EYE_X, EYE_Y, 0.8]} rotation={[0, side * 0.32, 0]}>
      {happy ? (
        <mesh position={[0, -0.03, 0.14]}>
          <torusGeometry args={[0.16, 0.032, 12, 28, Math.PI]} />
          <meshStandardMaterial color="#2a1a12" roughness={0.6} />
        </mesh>
      ) : (
        <group scale={[1, open, 1]}>
          {/* white */}
          <mesh scale={[1, 1.1, 0.55]}>
            <sphereGeometry args={[EYE_R, 36, 28]} />
            <meshStandardMaterial color="#fdfdfb" roughness={0.2} />
          </mesh>
          {/* iris */}
          <mesh position={[ix, -0.01, 0.11]} scale={[1, 1.06, 0.42]}>
            <sphereGeometry args={[0.215, 32, 24]} />
            <meshStandardMaterial color="#5a3420" roughness={0.3} />
          </mesh>
          {/* pupil */}
          <mesh position={[ix, -0.01, 0.17]} scale={[1, 1.05, 0.35]}>
            <sphereGeometry args={[0.13, 24, 16]} />
            <meshStandardMaterial color="#0d0806" roughness={0.15} />
          </mesh>
          {/* sparkles */}
          <mesh position={[ix + 0.075, 0.085, 0.225]}>
            <sphereGeometry args={[0.062, 14, 10]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[ix - 0.06, -0.075, 0.22]}>
            <sphereGeometry args={[0.03, 10, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {lashes &&
            lashAngles.map((a) => (
              <mesh
                key={a}
                position={[side * EYE_R * 0.98 * Math.cos(a), EYE_R * 1.08 * Math.sin(a), 0.06]}
                rotation={[0, 0, side * (a - Math.PI / 2) - side * 0.25]}
              >
                <capsuleGeometry args={[0.014, 0.07, 4, 8]} />
                <meshStandardMaterial color="#2a1a12" roughness={0.6} />
              </mesh>
            ))}
        </group>
      )}
    </group>
  );
};

export const Baby: React.FC<{ kind: BabyKind; look: CharacterLook; pose: BabyPose }> = ({ kind, look, pose }) => {
  const skin = useSkin(look.skin);
  const hair = useMat(look.hair, 0.85);
  const outfit = useMat(look.outfit, 0.9);
  const accent = useMat(look.accent, 0.6);
  const white = useMat("#fdfbf6", 0.9);
  const fuzz = useMemo(
    () => new THREE.MeshStandardMaterial({ color: look.hair, roughness: 1, transparent: true, opacity: 0.45, alphaMap: FUZZ_FADE, depthWrite: false }),
    [look.hair],
  );
  const dimpleColor = useMemo(() => new THREE.Color(look.skin).multiplyScalar(0.55).lerp(new THREE.Color("#a3404c"), 0.3), [look.skin]);
  const { time, style, amp, emotion, seed } = pose;
  const isGirl = kind === "girl";

  const laughShake = emotion === "laughing" ? Math.sin(time * 16) * 0.05 : 0;
  const shiver = emotion === "crying" ? Math.sin(time * 22) * 0.012 : 0;
  const nod = -amp * 0.12 * (0.5 + style.energy * 0.5);
  const headRot: [number, number, number] = [
    nod + Math.sin(time * 1.3 + seed) * 0.03,
    pose.yaw + Math.sin(time * 0.7 + seed) * 0.05,
    style.headTilt * (kind === "boy" ? 1 : -1) + Math.sin(time * 0.9 + seed * 2) * 0.03 + laughShake,
  ];
  const bounce = Math.abs(Math.sin(time * 9)) * amp * 0.06 * style.energy + (emotion === "laughing" ? Math.abs(Math.sin(time * 8)) * 0.05 : 0);
  const breathe = 1 + Math.sin(time * 2.4 + seed) * 0.015;
  const wave = pose.talking ? Math.sin(time * 5 + seed) * 0.25 * style.energy * (0.3 + amp) : Math.sin(time * 1.1 + seed) * 0.04;
  const kick = Math.sin(time * 2 + seed) * 0.06 + (pose.talking ? Math.sin(time * 7 + seed) * 0.05 * amp : 0);
  const browY = 0.5 + style.browLift + (style.eyeOpen - 1) * 0.08;
  const tearFall = (time * 0.55) % 0.45;
  const smile = Math.max(0, pose.mouth.smile);

  const cheek = isGirl
    ? { r: 0.2, color: "#ff7fa6", opacity: 0.5 + style.blush * 0.35 }
    : { r: 0.15, color: "#ff9a9a", opacity: 0.18 + style.blush * 0.4 };
  const dimpleOpacity = Math.min(1, 0.7 + smile * 0.4);

  return (
    <group position={[shiver, bounce, 0]}>
      {/* shadow on the floor */}
      <mesh position={[0, -2.6, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.45, 32]} />
        <meshBasicMaterial color="#000" transparent opacity={0.14} depthWrite={false} />
      </mesh>

      {/* chubby sitting body */}
      <group scale={[1, breathe, 1]}>
        <mesh position={[0, -1.68, 0]} scale={[0.95, 0.94, 0.85]} material={outfit}>
          <sphereGeometry args={[1, 40, 28]} />
        </mesh>
        <mesh position={[0, -0.95, 0.02]} rotation={[Math.PI / 2 - 0.15, 0, 0]} material={isGirl ? accent : white}>
          <torusGeometry args={[0.42, 0.08, 12, 32]} />
        </mesh>
        {kind === "boy" ? (
          <mesh position={[0, -1.55, 0.84]} rotation={[Math.PI / 2, 0, 0.3]} material={white}>
            <cylinderGeometry args={[0.17, 0.17, 0.02, 5]} />
          </mesh>
        ) : (
          <mesh position={[0, -1.55, 0.85]} material={accent}>
            <sphereGeometry args={[0.09, 16, 12]} />
          </mesh>
        )}
      </group>
      {/* arms */}
      {([-1, 1] as const).map((sx) => (
        <group key={sx} position={[sx * 0.8, -1.2, 0.1]} rotation={[0.55, 0, sx * (0.5 + (sx === 1 ? wave : -wave * 0.6))]}>
          <mesh position={[0, -0.38, 0]} material={outfit}>
            <capsuleGeometry args={[0.21, 0.42, 8, 16]} />
          </mesh>
          <mesh position={[0, -0.78, 0.02]} material={skin}>
            <sphereGeometry args={[0.21, 20, 16]} />
          </mesh>
        </group>
      ))}
      {/* legs stretched forward, feet up */}
      {([-1, 1] as const).map((sx) => (
        <group key={sx} position={[sx * 0.45, -2.3, 0.45]} rotation={[Math.PI / 2 - 0.05 + (sx === 1 ? kick : -kick), 0, sx * -0.3]}>
          <mesh position={[0, 0.25, 0]} material={outfit}>
            <capsuleGeometry args={[0.28, 0.45, 8, 16]} />
          </mesh>
          <mesh position={[0, 0.7, -0.12]} scale={[1, 0.8, 1.3]} material={white}>
            <sphereGeometry args={[0.25, 20, 16]} />
          </mesh>
        </group>
      ))}

      {/* head */}
      <group rotation={headRot} scale={HEAD_SCALE}>
        <mesh material={skin}>
          <sphereGeometry args={[1, 64, 48]} />
        </mesh>
        {/* ears */}
        {([-1, 1] as const).map((sx) => (
          <mesh key={sx} position={[sx * 0.97, -0.06, 0]} scale={[0.42, 1, 0.75]} material={skin}>
            <sphereGeometry args={[0.22, 20, 16]} />
          </mesh>
        ))}
        {/* button nose */}
        <mesh position={[0, -0.2, 0.975]} scale={[1.25, 0.9, 0.8]} material={skin}>
          <sphereGeometry args={[0.075, 20, 16]} />
        </mesh>
        {/* cheeks */}
        {([-1, 1] as const).map((sx) => {
          const t = onHead(sx * 0.6, -0.33, 0.025);
          return (
            <mesh key={sx} position={t.position} rotation={t.rotation} scale={[1.2, 0.85, 1]} renderOrder={1}>
              <circleGeometry args={[cheek.r, 32]} />
              <meshBasicMaterial color={cheek.color} transparent opacity={cheek.opacity} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
          );
        })}
        {/* dimples (boy) */}
        {!isGirl &&
          ([-1, 1] as const).map((sx) => {
            const t = onHead(sx * 0.31, -0.47, 0.02);
            return (
              <mesh key={sx} position={t.position} rotation={t.rotation} scale={[0.75, 1.15, 1]} renderOrder={2}>
                <circleGeometry args={[0.05, 20]} />
                <meshBasicMaterial color={dimpleColor} transparent opacity={dimpleOpacity} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
              </mesh>
            );
          })}
        <Eye side={-1} pose={pose} lashes={isGirl} />
        <Eye side={1} pose={pose} lashes={isGirl} />
        {/* thin brows */}
        {([-1, 1] as const).map((sx) => {
          const x = sx * EYE_X;
          const z = Math.sqrt(Math.max(0, 1 - x * x - browY * browY)) + 0.015;
          return (
            <mesh key={sx} position={[x, browY, z]} rotation={[-0.5, sx * 0.35, Math.PI / 2 + sx * style.browTilt * 0.7]} material={hair}>
              <capsuleGeometry args={[0.02, 0.16, 6, 12]} />
            </mesh>
          );
        })}
        {/* mouth, placed on the sphere surface and tilted to its normal */}
        <group position={[0, -0.47, 0.888]} rotation={[0.5, 0, 0]}>
          <Mouth m={pose.mouth} />
        </group>
        {/* tears */}
        {style.tears > 0.05 &&
          ([-1, 1] as const).map((sx) => (
            <mesh key={sx} position={[sx * 0.46, -0.22 - tearFall, 0.84 - tearFall * 0.3]} scale={[1, 1.4, 1]}>
              <sphereGeometry args={[0.06, 12, 10]} />
              <meshStandardMaterial color="#8fd3ff" transparent opacity={style.tears * (1 - tearFall / 0.45)} roughness={0.1} />
            </mesh>
          ))}

        {/* hair: a faint fuzz plus a few thin wisps */}
        <mesh material={fuzz} renderOrder={1}>
          <sphereGeometry args={[1.006, 48, 24, 0, Math.PI * 2, 0, isGirl ? 0.95 : 0.85]} />
        </mesh>
        {(isGirl ? GIRL_STRANDS : BOY_STRANDS).map((pts, i) => (
          <Strand key={i} pts={pts} material={hair} r={isGirl ? 0.02 : 0.024} />
        ))}
        {isGirl && (
          <group position={[0, 1.2, 0.03]}>
            {([-1, 1] as const).map((sx) => (
              <mesh key={sx} position={[sx * 0.13, 0, 0]} rotation={[0, 0, sx * 0.45]} scale={[1, 0.62, 0.45]} material={accent}>
                <sphereGeometry args={[0.14, 20, 16]} />
              </mesh>
            ))}
            <mesh material={accent}>
              <sphereGeometry args={[0.06, 14, 12]} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
};
