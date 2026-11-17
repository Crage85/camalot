// All art for Skyfield Saga, built from three.js primitives in an anime fantasy style: cel shading from one shared
// 3-step ramp and ink outlines drawn as inverted hulls. Each model merges its parts into one vertex-coloured geometry
// so a barn, tree or crop costs one draw call (two with its outline).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AnimalKind, CropKind, DecorKind, TreeKind, VehicleId } from './data';

/** Shared time uniform for everything that sways. */
export const uTime = { value: 0 };

/** The one toon ramp every material shares: three flat steps. */
export const GRAD = new THREE.DataTexture(new Uint8Array([89, 179, 255]), 3, 1, THREE.RedFormat);
GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter;
GRAD.needsUpdate = true;
export const toon = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, ...o });
/** Materials shared between farms; a farm must not dispose these when it is torn down. */
export const SHARED = new Set<THREE.Material>();
const shared = <T extends THREE.Material>(m: T) => (SHARED.add(m), m);

export const MAT = shared(toon());
export const PAINT = MAT;
/** Crystals, lamps and eyes: unlit and over-bright, so bloom picks them up on High. */
export const GLOW = shared(new THREE.MeshBasicMaterial({ vertexColors: true }));
GLOW.color.setRGB(1.6, 1.6, 1.6);

/** Wind: every instance leans with gusts that roll across the farm, out of step with its neighbours. */
const swayGLSL = (amount: number) => `
  #ifdef USE_INSTANCING
    vec2 swP = instanceMatrix[3].xz;
    float swG = 0.55 + 0.45 * sin(swP.x * 0.09 + swP.y * 0.06 - uTime * 1.4);
    float swPh = swP.x * 0.35 + swP.y * 0.27;
    float swH = position.y * position.y * ${amount.toFixed(3)} * (0.5 + swG);
    transformed.x += (sin(uTime * 1.7 + swPh) * 0.6 + swG) * swH;
    transformed.z += cos(uTime * 1.3 + swPh * 1.3) * swH * 0.6;
  #endif`;
/** Instanced plants. `shade` darkens the foot of each plant, which reads as depth between the rows. */
function swaying(amount: number, shade: boolean) {
  const m = shared(toon());
  m.customProgramCacheKey = () => 'sway' + amount + shade; // same hook source, different shader text
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <color_vertex>', '#include <color_vertex>' + (shade ? '\nvColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.55, position.y));' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + swayGLSL(amount));
  };
  return m;
}
export const CROP_MAT = swaying(0.09, true);
export const TREE_MAT = swaying(0.004, false);

// ---------- Ink outlines (inverted hull) ----------

/** Normals averaged over every vertex at the same spot, so the hull does not split open at hard edges. */
function inkNormals(g: G) {
  if (g.getAttribute('inkN')) return g;
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const sum = new Map<string, number[]>();
  const keys: string[] = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 100)},${Math.round(p.getY(i) * 100)},${Math.round(p.getZ(i) * 100)}`;
    let a = sum.get(k);
    if (!a) sum.set(k, (a = [0, 0, 0]));
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    keys.push(k);
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = sum.get(keys[i])!, l = Math.hypot(a[0], a[1], a[2]) || 1;
    out.set([a[0] / l, a[1] / l, a[2] / l], i * 3);
  }
  g.setAttribute('inkN', new THREE.BufferAttribute(out, 3));
  return g;
}
const inkMats = new Map<string, THREE.Material>();
/** Back faces pushed out along the normal, in a dark tone of the model's own colours. */
export function inkMat(thick: number, sway = 0) {
  const key = thick + '/' + sway;
  let m = inkMats.get(key);
  if (!m) {
    m = shared(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x4a3a52, side: THREE.BackSide }));
    m.customProgramCacheKey = () => 'ink' + key;
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = uTime;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 inkN;\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += inkN * ${thick.toFixed(4)};` + (sway ? swayGLSL(sway) : ''));
    };
    inkMats.set(key, m);
  }
  return m;
}
/** Outline for an instanced mesh: a second instanced mesh on the same geometry and matrices. */
export function inkInstanced(im: THREE.InstancedMesh, thick: number, sway = 0) {
  const o = new THREE.InstancedMesh(inkNormals(im.geometry), inkMat(thick, sway), im.count);
  o.instanceMatrix = im.instanceMatrix;
  o.boundingSphere = im.boundingSphere;
  o.userData.ink = true;
  return o;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

type V3 = [number, number, number];
type G = THREE.BufferGeometry;

/** One coloured, placed part. Geometry is made non-indexed so every part merges cleanly. Colours are pushed richer. */
function part(geo: G, color: number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(...scl));
  g.applyMatrix4(_m);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  _c.set(color).getHSL(_hsl);
  _c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.18), _hsl.l * (1 - 0.07 * _hsl.s));
  for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** Re-place an already coloured geometry (a copy). */
function put(geo: G, pos: V3, rotY = 0, s = 1) {
  const g = geo.clone();
  _q.setFromEuler(_e.set(0, rotY, 0));
  g.applyMatrix4(_m.compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(s, s, s)));
  return g;
}

const merge = (parts: G[]) => mergeGeometries(parts, false);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const rbox = (w: number, h: number, d: number, r = 0.12) => new RoundedBoxGeometry(w, h, d, 2, r);
const ball = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const ico = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
/** A box whose top face is a different size and slid along z: hoods, raked cabs, hulls. Base w x d, top wt x dt. */
function taper(w: number, d: number, wt: number, dt: number, h: number, slide = 0) {
  const g = box(1, 1, 1), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const up = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (up ? wt : w), p.getY(i) * h, p.getZ(i) * (up ? dt : d) + (up ? slide : 0));
  }
  g.computeVertexNormals();
  return g;
}
/** A flat outline in the x-y plane with a little thickness: sails, wing skins, fins. */
function plate(pts: [number, number][], depth = 0.05) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => sh[i ? 'lineTo' : 'moveTo'](x, y));
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
}
const H = Math.PI / 2;
const BRASS = 0xd6a23c, BRASS_D = 0x96692a, CRY = 0x6ff2ff, INKY = 0x2a2233, CREAM = 0xf4e8cc, LEATHER = 0x5e3b2c, STEEL = 0xc4ccd8, DARK = 0x35303f, GLASS = 0x8fe4ff, LAMP = 0xfff0b0;

/** `ink` is the outline thickness in the model's own units (0 = none). */
export function mesh(geo: G, mat: THREE.Material = MAT, shadow = true, ink = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  if (ink) {
    const o = new THREE.Mesh(inkNormals(geo), inkMat(ink));
    o.userData.ink = true;
    m.add(o);
  }
  return m;
}
const glow = (parts: G[]) => new THREE.Mesh(merge(parts), GLOW);

// ---------- Cat-folk ----------

export interface CatColors { fur: number; belly: number; extra: number; eye: number }
export interface CatRig { root: THREE.Group; tail: THREE.Mesh; legs: THREE.Mesh[] }

/**
 * A slim cat-folk teen about 1.8 units tall, facing +z. Standing: feet at y = 0 and legs that swing.
 * Seated (the driver): hips just above y = 0, legs forward, hands on the wheel.
 * The farmer wears goggles and a long scarf; field hands carry a pack.
 */
export function buildCat(c: CatColors, farmer = false, pack = false, seated = false): CatRig {
  const root = new THREE.Group();
  const hy = seated ? 0.1 : 0.92; // hips
  const hd = hy + 0.74; // middle of the head
  const hair = new THREE.Color(c.fur).multiplyScalar(0.62).getHex();
  const P: G[] = [
    part(cyl(0.125, 0.14, 0.16, 8), INKY, [0, hy + 0.03, 0], [0, 0, 0], [1, 1, 0.75]),
    part(cyl(0.132, 0.132, 0.05, 8), LEATHER, [0, hy + 0.13, 0], [0, 0, 0], [1, 1, 0.75]),
    part(box(0.05, 0.05, 0.02), BRASS, [0, hy + 0.13, 0.1]),
    part(cyl(0.18, 0.118, 0.42, 8), c.extra, [0, hy + 0.36, 0], [0, 0, 0], [1, 1, 0.68]),
    part(box(0.06, 0.38, 0.02), CREAM, [0, hy + 0.36, 0.1], [-0.08, 0, 0]),
    part(cyl(0.05, 0.055, 0.12, 6), c.fur, [0, hy + 0.59, 0]),
    part(cyl(0.08, 0.13, 0.08, 8), farmer ? 0xd8344a : CREAM, [0, hy + 0.57, 0], [0, 0, 0], [1, 1, 0.85]),
    // head: fur, muzzle, nose, fringe
    part(ball(0.17, 14, 12), c.fur, [0, hd, 0], [0, 0, 0], [1, 0.97, 0.95]),
    part(ball(0.075, 8, 6), c.belly, [0, hd - 0.065, 0.115], [0, 0, 0], [1.15, 0.7, 0.75]),
    part(ball(0.016, 6, 4), 0x7a4050, [0, hd - 0.04, 0.172]),
    part(cone(0.07, 0.2, 4), hair, [0, hd - 0.02, -0.15], [-2.5, 0, 0]),
  ];
  for (const k of [-1, 0, 1]) P.push(part(cone(0.055, 0.17, 4), hair, [k * 0.075, hd + 0.105, 0.125], [2.45, 0, k * 0.45]));
  for (const s of [-1, 1]) {
    P.push(
      // ears
      part(cone(0.075, 0.21, 4), c.fur, [s * 0.1, hd + 0.2, -0.01], [0, 0, -s * 0.3]), part(cone(0.04, 0.13, 4), 0xb87a78, [s * 0.1, hd + 0.19, 0.016], [0, 0, -s * 0.3]),
      // almond eyes: dark rim tilted up at the outer corner, iris, highlight, lash line
      part(ball(0.04, 8, 6), INKY, [s * 0.072, hd + 0.008, 0.14], [0, 0, s * 0.3], [1.3, 0.78, 0.4]),
      part(ball(0.026, 8, 6), c.eye, [s * 0.07, hd + 0.006, 0.153], [0, 0, 0], [1, 1, 0.4]),
      part(ball(0.011, 6, 4), 0xffffff, [s * 0.07 + 0.012, hd + 0.02, 0.164]),
      part(box(0.1, 0.014, 0.02), INKY, [s * 0.078, hd + 0.044, 0.142], [0, 0, s * 0.36]),
    );
    if (seated)
      P.push(
        part(cyl(0.04, 0.046, 0.44, 6), c.extra, [s * 0.19, hy + 0.415, 0.185], [2.08, 0, 0]), part(ball(0.045, 6, 5), INKY, [s * 0.185, hy + 0.3, 0.38]),
        part(cyl(0.06, 0.066, 0.42, 6), INKY, [s * 0.08, hy, 0.2], [H, 0, 0]), part(cyl(0.05, 0.045, 0.4, 6), INKY, [s * 0.08, hy - 0.2, 0.42]),
        part(rbox(0.11, 0.14, 0.22, 0.04), LEATHER, [s * 0.08, hy - 0.44, 0.45]),
      );
    else P.push(part(cyl(0.046, 0.04, 0.46, 6), c.extra, [s * 0.218, hy + 0.3, 0], [0, 0, s * 0.14]), part(ball(0.045, 6, 5), c.fur, [s * 0.255, hy + 0.06, 0]));
  }
  if (farmer)
    P.push(
      // goggles pushed up on the forehead, and a long scarf that trails behind
      part(cyl(0.172, 0.172, 0.04, 12), LEATHER, [0, hd + 0.08, 0], [0.16, 0, 0]),
      part(cyl(0.038, 0.038, 0.03, 8), BRASS, [-0.06, hd + 0.118, 0.14], [H - 0.35, 0, 0]), part(cyl(0.038, 0.038, 0.03, 8), BRASS, [0.06, hd + 0.118, 0.14], [H - 0.35, 0, 0]),
      part(cyl(0.026, 0.026, 0.034, 8), 0x23465a, [-0.06, hd + 0.119, 0.144], [H - 0.35, 0, 0]), part(cyl(0.026, 0.026, 0.034, 8), 0x23465a, [0.06, hd + 0.119, 0.144], [H - 0.35, 0, 0]),
      part(box(0.1, 0.5, 0.025), 0xd8344a, [0.06, hy + 0.46, -0.27], [0.75, 0, 0.12]), part(box(0.09, 0.36, 0.025), 0xb82a40, [-0.05, hy + 0.5, -0.22], [0.95, 0, -0.1]),
    );
  if (pack)
    P.push(
      part(rbox(0.25, 0.3, 0.13, 0.04), LEATHER, [0, hy + 0.36, -0.17]), part(cyl(0.06, 0.06, 0.32, 8), 0xe8c050, [0, hy + 0.55, -0.17], [0, 0, H]),
      part(box(0.07, 0.07, 0.02), BRASS, [0, hy + 0.4, -0.24]),
    );
  root.add(mesh(merge(P), MAT, true, 0.02));
  const legs: THREE.Mesh[] = [];
  if (!seated) {
    const leg = merge([part(cyl(0.068, 0.048, 0.8, 6), INKY, [0, -0.4, 0]), part(rbox(0.11, 0.14, 0.24, 0.04), LEATHER, [0, -0.85, 0.04]), part(cyl(0.062, 0.062, 0.05, 6), BRASS, [0, -0.76, 0])]);
    for (const s of [-1, 1]) {
      const l = mesh(leg, MAT, true, 0.02);
      l.position.set(s * 0.075, hy, 0);
      root.add(l);
      legs.push(l);
    }
  }
  const tail = mesh(merge([
    part(cyl(0.035, 0.042, 0.32, 6), c.fur, [0, 0.15, 0]), part(cyl(0.032, 0.036, 0.3, 6), c.fur, [0, 0.42, -0.05], [-0.35, 0, 0]),
    part(cyl(0.03, 0.032, 0.26, 6), c.belly, [0, 0.66, -0.17], [-0.6, 0, 0]), part(ball(0.032, 6, 5), c.belly, [0, 0.77, -0.25]),
  ]), MAT, true, 0.018);
  tail.position.set(0, hy + 0.03, -0.1);
  tail.rotation.x = seated ? -1.25 : -0.95;
  root.add(tail);
  return { root, tail, legs };
}
/** The tail sways; `walk` (0..1) swings the legs. `i` keeps cats out of step. */
export function animateCat(cat: CatRig, t: number, i = 0, walk = 0) {
  cat.tail.rotation.z = Math.sin(t * 2.2 + i) * 0.4;
  cat.legs.forEach((l, k) => (l.rotation.x = Math.sin(t * 11 + i + k * Math.PI) * 0.65 * walk));
}

