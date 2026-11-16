// All art for Kitty Cup Run, built in code from three.js shapes and canvas drawings. Cats face +z in model space.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gateGood, gateText, TRACK_HALF, type Gate } from './levels';
import { TRAP_MOVE, type TrapKind, type WorldId } from './data';

const W = TRACK_HALF;
export const TRACK_LEN = 540;
const Z0 = 40; // the track starts this far behind the start line

// ---------------- Geometry helpers ----------------
const sph = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const cone = (r: number, h: number, s = 6) => new THREE.ConeGeometry(r, h, s);
const cyl = (a: number, b: number, h: number, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cap = (r: number, l: number, s = 8) => new THREE.CapsuleGeometry(r, l, 3, s);

/** Places a shape and paints it one colour. `glow` makes the colour brighter than white so bloom picks it up. */
function part(g0: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, glow = 1) {
  const g = g0.index ? g0.toNonIndexed() : g0;
  g.scale(sx, sy, sz);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.translate(x, y, z);
  const c = new THREE.Color(color).multiplyScalar(glow);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;

export const propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const smoothMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
for (const m of [propMat, smoothMat, glowMat]) m.userData.shared = true;

/** Frees GPU memory of everything under `root` except shared materials and geometries. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.geometry) return;
    if (!m.geometry.userData.shared) m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mat.userData.shared) continue;
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------- Cats ----------------
// Vertex data: aPart picks the tint (0 fixed, 1 jersey, 2 fur, 3 trim); aLimb = (kind, pivot y, pivot z) drives the run cycle
// in the vertex shader (1/2 legs, 3 tail, 4/5 arms). Only the number patch on the back has real uv.

function cpart(g0: THREE.BufferGeometry, color: string, tint: number, limb: [number, number, number] | 0, ...tf: number[]) {
  const isNum = tint < 0;
  const g = part(g0, color, ...tf);
  const n = g.attributes.position.count;
  const p = new Float32Array(n).fill(Math.max(0, tint));
  const l = new Float32Array(n * 3);
  if (limb) for (let i = 0; i < n; i++) l.set(limb, i * 3);
  g.setAttribute('aPart', new THREE.BufferAttribute(p, 1));
  g.setAttribute('aLimb', new THREE.BufferAttribute(l, 3));
  if (!isNum) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
  return g;
}

/** One merged cat. lod 0 = team cats, lod 1 = simple fans in the stands. */
export function catGeometry(lod: 0 | 1): THREE.BufferGeometry {
  const wh = '#ffffff';
  const s = lod ? 0.6 : 1;
  const S = (r: number, a = 10, b = 8) => sph(r, Math.max(5, Math.round(a * s)), Math.max(4, Math.round(b * s)));
  const legA: [number, number, number] = [1, 0.2, 0];
  const legB: [number, number, number] = [2, 0.2, 0];
  const tail: [number, number, number] = [3, 0, -0.14];
  const armA: [number, number, number] = [4, 0.43, 0];
  const armB: [number, number, number] = [5, 0.43, 0];
  const pink = '#ff9db8';
  const parts = [
    cpart(cap(0.165, 0.1, lod ? 6 : 10), wh, 1, 0, 0, 0.32, 0), // jersey body
    cpart(S(0.17), wh, 3, 0, 0, 0.21, 0, 1, 0.55, 1), // shorts
    cpart(S(0.235, 14, 10), wh, 2, 0, 0, 0.7, 0.01, 1.14, 0.96, 1), // head
    cpart(cone(0.085, 0.17, 4), wh, 2, 0, -0.15, 0.9, 0, 1, 1, 0.7, 0, 0.4),
    cpart(cone(0.085, 0.17, 4), wh, 2, 0, 0.15, 0.9, 0, 1, 1, 0.7, 0, -0.4),
    cpart(cap(0.055, 0.1, 6), wh, 2, legA, -0.09, 0.12, 0),
    cpart(cap(0.055, 0.1, 6), wh, 2, legB, 0.09, 0.12, 0),
    cpart(cap(0.05, 0.12, 6), wh, 2, armA, -0.22, 0.35, 0, 1, 1, 1, 0, -0.25),
    cpart(cap(0.05, 0.12, 6), wh, 2, armB, 0.22, 0.35, 0, 1, 1, 1, 0, 0.25),
    cpart(cap(0.042, 0.2, 6), wh, 2, tail, 0, 0.3, -0.26, 1, 1, 1, -1.0),
    // face
    cpart(S(0.05, 8, 6), '#2a2235', 0, 0, -0.09, 0.72, 0.205, 1, 1.25, 0.6),
    cpart(S(0.05, 8, 6), '#2a2235', 0, 0, 0.09, 0.72, 0.205, 1, 1.25, 0.6),
    cpart(S(0.09, 8, 6), '#fff7ee', 0, 0, 0, 0.62, 0.17, 1.25, 0.72, 0.8),
    cpart(S(0.03, 6, 4), pink, 0, 0, 0, 0.655, 0.245),
  ];
  if (!lod) {
    parts.push(
      cpart(cap(0.042, 0.14, 6), wh, 2, tail, 0, 0.5, -0.36, 1, 1, 1, -0.25),
      cpart(sph(0.055, 6, 5), '#fff7ee', 0, tail, 0, 0.6, -0.375),
      cpart(sph(0.07, 6, 5), wh, 3, legA, -0.09, 0.045, 0.03, 1, 0.8, 1.3), // boots
      cpart(sph(0.07, 6, 5), wh, 3, legB, 0.09, 0.045, 0.03, 1, 0.8, 1.3),
      cpart(sph(0.085, 6, 5), wh, 3, 0, -0.17, 0.42, 0), // sleeves
      cpart(sph(0.085, 6, 5), wh, 3, 0, 0.17, 0.42, 0),
      cpart(sph(0.018, 4, 3), wh, 0, 0, -0.075, 0.745, 0.245),
      cpart(sph(0.018, 4, 3), wh, 0, 0, 0.105, 0.745, 0.245),
      cpart(sph(0.045, 6, 4), '#ffb3c4', 0, 0, -0.17, 0.64, 0.15, 1, 0.6, 0.5),
      cpart(sph(0.045, 6, 4), '#ffb3c4', 0, 0, 0.17, 0.64, 0.15, 1, 0.6, 0.5),
      cpart(cone(0.045, 0.09, 4), pink, 0, 0, -0.15, 0.89, 0.03, 1, 1, 0.5, 0, 0.4),
      cpart(cone(0.045, 0.09, 4), pink, 0, 0, 0.15, 0.89, 0.03, 1, 1, 0.5, 0, -0.4),
      cpart(new THREE.TorusGeometry(0.115, 0.025, 4, 10), wh, 3, 0, 0, 0.47, 0, 1, 1, 1, Math.PI / 2),
      cpart(new THREE.PlaneGeometry(0.2, 0.2).rotateY(Math.PI), wh, -1, 0, 0, 0.34, -0.172),
    );
  }
  const g = merge(parts);
  g.userData.shared = true;
  return g;
}

/** Jersey numbers 1-15 in a 4x4 sheet; the last cell is plain white for everything that is not a number. */
function numberAtlas() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(192, 0, 64, 64);
    g.font = '900 50px system-ui, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 15; i++) g.fillText(String(i + 1), (i % 4) * 64 + 32, (3 - Math.floor(i / 4)) * 64 + 35);
  });
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export interface CatUniforms { uTime: { value: number }; uCheer: { value: number } }
/** Lit cat material with per-cat colours, jersey numbers, and a run cycle, all in the vertex shader. */
export function catMaterial(): THREE.MeshLambertMaterial & { userData: { u: CatUniforms } } {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: numberAtlas(), alphaTest: 0.5 });
  const u: CatUniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
  m.userData.u = u;
  m.userData.shared = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.uniforms.uCheer = u.uCheer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uCheer;
