// Everything that moves, drawn in 3D: wyrms, gems, potions, effects, lights, camera, and the bloom pass.
// Dynamic things are instanced (one draw call per kind). The places themselves are built in scenery.ts.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T, POTIONS, radiusOf, type Arena, type Accessory } from './data';
import type { Sim, Wyrm } from './sim';
import { buildArena, merge, m4, flatMat, glowMat, instanced, dotTexture, type Part, type Scenery } from './scenery';

const MAX_W = T.bots + 2; // player, bots, boss
const MAX_SEG = 300;
const MAX_PARTICLES = 1400;
const MAX_RINGS = 40;

/** Smooth, soft-lit skin: a little self-light so colours stay candy-bright, plus a rim light. */
function skinMat(opts: THREE.MeshStandardMaterialParameters = {}, rim = 0.5) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.2;')
      .replace('#include <opaque_fragment>', `float rimK = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.4);\n\toutgoingLight += (diffuseColor.rgb * 0.55 + 0.1) * rimK * ${rim.toFixed(2)};\n\t#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `skin${rim}`;
  return m;
}

interface HeadItem { p: [number, number, number]; s: [number, number, number]; r?: [number, number, number] }
interface HeadPart {
  mesh: THREE.InstancedMesh;
  items: HeadItem[];
  tint: 'head' | 'acc' | 'fixed';
  acc?: Accessory;
  evo?: number;
  dyn?: 'eye' | 'pupil' | 'mouth';
}
const pair = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, rz = 0): HeadItem[] =>
  [{ p: [x, y, z], s: [sx, sy, sz], r: [rx, 0, rz] }, { p: [x, y, -z], s: [sx, sy, sz], r: [-rx, 0, rz] }];

interface WyrmFx { pulses: number[]; chomp: number; blink: number; trail: number; pop: number }

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.5, 1600);
  low = false;
  private composer: EffectComposer | null = null;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 0.6);
  private sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
  private scenery: Scenery | null = null;
  private arena: Arena | null = null;
  private simRef: Sim | null = null;
  private body: THREE.InstancedMesh;
  private bodyGeo: [THREE.BufferGeometry, THREE.BufferGeometry];
  private heads: HeadPart[] = [];
  private fins: THREE.InstancedMesh;
  private wings: THREE.InstancedMesh;
  private orbs: THREE.InstancedMesh; // tail gems and sprite gems
  private gems: THREE.InstancedMesh;
  private halos: THREE.InstancedMesh;
  private bottles: THREE.InstancedMesh;
  private corks: THREE.InstancedMesh;
  private beams: THREE.InstancedMesh;
  private bubbles: THREE.InstancedMesh;
  private crown: THREE.Mesh;
  private sparks: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private p = { x: new Float32Array(MAX_PARTICLES), y: new Float32Array(MAX_PARTICLES), z: new Float32Array(MAX_PARTICLES), vx: new Float32Array(MAX_PARTICLES), vy: new Float32Array(MAX_PARTICLES), vz: new Float32Array(MAX_PARTICLES), life: new Float32Array(MAX_PARTICLES), size: new Float32Array(MAX_PARTICLES), g: new Float32Array(MAX_PARTICLES), col: new Uint32Array(MAX_PARTICLES), n: 0 };
  private ringList: { x: number; z: number; t: number; dur: number; size: number; col: number }[] = [];
  private fx = new Map<number, WyrmFx>();
  private palettes = new WeakMap<number[], THREE.Color[]>();
  private gemPalette: THREE.Color[] = [];
  private camTarget = new THREE.Vector3();
  private lead = new THREE.Vector3();
  private camH = 30;
  private trauma = 0;
  private fovKick = 0;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpC = new THREE.Color();
  private tmpM = new THREE.Matrix4();
  private tmpM2 = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpE2 = new THREE.Euler(0, 0, 0, 'YXZ');
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private time = 0;
  private haloK = 1;
  private size = new THREE.Vector2(1, 1);

  constructor(canvas: HTMLCanvasElement, low: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 320;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    const skin = skinMat();
    this.bodyGeo = [new THREE.SphereGeometry(1, 14, 10), new THREE.IcosahedronGeometry(1, 1)];
    this.body = instanced(this.bodyGeo[0], skin, MAX_W * MAX_SEG, true);
    this.body.receiveShadow = true;

    // kawaii head: snout, big blinking eyes with shine, blush, mouth, and horns, cat ears, a unicorn horn, or bunny ears
    const sph = new THREE.SphereGeometry(1, 16, 12), lo = new THREE.IcosahedronGeometry(1, 1);
    const white = skinMat({ color: 0xffffff, roughness: 0.25 }, 0.2), dark = skinMat({ color: 0x241a2e, roughness: 0.2 }, 0.3);
    const shine = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6) });
    const blush = new THREE.MeshBasicMaterial({ color: 0xff8fb4, transparent: true, opacity: 0.8 });
    const pink = skinMat({ color: 0xffa8c8 });
    const defs: [THREE.BufferGeometry, THREE.Material, HeadPart['tint'], HeadItem[], Partial<Pick<HeadPart, 'acc' | 'evo' | 'dyn'>>?][] = [
      [sph, skin, 'head', [{ p: [0, 0, 0], s: [1.12, 0.96, 1.04] }, { p: [0.72, -0.2, 0], s: [0.62, 0.46, 0.7] }]],
      [sph, white, 'fixed', pair(0.5, 0.36, 0.5, 0.36, 0.44, 0.3), { dyn: 'eye' }],
      [sph, dark, 'fixed', pair(0.75, 0.38, 0.55, 0.2, 0.29, 0.18), { dyn: 'pupil' }],
      [lo, shine, 'fixed', [...pair(0.88, 0.53, 0.49, 0.085, 0.085, 0.085), ...pair(0.9, 0.28, 0.62, 0.04, 0.04, 0.04)], { dyn: 'pupil' }],
      [lo, blush, 'fixed', pair(0.62, -0.02, 0.74, 0.2, 0.11, 0.16)],
      [lo, dark, 'fixed', pair(1.26, -0.06, 0.17, 0.045, 0.045, 0.045)],
      [sph, skinMat({ color: 0x8a2a4a }), 'fixed', [{ p: [1.0, -0.46, 0], s: [0.24, 0.1, 0.3] }], { dyn: 'mouth' }],
      [new THREE.ConeGeometry(0.24, 0.95, 8), skin, 'acc', pair(-0.3, 0.9, 0.45, 1, 1, 1, 0.35, 0.55), { acc: 'horns' }],
      [new THREE.ConeGeometry(0.4, 0.7, 4), skin, 'head', pair(-0.05, 0.92, 0.5, 1, 1, 0.5, 0.3, 0.1), { acc: 'ears' }],
      [new THREE.ConeGeometry(0.24, 0.42, 4), pink, 'fixed', pair(0.02, 0.9, 0.5, 1, 1, 0.5, 0.3, 0.1), { acc: 'ears' }],
      [new THREE.ConeGeometry(0.2, 1.3, 8), glowMat(0.9, { flatShading: false }), 'acc', [{ p: [0.3, 1.3, 0], s: [1, 1, 1], r: [0, 0, -0.4] }], { acc: 'unicorn' }],
      [sph, skin, 'head', pair(-0.25, 1.45, 0.4, 0.22, 0.8, 0.32, 0.22, 0.3), { acc: 'bunny' }],
      [sph, pink, 'fixed', pair(-0.17, 1.45, 0.4, 0.14, 0.6, 0.22, 0.22, 0.3), { acc: 'bunny' }],
      [new THREE.ConeGeometry(0.2, 0.7, 4), skin, 'acc', [0, 1, 2].map((k): HeadItem => ({ p: [-0.25 - k * 0.32, 0.98 - k * 0.12, 0], s: [1.4, 1 - k * 0.15, 0.5], r: [0, 0, 0.6 + k * 0.25] })), { evo: 4 }],
    ];
    for (const [geo, mat, tint, items, extra] of defs) {
      const mesh = instanced(geo, mat, MAX_W * items.length, tint !== 'fixed');
      this.scene.add(mesh);
      this.heads.push({ mesh, items, tint, ...extra });
    }

    this.fins = instanced(new THREE.ConeGeometry(0.42, 1.1, 4).translate(0, 0.45, 0), skin, 900, true);
    const ws = new THREE.Shape();
    ws.moveTo(0.3, 0); ws.lineTo(0.55, 1.0); ws.lineTo(0.2, 1.95); ws.lineTo(-0.2, 1.3); ws.lineTo(-0.45, 1.55); ws.lineTo(-0.62, 0.85); ws.lineTo(-0.92, 0.95); ws.lineTo(-0.7, 0); ws.closePath();
    this.wings = instanced(new THREE.ShapeGeometry(ws).rotateX(Math.PI / 2), skinMat({ side: THREE.DoubleSide, flatShading: true }), MAX_W * 2 + T.spriteCount * 2, true);
    this.orbs = instanced(new THREE.OctahedronGeometry(1, 0), glowMat(1.8), MAX_W + T.spriteCount, true);

    const gemGeo = merge([[new THREE.CylinderGeometry(0.55, 1, 0.5, 6), 0xffffff, m4(0, 0.55)], [new THREE.ConeGeometry(1, 1.1, 6), 0xffffff, m4(0, -0.25, 0, 1, 1, 1, Math.PI)]]);
    gemGeo.deleteAttribute('color');
    this.gems = instanced(gemGeo, glowMat(0.9), T.maxGems, true);
    const dot = dotTexture();
    this.halos = instanced(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dot, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), T.maxGems + T.potionCount + MAX_W + T.spriteCount, true);
    this.halos.renderOrder = 2;
    this.bottles = instanced(merge([[new THREE.IcosahedronGeometry(0.75, 2), 0xffffff, m4(0, 0, 0, 1, 0.95, 1)], [new THREE.CylinderGeometry(0.28, 0.32, 0.5, 8), 0xffffff, m4(0, 0.85)]]), glowMat(1.1, { vertexColors: true, roughness: 0.2, flatShading: false }), T.potionCount, true);
    this.corks = instanced(merge([[new THREE.CylinderGeometry(0.3, 0.26, 0.3, 8), 0xc49a6c, m4(0, 1.2)], [new THREE.OctahedronGeometry(0.22), 0xffffff, m4(0, 0.05, 0.66)]]), flatMat({ vertexColors: true }), T.potionCount, false);
    const grad = document.createElement('canvas');
    grad.width = 4; grad.height = 64;
    const g2 = grad.getContext('2d')!;
    const lg = g2.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, '#000'); lg.addColorStop(1, '#fff');
    g2.fillStyle = lg; g2.fillRect(0, 0, 4, 64);
    this.beams = instanced(new THREE.CylinderGeometry(1.1, 0.7, 10, 16, 1, true).translate(0, 5, 0), new THREE.MeshBasicMaterial({ alphaMap: new THREE.CanvasTexture(grad), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), T.potionCount, true);
    this.bubbles = instanced(new THREE.SphereGeometry(1, 20, 14), skinMat({ color: 0x9fe4ff, transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false }, 2.2), MAX_W, false);
    const crownParts: Part[] = [[new THREE.CylinderGeometry(0.55, 0.5, 0.35, 10, 1, true), 0xffd04a, m4(0, 0.17)]];
    for (let k = 0; k < 5; k++) crownParts.push([new THREE.ConeGeometry(0.14, 0.4, 4), 0xffd04a, m4(Math.cos(k * 1.257) * 0.5, 0.5, Math.sin(k * 1.257) * 0.5)], [new THREE.IcosahedronGeometry(0.09), 0xff6b9a, m4(Math.cos(k * 1.257) * 0.53, 0.18, Math.sin(k * 1.257) * 0.53)]);
    this.crown = new THREE.Mesh(merge(crownParts), glowMat(0.7, { vertexColors: true, metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide }));
    this.sparks = instanced(new THREE.OctahedronGeometry(1, 0), glowMat(2.2), MAX_PARTICLES, true);
    this.rings = instanced(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), MAX_RINGS, true);
    this.rings.renderOrder = 3;
    this.scene.add(this.body, this.fins, this.wings, this.orbs, this.gems, this.halos, this.bottles, this.corks, this.beams, this.bubbles, this.crown, this.sparks, this.rings);
    for (const m of [this.body, this.fins, this.wings, this.crown, this.bottles, ...this.heads.filter((h) => h.tint !== 'fixed').map((h) => h.mesh)]) m.castShadow = true;
    this.setQuality(low);
  }

  /** High: bloom, soft shadows, smooth edges, full detail. Low: none of those, and fewer pixels, for tablets. */
  setQuality(low: boolean) {
    this.low = low;
    this.renderer.setPixelRatio(Math.min(low ? 1.25 : 2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    this.sun.shadow.mapSize.setScalar(2048);
    this.body.geometry = this.bodyGeo[low ? 1 : 0];
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; });
    this.buildComposer();
    if (this.arena && this.simRef) this.setArena(this.arena, this.simRef);
  }

  private buildComposer() {
    this.composer?.dispose();
    this.composer = null;
    if (this.low) return;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(2, this.size.x * pr), Math.max(2, this.size.y * pr), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(this.size.x * pr, this.size.y * pr), this.arena?.night ? 0.5 : 0.36, 0.55, this.arena?.night ? 1.25 : 1.5));
    this.composer.addPass(new OutputPass());
  }

  /** Build a place. Call after sim.setup, which lays out its hazards. */
  setArena(arena: Arena, sim: Sim) {
    if (this.scenery) { this.scene.remove(this.scenery.group); this.scenery.dispose(); }
    this.arena = arena;
    this.simRef = sim;
    this.gemPalette = arena.gems.map((h) => new THREE.Color(h));
    this.scene.background = new THREE.Color(arena.sky);
    this.scene.fog = new THREE.Fog(arena.sky, 140, 460);
    this.scenery = buildArena(arena, sim, this.low);
    this.scene.add(this.scenery.group);
    const night = !!arena.night;
    this.hemi.color.set(arena.skyTop).lerp(new THREE.Color(0xffffff), night ? 0.25 : 0.6);
    this.hemi.groundColor.set(arena.ground).multiplyScalar(0.7);
    const lum = new THREE.Color(arena.ground).getHSL({ h: 0, s: 0, l: 0 }).l; // pale ground needs less light
    const k = night ? 1 : lum > 0.75 ? 0.9 : 1;
    this.hemi.intensity = (night ? 2.2 : 2.0) * k;
    this.sun.color.set(arena.sun);
    this.sun.intensity = (night ? 1.8 : 3.4) * k;
    (this.gems.material as THREE.MeshStandardMaterial).emissive.setScalar(night ? 0.55 : 0.4);
    // at night gems light the ground; by day they cast a soft tinted shadow instead
    const hm = this.halos.material as THREE.MeshBasicMaterial;
    hm.blending = night ? THREE.AdditiveBlending : THREE.NormalBlending;
    hm.opacity = night ? 0.32 : 0.55;
    hm.needsUpdate = true;
    this.haloK = night ? 1 : 0.22;
    const bloom = this.composer?.passes[1] as UnrealBloomPass | undefined;
    if (bloom) { bloom.strength = night ? 0.5 : 0.36; bloom.threshold = night ? 1.25 : 1.5; }
  }

  resize(w: number, h: number) {
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.buildComposer();
  }

  /** Ground point under a screen pixel (for pointer steering). */
  groundAt(sx: number, sy: number, w: number, h: number): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), this.camera);
    return this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  /** Screen pixel of a world point, or null when behind the camera. */
  toScreen(x: number, y: number, z: number, w: number, h: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h };
  }

  // ---- effects ----
  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, col: number, grav = 14) {
    const p = this.p;
    if (p.n >= MAX_PARTICLES) return;
    const i = p.n++;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.size[i] = size; p.col[i] = col; p.g[i] = grav;
  }
  burst(x: number, z: number, colors: number[], n: number, size: number) {
    if (this.low) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 7;
      this.spark(x, 0.6 + size, z, Math.cos(a) * sp, 4 + Math.random() * 7, Math.sin(a) * sp, 0.8 + Math.random() * 0.6, (0.12 + Math.random() * 0.22) * (0.8 + size * 0.5), k % 3 === 0 ? 0xffffff : colors[k % colors.length]);
    }
  }
  /** A fountain of stars and confetti for big moments. */
  confetti(x: number, z: number, n = 90) {
    const cols = [0xffe066, 0xff6b9a, 0x5cc8ff, 0x7ee081, 0xb18cff, 0xffffff];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 6;
      this.spark(x, 1.2, z, Math.cos(a) * sp, 9 + Math.random() * 9, Math.sin(a) * sp, 1.4 + Math.random() * 0.9, 0.16 + Math.random() * 0.2, cols[k % cols.length], 11);
    }
  }
  /** An expanding ring on the ground. */
  ring(x: number, z: number, col: number, size: number, dur = 0.6) {
    if (this.ringList.length < MAX_RINGS) this.ringList.push({ x, z, t: 0, dur, size, col });
  }
  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  private fxOf(w: Wyrm): WyrmFx {
    let f = this.fx.get(w.id);
    if (!f) this.fx.set(w.id, f = { pulses: [], chomp: 0, blink: 2 + Math.random() * 3, trail: 0, pop: 0 });
    return f;
  }
  /** A bite: the head chomps and a bulge travels down the body. */
  gulp(w: Wyrm) {
    const f = this.fxOf(w);
    f.chomp = 1;
    if (f.pulses.length < 3 && (f.pulses.length === 0 || f.pulses[f.pulses.length - 1] > 5)) f.pulses.push(0);
  }
  /** A quick puff-up, for level-ups and potions. */
  puff(w: Wyrm) { this.fxOf(w).pop = 1; }
  bump(x: number, z: number) { this.scenery?.bump(x, z); this.ring(x, z, 0xffffff, 4, 0.4); }

  private palette(colors: number[]): THREE.Color[] {
    let p = this.palettes.get(colors);
    if (!p) this.palettes.set(colors, p = colors.map((h) => new THREE.Color(h)));
    return p;
  }

  render(sim: Sim, dt: number, follow: Wyrm, menu: boolean) {
    this.time += dt;
    const t = this.time;
    const c = this.tmpC, M = this.tmpM, M2 = this.tmpM2, Q = this.tmpQ, E = this.tmpE, V = this.tmpV, S = this.tmpS;

    // ---- wyrms ----
    const bodyM = this.body.instanceMatrix.array as Float32Array;
    const bodyC = this.body.instanceColor!.array as Float32Array;
    let bi = 0, wi = 0, finN = 0, wingN = 0, orbN = 0, bubbleN = 0, haloN = sim.gemCount;
    let leader: Wyrm | null = null;
    for (const w of sim.wyrms) if (w.alive && !w.isBoss && (!leader || w.mass > leader.mass)) leader = w;
    for (const h of this.heads) h.mesh.count = 0;
    for (const w of sim.wyrms) {
      if (!w.alive) continue;
      const f = this.fxOf(w);
      const r = radiusOf(w.mass) * (w.isBoss ? 1.25 : 1);
      const cols = this.palette(w.look.colors);
      const bright = (w.look.glow ? 1.3 : 1) + (w.boosting ? 0.5 + 0.3 * Math.sin(t * 20) : 0) + (w.zoom > 0 ? 0.4 : 0);
      const ice = w.frozen > 0 ? 0.6 : 0;
      for (let k = f.pulses.length - 1; k >= 0; k--) if ((f.pulses[k] += dt * 42) > w.n + 4) f.pulses.splice(k, 1);
      f.chomp = Math.max(0, f.chomp - dt * 5);
      f.pop = Math.max(0, f.pop - dt * 2.5);
      const puff = 1 + Math.sin(f.pop * Math.PI) * 0.25;
      const s = w.segs;
      // tail first so the head end draws on top where they overlap
      for (let i = w.n - 1; i >= 1; i--) {
        const taper = i > w.n * 0.7 ? 1 - ((i - w.n * 0.7) / (w.n * 0.3)) * 0.6 : 1;
        let bulge = 1;
        for (const pu of f.pulses) { const d = (i - pu) / 3; bulge += 0.32 * Math.exp(-d * d); }
        const sc = r * taper * bulge * puff;
        // wiggle: a small sideways wave, across the direction of travel
        const dx = s[i * 2 - 2] - s[i * 2], dz = s[i * 2 - 1] - s[i * 2 + 1];
        const dl = Math.hypot(dx, dz) || 1;
        const wig = Math.sin(i * 0.42 - t * (w.boosting ? 14 : 7) + w.id) * r * 0.14 * Math.min(1, i / 6);
        const o = bi * 16;
        bodyM[o] = sc; bodyM[o + 1] = 0; bodyM[o + 2] = 0; bodyM[o + 3] = 0;
        bodyM[o + 4] = 0; bodyM[o + 5] = sc * 0.9; bodyM[o + 6] = 0; bodyM[o + 7] = 0;
        bodyM[o + 8] = 0; bodyM[o + 9] = 0; bodyM[o + 10] = sc; bodyM[o + 11] = 0;
        const px = s[i * 2] - (dz / dl) * wig, pz = s[i * 2 + 1] + (dx / dl) * wig;
        bodyM[o + 12] = px; bodyM[o + 13] = sc * 0.86 + Math.sin(i * 0.5 - t * 6) * 0.06; bodyM[o + 14] = pz; bodyM[o + 15] = 1;
        const band = Math.floor(i / 3);
        const col = cols[band % cols.length];
        const belly = i % 3 === 1 ? 1.08 : 1;
        bodyC[bi * 3] = (col.r + (0.75 - col.r) * ice) * bright * belly; bodyC[bi * 3 + 1] = (col.g + (0.95 - col.g) * ice) * bright * belly; bodyC[bi * 3 + 2] = (col.b + (1 - col.b) * ice) * bright * belly;
        bi++;
        // back fins from the Sprout stage on
        if (w.evo >= 1 && i % 3 === 0 && i > 2 && i < w.n * 0.75 && finN < 900) {
          const fs = sc * (0.5 + Math.min(w.evo, 4) * 0.1);
          this.fins.setMatrixAt(finN, M.compose(V.set(px, sc * 1.55, pz), Q.setFromEuler(E.set(0, -Math.atan2(dz, dx), 0.75)), S.set(fs, fs * (1 + 0.15 * Math.sin(t * 5 + i)), fs * 0.45)));
          this.fins.setColorAt(finN++, c.setHex(w.look.accColor).multiplyScalar(bright));
        }
      }
      const tx = s[(w.n - 1) * 2], tz = s[(w.n - 1) * 2 + 1];
      // tail gem from the Elder stage on
      if (w.evo >= 4) {
        const ts = r * 0.55;
        this.orbs.setMatrixAt(orbN, M.makeRotationY(t * 3).scale(S.set(ts, ts * 1.5, ts)).setPosition(tx, r * 0.9 + Math.sin(t * 4) * 0.15, tz));
        this.orbs.setColorAt(orbN++, c.setHex(w.look.accColor));
      }
      // star trail at Mythic
      if (w.evo >= 6 && dt > 0 && (f.trail -= dt) <= 0) {
        f.trail = this.low ? 0.12 : 0.05;
        const k = Math.floor(Math.random() * w.n);
        this.spark(s[k * 2], r * 1.6, s[k * 2 + 1], (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.9, 0.14, k % 2 ? 0xffffff : w.look.accColor, 2);
      }
      // boost trail
      if (w.boosting && dt > 0 && Math.random() < (this.low ? 0.3 : 0.7)) {
        this.spark(tx, r, tz, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.13, w.zoom > 0 ? 0x7dff6a : 0xffffff, 4);
      }

      // head, with squash and stretch
      const HR = r * 1.3 * puff;
      const hx = s[0], hz = s[1];
      const stretch = 1 + (w.boosting ? 0.1 : 0) + f.chomp * 0.1 + Math.sin(t * 3 + w.id) * 0.015;
      const headM = M.compose(V.set(hx, HR * 0.84 + Math.sin(t * 6 + w.id) * 0.04, hz), Q.setFromEuler(E.set(0, -w.ang, Math.sin(t * 7 + w.id) * 0.03)), S.set(HR * stretch, HR * (1 - f.chomp * 0.08) / Math.sqrt(stretch), HR / Math.sqrt(stretch)));
      if ((f.blink -= dt) < -0.13) f.blink = 1.5 + Math.random() * 4;
      const lid = f.blink < 0 ? 0.1 : 1;
      const turn = Math.max(-1, Math.min(1, Math.atan2(Math.sin(w.targetAng - w.ang), Math.cos(w.targetAng - w.ang)) * 1.5));
      for (const h of this.heads) {
        if ((h.acc && h.acc !== w.look.acc) || (h.evo !== undefined && w.evo < h.evo)) continue;
        for (const it of h.items) {
          const k = h.mesh.count++;
          let px = it.p[0], pz = it.p[2], sy = it.s[1];
          if (h.dyn === 'eye') sy *= lid;
          else if (h.dyn === 'pupil') { sy *= lid; pz += turn * 0.07; px -= Math.abs(turn) * 0.02; }
          else if (h.dyn === 'mouth') sy *= 0.5 + f.chomp * 2.2;
          Q.setFromEuler(it.r ? E.set(it.r[0], it.r[1], it.r[2]) : E.set(0, 0, 0));
          h.mesh.setMatrixAt(k, M2.compose(V.set(px, it.p[1], pz), Q, S.set(it.s[0], sy, it.s[2])).premultiply(headM));
          if (h.tint !== 'fixed') {
            c.setHex(h.tint === 'head' ? w.look.head : w.look.accColor);
            h.mesh.setColorAt(k, c.multiplyScalar(w.look.glow ? 1.25 : 1));
          }
        }
      }
      // wings from the Drake stage on: set on the neck, flapping
      if (w.evo >= 2 && w.n > 6) {
        const k = Math.min(w.n - 2, 4);
        const wa = Math.atan2(s[k * 2 - 1] - s[k * 2 + 1], s[k * 2 - 2] - s[k * 2]);
        const wsz = r * (0.9 + (Math.min(w.evo, 6) - 2) * 0.32);
        const flap = 0.25 + 0.5 * Math.sin(t * (w.boosting ? 18 : 8) + w.id);
        c.setHex(w.look.accColor).multiplyScalar(w.look.glow ? 1.25 : 1);
        for (const side of [1, -1]) {
          this.wings.setMatrixAt(wingN, M.compose(V.set(s[k * 2], r * 1.25, s[k * 2 + 1]), Q.setFromEuler(this.tmpE2.set(-flap * side, -wa, 0)), S.set(wsz, wsz, wsz * side)));
          this.wings.setColorAt(wingN++, c);
        }
      }
      // aura from the Ancient stage on
      if (w.evo >= 5) {
        const as = HR * (3.2 + Math.sin(t * 3) * 0.3);
        this.halos.setMatrixAt(haloN, M2.makeScale(as, 1, as).setPosition(hx, 0.07, hz));
        this.halos.setColorAt(haloN++, c.setHex(w.look.accColor));
      }
      if (w.bubble > 0 && (w.bubble > 2 || Math.sin(t * 25) > 0)) {
        const bs = HR * (1.6 + Math.sin(t * 5) * 0.05);
        this.bubbles.setMatrixAt(bubbleN++, M2.makeScale(bs, bs, bs).setPosition(hx, HR * 0.84, hz));
      }
      if (w === leader) {
        this.crown.position.set(hx - Math.cos(w.ang) * HR * 0.1, HR * (w.look.acc === 'bunny' ? 2.3 : 1.85) + Math.sin(t * 3) * 0.08, hz - Math.sin(w.ang) * HR * 0.1);
        this.crown.scale.setScalar(HR * 0.95);
        this.crown.rotation.y = t;
      }
      wi++;
    }
    this.crown.visible = !!leader && wi > 1;
    this.body.count = bi;
    this.fins.count = finN;

    // ---- gems ----
    const gm = this.gems.instanceMatrix.array as Float32Array;
    const gc = this.gems.instanceColor!.array as Float32Array;
    const hm = this.halos.instanceMatrix.array as Float32Array;
    const hc = this.halos.instanceColor!.array as Float32Array;
    const n = sim.gemCount;
    const allHalos = !this.low, hk = this.haloK;
    for (let i = 0; i < n; i++) {
      const v = sim.gv[i];
      const ph = sim.gph[i];
      const tw = 1 + Math.max(0, Math.sin(t * 2.2 + ph * 7) - 0.9) * 2.5; // now and then a gem twinkles
      const sz = (0.36 + 0.14 * Math.sqrt(v)) * tw;
      const a = t * 1.5 + ph, ca = Math.cos(a) * sz, sa = Math.sin(a) * sz;
      const x = sim.gx[i], z = sim.gz[i], y = 0.5 + sz + Math.sin(t * 2.5 + ph) * 0.14;
      const o = i * 16;
      gm[o] = ca; gm[o + 1] = 0; gm[o + 2] = -sa; gm[o + 3] = 0;
      gm[o + 4] = 0; gm[o + 5] = sz * 1.1; gm[o + 6] = 0; gm[o + 7] = 0;
      gm[o + 8] = sa; gm[o + 9] = 0; gm[o + 10] = ca; gm[o + 11] = 0;
      gm[o + 12] = x; gm[o + 13] = y; gm[o + 14] = z; gm[o + 15] = 1;
      const hs = allHalos || v >= 3 ? sz * (hk < 1 ? 1.7 : 2.6) : 0;
      hm[o] = hs; hm[o + 1] = 0; hm[o + 2] = 0; hm[o + 3] = 0;
      hm[o + 4] = 0; hm[o + 5] = 1; hm[o + 6] = 0; hm[o + 7] = 0;
      hm[o + 8] = 0; hm[o + 9] = 0; hm[o + 10] = hs; hm[o + 11] = 0;
      hm[o + 12] = x; hm[o + 13] = 0.06; hm[o + 14] = z; hm[o + 15] = 1;
      const col = sim.gc[i] === 255 ? c.setHex(sim.gcol[i]) : this.gemPalette[sim.gc[i]];
      const tb = tw * tw;
      gc[i * 3] = col.r * tb; gc[i * 3 + 1] = col.g * tb; gc[i * 3 + 2] = col.b * tb;
      hc[i * 3] = col.r * hk; hc[i * 3 + 1] = col.g * hk; hc[i * 3 + 2] = col.b * hk;
    }
    // sprite gems: a golden gem with little wings that runs away
    for (const sp of sim.sprites) {
      if (!sp.alive) continue;
      const tired = sp.tired > 0;
      const y = (tired ? 0.9 : 1.5) + Math.sin(t * 6 + sp.x) * 0.2;
      this.orbs.setMatrixAt(orbN, M.makeRotationY(t * 4).scale(S.set(0.5, 0.7, 0.5)).setPosition(sp.x, y, sp.z));
      this.orbs.setColorAt(orbN++, c.setHex(tired ? 0xb8a060 : 0xffe066));
      const flap = 0.2 + 0.7 * Math.sin(t * (sp.fleeing ? 30 : 12) + sp.z);
      for (const side of [1, -1]) {
        this.wings.setMatrixAt(wingN, M.compose(V.set(sp.x, y + 0.1, sp.z), Q.setFromEuler(this.tmpE2.set(-flap * side, -sp.ang, 0)), S.set(0.7, 0.7, 0.7 * side)));
        this.wings.setColorAt(wingN++, c.setRGB(1.6, 1.6, 1.6));
      }
      this.halos.setMatrixAt(haloN, M2.makeScale(2.6, 1, 2.6).setPosition(sp.x, 0.07, sp.z));
      this.halos.setColorAt(haloN++, c.setHex(0xffe066));
      if (sp.fleeing && dt > 0 && Math.random() < 0.5) this.spark(sp.x, y, sp.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.5, 0.1, 0xfff0a0, 3);
    }
    let pn = 0;
    for (const p of sim.potions) {
      if (!p.alive) continue;
      const y = 1.3 + Math.sin(t * 2 + p.x) * 0.25;
      const m = M.compose(V.set(p.x, y, p.z), Q.setFromAxisAngle(V.set(0, 1, 0), t), S.set(1.15, 1.15, 1.15));
      this.bottles.setMatrixAt(pn, m);
      this.corks.setMatrixAt(pn, m);
      c.setHex(POTIONS[p.kind].color);
      this.bottles.setColorAt(pn, c);
      this.beams.setMatrixAt(pn, M2.makeScale(1, 1 + Math.sin(t * 3 + p.z) * 0.08, 1).setPosition(p.x, 0, p.z));
      this.beams.setColorAt(pn, c);
      pn++;
      this.halos.setMatrixAt(haloN, M2.makeScale(3.4, 1, 3.4).setPosition(p.x, 0.07, p.z));
      this.halos.setColorAt(haloN++, c);
    }
    this.bottles.count = this.corks.count = this.beams.count = pn;
    this.gems.count = n;
    this.halos.count = haloN;
    this.wings.count = wingN;
    this.orbs.count = orbN;
    this.bubbles.count = bubbleN;

    // ---- sparkles ----
    const p = this.p;
    for (let i = 0; i < p.n; i++) {
      p.life[i] -= dt;
      if (p.life[i] <= 0 || p.y[i] < 0) {
        const l = --p.n;
        p.x[i] = p.x[l]; p.y[i] = p.y[l]; p.z[i] = p.z[l]; p.vx[i] = p.vx[l]; p.vy[i] = p.vy[l]; p.vz[i] = p.vz[l];
        p.life[i] = p.life[l]; p.size[i] = p.size[l]; p.col[i] = p.col[l]; p.g[i] = p.g[l];
        i--;
        continue;
      }
      p.vy[i] -= p.g[i] * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      p.vx[i] *= 0.97; p.vz[i] *= 0.97;
      const sz = p.size[i] * Math.min(1, p.life[i] * 2);
      this.sparks.setMatrixAt(i, M.makeRotationY(t * 4 + i).scale(S.set(sz, sz * 1.4, sz)).setPosition(p.x[i], Math.max(0.1, p.y[i]), p.z[i]));
      this.sparks.setColorAt(i, c.setHex(p.col[i]));
    }
    this.sparks.count = p.n;
    let rn = 0;
    for (let i = this.ringList.length - 1; i >= 0; i--) {
      const rg = this.ringList[i];
      if ((rg.t += dt) >= rg.dur) { this.ringList.splice(i, 1); continue; }
      const k = rg.t / rg.dur, sz = rg.size * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
      this.rings.setMatrixAt(rn, M.makeScale(sz, 1, sz).setPosition(rg.x, 0.12, rg.z));
      this.rings.setColorAt(rn++, c.setHex(rg.col).multiplyScalar((1 - k) * 0.7));
    }
    this.rings.count = rn;
    for (const m of [this.body, this.fins, this.wings, this.orbs, this.gems, this.halos, this.bottles, this.corks, this.beams, this.bubbles, this.sparks, this.rings, ...this.heads.map((h) => h.mesh)]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // ---- camera: north up, leads the wyrm a little, zooms out as it grows, shakes on big hits ----
    const fr = radiusOf(follow.mass);
    const wantH = menu ? 34 : 14 + fr * 14 + Math.min(18, follow.n * 0.05);
    this.camH += (wantH - this.camH) * Math.min(1, dt * 1.5);
    const ct = this.camTarget;
    if (follow.alive) {
      const la = menu ? 0 : 3 + fr * 3;
      this.lead.lerp(V.set(Math.cos(follow.ang) * la, 0, Math.sin(follow.ang) * la), Math.min(1, dt * 1.6));
      ct.lerp(V.set(follow.segs[0] + this.lead.x, 0, follow.segs[1] + this.lead.z), Math.min(1, dt * 5));
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const sh = this.trauma * this.trauma * 1.4;
    const sx = Math.sin(t * 53) * sh, sz2 = Math.sin(t * 67 + 1) * sh;
    this.fovKick += ((follow.boosting && !menu ? 5 : 0) - this.fovKick) * Math.min(1, dt * 4);
    this.camera.fov = 48 + this.fovKick;
    this.camera.updateProjectionMatrix();
    if (menu) {
      // a slow, low orbit that shows off the place
      const a = t * 0.07 + 0.6;
      this.camera.position.set(ct.x + Math.sin(a) * 30, 13, ct.z + Math.cos(a) * 30);
      this.camera.lookAt(ct.x, 2.5, ct.z);
    } else {
      this.camera.position.set(ct.x + sx, this.camH, ct.z + this.camH * 0.7 + sz2);
      this.camera.lookAt(ct.x + sx, 0, ct.z - 2 + sz2);
    }
    if (this.scenery) {
      this.sun.position.copy(ct).addScaledVector(this.scenery.sunDir, 150);
      this.sun.target.position.copy(ct);
      this.scenery.update(t, ct, this.renderer.getPixelRatio() * this.size.y / 720);
    }
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  snapCamera(w: Wyrm) {
    this.camTarget.set(w.segs[0], 0, w.segs[1]);
    this.lead.set(0, 0, 0);
  }
}