export const FARMER: CatColors = { fur: 0xf09a3a, belly: 0xfff1dc, extra: 0x263f7a, eye: 0x3ad6c0 };
export const HELPER_COLORS: CatColors[] = [
  { fur: 0x8d8f99, belly: 0xf4f4f4, extra: 0x2a7a8a, eye: 0xf0c040 },
  { fur: 0x3b3340, belly: 0xe8e0e8, extra: 0x8a2a4a, eye: 0x6fe0a0 },
  { fur: 0xf4ede2, belly: 0xffffff, extra: 0x3a6a3a, eye: 0x4a9af0 },
  { fur: 0xc9884d, belly: 0xfff1dc, extra: 0x5a3a8a, eye: 0x6fe0a0 },
  { fur: 0xe8b890, belly: 0xffffff, extra: 0x8a5a1a, eye: 0x4a9af0 },
  { fur: 0x6a5a4a, belly: 0xe8d8c0, extra: 0xa8401a, eye: 0xf0c040 },
  { fur: 0xb8b0c8, belly: 0xffffff, extra: 0x1a5a7a, eye: 0xc88af0 },
];

// ---------- Vehicles ----------

export interface Rig {
  root: THREE.Group;
  body: THREE.Group; // bounces and tilts
  wheels: THREE.Mesh[]; // spin; userData.r = radius
  reel: THREE.Mesh;
  header: THREE.Group; // scale x with cut width
  pile: THREE.Mesh;
  pileMat: THREE.MeshToonMaterial;
  pileBase: number;
  cat: CatRig;
  exhaust: THREE.Vector3 | null; // local spot for engine sparks
  flap: THREE.Object3D[]; // drake wings (userData.side), the skiff's sail (userData.sail)
  catY: number;
  lift: number; // resting height of the body above the ground
}

function wheelGeo(r: number, w: number, hub: number) {
  const P = [
    part(cyl(r, r, w, 20), 0x26222e, [0, 0, 0], [0, 0, H]),
    part(cyl(r * 0.74, r * 0.74, w + 0.04, 16), hub, [0, 0, 0], [0, 0, H]),
    part(cyl(r * 0.6, r * 0.6, w + 0.06, 16), DARK, [0, 0, 0], [0, 0, H]),
    part(cyl(r * 0.17, r * 0.17, w + 0.16, 6), CRY, [0, 0, 0], [0, 0, H]),
  ];
  for (let i = 0; i < 3; i++) P.push(part(box(w + 0.1, r * 0.09, r * 1.3), hub, [0, 0, 0], [(i / 3) * Math.PI, 0, 0]));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    P.push(part(box(w + 0.04, r * 0.12, r * 0.26), 0x1a1820, [0, Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98], [a, 0, 0]));
  }
  return merge(P);
}