attribute float aPart; attribute vec3 aLimb; attribute vec3 aJersey; attribute vec3 aTrim; attribute vec3 aFur; attribute vec4 aAnim;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = uv.x < 0.0 ? vec2(0.9, 0.9) : (uv + vec2(mod(aAnim.w, 4.0), floor(aAnim.w / 4.0))) * 0.25;
#endif`)
      .replace('#include <color_vertex>', `#include <color_vertex>
  vColor.rgb *= aPart < 0.5 ? vec3(1.0) : aPart < 1.5 ? aJersey : aPart < 2.5 ? aFur : aTrim;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    float ph = uTime * 12.0 + aAnim.x;
    float run = max(aAnim.y, 0.0);
    float k = aLimb.x;
    if (k > 0.5) {
      if (k < 2.5 || k > 3.5) {
        float sgn = (k < 1.5 || k > 4.5) ? 1.0 : -1.0;
        float a = sgn * sin(ph) * run * 0.9;
        if (k > 3.5) a -= smoothstep(0.15, 0.3, aAnim.z) * 2.6;
        float c = cos(a); float s = sin(a);
        vec2 q = transformed.yz - vec2(aLimb.y, aLimb.z);
        transformed.yz = vec2(aLimb.y, aLimb.z) + vec2(q.x * c - q.y * s, q.x * s + q.y * c);
      } else {
        float a = sin(ph * 0.4) * 0.5;
        float c = cos(a); float s = sin(a);
        float qz = transformed.z - aLimb.z;
        float x0 = transformed.x;
        transformed.x = x0 * c + qz * s;
        transformed.z = aLimb.z + qz * c - x0 * s;
      }
    }
    float hop = aAnim.y < 0.0
      ? pow(max(0.0, sin(uTime * 4.0 - aAnim.x)), 8.0) * (0.25 + uCheer) + uCheer * abs(sin(ph * 0.6)) * 0.6
      : abs(sin(ph));
    transformed.y += hop * aAnim.z;
  }`);
  };
  return m as THREE.MeshLambertMaterial & { userData: { u: CatUniforms } };
}

