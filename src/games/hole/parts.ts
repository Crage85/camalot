// Munch Hollow art kit: props are lists of coloured primitive parts, merged into one geometry per prop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Shape = 'box' | 'cyl' | 'cylt' | 'cone' | 'pyr' | 'roof' | 'ball' | 'blob' | 'oct' | 'dome' | 'torus';
// [shape, colour, x, y, z, sx, sy, sz, rx?, ry?, rz?]: unit shape, centre position, size, rotation.
// The colour may carry effect flags: G | 0xffe08a glows, SWAY | c sways in the wind, FLAG | c flutters,
// SPIN | c turns about the part centre on the prop's z axis (windmill), SPINY | c on the y axis (carousel).
export type Part = [Shape, number, number, number, number, number, number, number, number?, number?, number?];
export const G = 0x1000000, SWAY = 0x2000000, FLAG = 0x4000000, SPIN = 0x8000000, SPINY = 0x10000000;

/** Triangular prism, ridge along x, inside the unit box. */
function prism() {
  const A = [-0.5, -0.5, 0.5], B = [0.5, -0.5, 0.5], C = [0.5, 0.5, 0], D = [-0.5, 0.5, 0], E = [0.5, -0.5, -0.5], F = [-0.5, -0.5, -0.5];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([A, B, C, A, C, D, E, F, D, E, D, C, B, E, C, F, A, D].flat(), 3));
  g.computeVertexNormals();
  return g;
}

const BASE: Record<Shape, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cylt: () => new THREE.CylinderGeometry(0.4, 0.5, 1, 10),
  cone: () => new THREE.ConeGeometry(0.5, 1, 8),
  pyr: () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  roof: prism,
  ball: () => new THREE.IcosahedronGeometry(0.5, 1),
  blob: () => new THREE.IcosahedronGeometry(0.5, 0),
  oct: () => new THREE.OctahedronGeometry(0.5, 0),
  dome: () => new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), // y 0..0.5
  torus: () => new THREE.TorusGeometry(0.42, 0.08, 6, 14), // ring in the xy plane
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();

/** Non-indexed copy of g painted one colour with a soft bottom-to-top gradient, plus the effect attributes. */
function paint(g: THREE.BufferGeometry, col: number, px = 0, py = 0, pz = 0): THREE.BufferGeometry {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  _c.setHex(col & 0xffffff);
  const pos = g.getAttribute('position'), n = pos.count;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const y = pos.getY(i); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const mode = col & SWAY ? 1 : col & FLAG ? 2 : col & SPIN ? 3 : col & SPINY ? 4 : 0;
  const c = new Float32Array(n * 3), fx = new Float32Array(n * 4), glow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = 0.8 + 0.3 * ((pos.getY(i) - lo) / (hi - lo || 1));
    c.set([_c.r * k, _c.g * k, _c.b * k], i * 3);
    fx.set([px, py, pz, mode], i * 4);
    glow[i] = col & G ? 1 : 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4));
  g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return g;
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  out.computeBoundingBox();
  return out;
}

/** Merges parts into one non-indexed geometry with per-vertex colour and effect attributes. */
export function build(parts: Part[]): THREE.BufferGeometry {
  return merge(parts.map(([shape, col, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0]) => {
    _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    return paint(BASE[shape]().applyMatrix4(_m), col, x, y, z);
  }));
}

/** Hole rim of radius 1: a rounded stone ring in the skin colours, a glowing inner lip, and ornaments. */
export function rimWith(colors: number[], arcs: number, parts: Part[]): THREE.BufferGeometry {
  const step = (Math.PI * 2) / arcs;
  const seg = Math.max(4, Math.ceil(64 / arcs));
  const geos = Array.from({ length: arcs }, (_, i) =>
    paint(new THREE.TorusGeometry(1.06, 0.11, 8, seg, step).rotateZ(i * step).rotateX(Math.PI / 2).scale(1, 0.75, 1), colors[i % colors.length]));
  geos.push(paint(new THREE.TorusGeometry(0.97, 0.035, 5, 48).rotateX(Math.PI / 2), G | 0xffffff));
  // Studs between the stones.
  const n = Math.max(8, arcs);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    geos.push(paint(new THREE.OctahedronGeometry(0.055, 0).translate(Math.sin(a) * 1.06, 0.1, -Math.cos(a) * 1.06), G | 0xfff3c4));
  }
  if (parts.length) geos.push(build(parts));
  return merge(geos);
}

