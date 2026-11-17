// The 3D world: town plan, holes, swallow physics, rival bots, power-ups, effects and rendering. No DOM menus here.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { build, rimWith, MAPS, type MapDef, type MapId, type Part, type PropDef } from './props';
import { G } from './parts';
import { TUNE } from './data';

export type Mode = 'battle' | 'solo' | 'attract' | 'level';
export type Style = 'muncher' | 'hunter' | 'explorer';
export type PowKind = 'magnet' | 'speed' | 'grow' | 'clock' | 'rush' | 'treasure' | 'thorn';
export type Ability = 'gulp' | 'giant' | 'freeze';
export type Quality = 'high' | 'low';

export const BOT_NAMES = ['Eclipse', 'Bramble', 'Ashfang', 'Willowisp', 'Gloam', 'Vesper', 'Astra', 'Kaido', 'Thistle', 'Nimbus', 'Onyx', 'Riven', 'Sable', 'Jinrai', 'Kestrel', 'Talon'];
const BOT_STYLES: Style[] = ['muncher', 'hunter', 'explorer'];
const BOT_COLORS = [0xffa94d, 0x3fd0d4, 0xffd54a];

export interface Skin { id: string; name: string; price: number; colors: number[]; arcs: number; inner: number; parts: Part[] }

export interface Hole {
  name: string; color: number; player: boolean; style: Style | null;
  x: number; z: number; vx: number; vz: number; dx: number; dz: number;
  mass: number; startMass: number; R: number; score: number; count: number;
  alive: boolean; respawnT: number; shieldT: number; dieT: number; killer: Hole | null;
  magnetT: number; speedT: number; boostT: number; boostCd: number; rushT: number; giantT: number; pulse: number;
  tx: number; tz: number; thinkT: number; stuck: number;
  group: THREE.Group; rim: THREE.Mesh; vortex: THREE.Mesh; vortex2: THREE.Mesh; halo: THREE.Mesh; runes: THREE.Mesh;
}

interface Obj {
  mesh: THREE.InstancedMesh; i: number; def: PropDef;
  x: number; z: number; mx: number; mz: number; ry: number; sc: number; cx: number; cz: number; hx: number; hz: number; diag: number; h: number;
  pts: number; score: number;
  state: 0 | 1 | 2; tilt: number; tiltT: number; ax: number; az: number; grow: number; backT: number;
  hole: Hole | null; ox: number; oz: number; y: number; vy: number;
}

interface Pow { kind: PowKind; x: number; z: number; mesh: THREE.Mesh; alive: boolean }

export interface Swallowed { kind: string; score: number; diag: number; boss: boolean }
export interface WorldEvents {
  swallow(h: Hole, o: Swallowed): void;
  holeEaten(victim: Hole, by: Hole): void;
  power(h: Hole, kind: PowKind): void;
}

export interface SetupOpts {
  skin: Skin; name: string; startR: number; time: number; bots: number; seed?: number;
  speed?: number; // player speed multiplier
  gain?: number; // player growth multiplier
  reach?: number; // player rim reach bonus (0..0.3)
  half?: number; // arena half width
  maxDiag?: number; // leave out props bigger than this (early levels)
  botSkill?: number; // 0..1
  regrow?: boolean; // small things grow back (battle)
  slip?: boolean; // icy ground
  pows?: PowKind[]; // which power-ups appear; [] for none
  thorns?: number; treasure?: boolean;
}

export const radiusFor = (mass: number) => Math.sqrt(TUNE.R0 * TUNE.R0 + TUNE.K * mass);
export const massFor = (R: number) => Math.max(0, (R * R - TUNE.R0 * TUNE.R0) / TUNE.K);
const UP = new THREE.Vector3(0, 1, 0);
const CELL = 4, ROAD = 3.2, PLAZA = 7;

/** Small seeded random so a layout can be repeated (every campaign level has its own town). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
const mix = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

// ---------------------------------------------------------------- materials
const uTime = { value: 0 };
const STENCIL = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });

/** The one cel ramp shared by every Camalot game (D7): three hard steps. */
const toonRamp = new THREE.DataTexture(new Uint8Array([89, 179, 255]), 3, 1, THREE.RedFormat);
toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
toonRamp.needsUpdate = true;

/** Wind sway, flags and spinning parts, shared by the cel material and its ink hull (which also pushes out along aOut). */
const animate = (s: { uniforms: Record<string, unknown>; vertexShader: string }, ink: boolean) => {
  s.uniforms.uTime = uTime;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aFx; attribute float aGlow; attribute vec3 aOut; uniform float uTime; varying float vGlow;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vGlow = aGlow;
      ${ink ? 'transformed += aOut;' : ''}
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
      #else
        float ph = 0.0;
      #endif
      if (aFx.w > 0.5 && aFx.w < 1.5) {
        transformed.x += sin(uTime * 1.7 + ph + position.y) * 0.045 * position.y;
        transformed.z += cos(uTime * 1.3 + ph) * 0.03 * position.y;
      } else if (aFx.w < 2.5 && aFx.w > 1.5) {
        transformed.z += sin(uTime * 8.0 + ph - position.x * 4.0) * 0.14;
      } else if (aFx.w > 2.5) {
        float a = uTime * 1.2 + ph, c = cos(a), sn = sin(a);
        if (aFx.w < 3.5) { vec2 p = transformed.xy - aFx.xy; transformed.xy = aFx.xy + vec2(p.x * c - p.y * sn, p.x * sn + p.y * c); }
        else { vec2 p = transformed.xz - aFx.xz; transformed.xz = aFx.xz + vec2(p.x * c - p.y * sn, p.x * sn + p.y * c); }
      }`);
};
/** Shared prop material: cel shading, vertex colours, glow and a hard rim light. */
const propMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp });
propMat.onBeforeCompile = (s) => {
  animate(s, false);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vGlow;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * 1.6;')
    .replace('#include <opaque_fragment>', `float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      outgoingLight += smoothstep(0.66, 0.72, fr) * 0.25 * diffuseColor.rgb;
      #include <opaque_fragment>`);
};
/** Ink outline: an inverted hull in a darkened version of each part's own colour. */
const inkMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
inkMat.onBeforeCompile = (s) => {
  animate(s, true);
  s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = diffuseColor.rgb * 0.16 + vec3(0.012, 0.008, 0.022);');
};

const partMat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, w = size) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Inner vortex: five sharp arms winding into a white-hot core. */
const spiralTex = canvasTex(256, (c, s) => {
  c.translate(s / 2, s / 2);
  c.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) {
    c.rotate((Math.PI * 2) / 5);
    for (let i = 1; i < 60; i++) {
      const t = i / 60, t0 = (i - 1) / 60, a = t * 4.6, a0 = t0 * 4.6;
      c.strokeStyle = `rgba(255,255,255,${0.9 * (1 - t) + 0.1})`;
      c.lineWidth = 1.5 + t * 7;
      c.beginPath(); c.moveTo(Math.cos(a0) * t0 * s * 0.48, Math.sin(a0) * t0 * s * 0.48); c.lineTo(Math.cos(a) * t * s * 0.48, Math.sin(a) * t * s * 0.48); c.stroke();
    }
  }
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(-s / 2, -s / 2, s, s);
});
/** Energy rim: a hot ring with flares licking outward. */
const haloTex = canvasTex(256, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, s * 0.29, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.12, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  c.translate(s / 2, s / 2);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * 6.283 + Math.sin(i * 7.3) * 0.06, r0 = s * 0.31, r1 = s * (0.36 + 0.13 * Math.abs(Math.sin(i * 12.9898)));
    c.beginPath(); c.moveTo(Math.cos(a - 0.05) * r0, Math.sin(a - 0.05) * r0); c.lineTo(Math.cos(a + 0.12) * r1, Math.sin(a + 0.12) * r1); c.lineTo(Math.cos(a + 0.05) * r0, Math.sin(a + 0.05) * r0); c.fill();
  }
});
/** Rune circle on the ground around the rift: two rings, tick marks and a band of glyphs. */
const runeTex = canvasTex(512, (c, s) => {
  c.translate(s / 2, s / 2);
  c.strokeStyle = '#fff'; c.lineCap = 'square';
  for (const [r, w] of [[0.485, 5], [0.455, 2], [0.36, 3]]) { c.lineWidth = w; c.beginPath(); c.arc(0, 0, s * r, 0, 7); c.stroke(); }
  for (let i = 0; i < 72; i++) { c.rotate(6.283 / 72); c.lineWidth = i % 6 ? 1.5 : 4; c.beginPath(); c.moveTo(0, -s * 0.455); c.lineTo(0, -s * (i % 6 ? 0.44 : 0.425)); c.stroke(); }
  const N = 16, u = s * 0.022;
  for (let i = 0; i < N; i++) {
    c.save(); c.rotate((i / N) * 6.283); c.translate(0, -s * 0.395); c.lineWidth = 3.5;
    // each glyph: a stem plus strokes picked from a fixed set by a hash of i
    const k = (i * 2654435761) >>> 0, P: [number, number][] = [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1], [0, 1]];
    c.beginPath(); c.moveTo(0, -u); c.lineTo(0, u);
    for (let b = 0; b < 4; b++) { const p = P[(k >>> (b * 3)) & 7], q = P[(k >>> (b * 3 + 12)) & 7]; c.moveTo(p[0] * u, p[1] * u); c.lineTo(q[0] * u * 0.2, q[1] * u); }
    c.stroke(); c.restore();
  }
});
/** Anime impact burst: a white-hot core with radial speed lines. */
const burstTex = canvasTex(256, (c, s) => {
  c.translate(s / 2, s / 2);
  c.fillStyle = '#fff';
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * 6.283 + Math.sin(i * 5.1) * 0.05, h = Math.abs(Math.sin(i * 12.9898)), r0 = s * (0.15 + 0.12 * h), r1 = s * (0.34 + 0.15 * Math.abs(Math.sin(i * 78.233))), w = 0.012 + 0.03 * h;
    c.beginPath(); c.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0); c.fill();
  }
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(-s / 2, -s / 2, s, s);
});
/** Light shaft: bright down the middle, fading toward the ground. */
const shaftTex = canvasTex(64, (c, s) => {
  const g = c.createLinearGradient(0, 0, s, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  c.globalCompositeOperation = 'destination-in';
  const v = c.createLinearGradient(0, 0, 0, s);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.25, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = v; c.fillRect(0, 0, s, s);
});
const SHARED_TEX = new Set<THREE.Texture>([spiralTex, haloTex, runeTex]);
/** Sky dome picture: deep zenith, glowing horizon, sun bloom, flat-bottomed cloud banks, stars on night maps. */
function skyTex(m: MapDef) {
  return canvasTex(1024, (c, s) => {
    const w = s * 2, hz = s / 2, rnd = rng(m.sky[0]);
    const g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, css(mix(m.sky[0], 0x04020c, 0.5))); g.addColorStop(0.7, css(m.sky[0])); g.addColorStop(0.9, css(mix(m.sky[0], m.sky[1], 0.45))); g.addColorStop(1, css(m.sky[1]));
    c.fillStyle = g; c.fillRect(0, 0, w, hz);
    c.fillStyle = css(m.sky[1]); c.fillRect(0, hz, w, hz);
    if (m.ambient === 'stars' || m.ambient === 'embers') for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; c.fillRect(rnd() * w, rnd() * hz * 0.85, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
    const sx = w * 0.62, sy = hz * 0.86, sun = c.createRadialGradient(sx, sy, 0, sx, sy, s * 0.4);
    sun.addColorStop(0, '#fff'); sun.addColorStop(0.04, css(m.sun)); sun.addColorStop(0.12, css(m.sun) + '90'); sun.addColorStop(1, css(m.sun) + '00');
    c.fillStyle = sun; c.fillRect(0, 0, w, hz);
    const lit = css(mix(m.sky[1], 0xffffff, 0.7)), shade = css(mix(m.sky[0], m.sky[1], 0.45));
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = hz * (0.8 + rnd() * 0.19), k = 0.25 + rnd() * 0.45;
      for (const [col, dy] of [[shade, 5 * k], [lit, 0]] as const) {
        c.save(); c.beginPath(); c.rect(x - 90 * k, y - 60 * k, 180 * k, 60 * k + dy); c.clip();
        c.fillStyle = col; c.beginPath();
        for (let j = 0; j < 6; j++) { const px = x + (j - 2.5) * 22 * k, r = (12 + 14 * Math.sin((j + 0.5) * 0.52) + ((i * 7 + j * 3) % 5)) * k; c.moveTo(px + r, y + dy); c.arc(px, y + dy, r, 0, 7); }
        c.fill(); c.restore();
      }
    }
  }, 2048);
}