export function buildVehicle(id: VehicleId): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wheels: THREE.Mesh[] = [];
  const flap: THREE.Object3D[] = [];
  const addWheels = (list: [number, number, number, number][], hub: number, parent: THREE.Object3D = root) => {
    for (const [x, z, r, w] of list) {
      const m = mesh(wheelGeo(r, w, hub), MAT, true, 0.035);
      m.position.set(x, r, z);
      m.userData.r = r;
      parent.add(m);
      wheels.push(m);
    }
  };
  const [A, B] = { tractor: [0xc8303c, CREAM], truck: [0x2a6ad0, CREAM], wagon: [0x8a5a38, 0xd8404a], harvester: [0x23966a, 0xf0c444], combine: [0xf0a41c, 0x7a2638], snowcat: [0x3a62d8, 0xeef4ff], dragon: [0x2fa088, 0x7848d8] }[id];
  let catPos: V3 = [0, 1.5, -0.45];
  let pilePos: V3 = [0, 0.85, -2.7];
  let pileScale: V3 = [0.75, 1, 0.85];
  let exhaust: V3 | null = [0.62, 2.2, 0.05];
  let headerZ = 2.15;
  let lift = 0; // the drake glides this far off the ground
  const P: G[] = [];
  const L: G[] = []; // glowing parts
  const lamp = (x: number, y: number, z: number, r = 0.11) => L.push(part(ball(r, 8, 6), LAMP, [-x, y, z]), part(ball(r, 8, 6), LAMP, [x, y, z]));
  /** A crystal in a brass collar: the engine core every machine carries. */
  const core = (x: number, y: number, z: number, r: number) => {
    L.push(part(ico(r, 0), CRY, [x, y, z], [0, 0.4, 0], [0.8, 1.5, 0.8]));
    P.push(part(cyl(r * 1.15, r * 1.3, r * 0.6, 8), BRASS, [x, y - r * 0.9, z]));
  };
  const trailer = (z: number, w: number, l: number) => {
    P.push(
      part(taper(w - 0.2, l - 0.2, w, l, 0.6), A, [0, 1.0, z]), part(box(w - 0.14, 0.04, l - 0.14), DARK, [0, 1.28, z]),
      part(box(0.08, 0.08, l + 0.06), BRASS, [-w / 2, 1.32, z]), part(box(0.08, 0.08, l + 0.06), BRASS, [w / 2, 1.32, z]),
      part(box(w + 0.06, 0.08, 0.08), BRASS, [0, 1.32, z - l / 2]), part(box(w + 0.06, 0.08, 0.08), BRASS, [0, 1.32, z + l / 2]),
      part(box(w + 0.02, 0.1, l + 0.02), B, [0, 1.08, z]), part(box(0.14, 0.1, 0.9), DARK, [0, 0.62, z + l / 2 + 0.4]),
    );
    addWheels([[-w / 2 - 0.12, z, 0.42, 0.2], [w / 2 + 0.12, z, 0.42, 0.2]], BRASS);
  };
  if (id === 'tractor') {
    P.push(
      part(rbox(1.0, 0.3, 3.0, 0.1), DARK, [0, 0.72, 0.3]),
      // long low hood that narrows to a blunt nose, cream stripe, brass grille
      part(taper(1.3, 1.9, 1.0, 1.5, 0.62, -0.12), A, [0, 1.2, 0.8]), part(taper(1.2, 0.5, 0.9, 0.2, 0.5, -0.14), A, [0, 1.14, 1.92]),
      part(box(0.24, 0.03, 1.5), B, [0, 1.52, 0.68]),
      part(box(0.86, 0.05, 0.05), BRASS, [0, 0.98, 2.16]), part(box(0.8, 0.05, 0.05), BRASS, [0, 1.12, 2.13]), part(box(0.74, 0.05, 0.05), BRASS, [0, 1.26, 2.1]),
      part(box(1.34, 0.07, 1.8), BRASS, [0, 0.9, 0.82]),
      // swept twin exhausts
      part(cyl(0.05, 0.06, 1.0, 8), BRASS, [-0.62, 1.82, 0.3], [-0.55, 0, 0]), part(cyl(0.05, 0.06, 1.0, 8), BRASS, [0.62, 1.82, 0.3], [-0.55, 0, 0]),
      // open cockpit: tub, seat, roll hoop, wheel
      part(taper(1.3, 1.5, 1.45, 1.6, 0.55), A, [0, 0.98, -0.35]), part(box(1.49, 0.07, 1.64), BRASS, [0, 1.27, -0.35]),
      part(rbox(0.8, 0.16, 0.7, 0.06), LEATHER, [0, 1.32, -0.45]), part(rbox(0.8, 0.42, 0.12, 0.05), LEATHER, [0, 1.56, -0.86], [-0.14, 0, 0]),
      part(new THREE.TorusGeometry(0.66, 0.04, 6, 14, Math.PI), BRASS, [0, 1.3, -1.08], [-0.2, 0, 0], [1, 0.75, 1]),
      part(new THREE.TorusGeometry(0.17, 0.025, 6, 12), DARK, [0, 1.84, 0.02], [-0.6, 0, 0]), part(cyl(0.025, 0.025, 0.5, 6), DARK, [0, 1.66, 0.2], [0.95, 0, 0]),
      // fenders arc over the big rear wheels
      part(new THREE.TorusGeometry(0.9, 0.07, 6, 16, Math.PI), B, [-0.98, 0.78, -0.45], [0, H, 0], [1, 1, 3.6]), part(new THREE.TorusGeometry(0.9, 0.07, 6, 16, Math.PI), B, [0.98, 0.78, -0.45], [0, H, 0], [1, 1, 3.6]),
    );
    core(0, 1.72, 0.3, 0.13);
    lamp(0.5, 1.22, 2.0);
    addWheels([[-0.98, -0.45, 0.78, 0.4], [0.98, -0.45, 0.78, 0.4], [-0.8, 1.0, 0.46, 0.26], [0.8, 1.0, 0.46, 0.26]], BRASS);
    trailer(-2.7, 1.7, 1.9);
  } else if (id === 'truck') {
    P.push(
      part(taper(1.6, 4.7, 1.72, 4.8, 0.5), A, [0, 0.9, -0.3]), part(box(1.76, 0.08, 4.5), BRASS, [0, 0.78, -0.3]),
      // wedge hood, low open cab behind a raked screen
      part(taper(1.66, 1.6, 1.4, 1.2, 0.36, -0.16), A, [0, 1.3, 1.45]), part(box(0.24, 0.03, 1.1), B, [0, 1.49, 1.3]),
      part(taper(1.7, 1.5, 1.6, 1.4, 0.5), A, [0, 1.38, -0.05]), part(box(1.3, 0.62, 0.05), GLASS, [0, 1.86, 0.62], [-0.38, 0, 0]),
      part(box(1.4, 0.06, 0.07), BRASS, [0, 2.15, 0.5]), part(box(0.06, 0.66, 0.07), BRASS, [-0.68, 1.86, 0.62], [-0.38, 0, 0]), part(box(0.06, 0.66, 0.07), BRASS, [0.68, 1.86, 0.62], [-0.38, 0, 0]),
      part(rbox(1.1, 0.7, 0.14, 0.06), LEATHER, [0, 1.75, -0.6], [-0.12, 0, 0]), part(new THREE.TorusGeometry(0.6, 0.045, 6, 14, Math.PI), BRASS, [0, 1.95, -0.74]),
      part(box(1.2, 0.22, 0.06), DARK, [0, 1.02, 2.1]), part(rbox(1.84, 0.14, 0.2, 0.06), BRASS, [0, 0.7, 2.1]),
      // cargo bed
      part(box(0.1, 0.5, 1.9), B, [-0.82, 1.4, -1.65]), part(box(0.1, 0.5, 1.9), B, [0.82, 1.4, -1.65]), part(box(1.74, 0.5, 0.1), B, [0, 1.4, -2.57]),
      part(box(0.12, 0.07, 1.96), BRASS, [-0.82, 1.67, -1.65]), part(box(0.12, 0.07, 1.96), BRASS, [0.82, 1.67, -1.65]), part(box(1.78, 0.07, 0.12), BRASS, [0, 1.67, -2.57]),
      part(cyl(0.05, 0.06, 0.9, 8), BRASS, [0.74, 2.0, -0.85], [-0.4, 0, 0]),
    );
    core(0, 1.62, 1.0, 0.12);
    lamp(0.6, 1.2, 2.06, 0.12);
    addWheels([[-0.9, -1.6, 0.55, 0.3], [0.9, -1.6, 0.55, 0.3], [-0.9, 1.25, 0.55, 0.3], [0.9, 1.25, 0.55, 0.3]], BRASS);
    catPos = [0, 1.38, -0.2];
    pilePos = [0, 1.2, -1.65];
    pileScale = [0.72, 1, 0.9];
    exhaust = [0.74, 2.45, -1.05];
    headerZ = 2.75;
  } else if (id === 'wagon') {
    // A land skiff under sail: silent, with a long prow that reaches the cutter.
    P.push(
      part(taper(1.7, 3.0, 1.95, 3.1, 0.34), A, [0, 1.0, -1.2]), part(box(0.1, 0.6, 3.0), 0xb98a5a, [-0.94, 1.42, -1.2]), part(box(0.1, 0.6, 3.0), 0xb98a5a, [0.94, 1.42, -1.2]),
      part(box(1.9, 0.6, 0.1), 0xb98a5a, [0, 1.42, -2.68]), part(box(1.9, 0.42, 0.1), 0xb98a5a, [0, 1.33, 0.28]),
      part(box(0.12, 0.07, 3.06), BRASS, [-0.94, 1.74, -1.2]), part(box(0.12, 0.07, 3.06), BRASS, [0.94, 1.74, -1.2]), part(box(1.98, 0.07, 0.12), BRASS, [0, 1.74, -2.68]),
      part(cone(0.78, 3.4, 4), A, [0, 0.98, 2.0], [H, Math.PI / 4, 0], [1.3, 1, 0.36]), part(box(0.2, 0.03, 2.4), B, [0, 1.19, 1.5]),
      part(box(0.1, 0.1, 1.0), DARK, [0, 0.72, 3.5]),
      part(rbox(1.6, 0.16, 0.6, 0.06), LEATHER, [0, 1.58, 0.3]),
      part(cyl(0.05, 0.08, 4.4, 8), 0xb98a5a, [0, 3.3, 0.95]), part(cyl(0.04, 0.04, 2.9, 6), 0xb98a5a, [0, 2.0, -0.5], [H, 0, 0]), part(ball(0.09, 8, 6), BRASS, [0, 5.52, 0.95]),
      part(plate([[0, 0], [0, 0.42], [-0.9, 0.21]], 0.03), B, [0.015, 4.95, 0.95], [0, -H, 0]),
    );
    core(0, 1.5, 2.6, 0.13);
    addWheels([[-1.08, -2.0, 0.7, 0.12], [1.08, -2.0, 0.7, 0.12], [-1.08, -0.3, 0.55, 0.12], [1.08, -0.3, 0.55, 0.12]], BRASS);
    const sail = mesh(merge([
      part(plate([[0, 0], [0, 3.3], [-2.75, 0.12]], 0.04), CREAM, [0.02, 0, 0], [0, -H, 0]),
      part(plate([[0, 1.0], [0, 1.5], [-1.9, 0.62], [-2.3, 0.3]], 0.06), B, [0.03, 0, 0], [0, -H, 0]),
    ]), MAT, true, 0.04);
    sail.position.set(0, 2.08, 0.9);
    sail.userData.sail = 1;
    body.add(sail);
    flap.push(sail);
    catPos = [0, 1.66, 0.3];
    pilePos = [0, 1.15, -1.25];
    pileScale = [0.82, 1.1, 1.3];
    exhaust = null;
    headerZ = 4.0;
  } else if (id === 'dragon') {
    // A drake that glides just off the ground: long neck, swept horns, lit eyes, a saddle and a cargo frame.
    const BONE = 0xf0e4c0, HIDE = 0x1f7868;
    P.push(
      part(ball(1, 14, 10), A, [0, 1.55, -0.4], [0, 0, 0], [0.92, 0.82, 2.3]), part(ball(0.8, 12, 8), BONE, [0, 1.24, -0.2], [0, 0, 0], [0.8, 0.6, 2.05]),
      part(cyl(0.4, 0.62, 1.4, 8), A, [0, 2.1, 1.75], [0.95, 0, 0]), part(cyl(0.3, 0.4, 1.2, 8), A, [0, 2.9, 2.5], [0.5, 0, 0]),
      // wedge head, jaw, horns, brow ridges
      part(taper(0.72, 0.9, 0.5, 0.6, 0.42, -0.1), A, [0, 3.5, 2.95]), part(taper(0.5, 0.9, 0.34, 0.6, 0.3, -0.12), A, [0, 3.44, 3.7]), part(taper(0.4, 1.3, 0.46, 1.5, 0.12), BONE, [0, 3.24, 3.35]),
      part(cone(0.09, 1.0, 5), BONE, [-0.27, 3.95, 2.3], [-1.05, 0, 0.12]), part(cone(0.09, 1.0, 5), BONE, [0.27, 3.95, 2.3], [-1.05, 0, -0.12]),
      part(cone(0.06, 0.5, 4), BONE, [-0.4, 3.6, 2.45], [-1.3, 0, 0.5]), part(cone(0.06, 0.5, 4), BONE, [0.4, 3.6, 2.45], [-1.3, 0, -0.5]),
      part(box(0.07, 0.07, 0.42), HIDE, [-0.34, 3.69, 3.12], [0.2, 0.25, 0]), part(box(0.07, 0.07, 0.42), HIDE, [0.34, 3.69, 3.12], [0.2, -0.25, 0]),
      // tail with a blade
      part(cone(0.55, 3.2, 8), A, [0, 1.45, -3.7], [-H - 0.08, 0, 0]), part(plate([[0, 0.7], [0.4, 0], [0, -0.5], [-0.4, 0]], 0.05), B, [0, 1.75, -5.3], [H, 0, 0]),
      // tucked legs and claws
      ...[[-0.78, 0.9], [0.78, 0.9], [-0.82, -1.3], [0.82, -1.3]].flatMap(([x, z]) => [part(ball(0.36, 8, 6), A, [x, 1.05, z], [0.5, 0, 0], [0.6, 0.9, 1.5]), part(cyl(0.09, 0.12, 0.6, 5), A, [x, 0.72, z + 0.45], [1.0, 0, 0]), part(cone(0.07, 0.34, 4), BONE, [x, 0.5, z + 0.82], [2.0, 0, 0]),
        part(cyl(0.035, 0.035, 2.5, 5), BRASS, [x * 0.55, 0.62, 2.55], [1.82, 0, 0])].slice(0, z > 0 ? 4 : 3)),
      // saddle, harness, cargo frame
      part(rbox(0.9, 0.2, 0.8, 0.08), LEATHER, [0, 2.32, -0.15]), part(rbox(0.9, 0.5, 0.14, 0.06), LEATHER, [0, 2.6, -0.55], [-0.15, 0, 0]),
      part(new THREE.TorusGeometry(0.62, 0.05, 6, 14), BRASS, [0, 1.95, 1.3], [0.95 - H, 0, 0]),
      part(taper(1.3, 1.2, 1.5, 1.4, 0.5), 0xb98a5a, [0, 2.25, -1.5]), part(box(1.56, 0.07, 1.46), BRASS, [0, 2.52, -1.5]),
    );
    for (let i = 0; i < 7; i++) P.push(part(plate([[0, 0.36 - i * 0.02], [0.2, 0], [-0.2, 0]], 0.04), B, [0.02, 2.3 - i * 0.02 - Math.max(0, i - 3) * 0.16, -2.2 - i * 0.45], [0, -H, 0]));
    for (let i = 0; i < 3; i++) P.push(part(plate([[0, 0.34], [0.2, 0], [-0.2, 0]], 0.04), B, [0.02, 2.75 + i * 0.5, 1.75 + i * 0.5], [0, -H, 0], [1, 1, 1]));
    L.push(part(ball(0.075, 8, 6), 0xffc23a, [-0.31, 3.58, 3.14], [0, 0.25, 0], [0.5, 0.6, 1.5]), part(ball(0.075, 8, 6), 0xffc23a, [0.31, 3.58, 3.14], [0, -0.25, 0], [0.5, 0.6, 1.5]));
    core(0, 1.5, 1.72, 0.16);
    // Wings: a skin stretched over an arm and three finger bones. Built for the right side; the left is mirrored.
    const wing = merge([
      part(plate([[0, 0.3], [1.7, 0.75], [3.7, 0.2], [3.1, -0.75], [2.2, -0.5], [1.7, -1.5], [1.0, -0.75], [0.35, -1.35], [0, -0.9]], 0.04), B, [0, 0, 0], [H, 0, 0]),
      part(cyl(0.07, 0.1, 1.9, 5), A, [0.88, 0.05, 0.55], [0, -0.26, H]), part(cyl(0.04, 0.07, 2.1, 5), A, [2.7, 0.05, 0.5], [0, 0.27, H]),
      part(cyl(0.03, 0.05, 2.3, 5), A, [1.72, 0.05, -0.38], [0, 1.57 - 0.02, H]), part(cyl(0.03, 0.05, 1.7, 5), A, [2.4, 0.05, 0.02], [0, 0.82, H]),
    ]);
    for (const s of [-1, 1]) {
      const w = mesh(wing, MAT, true, 0.045);
      w.position.set(s * 0.72, 2.15, -0.3);
      w.scale.x = s;
      w.userData.side = s;
      body.add(w);
      flap.push(w);
    }
    lift = 0.35;
    catPos = [0, 2.42, -0.15];
    pilePos = [0, 2.3, -1.5];
    pileScale = [0.65, 0.9, 0.6];
    exhaust = [0, 3.4, 4.1];
    headerZ = 3.7;
  } else {
    // Self-propelled machines: harvester, combine, crawler. A tapered hull, an open canopy cab, a grain tank.
    const big = id === 'combine' ? 1.2 : 1;
    const w = 2.1 * big;
    P.push(
      part(taper(w * 0.96, 3.5 * big, w, 3.7 * big, 0.5 * big), DARK, [0, 0.95 * big, -0.6 * big]),
      part(taper(w, 3.7 * big, w * 0.86, 3.3 * big, 1.0 * big, -0.1), A, [0, 1.7 * big, -0.6 * big]), part(box(w + 0.06, 0.1, 3.74 * big), BRASS, [0, 1.2 * big, -0.6 * big]),
      part(box(w * 0.94 + 0.02, 0.26 * big, 2.3 * big), B, [0, 1.62 * big, -0.9 * big]),
      // cab: low tub, brass posts, roof, raked screen
      part(taper(w * 0.74, 1.3 * big, w * 0.78, 1.5 * big, 0.5 * big), A, [0, 2.06 * big, 1.2 * big]), part(box(w * 0.8, 0.07, 1.54 * big), BRASS, [0, 2.32 * big, 1.2 * big]),
      ...[[-1, 0.52], [1, 0.52], [-1, 1.88], [1, 1.88]].map(([s, z]) => part(cyl(0.035, 0.035, 0.8 * big, 6), BRASS, [s * w * 0.36, 2.7 * big, z * big])),
      part(taper(w * 0.82, 1.7 * big, w * 0.6, 1.2 * big, 0.16, -0.1), B, [0, 3.15 * big, 1.2 * big]), part(box(w * 0.7, 0.72 * big, 0.04), GLASS, [0, 2.7 * big, 1.9 * big]),
      part(rbox(w * 0.5, 0.7 * big, 0.12, 0.05), LEATHER, [0, 2.3 * big, 0.62 * big]),
      // grain tank and unloading pipe
      part(box(w * 0.82, 0.5 * big, 0.1), B, [0, 2.42 * big, -2.1 * big]), part(box(0.1, 0.5 * big, 2.2 * big), B, [-w * 0.41, 2.42 * big, -1.0 * big]), part(box(0.1, 0.5 * big, 2.2 * big), B, [w * 0.41, 2.42 * big, -1.0 * big]),
      part(box(w * 0.86, 0.07, 0.12), BRASS, [0, 2.7 * big, -2.1 * big]), part(box(0.12, 0.07, 2.26 * big), BRASS, [-w * 0.41, 2.7 * big, -1.0 * big]), part(box(0.12, 0.07, 2.26 * big), BRASS, [w * 0.41, 2.7 * big, -1.0 * big]),
      part(cyl(0.13, 0.15, 2.6 * big, 8), BRASS, [w * 0.55, 2.75 * big, -0.9 * big], [H, 0, 0]), part(cyl(0.07, 0.09, 1.0, 8), BRASS, [-w * 0.34, 3.0 * big, 0.1], [-0.4, 0, 0]),
      part(taper(w * 0.5, 1.0, w * 0.46, 0.5, 0.7 * big, 0.3), DARK, [0, 0.95 * big, 1.5 * big]),
      // swept side intakes
      part(taper(0.16, 1.6 * big, 0.06, 0.9 * big, 0.5 * big, -0.3), B, [-w * 0.5, 2.0 * big, -1.5 * big]), part(taper(0.16, 1.6 * big, 0.06, 0.9 * big, 0.5 * big, -0.3), B, [w * 0.5, 2.0 * big, -1.5 * big]),
    );
    core(0, 2.55 * big, -2.35 * big, 0.2 * big);
    lamp(w * 0.32, 1.55 * big, 1.27 * big, 0.13);
    if (id === 'snowcat') {
      for (const s of [-1, 1]) P.push(part(rbox(0.6, 0.85, 4.4, 0.35), 0x26222e, [s * (w / 2 + 0.25), 0.45, -0.6]), part(taper(0.66, 3.6, 0.5, 3.0, 0.3), B, [s * (w / 2 + 0.25), 0.6, -0.6]));
      addWheels([[-w / 2 - 0.25, -2.2, 0.36, 0.64], [w / 2 + 0.25, -2.2, 0.36, 0.64], [-w / 2 - 0.25, 1.0, 0.36, 0.64], [w / 2 + 0.25, 1.0, 0.36, 0.64]], BRASS);
    } else addWheels([[-w / 2 - 0.2, 0.5 * big, 0.95 * big, 0.5], [w / 2 + 0.2, 0.5 * big, 0.95 * big, 0.5], [-w / 2 + 0.1, -1.9 * big, 0.55 * big, 0.34], [w / 2 - 0.1, -1.9 * big, 0.55 * big, 0.34]], BRASS);
    catPos = [0, 1.95 * big, 1.05 * big];
    pilePos = [0, 2.25 * big, -1.0 * big];
    pileScale = [w * 0.4, 1, 1.05 * big];
    exhaust = [-w * 0.34, 3.0 * big + 0.6, -0.1];
    headerZ = 2.9 * big;
  }
  body.add(mesh(merge(P), MAT, true, 0.05));
  body.add(glow(L));

  const cat = buildCat(FARMER, true, false, true);
  cat.root.position.set(...catPos);
  cat.root.scale.setScalar(1.12);
  body.add(cat.root);

  // Cutter at the front. Built 1 unit wide; the game scales it with the cut width.
  const header = new THREE.Group();
  header.position.set(0, 0.45, headerZ);
  const teeth: G[] = [];
  for (let i = 0; i < 9; i++) teeth.push(part(cone(0.04, 0.24, 4), STEEL, [-0.44 + i * 0.11, -0.2, 0.42], [H, 0, 0]));
  header.add(mesh(merge([
    part(box(1, 0.1, 0.8), DARK, [0, -0.22, 0]), part(box(1, 0.55, 0.08), A, [0, 0.05, -0.38]), part(box(0.05, 0.55, 0.8), BRASS, [-0.5, 0.05, 0]), part(box(0.05, 0.55, 0.8), BRASS, [0.5, 0.05, 0]),
    part(box(1, 0.06, 0.1), BRASS, [0, 0.34, -0.38]), part(box(0.2, 0.2, 0.9), DARK, [0, 0.1, -0.8]), ...teeth,
  ])));
  const reelParts = [part(cyl(0.05, 0.05, 1, 8), BRASS, [0, 0, 0], [0, 0, H])];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    reelParts.push(part(box(0.96, 0.04, 0.1), STEEL, [0, Math.cos(a) * 0.25, Math.sin(a) * 0.25], [a, 0, 0]));
    for (const x of [-0.47, 0, 0.47]) reelParts.push(part(box(0.03, 0.25, 0.03), BRASS_D, [x, Math.cos(a) * 0.125, Math.sin(a) * 0.125], [a, 0, 0]));
  }
  const reel = mesh(merge(reelParts));
  reel.position.set(0, 0.12, 0.08);
  header.add(reel);
  root.add(header);

  const pileMat = new THREE.MeshToonMaterial({ color: 0xf2c94c, gradientMap: GRAD });
  const pile = new THREE.Mesh(ico(1, 1), pileMat);
  pile.position.set(...pilePos);
  pile.scale.set(pileScale[0], 0.01, pileScale[2]);
  (id === 'tractor' ? root : body).add(pile);
  root.traverse((o) => ((o as THREE.Mesh).isMesh && !o.userData.ink && (o as THREE.Mesh).material !== GLOW ? (o.castShadow = true) : 0));
  return { root, body, wheels, reel, header, pile, pileMat, pileBase: pileScale[1], cat, exhaust: exhaust && new THREE.Vector3(...exhaust), flap, catY: catPos[1], lift };
}