/** An instanced cat mesh with the per-cat attributes the cat shader reads. */
export function catMesh(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number) {
  const g = geo.clone();
  const attr = (name: string, size: number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
    return a;
  };
  const jersey = attr('aJersey', 3);
  const trim = attr('aTrim', 3);
  const fur = attr('aFur', 3);
  const anim = attr('aAnim', 4);
  const mesh = new THREE.InstancedMesh(g, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  return { mesh, jersey, trim, fur, anim };
}
export type CatMesh = ReturnType<typeof catMesh>;

// ---------------- Looks: one palette per world, re-lit per league ----------------
export interface Look {
  skyTop: THREE.Color; skyLow: THREE.Color; ground: string; track: [string, string]; line: string; kerb: string;
  hemi: number; sun: number; sunColor: THREE.Color; night: number; // night 0..1: how much glow and how many stars
}
const BASE: Record<WorldId, { top: string; low: string; ground: string; track: [string, string]; line: string; kerb: string; night?: number }> = {
  field: { top: '#4aa3ff', low: '#c9ecff', ground: '#7fcf62', track: ['#58b548', '#69c457'], line: '#ffffff', kerb: '#ff5d8f' },
  snow: { top: '#6fb2ff', low: '#e6f3ff', ground: '#f4f8ff', track: ['#d3e4f5', '#e4eefa'], line: '#7fb2e8', kerb: '#4aa8ff' },
  beach: { top: '#2fb8ff', low: '#c8f4ff', ground: '#f6dca0', track: ['#f0cb80', '#f7d994'], line: '#ffffff', kerb: '#17b3b0' },
  canyon: { top: '#4a9cf0', low: '#ffe2c0', ground: '#e09a62', track: ['#c97a4a', '#d68855'], line: '#fff0d8', kerb: '#c2452d' },
  desert: { top: '#58b0ff', low: '#fff0c8', ground: '#f2d28a', track: ['#e2b866', '#edc676'], line: '#ffffff', kerb: '#8a5fd0' },
  candy: { top: '#ff9fd6', low: '#fff0fa', ground: '#ffd0ec', track: ['#ff9fca', '#ffb3d6'], line: '#ffffff', kerb: '#b58cff' },
  city: { top: '#1a1648', low: '#7a4ab8', ground: '#2a2a48', track: ['#3a3a5c', '#44446a'], line: '#22e0d0', kerb: '#ff4ab8', night: 0.8 },
  castle: { top: '#2a1a5a', low: '#c86a9a', ground: '#4a6a4a', track: ['#6a6a80', '#77778c'], line: '#ffcf3a', kerb: '#7a2ad0', night: 0.6 },
};
const LEAGUE_SKY: [string, string, number, string, number, number, number][] = [
  // top, low, blend, sun colour, sun strength, sky-light strength, night
  ['#000000', '#000000', 0, '#fff1d6', 2.1, 1.25, 0],
  ['#4a4ab0', '#ffa066', 0.75, '#ffb070', 2.0, 1.0, 0.25],
  ['#070b2a', '#27408a', 0.9, '#a8c4ff', 1.2, 0.8, 1],
  ['#3a1470', '#ff7ac8', 0.8, '#ffe0f8', 1.7, 1.1, 0.7],
];
export function lookFor(world: WorldId, league: number): Look {
  const b = BASE[world];
  const [top, low, k, sunC, sun, hemi, night] = LEAGUE_SKY[league];
  return {
    skyTop: new THREE.Color(b.top).lerp(new THREE.Color(top), k),
    skyLow: new THREE.Color(b.low).lerp(new THREE.Color(low), k),
    ground: b.ground, track: b.track, line: b.line, kerb: b.kerb,
    hemi: league === 0 && b.night ? 1.15 : hemi, sun: league === 0 && b.night ? 1.5 : sun,
    sunColor: new THREE.Color(league === 0 && b.night ? '#c8b8ff' : sunC), night: Math.max(night, b.night ?? 0),
  };
}

// ---------------- Scenery props ----------------
type Proto = { geo: THREE.BufferGeometry; glow?: THREE.BufferGeometry };
const tree = (leaf: string, capCol?: string): Proto => ({
  geo: merge([
    part(cyl(0.2, 0.28, 1, 6), '#8a5a3c', 0, 0.5, 0),
    part(cone(1.25, 1.7, 7), leaf, 0, 1.7, 0),
    part(cone(0.95, 1.5, 7), leaf, 0, 2.6, 0),
    part(cone(0.6, 1.2, 7), capCol ?? leaf, 0, 3.4, 0),
  ]),
});
const PROTOS: Record<string, () => Proto> = {
  pine: () => tree('#2f8f57'),
  darkpine: () => tree('#28584a'),
  snowpine: () => tree('#5f9e86', '#ffffff'),
  round: () => ({ geo: merge([part(cyl(0.22, 0.3, 1.4, 6), '#8a5a3c', 0, 0.7, 0), part(new THREE.IcosahedronGeometry(1.3, 1), '#4fb85a', 0, 2.3, 0), part(new THREE.IcosahedronGeometry(0.8, 1), '#6cd070', 0.7, 2.9, 0.3)]) }),
  snowman: () => ({ geo: merge([part(sph(0.7), '#ffffff', 0, 0.6, 0), part(sph(0.5), '#ffffff', 0, 1.5, 0), part(cone(0.1, 0.4, 5), '#ff8a3d', 0, 1.5, 0.55, 1, 1, 1, Math.PI / 2), part(cyl(0.3, 0.3, 0.4, 8), '#3a3a5c', 0, 2.1, 0), part(cyl(0.5, 0.5, 0.06, 8), '#3a3a5c', 0, 1.93, 0)]) }),
  palm: () => ({ geo: merge([part(cyl(0.16, 0.26, 4, 6), '#a87a4f', 0.2, 2, 0, 1, 1, 1, 0, -0.1), ...[0, 1, 2, 3, 4, 5].map((i) => part(cone(0.45, 2.2, 4), i % 2 ? '#3fbf6a' : '#2fa35a', 0.4 + Math.cos(i * 1.05) * 0.95, 3.9, Math.sin(i * 1.05) * 0.95, 1, 1, 0.35, Math.sin(i * 1.05) * 1.2, -Math.cos(i * 1.05) * 1.2)), part(sph(0.22, 6, 5), '#7a4a2a', 0.4, 3.9, 0.2)]) }),
  umbrella: () => ({ geo: merge([part(cyl(0.05, 0.05, 2.2, 5), '#ffffff', 0, 1.1, 0), part(cone(1.4, 0.6, 8), '#ff5d8f', 0, 2.3, 0), part(box(1.6, 0.12, 0.8), '#4aa8ff', 0.3, 0.25, 0.9), part(sph(0.4, 8, 6), '#ffd84a', -1.2, 0.4, 0.6)]) }),
  mesa: () => ({ geo: merge([part(cyl(1.5, 2, 2.4, 7), '#c9603a', 0, 1.2, 0), part(cyl(1.2, 1.5, 0.5, 7), '#e08a52', 0, 2.6, 0), part(cyl(0.7, 1, 1.4, 6), '#b8502e', 1.7, 0.7, 0.6)]) }),
  rock: () => ({ geo: merge([part(new THREE.IcosahedronGeometry(0.8, 0), '#9a8a80', 0, 0.4, 0, 1.2, 0.8, 1), part(new THREE.IcosahedronGeometry(0.45, 0), '#b0a096', 0.8, 0.25, 0.3)]) }),
  cactus: () => ({ geo: merge([part(cap(0.3, 1.6), '#3fa860', 0, 1.1, 0), part(cap(0.18, 0.6), '#3fa860', -0.6, 1.5, 0), part(cap(0.18, 0.4), '#3fa860', 0.6, 1.2, 0), part(cap(0.18, 0.3, 6), '#3fa860', -0.4, 1.15, 0, 1, 1, 1, 0, Math.PI / 2), part(cap(0.18, 0.3, 6), '#3fa860', 0.4, 0.95, 0, 1, 1, 1, 0, Math.PI / 2), part(sph(0.14, 6, 5), '#ff7ab8', 0, 2.25, 0)]) }),
  pyramid: () => ({ geo: merge([part(cone(2.2, 2.6, 4), '#e8c070', 0, 1.3, 0), part(cone(0.5, 0.6, 4), '#ffe9a0', 0, 2.75, 0)]) }),
  lolly: () => ({ geo: merge([part(cyl(0.08, 0.08, 2.6, 6), '#ffffff', 0, 1.3, 0), part(cyl(0.9, 0.9, 0.25, 14), '#ff6fb5', 0, 3.1, 0, 1, 1, 1, Math.PI / 2), part(new THREE.TorusGeometry(0.55, 0.1, 5, 14), '#ffffff', 0, 3.1, 0.13), part(new THREE.TorusGeometry(0.25, 0.09, 5, 10), '#ffffff', 0, 3.1, 0.13)]) }),
  cupcake: () => ({ geo: merge([part(cyl(0.9, 0.65, 0.9, 10), '#c98b5a', 0, 0.45, 0), part(sph(0.95, 10, 6), '#fff0fa', 0, 1.1, 0, 1, 0.6, 1), part(sph(0.7, 10, 6), '#ff9fd6', 0, 1.55, 0, 1, 0.6, 1), part(sph(0.2, 6, 5), '#ff3a5a', 0, 2.05, 0)]) }),
  building: () => ({
    geo: merge([part(box(2.6, 7, 2.6), '#34345a', 0, 3.5, 0), part(box(2.2, 0.5, 2.2), '#4a4a78', 0, 7.25, 0), part(cyl(0.05, 0.05, 1.4, 4), '#8a8ab0', 0.6, 8.2, 0.5)]),
    glow: merge([0, 1, 2, 3, 4].flatMap((r) => [-0.7, 0.15].map((x, c) => part(box(0.55, 0.6, 0.08), (r + c) % 3 ? '#ffe08a' : '#7fe0ff', x + 0.27, 1 + r * 1.25, 1.31, 1, 1, 1, 0, 0, 1.6))).concat(part(sph(0.12, 5, 4), '#ff4a6a', 0.6, 8.95, 0.5, 1, 1, 1, 0, 0, 3))),
  }),
  lamp: () => ({ geo: merge([part(cyl(0.07, 0.1, 3.4, 5), '#5a5a80', 0, 1.7, 0), part(box(0.9, 0.08, 0.08), '#5a5a80', 0.4, 3.4, 0)]), glow: part(sph(0.22, 6, 5), '#ffe9a0', 0.8, 3.3, 0, 1, 1, 1, 0, 0, 2.6) }),
  tower: () => ({
    geo: merge([part(cyl(1.1, 1.3, 5, 8), '#9a94b0', 0, 2.5, 0), part(cyl(1.4, 1.4, 0.6, 8), '#8a84a0', 0, 5.2, 0), part(cone(1.5, 2, 8), '#7a2ad0', 0, 6.5, 0), part(cyl(0.04, 0.04, 1, 4), '#ffffff', 0, 7.9, 0), part(box(0.7, 0.4, 0.04), '#ffcf3a', 0.36, 8.15, 0)]),
    glow: merge([part(box(0.35, 0.6, 0.1), '#ffb84a', 0, 3.6, 1.18, 1, 1, 1, 0, 0, 2), part(box(0.35, 0.6, 0.1), '#ffb84a', 0, 1.8, 1.26, 1, 1, 1, 0, 0, 2)]),
  }),
  tent: () => ({ geo: merge([part(cyl(1.5, 1.5, 1.4, 8), '#ffffff', 0, 0.7, 0), part(cone(1.9, 1.3, 8), '#ff5d8f', 0, 2.05, 0), part(sph(0.18, 6, 5), '#ffd84a', 0, 2.8, 0), part(sph(0.45, 8, 6), '#4aa8ff', 2, 2.2, 0.3), part(sph(0.45, 8, 6), '#ffd84a', 2.5, 2.7, -0.2), part(sph(0.45, 8, 6), '#2fd39a', 1.7, 2.9, -0.3), part(cyl(0.02, 0.02, 2.4, 3), '#ffffff', 2.05, 1.3, 0)]) }),
  mountain: () => ({ geo: merge([part(cone(1, 1.4, 6), '#8c9bb5', 0, 0.7, 0), part(cone(0.43, 0.6, 6), '#ffffff', 0, 1.11, 0)]) }),
  dune: () => ({ geo: part(sph(1, 8, 5), '#e8c070', 0, 0, 0, 1.6, 0.5, 1) }),
  island: () => ({ geo: merge([part(sph(1, 8, 5), '#e8d090', 0, 0, 0, 1.4, 0.3, 1.4), part(sph(0.8, 8, 5), '#3fbf6a', 0, 0.3, 0, 1, 0.7, 1)]) }),
  butte: () => ({ geo: merge([part(cyl(0.7, 1, 1.2, 7), '#c2603a', 0, 0.6, 0), part(cyl(0.72, 0.72, 0.15, 7), '#e8a070', 0, 0.9, 0)]) }),
  icecream: () => ({ geo: merge([part(cone(1, 1.3, 8), '#fff0c8', 0, 0.65, 0), part(cone(0.6, 0.6, 8), '#ff9fd6', 0, 1.2, 0), part(sph(0.12, 5, 4), '#ff3a5a', 0, 1.52, 0)]) }),
  skyscraper: () => ({ geo: part(box(1, 2.4, 1), '#24244a', 0, 1.2, 0), glow: merge([0.5, 0.9, 1.3, 1.7, 2.1].map((y, i) => part(box(0.7, 0.06, 0.05), i % 2 ? '#ff4ab8' : '#22e0d0', 0, y, 0.51, 1, 1, 1, 0, 0, 1.5))) }),
  keep: () => ({ geo: merge([part(box(2, 1.2, 1), '#7a748f', 0, 0.6, 0), part(cyl(0.35, 0.4, 2, 8), '#8a84a0', -1, 1, 0), part(cyl(0.35, 0.4, 2, 8), '#8a84a0', 1, 1, 0), part(cone(0.45, 0.7, 8), '#7a2ad0', -1, 2.3, 0), part(cone(0.45, 0.7, 8), '#7a2ad0', 1, 2.3, 0)]) }),
  flower: () => ({ geo: merge([part(sph(0.5, 6, 4), '#ffd84a', 0, 0.5, 0), part(sph(0.5, 6, 4), '#ff8fbf', 2, 0.5, 1), part(sph(0.5, 6, 4), '#ffffff', -1, 0.5, 2), part(sph(0.5, 6, 4), '#b58cff', 1, 0.5, -2)]) }),
  gumdrop: () => ({ geo: merge([part(sph(1, 8, 5), '#7fe0a0', 0, 0, 0, 1, 1.1, 1), part(sph(1, 8, 5), '#ffd84a', 3, 0, 1, 0.8, 0.9, 0.8), part(sph(1, 8, 5), '#b58cff', -2, 0, 2, 0.7, 0.8, 0.7)]) }),
  torch: () => ({ geo: part(cyl(0.3, 0.4, 3, 5), '#5a4a3a', 0, 1.5, 0), glow: part(cone(0.9, 2, 5), '#ffa03a', 0, 4, 0, 1, 1, 1, 0, 0, 2.4) }),
};
// near A, near B, small scatter, far backdrop
const SCENERY: Record<WorldId, [string, string, string, string]> = {
  field: ['round', 'pine', 'flower', 'mountain'], snow: ['snowpine', 'snowman', 'rock', 'mountain'], beach: ['palm', 'umbrella', 'rock', 'island'],
  canyon: ['mesa', 'pine', 'rock', 'butte'], desert: ['cactus', 'palm', 'dune', 'pyramid'], candy: ['lolly', 'cupcake', 'gumdrop', 'icecream'],
  city: ['building', 'lamp', 'rock', 'skyscraper'], castle: ['tower', 'darkpine', 'torch', 'keep'],
};

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
export function mat4(x: number, y: number, z: number, s: number, sy = s, ry = 0, sz = s) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(0, ry, 0)), new THREE.Vector3(s, sy, sz));
}
function instanced(geom: THREE.BufferGeometry, material: THREE.Material, mats: THREE.Matrix4[], shadow = false) {
  const m = new THREE.InstancedMesh(geom, material, mats.length);
  mats.forEach((x, i) => m.setMatrixAt(i, x));
  m.frustumCulled = false;
  m.castShadow = shadow;
  return m;
}
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const mesh = (g: THREE.BufferGeometry, m: THREE.Material = propMat) => new THREE.Mesh(g, m);

