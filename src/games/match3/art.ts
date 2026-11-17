// All Spellpaw board art: faceted geometry with vertex colors, cel materials, ink hulls and glow textures, built in code.
import {
  BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DataTexture, Euler,
  ExtrudeGeometry, IcosahedronGeometry, Matrix4, MeshBasicMaterial, MeshToonMaterial, NearestFilter, OctahedronGeometry, Quaternion,
  RedFormat, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, TorusKnotGeometry, Vector3, type Side,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
type Paint = number | ((y: number, x: number) => number);

/** One colored part, baked into world space of the model. */
export function part(g: BufferGeometry, color: Paint, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: number | V3 = 1): BufferGeometry {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  const m = new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...r)), new Vector3(sc[0], sc[1], sc[2]));
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
  const pos = out.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    c.set(typeof color === 'number' ? color : color(pos.getY(i), pos.getX(i)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  out.applyMatrix4(m);
  out.setAttribute('color', new BufferAttribute(col, 3));
  return out;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

const sph = (r: number, ws = 20, hs = 14) => new SphereGeometry(r, ws, hs);
const mix = (a: number, b: number, k: number) => new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, k))).getHex();
/** Top-to-bottom shade: light on top, deep at the bottom, like a lit candy. */
const shade = (hi: number, lo: number, r: number): Paint => (y) => mix(lo, hi, (y / r + 1) / 2);

// ---------- materials ----------

/** The one shared 3-step cel ramp (D7): 0.35 / 0.7 / 1.0, hard steps. */
export const RAMP = new DataTexture(new Uint8Array([89, 179, 255]), 3, 1, RedFormat);
RAMP.minFilter = RAMP.magFilter = NearestFilter;
RAMP.needsUpdate = true;

export interface ToonOpts { color?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number; depthWrite?: boolean; vertexColors?: boolean; side?: Side }
/** Cel-shaded material on the shared ramp. Vertex colours on unless switched off. */
export function toon(o: ToonOpts = {}): MeshToonMaterial {
  return new MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, ...o });
}
/** Old name, kept for callers; surface options of the old glossy look (roughness, clearcoat...) are dropped. */
export function gloss(o: ToonOpts & Record<string, unknown> = {}): MeshToonMaterial {
  const { color, emissive, emissiveIntensity, transparent, opacity, depthWrite, vertexColors, side } = o;
  const keep: ToonOpts = {};
  Object.entries({ color, emissive, emissiveIntensity, transparent, opacity, depthWrite, vertexColors, side }).forEach(([k, v]) => { if (v !== undefined) (keep as Record<string, unknown>)[k] = v; });
  return toon(keep);
}

/** Ink colour for outlines when a model has no vertex colours. */
export const INK = 0x140c24;
/** Material for `hull` geometry: unlit back faces in the hull's own darkened vertex colours. */
export const inkMaterial = () => new MeshBasicMaterial({ vertexColors: true, side: BackSide });
/**
 * Inverted-hull ink outline of a model made with `part`/`merge`: the same triangles pushed out along smoothed normals
 * by `t` (world units; use about 2% of the model size), coloured as the darkened base hue. Draw with `inkMaterial()`.
 */