const spike = (n: number, col: number): Part[] => Array.from({ length: n }, (_, i): Part => {
  const a = (i / n) * Math.PI * 2;
  return ['cone', col, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0.26, 0.5, 0.26, 0, -a, -Math.PI / 2];
});
const POW_PARTS: Record<PowKind, Part[]> = {
  magnet: [
    ['cyl', 0xef5350, -0.35, 0.1, 0, 0.3, 0.7, 0.3], ['cyl', 0xef5350, 0.35, 0.1, 0, 0.3, 0.7, 0.3],
    ['box', 0xef5350, 0, 0.5, 0, 1.0, 0.3, 0.3], ['cyl', G | 0xeceff1, -0.35, -0.35, 0, 0.32, 0.25, 0.32], ['cyl', G | 0xeceff1, 0.35, -0.35, 0, 0.32, 0.25, 0.32],
  ],
  speed: [
    ['box', G | 0xffd54a, 0.12, 0.35, 0, 0.26, 0.6, 0.2, 0, 0, -0.5], ['box', G | 0xffd54a, 0, 0, 0, 0.5, 0.18, 0.2, 0, 0, 0.1], ['box', G | 0xffd54a, -0.12, -0.35, 0, 0.26, 0.6, 0.2, 0, 0, -0.5],
  ],
  grow: [['cone', G | 0x69db7c, 0, 0.3, 0, 0.9, 0.6, 0.3], ['box', G | 0x69db7c, 0, -0.2, 0, 0.36, 0.6, 0.24]],
  clock: [
    ['cone', G | 0xffe08a, 0, 0.25, 0, 0.7, 0.5, 0.7, Math.PI], ['cone', G | 0xffe08a, 0, -0.25, 0, 0.7, 0.5, 0.7],
    ['cyl', 0x8d6e4a, 0, 0.55, 0, 0.9, 0.1, 0.9], ['cyl', 0x8d6e4a, 0, -0.55, 0, 0.9, 0.1, 0.9],
  ],
  rush: [['oct', G | 0xff8fc8, 0, 0, 0, 0.9, 1.1, 0.9], ['oct', G | 0xffffff, 0, 0, 0, 1.2, 0.3, 1.2], ...spike(5, G | 0xffd54a)],
  treasure: [
    ['box', 0xb07a46, 0, -0.15, 0, 1.1, 0.6, 0.75], ['cyl', 0xb07a46, 0, 0.15, 0, 0.75, 1.1, 0.75, 0, 0, Math.PI / 2],
    ['box', G | 0xffd54a, 0, 0, 0.38, 0.2, 0.3, 0.06], ['box', 0xffd54a, -0.4, 0, 0, 0.1, 0.95, 0.8], ['box', 0xffd54a, 0.4, 0, 0, 0.1, 0.95, 0.8],
    ['oct', G | 0x7df9ff, 0, 0.85, 0, 0.4, 0.55, 0.4],
  ],
  thorn: [['ball', 0x5a2a6a, 0, 0, 0, 0.8, 0.8, 0.8], ...spike(7, 0x7a3a8a), ['cone', 0x7a3a8a, 0, 0.5, 0, 0.26, 0.5, 0.26], ['ball', G | 0xff5a5a, 0, 0, 0.36, 0.2, 0.2, 0.12]],
};
const AMBIENT: Record<MapDef['ambient'], { col: number[]; vy: number; n: number }> = {
  petals: { col: [0x553040, 0x554048], vy: -0.7, n: 9 }, snow: { col: [0x505560, 0x404858], vy: -1.5, n: 22 }, spray: { col: [0x304858, 0x405060], vy: 0.5, n: 6 },
  dust: { col: [0x504028, 0x403820], vy: 0.15, n: 8 }, leaves: { col: [0x554410, 0x503008], vy: -0.9, n: 8 }, sparkle: { col: [0x603050, 0x305060, 0x605020], vy: 0.4, n: 12 },
  embers: { col: [0x802808, 0x903c08], vy: 1.4, n: 16 }, stars: { col: [0x505088, 0x806890, 0x408088], vy: 0.25, n: 16 },
};

