// All art for Neko Strike, built in code from three.js shapes and canvas drawings. Cats face +z in model space.
// Anime look: toon shading on one shared 3-step ramp, and inverted-hull ink outlines (High quality only).
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

// ---------------- Toon shading and ink ----------------
/** The one light ramp every toon material uses: shadow 0.35, mid 0.7, lit 1.0. */
export const toonRamp = new THREE.DataTexture(new Uint8Array([89, 179, 255]), 3, 1, THREE.RedFormat);
toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
toonRamp.needsUpdate = true;
export const toon = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp, ...o });

export const propMat = toon({ vertexColors: true });
export const smoothMat = propMat;
export const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
for (const m of [propMat, glowMat]) m.userData.shared = true;

const INK_TINT = 'vColor.rgb = vColor.rgb * 0.2 + vec3(0.025, 0.015, 0.06);';
const inkMats = new Map<number, THREE.MeshBasicMaterial>();
/** Ink outline material: back faces pushed out along the normal, coloured as a dark version of the surface. */
function inkMat(thick: number) {
  let m = inkMats.get(thick);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  m.userData.shared = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = { value: thick };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uInk;')
      .replace('#include <color_vertex>', `#include <color_vertex>\n  ${INK_TINT}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uInk;');
  };
  inkMats.set(thick, m);
  return m;
}
let inkOn = true;
let catInk: THREE.Material | null = null;
/** Outlines are drawn on High quality only. */
export function setInk(on: boolean) {
  inkOn = on;
  for (const m of inkMats.values()) m.visible = on;
  if (catInk) catInk.visible = on;
}
/** Adds an ink outline to a mesh (or an instanced mesh). `thick` is in the mesh's own units. */
export function ink<T extends THREE.Mesh>(m: T, thick = 0.04): T {
  const mat = inkMat(thick);
  mat.visible = inkOn;
  let o: THREE.Mesh;
  if (m instanceof THREE.InstancedMesh) {
    const im = new THREE.InstancedMesh(m.geometry, mat, m.count);
    im.instanceMatrix = m.instanceMatrix;
    im.frustumCulled = false;
    o = im;
  } else o = new THREE.Mesh(m.geometry, mat);
  m.add(o);
  return m;
}

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
const FONT = 'system-ui, "Segoe UI", sans-serif';

// ---------------- Cats ----------------
// Teen-proportioned cat-folk athletes, about 1.4 units tall with a head near one fifth of that.
// Vertex data: aPart picks the tint (0 fixed, 1 jersey, 2 fur, 3 trim, 4 ace-only trim, 5 ace-only fur);
// aLimb = (kind, pivot y, pivot z) drives the run cycle in the vertex shader (1/2 legs, 3 tail, 4/5 arms).
// Only the number patch on the back has real uv. Per cat, aAnim = (phase, run, hop, number + 16 for an ace).
export const CAT_H = 1.4;
type Limb = [number, number, number] | 0;

function cpart(g0: THREE.BufferGeometry, color: string, tint: number, limb: Limb, ...tf: number[]) {
  const isNum = tint < 0;
  const g = part(g0, color, ...tf);
  const n = g.attributes.position.count;
  const p = new Float32Array(n).fill(isNum ? 3 : tint);
  const l = new Float32Array(n * 3);
  if (limb) for (let i = 0; i < n; i++) l.set(limb, i * 3);
  g.setAttribute('aPart', new THREE.BufferAttribute(p, 1));
  g.setAttribute('aLimb', new THREE.BufferAttribute(l, 3));
  if (!isNum) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
  return g;
}

/** One merged cat. lod 0 = players, lod 1 = simple fans in the stands. */
export function catGeometry(lod: 0 | 1): THREE.BufferGeometry {
  const wh = '#ffffff';
  const dark = '#1d1828';
  const s = lod ? 0.6 : 1;
  const S = (r: number, a = 10, b = 8) => sph(r, Math.max(5, Math.round(a * s)), Math.max(4, Math.round(b * s)));
  const seg = lod ? 5 : 6;
  const HIP = 0.64;
  const SHO = 1.02;
  const legA: Limb = [1, HIP, 0];
  const legB: Limb = [2, HIP, 0];
  const tail: Limb = [3, 0, -0.1];
  const armA: Limb = [4, SHO, 0];
  const armB: Limb = [5, SHO, 0];
  const parts = [
    cpart(cyl(0.155, 0.105, 0.36, lod ? 6 : 8), wh, 1, 0, 0, 0.86, 0, 1, 1, 0.62), // jersey
    cpart(cyl(0.112, 0.125, 0.2, lod ? 6 : 8), '#23233a', 0, 0, 0, 0.63, 0, 1, 1, 0.72), // shorts
    cpart(cap(0.05, 0.42, seg), wh, 2, legA, -0.085, 0.37, 0, 1, 1, 1, 0, -0.06),
    cpart(cap(0.05, 0.42, seg), wh, 2, legB, 0.085, 0.37, 0, 1, 1, 1, 0, 0.06),
    cpart(cap(0.037, 0.3, seg), wh, 2, armA, -0.2, 0.84, 0, 1, 1, 1, 0, -0.16),
    cpart(cap(0.037, 0.3, seg), wh, 2, armB, 0.2, 0.84, 0, 1, 1, 1, 0, 0.16),
    cpart(S(0.125, 12, 9), wh, 2, 0, 0, 1.19, 0, 1, 1.03, 0.98), // head
    cpart(cone(0.055, 0.15, 4), wh, 2, 0, -0.085, 1.325, -0.01, 1, 1, 0.6, 0, 0.3),
    cpart(cone(0.055, 0.15, 4), wh, 2, 0, 0.085, 1.325, -0.01, 1, 1, 0.6, 0, -0.3),
    // eyes: dark almond shapes, outer corners up
    cpart(S(0.03, 8, 5), dark, 0, 0, -0.052, 1.2, 0.106, 1.3, 0.8, 0.4, 0, -0.3),
    cpart(S(0.03, 8, 5), dark, 0, 0, 0.052, 1.2, 0.106, 1.3, 0.8, 0.4, 0, 0.3),
  ];
  if (!lod) {
    parts.push(
      cpart(S(0.058, 8, 6), wh, 3, 0, -0.165, 1.0, 0, 1, 0.85, 0.9), // sleeves
      cpart(S(0.058, 8, 6), wh, 3, 0, 0.165, 1.0, 0, 1, 0.85, 0.9),
      cpart(cyl(0.075, 0.085, 0.035, 8), wh, 3, 0, 0, 1.045, 0, 1, 1, 0.75), // collar
      cpart(box(0.022, 0.33, 0.1), wh, 3, 0, -0.128, 0.86, 0, 1, 1, 1, 0, -0.135), // side panels
      cpart(box(0.022, 0.33, 0.1), wh, 3, 0, 0.128, 0.86, 0, 1, 1, 1, 0, 0.135),
      cpart(cap(0.055, 0.13, 6), wh, 1, legA, -0.095, 0.2, 0), // socks
      cpart(cap(0.055, 0.13, 6), wh, 1, legB, 0.095, 0.2, 0),
      cpart(S(0.07, 6, 5), dark, 0, legA, -0.1, 0.05, 0.035, 0.85, 0.62, 1.5), // boots
      cpart(S(0.07, 6, 5), dark, 0, legB, 0.1, 0.05, 0.035, 0.85, 0.62, 1.5),
      cpart(cyl(0.045, 0.05, 0.08, 6), wh, 2, 0, 0, 1.07, 0),
      cpart(S(0.075, 8, 6), '#fff1e0', 0, 0, 0, 1.145, 0.055, 1, 0.7, 0.9), // muzzle
      cpart(S(0.012, 5, 4), dark, 0, 0, 0, 1.165, 0.124),
      cpart(cone(0.028, 0.09, 3), '#3a2c3c', 0, 0, -0.085, 1.315, 0.012, 1, 1, 0.5, 0, 0.3),
      cpart(cone(0.028, 0.09, 3), '#3a2c3c', 0, 0, 0.085, 1.315, 0.012, 1, 1, 0.5, 0, -0.3),
      // amber iris and a white highlight
      cpart(S(0.017, 6, 4), '#ffb020', 0, 0, -0.05, 1.198, 0.116, 1, 1, 0.4),
      cpart(S(0.017, 6, 4), '#ffb020', 0, 0, 0.05, 1.198, 0.116, 1, 1, 0.4),
      cpart(sph(0.008, 4, 3), wh, 0, 0, -0.043, 1.208, 0.124),
      cpart(sph(0.008, 4, 3), wh, 0, 0, 0.057, 1.208, 0.124),
      // brows, inner ends low
      cpart(box(0.07, 0.013, 0.012), dark, 0, 0, -0.052, 1.243, 0.108, 1, 1, 1, 0, -0.32),
      cpart(box(0.07, 0.013, 0.012), dark, 0, 0, 0.052, 1.243, 0.108, 1, 1, 1, 0, 0.32),
      // swept hair: a fringe and two back spikes, a shade darker than the fur
      cpart(cone(0.05, 0.17, 4), '#b4adc2', 2, 0, 0.03, 1.285, 0.085, 1, 1, 0.55, 1.95, -0.35),
      cpart(cone(0.045, 0.14, 4), '#b4adc2', 2, 0, -0.05, 1.29, 0.075, 1, 1, 0.55, 1.9, 0.5),
      cpart(cone(0.05, 0.17, 4), '#b4adc2', 2, 0, -0.04, 1.3, -0.09, 1, 1, 0.7, -1.0, 0.25),
      cpart(cone(0.05, 0.17, 4), '#b4adc2', 2, 0, 0.045, 1.27, -0.105, 1, 1, 0.7, -1.25, -0.25),
      cpart(cap(0.027, 0.26, 5), wh, 2, tail, 0, 0.67, -0.2, 1, 1, 1, -1.1),
      cpart(cap(0.025, 0.24, 5), wh, 2, tail, 0, 0.87, -0.36, 1, 1, 1, -0.3),
      cpart(new THREE.PlaneGeometry(0.17, 0.17).rotateY(Math.PI), wh, -1, 0, 0, 0.89, -0.099),
      // Ace-only pieces: headband with tails, tall hair spikes, captain's armband.
      cpart(new THREE.TorusGeometry(0.122, 0.012, 4, 12), wh, 4, 0, 0, 1.24, 0, 1, 1.6, 1, Math.PI / 2 - 0.12),
      cpart(box(0.026, 0.22, 0.008), wh, 4, tail, -0.03, 1.14, -0.2, 1, 1, 1, 0.75, 0.12),
      cpart(box(0.026, 0.18, 0.008), wh, 4, tail, 0.03, 1.16, -0.19, 1, 1, 1, 0.9, -0.12),
      cpart(cone(0.06, 0.26, 4), '#b4adc2', 5, 0, 0, 1.38, -0.03, 1, 1, 0.6, -0.5),
      cpart(cone(0.05, 0.2, 4), '#b4adc2', 5, 0, -0.075, 1.34, -0.05, 1, 1, 0.6, -0.5, 0.6),
      cpart(cone(0.05, 0.2, 4), '#b4adc2', 5, 0, 0.075, 1.34, -0.05, 1, 1, 0.6, -0.5, -0.6),
      cpart(new THREE.TorusGeometry(0.044, 0.016, 4, 8), wh, 4, armA, -0.2, 0.9, 0, 1, 1, 1, Math.PI / 2),
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
    g.font = `italic 900 52px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 15; i++) g.fillText(String(i + 1), (i % 4) * 64 + 30, (3 - Math.floor(i / 4)) * 64 + 35);
  });
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