export function hull(g: BufferGeometry, t = 0.02, dark = 0.22): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  const pos = out.attributes.position, nor = out.attributes.normal, col = out.attributes.color;
  const sum = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(pos.getX(i) * 500)},${Math.round(pos.getY(i) * 500)},${Math.round(pos.getZ(i) * 500)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), v = sum.get(k) ?? [0, 0, 0];
    v[0] += nor.getX(i); v[1] += nor.getY(i); v[2] += nor.getZ(i);
    sum.set(k, v);
  }
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sum.get(key(i))!;
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    pos.setXYZ(i, pos.getX(i) + (v[0] / l) * t, pos.getY(i) + (v[1] / l) * t, pos.getZ(i) + (v[2] / l) * t);
    if (col) c.set([col.getX(i) * dark, col.getY(i) * dark * 0.85, col.getZ(i) * dark * 1.15], i * 3);
    else c.set([0.006, 0.003, 0.018], i * 3);
  }
  out.setAttribute('color', new BufferAttribute(c, 3));
  out.deleteAttribute('normal');
  return out;
}
/** Hard facets: every triangle gets its own flat normal. */
export function facet(g: BufferGeometry): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.computeVertexNormals();
  return out;
}
/** No-op now (cel shading has no clear coat); kept so callers compile. */
export function setGloss(_hi: boolean): void {}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
/** Soft round glow. */
export const glowTexture = () => canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, '#fff'); r.addColorStop(0.25, '#fffc'); r.addColorStop(0.6, '#fff3'); r.addColorStop(1, '#fff0');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
/** Four-point sparkle. */
export const sparkleTexture = () => canvasTex(64, (g, s) => {
  const h = s / 2;
  g.translate(h, h);
  const r = g.createRadialGradient(0, 0, 0, 0, 0, h);
  r.addColorStop(0, '#fff'); r.addColorStop(0.3, '#fff6'); r.addColorStop(1, '#fff0');
  g.fillStyle = r;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    g.moveTo(0, -h); g.quadraticCurveTo(h * 0.08, -h * 0.08, h, 0); g.quadraticCurveTo(h * 0.08, h * 0.08, 0, h);
    g.quadraticCurveTo(-h * 0.08, h * 0.08, -h, 0); g.quadraticCurveTo(-h * 0.08, -h * 0.08, 0, -h);
    g.fill();
    g.rotate(Math.PI / 4); g.scale(0.5, 0.5);
  }
});
/** Shock ring. */
export const ringTexture = () => canvasTex(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s / 2);
  r.addColorStop(0, '#fff0'); r.addColorStop(0.55, '#fff5'); r.addColorStop(0.8, '#fff'); r.addColorStop(1, '#fff0');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

// ---------- pieces: six spell gems, each readable by outline as well as colour ----------

export const PIECE_COLORS = [0xe0264e, 0xf07a14, 0xf2c21a, 0x1fae5a, 0x1f7fe8, 0x8a4be8];
export const PIECE_NAMES = ['Flame Crystal', 'Sun Sigil', 'Star Prism', 'Leaf Rune', 'Tide Orb', 'Moon Sigil'];
const LIGHT = [0xffa0a8, 0xffc878, 0xfff3a8, 0x90f5a8, 0x90d4ff, 0xd8b8ff];
const DARK = [0x8a0c34, 0x9a3c00, 0xa86a00, 0x0a6034, 0x0c3c9a, 0x45189a];

function starShape(outer: number, inner: number, n = 5): Shape {
  const s = new Shape();
  for (let k = 0; k <= n * 2; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / n;
    const r = k % 2 ? inner : outer;
    if (k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}
function poly(pts: number[][]): Shape {
  const s = new Shape();
  pts.forEach(([x, y], k) => (k ? s.lineTo(x, y) : s.moveTo(x, y)));
  return s;
}

/** Rounded rectangle, centred. */
export function rrect(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const slab = (w: number, h: number, r: number, depth: number, bevel: number) =>
  new ExtrudeGeometry(rrect(w, h, r), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });

/** A cut gem: flat shape with one hard bevel, every facet flat. */
const cut = (sh: Shape, depth = 0.1, bevel = 0.1, size = 0.08, curve = 4) =>
  facet(new ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: size, bevelSegments: 1, curveSegments: curve }));
/** Inner glow: bright core, deep rim. */
const core = (hi: number, lo: number, r: number): Paint => (y, x) => mix(hi, lo, Math.hypot(x, y) / r);
/** Hard white glint on the upper left of a gem face. */
const glint = (x: number, y: number, z: number, s = 1): BufferGeometry[] => [
  part(facet(new OctahedronGeometry(0.07, 0)), 0xffffff, [x, y, z], [0, 0, 0.7], [0.45 * s, 1.5 * s, 0.25]),
  part(facet(new OctahedronGeometry(0.03, 0)), 0xffffff, [x + 0.09 * s, y - 0.1 * s, z], [0, 0, 0], [1, 1, 0.4]),
];