// ---------- Crops (instanced; kept light because thousands are on screen) ----------

export function cropGeometry(kind: CropKind): G {
  const P: G[] = [];
  const LEAF = 0x5fae4a;
  const stem = (x: number, z: number, h: number, col = LEAF, r = 0.035) => P.push(part(cyl(r * 0.8, r, h, 4), col, [x, h / 2, z]));
  const flower = (x: number, z: number, h: number, col: number, mid: number, r = 0.2) => {
    stem(x, z, h);
    P.push(part(cyl(r, r * 0.5, 0.07, 6), col, [x, h, z], [0.5, 0, 0]), part(ico(r * 0.4, 0), mid, [x, h + 0.03, z + 0.03]));
  };
  const bush = (col: number, berry: number, n: number) => {
    P.push(part(ico(0.42, 1), col, [0, 0.42, 0], [0, 0, 0], [1, 0.95, 1]));
    for (let i = 0; i < n; i++) {
      const a = i * 2.4;
      P.push(part(ico(0.09, 0), berry, [Math.cos(a) * 0.36, 0.3 + (i % 3) * 0.2, Math.sin(a) * 0.36]));
    }
  };
  switch (kind) {
    case 'wheat':
      for (const [x, z, h] of [[0, 0, 1.1], [0.34, 0.16, 0.9], [-0.3, 0.22, 1], [0.08, -0.36, 0.85], [-0.24, -0.3, 1.05], [0.4, -0.2, 0.95], [-0.42, -0.05, 0.9], [0.1, 0.4, 1]]) {
        stem(x, z, h * 0.75, 0xd8c060, 0.03);
        P.push(part(ico(0.085, 0), 0xf2c94c, [x, h * 0.85, z], [0, 0, 0], [1, 2.6, 1]));
      }
      break;
    case 'corn':
      stem(0, 0, 1.7, LEAF, 0.08);
      P.push(part(cone(0.1, 0.95, 4), 0x7cc95a, [0.27, 0.9, 0], [0, 0, -0.9]), part(cone(0.1, 0.95, 4), 0x7cc95a, [-0.27, 1.2, 0], [0, 0, 0.9]), part(cone(0.1, 0.8, 4), 0x6fbd50, [0, 0.6, 0.25], [0.9, 0, 0]));
      P.push(part(ico(0.13, 1), 0xffe066, [0.15, 1.05, 0.08], [0, 0, -0.35], [1, 2.2, 1]), part(cone(0.12, 0.3, 5), 0xd9c27a, [0, 1.85, 0]));
      break;
    case 'sunflower':
      stem(0, 0, 1.5, LEAF, 0.05);
      P.push(part(cyl(0.38, 0.3, 0.06, 10), 0xffc21a, [0, 1.55, 0.06], [1.1, 0, 0]), part(cyl(0.2, 0.2, 0.09, 8), 0x6b4a2a, [0, 1.56, 0.09], [1.1, 0, 0]));
      P.push(part(cone(0.12, 0.5, 4), 0x6fbd50, [0.22, 0.7, 0], [0, 0, -1.1]), part(cone(0.12, 0.5, 4), 0x6fbd50, [-0.22, 0.95, 0], [0, 0, 1.1]));
      break;
    case 'carrot':
      P.push(part(cone(0.16, 0.4, 6), 0xff8a3a, [0, 0.12, 0], [Math.PI, 0, 0]));
      for (let i = 0; i < 4; i++) P.push(part(cone(0.09, 0.6, 4), i % 2 ? 0x5fbf4a : 0x4aa63a, [Math.cos(i * 1.6) * 0.1, 0.55, Math.sin(i * 1.6) * 0.1], [Math.sin(i * 1.6) * 0.5, 0, -Math.cos(i * 1.6) * 0.5]));
      break;
    case 'columbine':
      flower(0, 0, 0.85, 0x9b8cf2, 0xfff6c0, 0.22);
      flower(0.26, 0.18, 0.62, 0x6fa8ff, 0xfff6c0, 0.18);
      flower(-0.24, 0.14, 0.7, 0xf28cc8, 0xfff6c0, 0.18);
      P.push(part(cone(0.24, 0.25, 5), 0x7cc95a, [0, 0.12, 0]));
      break;
    case 'blueberry': bush(0x4a9a52, 0x5a6fe8, 7); break;
    case 'lavender':
      for (const [x, z, h] of [[0, 0, 0.95], [0.3, 0.14, 0.8], [-0.3, 0.2, 0.85], [0.06, -0.32, 0.75], [-0.2, -0.24, 0.9], [0.36, -0.2, 0.8], [-0.4, -0.04, 0.85]]) {
        stem(x, z, h * 0.6, 0x7fae7a, 0.03);
        P.push(part(cone(0.08, h * 0.5, 5), 0xb58cf0, [x, h * 0.78, z]));
      }
      break;
    case 'apple':
      stem(0, 0, 0.7, 0x8a5a3a, 0.09);
      P.push(part(ico(0.55, 1), 0x5fbf5a, [0, 1.15, 0]));
      for (let i = 0; i < 6; i++) P.push(part(ico(0.11, 0), 0xe8504a, [Math.cos(i * 2.2) * 0.48, 0.95 + (i % 3) * 0.2, Math.sin(i * 2.2) * 0.48]));
      break;
    case 'pumpkin':
      for (let i = 0; i < 3; i++) P.push(part(ball(0.34, 8, 6), i === 1 ? 0xff8a2a : 0xf2771a, [0, 0.33, 0], [0, (i / 3) * Math.PI, 0], [1.35, 0.95, 0.75]));
      P.push(part(cyl(0.05, 0.07, 0.22, 5), 0x6b8e3a, [0, 0.7, 0], [0.2, 0, 0.15]), part(cone(0.22, 0.08, 5), LEAF, [0.3, 0.06, 0.3]));
      break;
    case 'mushroom':
      P.push(part(cyl(0.12, 0.16, 0.5, 7), 0xfff1dc, [0, 0.25, 0]), part(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, H), 0xe8504a, [0, 0.45, 0], [0, 0, 0], [1, 0.8, 1]));
      for (let i = 0; i < 5; i++) P.push(part(ico(0.07, 0), 0xffffff, [Math.cos(i * 1.3) * 0.26, 0.66 - (i % 2) * 0.08, Math.sin(i * 1.3) * 0.26]));
      P.push(part(cyl(0.06, 0.08, 0.25, 6), 0xfff1dc, [0.35, 0.12, 0.2]), part(new THREE.SphereGeometry(0.18, 8, 4, 0, Math.PI * 2, 0, H), 0xf28c5a, [0.35, 0.22, 0.2]));
      break;
    case 'melon':
      P.push(part(ball(0.4, 10, 7), 0x4aa63a, [0, 0.32, 0], [0, 0.4, H], [0.8, 1.25, 0.9]));
      for (const a of [-0.6, 0, 0.6]) P.push(part(ball(0.4, 8, 5), 0x9fe07a, [0, 0.32, 0], [a, 0.4, H], [0.81, 1.26, 0.1]));
      P.push(part(cone(0.24, 0.08, 5), LEAF, [-0.4, 0.06, -0.3]));
      break;
    case 'hibiscus':
      P.push(part(ico(0.34, 1), 0x3f9e4a, [0, 0.34, 0]));
      for (const [x, y, z] of [[0, 0.72, 0], [0.3, 0.5, 0.15], [-0.28, 0.48, 0.18], [0.05, 0.5, -0.32]]) P.push(part(cyl(0.2, 0.06, 0.1, 5), 0xff5f8a, [x, y, z], [x * 2, 0, -x * 2]), part(ico(0.05, 0), 0xffe066, [x, y + 0.07, z]));
      break;
    case 'pineapple':
      P.push(part(ico(0.3, 1), 0xf5c542, [0, 0.4, 0], [0, 0, 0], [1, 1.35, 1]), part(ico(0.305, 0), 0xd99a2b, [0, 0.4, 0], [0, 0.5, 0], [1, 1.35, 1]));
      for (let i = 0; i < 5; i++) P.push(part(cone(0.07, 0.45, 4), 0x3f9e4a, [Math.cos(i * 1.26) * 0.08, 0.92, Math.sin(i * 1.26) * 0.08], [Math.sin(i * 1.26) * 0.4, 0, -Math.cos(i * 1.26) * 0.4]));
      break;
    case 'cabbage':
      P.push(part(ico(0.32, 1), 0xc8f0d0, [0, 0.3, 0], [0, 0, 0], [1, 0.85, 1]));
      for (let i = 0; i < 5; i++) P.push(part(ball(0.3, 6, 4), i % 2 ? 0x8fd0a8 : 0xa8e0c0, [Math.cos(i * 1.26) * 0.22, 0.2, Math.sin(i * 1.26) * 0.22], [0, -i * 1.26, 0.5], [0.5, 1, 1]));
      break;
    case 'frostberry': bush(0xd8ecf8, 0x3fa8ff, 8); P.push(part(ico(0.2, 0), 0xffffff, [0, 0.82, 0], [0, 0, 0], [1.4, 0.4, 1.4])); break;
    case 'icelily':
      stem(0, 0, 0.7, 0x8fd0c0, 0.04);
      for (let i = 0; i < 6; i++) P.push(part(cone(0.1, 0.5, 4), i % 2 ? 0xd8f4ff : 0xa8e0ff, [Math.cos(i * 1.05) * 0.16, 0.85, Math.sin(i * 1.05) * 0.16], [Math.sin(i * 1.05) * 0.7, 0, -Math.cos(i * 1.05) * 0.7]));
      P.push(part(ico(0.1, 0), 0xfff08a, [0, 0.8, 0]), part(cone(0.3, 0.1, 6), 0xa8e0c8, [0, 0.05, 0]));
      break;
    case 'moonbloom':
      stem(0, 0, 0.8, 0x6a8ae0, 0.04);
      P.push(part(new THREE.TorusGeometry(0.24, 0.09, 5, 10, Math.PI * 1.3), 0xe8d8ff, [0, 1.0, 0], [0, 0, 0.6]), part(ico(0.1, 0), 0xfff08a, [0.06, 1.0, 0]));
      P.push(part(cone(0.14, 0.4, 4), 0x8a9af0, [0.2, 0.3, 0], [0, 0, -1]), part(cone(0.14, 0.4, 4), 0x8a9af0, [-0.2, 0.45, 0], [0, 0, 1]));
      break;
    case 'crystal':
      P.push(part(cone(0.2, 0.9, 5), 0x6ff0e0, [0, 0.5, 0]), part(cone(0.14, 0.6, 5), 0xa8fff0, [0.22, 0.3, 0.1], [0.2, 0, -0.5]), part(cone(0.14, 0.55, 5), 0x4fd8d0, [-0.2, 0.28, -0.08], [-0.2, 0, 0.5]));
      P.push(part(cone(0.3, 0.12, 6), 0x7a5aa8, [0, 0.05, 0]));
      break;
    case 'dragonfruit':
      stem(0, 0, 0.5, 0x4aa63a, 0.07);
      P.push(part(ico(0.3, 1), 0xff4fa8, [0, 0.8, 0], [0, 0, 0], [1, 1.25, 1]));
      for (let i = 0; i < 6; i++) P.push(part(cone(0.08, 0.3, 4), 0x8fe06a, [Math.cos(i * 1.05) * 0.26, 0.75 + (i % 2) * 0.2, Math.sin(i * 1.05) * 0.26], [Math.sin(i * 1.05) * 1.1, 0, -Math.cos(i * 1.05) * 1.1]));
      break;
    case 'starflower': {
      stem(0, 0, 0.9, 0x7fd0a0, 0.04);
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.14 : 0.34;
        star[i ? 'lineTo' : 'moveTo'](Math.sin((i / 10) * Math.PI * 2) * r, Math.cos((i / 10) * Math.PI * 2) * r);
      }
      P.push(part(new THREE.ExtrudeGeometry(star, { depth: 0.1, bevelEnabled: false }), 0xfff08a, [0, 1.1, -0.05]), part(ico(0.1, 0), 0xff9fd0, [0, 1.1, 0.08]));
      P.push(part(cone(0.12, 0.4, 4), 0x8fe0c0, [0.18, 0.35, 0], [0, 0, -1]));
      break;
    }
  }
  return merge(P);
}

