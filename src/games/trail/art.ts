// All visuals, built in code from three.js geometry and small shaders: renderer and post effects, skiers,
// the claimable ground, tracks, particles, weather, sky, cliffs, scenery, landmarks, and the lodge.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Kind, type Mountain, type ThemeDef, type Weather } from './data';
import { ICE, JUMP, POWDER, mulberry, type Pt, type Terrain } from './sim';

// ---------------------------------------------------------------------------------------------------
// Renderer: High = soft shadows, 4x antialiasing and a little bloom; Low = one plain pass for tablets.
// ---------------------------------------------------------------------------------------------------

export class Gfx {
  readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  high = true;
  private composer: EffectComposer | null = null;
  private pass: RenderPass | null = null;

  constructor() {
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // three 0.186 filters this softly; the old soft type is gone
  }

  /** Tablets and phones (touch, no fine pointer) and weak laptops start on Low. */
  static auto(): boolean {
    return !matchMedia('(pointer: coarse)').matches && (navigator.hardwareConcurrency ?? 4) >= 6;
  }

  setQuality(high: boolean) {
    this.high = high;
    this.renderer.shadowMap.enabled = high;
    this.composer?.dispose();
    this.composer = null;
    this.resize();
  }

  resize() {
    const r = this.renderer, w = innerWidth, h = innerHeight;
    r.setPixelRatio(Math.min(devicePixelRatio, this.high ? 2 : 1.25));
    r.setSize(w, h, false);
    if (!this.high) return;
    if (!this.composer) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, target);
      this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.composer.addPass(this.pass);
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.32, 0.5, 1.0));
      this.composer.addPass(new OutputPass());
    }
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.high && this.composer && this.pass) {
      this.pass.scene = scene;
      this.pass.camera = camera;
      this.composer.render();
    } else this.renderer.render(scene, camera);
  }
}

// ---------------------------------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------------------------------

const mats = new Map<string, THREE.MeshLambertMaterial>();
function lambert(color: number, glow = 0): THREE.MeshLambertMaterial {
  const key = color + ':' + glow;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: glow ? color : 0, emissiveIntensity: glow })));
  return m;
}