export function pieceGeometry(color: number): BufferGeometry {
  const C = PIECE_COLORS[color], D = DARK[color], L = LIGHT[color];
  switch (color) {
    case 0: { // flame crystal: a licking flame
      const f = poly([[0.02, 0.47], [0.13, 0.2], [0.31, 0.0], [0.31, -0.2], [0.17, -0.38], [0, -0.43], [-0.17, -0.38], [-0.31, -0.2], [-0.27, 0.03], [-0.14, 0.1], [-0.1, 0.3]]);
      return merge([
        part(cut(f), core(C, D, 0.5), [0, 0, -0.05]),
        part(cut(f, 0.02, 0.04, 0.03), core(0xffe08a, 0xff6a2e, 0.45), [0.01, -0.1, 0.13], [0, 0, 0], [0.5, 0.52, 1]),
        ...glint(-0.17, -0.04, 0.17, 0.8),
      ]);
    }
    case 1: { // sun sigil: a six-rayed disc
      const parts = [
        part(facet(new CylinderGeometry(0.33, 0.33, 0.14, 6)), shade(C, D, 0.33), [0, 0, 0], [Math.PI / 2, 0, 0]),
        part(facet(new CylinderGeometry(0.17, 0.31, 0.1, 6)), core(L, C, 0.3), [0, 0, 0.12], [Math.PI / 2, 0, 0]),
        part(facet(new OctahedronGeometry(0.13, 0)), 0xfff3c8, [0, 0, 0.17], [0, 0, 0], [1, 1, 0.5]),
      ];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push(part(facet(new ConeGeometry(0.085, 0.2, 4)), shade(L, C, 0.1), [Math.sin(a) * 0.39, Math.cos(a) * 0.39, 0], [0, 0, -a], [1, 1, 0.6]));
      }
      return merge([...parts, ...glint(-0.14, 0.1, 0.2, 0.7)]);
    }
    case 2: // star prism: a four-point star
      return merge([
        part(cut(starShape(0.47, 0.16, 4), 0.08, 0.13, 0.03, 1), core(L, D, 0.5), [0, 0, -0.04]),
        part(facet(new OctahedronGeometry(0.15, 0)), 0xfffbe0, [0, 0, 0.14], [0, 0, 0], [1, 1, 0.5]),
        ...glint(-0.09, 0.2, 0.15, 0.6),
      ]);
    case 3: { // leaf rune: a blade leaf with a carved rune
      const leaf = new Shape();
      leaf.moveTo(0, -0.5); leaf.quadraticCurveTo(0.38, -0.04, 0, 0.5); leaf.quadraticCurveTo(-0.38, -0.04, 0, -0.5);
      const vein = (x: number, y: number, a: number, len: number) => part(slab(0.045, len, 0.01, 0.03, 0), L, [x, y, 0.15], [0, 0, a]);
      return merge([
        part(cut(leaf, 0.08, 0.1, 0.05, 5), core(C, D, 0.5), [0, 0, -0.04], [0, 0, -0.7]),
        vein(0, 0, -0.7, 0.62), vein(0.13, -0.02, 0.35, 0.2), vein(-0.03, 0.13, -1.75, 0.2), vein(-0.1, -0.2, 0.35, 0.16), vein(-0.2, -0.07, -1.75, 0.16),
        ...glint(-0.21, 0.13, 0.15, 0.6),
      ]);
    }
    case 4: // tide orb: a faceted orb in a ring
      return merge([
        part(facet(new IcosahedronGeometry(0.35, 1)), shade(L, D, 0.35)),
        part(facet(new TorusGeometry(0.42, 0.04, 4, 20)), 0xcfeeff, [0, 0, 0], [1.15, 0.35, 0]),
        part(sph(0.15, 10, 8), 0xd8f4ff, [0.05, -0.05, 0.25], [0, 0, 0], [1, 1, 0.4]),
        ...glint(-0.14, 0.13, 0.31, 0.8),
      ]);
    default: { // moon sigil: a crescent holding a star
      const m = new Shape();
      m.absarc(0, 0, 0.43, 0.873, 5.41, false);
      m.absarc(0.17, 0, 0.335, -1.267, 1.267, true);
      return merge([
        part(cut(m, 0.1, 0.09, 0.04, 6), (_y, x) => mix(L, D, (x + 0.47) / 0.5), [-0.07, 0, -0.05]),
        part(facet(new OctahedronGeometry(0.13, 0)), 0xfff0c0, [0.17, 0, 0.02], [0, 0, 0], [0.8, 1.3, 0.6]),
        ...glint(-0.3, 0.16, 0.14, 0.6),
      ]);
    }
  }
}

/** Prism Nova: a six-colour crystal with a white star core. */
export function rainbowGeometry(): BufferGeometry {
  const band = (y: number, x: number) => PIECE_COLORS[Math.floor(((Math.atan2(y, x) / (Math.PI * 2) + 1.5) % 1) * 6) % 6];
  const spike = (r: V3) => part(facet(new OctahedronGeometry(0.16, 0)), 0xffffff, [0, 0, 0], r, [0.42, 3.1, 0.42]);
  return merge([
    part(facet(new IcosahedronGeometry(0.36, 0)), band),
    spike([0, 0, 0]), spike([0, 0, Math.PI / 2]), spike([Math.PI / 2, 0, 0]),
    part(new TorusGeometry(0.46, 0.022, 4, 28), 0xffffff, [0, 0, 0], [1.1, 0.4, 0]),
    part(new TorusGeometry(0.46, 0.022, 4, 28), 0xfff0b0, [0, 0, 0], [-1.1, -0.4, 0]),
  ]);
}