// ---------- Trees, rocks and other things in the way ----------

export function treeGeometry(kind: TreeKind): G {
  const P: G[] = [];
  const trunk = (h: number, r: number, col = 0x8a5a3a) => P.push(part(cyl(r * 0.7, r, h, 7), col, [0, h / 2, 0]));
  switch (kind) {
    case 'pine': case 'snowpine': {
      trunk(1.2, 0.25);
      const snow = kind === 'snowpine';
      [[1.5, 2.0, 1.9, 0x3f8f5a], [1.15, 1.7, 2.9, 0x4fa86a], [0.75, 1.4, 3.8, 0x5fbf7a]].forEach(([r, h, y, c]) => {
        P.push(part(cone(r, h, 8), c, [0, y, 0]));
        if (snow) P.push(part(cone(r * 0.72, h * 0.6, 8), 0xffffff, [0, y + h * 0.22, 0]));
      });
      break;
    }
    case 'oak': case 'autumn': {
      trunk(1.6, 0.3);
      const cs = kind === 'oak' ? [0x4fa85a, 0x5fbf6a, 0x74d07a] : [0xf28c2a, 0xe8504a, 0xffc21a];
      P.push(part(ico(1.5, 1), cs[0], [0, 2.9, 0]), part(ico(1.1, 1), cs[1], [0.9, 2.5, 0.4]), part(ico(1.0, 1), cs[2], [-0.8, 2.7, -0.4]), part(ico(0.9, 1), cs[1], [0.1, 3.8, 0.2]));
      break;
    }
    case 'birch':
      trunk(2.6, 0.18, 0xf4ede2);
      P.push(part(box(0.2, 0.08, 0.2), 0x55555f, [0.05, 1.0, 0.1]), part(box(0.2, 0.08, 0.2), 0x55555f, [-0.05, 1.8, -0.08]));
      P.push(part(ico(1.0, 1), 0x9fdc6a, [0, 3.2, 0], [0, 0, 0], [1, 1.3, 1]), part(ico(0.7, 1), 0xb8e87a, [0.4, 2.6, 0.3]));
      break;
    case 'palm':
      for (let i = 0; i < 5; i++) P.push(part(cyl(0.2 - i * 0.02, 0.24 - i * 0.02, 0.85, 7), i % 2 ? 0xb8854f : 0xa0703f, [i * 0.1, 0.4 + i * 0.78, 0], [0, 0, -0.06]));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        P.push(part(ball(0.6, 6, 4), i % 2 ? 0x4fbf5a : 0x3fa84a, [0.5 + Math.cos(a) * 0.95, 3.85, Math.sin(a) * 0.95], [0, -a, 0.4], [1.7, 0.16, 0.5]));
      }
      P.push(part(ball(0.2, 6, 4), 0x7a5a3a, [0.55, 3.75, 0.15]), part(ball(0.2, 6, 4), 0x7a5a3a, [0.4, 3.75, -0.15]));
      break;
    case 'shroom':
      P.push(part(cyl(0.35, 0.5, 2.4, 9), 0xfff1dc, [0, 1.2, 0]), part(new THREE.SphereGeometry(1.7, 14, 7, 0, Math.PI * 2, 0, H), 0xff6fa8, [0, 2.2, 0], [0, 0, 0], [1, 0.7, 1]), part(cyl(1.6, 1.6, 0.1, 14), 0xffe0ec, [0, 2.2, 0]));
      for (let i = 0; i < 7; i++) P.push(part(ball(0.22, 6, 4), 0xffffff, [Math.cos(i * 0.9) * 1.1, 2.9 - (i % 2) * 0.25, Math.sin(i * 0.9) * 1.1], [0, 0, 0], [1, 0.5, 1]));
      break;
    case 'crystaltree':
      trunk(1.4, 0.22, 0x6a4a9a);
      P.push(part(cone(0.7, 2.4, 5), 0x8ff0ff, [0, 2.6, 0]), part(cone(0.45, 1.5, 5), 0xc8a8ff, [0.6, 2.0, 0.2], [0.2, 0, -0.6]), part(cone(0.45, 1.5, 5), 0x6fd8f0, [-0.6, 2.0, -0.2], [-0.2, 0, 0.6]), part(cone(0.3, 1.0, 5), 0xffb8e8, [0, 1.9, 0.6], [0.7, 0, 0]));
      break;
  }
  return merge(P);
}

