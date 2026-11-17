// Riftmaw art kit: props are lists of coloured primitive parts, merged into one geometry per prop.
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
const _hsl = { h: 0, s: 0, l: 0 };

/** Anime palette pass: every art colour goes through here. Tints get saturated, pastels are pulled down to full
 *  colours, and candy pink turns to deep rose. Glowing parts keep their own colour. */
function rich(c: THREE.Color) {
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  let { h, s, l } = _hsl;
  // Chroma, not HSL saturation, decides what is a tint: cream, bone and stone stay neutral.
  const chroma = s * (1 - Math.abs(2 * l - 1)), tint = chroma > 0.22;
  if (l > 0.6) l = 0.6 + (l - 0.6) * (tint ? 0.4 : 0.8);
  if (tint && h > 0.84 && h < 0.99 && _hsl.l > 0.6) { h += (0.965 - h) * 0.6; l -= 0.14; }
  l *= 0.95;
  s = tint ? Math.min(1, s * 1.2 + 0.1) : Math.min(1, chroma / Math.max(0.05, 1 - Math.abs(2 * l - 1)));
  c.setHSL(h, s, l, THREE.SRGBColorSpace);
}

/** Non-indexed copy of g painted one colour with a bottom-to-top gradient, plus the effect attributes and aOut:
 *  the smoothed normal the ink outline hull is pushed along (merge() scales it to the outline thickness). */
function paint(g: THREE.BufferGeometry, col: number, px = 0, py = 0, pz = 0): THREE.BufferGeometry {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  _c.setHex(col & 0xffffff);
  if (!(col & G)) rich(_c);
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
  // Vertices that share a position share one outline direction, so the hull has no gaps at hard edges.
  const nor = g.getAttribute('normal'), sum = new Map<number, [number, number, number]>(), keys = new Int32Array(n), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = keys[i] = (Math.round(pos.getX(i) * 200) * 73856093) ^ (Math.round(pos.getY(i) * 200) * 19349663) ^ (Math.round(pos.getZ(i) * 200) * 83492791);
    const a = sum.get(k);
    if (a) { a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); } else sum.set(k, [nor.getX(i), nor.getY(i), nor.getZ(i)]);
  }
  for (let i = 0; i < n; i++) { const a = sum.get(keys[i])!, d = Math.hypot(a[0], a[1], a[2]) || 1; out.set([a[0] / d, a[1] / d, a[2] / d], i * 3); }
  g.setAttribute('aOut', new THREE.BufferAttribute(out, 3));
  return g;
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  out.computeBoundingBox();
  // Ink thickness: 2 % of the object's size, kept visible on small props and thin on landmarks.
  const bb = out.boundingBox!, t = Math.min(0.13, Math.max(0.014, Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * 0.02));
  const o = out.getAttribute('aOut').array as Float32Array;
  for (let i = 0; i < o.length; i++) o[i] *= t;
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
    paint(new THREE.TorusGeometry(1.06, 0.12, 4, seg, step * 0.94).rotateZ(i * step).rotateX(Math.PI / 2).scale(1, 0.7, 1), colors[i % colors.length]));
  geos.push(paint(new THREE.TorusGeometry(0.97, 0.035, 5, 48).rotateX(Math.PI / 2), G | 0xffffff));
  // Glowing crystal shards between the plates, leaning outward.
  const n = Math.max(8, arcs);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2, big = i % 2 ? 1 : 1.6;
    geos.push(paint(new THREE.OctahedronGeometry(0.5, 0).scale(0.09 * big, 0.3 * big, 0.09 * big).rotateX(-0.6).rotateY(Math.PI - a).translate(Math.sin(a) * 1.13, 0.1, -Math.cos(a) * 1.13), G | 0xfff3c4));
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

const TIMBER = 0x4a3324;
/** Timber-framed house facing +z: stone plinth, walls, steep roof, beams, door, lit windows, gable banner, chimney.
 *  The footprint (plinth and eaves) is fixed by w and d, as before; only heights grew. */