// ---------- reusable builders ----------
/** Copy of parts moved by (dx, dz), lifted by dy and scaled by s. */
export const at = (parts: Part[], dx: number, dz: number, s = 1, dy = 0): Part[] =>
  parts.map(([sh, c, x, y, z, sx, sy, sz, ...r]) => [sh, c, x * s + dx, y * s + dy, z * s + dz, sx * s, sy * s, sz * s, ...r] as Part);

export const tree = (leaf: number, leaf2: number, s = 1): Part[] => at([
  ['cylt', 0x8d6e4a, 0, 0.7, 0, 0.4, 1.4, 0.4],
  ['blob', SWAY | leaf, 0, 2.0, 0, 2.2, 1.9, 2.2],
  ['blob', SWAY | leaf2, 0.2, 2.8, 0.1, 1.5, 1.4, 1.5],
  ['blob', SWAY | leaf2, -0.5, 1.9, 0.5, 1.0, 0.9, 1.0],
  ['blob', SWAY | leaf, 0.55, 1.7, -0.4, 0.9, 0.8, 0.9],
], 0, 0, s);

export const pine = (s: number, a = 0x2e8b57, b = 0x34a065, c = 0x3cb371, cap = 0xf5fbff): Part[] => at([
  ['cyl', 0x7a5a3a, 0, 0.4, 0, 0.35, 0.8, 0.35],
  ['cone', SWAY | a, 0, 1.3, 0, 2.0, 1.5, 2.0],
  ['cone', SWAY | b, 0, 2.2, 0, 1.6, 1.4, 1.6],
  ['cone', SWAY | c, 0, 3.0, 0, 1.1, 1.2, 1.1],
  ['cone', SWAY | cap, 0, 3.45, 0, 0.5, 0.45, 0.5],
], 0, 0, s);

/** Gabled house facing +z: plinth, walls, roof, door, two lit windows, chimney. */
export const house = (wall: number, roof: number, w = 2.2, h = 1.6, d = 1.8, trim = 0xffffff): Part[] => [
  ['box', 0x9a8f86, 0, 0.07, 0, w + 0.16, 0.14, d + 0.16],
  ['box', wall, 0, h / 2, 0, w, h, d],
  ['roof', roof, 0, h + h * 0.36, 0, w + 0.5, h * 0.72, d + 0.6],
  ['box', trim, 0, h, 0, w + 0.24, 0.09, d + 0.34],
  ['box', 0x8d5a3a, 0, h * 0.3, d / 2 + 0.02, w * 0.2, h * 0.6, 0.06],
  ['box', trim, 0, h * 0.62, d / 2 + 0.03, w * 0.26, 0.06, 0.08],
  ['box', G | 0xffe9a8, -w * 0.31, h * 0.6, d / 2 + 0.02, w * 0.17, h * 0.26, 0.06],
  ['box', G | 0xffe9a8, w * 0.31, h * 0.6, d / 2 + 0.02, w * 0.17, h * 0.26, 0.06],
  ['box', trim, -w * 0.31, h * 0.45, d / 2 + 0.05, w * 0.21, 0.06, 0.1],
  ['box', trim, w * 0.31, h * 0.45, d / 2 + 0.05, w * 0.21, 0.06, 0.1],
  ['box', G | 0xffe9a8, w / 2 + 0.02, h * 0.6, 0, 0.06, h * 0.26, d * 0.25],
  ['box', G | 0xffe9a8, -w / 2 - 0.02, h * 0.6, 0, 0.06, h * 0.26, d * 0.25],
  ['box', 0xa0522d, w * 0.27, h * 1.55, -d * 0.18, w * 0.13, h * 0.5, w * 0.13],
];

/** Round tower: base ring, shaft, battlements, cone roof, lit window, fluttering flag. */
export const tower = (stone: number, roof: number, r = 2.3, h = 6, flag = 0xff8fc8): Part[] => [
  ['cyl', stone, 0, h / 2, 0, r * 2, h, r * 2],
  ['cyl', 0x8f88a3, 0, 0.3, 0, r * 2.18, 0.6, r * 2.18],
  ['cyl', 0x8f88a3, 0, h * 0.62, 0, r * 2.06, 0.18, r * 2.06],
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): Part => ['box', stone, Math.cos(i * 0.785) * r * 0.94, h + r * 0.14, Math.sin(i * 0.785) * r * 0.94, r * 0.3, r * 0.3, r * 0.3, 0, -i * 0.785, 0]),
  ['cone', roof, 0, h + r * 0.85, 0, r * 1.9, r * 1.4, r * 1.9],
  ['cyl', 0x5d4630, 0, h + r * 1.75, 0, 0.1, r * 0.55, 0.1],
  ['box', FLAG | flag, r * 0.2, h + r * 1.85, 0, r * 0.36, r * 0.2, 0.04],
  ['box', G | 0xffe9a8, 0, h * 0.6, r, r * 0.3, r * 0.5, 0.1],
  ['box', 0x8d5a3a, 0, r * 0.4, r, r * 0.5, r * 0.8, 0.1],
];

