// All art for Kitty Harvest, built from three.js primitives. Each model merges its parts into one
// vertex-coloured geometry so a barn, tree or crop costs one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AnimalKind, CropKind, DecorKind, TreeKind, VehicleId } from './data';

/** Shared time uniform for everything that sways. */
export const uTime = { value: 0 };

export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
/** Glossy paint for vehicles. */
export const PAINT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x555555 });
/** Instanced plants: the top of each one sways in the wind, out of step with its neighbours. */
function swaying(amount: number) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.customProgramCacheKey = () => 'sway' + amount; // same hook source, different shader text
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swPh = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          float swH = position.y * position.y * ${amount.toFixed(3)};
          transformed.x += sin(uTime * 1.7 + swPh) * swH;
          transformed.z += cos(uTime * 1.3 + swPh * 1.3) * swH * 0.6;
        #endif`,
      );
  };
  return m;
}
export const CROP_MAT = swaying(0.09);
export const TREE_MAT = swaying(0.004);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

type V3 = [number, number, number];
type G = THREE.BufferGeometry;

/** One coloured, placed part. Geometry is made non-indexed so every part merges cleanly. */
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
  _c.set(color);
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
const H = Math.PI / 2;

export function mesh(geo: G, mat: THREE.Material = MAT, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

// ---------- Cats ----------

export interface CatColors { fur: number; belly: number; extra: number }
export interface CatRig { root: THREE.Group; ears: THREE.Mesh[]; tail: THREE.Mesh }

function catBody(c: CatColors, hat: boolean, basket: boolean) {
  const P: G[] = [
    part(ball(0.42, 12, 10), c.fur, [0, 0.42, 0], [0, 0, 0], [1, 1.05, 0.95]),
    part(ball(0.28), c.belly, [0, 0.4, 0.22], [0, 0, 0], [1, 1.2, 0.7]),
    part(ball(0.38, 14, 12), c.fur, [0, 0.98, 0.05], [0, 0, 0], [1.08, 0.95, 1]),
    part(ball(0.16), c.belly, [0, 0.9, 0.3], [0, 0, 0], [1.3, 0.8, 0.8]),
    part(ball(0.075, 8, 6), 0x2a1d17, [-0.15, 1.03, 0.34], [0, 0, 0], [0.9, 1.15, 0.6]),
    part(ball(0.075, 8, 6), 0x2a1d17, [0.15, 1.03, 0.34], [0, 0, 0], [0.9, 1.15, 0.6]),
    part(ball(0.026, 6, 4), 0xffffff, [-0.13, 1.07, 0.39]),
    part(ball(0.026, 6, 4), 0xffffff, [0.17, 1.07, 0.39]),
    part(ball(0.04, 6, 4), 0xff8fab, [0, 0.94, 0.42]),
    part(ball(0.08, 8, 6), 0xffa8b8, [-0.26, 0.9, 0.27], [0, 0, 0], [1, 0.6, 0.5]),
    part(ball(0.08, 8, 6), 0xffa8b8, [0.26, 0.9, 0.27], [0, 0, 0], [1, 0.6, 0.5]),
    part(ball(0.12), c.belly, [-0.18, 0.08, 0.3], [0, 0, 0], [1, 0.7, 1.2]),
    part(ball(0.12), c.belly, [0.18, 0.08, 0.3], [0, 0, 0], [1, 0.7, 1.2]),
    part(ball(0.1), c.fur, [-0.36, 0.5, 0.2], [0, 0, 0], [0.8, 1.6, 0.9]),
    part(ball(0.1), c.fur, [0.36, 0.5, 0.2], [0, 0, 0], [0.8, 1.6, 0.9]),
  ];
  if (hat)
    P.push(
      part(cyl(0.64, 0.66, 0.05, 16), 0xf2d27a, [0, 1.26, 0.02]),
      part(cyl(0.28, 0.34, 0.28, 14), 0xf7dc8c, [0, 1.4, 0.02]),
      part(cyl(0.345, 0.345, 0.08, 14), 0xe0475a, [0, 1.31, 0.02]),
    );
  else P.push(part(cyl(0.3, 0.36, 0.12, 12), c.extra, [0, 0.72, 0.04]));
  if (basket) P.push(part(cyl(0.26, 0.2, 0.22, 10), 0xc68a4e, [0, 0.72, -0.4]), part(ball(0.18, 8, 6), 0xf2c94c, [0, 0.82, -0.4], [0, 0, 0], [1, 0.5, 1]));
  return merge(P);
}
/** A sitting cat about 1.3 units tall, facing +z, with ears and a tail that move on their own. */
export function buildCat(c: CatColors, hat = false, basket = false): CatRig {
  const root = new THREE.Group();
  root.add(mesh(catBody(c, hat, basket)));
  const earGeo = merge([part(cone(0.15, 0.3, 4), c.fur, [0, 0.13, 0]), part(cone(0.08, 0.17, 4), 0xffb3c6, [0, 0.11, 0.05])]);
  const ears = [-1, 1].map((s) => {
    const e = mesh(earGeo);
    e.position.set(s * 0.22, hat ? 1.3 : 1.22, 0.02);
    e.rotation.z = -s * 0.3;
    e.userData.rest = -s * 0.3;
    root.add(e);
    return e;
  });
  const tail = mesh(merge([part(cyl(0.06, 0.09, 0.7, 6), c.fur, [0, 0.35, 0]), part(ball(0.1, 6, 5), c.belly, [0, 0.72, 0])]));
  tail.position.set(0.1, 0.15, -0.36);
  tail.rotation.x = -0.7;
  root.add(tail);
  return { root, ears, tail };
}
/** Ears flick now and then and the tail sways. `i` keeps cats out of step. */
export function animateCat(cat: CatRig, t: number, i = 0) {
  const tw = Math.max(0, Math.sin(t * 1.3 + i * 2.1) - 0.93) * 14; // a short flick every few seconds
  cat.ears[0].rotation.z = cat.ears[0].userData.rest + Math.sin(t * 40) * 0.25 * tw;
  cat.ears[1].rotation.z = cat.ears[1].userData.rest - Math.sin(t * 37 + i) * 0.25 * Math.max(0, Math.sin(t * 0.9 + i) - 0.93) * 14;
  cat.tail.rotation.z = Math.sin(t * 2.2 + i) * 0.45;
}

export const FARMER: CatColors = { fur: 0xf5a54a, belly: 0xfff1dc, extra: 0xe0475a };
export const HELPER_COLORS: CatColors[] = [
  { fur: 0x8d8f99, belly: 0xf4f4f4, extra: 0x58b8f0 },
  { fur: 0x3b3340, belly: 0xf4f4f4, extra: 0xff7fb0 },
  { fur: 0xf4ede2, belly: 0xffffff, extra: 0x8bd36a },
  { fur: 0xc9884d, belly: 0xfff1dc, extra: 0xb58cf0 },
  { fur: 0xe8b890, belly: 0xffffff, extra: 0xffd84f },
  { fur: 0x6a5a4a, belly: 0xe8d8c0, extra: 0xff8a2a },
  { fur: 0xb8b0c8, belly: 0xffffff, extra: 0x6ff0e0 },
];

// ---------- Vehicles ----------

export interface Rig {
  root: THREE.Group;
  body: THREE.Group; // bounces and tilts
  wheels: THREE.Mesh[]; // spin; userData.r = radius
  reel: THREE.Mesh;
  header: THREE.Group; // scale x with cut width
  pile: THREE.Mesh;
  pileMat: THREE.MeshLambertMaterial;
  pileBase: number;
  cat: CatRig;
  exhaust: THREE.Vector3 | null; // local spot for smoke puffs
  flap: THREE.Object3D[]; // dragon wings, pulling cats
  catY: number;
}

function wheelGeo(r: number, w: number, hub: number) {
  const P = [
    part(cyl(r, r, w, 18), 0x2c2c36, [0, 0, 0], [0, 0, H]),
    part(cyl(r * 0.6, r * 0.6, w + 0.05, 14), hub, [0, 0, 0], [0, 0, H]),
    part(cyl(r * 0.2, r * 0.2, w + 0.12, 8), 0x55555f, [0, 0, 0], [0, 0, H]),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    P.push(part(box(w + 0.04, r * 0.16, r * 0.3), 0x1e1e26, [0, Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97], [a, 0, 0]));
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
      const m = mesh(wheelGeo(r, w, hub), PAINT);
      m.position.set(x, r, z);
      m.userData.r = r;
      parent.add(m);
      wheels.push(m);
    }
  };
  const C = { tractor: [0xe8504a, 0xffd84f], truck: [0x3f8fe0, 0xf4ede2], wagon: [0xb97a45, 0xe0475a], harvester: [0x4fae4a, 0xffd84f], combine: [0xffc21a, 0xe8504a], snowcat: [0x4a8fe8, 0xff8a2a], dragon: [0x7fd06a, 0xb06ae8] }[id];
  const [A, B] = C;
  const DARK = 0x3a3a46;
  const GLASS = 0x9fdcff;
  let catPos: V3 = [0, 1.5, -0.45];
  let pilePos: V3 = [0, 0.85, -2.7];
  let pileScale: V3 = [0.75, 1, 0.85];
  let exhaust: V3 | null = [0.45, 2.5, 0.75];
  let headerZ = 2.15;
  const P: G[] = [];
  const trailer = (z: number, w: number, l: number, col: number) => {
    P.push(
      part(rbox(w, 0.2, l, 0.06), 0xb97a45, [0, 0.75, z]), part(box(0.1, 0.55, l), col, [-w / 2 + 0.03, 1.08, z]), part(box(0.1, 0.55, l), col, [w / 2 - 0.03, 1.08, z]),
      part(box(w, 0.55, 0.1), col, [0, 1.08, z - l / 2 + 0.05]), part(box(w, 0.55, 0.1), col, [0, 1.08, z + l / 2 - 0.05]), part(box(0.16, 0.12, 0.9), DARK, [0, 0.6, z + l / 2 + 0.4]),
    );
    addWheels([[-w / 2 - 0.12, z, 0.4, 0.26], [w / 2 + 0.12, z, 0.4, 0.26]], 0xd8d8e0);
  };
  if (id === 'tractor') {
    P.push(
      part(rbox(1.3, 0.75, 1.5, 0.22), A, [0, 1.05, 0.75]), part(rbox(1.45, 0.6, 1.4, 0.2), A, [0, 0.85, -0.3]),
      part(box(1.0, 0.5, 0.06), DARK, [0, 1.05, 1.52]), part(box(0.08, 0.5, 0.07), 0xd8d8e0, [-0.25, 1.05, 1.53]), part(box(0.08, 0.5, 0.07), 0xd8d8e0, [0.25, 1.05, 1.53]), part(box(0.08, 0.5, 0.07), 0xd8d8e0, [0, 1.05, 1.53]),
      part(ball(0.14, 10, 8), 0xfff6c0, [-0.5, 1.2, 1.45]), part(ball(0.14, 10, 8), 0xfff6c0, [0.5, 1.2, 1.45]),
      part(cyl(0.07, 0.07, 1.0, 8), 0x8a8a96, [0.45, 1.9, 0.75]), part(cyl(0.11, 0.07, 0.16, 8), 0x55555f, [0.45, 2.42, 0.75]),
      part(rbox(1.0, 0.2, 0.8, 0.08), 0x6b4a3a, [0, 1.3, -0.45]), part(rbox(1.0, 0.75, 0.18, 0.08), 0x6b4a3a, [0, 1.7, -0.9]),
      part(rbox(0.5, 0.14, 1.5, 0.06), B, [-0.98, 1.55, -0.45]), part(rbox(0.5, 0.14, 1.5, 0.06), B, [0.98, 1.55, -0.45]),
      part(new THREE.TorusGeometry(0.62, 0.05, 6, 14, Math.PI), 0xf4ede2, [0, 2.05, -1.0]),
      part(cyl(0.2, 0.2, 0.06, 12), DARK, [0, 1.75, 0.2], [0.9, 0, 0]), part(cyl(0.03, 0.03, 0.5, 6), DARK, [0, 1.55, 0.3], [0.9, 0, 0]),
    );
    addWheels([[-0.98, -0.45, 0.78, 0.5], [0.98, -0.45, 0.78, 0.5], [-0.82, 1.0, 0.46, 0.34], [0.82, 1.0, 0.46, 0.34]], B);
    trailer(-2.7, 1.7, 1.9, 0xd79a5c);
  } else if (id === 'truck') {
    P.push(
      part(rbox(1.7, 0.6, 4.6, 0.2), A, [0, 0.9, -0.3]), part(rbox(1.6, 0.5, 1.3, 0.2), A, [0, 1.3, 1.3]), part(rbox(1.6, 0.9, 1.3, 0.25), A, [0, 1.75, 0]),
      part(box(1.4, 0.55, 0.06), GLASS, [0, 1.85, 0.66]), part(box(0.06, 0.5, 0.9), GLASS, [-0.81, 1.85, 0]), part(box(0.06, 0.5, 0.9), GLASS, [0.81, 1.85, 0]),
      part(box(1.3, 0.3, 0.06), DARK, [0, 1.2, 1.97]), part(ball(0.15, 10, 8), 0xfff6c0, [-0.6, 1.3, 1.9]), part(ball(0.15, 10, 8), 0xfff6c0, [0.6, 1.3, 1.9]),
      part(rbox(1.8, 0.16, 0.2, 0.06), B, [0, 0.7, 2.05]), part(box(0.1, 0.6, 1.9), B, [-0.8, 1.45, -1.65]), part(box(0.1, 0.6, 1.9), B, [0.8, 1.45, -1.65]), part(box(1.7, 0.6, 0.1), B, [0, 1.45, -2.55]),
      part(cyl(0.06, 0.06, 0.7, 6), 0x8a8a96, [0.7, 2.4, -0.6]),
    );
    addWheels([[-0.9, -1.6, 0.55, 0.36], [0.9, -1.6, 0.55, 0.36], [-0.9, 1.25, 0.55, 0.36], [0.9, 1.25, 0.55, 0.36]], B);
    catPos = [0, 1.25, 0];
    pilePos = [0, 1.2, -1.65];
    pileScale = [0.72, 1, 0.9];
    exhaust = [0.7, 2.8, -0.6];
    headerZ = 2.75;
  } else if (id === 'wagon') {
    P.push(
      part(rbox(1.9, 0.25, 3.0, 0.08), A, [0, 1.0, -1.2]), part(box(0.12, 0.7, 3.0), 0xd79a5c, [-0.92, 1.4, -1.2]), part(box(0.12, 0.7, 3.0), 0xd79a5c, [0.92, 1.4, -1.2]),
      part(box(1.9, 0.7, 0.12), 0xd79a5c, [0, 1.4, -2.66]), part(box(1.9, 0.5, 0.12), 0xd79a5c, [0, 1.3, 0.26]), part(rbox(1.6, 0.16, 0.6, 0.06), B, [0, 1.55, 0.3]),
      part(box(0.1, 0.1, 3.2), 0x8a5a3a, [-0.5, 0.75, 1.8]), part(box(0.1, 0.1, 3.2), 0x8a5a3a, [0.5, 0.75, 1.8]),
      part(cyl(0.04, 0.04, 1.6, 6), 0xf4ede2, [0.85, 2.3, 0.26]), part(box(0.05, 0.4, 0.6), B, [0.85, 2.9, 0.0]),
    );
    addWheels([[-1.08, -2.0, 0.7, 0.16], [1.08, -2.0, 0.7, 0.16], [-1.08, -0.3, 0.55, 0.16], [1.08, -0.3, 0.55, 0.16]], 0xffd84f);
    for (const [s, i] of [[-1, 1], [1, 2]]) {
      const puller = buildCat(HELPER_COLORS[i + 3]);
      puller.root.scale.setScalar(1.25);
      puller.root.position.set(s * 0.95, 0, 2.2);
      body.add(puller.root);
      flap.push(puller.root);
    }
    catPos = [0, 1.6, 0.3];
    pilePos = [0, 1.15, -1.25];
    pileScale = [0.82, 1.1, 1.3];
    exhaust = null;
    headerZ = 4.0;
  } else if (id === 'dragon') {
    P.push(
      part(ball(1, 14, 10), A, [0, 1.3, -0.4], [0, 0, 0], [1.1, 0.95, 2.2]), part(ball(0.8, 12, 8), 0xfff1c0, [0, 1.0, -0.2], [0, 0, 0], [0.95, 0.7, 2.0]),
      part(ball(0.55, 10, 8), A, [0, 1.9, 1.5], [0, 0, 0], [1, 1, 1.3]), part(ball(0.75, 14, 10), A, [0, 2.7, 2.1], [0, 0, 0], [1, 0.9, 1.1]), part(ball(0.45, 10, 8), A, [0, 2.5, 2.8], [0, 0, 0], [1.1, 0.7, 1]),
      part(ball(0.16, 8, 6), 0x2a1d17, [-0.45, 2.95, 2.6], [0, 0, 0], [0.7, 1.1, 0.7]), part(ball(0.16, 8, 6), 0x2a1d17, [0.45, 2.95, 2.6], [0, 0, 0], [0.7, 1.1, 0.7]),
      part(ball(0.05, 6, 4), 0xffffff, [-0.48, 3.02, 2.72]), part(ball(0.05, 6, 4), 0xffffff, [0.42, 3.02, 2.72]),
      part(ball(0.07, 6, 4), 0x2a1d17, [-0.18, 2.6, 3.22]), part(ball(0.07, 6, 4), 0x2a1d17, [0.18, 2.6, 3.22]), part(ball(0.14, 8, 6), 0xffa8b8, [-0.62, 2.6, 2.5], [0, 0, 0], [0.6, 0.6, 1]), part(ball(0.14, 8, 6), 0xffa8b8, [0.62, 2.6, 2.5], [0, 0, 0], [0.6, 0.6, 1]),
      part(cone(0.14, 0.6, 6), 0xfff1c0, [-0.35, 3.45, 1.9], [-0.4, 0, 0.2]), part(cone(0.14, 0.6, 6), 0xfff1c0, [0.35, 3.45, 1.9], [-0.4, 0, -0.2]),
      part(cone(0.6, 2.2, 8), A, [0, 1.2, -3.2], [-H - 0.15, 0, 0]), part(cone(0.3, 0.5, 4), B, [0, 1.6, -4.2], [-H, 0, 0]),
      part(rbox(1.5, 0.5, 1.4, 0.15), 0xb97a45, [0, 2.2, -1.5]), part(rbox(1.0, 0.2, 0.7, 0.08), 0x6b4a3a, [0, 2.25, -0.2]),
    );
    for (let i = 0; i < 6; i++) P.push(part(cone(0.18, 0.4, 4), B, [0, 2.2 - i * 0.04 + (i < 2 ? 0.9 - i * 0.5 : 0), 1.2 - i * 0.75 + (i < 2 ? 0.5 : 0)]));
    addWheels([[-1.0, -1.5, 0.55, 0.4], [1.0, -1.5, 0.55, 0.4], [-1.0, 0.9, 0.55, 0.4], [1.0, 0.9, 0.55, 0.4]], 0xffd84f);
    const wing = merge([part(cone(1.4, 0.12, 3), B, [0.95, 0, 0], [0, 0.3, 0], [1, 1, 1.5]), part(cyl(0.07, 0.05, 1.9, 5), A, [0.95, 0.06, 0.7], [0, 0, H])]);
    for (const s of [-1, 1]) {
      const w = mesh(wing, PAINT);
      w.position.set(s * 0.9, 2.0, -0.4);
      w.scale.x = s;
      w.userData.side = s;
      body.add(w);
      flap.push(w);
    }
    catPos = [0, 2.35, -0.2];
    pilePos = [0, 2.3, -1.5];
    pileScale = [0.65, 0.9, 0.6];
    exhaust = [0, 2.5, 3.3];
    headerZ = 3.7;
  } else {
    // Boxy self-propelled machines: harvester, combine, snowcat.
    const big = id === 'combine' ? 1.2 : 1;
    const w = 2.1 * big;
    P.push(
      part(rbox(w, 1.5 * big, 3.6 * big, 0.3), A, [0, 1.45 * big, -0.6 * big]), part(rbox(w * 0.75, 1.2 * big, 1.4 * big, 0.25), 0xf4ede2, [0, 2.3 * big, 1.2 * big]),
      part(box(w * 0.7, 0.8 * big, 0.06), GLASS, [0, 2.4 * big, 1.92 * big]), part(box(0.06, 0.7 * big, 1.0 * big), GLASS, [-w * 0.378, 2.4 * big, 1.2 * big]), part(box(0.06, 0.7 * big, 1.0 * big), GLASS, [w * 0.378, 2.4 * big, 1.2 * big]),
      part(rbox(w * 0.8, 0.14, 1.6 * big, 0.06), B, [0, 2.97 * big, 1.2 * big]), part(rbox(w + 0.1, 0.22, 3.7 * big, 0.08), B, [0, 0.95 * big, -0.6 * big]),
      part(box(w * 0.86, 0.5 * big, 0.1), B, [0, 2.4 * big, -2.1 * big]), part(box(0.1, 0.5 * big, 2.2 * big), B, [-w * 0.43, 2.4 * big, -1.0 * big]), part(box(0.1, 0.5 * big, 2.2 * big), B, [w * 0.43, 2.4 * big, -1.0 * big]),
      part(cyl(0.16, 0.16, 2.6 * big, 8), 0xd8d8e0, [w * 0.55, 2.7 * big, -0.9 * big], [H, 0, 0]), part(cyl(0.09, 0.09, 0.9, 8), 0x8a8a96, [-w * 0.3, 3.0 * big, 0.2]),
      part(ball(0.16, 10, 8), 0xfff6c0, [-w * 0.3, 1.5 * big, 1.25 * big]), part(ball(0.16, 10, 8), 0xfff6c0, [w * 0.3, 1.5 * big, 1.25 * big]), part(box(w * 0.5, 0.7 * big, 0.9), DARK, [0, 0.9 * big, 1.6 * big], [0.5, 0, 0]),
    );
    if (id === 'snowcat') {
      for (const s of [-1, 1]) P.push(part(rbox(0.6, 0.85, 4.4, 0.35), 0x2c2c36, [s * (w / 2 + 0.25), 0.45, -0.6]), part(rbox(0.66, 0.3, 3.4, 0.1), B, [s * (w / 2 + 0.25), 0.5, -0.6]));
      addWheels([[-w / 2 - 0.25, -2.2, 0.36, 0.64], [w / 2 + 0.25, -2.2, 0.36, 0.64], [-w / 2 - 0.25, 1.0, 0.36, 0.64], [w / 2 + 0.25, 1.0, 0.36, 0.64]], 0xd8d8e0);
    } else addWheels([[-w / 2 - 0.2, 0.5 * big, 0.95 * big, 0.6], [w / 2 + 0.2, 0.5 * big, 0.95 * big, 0.6], [-w / 2 + 0.1, -1.9 * big, 0.55 * big, 0.4], [w / 2 - 0.1, -1.9 * big, 0.55 * big, 0.4]], B);
    catPos = [0, 1.85 * big, 1.2 * big];
    pilePos = [0, 2.25 * big, -1.0 * big];
    pileScale = [w * 0.4, 1, 1.05 * big];
    exhaust = [-w * 0.3, 3.0 * big + 0.5, 0.2];
    headerZ = 2.9 * big;
  }
  body.add(mesh(merge(P), PAINT));

  const cat = buildCat(FARMER, true);
  cat.root.position.set(...catPos);
  cat.root.scale.setScalar(0.8);
  body.add(cat.root);

  // Cutter at the front. Built 1 unit wide; the game scales it with the cut width.
  const header = new THREE.Group();
  header.position.set(0, 0.45, headerZ);
  const teeth: G[] = [];
  for (let i = 0; i < 9; i++) teeth.push(part(cone(0.04, 0.22, 4), 0xd8d8e0, [-0.44 + i * 0.11, -0.2, 0.42], [H, 0, 0]));
  header.add(mesh(merge([
    part(box(1, 0.1, 0.8), B, [0, -0.22, 0]), part(box(1, 0.55, 0.08), B, [0, 0.05, -0.38]), part(box(0.05, 0.55, 0.8), A, [-0.5, 0.05, 0]), part(box(0.05, 0.55, 0.8), A, [0.5, 0.05, 0]),
    part(box(0.2, 0.2, 0.9), DARK, [0, 0.1, -0.8]), ...teeth,
  ]), PAINT));
  const reelParts = [part(cyl(0.05, 0.05, 1, 8), A, [0, 0, 0], [0, 0, H])];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    reelParts.push(part(box(0.96, 0.04, 0.09), 0xfff1dc, [0, Math.cos(a) * 0.25, Math.sin(a) * 0.25], [a, 0, 0]));
    for (const x of [-0.47, 0, 0.47]) reelParts.push(part(box(0.03, 0.25, 0.03), A, [x, Math.cos(a) * 0.125, Math.sin(a) * 0.125], [a, 0, 0]));
  }
  const reel = mesh(merge(reelParts), PAINT);
  reel.position.set(0, 0.12, 0.08);
  header.add(reel);
  root.add(header);

  const pileMat = new THREE.MeshLambertMaterial({ color: 0xf2c94c, flatShading: true });
  const pile = new THREE.Mesh(ico(1, 1), pileMat);
  pile.position.set(...pilePos);
  pile.scale.set(pileScale[0], 0.01, pileScale[2]);
  pile.castShadow = true;
  (id === 'tractor' ? root : body).add(pile);
  root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
  return { root, body, wheels, reel, header, pile, pileMat, pileBase: pileScale[1], cat, exhaust: exhaust && new THREE.Vector3(...exhaust), flap, catY: catPos[1] };
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
  const ROOF = 0x6a4a5a;
  const P = [
    part(box(8, 5, 7), wall, [0, 2.5, 0]), part(box(8.3, 0.5, 7.3), 0x8a8a96, [0, 0.25, 0]),
    // gambrel roof: two slopes each side
    part(box(3.3, 0.3, 7.8), ROOF, [-3.0, 5.9, 0], [0, 0, 1.0]), part(box(3.3, 0.3, 7.8), ROOF, [3.0, 5.9, 0], [0, 0, -1.0]),
    part(box(2.9, 0.3, 7.8), ROOF, [-1.15, 7.55, 0], [0, 0, 0.42]), part(box(2.9, 0.3, 7.8), ROOF, [1.15, 7.55, 0], [0, 0, -0.42]),
    part(cyl(4.0, 4.0, 7, 5), wall, [0, 4.4, 0], [H, H / 5 + Math.PI, 0], [1, 1, 0.92]),
    part(box(3.2, 3.4, 0.1), 0x5a2f2b, [0, 1.9, -3.52]), part(box(3.5, 0.25, 0.14), W, [0, 3.65, -3.55]), part(box(0.25, 3.5, 0.14), W, [-1.65, 1.95, -3.55]), part(box(0.25, 3.5, 0.14), W, [1.65, 1.95, -3.55]),
    part(box(0.2, 4.4, 0.14), W, [0, 1.9, -3.56], [0, 0, 0.75]), part(box(0.2, 4.4, 0.14), W, [0, 1.9, -3.56], [0, 0, -0.75]),
    part(cyl(0.75, 0.75, 0.12, 14), W, [0, 5.6, -3.55], [H, 0, 0]), part(cyl(0.55, 0.55, 0.14, 14), 0x3a3a46, [0, 5.6, -3.56], [H, 0, 0]),
    part(box(1.2, 1.2, 0.12), W, [-2.8, 2.6, -3.55]), part(box(0.9, 0.9, 0.14), GLASSY, [-2.8, 2.6, -3.56]), part(box(1.2, 1.2, 0.12), W, [2.8, 2.6, -3.55]), part(box(0.9, 0.9, 0.14), GLASSY, [2.8, 2.6, -3.56]),
    // weather vane
    part(cyl(0.05, 0.05, 1.2, 6), 0x55555f, [0, 8.9, 0]), part(cone(0.25, 0.7, 4), 0xffc93c, [0, 9.4, 0.2], [H, 0, 0]),
  ];
  return merge(P);
}
const GLASSY = 0x9fdcff;

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