const CAT_PARS = `uniform float uTime; uniform float uCheer;
attribute float aPart; attribute vec3 aLimb; attribute vec3 aJersey; attribute vec3 aTrim; attribute vec3 aFur; attribute vec4 aAnim;`;
const CAT_TINT = 'vColor.rgb *= aPart < 0.5 ? vec3(1.0) : aPart < 1.5 ? aJersey : aPart < 2.5 ? aFur : aPart < 4.5 ? aTrim : aFur;';
// run (aAnim.y): 1 running, 0 standing, -1 a fan in the stands, 2 the keeper's wide stance.
const CAT_ANIM = `{
    float ph = uTime * 12.0 + aAnim.x;
    float stance = step(1.5, aAnim.y);
    float run = clamp(aAnim.y, 0.0, 1.0) * (1.0 - stance);
    float k = aLimb.x;
    if (k > 0.5) {
      if (k < 2.5 || k > 3.5) {
        float sgn = (k < 1.5 || k > 4.5) ? 1.0 : -1.0;
        float a = sgn * sin(ph) * run * 0.95;
        if (k > 3.5) a -= smoothstep(0.15, 0.3, aAnim.z) * 2.6 * (1.0 - stance);
        float c = cos(a); float s = sin(a);
        vec2 q = transformed.yz - vec2(aLimb.y, aLimb.z);
        transformed.yz = vec2(aLimb.y, aLimb.z) + vec2(q.x * c - q.y * s, q.x * s + q.y * c);
        if (k > 3.5 && stance > 0.5) {
          float side = k < 4.5 ? -1.0 : 1.0;
          float b = side * (1.9 + sin(uTime * 7.0 + side) * 0.18);
          vec2 piv = vec2(side * 0.17, aLimb.y);
          vec2 q2 = transformed.xy - piv;
          transformed.xy = piv + vec2(q2.x * cos(b) - q2.y * sin(b), q2.x * sin(b) + q2.y * cos(b));
        }
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
    if (aPart > 3.5 && aAnim.w < 15.5) transformed = vec3(0.0);
  }`;