/** The rune pedestal a sealed cat mage stands on. */
export function basketGeometry(): BufferGeometry {
  return merge([
    part(facet(new CylinderGeometry(0.4, 0.3, 0.26, 6)), shade(0x5a4a8a, 0x241a48, 0.13), [0, -0.29, 0]),
    part(facet(new TorusGeometry(0.4, 0.04, 4, 6)), 0xf2c21a, [0, -0.15, 0], [Math.PI / 2, 0, Math.PI / 6]),
    part(new TorusGeometry(0.27, 0.025, 4, 20), 0x7fe8ff, [0, -0.15, 0], [Math.PI / 2, 0, 0]),
  ]);
}

// ---------- special overlays ----------

/** Line Spell: a double-headed light blade. */
export function wandGeometry(): BufferGeometry {
  return merge([
    part(slab(0.56, 0.05, 0.02, 0.04, 0.02), 0xffffff, [0, 0, 0.36]),
    part(new ConeGeometry(0.13, 0.3, 4), 0xbff4ff, [0.47, 0, 0.38], [0, 0, -Math.PI / 2], [1, 1, 0.3]),
    part(new ConeGeometry(0.13, 0.3, 4), 0xbff4ff, [-0.47, 0, 0.38], [0, 0, Math.PI / 2], [1, 1, 0.3]),
  ]);
}

/** Burst Sigil: an eight-sided rune ring with blade points. */
export function puffGeometry(): BufferGeometry {
  const parts = [part(facet(new TorusGeometry(0.47, 0.04, 4, 8)), 0xffb030), part(new TorusGeometry(0.4, 0.015, 4, 24), 0xfff0b0)];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const big = k % 2 === 0;
    parts.push(part(facet(new ConeGeometry(big ? 0.07 : 0.045, big ? 0.26 : 0.13, 4)), big ? 0xfff0b0 : 0xff7a1a, [Math.cos(a) * (big ? 0.6 : 0.54), Math.sin(a) * (big ? 0.6 : 0.54), 0], [0, 0, a - Math.PI / 2], [1, 1, 0.5]));
  }
  return merge(parts);
}

/** Familiar: swept spirit wings. */
export function wingsGeometry(): BufferGeometry {
  const w = (s: number, y: number, len: number, a: number, c: number) => part(facet(new ConeGeometry(0.1, len, 3)), c, [s * (0.3 + len * 0.3), y, -0.08], [0, 0, s * a], [1, 1, 0.2]);
  return merge([-1, 1].flatMap((s) => [w(s, 0.3, 0.56, -0.95, 0xbff4ff), w(s, 0.12, 0.44, -1.35, 0xe8fbff), w(s, -0.04, 0.32, -1.8, 0x8fd8ff)]));
}

// ---------- board and blockers ----------

export const tileGeometry = () => merge([part(slab(0.8, 0.8, 0.12, 0.06, 0.05), 0xffffff, [0, 0, -0.11])]);
export const baseGeometry = () => merge([part(slab(0.98, 0.98, 0.2, 0.1, 0.09), 0xffffff, [0, 0, -0.3])]);
export const dustGeometry = () => merge([
  part(slab(0.74, 0.74, 0.1, 0.02, 0.02), 0x9a9a9a, [0, 0, 0.0]),
  ...[[-0.25, 0.25, 0.17], [0.27, -0.27, 0.13], [0.28, 0.28, 0.1], [-0.28, -0.28, 0.1]].map(([x, y, r]) =>
    part(new ExtrudeGeometry(starShape(r, r * 0.3, 4), { depth: 0.03, bevelEnabled: false }), 0xffffff, [x, y, 0.04])),
]);