export const rockGeometry = () =>
  merge([part(ico(0.9, 1), 0x9aa2ae, [0, 0.45, 0], [0.3, 0.5, 0], [1.1, 0.75, 0.95]), part(ico(0.5, 0), 0x868e9c, [0.7, 0.25, 0.3], [0.5, 0, 0.3]), part(ico(0.35, 0), 0xaab2be, [-0.6, 0.2, -0.4])]);
export const baleGeometry = () =>
  merge([part(cyl(0.85, 0.85, 1.3, 14), 0xe8c860, [0, 0.85, 0], [0, 0, H]), part(cyl(0.87, 0.87, 0.12, 14), 0xc8a040, [-0.35, 0.85, 0], [0, 0, H]), part(cyl(0.87, 0.87, 0.12, 14), 0xc8a040, [0.35, 0.85, 0], [0, 0, H]), part(cyl(0.5, 0.5, 1.32, 10), 0xd8b450, [0, 0.85, 0], [0, 0, H])]);
/** One fence panel, 2 units long along x. */
export const fenceGeometry = (col = 0xf4ede2) =>
  merge([part(rbox(0.22, 1.2, 0.22, 0.05), col, [-1, 0.6, 0]), part(cone(0.16, 0.2, 4), col, [-1, 1.28, 0], [0, Math.PI / 4, 0]), part(box(2, 0.14, 0.08), col, [0, 0.95, 0]), part(box(2, 0.14, 0.08), col, [0, 0.5, 0])]);
/** Wooden bridge, `len` long along x and 4.4 wide, deck top at y = 0. */
export function bridgeGeometry(len: number) {
  const P: G[] = [];
  const n = Math.round(len / 0.6);
  for (let i = 0; i < n; i++) P.push(part(box(len / n - 0.06, 0.16, 4.4), i % 2 ? 0xc68a4e : 0xb97a45, [-len / 2 + (i + 0.5) * (len / n), -0.08, 0]));
  for (const z of [-2.1, 2.1]) {
    P.push(part(box(len, 0.14, 0.14), 0x8a5a3a, [0, 0.9, z]));
    for (let i = 0; i <= 4; i++) P.push(part(box(0.18, 1.0, 0.18), 0x8a5a3a, [-len / 2 + (i / 4) * len, 0.42, z]));
  }
  return merge(P);
}
/** "For sale" sign that stands at a plot she can buy. */
export const signGeometry = () =>
  merge([part(box(0.2, 2.0, 0.2), 0x8a5a3a, [0, 1, 0]), part(rbox(2.2, 1.2, 0.16, 0.06), 0xfff1dc, [0, 2.2, 0]), part(cyl(0.38, 0.38, 0.2, 14), 0xffc93c, [0, 2.2, 0], [H, 0, 0]), part(cyl(0.24, 0.24, 0.22, 12), 0xffe58a, [0, 2.2, 0], [H, 0, 0])]);

// ---------- Buildings ----------

export function barnGeometry(wall: number) {
  const W = 0xfff6ea;
  const ROOF = 0x3a3660;
  const P = [
    part(box(8, 5, 7), wall, [0, 2.5, 0]), part(box(8.3, 0.5, 7.3), 0x8a8a96, [0, 0.25, 0]),
    // gambrel roof: two slopes each side
    part(box(3.3, 0.3, 7.8), ROOF, [-3.0, 5.9, 0], [0, 0, 1.0]), part(box(3.3, 0.3, 7.8), ROOF, [3.0, 5.9, 0], [0, 0, -1.0]),
    part(box(2.9, 0.3, 7.8), ROOF, [-1.15, 7.55, 0], [0, 0, 0.42]), part(box(2.9, 0.3, 7.8), ROOF, [1.15, 7.55, 0], [0, 0, -0.42]),
    part(cyl(4.0, 4.0, 7, 5), wall, [0, 4.4, 0], [H, H / 5 + Math.PI, 0], [1, 1, 0.92]),
    part(box(3.2, 3.4, 0.1), 0x5a2f2b, [0, 1.9, -3.52]), part(box(3.5, 0.25, 0.14), W, [0, 3.65, -3.55]), part(box(0.25, 3.5, 0.14), W, [-1.65, 1.95, -3.55]), part(box(0.25, 3.5, 0.14), W, [1.65, 1.95, -3.55]),
    part(box(0.2, 4.4, 0.14), W, [0, 1.9, -3.56], [0, 0, 0.75]), part(box(0.2, 4.4, 0.14), W, [0, 1.9, -3.56], [0, 0, -0.75]),
    part(cyl(0.75, 0.75, 0.12, 14), W, [0, 5.6, -3.55], [H, 0, 0]), part(cyl(0.55, 0.55, 0.14, 6), CRY, [0, 5.6, -3.56], [H, 0, 0]), part(box(0.5, 0.2, 8.0), BRASS, [0, 8.15, 0]),
    part(box(1.2, 1.2, 0.12), W, [-2.8, 2.6, -3.55]), part(box(0.9, 0.9, 0.14), GLASSY, [-2.8, 2.6, -3.56]), part(box(1.2, 1.2, 0.12), W, [2.8, 2.6, -3.55]), part(box(0.9, 0.9, 0.14), GLASSY, [2.8, 2.6, -3.56]),
    // weather vane
    part(cyl(0.05, 0.05, 1.2, 6), 0x55555f, [0, 8.9, 0]), part(cone(0.25, 0.7, 4), BRASS, [0, 9.4, 0.2], [H, 0, 0]),
  ];
  return merge(P);
}
const GLASSY = GLASS;

/** Farm buildings. Level 1-3 adds height or parts. Windmill blades come back as a second geometry to spin. */
export function buildingGeometry(id: 'silo' | 'market' | 'greenhouse' | 'pen', lv: number): G {
  const P: G[] = [];
  if (id === 'silo') {
    const h = 5 + lv * 1.6;
    P.push(part(cyl(1.7, 1.7, h, 16), 0xc9d4e0, [0, h / 2, 0]), part(new THREE.SphereGeometry(1.72, 16, 8, 0, Math.PI * 2, 0, H), 0xe8504a, [0, h, 0]), part(ball(0.2), 0xffc93c, [0, h + 1.75, 0]));
    for (let y = 1.5; y < h; y += 1.6) P.push(part(cyl(1.73, 1.73, 0.18, 16), 0x9fb1c4, [0, y, 0]));
    P.push(part(box(0.5, h, 0.1), 0x8a8a96, [0, h / 2, -1.72]));
  } else if (id === 'market') {
    P.push(part(box(4, 1.1, 1.6), 0xc68a4e, [0, 0.55, 0]), part(box(4.2, 0.14, 1.9), 0xe8c890, [0, 1.15, 0]));
    for (const x of [-1.9, 1.9]) P.push(part(cyl(0.09, 0.09, 3, 6), 0xf4ede2, [x, 1.5, 0.7]), part(cyl(0.09, 0.09, 3, 6), 0xf4ede2, [x, 1.5, -0.7]));
    for (let i = 0; i < 6; i++) P.push(part(box(0.72, 0.14, 2.6), i % 2 ? 0xfff6ea : 0xe8504a, [-1.8 + i * 0.72, 3.05, 0], [0.18, 0, 0]));
    const goods = [0xff8a2a, 0xe8504a, 0xf2c94c, 0x5fbf4a, 0x9b8cf2, 0xff5f8a];
    for (let i = 0; i < 2 + lv * 2 && i < 8; i++) P.push(part(ico(0.26, 1), goods[i % 6], [-1.6 + (i % 4) * 1.05, 1.42, i < 4 ? -0.4 : 0.4]));
    if (lv >= 2) P.push(part(cyl(0.05, 0.05, 1.6, 6), 0xf4ede2, [2.4, 3.2, 0]), part(box(0.05, 0.5, 0.9), 0xffc93c, [2.4, 3.75, 0.45]));
  } else if (id === 'greenhouse') {
    const l = 4 + lv * 1.4;
    P.push(part(box(4.2, 0.5, l + 0.2), 0xf4ede2, [0, 0.25, 0]), part(box(4, 2, l), 0xbfeaff, [0, 1.5, 0]), part(cyl(2.3, 2.3, l, 3), 0xd8f4ff, [0, 3.1, 0], [H, Math.PI, 0], [1, 1, 0.6]));
    for (let z = -l / 2; z <= l / 2 + 0.01; z += l / (2 + lv)) P.push(part(box(4.1, 2.1, 0.12), 0xf4ede2, [0, 1.5, z]));
    P.push(part(box(1, 1.7, 0.1), 0x7cc95a, [0, 1.35, -l / 2 - 0.03]), part(ico(0.4, 1), 0x5fbf5a, [-1.2, 1.2, -l / 2 + 0.6]), part(ico(0.3, 0), 0xff5f8a, [1.2, 1.3, -l / 2 + 0.6]));
  } else {
    const r = 4 + lv * 0.8;
    const n = Math.round((r * 2 * Math.PI) / 2);
    const f = fenceGeometry(0xd79a5c);
    for (let i = 1; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      P.push(put(f, [Math.sin(a) * r, 0, Math.cos(a) * r], a + Math.PI + Math.PI / n - H + H));
    }
    P.push(part(rbox(1.8, 1.4, 1.6, 0.15), 0xe8504a, [0, 0.7, r - 1.4]), part(cyl(1.3, 1.3, 1.7, 3), 0x6a4a5a, [0, 1.75, r - 1.4], [H, Math.PI, 0], [1, 1, 0.6]), part(box(0.7, 0.9, 0.1), 0x3a3a46, [0, 0.5, r - 2.22]));
    P.push(part(box(1.6, 0.3, 0.6), 0x8a5a3a, [-1.5, 0.3, 0]), part(box(1.4, 0.1, 0.4), 0xf2c94c, [-1.5, 0.42, 0]));
    f.dispose();
  }
  return merge(P);
}
export function windmillGeometry(lv: number): [G, G, number] {
  const h = 6 + lv * 1.2;
  const tower = merge([
    part(cyl(1.0, 1.9, h, 8), 0xfff1dc, [0, h / 2, 0]), part(cone(1.35, 1.6, 8), 0xe8504a, [0, h + 0.8, 0]), part(box(0.8, 1.5, 0.1), 0x8a5a3a, [0, 0.75, -1.85]),
    part(box(0.6, 0.7, 0.1), GLASSY, [0, h * 0.55, -1.4]), part(cyl(0.2, 0.2, 1, 8), 0x55555f, [0, h - 0.3, -1.3], [H, 0, 0]),
  ]);
  const B: G[] = [part(cyl(0.3, 0.3, 0.3, 10), 0x8a5a3a, [0, 0, 0], [H, 0, 0])];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    B.push(part(box(0.14, 3.6, 0.1), 0x8a5a3a, [Math.sin(a) * 1.8, Math.cos(a) * 1.8, 0], [0, 0, -a]), part(box(0.9, 2.6, 0.05), 0xfff6ea, [Math.sin(a) * 2.2 + Math.cos(a) * 0.5, Math.cos(a) * 2.2 - Math.sin(a) * 0.5, 0], [0, 0, -a]));
  }
  return [tower, merge(B), h - 0.3];
}

// ---------- Animals (about 1 to 2 units tall, facing +z; slim and long-limbed) ----------