function bannerTexture(night: number) {
  const cols = ['#ff5d8f', '#4aa8ff', '#ffc93c', '#2fd39a', '#9b6bff', '#ff8a3d'];
  const words = ['GO CATS!', 'KITTY CUP', 'MEOW!', 'PURR-FECT', 'GOAL!', 'PAWS UP'];
  const t = canvasTex(1536, 64, (g) => {
    words.forEach((w, i) => {
      g.fillStyle = cols[i];
      g.fillRect(i * 256, 0, 256, 64);
      g.fillStyle = '#ffffff';
      g.fillRect(i * 256, 0, 256, 5);
      g.fillRect(i * 256 + 252, 0, 4, 64);
      g.font = '900 34px system-ui, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(w, i * 256 + 140, 36);
      // paw print
      g.beginPath();
      g.arc(i * 256 + 30, 40, 9, 0, 7);
      for (const [dx, dy] of [[-11, -12], [0, -17], [11, -12]]) g.arc(i * 256 + 30 + dx, 40 + dy, 4.5, 0, 7);
      g.fill();
    });
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = TRACK_LEN / 36;
  return new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.15 + night * 0.55 });
}

/** Scenery for one world in one league's light: sky, ground, track, boards, arches, props. */
export function buildWorld(id: WorldId, league: number, low: boolean) {
  const look = lookFor(id, league);
  const g = new THREE.Group();
  const zMid = Z0 - TRACK_LEN / 2;

  // Sky dome with a soft gradient; it follows the camera.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(380, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: look.skyTop }, low: { value: look.skyLow } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 low; varying float h; void main(){ gl_FragColor = vec4(mix(low, top, smoothstep(0.0, 0.55, h)), 1.0); \n#include <colorspace_fragment>\n }',
    }),
  );
  sky.renderOrder = -10;
  const follow = new THREE.Group(); // moves with the camera: sky, sun, stars, clouds
  follow.add(sky);
  const sunDisc = mesh(new THREE.CircleGeometry(look.night > 0.8 ? 9 : 14, 24), new THREE.MeshBasicMaterial({ color: look.sunColor.clone().multiplyScalar(look.night > 0.8 ? 1.4 : 2.2), fog: false }));
  sunDisc.position.set(-90, 95, -300);
  sunDisc.lookAt(0, 0, 0);
  follow.add(sunDisc);
  const r = seeded(id.length * 31 + league * 7 + 3);
  if (look.night > 0.2) {
    const n = Math.round(260 * look.night);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28;
      const e = 0.08 + r() * 1.2;
      pos.set([Math.cos(a) * Math.cos(e) * 360, Math.sin(e) * 360, Math.sin(a) * Math.cos(e) * 360], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    follow.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(2, 2, 2.4), size: 2.2, sizeAttenuation: false, fog: false })));
  }
  if (league === 3) {
    // Legends League: a rainbow over the pitch.
    ['#ff5d6c', '#ffb03a', '#ffe94a', '#5ae08a', '#4ab8ff', '#b58cff'].forEach((c, i) => {
      const arc = mesh(new THREE.TorusGeometry(230 - i * 7, 3.5, 4, 40, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.15), fog: false, transparent: true, opacity: 0.75 }));
      arc.position.set(0, -20, -330);
      follow.add(arc);
    });
  }
  const cloudCol = new THREE.Color('#ffffff').lerp(look.skyLow, 0.35 + look.night * 0.45);
  const clouds = instanced(merge([part(sph(1, 8, 6), '#ffffff', 0, 0, 0, 1.6, 0.7, 1), part(sph(1, 8, 6), '#ffffff', 1.5, -0.1, 0.2, 1.2, 0.55, 0.9), part(sph(1, 8, 6), '#ffffff', -1.4, -0.15, 0, 1.1, 0.5, 0.8)]),
    new THREE.MeshBasicMaterial({ color: cloudCol, fog: false, transparent: true, opacity: 0.9 }),
    Array.from({ length: 16 }, () => mat4((r() - 0.5) * 500, 50 + r() * 60, -80 - r() * 260, 8 + r() * 12)));
  follow.add(clouds);
  g.add(follow);

  const ground = mesh(new THREE.PlaneGeometry(900, TRACK_LEN + 500), new THREE.MeshLambertMaterial({ color: look.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, zMid);
  ground.receiveShadow = true;
  g.add(ground);

  // Track: mown stripes, side lines, centre dashes.
  const tex = canvasTex(128, 128, (c) => {
    c.fillStyle = look.track[0];
    c.fillRect(0, 0, 128, 64);
    c.fillStyle = look.track[1];
    c.fillRect(0, 64, 128, 64);
    c.fillStyle = look.line;
    c.fillRect(0, 0, 4, 128);
    c.fillRect(124, 0, 4, 128);
    c.globalAlpha = 0.5;
    c.fillRect(62, 16, 4, 32);
    c.fillRect(62, 80, 4, 32);
  });
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, TRACK_LEN / 10);
  tex.anisotropy = 4;
  const side = new THREE.MeshLambertMaterial({ color: look.track[0] });
  const track = mesh(box(W * 2 + 0.4, 0.3, TRACK_LEN), [side, side, new THREE.MeshLambertMaterial({ map: tex }), side, side, side] as unknown as THREE.Material);
  track.position.set(0, -0.15, zMid);
  track.receiveShadow = true;
  g.add(track);
  const kerbTex = canvasTex(8, 64, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 8, 64);
    c.fillStyle = look.kerb;
    c.fillRect(0, 0, 8, 32);
  });
  kerbTex.wrapT = THREE.RepeatWrapping;
  kerbTex.repeat.y = TRACK_LEN / 4;
  kerbTex.magFilter = THREE.NearestFilter;
  const boardMat = bannerTexture(look.night);
  for (const s of [-1, 1]) {
    const kerb = mesh(box(0.5, 0.36, TRACK_LEN), new THREE.MeshLambertMaterial({ map: kerbTex }));
    kerb.position.set(s * (W + 0.45), -0.12, zMid);
    kerb.receiveShadow = true;
    const board = mesh(new THREE.PlaneGeometry(TRACK_LEN, 0.9), boardMat);
    board.rotation.y = -s * Math.PI / 2;
    board.position.set(s * (W + 1.6), 0.45, zMid);
    g.add(kerb, board);
  }

  // Arches with bunting and glowing bulbs every 60 units.
  const archGeo = merge([
    part(cyl(0.18, 0.24, 11, 8), '#ffffff', -(W + 1), 5.5, 0), part(cyl(0.18, 0.24, 11, 8), '#ffffff', W + 1, 5.5, 0),
    part(box(W * 2 + 2.6, 0.7, 0.3), look.kerb, 0, 11.1, 0),
    ...Array.from({ length: 11 }, (_v, i) => part(cone(0.32, 0.6, 3), ['#ff5d8f', '#ffd84a', '#4aa8ff', '#2fd39a'][i % 4], -W + i * (W / 5), 10.4, 0, 1.5, 1.5, 0.3, Math.PI)),
    ...[-1, 1].flatMap((s) => [part(sph(0.55), '#ff5d8f', s * (W + 1.6), 11.9, 0), part(sph(0.55), '#ffd84a', s * (W + 0.8), 12.2, 0.2), part(sph(0.55), '#4aa8ff', s * (W + 1.1), 12.8, -0.1)]),
  ]);
  const archZ = Array.from({ length: Math.floor(TRACK_LEN / 60) }, (_v, i) => mat4(0, 0, -30 - i * 60, 1));
  g.add(instanced(archGeo, propMat, archZ, true));
  g.add(instanced(merge(Array.from({ length: 9 }, (_v, i) => part(sph(0.13, 6, 5), i % 2 ? '#fff2a0' : '#ffffff', -W + i * (W / 4), 11.55, 0.1, 1.4, 1.4, 1.4, 0, 0, 1.4 + look.night * 0.6))), glowMat, archZ));

  // Props: the mix changes along the run (zone A, zone B, festival tents).
  const [a, b, small, far] = SCENERY[id];
  const zr = () => Z0 - r() * (TRACK_LEN + 40);
  const place: Record<string, THREE.Matrix4[]> = { [a]: [], [b]: [], tent: [], [small]: [], [far]: [] };
  const nearN = low ? 90 : 170;
  for (let i = 0; i < nearN; i++) {
    const z = zr();
    const zone = Math.floor(-z / 110) % 3;
    const roll = r();
    const kind = zone === 2 && roll < 0.3 ? 'tent' : (zone === 0 ? roll < 0.75 : roll < 0.3) ? a : b;
    const sd = id === 'beach' && kind !== 'umbrella' ? -1 : r() < 0.5 ? -1 : 1;
    const big = kind === 'building' || kind === 'tower' || kind === 'mesa';
    place[kind].push(mat4(sd * (W + (big ? 9 : 5) + r() * 34), 0, z, (big ? 1.1 : 0.8) + r() * 0.7, undefined, kind === 'building' || kind === 'tent' ? (sd < 0 ? 1.57 : -1.57) : r() * 6.28));
  }
  for (let i = 0; i < (low ? 50 : 120); i++) place[small].push(mat4((r() < 0.5 ? -1 : 1) * (W + 3 + r() * 30), 0, zr(), small === 'flower' ? 0.22 : 0.3 + r() * 0.5, undefined, r() * 6.28));
  for (let i = 0; i < 44; i++) {
    const s = 14 + r() * 18;
    place[far].push(mat4((r() < 0.5 ? -1 : 1) * ((id === 'beach' ? 120 : 78) + r() * 55), 0, zr() - 40, s, s * (0.8 + r() * 0.5), far === 'skyscraper' || far === 'keep' ? 0 : r() * 6.28));
  }
  for (const [k, mats] of Object.entries(place)) {
    if (!mats.length) continue;
    const p = PROTOS[k]();
    g.add(instanced(p.geo, propMat, mats, k !== far && k !== small));
    if (p.glow) g.add(instanced(p.glow, glowMat, mats));
  }
  if (id === 'beach') {
    const sea = mesh(new THREE.PlaneGeometry(400, TRACK_LEN + 500), new THREE.MeshLambertMaterial({ color: '#3cc3e8', emissive: '#0a4a6a' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(W + 22 + 200, 0.02, zMid);
    g.add(sea);
  }
  let dragon: THREE.Object3D | null = null;
  if (id === 'castle') {
    // A friendly dragon circles over the castle.
    const wing = (s: number) => part(cone(1.6, 3.4, 3), '#ff9a4a', s * 2.4, 0.3, 0, 1, 1, 0.12, 0, s * 1.35);
    dragon = mesh(merge([
      part(sph(1.3, 10, 8), '#4ac870', 0, 0, 0, 1, 0.9, 1.9), part(sph(0.9, 10, 8), '#4ac870', 0, 0.5, 2.6), part(sph(0.5, 8, 6), '#6ae08a', 0, 0.3, 3.3, 1.1, 0.7, 1),
      part(cone(0.7, 3.4, 6), '#4ac870', 0, 0, -3.6, 1, 1, 1, -Math.PI / 2), part(cone(0.2, 0.6, 5), '#fff0c8', -0.4, 1.3, 2.4), part(cone(0.2, 0.6, 5), '#fff0c8', 0.4, 1.3, 2.4),
      part(sph(0.17, 6, 5), '#ffffff', -0.42, 0.85, 3.3), part(sph(0.17, 6, 5), '#ffffff', 0.42, 0.85, 3.3), part(sph(0.09, 5, 4), '#2a2235', -0.44, 0.87, 3.44), part(sph(0.09, 5, 4), '#2a2235', 0.44, 0.87, 3.44),
      part(sph(1, 8, 6), '#fff0a0', 0, -0.5, 0.2, 0.8, 0.5, 1.6), wing(-1), wing(1),
      ...[0, 1, 2, 3].map((i) => part(cone(0.25, 0.6, 4), '#ff9a4a', 0, 1.25 - i * 0.08, 1.2 - i * 1.1)),
    ]), smoothMat);
    dragon.scale.setScalar(1.6);
    g.add(dragon);
  }
  return { group: g, look, follow, dragon };
}
export type WorldArt = ReturnType<typeof buildWorld>;

// ---------------- Gates ----------------
function gateTexture(gate: Gate) {
  const good = gateGood(gate);
  return canvasTex(256, 192, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 192);
    grad.addColorStop(0, good ? 'rgba(90,200,255,0.92)' : 'rgba(255,120,150,0.92)');
    grad.addColorStop(1, good ? 'rgba(40,110,255,0.78)' : 'rgba(235,50,90,0.78)');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(5, 5, 246, 182, 30);
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath();
    g.roundRect(18, 16, 220, 46, 22);
    g.fill();
    const text = gateText(gate);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const lines = gate.then ? text.split(' ') : [text];
    let size = gate.then ? 78 : 112;
    g.font = `900 ${size}px system-ui, "Segoe UI", sans-serif`;
    while (Math.max(...lines.map((l) => g.measureText(l).width)) > 216) g.font = `900 ${(size -= 6)}px system-ui, "Segoe UI", sans-serif`;
    lines.forEach((l, i) => {
      const y = lines.length === 1 ? 104 : 62 + i * 76;
      g.lineWidth = 12;
      g.strokeStyle = good ? '#1a4ab8' : '#a01a3a';
      g.strokeText(l, 128, y);
      g.fillStyle = '#ffffff';
      g.fillText(l, 128, y);
    });
  });
}
let shimmerTex: THREE.Texture | null = null;
/** One texture for every gate's moving shine; the game scrolls its offset. */
export function gateShimmer() {
  if (shimmerTex) return shimmerTex;
  shimmerTex = canvasTex(256, 64, (g) => {
    const gr = g.createLinearGradient(60, 0, 190, 64);
    gr.addColorStop(0.3, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 64);
  });
  shimmerTex.wrapS = THREE.RepeatWrapping;
  shimmerTex.repeat.x = 0.5;
  return shimmerTex;
}
const postGeo = merge([part(cyl(0.13, 0.16, 2.9, 8), '#ffffff', 0, 1.45, 0), part(cyl(0.22, 0.26, 0.25, 8), '#ffd84a', 0, 0.12, 0)]);
const orbGeo = part(sph(0.24, 10, 8), '#fff6c0', 0, 3.05, 0, 1, 1, 1, 0, 0, 1.35);
postGeo.userData.shared = orbGeo.userData.shared = true;