/** Gentle swells plus a field of moguls; skiers, tracks and scenery all sit on this. */
export function heightAt(x: number, z: number): number {
  const swell = 0.5 * Math.sin(x * 0.11 + 1) * Math.cos(z * 0.09) + 0.3 * Math.sin(x * 0.05 - z * 0.07);
  const patch = Math.max(0, Math.sin(x * 0.045 + 2) * Math.sin(z * 0.05 + 1) - 0.25);
  return swell + patch * 0.32 * Math.sin(x * 1.25) * Math.sin(z * 1.4);
}

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }`;

// ---------------------------------------------------------------------------------------------------
// Skiers
// ---------------------------------------------------------------------------------------------------

const geo = {
  ski: new THREE.CapsuleGeometry(0.07, 1.25, 2, 6),
  board: new THREE.CapsuleGeometry(0.26, 0.9, 3, 8),
  body: new THREE.CapsuleGeometry(0.3, 0.3, 4, 12),
  leg: new THREE.CapsuleGeometry(0.1, 0.16, 2, 8),
  arm: new THREE.CapsuleGeometry(0.075, 0.26, 2, 8),
  pole: new THREE.CylinderGeometry(0.018, 0.018, 0.8, 5),
  basket: new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8),
  head: new THREE.SphereGeometry(0.36, 16, 12),
  eye: new THREE.SphereGeometry(0.06, 8, 6),
  nose: new THREE.SphereGeometry(0.045, 6, 4),
  cheek: new THREE.SphereGeometry(0.06, 6, 4),
  catEar: new THREE.ConeGeometry(0.13, 0.26, 4),
  foxEar: new THREE.ConeGeometry(0.15, 0.34, 4),
  bunnyEar: new THREE.CapsuleGeometry(0.07, 0.36, 2, 6),
  bearEar: new THREE.SphereGeometry(0.12, 8, 6),
  horn: new THREE.ConeGeometry(0.06, 0.26, 5),
  spike: new THREE.ConeGeometry(0.09, 0.2, 4),
  beak: new THREE.ConeGeometry(0.07, 0.18, 5),
  tail: new THREE.CapsuleGeometry(0.07, 0.4, 2, 6),
  puffTail: new THREE.SphereGeometry(0.13, 8, 6),
  scarf: new THREE.TorusGeometry(0.25, 0.075, 6, 14),
  flap: new THREE.BoxGeometry(0.2, 0.035, 0.13),
  wing: new THREE.ConeGeometry(0.22, 0.5, 3),
  shadow: new THREE.CircleGeometry(0.62, 18),
};
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1a2a40, transparent: true, opacity: 0.18, depthWrite: false });

function part(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export interface Rig {
  root: THREE.Group;
  lean: THREE.Group; // tilts into turns
  upper: THREE.Group; // crouches and tucks
  arms: THREE.Group[];
  scarf: THREE.Group[];
  tail: THREE.Object3D | null;
  blob: THREE.Mesh;
}

/** A cute skier facing +x, with arms, poles, a scarf that flaps, and a blob shadow for Low quality. */
export function makeSkier(kind: Kind, jacket: number, fur: number, board: boolean, gold = false): Rig {
  const root = new THREE.Group(), lean = new THREE.Group(), upper = new THREE.Group();
  root.add(lean);
  lean.add(upper);
  lean.scale.setScalar(1.5); // one grid cell is small on screen; skiers read better a bit larger
  const blob = new THREE.Mesh(geo.shadow, shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.04;
  blob.scale.setScalar(1.5);
  root.add(blob);

  const coat = lambert(jacket, gold ? 0.5 : 0), furM = lambert(fur, gold ? 0.6 : 0), ink = lambert(0x2a2230), white = lambert(0xffffff);
  if (board) {
    const b = part(geo.board, coat, 0, 0.06, 0, lean);
    b.rotation.z = Math.PI / 2;
    b.scale.set(0.22, 1, 1);
  } else
    for (const z of [-0.17, 0.17]) {
      const s = part(geo.ski, coat, 0.08, 0.05, z, lean);
      s.rotation.z = Math.PI / 2;
      s.scale.set(0.45, 1, 1);
    }
  for (const z of [-0.15, 0.15]) part(geo.leg, lambert(0x3a4660), 0, 0.26, z, lean);

  const dark = kind === 'penguin';
  part(geo.body, dark ? furM : coat, 0, 0.62, 0, upper);
  if (dark) part(geo.cheek, white, 0.24, 0.6, 0, upper).scale.set(1.2, 4, 3.4); // penguin belly
  const scarfM = dark ? coat : gold ? lambert(0xff5a8a) : white;
  part(geo.scarf, scarfM, 0, 0.92, 0, upper).rotation.x = Math.PI / 2;
  const scarf: THREE.Group[] = [];
  let at: THREE.Object3D = upper;
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    g.position.set(k ? -0.2 : -0.26, k ? 0 : 0.92, k ? 0 : 0.1);
    part(geo.flap, scarfM, -0.1, 0, 0, g);
    at.add(g);
    scarf.push(g);
    at = g;
  }
  part(geo.head, furM, 0.02, 1.22, 0, upper);
  for (const z of [-0.13, 0.13]) {
    part(geo.eye, ink, 0.32, 1.27, z, upper);
    part(geo.eye, white, 0.355, 1.295, z + 0.015, upper).scale.setScalar(0.4); // eye shine
    if (!dark) part(geo.cheek, lambert(0xff9fbf), 0.3, 1.13, z * 1.7, upper).scale.set(0.6, 0.6, 1);
  }
  if (dark) part(geo.beak, lambert(0xffa23a), 0.42, 1.16, 0, upper).rotation.z = -Math.PI / 2;
  else part(geo.nose, lambert(kind === 'bear' ? 0x3a2a24 : 0xff7fa8), 0.36, 1.17, 0, upper);

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.02, 0.84, side * 0.33);
    part(geo.arm, dark ? furM : coat, 0, -0.17, 0, arm);
    if (!board) {
      part(geo.pole, lambert(0xd8dce8), 0, -0.6, 0, arm);
      part(geo.basket, ink, 0, -0.95, 0, arm);
    }
    upper.add(arm);
    arms.push(arm);
    if (kind === 'cat' || kind === 'fox') part(kind === 'fox' ? geo.foxEar : geo.catEar, furM, -0.02, 1.55, side * 0.2, upper).rotation.x = side * 0.35;
    else if (kind === 'bunny') part(geo.bunnyEar, furM, -0.05, 1.72, side * 0.13, upper).rotation.x = side * 0.18;
    else if (kind === 'bear') part(geo.bearEar, furM, -0.02, 1.5, side * 0.26, upper);
    else if (kind === 'dragon') {
      part(geo.horn, lambert(0xfff2b0), -0.08, 1.56, side * 0.16, upper).rotation.z = 0.5;
      const w = part(geo.wing, coat, -0.3, 0.9, side * 0.3, upper);
      w.rotation.set(side * 1.1, 0, 0.9);
      w.scale.z = 0.3;
    }
  }
  if (kind === 'dragon') for (let k = 0; k < 3; k++) part(geo.spike, coat, -0.3 + k * 0.02, 0.95 - k * 0.22, 0, upper).rotation.z = 0.9;
  let tail: THREE.Object3D | null = null;
  if (kind === 'cat' || kind === 'fox' || kind === 'dragon') {
    tail = part(geo.tail, kind === 'dragon' ? coat : furM, -0.42, 0.55, 0, upper);
    tail.rotation.z = -1.0;
    if (kind === 'fox') tail.scale.set(2, 1.2, 2);
  } else if (kind === 'bunny' || kind === 'bear') part(geo.puffTail, furM, -0.32, 0.45, 0, upper);
  return { root, lean, upper, arms, scarf, tail, blob };
}

/** Carve lean, crouch, pole plants, scarf flap and tail wag. `turn` is radians per second; `air` > 0 in a jump. */
export function poseSkier(r: Rig, t: number, dt: number, turn: number, air: number, moving: boolean) {
  const k = Math.min(1, dt * 9);
  const carve = Math.min(1, Math.abs(turn) / 4);
  r.lean.rotation.x += (-turn * 0.11 - r.lean.rotation.x) * k;
  const crouch = moving ? 0.06 + carve * 0.1 : 0;
  r.upper.position.y += (-crouch + (moving ? Math.sin(t * 9) * 0.012 : 0) - r.upper.position.y) * k;
  r.upper.rotation.z += ((air > 0 ? 0.3 : moving ? -0.16 - carve * 0.16 : 0) - r.upper.rotation.z) * k;
  r.arms.forEach((a, i) => {
    const side = i ? 1 : -1, inside = side * turn > 1.2;
    const want = air > 0 ? -2.4 : moving ? 0.55 + (inside ? 0.6 : 0) + Math.sin(t * 5 + i * 3) * 0.06 : 0.2;
    a.rotation.z += (want - a.rotation.z) * k;
    a.rotation.x += (side * (air > 0 ? 0.9 : 0.25 + carve * 0.2) - a.rotation.x) * k;
  });
  r.scarf.forEach((s, i) => {
    const flap = moving ? 1 : 0.25;
    s.rotation.y = Math.sin(t * 13 - i * 1.1) * 0.4 * flap + turn * 0.07;
    s.rotation.z = Math.sin(t * 10 - i * 0.8) * 0.22 * flap + (i ? 0 : 0.25);
  });
  if (r.tail) r.tail.rotation.x = Math.sin(t * 8) * 0.35;
}

// ---------------------------------------------------------------------------------------------------
// Claimable ground: a rolling snowfield with ownership colours, corduroy, ice, powder, sparkle and the claim wave
// ---------------------------------------------------------------------------------------------------

export class Ground {
  readonly mesh: THREE.Mesh;
  private a: Uint8Array;
  private b: Uint8Array;
  private f: Uint8Array; // claim wave: 255 = waiting for the wave, then fades to 0
  private fresh: Float32Array;
  private prev: Uint8Array;
  private waving = false;
  private ta: THREE.DataTexture;
  private tb: THREE.DataTexture;
  private tf: THREE.DataTexture;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(private n: number, theme: ThemeDef, slotColors: number[], terrain: Terrain, lamps: Pt[], high: boolean) {
    const cells = n * n;
    this.a = new Uint8Array(cells * 4);
    this.b = new Uint8Array(cells * 4);
    this.f = new Uint8Array(cells * 4);
    this.fresh = new Float32Array(cells);
    this.prev = new Uint8Array(cells);
    const tiles = new Uint8Array(cells * 4);
    for (let i = 0; i < cells; i++) {
      const t = terrain.tiles[i];
      tiles[i * 4] = t === ICE ? 255 : 0;
      tiles[i * 4 + 1] = t === POWDER ? 255 : 0;
      tiles[i * 4 + 2] = t === JUMP ? 255 : 0;
    }
    const tex = (d: Uint8Array) => {
      const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    };
    this.ta = tex(this.a);
    this.tb = tex(this.b);
    this.tf = tex(this.f);
    const lampV = Array.from({ length: 8 }, (_, k) => (lamps[k] ? new THREE.Vector3(lamps[k].x, lamps[k].z, 1) : new THREE.Vector3()));
    this.uniforms = {
      mA: { value: this.ta }, mB: { value: this.tb }, mF: { value: this.tf }, mT: { value: tex(tiles) },
      uCols: { value: slotColors.map((c) => new THREE.Color(c)) },
      uBase: { value: new THREE.Color(theme.ground) },
      uN: { value: n }, uTime: { value: 0 }, uLamps: { value: lampV },
      uSand: { value: theme.beach ? 1 : 0 }, uNight: { value: theme.night ? 1 : 0 },
    };
    const mat = new THREE.MeshLambertMaterial();
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW;
          uniform sampler2D mA, mB, mF, mT;
          uniform vec3 uCols[8];
          uniform vec3 uBase;
          uniform vec3 uLamps[8];
          uniform float uN, uTime, uSand, uNight;
          ${NOISE}`)
        .replace('#include <color_fragment>', /* glsl */ `
          vec2 uv = vW.xz / uN;
          vec4 a = texture2D(mA, uv), b = texture2D(mB, uv);
          float m = a.r; int k = 0;
          if (a.g > m) { m = a.g; k = 1; }
          if (a.b > m) { m = a.b; k = 2; }
          if (a.a > m) { m = a.a; k = 3; }
          if (b.r > m) { m = b.r; k = 4; }
          if (b.g > m) { m = b.g; k = 5; }
          if (b.b > m) { m = b.b; k = 6; }
          if (b.a > m) { m = b.a; k = 7; }
          vec4 tile = texture2D(mT, uv);
          float fresh = texture2D(mF, uv).r;
          float big = vnoise(vW.xz * 0.22), fine = vnoise(vW.xz * 3.1);
          // Open snow: soft drifts, wind ripples, blue in the hollows.
          float ripple = sin(vW.x * 2.2 + vW.z * 0.7 + big * 6.0) * 0.5 + 0.5;
          vec3 c = uBase * (0.9 + 0.1 * big) * (0.97 + 0.03 * ripple);
          c = mix(c, c * vec3(0.86, 0.92, 1.04), (1.0 - uSand) * smoothstep(0.1, -0.5, vW.y));
          c = mix(c, c * (0.93 + 0.14 * fine), 0.6 + 0.4 * uSand);
          float ice = smoothstep(0.35, 0.6, tile.r), powder = smoothstep(0.35, 0.6, tile.g), ramp = smoothstep(0.4, 0.6, tile.b);
          vec3 iceC = mix(vec3(0.55, 0.84, 0.98), vec3(0.82, 0.95, 1.0), vnoise(vW.xz * 0.9 + 7.0));
          iceC = mix(iceC, vec3(1.0), smoothstep(0.47, 0.5, abs(vnoise(vW.xz * 1.6) - 0.5) * 2.0) * 0.0 + step(0.96, vnoise(vW.xz * 2.4 + 3.0)) * 0.6);
          c = mix(c, iceC * (uNight > 0.5 ? 0.75 : 1.0), ice * 0.92);
          float puff = vnoise(vW.xz * 1.7);
          c = mix(c, uBase * (0.86 + 0.2 * puff) * vec3(0.97, 0.98, 1.03), powder);
          c = mix(c, mix(vec3(1.0, 0.82, 0.2), vec3(1.0, 0.35, 0.45), step(0.5, fract((vW.x + vW.z) * 0.7))), ramp);
          float reveal = 1.0 - smoothstep(0.86, 0.97, fresh);
          float own = smoothstep(0.5, 0.56, m) * reveal;
          float cord = sin(vW.z * 9.5) * 0.5 + 0.5;
          vec3 oc = mix(uCols[k], vec3(1.0), 0.36);
          oc *= 0.9 + 0.1 * cord;
          oc *= mix(0.7, 1.0, smoothstep(0.5, 0.66, m)); // darker rim at the border
          oc = mix(oc, oc * 0.9 + iceC * 0.25, ice);
          c = mix(c, oc, own);
          float flash = fresh * reveal;
          c = mix(c, vec3(1.0), flash * 0.75);
          diffuseColor.rgb = c;`)
        .replace('#include <normal_fragment_maps>', /* glsl */ `
          {
            vec2 e = vec2(0.12, 0.0);
            float h0 = vnoise(vW.xz * 1.9), hx = vnoise((vW.xz + e.xy) * 1.9), hz = vnoise((vW.xz + e.yx) * 1.9);
            vec3 bump = vec3(h0 - hx, 0.0, h0 - hz) * mix(1.6, 3.4, powder) * (1.0 - ice);
            bump.z += cos(vW.z * 9.5) * 0.3 * own;
            normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz);
          }`)
        .replace('#include <emissivemap_fragment>', /* glsl */ `
          {
            // Sparkle: a few grains catch the light and twinkle as the camera moves.
            vec2 g = floor(vW.xz * 7.0);
            float r = hash(g);
            float tw = pow(max(0.0, sin(uTime * 2.0 + r * 60.0 + dot(vViewPosition.xy, vec2(0.9, 0.7)))), 6.0);
            float sp = step(0.972 - 0.02 * powder - 0.03 * flash, r) * tw * (1.0 - uSand * 0.6);
            sp *= smoothstep(0.45, 0.15, length(fract(vW.xz * 7.0) - 0.5)); // round grains, not squares
            totalEmissiveRadiance += vec3(1.0, 0.98, 0.94) * sp * (1.6 + flash * 2.0);
            totalEmissiveRadiance += uCols[k] * flash * 0.9;
            totalEmissiveRadiance += vec3(0.5, 0.8, 1.0) * ice * (0.05 + 0.25 * uNight);
            float glow = 0.0;
            for (int i = 0; i < 8; i++) { vec2 d = vW.xz - uLamps[i].xy; glow += uLamps[i].z * exp(-dot(d, d) / 38.0); }
            totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * glow * c * 0.75;
          }`);
    };
    const seg = high ? 160 : 80;
    const g = new THREE.PlaneGeometry(n, n, seg, seg);
    g.rotateX(-Math.PI / 2);
    g.translate(n / 2, 0, n / 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
  }

  /** Repaint from the owner grid. Cells that just changed hands join a wave that spreads out from `from`. */
  update(owner: Uint8Array, from: Pt | null): number[] {
    const { a, b, fresh, prev, n } = this;
    const fx: number[] = [];
    a.fill(0);
    b.fill(0);
    for (let i = 0; i < owner.length; i++) {
      const o = owner[i];
      if (o) (o <= 4 ? a : b)[i * 4 + ((o - 1) & 3)] = 255;
      if (o && o !== prev[i] && from) {
        const d = Math.hypot((i % n) + 0.5 - from.x, Math.floor(i / n) + 0.5 - from.z);
        fresh[i] = 1 + d * 0.05;
        this.waving = true;
        if (fx.length < 60 && Math.random() < 0.3) fx.push(i);
      }
      prev[i] = o;
    }
    this.ta.needsUpdate = this.tb.needsUpdate = true;
    return fx;
  }

  tick(dt: number, t: number) {
    this.uniforms.uTime.value = t;
    if (!this.waving) return;
    this.waving = false;
    const { fresh, f } = this;
    for (let i = 0; i < fresh.length; i++) {
      let v = fresh[i];
      if (v > 0) {
        v = fresh[i] = Math.max(0, v - dt * 1.3);
        this.waving = true;
      }
      f[i * 4] = v >= 1 ? 255 : v * 240;
    }
    this.tf.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------------
// Ski tracks behind a skier who is out on open snow
// ---------------------------------------------------------------------------------------------------

const LANES: [number, number, number, boolean][] = [
  [-0.46, 0.46, 0.05, false],
  [-0.34, -0.2, 0.07, true],
  [0.2, 0.34, 0.07, true],
];

export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private geom: THREE.BufferGeometry;
  private n = 0;

  constructor(color: number, glow: boolean, private max = 1500) {
    const v = LANES.length * 2;
    this.pos = new Float32Array(max * v * 3);
    const col = new Float32Array(max * v * 3);
    const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.2).multiplyScalar(glow ? 1.7 : 1.05);
    const dark = new THREE.Color(color).multiplyScalar(0.6);
    for (let p = 0; p < max; p++)
      for (let l = 0; l < LANES.length; l++) for (let s = 0; s < 2; s++) (LANES[l][3] ? dark : light).toArray(col, (p * v + l * 2 + s) * 3);
    const idx: number[] = [];
    for (let p = 1; p < max; p++)
      for (let l = 0; l < LANES.length; l++) {
        const a = (p - 1) * v + l * 2, c = p * v + l * 2;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geom.setIndex(idx);
    this.geom.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geom, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
    this.mesh.frustumCulled = false;
  }

  /** Follow the sim's open track (x, z, heading triples). */
  sync(pts: number[]) {
    const have = pts.length / 3;
    if (have < this.n) this.n = 0;
    if (have === this.n) return;
    const v = LANES.length * 2;
    for (; this.n < Math.min(have, this.max); this.n++) {
      const x = pts[this.n * 3], z = pts[this.n * 3 + 1], h = pts[this.n * 3 + 2];
      const px = -Math.sin(h), pz = Math.cos(h);
      for (let l = 0; l < LANES.length; l++)
        for (let s = 0; s < 2; s++) {
          const o = LANES[l][s] as number, k = (this.n * v + l * 2 + s) * 3;
          this.pos[k] = x + px * o;
          this.pos[k + 1] = heightAt(x + px * o, z + pz * o) + (LANES[l][2] as number);
          this.pos[k + 2] = z + pz * o;
        }
    }
    (this.geom.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.geom.setDrawRange(0, Math.max(0, this.n - 1) * LANES.length * 6);
  }
}

// ---------------------------------------------------------------------------------------------------
// Particles: snow spray and puffs (soft white) and sparkles (glowing)
// ---------------------------------------------------------------------------------------------------

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private dat: Float32Array; // size, alpha
  private vel: Float32Array;
  private life: Float32Array; // seconds left, total, gravity, base size
  private at = 0;

  constructor(private max: number, glow: boolean) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.dat = new Float32Array(max * 2);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('dat', new THREE.BufferAttribute(this.dat, 2).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 1 }, uGlow: { value: glow ? 2.2 : 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute vec2 dat; uniform float uScale; varying vec3 vC; varying float vA;
        void main() {
          vC = color; vA = dat.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = dat.x * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow; varying vec3 vC; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = ${glow ? 'pow(max(0.0, 1.0 - d), 2.0) + 0.6 * max(0.0, 1.0 - 6.0 * min(abs(gl_PointCoord.x - 0.5), abs(gl_PointCoord.y - 0.5))) * (1.0 - d)' : 'smoothstep(1.0, 0.45, d)'};
          if (a * vA < 0.01) discard;
          gl_FragColor = vec4(vC * uGlow, a * vA);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 6) {
    const i = this.at;
    this.at = (i + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life.set([life, life, gravity, size], i * 4);
    this.col.set([((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255], i * 3);
  }

  /** A round burst, for tumbles and landings. */
  burst(x: number, y: number, z: number, count: number, speed: number, size: number, color: number) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.28, s = speed * (0.4 + Math.random() * 0.8);
      this.emit(x, y, z, Math.cos(a) * s, 1.5 + Math.random() * speed, Math.sin(a) * s, 0.6 + Math.random() * 0.7, size * (0.6 + Math.random() * 0.8), color);
    }
  }

  update(dt: number, pixelsTall: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pixelsTall * 1.2;
    const { pos, vel, life, dat } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i * 4] <= 0) continue;
      const l = (life[i * 4] -= dt), k = Math.max(0, l / life[i * 4 + 1]);
      vel[i * 3 + 1] -= life[i * 4 + 2] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      dat[i * 2] = life[i * 4 + 3] * (0.5 + 0.5 * Math.min(1, (1 - k) * 5));
      dat[i * 2 + 1] = l <= 0 ? 0 : Math.min(1, k * 2.2);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('dat') as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------------
// The world: sky, sun, cliffs, far peaks, falling snow, scenery, landmarks
// ---------------------------------------------------------------------------------------------------

export interface World {
  lamps: Pt[];
  /** Per frame: moves the sun's shadow box and the snowfall with the camera, spins markers. */
  tick(t: number, focus: THREE.Vector3, cam: THREE.Vector3, pixelsTall: number): void;
  /** Landmark markers turn green when the player owns them. */
  setMarks(owned: boolean[]): void;
}

const SNOWFALL: Record<Weather, [number, number, number]> = { clear: [0, 0, 0], snow: [1400, 5, 1.5], storm: [3600, 9, 9] }; // flakes, fall, wind

export function buildWorld(scene: THREE.Scene, n: number, m: Mountain, th: ThemeDef, terrain: Terrain, high: boolean, showMarks: boolean): World {
  const c = n / 2;
  const rnd = mulberry(m.id.length * 977 + m.id.charCodeAt(0) * 31 + m.id.charCodeAt(1));
  const storm = m.weather === 'storm';
  scene.fog = new THREE.Fog(th.sky, storm ? 22 : 60, storm ? 95 : 300);
  scene.add(new THREE.HemisphereLight(new THREE.Color(th.top).lerp(new THREE.Color(0xffffff), 0.6), new THREE.Color(th.ground).multiplyScalar(0.75), th.amb * 0.85));
  const sun = new THREE.DirectionalLight(th.sun, th.sunPower * 0.8);
  const sunDir = new THREE.Vector3(-0.55, th.night ? 0.8 : th.sun === 0xffb070 || th.sun === 0xff9a6a ? 0.42 : 0.78, 0.38).normalize();
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -34;
    sc.right = sc.top = 34;
    sc.near = 1;
    sc.far = 160;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun, sun.target);

  // Sky dome: gradient, sun glow, stars and aurora at night.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(th.top) }, uLow: { value: new THREE.Color(th.sky) }, uSun: { value: sunDir }, uSunC: { value: new THREE.Color(th.sun) }, uNight: { value: th.night ? 1 : 0 }, uAurora: { value: th.aurora ? 1 : 0 }, uTime: { value: 0 }, uStorm: { value: storm ? 1 : 0 } },
      vertexShader: `varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uLow, uSun, uSunC; uniform float uNight, uAurora, uTime, uStorm; varying vec3 vD;
        ${NOISE}
        void main() {
          vec3 d = normalize(vD);
          vec3 c = mix(uLow, uTop, pow(clamp(d.y * 1.15 + 0.05, 0.0, 1.0), 0.6) * (1.0 - 0.75 * uStorm));
          float s = max(0.0, dot(d, uSun));
          c += uSunC * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12) * (1.0 - 0.85 * uStorm);
          float cl = smoothstep(0.55, 0.8, vnoise(d.xz / (abs(d.y) + 0.25) * 2.2 + uTime * 0.01)) * smoothstep(0.02, 0.3, d.y);
          c = mix(c, mix(uLow, vec3(1.0), 0.6 - 0.45 * uNight), cl * 0.55);
          if (uNight > 0.5) {
            vec2 g = floor(d.xz / (abs(d.y) + 0.4) * 90.0);
            c += vec3(1.6) * step(0.992, hash(g)) * (0.5 + 0.5 * sin(uTime * 2.0 + hash(g + 3.0) * 40.0)) * smoothstep(0.0, 0.25, d.y);
          }
          if (uAurora > 0.5) {
            float band = sin(d.x * 5.0 + sin(d.z * 3.0 + uTime * 0.3) * 1.5) * 0.5 + 0.5;
            c += mix(vec3(0.1, 1.2, 0.6), vec3(0.6, 0.3, 1.2), d.y * 1.6) * pow(band, 3.0) * smoothstep(0.08, 0.3, d.y) * smoothstep(0.75, 0.35, d.y) * 0.9;
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // Cliffs: the arena is a plateau; jagged rock falls away to a valley floor (or the sea).
  {
    const per = 44, rows = [[0, 0], [0.9, -1.2], [2.2, -4.5], [3.4, -8], [6.5, -12]];
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const rock = new THREE.Color(th.rock), snow = new THREE.Color(th.ground), tmp = new THREE.Color();
    const ring = per * 4;
    for (let k = 0; k < ring; k++) {
      const side = Math.floor(k / per), t = ((k % per) / per) * n;
      const [x, z, ox, oz] = side === 0 ? [t, 0, 0, -1] : side === 1 ? [n, t, 1, 0] : side === 2 ? [n - t, n, 0, 1] : [0, n - t, -1, 0];
      const corner = k % per === 0 ? 0.7 : 0;
      rows.forEach(([out, y], r) => {
        const j = r ? (rnd() - 0.3) * (0.6 + r * 0.7) : 0, o = out + j;
        const cx = corner ? (side === 0 ? -1 : side === 1 ? 1 : side === 2 ? 1 : -1) : ox, cz = corner ? (side === 0 ? -1 : side === 1 ? -1 : side === 2 ? 1 : 1) : oz;
        pos.push(x + cx * o, r ? y + (rnd() - 0.5) * r * 0.6 : heightAt(x, z), z + cz * o);
        tmp.copy(r < 2 ? snow : rock).multiplyScalar(r < 2 ? 1 : 0.75 + rnd() * 0.4).toArray(col, col.length);
      });
    }
    const R = rows.length;
    for (let k = 0; k < ring; k++)
      for (let r = 0; r < R - 1; r++) {
        const a = k * R + r, b = ((k + 1) % ring) * R + r;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const cliff = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    cliff.receiveShadow = true;
    scene.add(cliff);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(430, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: th.outer, emissive: th.beach ? th.outer : 0, emissiveIntensity: 0.25 }));
    floor.position.set(c, -11.5, c);
    scene.add(floor);
  }

  // Far peaks with snow caps.
  {
    const parts: THREE.BufferGeometry[] = [];
    const base = new THREE.Color(th.peak), cap = new THREE.Color(th.cap), tmp = new THREE.Color();
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2 + rnd() * 0.25, d = 150 + rnd() * 120;
      const h = (th.beach ? 14 + rnd() * 16 : 50 + rnd() * 70) * (d / 200), r = h * (th.beach ? 1.4 : 0.75 + rnd() * 0.3);
      const g = new THREE.ConeGeometry(r, h, 7, 4).toNonIndexed();
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / h + 0.5;
        const jig = Math.sin(p.getX(i) * 12.9 + p.getZ(i) * 7.3) * 0.5;
        if (y < 0.98) p.setXYZ(i, p.getX(i) + jig * r * 0.12, p.getY(i) + jig * h * 0.05, p.getZ(i) + Math.cos(p.getX(i) * 5.1) * r * 0.1);
        tmp.copy(y > 0.52 + jig * 0.12 ? cap : base).multiplyScalar(0.9 + 0.2 * hashF(i + k * 31)).toArray(cols, i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.rotateY(rnd() * 6);
      g.translate(c + Math.cos(a) * d, h / 2 - 12, c + Math.sin(a) * d);
      parts.push(g);
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  }

  // Scenery kits. Everything is instanced; a kit is a list of [geometry, material, local matrix].
  type Piece = [THREE.BufferGeometry, THREE.Material, THREE.Matrix4];
  const M4 = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));
  const cone = new THREE.ConeGeometry(1, 1, 7), cyl = new THREE.CylinderGeometry(1, 1, 1, 7), ball = new THREE.IcosahedronGeometry(1, 1), box = new THREE.BoxGeometry(1, 1, 1), gem = new THREE.OctahedronGeometry(1, 0), dome = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const snowM = lambert(th.beach ? 0xfff6dc : 0xffffff), leaf = lambert(th.tree), wood = lambert(0x8a5a3a), rockM = lambert(th.rock), red = lambert(0xff5a7a), warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.45).multiplyScalar(th.night ? 2.2 : 1.1) });
  const pine: Piece[] = th.beach
    ? [[cyl, wood, M4(0.2, 1.9, 0, 0.16, 3.8, 0.16, 0, -0.12)], [cone, leaf, M4(0.45, 3.9, 0, 1.7, 0.5, 1.7)], [cone, leaf, M4(0.45, 4.15, 0, 1.1, 0.5, 1.1)], [ball, lambert(0x8a5a3a), M4(0.4, 3.6, 0.2, 0.2)]]
    : [[cyl, wood, M4(0, 0.5, 0, 0.2, 1, 0.2)], [cone, leaf, M4(0, 1.6, 0, 1.25, 1.7, 1.25)], [cone, leaf, M4(0, 2.5, 0, 0.98, 1.5, 0.98)], [cone, leaf, M4(0, 3.3, 0, 0.7, 1.3, 0.7)],
       [cone, snowM, M4(0, 3.62, 0, 0.42, 0.7, 0.42)], [cone, snowM, M4(0.05, 2.72, 0.03, 0.72, 0.5, 0.72)], [cone, snowM, M4(-0.04, 1.86, 0.05, 0.98, 0.42, 0.98)]];
  const rockKit: Piece[] = [[ball, rockM, M4(0, 0.35, 0, 0.9, 0.7, 0.8)], [ball, snowM, M4(0.05, 0.66, 0, 0.7, 0.4, 0.62)], [ball, rockM, M4(0.75, 0.2, 0.3, 0.45, 0.4, 0.4)]];
  const snowman: Piece[] = th.beach
    ? [[cyl, snowM, M4(0, 0.35, 0, 0.8, 0.7, 0.8)], [cyl, snowM, M4(0, 0.95, 0, 0.5, 0.5, 0.5)], [cone, red, M4(0, 1.5, 0, 0.5, 0.6, 0.5)], [cyl, snowM, M4(0.9, 0.25, 0.4, 0.35, 0.5, 0.35)], [cone, red, M4(0.9, 0.7, 0.4, 0.35, 0.4, 0.35)]]
    : [[ball, snowM, M4(0, 0.5, 0, 0.62)], [ball, snowM, M4(0, 1.3, 0, 0.45)], [ball, snowM, M4(0, 1.95, 0, 0.32)], [cone, lambert(0xff8a2a), M4(0.38, 1.95, 0, 0.07, 0.3, 0.07, 0, -1.57)],
       [cyl, lambert(0x2a2230), M4(0, 2.3, 0, 0.24, 0.26, 0.24)], [cyl, lambert(0x2a2230), M4(0, 2.19, 0, 0.36, 0.03, 0.36)], [cyl, red, M4(0, 1.68, 0, 0.36, 0.1, 0.36)], [ball, lambert(0x2a2230), M4(0.27, 2.05, 0.12, 0.04)], [ball, lambert(0x2a2230), M4(0.27, 2.05, -0.12, 0.04)]];
  const flag = (mat: THREE.Material): Piece[] => [[cyl, lambert(0xe8ecf4), M4(0, 0.8, 0, 0.04, 1.6, 0.04)], [box, mat, M4(0.28, 1.35, 0, 0.5, 0.36, 0.03)]];
  const lamp: Piece[] = [[cyl, lambert(0x3a4660), M4(0, 1.6, 0, 0.07, 3.2, 0.07)], [ball, warm, M4(0, 3.3, 0, 0.3)]];
  const tower: Piece[] = [[cyl, lambert(0x5a6680), M4(0, 3, 0, 0.16, 6, 0.16)], [box, lambert(0x5a6680), M4(0, 5.9, 0, 0.25, 0.2, 2.6)], [ball, snowM, M4(0, 6.05, 0, 0.3, 0.2, 1.2)]];
  const ramp: Piece[] = [[box, lambert(0x4aa8ff, th.night ? 0.6 : 0.1), M4(0, 0.25, 0, 2, 0.75, 2, 0, 0.32)], [box, lambert(0xffc23a, th.night ? 1.2 : 0.25), M4(0.1, 0.56, 0, 1.5, 0.08, 0.3, 0, 0.32)], [box, lambert(0xff5a8a, th.night ? 1.2 : 0.25), M4(-0.05, 0.5, 0.7, 1.5, 0.08, 0.2, 0, 0.32)], [box, lambert(0xff5a8a, th.night ? 1.2 : 0.25), M4(-0.05, 0.5, -0.7, 1.5, 0.08, 0.2, 0, 0.32)]];
  const marksKits: Piece[][] = [
    // lodge hut, giant snowman (or sandcastle), crystal, flag tower, igloo
    [[box, lambert(0xb07848), M4(0, 0.9, 0, 2.6, 1.8, 2.2)], [box, lambert(0x8a4a3a), M4(0, 2.1, 0.62, 3, 0.18, 1.7, 0.65)], [box, lambert(0x8a4a3a), M4(0, 2.1, -0.62, 3, 0.18, 1.7, -0.65)], [box, snowM, M4(0, 2.24, 0.6, 2.9, 0.16, 1.5, 0.65)], [box, snowM, M4(0, 2.24, -0.6, 2.9, 0.16, 1.5, -0.65)],
     [box, warm, M4(1.31, 1.0, 0.5, 0.05, 0.6, 0.6)], [box, lambert(0x5a3424), M4(1.31, 0.6, -0.4, 0.05, 1.2, 0.6)], [box, lambert(0x8a4a3a), M4(-0.7, 2.7, 0, 0.4, 1, 0.4)], [box, snowM, M4(-0.7, 3.25, 0, 0.5, 0.14, 0.5)]],
    snowman.map(([g, mt, mx]): Piece => [g, mt, new THREE.Matrix4().makeScale(1.7, 1.7, 1.7).multiply(mx)]),
    [[gem, lambert(0x8fe8ff, 0.9), M4(0, 1.6, 0, 0.8, 1.6, 0.8)], [gem, lambert(0xc8a8ff, 0.9), M4(0.8, 0.8, 0.3, 0.45, 0.9, 0.45)], [gem, lambert(0xff9fd0, 0.9), M4(-0.6, 0.7, -0.4, 0.4, 0.8, 0.4)], [ball, rockM, M4(0, 0.2, 0, 1.2, 0.35, 1.2)]],
    [[cyl, lambert(0xf4f4fa), M4(0, 2, 0, 0.5, 4, 0.5)], [cyl, red, M4(0, 1.2, 0, 0.52, 0.5, 0.52)], [cyl, red, M4(0, 2.8, 0, 0.52, 0.5, 0.52)], [cone, red, M4(0, 4.5, 0, 0.75, 1, 0.75)], [ball, warm, M4(0, 3.6, 0, 0.42)]],
    [[dome, snowM, M4(0, 0, 0, 1.6, 1.4, 1.6)], [dome, lambert(0xd8e8f8), M4(1.2, 0, 0, 0.75, 0.7, 0.75)], [dome, lambert(0x2a3450), M4(1.6, 0, 0, 0.42, 0.42, 0.42)], ...flag(lambert(0x4aa8ff)).map(([g, mt, mx]): Piece => [g, mt, new THREE.Matrix4().makeTranslation(-0.6, 1.2, 0).multiply(mx)])],
  ];

  const place = (kit: Piece[], spots: [number, number, number, number][], y0: number | null = null) => {
    if (!spots.length) return;
    const groups = new Map<string, { g: THREE.BufferGeometry; mt: THREE.Material; list: THREE.Matrix4[] }>();
    for (const [x, z, s, rot] of spots) {
      const baseM = new THREE.Matrix4().compose(new THREE.Vector3(x, y0 ?? heightAt(x, z) - 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));
      for (const [g, mt, mx] of kit) {
        const key = g.uuid + mt.uuid;
        if (!groups.has(key)) groups.set(key, { g, mt, list: [] });
        groups.get(key)!.list.push(baseM.clone().multiply(mx));
      }
    }
    for (const { g, mt, list } of groups.values()) {
      const im = new THREE.InstancedMesh(g, mt, list.length);
      list.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.castShadow = im.receiveShadow = true;
      scene.add(im);
    }
  };

  // Keep scenery off landmarks and jumps. In-arena scenery never blocks: skiers glide past it.
  const taken: Pt[] = [...terrain.marks, ...terrain.jumps];
  const free = (x: number, z: number, r: number) => taken.every((p) => Math.hypot(p.x - x, p.z - z) > r);
  const spot = (r: number): [number, number, number, number] => {
    for (;;) {
      const x = 4 + rnd() * (n - 8), z = 4 + rnd() * (n - 8);
      if (free(x, z, r)) {
        taken.push({ x, z });
        return [x, z, 0.8 + rnd() * 0.5, rnd() * 6.28];
      }
    }
  };
  const k = high ? 1 : 0.6;
  const trees: [number, number, number, number][] = [];
  for (let q = 0; q < 11 * k; q++) {
    const [x, z] = spot(7);
    for (let j = 0; j < 2 + Math.floor(rnd() * 3); j++) trees.push([x + (rnd() - 0.5) * 4.5, z + (rnd() - 0.5) * 4.5, 0.75 + rnd() * 0.6, rnd() * 6.28]);
  }
  // Valley forest below the cliffs.
  const valley: [number, number, number, number][] = [];
  for (let q = 0; q < 260 * k; q++) {
    const a = rnd() * 6.28, d = n * 0.5 + 12 + rnd() * 70;
    valley.push([c + Math.cos(a) * d * 1.25, c + Math.sin(a) * d * 1.25, 1.6 + rnd() * 1.6, rnd() * 6.28]);
  }
  place(pine, trees);
  if (!th.beach) place(pine, valley, -11.5);
  place(rockKit, Array.from({ length: Math.round(14 * k) }, () => spot(3.5)));
  place(snowman, Array.from({ length: 4 }, () => spot(5)));
  place(flag(red), Array.from({ length: Math.round(8 * k) }, () => spot(3)));
  place(flag(lambert(0x4aa8ff)), Array.from({ length: Math.round(8 * k) }, () => spot(3)));
  place(ramp, terrain.jumps.map((p) => [p.x, p.z, 1, 0]));
  // A lift line crosses the mountain.
  const liftA = { x: 6 + rnd() * 10, z: 8 + rnd() * 20 }, liftB = { x: n - 8 - rnd() * 10, z: n - 10 - rnd() * 20 };
  if (!th.beach) {
    const towers: [number, number, number, number][] = [];
    const rot = -Math.atan2(liftB.z - liftA.z, liftB.x - liftA.x);
    for (let t = 0; t <= 4; t++) towers.push([liftA.x + ((liftB.x - liftA.x) * t) / 4, liftA.z + ((liftB.z - liftA.z) * t) / 4, 1, rot]);
    place(tower, towers);
    const len = Math.hypot(liftB.x - liftA.x, liftB.z - liftA.z);
    for (const off of [-1.2, 1.2]) {
      const cable = new THREE.Mesh(box, lambert(0x3a4050));
      cable.scale.set(len, 0.04, 0.04);
      cable.rotation.y = rot;
      cable.position.set((liftA.x + liftB.x) / 2 + Math.sin(rot) * off, 6.15, (liftA.z + liftB.z) / 2 + Math.cos(rot) * off);
      scene.add(cable);
    }
  }
  const lamps: Pt[] = [];
  if (th.night) {
    const spots = Array.from({ length: 8 }, () => spot(6));
    place(lamp, spots);
    spots.forEach(([x, z]) => lamps.push({ x, z }));
  }
  terrain.marks.forEach((p, i) => place(marksKits[th.beach && i === 4 ? 3 : i], [[p.x + 0.5, p.z + 0.5, 0.8, i * 1.3]]));

  // Landmark markers: a gold gem that turns green once the player owns the spot.
  const markers = terrain.marks.map((p) => {
    const mk = new THREE.Mesh(gem, new THREE.MeshBasicMaterial({ color: 0xffc83a }));
    mk.scale.set(0.45, 0.65, 0.45);
    mk.position.set(p.x + 0.5, 5.6, p.z + 0.5);
    mk.visible = showMarks;
    scene.add(mk);
    return mk;
  });

  // Falling snow, wrapped around the camera on the GPU.
  let snow: THREE.Points | null = null;
  const [flakes, fall, wind] = SNOWFALL[th.beach ? 'clear' : m.weather];
  const count = Math.round(flakes * (high ? 1 : 0.4));
  if (count) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = rnd() * 60;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    snow = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFall: { value: fall }, uWind: { value: wind }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime, uFall, uWind, uScale; uniform vec3 uCam; varying float vA;
        void main() {
          vec3 p = position;
          p.y -= uTime * uFall * (0.7 + fract(position.x * 7.3) * 0.6);
          p.x += uTime * uWind + sin(uTime * 1.3 + position.z) * 0.6;
          p.z += cos(uTime * 1.1 + position.x) * 0.6 + uTime * uWind * 0.3;
          p = mod(p - uCam + 30.0, 60.0) - 30.0 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = smoothstep(30.0, 22.0, length(p - uCam));
          gl_PointSize = (0.1 + fract(position.y * 3.7) * 0.12) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(1.0, 0.3, d) * 0.9 * vA); }`,
    }));
    snow.frustumCulled = false;
    scene.add(snow);
  }

  return {
    lamps,
    tick(t, focus, cam, pixelsTall) {
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 80);
      sky.position.copy(cam);
      (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      if (snow) {
        const u = (snow.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = t;
        u.uCam.value.copy(focus).setY(8);
        u.uScale.value = pixelsTall * 1.2;
      }
      markers.forEach((mk, i) => {
        mk.rotation.y = t * 1.5 + i;
        mk.position.y = 5.6 + Math.sin(t * 2 + i) * 0.25;
      });
    },
    setMarks(owned) {
      markers.forEach((mk, i) => (mk.material as THREE.MeshBasicMaterial).color.set(owned[i] ? 0x4be08a : 0xffc83a));
    },
  };
}