export function crateGeometry(): BufferGeometry {
  const wood = shade(0x9a6238, 0x4a2a1a, 0.44);
  const dark = 0x3a4060;
  const parts = [part(slab(0.72, 0.72, 0.08, 0.5, 0.06), wood, [0, 0, -0.06])];
  for (const y of [-0.26, 0.26]) parts.push(part(slab(0.8, 0.1, 0.03, 0.04, 0.02), dark, [0, y, 0.48]));
  for (const x of [-0.31, 0.31]) parts.push(part(slab(0.1, 0.62, 0.03, 0.04, 0.02), dark, [x, 0, 0.47]));
  parts.push(part(slab(0.1, 0.8, 0.03, 0.03, 0.02), dark, [0, 0, 0.45], [0, 0, 0.78]));
  for (const [x, y] of [[-0.31, -0.26], [0.31, -0.26], [-0.31, 0.26], [0.31, 0.26]]) parts.push(part(facet(new OctahedronGeometry(0.05, 0)), 0x7fe8ff, [x, y, 0.55]));
  return merge(parts);
}

export function vineGeometry(): BufferGeometry {
  const parts = [part(new TorusKnotGeometry(0.24, 0.075, 64, 8, 2, 3), shade(0x2f9a4e, 0x0c4a2c, 0.35), [0, 0, 0.25])];
  const leaf = (x: number, y: number, a: number) => part(new ConeGeometry(0.07, 0.3, 4), 0x1a6a3a, [x, y, 0.42], [0, 0, a * 2.2], [1, 1, 0.5]);
  parts.push(leaf(-0.3, 0.26, 0.6), leaf(0.3, -0.26, 0.6), leaf(0.28, 0.3, -0.6), leaf(-0.28, -0.28, -0.6));
  for (let k = 0; k < 5; k++) parts.push(part(facet(new OctahedronGeometry(0.07, 0)), 0xb04ae0, [0.05 + Math.cos(k * 1.257) * 0.08, 0.05 + Math.sin(k * 1.257) * 0.08, 0.52], [0, 0, 0], [1, 1, 0.5]));
  parts.push(part(facet(new OctahedronGeometry(0.05, 0)), 0xf0c0ff, [0.05, 0.05, 0.57]));
  return merge(parts);
}

export const iceGeometry = () => merge([part(slab(0.7, 0.7, 0.12, 0.62, 0.08), 0xffffff, [0, 0, -0.08])]);

export function crabGeometry(): BufferGeometry {
  const C = 0x7a3fd0, D = 0x3a1680;
  const claw = (s: number) => [
    part(sph(0.1, 10, 8), C, [s * 0.3, 0.14, 0], [0, 0, 0], [1, 1.2, 0.8]),
    part(new ConeGeometry(0.05, 0.14, 6), D, [s * 0.33, 0.27, 0], [0, 0, s * -0.3]),
    part(new CylinderGeometry(0.03, 0.03, 0.14, 6), D, [s * 0.22, 0.04, 0], [0, 0, s * -0.9]),
  ];
  return merge([
    part(sph(0.2, 16, 10), shade(0xa878f0, D, 0.2), [0, -0.04, 0], [0, 0, 0], [1.25, 0.85, 0.8]),
    ...claw(-1), ...claw(1),
    ...[-0.08, 0.08].flatMap((x) => [part(sph(0.05, 8, 6), 0xffe46a, [x, 0.1, 0.11], [0, 0, x * 5], [1.2, 0.6, 1])]),
    ...[-1, 1].flatMap((s) => [0, 1].map((k) => part(new CylinderGeometry(0.02, 0.02, 0.14, 5), D, [s * (0.2 + k * 0.05), -0.17, 0], [0, 0, s * (0.5 + k * 0.3)]))),
  ]);
}

/** Groomed snow: a tile cover with corduroy ridges. */
export function trailGeometry(): BufferGeometry {
  const parts = [part(slab(0.78, 0.78, 0.11, 0.02, 0.02), 0xf4fbff, [0, 0, 0.0])];
  for (let k = -3; k <= 3; k++) parts.push(part(slab(0.045, 0.62, 0.02, 0.012, 0.01), 0x6fc8ff, [k * 0.1, 0, 0.035]));
  return merge(parts);
}

export function eggGeometry(): BufferGeometry {
  const spots = (y: number, x: number) => (Math.sin(x * 19) * Math.sin(y * 17) > 0.45 ? 0xffb04a : mix(0xc8321e, 0x6a1228, 0.5 - y * 1.6));
  const parts = [part(sph(0.28, 24, 16), spots, [0, 0.03, 0.22], [0, 0, 0], [1, 1.25, 1])];
  parts.push(part(new TorusGeometry(0.25, 0.09, 8, 20), shade(0x5a5070, 0x2a2440, 0.3), [0, -0.25, 0.14], [0, 0, 0], [1.15, 0.6, 1]));
  parts.push(part(new TorusGeometry(0.2, 0.05, 6, 16), 0x7a6a98, [0, -0.2, 0.2], [0, 0, 0], [1.15, 0.6, 1]));
  return merge(parts);
}