export function buildGateRow(opts: Gate[]) {
  const group = new THREE.Group();
  const k = opts.length;
  const lane = (W * 2) / k;
  for (let i = 0; i <= k; i++) {
    const p = mesh(postGeo, smoothMat);
    p.position.x = -W + i * lane;
    p.castShadow = true;
    const o = mesh(orbGeo, glowMat);
    o.position.x = p.position.x;
    group.add(p, o);
  }
  const shine = new THREE.MeshBasicMaterial({ map: gateShimmer(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.16, side: THREE.DoubleSide });
  shine.userData.shared = true;
  const panels = opts.map((gate, i) => {
    const m = mesh(new THREE.PlaneGeometry(lane - 0.3, 2.3), new THREE.MeshBasicMaterial({ map: gateTexture(gate), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(-W + lane * (i + 0.5), 1.5, 0);
    const s = mesh(m.geometry, shine);
    s.position.z = 0.02;
    s.geometry.userData.shared = true; // freed with the panel
    m.add(s);
    m.geometry.userData.shared = false;
    group.add(m);
    return m;
  });
  return { group, panels, lane };
}

// ---------------- Traps ----------------
const TRAP_GEO = new Map<TrapKind, THREE.BufferGeometry[]>();
function trapGeo(kind: TrapKind): THREE.BufferGeometry[] {
  let g = TRAP_GEO.get(kind);
  if (g) return g;
  const dots = (r: number, col: string) => [[0, 1, 0], [0, -1, 0], [0.9, 0.4, 0], [-0.9, 0.4, 0], [0, 0.4, 0.9], [0, 0.4, -0.9], [0.65, -0.4, 0.65], [-0.65, -0.4, 0.65], [0.65, -0.4, -0.65], [-0.65, -0.4, -0.65]]
    .map(([x, y, z]) => part(sph(r * 0.3, 6, 4), col, x * r * 0.86, y * r * 0.86, z * r * 0.86));
  const eyes = (y: number, z: number, dx: number, s = 0.1) => [-1, 1].flatMap((k) => [part(sph(s, 6, 5), '#ffffff', k * dx, y, z), part(sph(s * 0.55, 5, 4), '#2a2235', k * dx, y, z + s * 0.7)]);
  switch (kind) {
    case 'ball': g = [merge([part(sph(0.9, 14, 10), '#ffffff'), ...dots(0.9, '#2a2a3a')])]; break;
    case 'snowball': g = [merge([part(sph(1, 12, 9), '#ffffff'), ...dots(1, '#cfe2ff')])]; break;
    case 'boulder': g = [merge([part(new THREE.IcosahedronGeometry(1, 1), '#a8745a'), ...dots(1, '#8a5a44')])]; break;
    case 'gumball': g = [merge([part(sph(1, 14, 10), '#ff5aa8'), part(sph(0.3, 6, 5), '#ffffff', -0.4, 0.55, 0.6, 1, 0.6, 0.5)])]; break;
    case 'tumbleweed': g = [merge([0, 1, 2, 3].map((i) => part(new THREE.TorusGeometry(0.7, 0.07, 4, 12), i % 2 ? '#b08a50' : '#8a6a3a', 0, 0, 0, 1, 1, 1, i * 0.8, i * 1.1)))]; break;
    case 'penguin': g = [merge([part(cap(0.4, 0.5), '#2a3050', 0, 0.75, 0), part(sph(0.34, 8, 6), '#ffffff', 0, 0.65, 0.16, 1, 1.3, 0.8), part(cone(0.1, 0.25, 5), '#ffa03a', 0, 1.1, 0.42, 1, 1, 1, Math.PI / 2), ...eyes(1.2, 0.33, 0.15, 0.08), part(sph(0.16, 6, 4), '#ffa03a', -0.2, 0.08, 0.15, 1, 0.4, 1.5), part(sph(0.16, 6, 4), '#ffa03a', 0.2, 0.08, 0.15, 1, 0.4, 1.5), part(sph(0.12, 6, 4), '#2a3050', -0.45, 0.75, 0, 0.5, 2.4, 1), part(sph(0.12, 6, 4), '#2a3050', 0.45, 0.75, 0, 0.5, 2.4, 1)])]; break;
    case 'crab': g = [merge([part(sph(0.45, 8, 6), '#ff6b5a', 0, 0.3, 0, 1.3, 0.6, 1), part(sph(0.2, 6, 4), '#ff6b5a', -0.65, 0.45, 0.25), part(sph(0.2, 6, 4), '#ff6b5a', 0.65, 0.45, 0.25), ...eyes(0.72, 0.2, 0.15, 0.08), ...[-1, 1].flatMap((s) => [-0.2, 0, 0.2].map((z) => part(cyl(0.03, 0.03, 0.4, 4), '#e0523a', s * 0.55, 0.12, z, 1, 1, 1, 0, s)))])]; break;
    case 'twister': g = [merge([0, 1, 2, 3, 4].map((i) => part(cyl(0.35 + i * 0.22, 0.2 + i * 0.22, 0.42, 8), i % 2 ? '#e8d0a0' : '#d0b080', Math.sin(i) * 0.1, 0.25 + i * 0.44, 0)))]; break;
    case 'vacuum': g = [merge([part(cyl(0.75, 0.8, 0.3, 14), '#e8e8f4', 0, 0.2, 0), part(cyl(0.4, 0.4, 0.08, 12), '#4a4a6a', 0, 0.38, 0), ...eyes(0.42, 0.5, 0.2, 0.11)]), part(sph(0.1, 6, 5), '#22e0d0', 0, 0.46, 0, 1, 1, 1, 0, 0, 2.5)]; break;
    case 'dragon': g = [merge([part(sph(0.5, 10, 8), '#4ac870', 0, 0.55, 0, 1, 1, 1.2), part(sph(0.38, 10, 8), '#4ac870', 0, 1.1, 0.35), part(sph(0.2, 6, 5), '#6ae08a', 0, 1.02, 0.68, 1.2, 0.8, 1), ...eyes(1.25, 0.6, 0.17, 0.09), part(cone(0.07, 0.22, 4), '#fff0c8', -0.17, 1.5, 0.3), part(cone(0.07, 0.22, 4), '#fff0c8', 0.17, 1.5, 0.3), part(cone(0.35, 0.8, 3), '#ff9a4a', -0.6, 0.9, -0.1, 1, 1, 0.15, 0, 1.2), part(cone(0.35, 0.8, 3), '#ff9a4a', 0.6, 0.9, -0.1, 1, 1, 0.15, 0, -1.2), part(cone(0.2, 0.8, 5), '#4ac870', 0, 0.4, -0.8, 1, 1, 1, -1.9), part(sph(0.35, 8, 6), '#fff0a0', 0, 0.45, 0.2, 0.8, 0.8, 1)])]; break;
    case 'sprinkler': g = [part(cyl(0.3, 0.4, 0.4, 8), '#ffd23f', 0, 0.2, 0), merge([part(box(4.4, 0.12, 0.12), '#3a7bd5', 0, 0.4, 0), ...[-1, 1].flatMap((s) => [1, 2, 3, 4, 5, 6, 7].map((i) => part(sph(0.14, 6, 4), '#9fe4ff', (s * 2.2 * i) / 7, 0.65 + Math.sin((i / 7) * Math.PI) * 0.5, 0)))])]; break;
    case 'candycane': g = [part(cyl(0.35, 0.45, 0.5, 8), '#ffffff', 0, 0.25, 0), merge(Array.from({ length: 11 }, (_v, i) => part(cyl(0.2, 0.2, 0.4, 8), i % 2 ? '#ff3a5a' : '#ffffff', -2 + i * 0.4, 0.6, 0, 1, 1, 1, 0, Math.PI / 2)))]; break;
    case 'splash': g = [part(new THREE.TorusGeometry(1.05, 0.08, 4, 20), '#7fd1ff', 0, 0.05, 0, 1, 1, 1, Math.PI / 2), merge([part(cone(0.95, 2.6, 10), '#6fd0ff', 0, 1.3, 0), part(sph(0.5, 8, 6), '#ffffff', 0, 2.5, 0), part(sph(0.3, 6, 5), '#ffffff', 0.6, 1.9, 0.2), part(sph(0.3, 6, 5), '#ffffff', -0.5, 2.1, -0.3)])]; break;
    case 'flame': g = [part(new THREE.TorusGeometry(1.05, 0.1, 4, 20), '#5a4a5a', 0, 0.05, 0, 1, 1, 1, Math.PI / 2), merge([part(cone(0.9, 2.6, 8), '#ff7a2a', 0, 1.3, 0, 1, 1, 1, 0, 0, 1.6), part(cone(0.55, 1.8, 8), '#ffd84a', 0, 1.0, 0, 1, 1, 1, 0, 0, 2)])]; break;
    case 'cactus': g = [merge([-1.3, 0, 1.3].flatMap((x, i) => [part(cap(0.36, 0.8 + (i % 2) * 0.5), '#3fa860', x, 0.8 + (i % 2) * 0.25, 0), part(cap(0.16, 0.3), '#3fa860', x + 0.5, 0.9, 0), part(sph(0.13, 6, 5), '#ff7ab8', x, 1.6 + (i % 2) * 0.5, 0)]))]; break;
    default: g = [merge([-1.35, -0.45, 0.45, 1.35].flatMap((x) => [part(cone(0.36, 1.1, 10), '#ff8a2a', x, 0.6, 0), part(cyl(0.2, 0.26, 0.2, 10), '#ffffff', x, 0.6, 0), part(box(0.8, 0.08, 0.8), '#ff8a2a', x, 0.04, 0)]))]; break;
  }
  g.forEach((x) => (x.userData.shared = true));
  TRAP_GEO.set(kind, g);
  return g;
}
/** A trap model. `spin` is the part the game turns or raises (bar, water column, flame). */
export function buildTrap(kind: TrapKind) {
  const geo = trapGeo(kind);
  const mv = TRAP_MOVE[kind];
  const lit = kind === 'flame' ? glowMat : kind === 'tumbleweed' || kind === 'boulder' || kind === 'cactus' ? propMat : smoothMat;
  const group = new THREE.Group();
  let spin: THREE.Object3D | undefined;
  if (mv === 'spin' || mv === 'pop') {
    group.add(mesh(geo[0], smoothMat));
    spin = mesh(geo[1], lit);
    group.add(spin);
  } else {
    group.add(mesh(geo[0], lit));
    if (geo[1]) group.add(mesh(geo[1], glowMat));
  }
  group.traverse((o) => (o.castShadow = true));
  return { group, spin };
}

// ---------------- Goal, stands, and small pieces ----------------
export function buildGoal() {
  const g = new THREE.Group();
  const frame = mesh(merge([
    part(cyl(0.16, 0.16, 3.1, 10), '#ffffff', -3.4, 1.55, 0), part(cyl(0.16, 0.16, 3.1, 10), '#ffffff', 3.4, 1.55, 0),
    part(cyl(0.16, 0.16, 7.1, 10), '#ffffff', 0, 3.1, 0, 1, 1, 1, 0, Math.PI / 2),
    part(cyl(0.07, 0.07, 3.7, 6), '#e8e8f4', -3.4, 1.55, -1, 1, 1, 1, -0.57), part(cyl(0.07, 0.07, 3.7, 6), '#e8e8f4', 3.4, 1.55, -1, 1, 1, 1, -0.57),
  ]), smoothMat);
  frame.castShadow = true;
  g.add(frame);
  // Net: a grid of lines the game ripples when the ball hits.
  const NX = 18;
  const NY = 8;
  const rest: number[] = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) rest.push(-3.4 + (6.8 * i) / NX, (3.1 * j) / NY, -2 + (j / NY) * 1.9 * 0 - 0.0 + (1 - j / NY) * 0);
  const idx: number[] = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const a = j * (NX + 1) + i;
    if (i < NX) idx.push(a, a + 1);
    if (j < NY) idx.push(a, a + NX + 1);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rest), 3));
  ng.setIndex(idx);
  const net = new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
  g.add(net);
  /** t = seconds since the ball hit at (hx, hy); pass a negative t for a still net. */
  const ripple = (t: number, hx: number, hy: number) => {
    const p = ng.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      const d = Math.hypot(x - hx, y - hy);
      const edge = Math.min(1, (3.4 - Math.abs(x)) * 1.2) * Math.min(1, y * 1.5);
      const w = t < 0 ? 0 : Math.exp(-t * 1.6) * (Math.exp(-d * 0.5) * 1.5 * Math.exp(-t * 2) + Math.sin(d * 3 - t * 14) * 0.3 * Math.exp(-d * 0.35));
      p.setZ(i, -2 - Math.abs(w) * edge - w * edge * 0.4);
    }
    p.needsUpdate = true;
  };
  ripple(-1, 0, 0);
  const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const line = (w: number, d: number, x: number, z: number) => {
    const m = mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    g.add(m);
  };
  line(7.6, 0.15, 0, 7);
  line(0.15, 7, -3.8, 3.5);
  line(0.15, 7, 3.8, 3.5);
  line(8.4, 0.15, 0, 0);
  const spot = mesh(new THREE.CircleGeometry(0.25, 12), lineMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.02, 5);
  g.add(spot);
  return { group: g, ripple };
}