/** Where the streets, water and plaza are on this map. */
interface Plan { H: number; rx: number[]; rz: number[]; plaza: boolean; river: { cx: number; A: number; k: number; ph: number; w: number } | null; seaZ: number | null; ponds: { x: number; z: number; r: number }[] }

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.5, 700);
  sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
  hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 1.1);
  map!: MapDef;
  half = 48;
  mode: Mode = 'attract';
  holes: Hole[] = [];
  player: Hole | null = null;
  total = 0; // objects on the map
  swallowed = 0; // objects gone (any hole)
  totalMass = 0;
  kinds = new Map<string, { label: string; count: number; diag: number }>();
  timeLeft = 0;
  paused = true;
  input = { x: 0, z: 0, boost: false };
  events: WorldEvents | null = null;
  quality: Quality = 'high';
  freezeT = 0;
  shake = 0;
  treasure: Pow | null = null;
  treasureR = 0; // the treasure only opens for a hole at least this wide
  auto = false; // test and balance runs: the bot brain steers the player
  goto: { x: number; z: number; R: number } | null = null; // auto: head here once this wide
  want = ''; // auto: the prop kind the goal asks for

  private content = new THREE.Group();
  private opts!: SetupOpts;
  private plan!: Plan;
  private objs: Obj[] = [];
  private grid: number[][] = [];
  private cols = 0;
  private wobbly = new Set<Obj>();
  private falling: Obj[] = [];
  private gone: Obj[] = [];
  private growing = new Set<Obj>();
  private dirty = new Set<THREE.InstancedMesh>();
  private pows: Pow[] = [];
  private powT = 0;
  private clock = 0;
  private rand = Math.random;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private composer: EffectComposer | null = null;
  private w = 1; private h = 1;
  private water: THREE.ShaderMaterial | null = null;
  private smokers: Obj[] = [];
  // particles
  private parts!: THREE.InstancedMesh;
  private P: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; g: number; col: THREE.Color }[] = [];
  private birds!: THREE.InstancedMesh;
  private ambT = 0;
  private sky = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  private shafts = new THREE.Group();
  private impacts: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number; size: number; col: THREE.Color }[] = [];

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.content);
    this.scene.fog = new THREE.Fog(0xffffff, 60, 200);
    this.parts = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), partMat, 500);
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    this.birds = new THREE.InstancedMesh(build([
      ['box', 0x4a4a5a, -0.32, 0.08, 0, 0.7, 0.05, 0.3, 0, 0, 0.3], ['box', 0x4a4a5a, 0.32, 0.08, 0, 0.7, 0.05, 0.3, 0, 0, -0.3], ['box', 0xf5f5f5, 0, 0, 0.05, 0.16, 0.12, 0.5],
    ]), propMat, 6);
    this.birds.frustumCulled = false;
    this.birds.castShadow = true;
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -20;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false }));
      m.position.set((i - 2.5) * 0.42 + Math.sin(i * 4.1) * 0.1, -0.05, -0.75 + ((i * 5) % 6) * 0.2);
      m.scale.set(0.16 + (i % 3) * 0.07, 1.9, 1);
      m.rotation.z = -0.5;
      m.renderOrder = 4;
      this.shafts.add(m);
    }
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: burstTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat);
      mesh.visible = false; mesh.renderOrder = 6;
      this.impacts.push({ mesh, mat, t: 9, life: 0.3, size: 1, col: new THREE.Color() });
      this.scene.add(mesh);
    }
    this.scene.add(this.parts, this.birds, this.sky, this.shafts);
    this.setQuality(quality);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const hi = q === 'high', dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(hi ? 2 : 1.25, dpr));
    this.renderer.shadowMap.enabled = hi;
    this.sun.castShadow = hi;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.birds.visible = hi;
    this.shafts.visible = hi;
    // Low keeps ink on buildings and landmarks only.
    this.content.traverse((o) => { if (o.userData.clutter !== undefined) o.visible = hi || !o.userData.clutter; });
    this.composer?.dispose();
    this.composer = null;
    if (hi) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, stencilBuffer: true, samples: 4 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.95));
      this.composer.addPass(new OutputPass());
    }
    this.scene.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).needsUpdate = true; });
    this.resize(this.w, this.h);
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- setup
  /** Builds a fresh round. `bots` rival holes; the player hole is skipped in attract mode. */
  setup(mapId: MapId, mode: Mode, opts: SetupOpts) {
    this.clear();
    this.opts = opts;
    this.map = MAPS.find((m) => m.id === mapId) ?? MAPS[0];
    this.half = opts.half ?? 48;
    this.mode = mode;
    this.rand = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const m = this.map;
    const skyMat = this.sky.material as THREE.MeshBasicMaterial;
    skyMat.map?.dispose();
    skyMat.map = skyTex(m);
    skyMat.needsUpdate = true;
    (this.scene.fog as THREE.Fog).color.setHex(m.sky[1]);
    this.sun.color.setHex(m.sun);
    for (const s of this.shafts.children) ((s as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(m.sun);
    this.hemi.color.setHex(m.hemi[0]); this.hemi.groundColor.setHex(m.hemi[1]);
    this.makePlan();
    this.buildGround();
    this.layout();
    this.timeLeft = opts.time;
    this.swallowed = 0; this.freezeT = 0; this.shake = 0;
    if (mode !== 'attract') {
      this.player = this.addHole(opts.name, opts.skin, true, null, opts.startR);
      this.player.x = 0; this.player.z = 3;
    }
    const names = [...BOT_NAMES].sort(() => this.rand() - 0.5);
    for (let b = 0; b < opts.bots; b++) {
      const skin: Skin = { id: 'bot', name: '', price: 0, colors: [BOT_COLORS[b % 3]], arcs: 1, inner: 0x2a1e30, parts: [] };
      const h = this.addHole(names[b], skin, false, BOT_STYLES[b % 3], TUNE.R0 + 0.05 + (opts.botSkill ?? 0) * 1.0);
      const a = (b / opts.bots) * Math.PI * 2 + 0.5;
      h.x = Math.cos(a) * this.half * 0.55; h.z = Math.sin(a) * this.half * 0.55;
    }
    const spot = (minD: number) => {
      for (let t = 0; t < 60; t++) {
        const x = (this.rand() * 2 - 1) * this.half * 0.85, z = (this.rand() * 2 - 1) * this.half * 0.85;
        if (Math.hypot(x, z) > minD && !this.isWater(x, z)) return { x, z };
      }
      return { x: this.half * 0.6, z: this.half * 0.6 };
    };
    this.treasure = null; this.treasureR = 0; this.goto = null; this.want = '';
    if (opts.treasure) { const s = spot(this.half * 0.5); this.treasure = this.addPow('treasure', s.x, s.z); }
    for (let i = 0; i < (opts.thorns ?? 0); i++) { const s = spot(9); this.addPow('thorn', s.x, s.z); }
    this.powT = 4;
    this.snapCamera();
  }

  private clear() {
    for (const c of [...this.content.children]) {
      this.content.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mat = o.material as THREE.Material & { map?: THREE.Texture | null };
          if (mat !== propMat && mat !== maskMat && mat !== inkMat) { if (mat.map && !SHARED_TEX.has(mat.map)) mat.map.dispose(); mat.dispose(); }
        }
      });
    }
    this.objs = []; this.holes = []; this.pows = []; this.falling = []; this.gone = []; this.smokers = []; this.P = [];
    this.wobbly.clear(); this.growing.clear(); this.dirty.clear(); this.kinds.clear(); this.player = null; this.water = null;
  }

  private makePlan() {
    const H = this.half, r = this.rand, p = this.map.plan;
    const plan: Plan = { H, rx: [], rz: [], plaza: !!p.plaza, river: null, seaZ: p.sea ? -0.56 * H : null, ponds: [] };
    if (p.river) { const sg = r() < 0.5 ? -1 : 1; plan.river = { cx: sg * Math.max(15, H * (0.36 + r() * 0.12)), A: 4 + r() * 2, k: 0.07 + r() * 0.04, ph: r() * 6, w: 5 }; }
    const lines = (out: number[], lo: number, avoid: number | null) => {
      if (p.plaza) out.push(0);
      for (let t = 0; out.length < p.roads && t < 40; t++) {
        const c = lo + r() * (H * 0.78 - lo);
        if (out.every((o) => Math.abs(o - c) > 13) && (avoid === null || Math.abs(c - avoid) > 11)) out.push(c);
      }
    };
    lines(plan.rx, -H * 0.78, plan.river ? plan.river.cx : null);
    lines(plan.rz, plan.seaZ !== null ? plan.seaZ + 8 : -H * 0.78, null);
    this.plan = plan;
    for (let t = 0; plan.ponds.length < (p.ponds ?? 0) && t < 80; t++) {
      const x = (r() * 2 - 1) * H * 0.8, z = (r() * 2 - 1) * H * 0.8, rad = 3.5 + r() * 2.5;
      if (Math.hypot(x, z) < 15 || this.isRoad(x, z, rad + 2) || this.isWater(x, z, rad + 3)) continue;
      plan.ponds.push({ x, z, r: rad });
    }
  }
  private riverX(z: number) { const v = this.plan.river!; return v.cx + v.A * Math.sin(v.k * z + v.ph); }
  private seaAt(x: number) { return this.plan.seaZ! + Math.sin(x * 0.12) * 1.3; }
  isWater(x: number, z: number, pad = 0) {
    const p = this.plan;
    if (p.seaZ !== null && z < this.seaAt(x) + pad) return true;
    if (p.river && Math.abs(x - this.riverX(z)) < p.river.w / 2 + pad && !p.rz.some((c) => Math.abs(z - c) < ROAD / 2 + 0.2 - pad)) return true;
    return p.ponds.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad);
  }
  isRoad(x: number, z: number, pad = 0) {
    const p = this.plan, w = ROAD / 2 + pad;
    return (p.plaza && Math.hypot(x, z) < PLAZA + pad) || p.rx.some((c) => Math.abs(x - c) < w) || p.rz.some((c) => Math.abs(z - c) < w);
  }

  private buildGround() {
    const m = this.map, H = this.half, p = this.plan, L = H * 2, r = this.rand;
    const hi = this.quality === 'high';
    const bank = mix(m.ground, 0xf2e2b0, 0.55), roadEdge = mix(m.road, 0x000000, 0.18), deep = mix(m.water, 0x000000, 0.15), shallow = mix(m.water, 0xffffff, 0.35);
    const shapes = (c: CanvasRenderingContext2D, mask: boolean) => {
      const stroke = (w: number, col: string) => { c.lineWidth = w; c.strokeStyle = col; c.stroke(); };
      if (p.seaZ !== null) {
        c.beginPath(); c.moveTo(-H, -H);
        for (let x = -H; x <= H; x += 1) c.lineTo(x, this.seaAt(x));
        c.lineTo(H, -H); c.closePath();
        c.fillStyle = mask ? '#fff' : css(m.water); c.fill();
        if (!mask) {
          c.beginPath(); for (let x = -H; x <= H; x += 1) c.lineTo(x, this.seaAt(x) - 5 - Math.sin(x * 0.3)); c.lineTo(H, -H); c.lineTo(-H, -H); c.fillStyle = css(deep); c.fill();
          c.beginPath(); for (let x = -H; x <= H; x += 1) c.lineTo(x, this.seaAt(x)); stroke(1.6, css(shallow)); stroke(0.5, '#fff');
          c.beginPath(); for (let x = -H; x <= H; x += 1) c.lineTo(x, this.seaAt(x) + 1.6); stroke(1.8, css(mix(m.ground, 0x8a6a3a, 0.22)));
        }
      }
      if (p.river) {
        c.beginPath(); for (let z = -H; z <= H; z += 1) c.lineTo(this.riverX(z), z);
        c.lineCap = 'round';
        if (mask) stroke(p.river.w, '#fff');
        else { stroke(p.river.w + 2.2, css(bank)); stroke(p.river.w, css(m.water)); stroke(p.river.w * 0.5, css(shallow) + '55'); }
      }
      for (const o of p.ponds) {
        c.beginPath(); c.arc(o.x, o.z, o.r, 0, 7);
        if (mask) { c.fillStyle = '#fff'; c.fill(); } else { stroke(2.2, css(bank)); c.fillStyle = css(m.water); c.fill(); c.beginPath(); c.arc(o.x - o.r * 0.2, o.z - o.r * 0.2, o.r * 0.5, 0, 7); c.fillStyle = css(shallow) + '44'; c.fill(); }
      }
    };
    const tex = canvasTex(hi ? 2048 : 1024, (c, S) => {
      c.setTransform(S / L, 0, 0, S / L, S / 2, S / 2);
      c.fillStyle = css(m.ground); c.fillRect(-H, -H, L, L);
      for (let i = 0; i < 300; i++) {
        c.fillStyle = css(i % 3 ? m.ground2 : mix(m.ground, 0xffffff, 0.25)) + '50';
        c.beginPath(); c.ellipse((r() * 2 - 1) * H, (r() * 2 - 1) * H, 2 + r() * 6, 1.5 + r() * 4, r() * 3, 0, 7); c.fill();
      }
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = css(mix(m.ground, i % 2 ? 0x000000 : 0xffffff, 0.16));
        c.fillRect((r() * 2 - 1) * H, (r() * 2 - 1) * H, 0.1 + r() * 0.1, 0.3 + r() * 0.3);
      }
      shapes(c, false);
      // streets
      const road = (w: number, col: string) => {
        c.lineCap = 'butt'; c.lineWidth = w; c.strokeStyle = col; c.beginPath();
        for (const x of p.rx) { c.moveTo(x, p.seaZ !== null ? this.seaAt(x) + 2 : -H); c.lineTo(x, H); }
        for (const z of p.rz) { c.moveTo(-H, z); c.lineTo(H, z); }
        c.stroke();
        if (p.plaza) { c.fillStyle = col; c.beginPath(); c.arc(0, 0, PLAZA + (w - ROAD) / 2, 0, 7); c.fill(); }
      };
      road(ROAD + 0.7, css(roadEdge)); road(ROAD, css(m.road));
      for (let i = 0; i < 5000; i++) {
        const x = (r() * 2 - 1) * H, z = (r() * 2 - 1) * H;
        if (!this.isRoad(x, z, -0.3) || this.isWater(x, z, 0.5)) continue;
        c.fillStyle = css(mix(m.road, i % 2 ? 0x000000 : 0xffffff, 0.1 + r() * 0.1));
        c.beginPath(); c.ellipse(x, z, 0.22, 0.16, r() * 3, 0, 7); c.fill();
      }
      if (p.plaza) {
        c.lineWidth = 0.35;
        for (const [rad, col] of [[PLAZA - 0.6, roadEdge], [PLAZA * 0.62, mix(m.road, 0xffffff, 0.4)], [PLAZA * 0.3, roadEdge]] as const) { c.strokeStyle = css(col); c.beginPath(); c.arc(0, 0, rad, 0, 7); c.stroke(); }
        c.fillStyle = css(mix(m.road, m.wall, 0.45));
        for (let i = 0; i < 8; i++) { c.save(); c.rotate((i * Math.PI) / 4); c.beginPath(); c.moveTo(0, -PLAZA * 0.6); c.lineTo(0.55, -PLAZA * 0.32); c.lineTo(-0.55, -PLAZA * 0.32); c.fill(); c.restore(); }
      }
      // bridges
      if (p.river) for (const z of p.rz) {
        const x = this.riverX(z), w = p.river.w + 3;
        c.fillStyle = '#a9794a'; c.fillRect(x - w / 2, z - ROAD / 2 - 0.3, w, ROAD + 0.6);
        c.fillStyle = '#8a5f38'; for (let k = 0; k < w; k += 0.7) c.fillRect(x - w / 2 + k, z - ROAD / 2 - 0.3, 0.12, ROAD + 0.6);
        c.fillStyle = '#6d4a2c'; c.fillRect(x - w / 2, z - ROAD / 2 - 0.5, w, 0.3); c.fillRect(x - w / 2, z + ROAD / 2 + 0.2, w, 0.3);
      }
    });
    tex.anisotropy = hi ? 8 : 2;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, order = 0) => {
      const mesh = new THREE.Mesh(geo.rotateX(-Math.PI / 2), mat);
      mesh.position.y = y; mesh.receiveShadow = true; mesh.renderOrder = order;
      this.content.add(mesh);
      return mesh;
    };
    add(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: mix(m.ground, 0x000000, 0.1), ...STENCIL }), -0.15); // well below the arena: two huge triangles lose depth precision
    add(new THREE.PlaneGeometry(L, L), new THREE.MeshLambertMaterial({ map: tex, ...STENCIL }), 0);
    if (p.seaZ !== null || p.river || p.ponds.length) {
      const mask = canvasTex(256, (c, S) => { c.fillStyle = '#000'; c.fillRect(0, 0, S, S); c.setTransform(S / L, 0, 0, S / L, S / 2, S / 2); shapes(c, true); });
      mask.colorSpace = THREE.NoColorSpace;
      this.water = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, ...STENCIL, uniforms: { mask: { value: mask }, t: uTime, L: { value: L } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D mask; uniform float t; uniform float L; varying vec2 vUv;
          void main(){ float m = texture2D(mask, vUv).r; vec2 p = vUv * L;
            float w = sin(p.x * 1.3 + p.y * 0.7 + t * 1.6) * sin(p.y * 1.7 - p.x * 0.4 - t * 1.1) + 0.5 * sin(p.x * 3.1 - t * 2.3) * sin(p.y * 2.7 + t * 1.7);
            float glint = smoothstep(0.55, 0.9, w);
            float edge = smoothstep(0.12, 0.45, m) * (1.0 - smoothstep(0.5, 0.85, m)) * (0.55 + 0.45 * sin(t * 2.0 + p.x + p.y));
            gl_FragColor = vec4(1.0, 1.0, 1.0, m * glint * 0.5 + edge * 0.6); }`,
      });
      add(new THREE.PlaneGeometry(L, L), this.water, 0.012, 1);
    }
    // Border: a low wall with glowing corner posts. The hole stays inside it.
    const wall: Part[] = [];
    for (let s = 0; s < 4; s++) {
      const a = (s * Math.PI) / 2, x = Math.sin(a) * (H + 0.5), z = Math.cos(a) * (H + 0.5);
      wall.push(['box', m.wall, x, 0.45, z, L + 2, 0.9, 1, 0, a, 0], ['box', mix(m.wall, 0xffffff, 0.3), x, 0.95, z, L + 2.2, 0.16, 1.2, 0, a, 0]);
      const cx = (s < 2 ? 1 : -1) * (H + 0.5), cz = (s % 2 ? 1 : -1) * (H + 0.5);
      wall.push(['box', mix(m.wall, 0x000000, 0.15), cx, 0.9, cz, 1.6, 1.8, 1.6], ['oct', G | 0xffe9a8, cx, 2.3, cz, 0.9, 1.1, 0.9]);
    }
    // Far hills ring the arena so the horizon is never empty.
    const hills: Part[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2, d = H + 26 + r() * 46, s = 16 + r() * 26, hh = s * (0.45 + r() * 0.4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      hills.push(['cone', m.backdrop[0], x, hh / 2, z, s, hh, s], ['cone', m.backdrop[1], x, hh * 0.82, z, s * 0.37, hh * 0.37, s * 0.37]);
      if (i % 2) hills.push(['blob', mix(m.backdrop[0], m.ground, 0.5), x * 0.8, 1.5, z * 0.8, 9 + r() * 8, 4, 8 + r() * 6]);
    }
    const scenery = new THREE.Mesh(build([...wall, ...hills]), propMat);
    scenery.castShadow = true;
    this.content.add(scenery);
  }

  private layout() {
    const half = this.half, r = this.rand, o = this.opts, plan = this.plan;
    const placed: { x: number; z: number; r: number }[] = [];
    const pgrid = new Map<number, number[]>();
    const key = (x: number, z: number) => (Math.floor((x + half) / CELL) * 1000) + Math.floor((z + half) / CELL);
    const free = (x: number, z: number, rad: number) => {
      const reach = Math.ceil((rad + 8) / CELL);
      const cx = Math.floor((x + half) / CELL), cz = Math.floor((z + half) / CELL);
      for (let i = cx - reach; i <= cx + reach; i++) for (let j = cz - reach; j <= cz + reach; j++) {
        for (const k of pgrid.get(i * 1000 + j) ?? []) {
          const p = placed[k];
          if (Math.hypot(p.x - x, p.z - z) < (p.r + rad) * 0.85) return false;
        }
      }
      return true;
    };
    const mark = (x: number, z: number, rad: number) => {
      placed.push({ x, z, r: rad });
      const k = key(x, z);
      if (!pgrid.has(k)) pgrid.set(k, []);
      pgrid.get(k)!.push(placed.length - 1);
    };
    const bigs: { x: number; z: number; r: number }[] = [];
    const parks = Array.from({ length: 9 }, () => ({ x: (r() * 2 - 1) * half * 0.8, z: (r() * 2 - 1) * half * 0.8 }));
    mark(0, 3, 2.2); // keep the spawn spot clear
    const area = (half / 48) ** 2;
    // Footprint [minX, maxX, minZ, maxZ]: the prop's fixed box when it has one, else the art's own bounds.
    const defs = this.map.props.map((d) => { const geo = build(d.parts), bb = geo.boundingBox!; return { d, geo, fp: d.box ?? [bb.min.x, bb.max.x, bb.min.z, bb.max.z] }; });
    defs.sort((a, b) => b.fp[1] - a.fp[1]);
    this.totalMass = 0;
    for (const { d, geo, fp } of defs) {
      const hx0 = (fp[1] - fp[0]) / 2, hz0 = (fp[3] - fp[2]) / 2;
      const cx0 = (fp[1] + fp[0]) / 2, cz0 = (fp[3] + fp[2]) / 2;
      const h0 = geo.boundingBox!.max.y, diag0 = Math.hypot(hx0, hz0);
      if (diag0 > (o.maxDiag ?? 99)) { geo.dispose(); continue; }
      const count = Math.max(1, Math.round(d.count * area * (diag0 < 1.5 ? TUNE.smallMore : 1)));
      const mesh = new THREE.InstancedMesh(geo, propMat, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.content.add(mesh);
      let n = 0;
      const put = (x: number, z: number, ry: number, sc: number) => {
        const diag = diag0 * sc;
        const c = Math.cos(ry), s = Math.sin(ry);
        const ob: Obj = {
          mesh, i: n++, def: d, x, z, mx: x + (cx0 * c + cz0 * s) * sc, mz: z + (-cx0 * s + cz0 * c) * sc, ry, sc, cx: cx0 * sc, cz: cz0 * sc, hx: hx0 * sc, hz: hz0 * sc, diag, h: h0 * sc,
          pts: diag ** TUNE.massPow, score: Math.ceil(diag ** TUNE.massPow * 20),
          state: 0, tilt: 0, tiltT: 0, ax: 1, az: 0, grow: 1, backT: 0, hole: null, ox: 0, oz: 0, y: 0, vy: 0,
        };
        this.objs.push(ob);
        this.totalMass += ob.pts;
        this.write(ob, x, 0, z);
        mark(x, z, diag * 0.8);
        if (diag > 1.2) bigs.push({ x, z, r: diag });
        if (d.place === 'street' && this.smokers.length < 40) this.smokers.push(ob);
      };
      const big = diag0 > 4.5;
      let tries = 0;
      while (n < count && tries++ < count * 50) {
        const sc = big ? 1 : 0.88 + r() * 0.24;
        const rad = diag0 * sc * 0.8;
        const lim = half - rad - 0.8;
        let x: number, z: number, ry = r() * Math.PI * 2;
        const roll = r();
        const roads = plan.rx.length + plan.rz.length;
        if (d.place === 'water') {
          x = (r() * 2 - 1) * lim; z = (r() * 2 - 1) * lim;
          if (!this.isWater(x, z, -Math.min(2.2, rad * 0.5)) || !free(x, z, rad)) continue;
          if (rad > 3) ry = 0;
          else if (plan.river && Math.abs(x - this.riverX(z)) < 4) ry = Math.PI / 2;
        } else if ((d.place === 'street' || d.place === 'road') && roads) {
          const k = (r() * roads) | 0, along = k < plan.rx.length, c = along ? plan.rx[k] : plan.rz[k - plan.rx.length];
          const t = (r() * 2 - 1) * lim, side = r() < 0.5 ? -1 : 1;
          const off = d.place === 'road' ? (r() - 0.5) * 0.8 : side * (ROAD / 2 + hz0 * sc + 0.5 + (roll < 0.25 ? 3.2 + hz0 * 2 : 0));
          x = along ? c + off : t; z = along ? t : c + off;
          ry = d.place === 'road' ? (along ? Math.PI / 2 : 0) + (r() < 0.5 ? Math.PI : 0) : along ? -side * Math.PI / 2 : side > 0 ? Math.PI : 0;
          if (d.place === 'road' ? this.isWater(x, z, 1) || Math.hypot(x, z) < PLAZA + 1 : this.isRoad(x, z, hz0 * sc * 0.7) || this.isWater(x, z, rad)) continue;
          if (Math.abs(x) > lim || Math.abs(z) > lim || !free(x, z, rad * (d.place === 'street' ? 0.78 : 1))) continue;
        } else {
          if (d.near && bigs.length && roll < 0.75) {
            const b = bigs[(r() * bigs.length) | 0];
            const a = r() * Math.PI * 2, dist = b.r + rad + 0.4 + r() * 2.5;
            x = b.x + Math.cos(a) * dist; z = b.z + Math.sin(a) * dist;
          } else if (rad > 0.9 && !big && roll < 0.75) {
            const v = parks[(r() * parks.length) | 0];
            const a = r() * Math.PI * 2, dist = r() * 11;
            x = v.x + Math.cos(a) * dist; z = v.z + Math.sin(a) * dist;
          } else {
            x = (r() * 2 - 1) * (half - 1.5); z = (r() * 2 - 1) * (half - 1.5);
          }
          if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
          if (big) { if (Math.hypot(x, z) < rad + 12 || this.isWater(x, z, rad * 0.6)) continue; ry = ((r() * 4) | 0) * Math.PI / 2; }
          else if (this.isWater(x, z, rad * 0.6) || this.isRoad(x, z, rad * 0.5)) continue;
          if (d.row) {
            ry = r() * Math.PI;
            const run = 3 + ((r() * 3) | 0);
            const step = hx0 * sc * 2 + 0.05;
            const dx = Math.cos(ry) * step, dz = -Math.sin(ry) * step;
            const spots: [number, number][] = [];
            for (let k = 0; k < run && n + spots.length < count; k++) {
              const px = x + dx * k, pz = z + dz * k;
              if (Math.abs(px) > lim || Math.abs(pz) > lim || this.isWater(px, pz, rad) || this.isRoad(px, pz, rad * 0.5) || !free(px, pz, rad * 0.6)) break;
              spots.push([px, pz]);
            }
            for (const [px, pz] of spots) put(px, pz, ry, sc);
            continue;
          }
          if (!free(x, z, rad)) continue;
        }
        put(x, z, ry, sc);
      }
      mesh.count = n;
      if (diag0 >= 0.45 && n) {
        // Ink hull: a second instanced mesh that shares this one's geometry and instance matrices.
        const ink = new THREE.InstancedMesh(geo, inkMat, count);
        ink.instanceMatrix = mesh.instanceMatrix;
        ink.count = n;
        ink.frustumCulled = false;
        ink.userData.clutter = diag0 < 1.5;
        ink.visible = this.quality === 'high' || diag0 >= 1.5;
        this.content.add(ink);
      }
      if (n) this.kinds.set(d.name, { label: d.label ?? d.name + 's', count: n, diag: diag0 });
    }
    this.total = this.objs.length;
    this.cols = Math.ceil((half * 2) / CELL) + 1;
    this.grid = Array.from({ length: this.cols * this.cols }, () => []);
    this.objs.forEach((ob, idx) => this.grid[this.cell(ob.x, ob.z)].push(idx));
    this.flush();
  }

  private cell(x: number, z: number) {
    const h = this.half;
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x + h) / CELL)));
    const cz = Math.min(this.cols - 1, Math.max(0, Math.floor((z + h) / CELL)));
    return cx * this.cols + cz;
  }

  private near(x: number, z: number, rad: number, f: (o: Obj) => void) {
    const h = this.half;
    const x0 = Math.max(0, Math.floor((x - rad + h) / CELL)), x1 = Math.min(this.cols - 1, Math.floor((x + rad + h) / CELL));
    const z0 = Math.max(0, Math.floor((z - rad + h) / CELL)), z1 = Math.min(this.cols - 1, Math.floor((z + rad + h) / CELL));
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) for (const k of this.grid[i * this.cols + j]) f(this.objs[k]);
  }

  // ---------------------------------------------------------------- holes
  private addHole(name: string, skin: Skin, player: boolean, style: Style | null, startR: number): Hole {
    const group = new THREE.Group();
    const mask = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), maskMat);
    mask.renderOrder = -10;
    mask.position.y = 0.003;
    const wellGeo = new THREE.CylinderGeometry(1, 0.8, 4, 40, 6, true).translate(0, -2, 0);
    const pos = wellGeo.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    const lip = new THREE.Color(skin.colors[0]).lerp(new THREE.Color(0xffffff), 0.35), mid = new THREE.Color(skin.inner), bot = new THREE.Color(0x000000), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const d = -pos.getY(i);
      if (d < 0.5) c.copy(lip).lerp(mid, d / 0.5); else c.copy(mid).lerp(bot, Math.min(1, (d - 0.5) / 2.2));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    wellGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const well = new THREE.Mesh(wellGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    floor.position.y = -4;
    const glow = new THREE.Color(skin.colors[0]).lerp(new THREE.Color(0xffffff), 0.3);
    const vortex = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: spiralTex, color: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    vortex.position.y = -1.3;
    const vortex2 = new THREE.Mesh(new THREE.CircleGeometry(0.99, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: spiralTex, color: skin.colors[0], transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    vortex2.position.y = -0.4;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloTex, color: skin.colors[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    halo.position.y = 0.02;
    const runes = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runeTex, color: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: player ? 0.6 : 0.4 }));
    runes.position.y = 0.035;
    const rim = new THREE.Mesh(rimWith(skin.colors, skin.arcs, skin.parts), propMat);
    rim.position.y = 0.03;
    rim.castShadow = true;
    rim.add(new THREE.Mesh(rim.geometry, inkMat));
    group.add(mask, well, floor, vortex, vortex2, halo, runes, rim);
    this.content.add(group);
    const startMass = massFor(startR);
    const h: Hole = {
      name, color: skin.colors[0], player, style,
      x: 0, z: 0, vx: 0, vz: 0, dx: 0, dz: 1,
      mass: startMass, startMass, R: startR, score: 0, count: 0,
      alive: true, respawnT: 0, shieldT: 0, dieT: 0, killer: null,
      magnetT: 0, speedT: 0, boostT: 0, boostCd: 0, rushT: 0, giantT: 0, pulse: 0, tx: 0, tz: 0, thinkT: 0, stuck: 0,
      group, rim, vortex, vortex2, halo, runes,
    };
    this.holes.push(h);
    return h;
  }

  /** Size level shown to the player: each level is 17 % wider than the last. */
  static level(R: number) {
    const v = Math.max(0, Math.log(R / TUNE.R0) / Math.log(TUNE.levelStep));
    return { level: Math.floor(v) + 1, frac: v - Math.floor(v) };
  }

  holeSpeed(h: Hole) {
    let s = TUNE.speed * (1 + TUNE.speedPerR * h.R);
    if (h.player) s *= this.opts.speed ?? 1;
    else s *= (TUNE.botSpeed + 0.45 * (this.opts.botSkill ?? 0)) * (h.style === 'explorer' ? 1.04 : 1);
    if (h.speedT > 0) s *= TUNE.speedMul;
    if (h.boostT > 0) s *= TUNE.boostMul;
    return s;
  }

  canEat(a: Hole, b: Hole) {
    return a.alive && b.alive && b.shieldT <= 0 && a.R >= b.R * TUNE.EAT_HOLE;
  }

  /** Grows (or shrinks) a hole by a radius step. */
  growBy(h: Hole, dR: number) {
    h.mass = massFor(Math.max(TUNE.R0, radiusFor(h.mass) + dR));
  }

  /** First standing prop of a kind (goal markers, balance runs). */
  find(kind: string) {
    const o = this.objs.find((v) => v.def.name === kind && v.state === 0);
    return o ? { x: o.mx, z: o.mz, diag: o.diag } : null;
  }

  /** Player abilities. */
  ability(kind: Ability) {
    const p = this.player;
    if (!p || !p.alive) return;
    if (kind === 'gulp') { p.magnetT = Math.max(p.magnetT, 1.6); p.pulse = 1; }
    if (kind === 'giant') { p.giantT = TUNE.giantTime; p.pulse = 1; }
    if (kind === 'freeze') this.freezeT = TUNE.freezeTime;
    this.impact(p.x, p.z, p.R * 4 + 2, 0.35, p.color);
    this.burst(p.x, 0.3, p.z, 18, p.color, p.R * 2.5, p.R);
  }

  // ---------------------------------------------------------------- loop
  update(dt: number) {
    if (this.paused) return;
    this.clock += dt;
    this.freezeT = Math.max(0, this.freezeT - dt);
    if (this.mode !== 'attract') this.timeLeft = Math.max(0, this.timeLeft - dt);
    for (const h of this.holes) this.steer(h, dt);
    for (const h of this.holes) if (h.alive) this.eatObjects(h);
    this.eatHoles();
    this.updateFalling(dt);
    this.updateWobbly(dt);
    this.updateRegrow(dt);
    this.updatePows(dt);
    this.flush();
  }

  private steer(h: Hole, dt: number) {
    h.shieldT = Math.max(0, h.shieldT - dt);
    h.magnetT = Math.max(0, h.magnetT - dt);
    h.speedT = Math.max(0, h.speedT - dt);
    h.boostT = Math.max(0, h.boostT - dt);
    h.boostCd = Math.max(0, h.boostCd - dt);
    h.rushT = Math.max(0, h.rushT - dt);
    h.giantT = Math.max(0, h.giantT - dt);
    h.pulse = Math.max(0, h.pulse - dt * 2.5);
    const targetR = radiusFor(h.mass) * (h.giantT > 0 ? TUNE.giantMul : 1);
    h.R += (targetR - h.R) * Math.min(1, dt * 4);
    if (!h.alive) {
      if (h.dieT > 0) {
        h.dieT = Math.max(0, h.dieT - dt);
        if (h.killer) { h.x += (h.killer.x - h.x) * Math.min(1, dt * 8); h.z += (h.killer.z - h.z) * Math.min(1, dt * 8); }
        h.group.scale.setScalar(Math.max(0.001, h.R * (h.dieT / 0.5)));
        h.group.position.set(h.x, 0, h.z);
        if (h.dieT === 0) h.group.visible = false;
        return;
      }
      h.respawnT -= dt;
      if (h.respawnT <= 0) this.respawn(h);
      return;
    }
    let ix = 0, iz = 0;
    if (h.player && !this.auto) {
      ix = this.input.x; iz = this.input.z;
      if (this.input.boost && h.boostCd <= 0) { h.boostT = TUNE.boostTime; h.boostCd = TUNE.boostCd + TUNE.boostTime; this.events?.power(h, 'speed'); }
    } else if (this.freezeT <= 0 || h.player) {
      h.thinkT -= dt;
      if (h.thinkT <= 0) this.think(h);
      const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
      if (d > 0.08) { ix = dx / d; iz = dz / d; }
    }
    const mag = Math.min(1, Math.hypot(ix, iz));
    if (mag > 0.01) { h.dx = ix / Math.hypot(ix, iz); h.dz = iz / Math.hypot(ix, iz); }
    const sp = this.holeSpeed(h) * mag;
    const k = Math.min(1, dt * (this.opts.slip ? 2.2 : 8));
    h.vx += (h.dx * sp - h.vx) * k;
    h.vz += (h.dz * sp - h.vz) * k;
    if (mag <= 0.01) { h.vx *= 1 - k; h.vz *= 1 - k; }
    const lim = this.half - h.R * 0.5;
    h.x = Math.max(-lim, Math.min(lim, h.x + h.vx * dt));
    h.z = Math.max(-lim, Math.min(lim, h.z + h.vz * dt));
    h.group.position.set(h.x, 0, h.z);
    h.group.scale.setScalar(h.R * (1 + 0.12 * Math.sin(h.pulse * Math.PI)));
    h.group.visible = true;
    h.rim.visible = h.shieldT <= 0 || Math.floor(this.clock * 8) % 2 === 0;
    h.vortex.rotation.y -= dt * (2.2 + (h.boostT > 0 || h.magnetT > 0 ? 4 : 0));
    h.vortex2.rotation.y += dt * 1.1;
    h.runes.rotation.y += dt * (0.35 + (h.boostT > 0 || h.magnetT > 0 ? 1.6 : 0));
    (h.halo.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.1 * Math.sin(this.clock * 3 + h.x) + h.pulse * 0.4 + (h.magnetT > 0 ? 0.3 : 0);
    h.halo.scale.setScalar(1 + h.pulse * 0.5 + (h.magnetT > 0 ? 0.5 : 0));
  }

  private respawn(h: Hole) {
    let best = { x: 0, z: 0, d: -1 };
    for (let t = 0; t < 12; t++) {
      const x = (this.rand() * 2 - 1) * this.half * 0.8, z = (this.rand() * 2 - 1) * this.half * 0.8;
      const d = Math.min(...this.holes.filter((o) => o !== h && o.alive).map((o) => Math.hypot(o.x - x, o.z - z) - o.R), 999);
      if (d > best.d) best = { x, z, d };
    }
    h.x = best.x; h.z = best.z; h.vx = h.vz = 0;
    h.alive = true; h.shieldT = TUNE.shield; h.killer = null;
    h.tx = h.x; h.tz = h.z; h.thinkT = 0;
  }

  /** Bot brain: flee bigger holes, hunters chase smaller ones, everyone eats what fits. */
  private think(h: Hole) {
    h.thinkT = 0.35 + this.rand() * 0.3;
    const r = this.rand;
    let threat: Hole | null = null, prey: Hole | null = null, td = 1e9, pd = 1e9;
    for (const o of this.holes) {
      if (o === h || !o.alive) continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (this.canEat(o, h) && d < td) { threat = o; td = d; }
      if (this.canEat(h, o) && d < pd) { prey = o; pd = d; }
    }
    const fear = h.style === 'muncher' ? 10 : h.style === 'hunter' ? 4 : 6;
    if (threat && td < threat.R + fear) {
      const ax = h.x - threat.x, az = h.z - threat.z, d = Math.hypot(ax, az) || 1;
      let tx = h.x + (ax / d) * 12, tz = h.z + (az / d) * 12;
      const lim = this.half - 3;
      if (Math.abs(tx) > lim || Math.abs(tz) > lim) { tx = h.x - (az / d) * 12; tz = h.z + (ax / d) * 12; } // cornered: slide sideways
      h.tx = tx; h.tz = tz;
      return;
    }
    if (h.player && this.goto && h.R >= this.goto.R) { h.tx = this.goto.x; h.tz = this.goto.z; return; }
    const chase = (h.style === 'hunter' ? 22 : h.style === 'muncher' ? 7 : 10) + h.R;
    if (prey && pd < chase) { h.tx = prey.x; h.tz = prey.z; return; }
    for (const p of this.pows) {
      if (p.alive && p.kind !== 'thorn' && p.kind !== 'treasure' && Math.hypot(p.x - h.x, p.z - h.z) < (h.style === 'explorer' ? 5 : 9)) { h.tx = p.x; h.tz = p.z; return; }
    }
    // Parked on a target that will not fall in: give up and wander.
    h.stuck = Math.hypot(h.tx - h.x, h.tz - h.z) < 0.5 ? h.stuck + 1 : 0;
    if (h.stuck > 3) { h.stuck = 0; h.tx = (r() * 2 - 1) * this.half * 0.8; h.tz = (r() * 2 - 1) * this.half * 0.8; h.thinkT = 1.5; return; }
    // Best object in reach: value over distance, slightly random so bots spread out.
    let best: Obj | null = null, bs = 0;
    const reach = (h.style === 'explorer' ? 6 : 12) + h.R * 2;
    this.near(h.x, h.z, reach, (o) => {
      if (o.state !== 0 || o.diag > h.R * TUNE.EDIBLE * 0.96) return;
      const d = Math.hypot(o.mx - h.x, o.mz - h.z);
      const s = (o.pts + 0.02) / (d + 2) * (0.7 + r() * 0.6) * (h.player && o.def.name === this.want ? 8 : 1);
      if (s > bs) { bs = s; best = o; }
    });
    if (best) { h.tx = (best as Obj).mx; h.tz = (best as Obj).mz; return; }
    if (h.style === 'explorer' && Math.hypot(h.tx - h.x, h.tz - h.z) > 2) return; // keep heading to the far spot
    const lim = this.half * 0.85;
    h.tx = (r() * 2 - 1) * lim; h.tz = (r() * 2 - 1) * lim;
  }

  private fits(o: Obj, h: Hole, fit: number) {
    const lim = (h.R * fit) ** 2;
    const c = Math.cos(o.ry), s = Math.sin(o.ry);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = o.cx + sx * o.hx, lz = o.cz + sz * o.hz;
      const wx = o.x + lx * c + lz * s - h.x, wz = o.z - lx * s + lz * c - h.z;
      if (wx * wx + wz * wz > lim) return false;
    }
    return true;
  }

  private eatObjects(h: Hole) {
    const R = h.R;
    const pull = h.magnetT > 0 ? R * 2.5 + 2 : 0;
    const reach = h.player ? this.opts.reach ?? 0 : 0;
    this.near(h.x, h.z, R + 12 + pull, (o) => {
      if (o.state !== 0 || o.grow < 1) return;
      const dx = o.mx - h.x, dz = o.mz - h.z, d = Math.hypot(dx, dz);
      if (d > R + o.diag + pull) return;
      const edible = o.diag < R * TUNE.EDIBLE;
      if (edible && ((d < R * (0.75 + reach) && this.fits(o, h, TUNE.FIT + reach)) || (pull && d < pull))) return this.startFall(o, h);
      if (d > R + o.diag * 0.6) return;
      // On the rim: the side over the hole sinks, so the object leans toward the centre. Too-big things shiver.
      const t = edible ? 0.15 + 0.45 * Math.min(1, (R + o.diag * 0.6 - d) / (o.diag + 0.01)) : 0.03 + 0.03 * Math.sin(this.clock * 30 + o.i);
      if (t > o.tiltT) {
        o.tiltT = t;
        const ux = -dx / (d || 1), uz = -dz / (d || 1);
        o.ax = uz; o.az = -ux;
      }
      this.wobbly.add(o);
    });
  }

  private startFall(o: Obj, h: Hole) {
    o.state = 1; o.hole = h;
    o.ox = o.x - h.x; o.oz = o.z - h.z; o.y = 0; o.vy = 0;
    this.wobbly.delete(o);
    this.falling.push(o);
    if (o.diag > 1.5 && this.seen(h)) this.burst(o.x, 0.2, o.z, Math.min(16, 4 + o.diag * 2), 0x6a6258, o.diag * 1.4, o.diag * 0.7);
  }

  private seen(h: Hole) {
    const f = this.player ?? this.holes[0];
    return !!f && Math.hypot(h.x - f.x, h.z - f.z) < f.R * 6 + 30;
  }

  private updateFalling(dt: number) {
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const o = this.falling[k], h = o.hole!;
      const R = Math.max(h.R, 0.05);
      const inner = Math.max(0, R - o.diag * 0.7);
      const od = Math.hypot(o.ox, o.oz);
      if (od > 0.01) { o.ax = -o.oz / od; o.az = o.ox / od; }
      if (o.y === 0 && od > inner + 0.02) {
        // Slide phase (magnet pull or rim): glide over the edge before dropping.
        const nd = Math.max(inner, od - (4 + R * 3) * dt);
        o.ox *= nd / od; o.oz *= nd / od;
        o.tilt = Math.min(0.6, o.tilt + dt * 2);
      } else {
        o.vy -= (22 + R * 4) * dt;
        o.y += o.vy * dt;
        o.tilt = Math.min(2.2, o.tilt + dt * 3.2);
        o.ry += dt * 2.5;
        const shrink = Math.max(0, 1 - dt * 2);
        o.ox *= shrink; o.oz *= shrink;
      }
      if (!h.alive && h.dieT === 0) o.y = -1e3;
      this.write(o, h.x + o.ox, o.y, h.z + o.oz);
      if (o.y < -(R * 2.2 + o.h)) {
        o.state = 2;
        o.mesh.setMatrixAt(o.i, ZERO);
        this.falling.splice(k, 1);
        this.swallowed++;
        if (this.opts.regrow && o.diag < 2.6) { o.backT = TUNE.regrow; this.gone.push(o); }
        if (h.alive) {
          const p = this.player;
          const gain = h.player ? (this.opts.gain ?? 1) : !p ? 1 : (TUNE.botGain + 1.2 * (this.opts.botSkill ?? 0)) * (h.R > p.R * 1.25 && (this.opts.botSkill ?? 0) < 0.5 ? 0.6 : 1);
          h.mass += o.pts * gain * (h.rushT > 0 ? 2 : 1); h.score += o.score * (h.rushT > 0 ? 2 : 1); h.count++;
          h.pulse = Math.max(h.pulse, Math.min(1, 0.25 + o.diag / R));
          if (this.seen(h)) {
            this.burst(h.x, 0.1, h.z, Math.min(18, 3 + (o.diag / R) * 16), h.color, R * 1.6 + 2, R * 0.9);
            if (h.player && o.diag > R * 0.45) this.shake = Math.min(1, this.shake + o.diag / R);
            if (o.diag > 9) this.impact(h.x, h.z, R * 5, 0.55, h.color);
            else if (o.diag > R * 0.45 || o.diag > 4.5) this.impact(h.x, h.z, R * 2.4 + o.diag, 0.28, h.color);
          }
          this.events?.swallow(h, { kind: o.def.name, score: o.score, diag: o.diag, boss: o.diag > 9 });
        }
      }
    }
  }

  private updateWobbly(dt: number) {
    for (const o of this.wobbly) {
      o.tilt += (o.tiltT - o.tilt) * Math.min(1, dt * 12);
      o.tiltT = 0;
      this.write(o, o.x, 0, o.z);
      if (o.tilt < 0.002) { o.tilt = 0; this.write(o, o.x, 0, o.z); this.wobbly.delete(o); }
    }
  }

  /** Battle: small things pop back up after a while, so the town never runs dry. */
  private updateRegrow(dt: number) {
    for (let k = this.gone.length - 1; k >= 0; k--) {
      const o = this.gone[k];
      if ((o.backT -= dt) > 0) continue;
      if (this.holes.some((h) => h.alive && Math.hypot(h.x - o.x, h.z - o.z) < h.R + o.diag + 1.5)) { o.backT = 2; continue; }
      this.gone.splice(k, 1);
      o.state = 0; o.tilt = 0; o.y = 0; o.hole = null; o.grow = 0.01; o.pts *= TUNE.regrowWorth;
      this.swallowed--;
      this.growing.add(o);
    }
    for (const o of this.growing) {
      o.grow = Math.min(1, o.grow + dt * 2.5);
      this.write(o, o.x, 0, o.z);
      if (o.grow >= 1) this.growing.delete(o);
    }
  }

  private eatHoles() {
    for (const a of this.holes) for (const b of this.holes) {
      if (a === b || !this.canEat(a, b)) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.R - b.R * 0.4) {
        b.alive = false; b.dieT = 0.5; b.killer = a; b.respawnT = TUNE.respawn;
        const gained = b.mass - b.startMass;
        a.mass += Math.max(0.3, b.mass * TUNE.holeGain);
        a.score += 100; a.pulse = 1;
        b.mass = b.startMass + Math.max(0, gained) * TUNE.keepOnRespawn;
        b.magnetT = b.speedT = b.boostT = b.rushT = b.giantT = 0;
        this.burst(b.x, 0.3, b.z, 24, b.color, a.R * 2, a.R);
        if (this.seen(a)) this.impact(b.x, b.z, a.R * 3.5, 0.4, b.color);
        if (a.player || b.player) this.shake = 1;
        this.events?.holeEaten(b, a);
      }
    }
  }

  // ---------------------------------------------------------------- power-ups
  private addPow(kind: PowKind, x: number, z: number): Pow {
    const mesh = new THREE.Mesh(build(POW_PARTS[kind]), propMat);
    mesh.add(new THREE.Mesh(mesh.geometry, inkMat));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloTex, color: kind === 'thorn' ? 0xff4040 : kind === 'treasure' ? 0x7df9ff : 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = -0.9;
    mesh.add(glow);
    mesh.position.set(x, 1.2, z);
    mesh.scale.setScalar(kind === 'treasure' ? 1.7 : 1.4);
    mesh.castShadow = true;
    this.content.add(mesh);
    const p: Pow = { kind, x, z, mesh, alive: true };
    this.pows.push(p);
    return p;
  }

  private updatePows(dt: number) {
    const kinds: PowKind[] = this.opts.pows ?? (this.mode === 'solo' ? ['magnet', 'speed', 'grow', 'clock'] : ['magnet', 'speed', 'grow']);
    const max = this.mode === 'attract' ? 2 : TUNE.powMax;
    this.powT -= dt;
    if (kinds.length && this.powT <= 0 && this.pows.filter((p) => p.alive && p.kind !== 'thorn' && p.kind !== 'treasure').length < max) {
      this.powT = TUNE.powEvery;
      const kind = kinds[(this.rand() * kinds.length) | 0];
      const lim = this.half * 0.85;
      let x = 0, z = 0;
      for (let t = 0; t < 10; t++) {
        x = (this.rand() * 2 - 1) * lim; z = (this.rand() * 2 - 1) * lim;
        if (!this.isWater(x, z, 1)) break;
      }
      this.addPow(kind, x, z);
    }
    for (const p of this.pows) {
      if (!p.alive) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1.4 + Math.sin(this.clock * 3 + p.x) * 0.2;
      for (const h of this.holes) {
        if (!h.alive || Math.hypot(h.x - p.x, h.z - p.z) > h.R + 0.6 || (p.kind === 'treasure' && (!h.player || h.R < this.treasureR)) || (p.kind === 'thorn' && h.shieldT > 0)) continue;
        p.alive = false;
        this.content.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (p.kind === 'magnet') h.magnetT = TUNE.magnetTime;
        if (p.kind === 'speed') h.speedT = TUNE.speedTime;
        if (p.kind === 'grow') this.growBy(h, TUNE.growR);
        if (p.kind === 'rush') h.rushT = TUNE.rushTime;
        if (p.kind === 'thorn') { this.growBy(h, -h.R * TUNE.thornShrink); h.shieldT = 1; }
        if (p.kind === 'clock' && h.player) this.timeLeft += TUNE.clockSecs;
        h.pulse = 1;
        if (this.seen(h)) { this.burst(p.x, 1, p.z, 16, p.kind === 'thorn' ? 0xff4040 : 0xffe9a8, 5, 0.6); this.impact(p.x, p.z, 2.2 + h.R, 0.22, p.kind === 'thorn' ? 0xff4040 : 0xffe9a8); }
        this.events?.power(h, p.kind);
        break;
      }
    }
    this.pows = this.pows.filter((p) => p.alive);
  }

  // ---------------------------------------------------------------- effects
  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, g: number, col: number) {
    if (this.P.length >= 500) return;
    this.P.push({ x, y, z, vx, vy, vz, life, max: life, size, g, col: new THREE.Color(col) });
  }
  private burst(x: number, y: number, z: number, n: number, col: number, speed: number, rad: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.6);
      this.spark(x + Math.cos(a) * rad, y, z + Math.sin(a) * rad, Math.cos(a) * s, 2 + Math.random() * 3 + speed * 0.5, Math.sin(a) * s, 0.5 + Math.random() * 0.5, 0.12 + rad * 0.05 + Math.random() * 0.12, 9, i % 3 ? col : 0xffffff);
    }
  }
  /** Anime impact: a white-hot flash with radial lines that snaps outward and fades to the given colour. */
  private impact(x: number, z: number, size: number, life: number, col: number) {
    const m = this.impacts.reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a));
    m.t = 0; m.life = life; m.size = size; m.col.setHex(col);
    m.mesh.position.set(x, 0.1, z);
    m.mesh.rotation.y = Math.random() * 6.283;
    m.mesh.visible = true;
  }
  private updateFx(dt: number) {
    const hi = this.quality === 'high', f = this.player ?? this.holes[0];
    for (const m of this.impacts) {
      if (!m.mesh.visible) continue;
      if (!this.paused) m.t += dt;
      const k = m.t / m.life;
      if (k >= 1) { m.mesh.visible = false; continue; }
      m.mesh.scale.setScalar(m.size * (0.35 + 0.65 * (1 - (1 - k) ** 3)));
      m.mat.color.setRGB(1, 1, 1).lerp(m.col, k);
      m.mat.opacity = k < 0.25 ? 1 : (1 - k) / 0.75;
    }
    if (!this.paused && f) {
      const span = this.camPos.y;
      this.ambT += dt;
      const amb = AMBIENT[this.map.ambient];
      while (this.ambT > 0) {
        this.ambT -= 1 / (hi ? amb.n : amb.n / 3);
        const x = this.camLook.x + (Math.random() - 0.5) * span * 2.2, z = this.camLook.z + (Math.random() - 0.7) * span * 1.6;
        this.spark(x, amb.vy < 0 ? span * 0.5 : 0.2, z, Math.sin(x) * 0.6, amb.vy * (0.6 + Math.random()) * (1 + span * 0.03), 0.4, 3 + Math.random() * 2, 0.09 + span * 0.006, 0, amb.col[(Math.random() * amb.col.length) | 0]);
        // chimney smoke and motes rising from the hole
        const s = this.smokers[(Math.random() * this.smokers.length) | 0];
        if (hi && s && s.state === 0) this.spark(s.x + (Math.random() - 0.5) * 0.3, s.h * 1.02, s.z, 0.3, 0.9, 0.1, 2.2, 0.3, -0.25, 0x2c2c30);
        if (f.alive) { const a = Math.random() * 6.283; this.spark(f.x + Math.cos(a) * f.R * 0.8, 0, f.z + Math.sin(a) * f.R * 0.8, 0, 1.2 + f.R * 0.4, 0, 0.9, 0.07 + f.R * 0.03, 0, f.color); }
      }
    }
    let n = 0;
    for (let i = this.P.length - 1; i >= 0; i--) {
      const p = this.P[i];
      p.life -= dt;
      if (p.life <= 0) { this.P[i] = this.P[this.P.length - 1]; this.P.pop(); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.g > 0) { p.y = 0.05; p.vy *= -0.4; }
    }
    for (const p of this.P) {
      const k = Math.min(1, (p.life / p.max) * 2.5) * Math.min(1, (p.max - p.life) * 6 + 0.2);
      // Burst sparks are shards stretched along their flight; ambient motes and smoke tumble.
      if (p.g > 0) _mat.compose(_pos.set(p.x, p.y, p.z), _qYaw.setFromUnitVectors(UP, _ax.set(p.vx, p.vy, p.vz).normalize()), _scl.set(p.size * 0.45, p.size * 2.6, p.size * 0.45));
      else _mat.compose(_pos.set(p.x, p.y, p.z), _qYaw.setFromAxisAngle(UP, p.life * 3), _scl.setScalar(p.size * (p.g < 0 ? 2.2 - k : 1)));
      this.parts.setMatrixAt(n, _mat);
      this.parts.setColorAt(n++, _col.copy(p.col).multiplyScalar(k));
    }
    this.parts.count = n;
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    if (hi && f) {
      const rad = 6 + f.R * 2.2, y = 2.6 + f.R * 1.1;
      for (let i = 0; i < 6; i++) {
        const a = this.clock * (0.35 + (i % 3) * 0.06) + i * 2.4, rr = rad * (0.6 + (i % 4) * 0.22);
        _mat.compose(_pos.set(this.camLook.x + Math.cos(a) * rr + (i - 4) * 2, y + Math.sin(this.clock * 2 + i) * 0.4 + (i % 3), this.camLook.z + Math.sin(a) * rr), _qYaw.setFromAxisAngle(UP, -a), _scl.set(1, 1 + 0.8 * Math.sin(this.clock * 9 + i), 1).multiplyScalar(0.4 + f.R * 0.07));
        this.birds.setMatrixAt(i, _mat);
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- draw
  private write(o: Obj, x: number, y: number, z: number) {
    _qYaw.setFromAxisAngle(UP, o.ry);
    _ax.set(o.ax, 0, o.az);
    if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0); else _ax.normalize();
    _qTilt.setFromAxisAngle(_ax, o.tilt);
    _q2.multiplyQuaternions(_qTilt, _qYaw);
    // Pop-in overshoot while growing back; slight squeeze while dropping.
    const g = o.grow < 1 ? o.grow * (1 + 0.35 * Math.sin(o.grow * Math.PI)) : y < 0 ? Math.max(0.6, 1 + y * 0.03) : 1;
    _mat.compose(_pos.set(x, y, z), _q2, _scl.setScalar(o.sc * g));
    o.mesh.setMatrixAt(o.i, _mat);
    this.dirty.add(o.mesh);
  }

  private flush() {
    for (const m of this.dirty) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }

  private camTarget(out: THREE.Vector3, look: THREE.Vector3) {
    const h = this.player ?? this.holes[0];
    const portrait = Math.max(1, 1.25 / this.camera.aspect);
    if (this.mode === 'attract') {
      // Menu: a slow fly-around low over the town.
      const a = this.clock * 0.07 + 0.6, d = this.half * 0.72;
      out.set(Math.sin(a) * d, 13 * portrait, Math.cos(a) * d);
      look.set(0, 4.5, 0);
      return;
    }
    const R = h ? h.R : 2, x = h ? h.x : 0, z = h ? h.z : 0;
    // Past R 2 the camera climbs faster than the hole grows, so a huge hole stays about a third of the screen.
    const height = (9.5 + R * 3.3 + Math.max(0, R - 2) * 3) * portrait;
    out.set(x, height, z + height * 0.74);
    look.set(x, 0, z - R * 0.25);
  }

  snapCamera() {
    this.camTarget(this.camPos, this.camLook);
  }

  render(dt: number) {
    if (!this.paused) uTime.value += dt;
    const tp = _v1, tl = _v2;
    this.camTarget(tp, tl);
    const k = Math.min(1, dt * 4);
    this.camPos.lerp(tp, k);
    this.camLook.lerp(tl, k);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * this.camPos.y * 0.012;
    this.camera.position.copy(this.camPos).add(_v3.set(Math.sin(this.clock * 61) * sh, Math.sin(this.clock * 47) * sh, Math.cos(this.clock * 53) * sh));
    this.camera.lookAt(this.camLook);
    const span = this.camPos.y;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = span * 2.6 + 30; fog.far = span * 5 + 160;
    this.updateFx(dt);
    this.sky.position.copy(this.camera.position);
    if (this.shafts.visible) {
      this.shafts.position.copy(this.camLook);
      this.shafts.scale.setScalar(span);
      this.shafts.rotation.y = Math.atan2(this.camPos.x - this.camLook.x, this.camPos.z - this.camLook.z);
    }
    // Shadow box follows the camera focus.
    const sz = this.mode === 'attract' ? this.half * 0.9 : span * 1.25 + 6;
    const cam = this.sun.shadow.camera;
    if (Math.abs(cam.right - sz) > 0.5) { cam.left = -sz; cam.right = sz; cam.top = sz; cam.bottom = -sz; cam.near = 1; cam.far = sz * 4 + 60; cam.updateProjectionMatrix(); }
    this.sun.target.position.copy(this.camLook);
    this.sun.position.copy(this.camLook).add(_v3.set(-0.55, 1.0, 0.6).multiplyScalar(sz + 20));
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  /** Screen position (CSS px) of a world point, for name tags and pointer steering. */
  toScreen(x: number, y: number, z: number, w: number, h: number) {
    _v1.set(x, y, z).project(this.camera);
    return { x: (_v1.x * 0.5 + 0.5) * w, y: (-_v1.y * 0.5 + 0.5) * h, behind: _v1.z > 1 };
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _qYaw = new THREE.Quaternion(), _qTilt = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _mat = new THREE.Matrix4(), _col = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