export function rockGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(0.4, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + Math.sin(p.getX(i) * 13 + p.getY(i) * 7 + p.getZ(i) * 11) * 0.09;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k * 0.8);
  }
  g.computeVertexNormals();
  return merge([
    part(g, shade(0x9a98b8, 0x3a3858, 0.4), [0, 0, 0.2]),
    part(slab(0.05, 0.3, 0.01, 0.03, 0), 0x7fe8ff, [0, 0.02, 0.5]), part(slab(0.05, 0.16, 0.01, 0.03, 0), 0x7fe8ff, [0.07, 0.09, 0.5], [0, 0, -0.9]),
    part(slab(0.05, 0.16, 0.01, 0.03, 0), 0x7fe8ff, [-0.07, -0.03, 0.5], [0, 0, -0.9]),
  ]);
}

export function cursorGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    parts.push(part(slab(0.3, 0.09, 0.04, 0.05, 0.02), 0xffffff, [sx * 0.36, sy * 0.47, 0.42]), part(slab(0.09, 0.3, 0.04, 0.05, 0.02), 0xffffff, [sx * 0.47, sy * 0.36, 0.42]));
  }
  return merge(parts);
}

export function hammerGeometry(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.05, 0.06, 0.62, 10), shade(0xd9a060, 0x9c6634, 0.3), [0, -0.08, 0], [0, 0, 0.6]),
    part(slab(0.3, 0.14, 0.05, 0.14, 0.04), shade(0xb8a0ff, 0x45189a, 0.1), [0.15, 0.2, -0.07], [0, 0, 0.6]),
    part(slab(0.06, 0.2, 0.02, 0.2, 0.02), 0xffd84a, [0.0, 0.1, -0.1], [0, 0, 0.6]),
  ]);
}

export function shuffleGeometry(): BufferGeometry {
  return merge([
    part(new TorusGeometry(0.3, 0.06, 8, 24, Math.PI * 1.5), 0xa56bff, [0, 0, 0]),
    part(new ConeGeometry(0.13, 0.2, 10), 0xa56bff, [0.3, -0.08, 0], [0, 0, Math.PI]),
    part(sph(0.1, 12, 8), PIECE_COLORS[0], [-0.05, 0.05, 0.1]),
    part(sph(0.08, 12, 8), PIECE_COLORS[4], [0.1, 0.12, 0.1]),
  ]);
}

export const crownGeometry = () => pieceGeometry(5);
export const boxUnit = () => new BoxGeometry(1, 1, 1);

// ---------- spell effect textures ----------

/** Spell circle: rings, tick marks and a hexagram. */
export const circleTexture = () => canvasTex(256, (g, s) => {
  const h = s / 2;
  g.translate(h, h);
  g.strokeStyle = g.fillStyle = '#fff';
  const ring = (r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(h * 0.94, 5); ring(h * 0.8, 2); ring(h * 0.4, 3);
  g.lineWidth = 3;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (k * Math.PI) / 3 + (i * Math.PI * 2) / 3 - Math.PI / 2;
      if (i) g.lineTo(Math.cos(a) * h * 0.8, Math.sin(a) * h * 0.8); else g.moveTo(Math.cos(a) * h * 0.8, Math.sin(a) * h * 0.8);
    }
    g.stroke();
  }
  for (let i = 0; i < 24; i++) { g.rotate(Math.PI / 12); g.fillRect(-2, -h * 0.92, 4, i % 2 ? 8 : 16); }
});
/** Impact burst: a jagged hard-edged star. */
export const burstTexture = () => canvasTex(128, (g, s) => {
  const h = s / 2;
  g.translate(h, h);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 ? h * 0.2 : h * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.7)));
    if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.fill();
});
/** Slash arc: a thin crescent. */
export const slashTexture = () => canvasTex(128, (g, s) => {
  const h = s / 2;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(h, h, h * 0.96, -2.3, 0.7);
  g.arc(h * 0.84, h * 1.2, h * 0.96, 0.42, -2.02, true);
  g.fill();
});
/** Hard diamond shard for particles. */
export const shardTexture = () => canvasTex(32, (g, s) => {
  const h = s / 2;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(h, 0); g.lineTo(s * 0.74, h); g.lineTo(h, s); g.lineTo(s * 0.26, h);
  g.fill();
});