/**
 * Stands on both sides of the track from z0 to z1 (z1 < z0), `tiers` rows high. Returns the meshes and where the fans sit:
 * [x, y, z, facing] per fan.
 */
export function buildStands(z0: number, z1: number, tiers: number, accent: string, endStand: boolean, lights: number) {
  const parts: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const seats: [number, number, number, number][] = [];
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  for (const s of [-1, 1]) {
    for (let t = 0; t < tiers; t++) {
      const x = s * (W + 3.2 + t * 1.1);
      parts.push(part(box(1.1, 0.7 * (t + 1), len), t % 2 ? '#e4e4f0' : '#f6f6ff', x, 0.35 * (t + 1), zc));
      for (let z = z0 - 0.5; z > z1; z -= 0.85) seats.push([x, 0.7 * (t + 1), z, -s * Math.PI / 2]);
    }
    parts.push(part(box(0.25, 1.1, len), accent, s * (W + 2.55), 0.55, zc));
    parts.push(part(box(0.3, 0.7 * tiers + 1.6, len), accent, s * (W + 3.2 + tiers * 1.1 - 0.3), 0.35 * tiers + 0.8, zc));
    // Floodlight towers at both ends.
    for (const z of [z0 - 1, z1 + 1]) {
      const x = s * (W + 3.6 + tiers * 1.1);
      const h = 0.7 * tiers + 6;
      parts.push(part(cyl(0.14, 0.2, h, 6), '#c8c8d8', x, h / 2, z), part(box(1.8, 1.1, 0.25), '#8a8aa0', x, h + 0.3, z, 1, 1, 1, 0.3, 0));
      for (let i = 0; i < 6; i++) glow.push(part(sph(0.2, 6, 5), '#fffbe0', x - 0.6 + (i % 3) * 0.6, h + 0.05 + Math.floor(i / 3) * 0.5, z + 0.18, 1, 1, 1, 0, 0, 1.2 + lights * 1.8));
    }
  }
  if (endStand) {
    for (let t = 0; t < tiers; t++) {
      const z = z1 - 2.5 - t * 1.1;
      parts.push(part(box(W * 2 + 8, 0.7 * (t + 1), 1.1), t % 2 ? '#e4e4f0' : '#f6f6ff', 0, 0.35 * (t + 1), z));
      for (let x = -W - 3.5; x <= W + 3.5; x += 0.85) seats.push([x, 0.7 * (t + 1), z, 0]);
    }
    parts.push(part(box(W * 2 + 8, 0.7 * tiers + 1.6, 0.3), accent, 0, 0.35 * tiers + 0.8, z1 - 2.5 - tiers * 1.1 + 0.3));
  }
  const group = new THREE.Group();
  const m = mesh(merge(parts));
  m.castShadow = m.receiveShadow = true;
  group.add(m, mesh(merge(glow), glowMat));
  return { group, seats };
}