export interface CatUniforms { uTime: { value: number }; uCheer: { value: number } }
export type CatMaterial = THREE.MeshToonMaterial & { userData: { u: CatUniforms; ink: THREE.Material } };
/** Toon cat material with per-cat colours, jersey numbers, and a run cycle, all in the vertex shader. Its ink twin is in userData.ink. */
export function catMaterial(): CatMaterial {
  const m = toon({ vertexColors: true, map: numberAtlas(), alphaTest: 0.5 });
  const u: CatUniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
  m.userData.u = u;
  m.userData.shared = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.uniforms.uCheer = u.uCheer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${CAT_PARS}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  float num = mod(aAnim.w, 16.0);
  vMapUv = uv.x < 0.0 ? vec2(0.9, 0.9) : (uv + vec2(mod(num, 4.0), floor(num / 4.0))) * 0.25;
#endif`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n  ${CAT_TINT}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  ${CAT_ANIM}
  if (uv.x >= 0.0 && mod(aAnim.w, 16.0) > 14.5) transformed = vec3(0.0);`);
  };
  const inkM = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  inkM.userData.shared = true;
  inkM.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.uniforms.uCheer = u.uCheer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${CAT_PARS}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n  ${CAT_TINT}\n  ${INK_TINT}`)
      .replace('#include <begin_vertex>', `vec3 transformed = position + normalize(normal) * 0.02;\n  ${CAT_ANIM}`);
  };
  inkM.visible = inkOn;
  catInk = inkM;
  m.userData.ink = inkM;
  return m as CatMaterial;
}

/** An instanced cat mesh with the per-cat attributes the cat shader reads. `outline` adds the ink hull as a second instanced mesh. */
export function catMesh(geo: THREE.BufferGeometry, mat: CatMaterial, cap: number, outline: boolean) {
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
  let hull: THREE.InstancedMesh | null = null;
  if (outline) {
    hull = new THREE.InstancedMesh(g, mat.userData.ink, cap);
    hull.instanceMatrix = mesh.instanceMatrix;
    hull.frustumCulled = false;
  }
  return { mesh, hull, jersey, trim, fur, anim };
}
export type CatMesh = ReturnType<typeof catMesh>;