export function animalGeometry(kind: AnimalKind): G {
  const eyes = (y: number, z: number, x = 0.12): G[] => [-1, 1].map((s) => part(ball(0.04, 6, 4), INKY, [s * x, y, z], [0, 0, s * 0.3], [1.2, 0.7, 0.6]));
  const legs = (col: number, h = 0.3, x = 0.18, z = 0.2, r = 0.04): G[] => [[-x, -z], [x, -z], [-x, z], [x, z]].map(([a, b]) => part(cyl(r, r * 0.7, h, 6), col, [a, h / 2, b]));
  /** A feather, fin or wing: a flat outline standing in the y-z plane (shape x runs forward). */
  const fin = (pts: [number, number][], col: number, pos: V3, tilt = 0) => part(plate(pts, 0.03), col, pos, [0, -H, tilt]);
  switch (kind) {
    case 'chicken': {
      const W = 0xf4ede2;
      return merge([
        part(ball(0.3), W, [0, 0.66, 0], [0.25, 0, 0], [0.8, 0.85, 1.3]), part(cyl(0.08, 0.13, 0.44, 6), W, [0, 1.0, 0.3], [0.35, 0, 0]), part(ball(0.13), W, [0, 1.24, 0.4], [0, 0, 0], [0.9, 1, 1.1]),
        part(cone(0.05, 0.2, 4), 0xf0a02a, [0, 1.21, 0.6], [H, 0, 0]), fin([[0, 0], [0.1, 0.16], [0, 0.11], [-0.12, 0.18], [-0.16, 0]], 0xd8344a, [0.015, 1.34, 0.42]),
        fin([[0, 0], [-0.75, 0.55], [-0.9, 0.2], [-0.3, -0.06]], 0x1f7868, [0.015, 0.72, -0.3]), fin([[0, 0], [-0.6, 0.8], [-0.8, 0.5], [-0.25, 0]], 0x263f7a, [0.05, 0.74, -0.28], 0.25), fin([[0, 0], [-0.6, 0.8], [-0.8, 0.5], [-0.25, 0]], 0x263f7a, [-0.02, 0.74, -0.28], -0.25),
        ...eyes(1.27, 0.5, 0.085), part(cyl(0.025, 0.02, 0.46, 4), 0xf0a02a, [-0.1, 0.23, 0]), part(cyl(0.025, 0.02, 0.46, 4), 0xf0a02a, [0.1, 0.23, 0]),
      ]);
    }
    case 'alpaca': {
      const W = 0xf2e4c8, D = 0xcfb088;
      return merge([
        part(ball(0.4), W, [0, 1.05, -0.1], [0, 0, 0], [0.8, 0.82, 1.35]), part(cyl(0.12, 0.17, 0.95, 8), W, [0, 1.7, 0.42], [0.2, 0, 0]), part(ball(0.18), W, [0, 2.22, 0.56], [0, 0, 0], [0.85, 0.9, 1.25]),
        part(ball(0.1), D, [0, 2.16, 0.76], [0, 0, 0], [0.9, 0.8, 1]), part(cone(0.05, 0.24, 4), D, [-0.12, 2.44, 0.46], [0, 0, 0.15]), part(cone(0.05, 0.24, 4), D, [0.12, 2.44, 0.46], [0, 0, -0.15]),
        part(rbox(0.7, 0.07, 0.6, 0.03), 0xd8344a, [0, 1.38, -0.12]), part(box(0.72, 0.03, 0.14), BRASS, [0, 1.42, -0.12]),
        ...eyes(2.26, 0.72, 0.12), ...legs(D, 0.78, 0.2, 0.34, 0.06),
      ]);
    }
    case 'duck': {
      const W = 0xf4f4f0, HD = 0x1f7868;
      return merge([
        part(ball(0.32), W, [0, 0.44, 0], [0, 0, 0], [0.85, 0.75, 1.5]), part(cyl(0.08, 0.11, 0.4, 6), W, [0, 0.74, 0.34], [0.5, 0, 0]), part(cyl(0.075, 0.08, 0.32, 6), HD, [0, 1.02, 0.46], [0.1, 0, 0]),
        part(ball(0.12), HD, [0, 1.22, 0.5], [0, 0, 0], [0.9, 0.95, 1.15]), part(taper(0.12, 0.22, 0.08, 0.2, 0.05), 0xf0a02a, [0, 1.19, 0.68]), part(cyl(0.085, 0.085, 0.03, 6), 0xffffff, [0, 0.9, 0.42], [0.3, 0, 0]),
        fin([[0.2, 0.1], [-0.5, 0.36], [-0.62, 0.1], [0, -0.1]], 0x9a7a5a, [0.3, 0.5, 0], 0.12), fin([[0.2, 0.1], [-0.5, 0.36], [-0.62, 0.1], [0, -0.1]], 0x9a7a5a, [-0.27, 0.5, 0], -0.12),
        ...eyes(1.25, 0.58, 0.085), part(box(0.1, 0.03, 0.2), 0xf0a02a, [-0.12, 0.03, 0.06]), part(box(0.1, 0.03, 0.2), 0xf0a02a, [0.12, 0.03, 0.06]),
      ]);
    }
    case 'bunny': {
      const C = 0xc9a070, U = 0xf2e4c8;
      return merge([
        part(ball(0.3), C, [0, 0.62, -0.05], [-0.35, 0, 0], [0.8, 0.85, 1.35]), part(ball(0.2), C, [0, 1.02, 0.34], [0, 0, 0], [0.85, 0.95, 1.15]), part(ball(0.09), U, [0, 0.96, 0.5], [0, 0, 0], [1, 0.7, 0.8]),
        part(ball(0.08), C, [-0.08, 1.52, 0.24], [-0.15, 0, 0.1], [0.6, 4.2, 0.4]), part(ball(0.08), C, [0.08, 1.52, 0.24], [-0.15, 0, -0.1], [0.6, 4.2, 0.4]),
        part(ball(0.1), U, [0, 0.52, -0.42]), part(ball(0.2), C, [-0.2, 0.36, -0.2], [0, 0, 0], [0.6, 1.4, 1.2]), part(ball(0.2), C, [0.2, 0.36, -0.2], [0, 0, 0], [0.6, 1.4, 1.2]),
        part(box(0.1, 0.06, 0.42), C, [-0.2, 0.04, -0.02]), part(box(0.1, 0.06, 0.42), C, [0.2, 0.04, -0.02]), part(cyl(0.04, 0.03, 0.6, 5), C, [-0.1, 0.32, 0.3]), part(cyl(0.04, 0.03, 0.6, 5), C, [0.1, 0.32, 0.3]),
        ...eyes(1.06, 0.48, 0.13),
      ]);
    }
    case 'turtle': {
      const S = 0x1f7868, K = 0x8fd08a;
      return merge([
        part(new THREE.SphereGeometry(0.45, 8, 4, 0, Math.PI * 2, 0, H), S, [0, 0.22, 0], [0, 0, 0], [0.95, 0.75, 1.25]), part(cyl(0.46, 0.44, 0.08, 8), BRASS_D, [0, 0.2, 0], [0, 0, 0], [0.97, 1, 1.27]),
        part(ico(0.2, 0), 0x2fa088, [0, 0.5, 0], [0, 0, 0], [1.3, 0.5, 1.8]), part(cyl(0.09, 0.12, 0.4, 6), K, [0, 0.34, 0.66], [1.1, 0, 0]), part(ball(0.13), K, [0, 0.46, 0.86], [0, 0, 0], [0.85, 0.8, 1.3]),
        ...eyes(0.5, 0.94, 0.1), ...[[-0.5, 0.36, 0.5], [0.5, 0.36, -0.5], [-0.42, -0.4, 0.2], [0.42, -0.4, -0.2]].map(([x, z, r]) => part(ball(0.16, 6, 4), K, [x, 0.1, z], [0, r, 0], [1.9, 0.3, 0.8])),
      ]);
    }
    case 'penguin': {
      const K = 0x26303f;
      return merge([
        part(ball(0.34), K, [0, 0.72, 0], [0, 0, 0], [0.9, 1.9, 0.85]), part(ball(0.28), 0xffffff, [0, 0.66, 0.1], [0, 0, 0], [0.82, 1.9, 0.7]), part(ball(0.19), K, [0, 1.42, 0.02], [0, 0, 0], [0.95, 1, 1]),
        part(cone(0.045, 0.3, 4), 0xf0a02a, [0, 1.38, 0.28], [H + 0.15, 0, 0]), part(ball(0.1), 0xf0c444, [-0.15, 1.3, 0.06], [0, 0, 0], [0.5, 1.2, 0.9]), part(ball(0.1), 0xf0c444, [0.15, 1.3, 0.06], [0, 0, 0], [0.5, 1.2, 0.9]),
        ...eyes(1.47, 0.17, 0.1), part(ball(0.12), K, [-0.34, 0.75, 0], [0, 0, 0.22], [0.4, 3.2, 0.9]), part(ball(0.12), K, [0.34, 0.75, 0], [0, 0, -0.22], [0.4, 3.2, 0.9]),
        part(box(0.16, 0.05, 0.26), 0xf0a02a, [-0.13, 0.03, 0.1]), part(box(0.16, 0.05, 0.26), 0xf0a02a, [0.13, 0.03, 0.1]),
      ]);
    }
    case 'dragonet': {
      const A = 0x8a5ad8, U = 0xf0e4c0, WG = 0xd84a8a;
      const wing: [number, number][] = [[0, 0], [-0.2, 0.75], [-0.75, 0.6], [-0.6, 0.3], [-0.95, 0.15], [-0.5, -0.05]];
      return merge([
        part(ball(0.32), A, [0, 0.62, 0], [0, 0, 0], [0.8, 0.8, 1.5]), part(ball(0.24), U, [0, 0.52, 0.08], [0, 0, 0], [0.7, 0.7, 1.4]), part(cyl(0.1, 0.16, 0.6, 6), A, [0, 1.02, 0.46], [0.6, 0, 0]),
        part(taper(0.26, 0.34, 0.2, 0.24, 0.2, -0.04), A, [0, 1.34, 0.68]), part(taper(0.18, 0.3, 0.12, 0.2, 0.13, -0.05), A, [0, 1.31, 0.96]),
        part(cone(0.04, 0.36, 4), U, [-0.1, 1.52, 0.48], [-1.0, 0, 0.15]), part(cone(0.04, 0.36, 4), U, [0.1, 1.52, 0.48], [-1.0, 0, -0.15]),
        part(ball(0.035, 6, 4), 0xffc23a, [-0.12, 1.38, 0.76], [0, 0.2, 0], [0.5, 0.7, 1.5]), part(ball(0.035, 6, 4), 0xffc23a, [0.12, 1.38, 0.76], [0, -0.2, 0], [0.5, 0.7, 1.5]),
        fin(wing, WG, [0.2, 0.8, 0], 0.7), fin(wing, WG, [-0.17, 0.8, 0], -0.7),
        part(cone(0.16, 1.1, 6), A, [0, 0.52, -0.95], [-H - 0.15, 0, 0]), part(plate([[0, 0.22], [0.13, 0], [0, -0.16], [-0.13, 0]], 0.03), WG, [0, 0.72, -1.5], [H, 0, 0]),
        ...legs(A, 0.4, 0.17, 0.3, 0.05),
      ]);
    }
  }
}

// ---------- Decorations ----------