/** Confetti cannon, pointing up and inward. */
export function buildCannon(side: number) {
  const m = mesh(merge([
    part(cyl(0.34, 0.26, 1.1, 10), '#ff5d8f', 0, 0.75, 0, 1, 1, 1, 0, side * 0.5), part(cyl(0.38, 0.38, 0.14, 10), '#ffd84a', -side * 0.26, 1.22, 0, 1, 1, 1, 0, side * 0.5),
    part(box(0.8, 0.3, 0.8), '#4a4a6a', 0, 0.15, 0), part(sph(0.12, 6, 5), '#ffd84a', 0, 0.75, 0.33),
  ]), smoothMat);
  m.castShadow = true;
  return m;
}

const soccerGeo = () => trapGeo('ball')[0];
export function soccerBall(r: number) {
  const m = mesh(soccerGeo(), smoothMat);
  m.scale.setScalar(r / 0.9);
  m.castShadow = true;
  return m;
}
/** Gold crown for captains and star cats, and keeper gloves. */
export function buildCrown() {
  const m = mesh(merge([part(cyl(0.16, 0.14, 0.1, 8), '#ffcf3a', 0, 0.05, 0), ...[0, 1, 2, 3, 4].map((i) => part(cone(0.05, 0.14, 4), '#ffcf3a', Math.cos(i * 1.257) * 0.13, 0.16, Math.sin(i * 1.257) * 0.13)), part(sph(0.04, 5, 4), '#ff5d8f', 0, 0.06, 0.15, 1, 1, 1, 0, 0, 1.6)]), smoothMat);
  return m;
}
export const gloveGeo = part(sph(0.11, 8, 6), '#ffffff', 0, 0, 0, 1, 1.15, 1);
gloveGeo.userData.shared = true;

export function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.42 : 1;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}