// ---------------- Looks: one palette per world, re-lit per league ----------------
export interface Look {
  skyTop: THREE.Color; skyLow: THREE.Color; ground: string; track: [string, string]; line: string; kerb: string;
  hemi: number; sun: number; sunColor: THREE.Color; night: number; // night 0..1: how much glow and how many stars
}
const BASE: Record<WorldId, { top: string; low: string; ground: string; track: [string, string]; line: string; kerb: string; night?: number }> = {
  field: { top: '#0f4fc4', low: '#8fd4ff', ground: '#3a9a44', track: ['#2b8a48', '#35a054'], line: '#f2fff0', kerb: '#ffb020' },
  snow: { top: '#1f55cc', low: '#c4e2ff', ground: '#dbe8f8', track: ['#b4cdea', '#c6daf2'], line: '#2f6fe0', kerb: '#2f6fe0' },
  beach: { top: '#0a74dc', low: '#9eeaff', ground: '#efcc80', track: ['#e0b460', '#ebc474'], line: '#ffffff', kerb: '#0b9aa0' },
  canyon: { top: '#2864d4', low: '#ffc488', ground: '#c46a38', track: ['#a45530', '#b4633a'], line: '#ffe8c8', kerb: '#7a2418' },
  desert: { top: '#2a70dc', low: '#ffdc98', ground: '#e6b864', track: ['#cc9c4e', '#daaa5c'], line: '#fff6e0', kerb: '#6a3fc0' },
  candy: { top: '#2a1580', low: '#e07ad0', ground: '#45368a', track: ['#5646a6', '#6252b6'], line: '#9ff0ff', kerb: '#ff4ac0', night: 0.45 },
  city: { top: '#08082c', low: '#5a2a98', ground: '#1a1a34', track: ['#28284a', '#303058'], line: '#22e0d0', kerb: '#ff2aa8', night: 0.9 },
  castle: { top: '#180e44', low: '#d05c78', ground: '#2c4838', track: ['#50506a', '#5a5a76'], line: '#ffcf3a', kerb: '#6a1ab8', night: 0.6 },
};
const LEAGUE_SKY: [string, string, number, string, number, number, number][] = [
  // top, low, blend, sun colour, sun strength, sky-light strength, night
  ['#000000', '#000000', 0, '#fff0d0', 2.5, 0.95, 0],
  ['#28288c', '#ff8a48', 0.8, '#ffa050', 2.5, 0.75, 0.3],
  ['#040826', '#1c3a90', 0.92, '#9fc0ff', 1.5, 0.6, 1],
  ['#280e68', '#ff66b0', 0.8, '#ffd8a0', 2.2, 0.8, 0.7],
];
export function lookFor(world: WorldId, league: number): Look {
  const b = BASE[world];
  const [top, low, k, sunC, sun, hemi, night] = LEAGUE_SKY[league];
  return {
    skyTop: new THREE.Color(b.top).lerp(new THREE.Color(top), k),
    skyLow: new THREE.Color(b.low).lerp(new THREE.Color(low), k),
    ground: b.ground, track: b.track, line: b.line, kerb: b.kerb,
    hemi: league === 0 && b.night ? 0.85 : hemi, sun: league === 0 && b.night ? 1.8 : sun,
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
  round: () => ({ geo: merge([part(cyl(0.22, 0.3, 1.4, 6), '#8a5a3c', 0, 0.7, 0), part(new THREE.IcosahedronGeometry(1.3, 1), '#2f9a48', 0, 2.3, 0), part(new THREE.IcosahedronGeometry(0.8, 1), '#4ab858', 0.7, 2.9, 0.3)]) }),
  snowman: () => ({ geo: merge([part(cone(0.5, 2.6, 5), '#9fd8ff', 0, 1.3, 0), part(cone(0.32, 1.7, 5), '#c8ecff', 0.55, 0.85, 0.2, 1, 1, 1, 0, -0.3), part(cone(0.28, 1.3, 5), '#7fbcf0', -0.5, 0.65, -0.1, 1, 1, 1, 0, 0.35)]) }),
  palm: () => ({ geo: merge([part(cyl(0.16, 0.26, 4, 6), '#a87a4f', 0.2, 2, 0, 1, 1, 1, 0, -0.1), ...[0, 1, 2, 3, 4, 5].map((i) => part(cone(0.45, 2.2, 4), i % 2 ? '#3fbf6a' : '#2fa35a', 0.4 + Math.cos(i * 1.05) * 0.95, 3.9, Math.sin(i * 1.05) * 0.95, 1, 1, 0.35, Math.sin(i * 1.05) * 1.2, -Math.cos(i * 1.05) * 1.2)), part(sph(0.22, 6, 5), '#7a4a2a', 0.4, 3.9, 0.2)]) }),
  umbrella: () => ({ geo: merge([part(cyl(0.05, 0.05, 2.2, 5), '#ffffff', 0, 1.1, 0), part(cone(1.4, 0.6, 8), '#e8305a', 0, 2.3, 0), part(box(1.6, 0.12, 0.8), '#4aa8ff', 0.3, 0.25, 0.9)]) }),
  mesa: () => ({ geo: merge([part(cyl(1.5, 2, 2.4, 7), '#c9603a', 0, 1.2, 0), part(cyl(1.2, 1.5, 0.5, 7), '#e08a52', 0, 2.6, 0), part(cyl(0.7, 1, 1.4, 6), '#b8502e', 1.7, 0.7, 0.6)]) }),
  rock: () => ({ geo: merge([part(new THREE.IcosahedronGeometry(0.8, 0), '#9a8a80', 0, 0.4, 0, 1.2, 0.8, 1), part(new THREE.IcosahedronGeometry(0.45, 0), '#b0a096', 0.8, 0.25, 0.3)]) }),
  cactus: () => ({ geo: merge([part(cap(0.3, 1.6), '#3fa860', 0, 1.1, 0), part(cap(0.18, 0.6), '#3fa860', -0.6, 1.5, 0), part(cap(0.18, 0.4), '#3fa860', 0.6, 1.2, 0), part(cap(0.18, 0.3, 6), '#3fa860', -0.4, 1.15, 0, 1, 1, 1, 0, Math.PI / 2), part(cap(0.18, 0.3, 6), '#3fa860', 0.4, 0.95, 0, 1, 1, 1, 0, Math.PI / 2), part(sph(0.14, 6, 5), '#ff7ab8', 0, 2.25, 0)]) }),
  pyramid: () => ({ geo: merge([part(cone(2.2, 2.6, 4), '#e8c070', 0, 1.3, 0), part(cone(0.5, 0.6, 4), '#ffe9a0', 0, 2.75, 0)]) }),
  lolly: () => ({ geo: merge([part(cyl(0.55, 0.4, 2.6, 6), '#b04ae0', 0, 1.3, 0), part(cone(0.55, 1.1, 6), '#d87aff', 0, 3.15, 0), part(cyl(0.3, 0.22, 1.4, 6), '#7a3ad0', 0.7, 0.7, 0.2, 1, 1, 1, 0, -0.35), part(cone(0.3, 0.6, 6), '#b04ae0', 1.04, 1.64, 0.2, 1, 1, 1, 0, -0.35)]), glow: part(cone(0.2, 0.5, 6), '#ffb0ff', 0, 3.8, 0, 1, 1, 1, 0, 0, 2) }),
  cupcake: () => ({ geo: merge([0, 1, 2, 3].map((i) => part(cone(0.42, 1.6 + (i % 2) * 0.7, 5), i % 2 ? '#4ad8e8' : '#e05ac8', Math.cos(i * 1.7) * 0.5, 0.75 + (i % 2) * 0.3, Math.sin(i * 1.7) * 0.5, 1, 1, 1, Math.sin(i * 1.7) * 0.35, -Math.cos(i * 1.7) * 0.35)).concat(part(new THREE.IcosahedronGeometry(0.7, 0), '#5a4aa8', 0, 0.25, 0, 1.3, 0.6, 1.3))) }),
  building: () => ({
    geo: merge([part(box(2.6, 7, 2.6), '#34345a', 0, 3.5, 0), part(box(2.2, 0.5, 2.2), '#4a4a78', 0, 7.25, 0), part(cyl(0.05, 0.05, 1.4, 4), '#8a8ab0', 0.6, 8.2, 0.5)]),
    glow: merge([0, 1, 2, 3, 4].flatMap((r) => [-0.7, 0.15].map((x, c) => part(box(0.55, 0.6, 0.08), (r + c) % 3 ? '#ffe08a' : '#7fe0ff', x + 0.27, 1 + r * 1.25, 1.31, 1, 1, 1, 0, 0, 1.6))).concat(part(sph(0.12, 5, 4), '#ff4a6a', 0.6, 8.95, 0.5, 1, 1, 1, 0, 0, 3))),
  }),
  lamp: () => ({ geo: merge([part(cyl(0.07, 0.1, 3.4, 5), '#5a5a80', 0, 1.7, 0), part(box(0.9, 0.08, 0.08), '#5a5a80', 0.4, 3.4, 0)]), glow: part(sph(0.22, 6, 5), '#ffe9a0', 0.8, 3.3, 0, 1, 1, 1, 0, 0, 2.6) }),
  tower: () => ({
    geo: merge([part(cyl(1.1, 1.3, 5, 8), '#9a94b0', 0, 2.5, 0), part(cyl(1.4, 1.4, 0.6, 8), '#8a84a0', 0, 5.2, 0), part(cone(1.5, 2, 8), '#7a2ad0', 0, 6.5, 0), part(cyl(0.04, 0.04, 1, 4), '#ffffff', 0, 7.9, 0), part(box(0.7, 0.4, 0.04), '#ffcf3a', 0.36, 8.15, 0)]),
    glow: merge([part(box(0.35, 0.6, 0.1), '#ffb84a', 0, 3.6, 1.18, 1, 1, 1, 0, 0, 2), part(box(0.35, 0.6, 0.1), '#ffb84a', 0, 1.8, 1.26, 1, 1, 1, 0, 0, 2)]),
  }),
  tent: () => ({ geo: merge([part(cyl(1.5, 1.5, 1.4, 8), '#f4efe6', 0, 0.7, 0), part(cone(1.9, 1.3, 8), '#e8305a', 0, 2.05, 0), part(cyl(0.04, 0.04, 1.6, 4), '#2a2c48', 0, 3.3, 0), part(box(0.9, 0.5, 0.04), '#ffb020', 0.47, 3.8, 0)]) }),
  mountain: () => ({ geo: merge([part(cone(1, 1.4, 6), '#4a5a9c', 0, 0.7, 0), part(cone(0.43, 0.6, 6), '#eef4ff', 0, 1.11, 0), part(cone(0.7, 0.9, 5), '#3c4a88', 0.7, 0.45, 0.3)]) }),
  dune: () => ({ geo: part(sph(1, 8, 5), '#e8c070', 0, 0, 0, 1.6, 0.5, 1) }),
  island: () => ({ geo: merge([part(sph(1, 8, 5), '#e8d090', 0, 0, 0, 1.4, 0.3, 1.4), part(sph(0.8, 8, 5), '#3fbf6a', 0, 0.3, 0, 1, 0.7, 1)]) }),
  butte: () => ({ geo: merge([part(cyl(0.7, 1, 1.2, 7), '#c2603a', 0, 0.6, 0), part(cyl(0.72, 0.72, 0.15, 7), '#e8a070', 0, 0.9, 0)]) }),
  icecream: () => ({ geo: merge([part(cone(1, 1.5, 5), '#4a3a9a', 0, 0.75, 0), part(cone(0.5, 0.8, 5), '#c86ae8', 0, 1.25, 0), part(cone(0.5, 1.0, 5), '#5a48b0', 0.7, 0.5, 0.2)]) }),
  skyscraper: () => ({ geo: part(box(1, 2.4, 1), '#24244a', 0, 1.2, 0), glow: merge([0.5, 0.9, 1.3, 1.7, 2.1].map((y, i) => part(box(0.7, 0.06, 0.05), i % 2 ? '#ff4ab8' : '#22e0d0', 0, y, 0.51, 1, 1, 1, 0, 0, 1.5))) }),
  keep: () => ({ geo: merge([part(box(2, 1.2, 1), '#7a748f', 0, 0.6, 0), part(cyl(0.35, 0.4, 2, 8), '#8a84a0', -1, 1, 0), part(cyl(0.35, 0.4, 2, 8), '#8a84a0', 1, 1, 0), part(cone(0.45, 0.7, 8), '#7a2ad0', -1, 2.3, 0), part(cone(0.45, 0.7, 8), '#7a2ad0', 1, 2.3, 0)]) }),
  flower: () => ({ geo: merge([part(new THREE.IcosahedronGeometry(0.9, 0), '#2f8a40', 0, 0.4, 0, 1, 0.7, 1), part(new THREE.IcosahedronGeometry(0.7, 0), '#46a850', 2.2, 0.3, 1, 1, 0.7, 1), part(new THREE.IcosahedronGeometry(0.6, 0), '#2a7a3a', -1.2, 0.3, 2.1, 1, 0.7, 1)]) }),
  gumdrop: () => ({ geo: merge([part(cone(0.5, 1.6, 4), '#4ad8e8', 0, 0.8, 0), part(cone(0.4, 1.1, 4), '#e05ac8', 2.6, 0.55, 1, 1, 1, 1, 0, 0.3), part(cone(0.35, 0.9, 4), '#b58cff', -2, 0.45, 2, 1, 1, 1, 0.3)]) }),
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

function bannerTexture(night: number, kerb: string) {
  const cols = ['#e8305a', '#1f6fe0', '#ffb020', '#12b890', '#7a4ae8', kerb];
  const words = ['NEKO STRIKE', 'FULL POWER', 'NO LIMITS', 'STRIKE', 'ALL OUT', 'RISE'];
  const t = canvasTex(1536, 64, (g) => {
    words.forEach((w, i) => {
      const x = i * 256;
      g.fillStyle = '#10121e';
      g.fillRect(x, 0, 256, 64);
      // slanted colour block with the word cut out of it in white
      g.fillStyle = cols[i];
      g.beginPath();
      g.moveTo(x + 18, 0);
      g.lineTo(x + 70, 0);
      g.lineTo(x + 46, 64);
      g.lineTo(x - 6, 64);
      g.fill();
      g.fillRect(x, 58, 256, 6);
      g.fillStyle = '#ffffff';
      g.font = `italic 900 30px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(w, x + 158, 31, 170);
    });
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = TRACK_LEN / 36;
  return new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25 + night * 0.6 });
}

/** A soft streak that fades along its length and across its width: light shafts, beams, trails. */
let streakTex: THREE.Texture | null = null;
export function streakTexture() {
  if (streakTex) return streakTex;
  streakTex = canvasTex(64, 64, (g) => {
    const a = g.createLinearGradient(0, 0, 64, 0);
    a.addColorStop(0, 'rgba(255,255,255,0)');
    a.addColorStop(0.5, 'rgba(255,255,255,1)');
    a.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = a;
    g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'destination-in';
    const b = g.createLinearGradient(0, 0, 0, 64);
    b.addColorStop(0, 'rgba(255,255,255,1)');
    b.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = b;
    g.fillRect(0, 0, 64, 64);
  });
  return streakTex;
}
const beamMat = (color: THREE.Color, opacity: number) =>
  new THREE.MeshBasicMaterial({ map: streakTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });

/** Scenery for one world in one league's light: sky, ground, track, boards, arches, props. */
export function buildWorld(id: WorldId, league: number, low: boolean) {
  const look = lookFor(id, league);
  const g = new THREE.Group();
  const zMid = Z0 - TRACK_LEN / 2;
  const sunPos = new THREE.Vector3(-90, look.night > 0.8 ? 120 : 78, -300);

  // Sky dome: deep top, bright horizon band, and a wide glow around the sun. It follows the camera.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(380, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: look.skyTop }, low: { value: look.skyLow }, sunDir: { value: sunPos.clone().normalize() }, sunCol: { value: look.sunColor } },
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 d;
void main(){
  vec3 n = normalize(d);
  vec3 c = mix(low, top, smoothstep(0.0, 0.5, n.y));
  c = mix(c, low * 1.25, pow(1.0 - clamp(n.y, 0.0, 1.0), 10.0) * 0.6);
  float s = max(dot(n, sunDir), 0.0);
  c += sunCol * (pow(s, 6.0) * 0.14 + pow(s, 40.0) * 0.3);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
    }),
  );
  sky.renderOrder = -10;
  const follow = new THREE.Group(); // moves with the camera: sky, sun, stars, clouds, light shafts
  follow.add(sky);
  const moon = look.night > 0.8;
  const sunDisc = mesh(new THREE.CircleGeometry(moon ? 9 : 13, 28), new THREE.MeshBasicMaterial({ color: look.sunColor.clone().multiplyScalar(moon ? 1.4 : 1.7), fog: false }));
  sunDisc.position.copy(sunPos);
  sunDisc.lookAt(0, 0, 0);
  follow.add(sunDisc);
  const r = seeded(id.length * 31 + league * 7 + 3);
  if (!low) {
    // Light shafts fan out from the sun across the sky.
    const shaftMat = beamMat(look.sunColor, moon ? 0.08 : 0.13);
    for (let i = 0; i < 9; i++) {
      const len = 240 + r() * 160;
      const shaft = mesh(new THREE.PlaneGeometry(10 + r() * 22, len).translate(0, -len / 2, 0), shaftMat);
      shaft.position.copy(sunPos).setZ(sunPos.z + 2 + i * 0.3);
      shaft.rotation.z = -1.25 + i * 0.3 + (r() - 0.5) * 0.12;
      follow.add(shaft);
    }
  }
  if (look.night > 0.2) {
    const n = Math.round(320 * look.night);
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
    // Legends League: aurora ribbons over the pitch.
    ['#3affc0', '#4ab8ff', '#b06aff', '#ff5ac8'].forEach((c, i) => {
      const arc = mesh(new THREE.TorusGeometry(250 - i * 16, 5 + i * 2, 4, 48, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(c), fog: false, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      arc.position.set(-30 + i * 22, -40 + i * 6, -330);
      arc.scale.y = 0.7 + i * 0.06;
      follow.add(arc);
    });
  }
  // Tall piled clouds with shaded, flat bases.
  const cloudLit = '#ffffff';
  const cloudShade = '#' + new THREE.Color('#b9c6e6').lerp(look.skyTop, 0.25).getHexString();
  const lump = (x: number, y: number, z: number, s: number, c = cloudLit) => part(sph(1, 8, 6), c, x, y, z, s, s * 0.8, s * 0.8);
  const cloudCol = new THREE.Color('#ffffff').lerp(look.skyLow, 0.25 + look.night * 0.5);
  const clouds = instanced(
    merge([part(sph(1, 8, 6), cloudShade, 0, -0.25, 0, 2.9, 0.4, 1.1), lump(0, 0.35, 0, 1.25), lump(1.3, 0.15, 0.1, 0.95), lump(-1.4, 0.1, 0, 0.9), lump(0.5, 1.05, -0.1, 0.9), lump(-0.5, 0.85, 0.1, 0.75), lump(2.1, -0.02, 0, 0.6, cloudShade), lump(-2.2, -0.05, 0, 0.55, cloudShade)]),
    new THREE.MeshBasicMaterial({ vertexColors: true, color: cloudCol, fog: false }),
    Array.from({ length: 18 }, () => mat4((r() - 0.5) * 560, 34 + r() * 70, -110 - r() * 240, 9 + r() * 15)));
  follow.add(clouds);
  g.add(follow);

  const ground = mesh(new THREE.PlaneGeometry(900, TRACK_LEN + 500), toon({ color: look.ground }));
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
  const side = toon({ color: look.track[0] });
  const track = mesh(box(W * 2 + 0.4, 0.3, TRACK_LEN), [side, side, toon({ map: tex }), side, side, side] as unknown as THREE.Material);
  track.position.set(0, -0.15, zMid);
  track.receiveShadow = true;
  g.add(track);
  const kerbTex = canvasTex(8, 64, (c) => {
    c.fillStyle = '#f4efe6';
    c.fillRect(0, 0, 8, 64);
    c.fillStyle = look.kerb;
    c.fillRect(0, 0, 8, 32);
  });
  kerbTex.wrapT = THREE.RepeatWrapping;
  kerbTex.repeat.y = TRACK_LEN / 4;
  kerbTex.magFilter = THREE.NearestFilter;
  const boardMat = bannerTexture(look.night, look.kerb);
  for (const s of [-1, 1]) {
    const kerb = mesh(box(0.5, 0.36, TRACK_LEN), toon({ map: kerbTex }));
    kerb.position.set(s * (W + 0.45), -0.12, zMid);
    kerb.receiveShadow = true;
    const board = mesh(new THREE.PlaneGeometry(TRACK_LEN, 0.9), boardMat);
    board.rotation.y = -s * Math.PI / 2;
    board.position.set(s * (W + 1.6), 0.45, zMid);
    g.add(kerb, board);
  }

  // Gantries every 60 units: dark pylons, a beam in the world colour, hanging banners, and a light bar.
  const archGeo = merge([
    ...[-1, 1].flatMap((s) => [part(box(0.34, 11.2, 0.34), '#2a2c48', s * (W + 1), 5.6, 0), part(box(0.7, 0.5, 0.7), '#3c4066', s * (W + 1), 0.25, 0), part(box(0.9, 1.6, 0.1), look.kerb, s * (W + 1), 8.6, 0.24)]),
    part(box(W * 2 + 2.6, 0.7, 0.34), look.kerb, 0, 11.1, 0), part(box(W * 2 + 2.6, 0.16, 0.42), '#2a2c48', 0, 11.52, 0),
    ...Array.from({ length: 5 }, (_v, i) => part(box(1.0, i % 2 ? 1.5 : 2.1, 0.06), i % 2 ? '#f4efe6' : look.kerb, -W + 0.8 + i * ((W * 2 - 1.6) / 4), i % 2 ? 9.95 : 9.65, 0)),
  ]);
  const archZ = Array.from({ length: Math.floor(TRACK_LEN / 60) }, (_v, i) => mat4(0, 0, -30 - i * 60, 1));
  const arches = instanced(archGeo, propMat, archZ, true);
  g.add(low ? arches : ink(arches, 0.05));
  g.add(instanced(merge(Array.from({ length: 13 }, (_v, i) => part(box(0.34, 0.12, 0.1), i % 2 ? '#fff2a0' : '#ffffff', -W + i * (W / 6), 10.72, 0.2, 1, 1, 1, 0, 0, 1.5 + look.night * 0.7))), glowMat, archZ));

  // Props: the mix changes along the run (zone A, zone B, pavilions).
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
  for (let i = 0; i < (low ? 50 : 120); i++) place[small].push(mat4((r() < 0.5 ? -1 : 1) * (W + 3 + r() * 30), 0, zr(), small === 'flower' ? 0.45 : 0.3 + r() * 0.5, undefined, r() * 6.28));
  for (let i = 0; i < 44; i++) {
    const s = 14 + r() * 18;
    place[far].push(mat4((r() < 0.5 ? -1 : 1) * ((id === 'beach' ? 120 : 78) + r() * 55), 0, zr() - 40, s, s * (0.8 + r() * 0.5), far === 'skyscraper' || far === 'keep' ? 0 : r() * 6.28));
  }
  for (const [k, mats] of Object.entries(place)) {
    if (!mats.length) continue;
    const p = PROTOS[k]();
    const im = instanced(p.geo, propMat, mats, k !== far && k !== small);
    g.add(low || k === far || k === small ? im : ink(im, 0.05));
    if (p.glow) g.add(instanced(p.glow, glowMat, mats));
  }
  if (id === 'beach') {
    const sea = mesh(new THREE.PlaneGeometry(400, TRACK_LEN + 500), toon({ color: '#1fa8e0', emissive: '#06406a' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(W + 22 + 200, 0.02, zMid);
    g.add(sea);
  }
  let dragon: THREE.Object3D | null = null;
  if (id === 'castle') {
    // A dragon circles over the keep: dark scales, ember wings, long neck and tail.
    const sc = '#5a1830';
    const wing = (s: number) => [part(cone(2.2, 4.6, 3), '#d8502a', s * 3.1, 0.5, -0.2, 1, 1, 0.1, 0, s * 1.3), part(cone(0.16, 4.8, 4), sc, s * 3.0, 0.6, 0.5, 1, 1, 1, 0, s * 1.3)];
    const d = mesh(merge([
      part(sph(1.2, 10, 8), sc, 0, 0, 0, 0.9, 0.8, 2.2), part(sph(0.6, 8, 6), sc, 0, 0.5, 2.3, 0.8, 0.8, 1.6), part(sph(0.62, 10, 8), sc, 0, 0.9, 3.5, 0.85, 0.75, 1.3),
      part(cone(0.45, 1.2, 5), '#74223c', 0, 0.75, 4.5, 1, 1, 0.7, Math.PI / 2),
      part(cone(0.6, 4.6, 6), sc, 0, 0, -4.2, 1, 1, 1, -Math.PI / 2), part(cone(0.14, 0.9, 4), '#f0d8a0', -0.32, 1.55, 3.0, 1, 1, 1, -0.7), part(cone(0.14, 0.9, 4), '#f0d8a0', 0.32, 1.55, 3.0, 1, 1, 1, -0.7),
      part(sph(1, 8, 6), '#c08a48', 0, -0.45, 0.2, 0.6, 0.45, 1.9), ...wing(-1), ...wing(1),
      ...[0, 1, 2, 3, 4].map((i) => part(cone(0.2, 0.6, 4), '#d8502a', 0, 1.05 - i * 0.06, 1.4 - i * 1.0, 1, 1, 0.5)),
    ]), propMat);
    d.add(mesh(merge([part(sph(0.1, 5, 4), '#ffd84a', -0.36, 1.08, 3.95, 1, 0.6, 1.4, 0, 0, 2.6), part(sph(0.1, 5, 4), '#ffd84a', 0.36, 1.08, 3.95, 1, 0.6, 1.4, 0, 0, 2.6)]), glowMat));
    dragon = low ? d : ink(d, 0.07);
    dragon.scale.setScalar(1.6);
    g.add(dragon);
  }
  return { group: g, look, follow, dragon };
}
export type WorldArt = ReturnType<typeof buildWorld>;

// ---------------- Gates ----------------
function gateTexture(gate: Gate) {
  const good = gateGood(gate);
  const [hi, lo, edge, inkC] = good ? ['#59d0ff', '#1b3fe0', '#c8f4ff', '#0a1a6a'] : ['#ff7a8a', '#c4123c', '#ffd0d8', '#5a0a1e'];
  return canvasTex(256, 192, (g) => {
    // slanted panel with cut corners
    const shape = (inset: number) => {
      g.beginPath();
      g.moveTo(30 + inset, inset);
      g.lineTo(256 - inset, inset);
      g.lineTo(256 - inset, 150 - inset * 0.5);
      g.lineTo(226 - inset, 192 - inset);
      g.lineTo(inset, 192 - inset);
      g.lineTo(inset, 42 + inset * 0.5);
      g.closePath();
    };
    shape(2);
    g.fillStyle = inkC;
    g.fill();
    shape(10);
    const grad = g.createLinearGradient(0, 0, 60, 192);
    grad.addColorStop(0, hi);
    grad.addColorStop(1, lo);
    g.fillStyle = grad;
    g.globalAlpha = 0.93;
    g.fill();
    g.globalAlpha = 1;
    g.save();
    g.clip();
    // hard-edged sheen bands
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.beginPath();
    g.moveTo(40, 0); g.lineTo(120, 0); g.lineTo(30, 192); g.lineTo(-50, 192);
    g.fill();
    g.beginPath();
    g.moveTo(140, 0); g.lineTo(162, 0); g.lineTo(72, 192); g.lineTo(50, 192);
    g.fill();
    g.fillStyle = 'rgba(0,0,20,0.22)';
    g.fillRect(0, 150, 256, 42);
    g.restore();
    shape(10);
    g.lineWidth = 4;
    g.strokeStyle = edge;
    g.stroke();
    const text = gateText(gate);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'miter';
    g.miterLimit = 2;
    const lines = gate.then ? text.split(' ') : [text];
    let size = gate.then ? 78 : 112;
    const font = () => (g.font = `italic 900 ${size}px ${FONT}`);
    font();
    while (Math.max(...lines.map((l) => g.measureText(l).width)) > 200) {
      size -= 6;
      font();
    }
    lines.forEach((l, i) => {
      const y = lines.length === 1 ? 102 : 60 + i * 76;
      g.lineWidth = 16;
      g.strokeStyle = inkC;
      g.strokeText(l, 126, y + 3);
      g.fillStyle = '#ffffff';
      g.fillText(l, 126, y);
    });
  });
}
let shimmerTex: THREE.Texture | null = null;
let shineMat: THREE.MeshBasicMaterial | null = null;
/** One texture for every gate's moving glint; the game scrolls its offset. */
export function gateShimmer() {
  if (shimmerTex) return shimmerTex;
  shimmerTex = canvasTex(256, 64, (g) => {
    g.fillStyle = '#ffffff';
    for (const [x, w] of [[96, 26], [134, 8]]) {
      g.beginPath();
      g.moveTo(x + 30, 0); g.lineTo(x + 30 + w, 0); g.lineTo(x + w, 64); g.lineTo(x, 64);
      g.fill();
    }
  });
  shimmerTex.wrapS = THREE.RepeatWrapping;
  shimmerTex.repeat.x = 0.5;
  return shimmerTex;
}
const postGeo = merge([part(box(0.2, 3.0, 0.2), '#2a2c48', 0, 1.5, 0), part(box(0.42, 0.3, 0.42), '#3c4066', 0, 0.15, 0), part(box(0.26, 0.12, 0.26), '#ffcf3a', 0, 2.72, 0)]);
const orbGeo = part(new THREE.OctahedronGeometry(0.24), '#fff2b0', 0, 3.3, 0, 0.8, 1.5, 0.8, 0, 0, 1.5);
const glintGeo = starGeometry();
postGeo.userData.shared = orbGeo.userData.shared = glintGeo.userData.shared = true;
const glintMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.9, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
glintMat.userData.shared = true;

export function buildGateRow(opts: Gate[]) {
  const group = new THREE.Group();
  const k = opts.length;
  const lane = (W * 2) / k;
  const glints: THREE.Mesh[] = [];
  for (let i = 0; i <= k; i++) {
    const p = ink(mesh(postGeo, smoothMat), 0.035);
    p.position.x = -W + i * lane;
    p.castShadow = true;
    const o = mesh(orbGeo, glowMat);
    o.position.x = p.position.x;
    const gl = mesh(glintGeo, glintMat);
    gl.position.set(p.position.x, 3.3, 0.3);
    glints.push(gl);
    group.add(p, o, gl);
  }
  shineMat ??= new THREE.MeshBasicMaterial({ map: gateShimmer(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3, side: THREE.DoubleSide });
  shineMat.userData.shared = true;
  const shine = shineMat;
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
  return { group, panels, lane, glints };
}

// ---------------- Traps ----------------
const TRAP_GEO = new Map<TrapKind, THREE.BufferGeometry[]>();
function trapGeo(kind: TrapKind): THREE.BufferGeometry[] {
  let g = TRAP_GEO.get(kind);
  if (g) return g;
  const dots = (r: number, col: string) => [[0, 1, 0], [0, -1, 0], [0.9, 0.4, 0], [-0.9, 0.4, 0], [0, 0.4, 0.9], [0, 0.4, -0.9], [0.65, -0.4, 0.65], [-0.65, -0.4, 0.65], [0.65, -0.4, -0.65], [-0.65, -0.4, -0.65]]
    .map(([x, y, z]) => part(sph(r * 0.3, 6, 4), col, x * r * 0.86, y * r * 0.86, z * r * 0.86));
  const eyes = (y: number, z: number, dx: number, s = 0.1) => [-1, 1].map((k) => part(sph(s, 6, 4), '#1d1828', k * dx, y, z, 1.2, 0.7, 0.6));
  switch (kind) {
    case 'ball': g = [merge([part(sph(0.9, 14, 10), '#ffffff'), ...dots(0.9, '#1d1828')])]; break;
    case 'snowball': g = [merge([part(sph(1, 12, 9), '#ffffff'), ...dots(1, '#cfe2ff')])]; break;
    case 'boulder': g = [merge([part(new THREE.IcosahedronGeometry(1, 1), '#a8745a'), ...dots(1, '#8a5a44')])]; break;
    case 'gumball': g = [merge([part(new THREE.IcosahedronGeometry(1, 1), '#c04ae0'), part(new THREE.IcosahedronGeometry(1.02, 0), '#7a3ad0', 0, 0, 0, 0.75, 1.05, 0.75)])]; break;
    case 'tumbleweed': g = [merge([0, 1, 2, 3].map((i) => part(new THREE.TorusGeometry(0.7, 0.07, 4, 12), i % 2 ? '#b08a50' : '#8a6a3a', 0, 0, 0, 1, 1, 1, i * 0.8, i * 1.1)))]; break;
    case 'penguin': g = [merge([part(cap(0.4, 0.5), '#2a3050', 0, 0.75, 0), part(sph(0.34, 8, 6), '#ffffff', 0, 0.65, 0.16, 1, 1.3, 0.8), part(cone(0.1, 0.25, 5), '#ffa03a', 0, 1.1, 0.42, 1, 1, 1, Math.PI / 2), ...eyes(1.2, 0.33, 0.15, 0.08), part(sph(0.16, 6, 4), '#ffa03a', -0.2, 0.08, 0.15, 1, 0.4, 1.5), part(sph(0.16, 6, 4), '#ffa03a', 0.2, 0.08, 0.15, 1, 0.4, 1.5), part(sph(0.12, 6, 4), '#2a3050', -0.45, 0.75, 0, 0.5, 2.4, 1), part(sph(0.12, 6, 4), '#2a3050', 0.45, 0.75, 0, 0.5, 2.4, 1)])]; break;
    case 'crab': g = [merge([part(sph(0.45, 8, 6), '#ff6b5a', 0, 0.3, 0, 1.3, 0.6, 1), part(sph(0.2, 6, 4), '#ff6b5a', -0.65, 0.45, 0.25), part(sph(0.2, 6, 4), '#ff6b5a', 0.65, 0.45, 0.25), ...eyes(0.72, 0.2, 0.15, 0.08), ...[-1, 1].flatMap((s) => [-0.2, 0, 0.2].map((z) => part(cyl(0.03, 0.03, 0.4, 4), '#e0523a', s * 0.55, 0.12, z, 1, 1, 1, 0, s)))])]; break;
    case 'twister': g = [merge([0, 1, 2, 3, 4].map((i) => part(cyl(0.35 + i * 0.22, 0.2 + i * 0.22, 0.42, 8), i % 2 ? '#e8d0a0' : '#d0b080', Math.sin(i) * 0.1, 0.25 + i * 0.44, 0)))]; break;
    case 'vacuum': g = [merge([part(cyl(0.75, 0.8, 0.3, 14), '#e8e8f4', 0, 0.2, 0), part(cyl(0.4, 0.4, 0.08, 12), '#4a4a6a', 0, 0.38, 0), ...eyes(0.42, 0.5, 0.2, 0.11)]), part(sph(0.1, 6, 5), '#22e0d0', 0, 0.46, 0, 1, 1, 1, 0, 0, 2.5)]; break;
    case 'dragon': g = [merge([part(sph(0.5, 10, 8), '#8a2a3a', 0, 0.55, 0, 1, 1, 1.2), part(sph(0.38, 10, 8), '#8a2a3a', 0, 1.1, 0.35), part(sph(0.2, 6, 5), '#a83a48', 0, 1.02, 0.68, 1.2, 0.8, 1), ...eyes(1.25, 0.6, 0.17, 0.09), part(cone(0.07, 0.22, 4), '#fff0c8', -0.17, 1.5, 0.3), part(cone(0.07, 0.22, 4), '#fff0c8', 0.17, 1.5, 0.3), part(cone(0.35, 0.8, 3), '#ff9a4a', -0.6, 0.9, -0.1, 1, 1, 0.15, 0, 1.2), part(cone(0.35, 0.8, 3), '#ff9a4a', 0.6, 0.9, -0.1, 1, 1, 0.15, 0, -1.2), part(cone(0.2, 0.8, 5), '#8a2a3a', 0, 0.4, -0.8, 1, 1, 1, -1.9), part(sph(0.35, 8, 6), '#d8a060', 0, 0.45, 0.2, 0.8, 0.8, 1)])]; break;
    case 'sprinkler': g = [part(cyl(0.3, 0.4, 0.4, 8), '#ffd23f', 0, 0.2, 0), merge([part(box(4.4, 0.12, 0.12), '#3a7bd5', 0, 0.4, 0), ...[-1, 1].flatMap((s) => [1, 2, 3, 4, 5, 6, 7].map((i) => part(sph(0.14, 6, 4), '#9fe4ff', (s * 2.2 * i) / 7, 0.65 + Math.sin((i / 7) * Math.PI) * 0.5, 0)))])]; break;
    case 'candycane': g = [part(cyl(0.35, 0.45, 0.5, 6), '#2a2c48', 0, 0.25, 0), merge(Array.from({ length: 11 }, (_v, i) => part(cyl(0.2, 0.2, 0.4, 8), i % 2 ? '#e05ac8' : '#4ad8e8', -2 + i * 0.4, 0.6, 0, 1, 1, 1, 0, Math.PI / 2)))]; break;
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
  for (const o of [...group.children] as THREE.Mesh[]) if (o.material === propMat) ink(o, 0.04);
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
  ink(frame, 0.04);
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
  /** t = seconds since the ball hit at (hx, hy); pass a negative t for a still net. `amp` scales the bulge. */
  const ripple = (t: number, hx: number, hy: number, amp = 1) => {
    const p = ng.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      const d = Math.hypot(x - hx, y - hy);
      const edge = Math.min(1, (3.4 - Math.abs(x)) * 1.2) * Math.min(1, y * 1.5);
      const w = t < 0 ? 0 : amp * Math.exp(-t * 1.6) * (Math.exp(-d * 0.5) * 1.5 * Math.exp(-t * 2) + Math.sin(d * 3 - t * 14) * 0.3 * Math.exp(-d * 0.35));
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
      parts.push(part(box(1.1, 0.7 * (t + 1), len), t % 2 ? '#3a3f60' : '#454b70', x, 0.35 * (t + 1), zc));
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
      parts.push(part(box(W * 2 + 8, 0.7 * (t + 1), 1.1), t % 2 ? '#3a3f60' : '#454b70', 0, 0.35 * (t + 1), z));
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

/** Flare pod at the stadium edge, pointing up and inward. */
export function buildCannon(side: number) {
  const m = mesh(merge([
    part(cyl(0.3, 0.24, 1.1, 6), '#2a2c48', 0, 0.75, 0, 1, 1, 1, 0, side * 0.5), part(cyl(0.34, 0.34, 0.14, 6), '#ffb020', -side * 0.26, 1.22, 0, 1, 1, 1, 0, side * 0.5),
    part(box(0.8, 0.3, 0.8), '#3c4066', 0, 0.15, 0),
  ]), smoothMat);
  m.castShadow = true;
  return m;
}

const soccerGeo = () => trapGeo('ball')[0];
export function soccerBall(r: number) {
  const m = mesh(soccerGeo(), smoothMat);
  m.scale.setScalar(r / 0.9);
  m.castShadow = true;
  return ink(m, 0.05);
}
/** The mark over captains, aces, and boss keepers: a slim gold crystal. */
export function buildCrown() {
  return mesh(part(new THREE.OctahedronGeometry(0.1), '#ffcf3a', 0, 0.16, 0, 0.55, 1.5, 0.55, 0, 0, 1.6), glowMat);
}
export const gloveGeo = merge([part(sph(0.11, 8, 6), '#f4efe6', 0, 0, 0, 1.1, 1.25, 0.7), part(box(0.2, 0.07, 0.17), '#e8305a', 0, -0.13, 0)]);
gloveGeo.userData.shared = true;

/** A flat star with `points` sharp points; `inner` is the waist radius. 4 points makes an anime glint, many make an impact burst. */
export function starGeometry(points = 4, inner = 0.16, jag = 0) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? inner : 1 - jag * ((i * 7) % 5) * 0.2;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}