export const house = (wall: number, roof: number, w = 2.2, h = 1.6, d = 1.8, trim = 0xffffff): Part[] => {
  const accent = trim === 0xffffff ? 0xd9a441 : trim, rh = h * 1.3, f = d / 2;
  return [
    ['box', 0x6f6a78, 0, 0.09, 0, w + 0.16, 0.18, d + 0.16],
    ['box', wall, 0, h / 2, 0, w, h, d],
    ['roof', roof, 0, h + rh / 2, 0, w + 0.5, rh, d + 0.6],
    ['box', TIMBER, 0, h + rh, 0, w + 0.5, 0.1, 0.1], // ridge beam
    ['oct', G | 0xffe9a8, w / 2 + 0.16, h + rh + 0.12, 0, 0.16, 0.34, 0.16], ['oct', G | 0xffe9a8, -w / 2 - 0.16, h + rh + 0.12, 0, 0.16, 0.34, 0.16],
    ['box', TIMBER, 0, h, 0, w + 0.24, 0.1, d + 0.34],
    ...[-1, 1].flatMap((k): Part[] => [
      ['box', TIMBER, k * (w / 2 - 0.04), h / 2, f, 0.12, h, 0.08], ['box', TIMBER, k * (w / 2 - 0.04), h / 2, -f, 0.12, h, 0.08],
      ['box', TIMBER, k * w * 0.31, h * 0.22, f + 0.01, w * 0.3, 0.06, 0.06, 0, 0, k * 0.7],
    ]),
    ['box', TIMBER, 0, h * 0.82, f + 0.01, w, 0.08, 0.07],
    ['box', 0x6b4226, 0, h * 0.3, f + 0.02, w * 0.2, h * 0.6, 0.06],
    ['box', accent, 0, h * 0.62, f + 0.03, w * 0.26, 0.06, 0.08],
    ['box', G | 0xffe9a8, -w * 0.31, h * 0.58, f + 0.02, w * 0.15, h * 0.28, 0.06],
    ['box', G | 0xffe9a8, w * 0.31, h * 0.58, f + 0.02, w * 0.15, h * 0.28, 0.06],
    ['box', G | 0xffe9a8, w / 2 + 0.02, h * 0.6, 0, 0.06, h * 0.26, d * 0.25],
    ['box', G | 0xffe9a8, -w / 2 - 0.02, h * 0.6, 0, 0.06, h * 0.26, d * 0.25],
    ['box', FLAG | accent, 0, h + rh * 0.3, f + 0.2, w * 0.16, rh * 0.42, 0.03], // gable banner
    ['box', TIMBER, 0, h + rh * 0.53, f + 0.14, w * 0.22, 0.05, 0.2],
    ['box', 0x5a5560, w * 0.27, h + rh * 0.75, -d * 0.18, w * 0.13, rh * 0.7, w * 0.13],
  ];
};

/** Round tower: base ring, shaft, battlements, tall spire, crystal, lit window, wall banner and pennant. */
export const tower = (stone: number, roof: number, r = 2.3, h = 6, flag = 0xff8fc8): Part[] => [
  ['cyl', stone, 0, h / 2, 0, r * 2, h, r * 2],
  ['cyl', 0x5f5a70, 0, 0.3, 0, r * 2.18, 0.6, r * 2.18],
  ['cyl', 0x5f5a70, 0, h * 0.62, 0, r * 2.06, 0.18, r * 2.06],
  ['cyl', 0x5f5a70, 0, h * 0.97, 0, r * 2.1, 0.22, r * 2.1],
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): Part => ['box', stone, Math.cos(i * 0.785) * r * 0.94, h + r * 0.14, Math.sin(i * 0.785) * r * 0.94, r * 0.3, r * 0.3, r * 0.3, 0, -i * 0.785, 0]),
  ['cone', roof, 0, h + r * 1.45, 0, r * 1.9, r * 2.7, r * 1.9],
  ['cyl', 0x3a2a20, 0, h + r * 3.0, 0, 0.1, r * 0.7, 0.1],
  ['oct', G | 0x9fe8ff, 0, h + r * 3.42, 0, r * 0.22, r * 0.42, r * 0.22],
  ['box', FLAG | flag, r * 0.26, h + r * 3.05, 0, r * 0.5, r * 0.24, 0.04],
  ['box', FLAG | flag, 0, h * 0.72, r + 0.05, r * 0.42, h * 0.34, 0.04], // wall banner
  ['box', 0x3a2a20, 0, h * 0.9, r + 0.03, r * 0.52, 0.07, 0.08],
  ['box', G | 0xffe9a8, r * 0.7, h * 0.6, r * 0.7, r * 0.26, r * 0.5, 0.1, 0, 0.785, 0],
  ['box', 0x6b4226, 0, r * 0.4, r, r * 0.5, r * 0.8, 0.1],
];