// ---------- Animals (about 1 unit tall, facing +z) ----------

export function animalGeometry(kind: AnimalKind): G {
  const eyes = (y: number, z: number, x = 0.12): G[] => [part(ball(0.05, 6, 4), 0x2a1d17, [-x, y, z]), part(ball(0.05, 6, 4), 0x2a1d17, [x, y, z])];
  const legs = (col: number, h = 0.3, x = 0.18, z = 0.2): G[] => [[-x, -z], [x, -z], [-x, z], [x, z]].map(([a, b]) => part(cyl(0.07, 0.07, h, 6), col, [a, h / 2, b]));
  switch (kind) {
    case 'chicken':
      return merge([part(ball(0.34), 0xffffff, [0, 0.45, 0], [0, 0, 0], [1, 1, 1.15]), part(ball(0.22), 0xffffff, [0, 0.85, 0.22]), part(cone(0.07, 0.18, 4), 0xffa02a, [0, 0.83, 0.46], [H, 0, 0]), part(ball(0.09, 6, 4), 0xe8504a, [0, 1.06, 0.2], [0, 0, 0], [0.5, 1, 1.3]), part(cone(0.2, 0.4, 4), 0xfff1dc, [0, 0.6, -0.4], [-1, 0, 0]), ...eyes(0.9, 0.4, 0.1), part(cyl(0.03, 0.03, 0.2, 4), 0xffa02a, [-0.1, 0.1, 0]), part(cyl(0.03, 0.03, 0.2, 4), 0xffa02a, [0.1, 0.1, 0])]);
    case 'alpaca':
      return merge([part(ball(0.42), 0xfff1dc, [0, 0.75, -0.1], [0, 0, 0], [1, 0.95, 1.3]), part(cyl(0.16, 0.2, 0.8, 8), 0xfff1dc, [0, 1.3, 0.35], [0.25, 0, 0]), part(ball(0.24), 0xfff1dc, [0, 1.75, 0.48]), part(ball(0.13), 0xe8d0b0, [0, 1.68, 0.68]), part(ball(0.2), 0xffffff, [0, 1.95, 0.42]), part(cone(0.07, 0.2, 4), 0xe8d0b0, [-0.15, 2.0, 0.4]), part(cone(0.07, 0.2, 4), 0xe8d0b0, [0.15, 2.0, 0.4]), ...eyes(1.8, 0.68), ...legs(0xe8d0b0, 0.5, 0.2, 0.3)]);
    case 'duck':
      return merge([part(ball(0.32), 0xffe066, [0, 0.4, 0], [0, 0, 0], [1, 0.9, 1.25]), part(ball(0.22), 0xffe066, [0, 0.8, 0.22]), part(box(0.2, 0.06, 0.22), 0xff8a2a, [0, 0.76, 0.48]), part(cone(0.18, 0.3, 4), 0xffe066, [0, 0.55, -0.42], [-1.1, 0, 0]), ...eyes(0.86, 0.4, 0.1), part(box(0.12, 0.04, 0.2), 0xff8a2a, [-0.12, 0.03, 0.08]), part(box(0.12, 0.04, 0.2), 0xff8a2a, [0.12, 0.03, 0.08])]);
    case 'bunny':
      return merge([part(ball(0.34), 0xf4ede2, [0, 0.4, 0], [0, 0, 0], [1, 1, 1.15]), part(ball(0.25), 0xf4ede2, [0, 0.82, 0.2]), part(ball(0.07, 6, 4), 0xff8fab, [0, 0.8, 0.44]), part(ball(0.1), 0xf4ede2, [-0.1, 1.2, 0.15], [0, 0, 0], [0.7, 2.6, 0.5]), part(ball(0.1), 0xf4ede2, [0.1, 1.2, 0.15], [0, 0, 0], [0.7, 2.6, 0.5]), part(ball(0.13), 0xffffff, [0, 0.4, -0.38]), ...eyes(0.88, 0.4)]);
    case 'turtle':
      return merge([part(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, H), 0x4aa66a, [0, 0.2, 0], [0, 0, 0], [1, 0.9, 1.15]), part(cyl(0.47, 0.47, 0.1, 10), 0x8fd08a, [0, 0.2, 0], [0, 0, 0], [1, 1, 1.15]), part(ball(0.2), 0x8fd08a, [0, 0.32, 0.6]), ...eyes(0.4, 0.74, 0.1), ...[[-0.4, 0.3], [0.4, 0.3], [-0.4, -0.3], [0.4, -0.3]].map(([x, z]) => part(ball(0.15, 6, 4), 0x8fd08a, [x, 0.12, z], [0, 0, 0], [1.2, 0.5, 1]))]);
    case 'penguin':
      return merge([part(ball(0.36), 0x2f3a4a, [0, 0.55, 0], [0, 0, 0], [1, 1.4, 0.95]), part(ball(0.28), 0xffffff, [0, 0.5, 0.12], [0, 0, 0], [0.95, 1.4, 0.8]), part(cone(0.07, 0.2, 4), 0xffa02a, [0, 0.85, 0.36], [H, 0, 0]), ...eyes(0.95, 0.3, 0.1), part(ball(0.12), 0x2f3a4a, [-0.38, 0.55, 0], [0, 0, 0.3], [0.5, 2, 1]), part(ball(0.12), 0x2f3a4a, [0.38, 0.55, 0], [0, 0, -0.3], [0.5, 2, 1]), part(box(0.16, 0.05, 0.26), 0xffa02a, [-0.13, 0.03, 0.1]), part(box(0.16, 0.05, 0.26), 0xffa02a, [0.13, 0.03, 0.1])]);
    case 'dragonet':
      return merge([part(ball(0.36), 0xb58cf0, [0, 0.45, 0], [0, 0, 0], [1, 1, 1.2]), part(ball(0.26), 0xfff1c0, [0, 0.38, 0.12], [0, 0, 0], [0.9, 1, 1]), part(ball(0.28), 0xb58cf0, [0, 0.95, 0.25]), part(ball(0.15), 0xb58cf0, [0, 0.88, 0.5]), part(cone(0.06, 0.22, 4), 0xfff1c0, [-0.14, 1.25, 0.18]), part(cone(0.06, 0.22, 4), 0xfff1c0, [0.14, 1.25, 0.18]), ...eyes(1.0, 0.5, 0.13), part(cone(0.3, 0.06, 3), 0xff8fd0, [-0.42, 0.75, -0.1], [0, 0, 0.8], [1, 1, 1.4]), part(cone(0.3, 0.06, 3), 0xff8fd0, [0.42, 0.75, -0.1], [0, 0, -0.8], [1, 1, 1.4]), part(cone(0.16, 0.6, 5), 0xb58cf0, [0, 0.3, -0.55], [-H, 0, 0]), ...legs(0xb58cf0, 0.2)]);
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
      return merge([part(cyl(0.06, 0.08, 4, 6), 0xf4ede2, [0, 2, 0]), part(ball(0.12), 0xffc93c, [0, 4.05, 0]), part(box(1.4, 0.8, 0.05), 0xff7fb0, [0.72, 3.5, 0]), part(ico(0.2, 0), 0xfff6c0, [0.7, 3.5, 0.04], [0, 0, 0], [1, 1, 0.2])]);
    case 'bench':
      return merge([part(box(2, 0.12, 0.6), 0xc68a4e, [0, 0.55, 0]), part(box(2, 0.6, 0.1), 0xc68a4e, [0, 1.0, -0.28], [-0.15, 0, 0]), part(box(0.12, 0.55, 0.6), 0x3a3a46, [-0.85, 0.27, 0]), part(box(0.12, 0.55, 0.6), 0x3a3a46, [0.85, 0.27, 0]), part(ball(0.2), 0xff7fb0, [0.5, 0.75, 0], [0, 0, 0], [1.3, 0.6, 1])]);
    case 'snowman':
      return merge([part(ball(0.7), 0xffffff, [0, 0.6, 0]), part(ball(0.5), 0xffffff, [0, 1.5, 0]), part(ball(0.36), 0xffffff, [0, 2.2, 0]), part(cone(0.07, 0.35, 5), 0xff8a2a, [0, 2.2, 0.45], [H, 0, 0]), part(ball(0.05, 6, 4), 0x2a1d17, [-0.12, 2.32, 0.32]), part(ball(0.05, 6, 4), 0x2a1d17, [0.12, 2.32, 0.32]), part(cyl(0.38, 0.38, 0.12, 10), 0xe8504a, [0, 1.92, 0]), part(cone(0.13, 0.26, 4), 0xffffff, [-0.2, 2.55, 0]), part(cone(0.13, 0.26, 4), 0xffffff, [0.2, 2.55, 0])]);
    case 'sandcastle':
      return merge([part(box(2.2, 0.9, 2.2), 0xf2d49a, [0, 0.45, 0]), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([x, z]) => [part(cyl(0.45, 0.5, 1.5, 8), 0xe8c480, [x, 0.75, z]), part(cone(0.5, 0.6, 8), 0xff7fb0, [x, 1.8, z])]), part(cyl(0.5, 0.55, 1.9, 8), 0xf2d49a, [0, 0.95, 0]), part(cone(0.55, 0.7, 8), 0x6fc3ff, [0, 2.25, 0])]);
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

export function cloudGeometry() {
  return merge([
    part(ball(1.6, 10, 8), 0xffffff, [0, 0, 0]), part(ball(1.2, 10, 8), 0xffffff, [1.6, -0.3, 0.2]), part(ball(1.1, 10, 8), 0xffffff, [-1.6, -0.35, -0.1]),
    part(ball(0.9, 10, 8), 0xffffff, [0.6, 0.7, 0.3]), part(ball(0.8, 10, 8), 0xf4f8ff, [2.7, -0.5, 0]), part(cyl(2.6, 2.6, 0.5, 12), 0xeef4ff, [0.4, -0.85, 0.1], [0, 0, 0], [1.2, 1, 0.6]),
  ]);
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
  for (const [x, y] of [[1.1, 0.2], [0.4, 0.2], [0.4, -1.0], [-0.4, -1.0], [-0.4, 0.2], [-1.1, 0.2]]) sh.lineTo(x, y);
  sh.closePath();
  return merge([part(new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false }), 0xff5fa2, [0, 0, 0], [H, 0, 0])]);
}