/** Castle (boss size, about 15 wide): keep, four corner towers, walls, gate. */
export const castle = (stone: number, roof: number, flag: number, wall = 0xb3abc6): Part[] => [
  ['box', wall, 0, 0.25, 0, 14.6, 0.5, 14.6],
  ...[[0, -5.6, 11.2, 0.9], [0, 5.6, 11.2, 0.9], [-5.6, 0, 0.9, 11.2], [5.6, 0, 0.9, 11.2]].map(([x, z, sx, sz]): Part => ['box', wall, x, 1.8, z, sx, 3.2, sz]),
  ...[-4, -2, 2, 4].flatMap((x): Part[] => [['box', stone, x, 3.6, 5.6, 0.7, 0.5, 1.0], ['box', stone, x, 3.6, -5.6, 0.7, 0.5, 1.0], ['box', stone, 5.6, 3.6, x, 1.0, 0.5, 0.7], ['box', stone, -5.6, 3.6, x, 1.0, 0.5, 0.7]]),
  ['box', 0x5d4630, 0, 1.4, 6.08, 2.2, 2.8, 0.1],
  ['box', G | 0xffe9a8, 0, 3.3, 6.08, 1.0, 0.5, 0.1],
  ...at(tower(stone, roof, 1.6, 6.5, flag), -5.6, -5.6), ...at(tower(stone, roof, 1.6, 6.5, flag), 5.6, -5.6),
  ...at(tower(stone, roof, 1.6, 6.5, flag), -5.6, 5.6), ...at(tower(stone, roof, 1.6, 6.5, flag), 5.6, 5.6),
  ['box', stone, 0, 3.2, 0, 6.4, 6.4, 6.4],
  ['pyr', roof, 0, 7.5, 0, 7.4, 2.2, 7.4],
  ...[-1.7, 0, 1.7].map((x): Part => ['box', G | 0xffe9a8, x, 4.2, 3.22, 0.8, 1.3, 0.1]),
  ...at(tower(stone, roof, 1.5, 10.5, flag), 0, 0),
];

/** Mountain (boss size, about 16 wide): main peak, shoulder peak, cap, boulders. Add trees with at(). */
export const mountain = (rock: number, rock2: number, cap: number): Part[] => [
  ['cone', rock, 0, 5, 0, 15.5, 10, 15.5],
  ['cone', rock2, 3.4, 3.2, 2.2, 8.5, 6.4, 8.5],
  ['cone', rock2, -3.8, 2.6, -1.6, 7.5, 5.2, 7.5],
  ['cone', cap, 0, 8.4, 0, 5.1, 3.3, 5.1],
  ['cone', cap, 3.4, 5.5, 2.2, 2.6, 1.9, 2.6],
  ['blob', rock2, -5.2, 0.7, 4.2, 2.4, 1.6, 2.2], ['blob', rock, 5.8, 0.6, -3.6, 2.0, 1.4, 2.2], ['blob', rock2, 1.0, 0.6, 6.6, 1.8, 1.3, 1.6],
];

export interface PropDef {
  name: string;
  label?: string; // plural shown in goals ("mushrooms"); default name + "s"
  parts: Part[];
  count: number; // instances on a full-size map (half 48); scaled by map area
  place?: 'street' | 'road' | 'water' | 'landmark'; // houses line the streets, carts sit on them, boats float, landmarks stand apart
  row?: boolean; // placed in short straight rows (fences, umbrellas)
  near?: boolean; // placed near the bigger props (village clutter)
}

export type MapId = 'kingdom' | 'ski' | 'beach' | 'desert' | 'cat' | 'candy' | 'park' | 'dragon' | 'sky';
export interface MapDef {
  id: MapId;
  name: string;
  ground: number; ground2: number; // base and mottling
  road: number; water: number;
  sky: [number, number]; // top, horizon (also fog)
  sun: number; hemi: [number, number];
  wall: number;
  plan: { roads: number; river?: boolean; sea?: boolean; ponds?: number; plaza?: boolean };
  backdrop: [number, number]; // far hills: body, cap
  ambient: 'petals' | 'snow' | 'spray' | 'dust' | 'leaves' | 'sparkle' | 'embers' | 'stars';
  props: PropDef[];
}