/** Castle (boss size, about 15 wide): keep with a tall spire roof, four corner towers, bannered walls, gate. */
export const castle = (stone: number, roof: number, flag: number, wall = 0xb3abc6): Part[] => [
  ['box', wall, 0, 0.25, 0, 14.6, 0.5, 14.6],
  ...[[0, -5.6, 11.2, 0.9], [0, 5.6, 11.2, 0.9], [-5.6, 0, 0.9, 11.2], [5.6, 0, 0.9, 11.2]].map(([x, z, sx, sz]): Part => ['box', wall, x, 1.8, z, sx, 3.2, sz]),
  ...[-4, -2, 2, 4].flatMap((x): Part[] => [['box', stone, x, 3.6, 5.6, 0.7, 0.5, 1.0], ['box', stone, x, 3.6, -5.6, 0.7, 0.5, 1.0], ['box', stone, 5.6, 3.6, x, 1.0, 0.5, 0.7], ['box', stone, -5.6, 3.6, x, 1.0, 0.5, 0.7]]),
  ...[-3, 3].flatMap((x): Part[] => [['box', FLAG | flag, x, 2.0, 6.08, 0.9, 2.2, 0.04], ['box', FLAG | flag, 6.08, 2.0, x, 0.04, 2.2, 0.9], ['box', FLAG | flag, -6.08, 2.0, x, 0.04, 2.2, 0.9]]),
  ['box', 0x3a2a20, 0, 1.4, 6.08, 2.2, 2.8, 0.1],
  ['box', G | 0xffe9a8, 0, 3.3, 6.08, 1.0, 0.5, 0.1],
  ['oct', G | 0x9fe8ff, -1.6, 3.5, 6.0, 0.4, 0.9, 0.4], ['oct', G | 0x9fe8ff, 1.6, 3.5, 6.0, 0.4, 0.9, 0.4],
  ...at(tower(stone, roof, 1.6, 6.5, flag), -5.6, -5.6), ...at(tower(stone, roof, 1.6, 6.5, flag), 5.6, -5.6),
  ...at(tower(stone, roof, 1.6, 6.5, flag), -5.6, 5.6), ...at(tower(stone, roof, 1.6, 6.5, flag), 5.6, 5.6),
  ['box', stone, 0, 3.2, 0, 6.4, 6.4, 6.4],
  ['box', 0x5f5a70, 0, 6.3, 0, 6.8, 0.3, 6.8],
  ['pyr', roof, 0, 8.7, 0, 7.4, 4.6, 7.4],
  ...[-1.7, 0, 1.7].map((x): Part => ['box', G | 0xffe9a8, x, 4.0, 3.22, 0.7, 1.7, 0.1]),
  ...at(tower(stone, roof, 1.5, 12.5, flag), 0, 0),
];

/** Mountain (boss size, about 16 wide): main peak, shoulder peak, cap, boulders. Add trees with at(). */
export const mountain = (rock: number, rock2: number, cap: number): Part[] => [
  ['cone', rock, 0, 5, 0, 15.5, 10, 15.5],
  ['cone', rock2, 3.4, 3.2, 2.2, 8.5, 6.4, 8.5],
  ['cone', rock2, -3.8, 2.6, -1.6, 7.5, 5.2, 7.5],
  ['cone', cap, 0, 8.4, 0, 5.1, 3.3, 5.1],
  ['cone', cap, 3.4, 5.5, 2.2, 2.6, 1.9, 2.6],
  ['blob', rock2, -5.2, 0.7, 4.2, 2.4, 1.6, 2.2], ['blob', rock, 5.8, 0.6, -3.6, 2.0, 1.4, 2.2], ['blob', rock2, 1.0, 0.6, 6.6, 1.8, 1.3, 1.6],
  ['oct', G | 0x9fe8ff, -2.6, 4.6, 2.4, 0.7, 2.2, 0.7, 0.3, 0, 0.3], ['oct', G | 0x9fe8ff, 2.2, 6.2, -1.2, 0.6, 1.9, 0.6, -0.3, 0, -0.3], ['oct', G | 0x9fe8ff, 0.4, 3.4, 4.6, 0.6, 1.8, 0.6, 0.5],
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