export function decorGeometry(kind: DecorKind): G {
  switch (kind) {
    case 'scarecrow':
      return merge([part(cyl(0.07, 0.07, 2.4, 6), 0x8a5a3a, [0, 1.2, 0]), part(box(1.8, 0.1, 0.1), 0x8a5a3a, [0, 1.7, 0]), part(rbox(0.8, 0.9, 0.4, 0.1), 0x4a8fe8, [0, 1.5, 0]), part(ball(0.32), 0xf2d27a, [0, 2.3, 0]), part(cone(0.5, 0.5, 8), 0xb97a45, [0, 2.75, 0]), part(cyl(0.6, 0.6, 0.05, 10), 0xb97a45, [0, 2.52, 0]), part(ball(0.05, 6, 4), 0x2a1d17, [-0.1, 2.35, 0.3]), part(ball(0.05, 6, 4), 0x2a1d17, [0.1, 2.35, 0.3])]);
    case 'flowers': {
      const P = [part(cyl(1.2, 1.3, 0.4, 12), 0xc68a4e, [0, 0.2, 0]), part(cyl(1.1, 1.1, 0.1, 12), 0x6b4a2a, [0, 0.42, 0])];
      [0xff5f8a, 0xffe066, 0x9b8cf2, 0xff8a2a, 0xffffff, 0x6fa8ff, 0xff5f8a].forEach((c, i) => P.push(part(ico(0.26, 0), c, [Math.cos(i * 0.9) * (i ? 0.7 : 0), 0.75, Math.sin(i * 0.9) * (i ? 0.7 : 0)]), part(cyl(0.03, 0.03, 0.3, 4), 0x5fae4a, [Math.cos(i * 0.9) * (i ? 0.7 : 0), 0.55, Math.sin(i * 0.9) * (i ? 0.7 : 0)])));
      return merge(P);
    }
    case 'fountain':
      return merge([part(cyl(1.5, 1.6, 0.5, 16), 0xc9d4e0, [0, 0.25, 0]), part(cyl(1.3, 1.3, 0.1, 16), 0x6fc3ff, [0, 0.5, 0]), part(cyl(0.2, 0.3, 1.4, 8), 0xc9d4e0, [0, 1.0, 0]), part(cyl(0.7, 0.3, 0.25, 12), 0xc9d4e0, [0, 1.7, 0]), part(cyl(0.6, 0.6, 0.06, 12), 0x6fc3ff, [0, 1.82, 0]), part(ico(0.22, 1), 0xbfeaff, [0, 2.1, 0], [0, 0, 0], [1, 1.6, 1])]);
    case 'catstatue':
      return merge([part(cyl(0.7, 0.8, 0.5, 8), 0xc9d4e0, [0, 0.25, 0]), part(ball(0.42), 0xffd84f, [0, 0.9, 0], [0, 0, 0], [1, 1.1, 1]), part(ball(0.34), 0xffd84f, [0, 1.5, 0.05]), part(cone(0.13, 0.28, 4), 0xffd84f, [-0.2, 1.85, 0]), part(cone(0.13, 0.28, 4), 0xffd84f, [0.2, 1.85, 0]), part(ball(0.1), 0xffe58a, [0.25, 1.2, 0.3], [0, 0, 0], [1, 1.8, 1])]);
    case 'lantern':
      return merge([part(cyl(0.08, 0.12, 2.6, 6), 0x3a3a46, [0, 1.3, 0]), part(box(0.7, 0.08, 0.08), 0x3a3a46, [0.3, 2.6, 0]), part(rbox(0.4, 0.5, 0.4, 0.08), 0xfff6c0, [0.6, 2.25, 0]), part(cone(0.32, 0.2, 4), 0x3a3a46, [0.6, 2.6, 0], [0, Math.PI / 4, 0])]);
    case 'flag':
      return merge([part(cyl(0.06, 0.08, 4, 6), 0xf4ede2, [0, 2, 0]), part(ball(0.12), 0xffc93c, [0, 4.05, 0]), part(plate([[0, 0.4], [1.5, 0.4], [1.1, 0], [1.5, -0.4], [0, -0.4]], 0.04), 0xd8344a, [0.06, 3.5, -0.02]), part(ico(0.2, 0), 0xfff6c0, [0.7, 3.5, 0.04], [0, 0, 0], [1, 1, 0.2])]);
    case 'bench':
      return merge([part(box(2, 0.12, 0.6), 0xc68a4e, [0, 0.55, 0]), part(box(2, 0.6, 0.1), 0xc68a4e, [0, 1.0, -0.28], [-0.15, 0, 0]), part(box(0.12, 0.55, 0.6), 0x3a3a46, [-0.85, 0.27, 0]), part(box(0.12, 0.55, 0.6), 0x3a3a46, [0.85, 0.27, 0]), part(rbox(0.7, 0.08, 0.5, 0.03), 0x2a6ad0, [0.5, 0.65, 0])]);
    case 'snowman':
      return merge([part(ball(0.7), 0xffffff, [0, 0.6, 0]), part(ball(0.5), 0xffffff, [0, 1.5, 0]), part(ball(0.36), 0xffffff, [0, 2.2, 0]), part(cone(0.07, 0.35, 5), 0xff8a2a, [0, 2.2, 0.45], [H, 0, 0]), part(ball(0.05, 6, 4), 0x2a1d17, [-0.12, 2.32, 0.32]), part(ball(0.05, 6, 4), 0x2a1d17, [0.12, 2.32, 0.32]), part(cyl(0.38, 0.38, 0.12, 10), 0xe8504a, [0, 1.92, 0]), part(cone(0.13, 0.26, 4), 0xffffff, [-0.2, 2.55, 0]), part(cone(0.13, 0.26, 4), 0xffffff, [0.2, 2.55, 0])]);
    case 'sandcastle':
      return merge([part(box(2.2, 0.9, 2.2), 0xf2d49a, [0, 0.45, 0]), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([x, z]) => [part(cyl(0.45, 0.5, 1.5, 8), 0xe8c480, [x, 0.75, z]), part(cone(0.5, 0.6, 8), 0xd8344a, [x, 1.8, z])]), part(cyl(0.5, 0.55, 1.9, 8), 0xf2d49a, [0, 0.95, 0]), part(cone(0.55, 0.7, 8), 0x6fc3ff, [0, 2.25, 0])]);
    case 'gem':
      return merge([part(cyl(0.7, 0.8, 0.4, 6), 0x8a8a96, [0, 0.2, 0]), part(cone(0.55, 1.0, 6), 0x6ff0e0, [0, 1.5, 0]), part(cone(0.55, 0.7, 6), 0x4fd8d0, [0, 0.75, 0], [Math.PI, 0, 0])]);
    case 'dragonstatue':
      return merge([part(cyl(0.9, 1.0, 0.5, 8), 0xc9d4e0, [0, 0.25, 0]), part(ball(0.6), 0x8fe0a0, [0, 1.0, 0], [0, 0, 0], [1, 1, 1.3]), part(ball(0.4), 0x8fe0a0, [0, 1.8, 0.4]), part(ball(0.22), 0x8fe0a0, [0, 1.7, 0.8]), part(cone(0.1, 0.4, 4), 0xfff1c0, [-0.2, 2.25, 0.3]), part(cone(0.1, 0.4, 4), 0xfff1c0, [0.2, 2.25, 0.3]), part(cone(0.6, 0.08, 3), 0xb58cf0, [-0.8, 1.5, -0.2], [0, 0, 0.8], [1, 1, 1.5]), part(cone(0.6, 0.08, 3), 0xb58cf0, [0.8, 1.5, -0.2], [0, 0, -0.8], [1, 1, 1.5]), part(ball(0.07, 6, 4), 0x2a1d17, [-0.18, 1.9, 0.72]), part(ball(0.07, 6, 4), 0x2a1d17, [0.18, 1.9, 0.72])]);
    case 'jack':
      return merge([part(ball(0.7, 10, 8), 0xff8a2a, [0, 0.55, 0], [0, 0, 0], [1.15, 0.85, 1.15]), part(cyl(0.08, 0.12, 0.3, 5), 0x6b8e3a, [0, 1.2, 0]), part(cone(0.14, 0.2, 3), 0xfff08a, [-0.25, 0.7, 0.68], [H, 0, 0]), part(cone(0.14, 0.2, 3), 0xfff08a, [0.25, 0.7, 0.68], [H, 0, 0]), part(box(0.6, 0.12, 0.1), 0xfff08a, [0, 0.38, 0.74])]);
  }
}

// ---------- Sky and far scenery ----------

/** One ring of jagged peaks with snow above the snow line (0..1 of peak height; above 1 = no snow). */
export function mountainRing(count: number, radius: number, height: number, rock: number, snowLine: number, seed: number) {
  const P: G[] = [];
  const rnd = (i: number) => {
    const s = Math.sin(i * 127.1 + seed) * 43758.5453;
    return s - Math.floor(s);
  };
  const cRock = new THREE.Color(rock);
  const cDark = cRock.clone().multiplyScalar(0.72);
  const cSnow = new THREE.Color(0xffffff);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd(i) * 0.2;
    const h = height * (0.55 + rnd(i + 50) * 0.75);
    const g = new THREE.ConeGeometry(h * (0.75 + rnd(i + 20) * 0.5), h, 9, 5).toNonIndexed();
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v) / h + 0.5;
      const k = Math.sin(p.getX(v) * 12.9 + p.getZ(v) * 78.2 + i) * 43758.5;
      const j = (k - Math.floor(k) - 0.5) * (y > 0.98 ? 0 : 1);
      p.setXYZ(v, p.getX(v) + j * h * 0.14 * (1 - y), p.getY(v) + j * h * 0.08, p.getZ(v) + j * h * 0.14 * (1 - y));
      _c.copy(y + j * 0.18 > snowLine ? cSnow : j > 0 ? cRock : cDark);
      col.set([_c.r, _c.g, _c.b], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    g.translate(Math.sin(a) * radius * (0.9 + rnd(i + 7) * 0.25), h / 2 - 6, Math.cos(a) * radius * (0.9 + rnd(i + 7) * 0.25));
    g.computeVertexNormals();
    P.push(g);
  }
  return merge(P);
}

/** A towering cumulus: a flat lavender base under piled white domes. */
export function cloudGeometry() {
  const P = [part(cyl(3.4, 3.7, 0.7, 14), 0xcfc4e2, [0, -0.95, 0], [0, 0, 0], [1.35, 1, 0.75])];
  for (const [x, y, z, r] of [[0, 0, 0, 2.0], [2.3, -0.3, 0.2, 1.5], [-2.3, -0.4, -0.1, 1.4], [0.9, 1.5, 0.2, 1.5], [-1.0, 1.1, 0.3, 1.3], [3.8, -0.6, 0, 1.0], [-3.7, -0.6, 0.1, 0.95], [0.4, 2.8, 0, 1.0], [2.0, 1.0, -0.2, 1.1], [-0.4, 2.0, -0.3, 1.1]])
    P.push(part(ball(r, 12, 9), 0xffffff, [x, y, z]));
  return merge(P);
}

/** The gold sell pad in front of the barn. */
export const padGeometry = (r: number) =>
  merge([part(cyl(r, r + 0.15, 0.12, 32), 0xffc93c, [0, 0.06, 0]), part(cyl(r * 0.86, r * 0.86, 0.14, 32), 0xffeaa0, [0, 0.07, 0]), part(cyl(r * 0.55, r * 0.55, 0.15, 32), 0xffd84f, [0, 0.075, 0])]);
export const coinGeometry = () =>
  merge([part(cyl(0.9, 0.9, 0.22, 24), 0xffc93c, [0, 0, 0], [H, 0, 0]), part(cyl(0.62, 0.62, 0.26, 24), 0xffe58a, [0, 0, 0], [H, 0, 0])]);

/** Flat arrow that lies on the ground and points the way. Points along +z. */
export function arrowGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 1.4);
  for (const [x, y] of [[1.1, -0.2], [0.75, -0.55], [0, 0.5], [-0.75, -0.55], [-1.1, -0.2]]) sh.lineTo(x, y);
  sh.closePath();
  return merge([part(new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }), 0xffc23a, [0, 0, 0], [H, 0, 0])]);
}