const hashF = (i: number) => {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------------------------------------------
// The lodge: a small room she fills with things bought with coins
// ---------------------------------------------------------------------------------------------------

export function buildLodge(owned: string[]): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2440);
  scene.add(new THREE.HemisphereLight(0xfff0e0, 0x4a3a50, 1.3));
  const sun = new THREE.DirectionalLight(0xffe2c0, 1.6);
  sun.position.set(4, 8, 6);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
  sun.shadow.camera.right = sun.shadow.camera.top = 7;
  scene.add(sun);
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, parent: THREE.Object3D = scene) => {
    const m = part(g, mat, x, y, z, parent);
    m.scale.set(sx, sy, sz);
    m.receiveShadow = true;
    return m;
  };
  const box = new THREE.BoxGeometry(1, 1, 1), ball = new THREE.SphereGeometry(1, 16, 12), cyl = new THREE.CylinderGeometry(1, 1, 1, 16), cone = new THREE.ConeGeometry(1, 1, 8);
  const glow = (c: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6) });
  add(box, lambert(0xb88a5a), 0, -0.1, 0, 9, 0.2, 7); // floor
  add(box, lambert(0x9a6a48), 0, 2.4, -3.5, 9, 5, 0.2); // back wall
  add(box, lambert(0x8a5a40), -4.5, 2.4, 0, 0.2, 5, 7); // side wall
  add(box, glow(0x8fc8ff), 1.6, 2.8, -3.38, 2.2, 1.5, 0.05); // window
  add(box, lambert(0xffffff), 1.6, 2.8, -3.36, 2.3, 0.08, 0.08);
  add(box, lambert(0xffffff), 1.6, 2.8, -3.36, 0.08, 1.6, 0.08);
  const item: Record<string, () => void> = {
    rug: () => { add(cyl, lambert(0xff8fb8), 0, 0.03, 0.4, 2.4, 0.04, 1.7); add(cyl, lambert(0xfff0f6), 0, 0.05, 0.4, 1.7, 0.04, 1.1); },
    fire: () => { add(box, lambert(0x7a808f), -3.2, 1.2, -3, 2.2, 2.4, 0.9); add(box, lambert(0x2a2230), -3.2, 0.7, -2.6, 1.3, 1.1, 0.3); add(cone, glow(0xff9a3a), -3.2, 0.6, -2.5, 0.35, 0.8, 0.2); add(cone, glow(0xffd24a), -3.0, 0.45, -2.45, 0.2, 0.5, 0.15); add(box, lambert(0x5a3424), -3.2, 2.5, -2.9, 2.6, 0.18, 1.1); },
    bed: () => { add(cyl, lambert(0x8a7bd8), 2.6, 0.2, 1.6, 0.9, 0.4, 0.9); add(cyl, lambert(0xfff3e6), 2.6, 0.36, 1.6, 0.7, 0.2, 0.7); add(ball, lambert(0xf2a25a), 2.6, 0.6, 1.6, 0.4, 0.28, 0.4); add(cone, lambert(0xf2a25a), 2.85, 0.85, 1.75, 0.1, 0.2, 0.1); add(cone, lambert(0xf2a25a), 2.85, 0.85, 1.45, 0.1, 0.2, 0.1); },
    lights: () => { for (let k = 0; k < 12; k++) add(ball, glow([0xff6fae, 0xffd24a, 0x4be08a, 0x4aa8ff][k % 4]), -4 + k * 0.72, 4.5 - Math.sin((k / 11) * Math.PI) * 0.5, -3.3, 0.1); },
    cocoa: () => { add(cyl, lambert(0x8a5a3a), 0.2, 0.5, 2.2, 0.7, 0.08, 0.7); add(cyl, lambert(0x6a4028), 0.2, 0.25, 2.2, 0.1, 0.5, 0.1); add(cyl, lambert(0xff6fae), 0, 0.68, 2.2, 0.13, 0.24, 0.13); add(cyl, lambert(0x4aa8ff), 0.4, 0.68, 2.3, 0.13, 0.24, 0.13); add(ball, lambert(0xffffff), 0, 0.82, 2.2, 0.1, 0.06, 0.1); },
    rack: () => { add(box, lambert(0x6a4028), -4.3, 1.4, 1.6, 0.15, 0.15, 2.2); for (let k = 0; k < 4; k++) add(box, lambert([0xff6fae, 0x3fcf9a, 0xffb02e, 0xa77bff][k]), -4.2, 1.5, 0.8 + k * 0.5, 0.06, 2.8, 0.16).rotation.x = 0.06; },
    tree: () => { add(cyl, lambert(0x8a5a3a), 3.6, 0.3, -2.5, 0.12, 0.6, 0.12); for (let k = 0; k < 3; k++) add(cone, lambert(0x2f7f5a), 3.6, 1 + k * 0.6, -2.5, 0.8 - k * 0.2, 0.9, 0.8 - k * 0.2); add(ball, glow(0xffd24a), 3.6, 2.75, -2.5, 0.12); },
    ball: () => { add(ball, lambert(0xffffff), -1.6, 0.3, 2.3, 0.3); add(ball, lambert(0x2a2230), -1.48, 0.42, 2.48, 0.12); add(ball, lambert(0x2a2230), -1.8, 0.4, 2.42, 0.1); },
    disco: () => { add(cyl, lambert(0x8a8a96), 0, 4.6, 0, 0.02, 0.8, 0.02); add(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xdde6ff, flatShading: true, emissive: 0x8fb8ff, emissiveIntensity: 0.7 }), 0, 3.9, 0, 0.42); },
    shelf: () => { add(box, lambert(0x6a4028), -0.9, 2.6, -3.3, 2, 0.1, 0.4); for (let k = 0; k < 3; k++) { add(cyl, glow(0xffd24a), -1.5 + k * 0.6, 2.8, -3.3, 0.1, 0.3, 0.1); add(ball, glow(0xffd24a), -1.5 + k * 0.6, 3.05, -3.3, 0.14); } },
    egg: () => { add(cyl, lambert(0x8a5a3a), 3.4, 0.12, 0, 0.5, 0.2, 0.5); add(ball, new THREE.MeshLambertMaterial({ color: 0x9fe8d8, emissive: 0x3fcf9a, emissiveIntensity: 0.6 }), 3.4, 0.62, 0, 0.36, 0.5, 0.36); },
    snowman: () => { add(ball, lambert(0xffffff), 1.6, 2.5, -3.9, 0.4); add(ball, lambert(0xffffff), 1.6, 3.05, -3.9, 0.28); add(cone, lambert(0xff8a2a), 1.6, 3.05, -3.6, 0.05, 0.2, 0.05).rotation.x = 1.57; },
  };
  for (const id of owned) item[id]?.();
  return scene;
}
