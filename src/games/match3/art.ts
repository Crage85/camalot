// All Whisker Castle board art: geometry with vertex colors, glossy materials and glow textures, built in code.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Euler, ExtrudeGeometry,
  IcosahedronGeometry, Matrix4, MeshPhysicalMaterial, Quaternion, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry,
  TorusKnotGeometry, Vector3, type MeshPhysicalMaterialParameters,
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

const glossy: MeshPhysicalMaterial[] = [];
/** Shiny candy material. `setGloss(false)` drops the clear coat (Low quality). */
export function gloss(o: MeshPhysicalMaterialParameters = {}): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9, ...o });
  if (o.clearcoat !== 0) glossy.push(m); // clearcoat 0 = matt for good
  return m;
}
export function setGloss(hi: boolean): void {
  for (const m of glossy) { m.clearcoat = hi ? 1 : 0; m.needsUpdate = true; }
}

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

// ---------- pieces ----------

export const PIECE_COLORS = [0xff4f8b, 0xff8a1f, 0xffcf2e, 0x3fd06a, 0x38a0ff, 0xa064ff];
export const PIECE_NAMES = ['Yarn', 'Fish', 'Star', 'Potion', 'Paw', 'Crown'];
const LIGHT = [0xffa3c4, 0xffc27a, 0xfff0a0, 0x9cf0a8, 0x9bd2ff, 0xd3b4ff];
const DARK = [0xc4205c, 0xc95a08, 0xe08a00, 0x16903e, 0x1562c9, 0x6a2fd0];

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

export function pieceGeometry(color: number): BufferGeometry {
  const C = PIECE_COLORS[color], D = DARK[color], L = LIGHT[color];
  switch (color) {
    case 0: { // yarn ball
      const strand = (r: V3) => part(new TorusGeometry(0.385, 0.045, 8, 32), shade(L, C, 0.4), [0, 0, 0], r);
      return merge([
        part(sph(0.39), shade(C, D, 0.39)),
        strand([0, 0.7, 0]), strand([1.2, -0.5, 0.4]), strand([0.2, 1.5, 1.1]), strand([Math.PI / 2, 0.3, 0]),
        part(new TorusGeometry(0.15, 0.04, 8, 14, Math.PI * 1.3), L, [0.31, -0.33, 0.08], [0, 0, -0.6]),
      ]);
    }
    case 1: // fish
      return merge([
        part(sph(0.33), shade(L, D, 0.33), [0.07, 0, 0], [0, 0, 0], [1.22, 0.92, 0.8]),
        part(sph(0.2, 14, 10), 0xfff0d6, [0.1, -0.13, 0.1], [0, 0, 0], [1.2, 0.6, 0.8]),
        part(new ConeGeometry(0.26, 0.3, 12), shade(C, D, 0.15), [-0.37, 0, 0], [0, 0, -Math.PI / 2], [1, 1, 0.45]),
        part(new ConeGeometry(0.13, 0.2, 10), D, [0.03, 0.31, 0], [0, 0, 0.35], [1, 1, 0.45]),
        part(sph(0.095, 12, 8), 0xffffff, [0.24, 0.08, 0.2]),
        part(sph(0.055, 10, 8), 0x1c1c2e, [0.27, 0.08, 0.265]),
        part(sph(0.02, 6, 4), 0xffffff, [0.285, 0.105, 0.31]),
      ]);
    case 2: { // star gem
      const g = new ExtrudeGeometry(starShape(0.4, 0.21), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelSegments: 3, curveSegments: 1 });
      return merge([part(g, shade(L, D, 0.5), [0, -0.03, -0.05]), part(sph(0.13, 12, 8), 0xfffbe0, [0, -0.02, 0.13], [0, 0, 0], [1, 1, 0.4])]);
    }
    case 3: // potion bottle
      return merge([
        part(sph(0.31), shade(L, D, 0.31), [0, -0.1, 0]),
        part(sph(0.22, 14, 10), mix(C, 0xffffff, 0.25), [0, -0.16, 0.1], [0, 0, 0], [1, 0.7, 0.8]),
        part(new CylinderGeometry(0.1, 0.13, 0.2, 16), 0xe6fff0, [0, 0.24, 0]),
        part(new TorusGeometry(0.125, 0.035, 8, 18), 0xffffff, [0, 0.33, 0], [Math.PI / 2, 0, 0]),
        part(new CylinderGeometry(0.1, 0.085, 0.11, 12), 0xb07a45, [0, 0.4, 0]),
        part(sph(0.05, 8, 6), 0xffffff, [-0.13, 0.02, 0.26]),
        part(sph(0.03, 8, 6), 0xffffff, [0.1, -0.2, 0.27]),
      ]);
    case 4: { // paw cushion
      const pad = 0xeaf6ff;
      return merge([
        part(slab(0.5, 0.5, 0.16, 0.12, 0.13), shade(L, D, 0.4), [0, 0, -0.1]),
        part(sph(0.14, 14, 10), pad, [0, -0.1, 0.13], [0, 0, 0], [1.25, 0.95, 0.45]),
        ...[[-0.2, 0.08], [-0.07, 0.2], [0.07, 0.2], [0.2, 0.08]].map(([x, y]) => part(sph(0.065, 10, 8), pad, [x, y, 0.13], [0, 0, 0], [1, 1.15, 0.5])),
      ]);
    }
    default: { // crown
      const parts = [
        part(new CylinderGeometry(0.33, 0.28, 0.24, 24), shade(L, D, 0.12), [0, -0.16, 0]),
        part(new TorusGeometry(0.29, 0.04, 8, 24), 0xffd84a, [0, -0.27, 0], [Math.PI / 2, 0, 0]),
      ];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const x = Math.sin(a) * 0.28, z = Math.cos(a) * 0.28;
        parts.push(part(new ConeGeometry(0.1, 0.3, 10), shade(L, C, 0.15), [x, 0.1, z]));
        parts.push(part(sph(0.06, 10, 8), 0xffe066, [x, 0.27, z]));
      }
      parts.push(part(sph(0.08, 10, 8), 0xff5c8a, [0, -0.15, 0.31]), part(sph(0.03, 6, 4), 0xffffff, [-0.02, -0.12, 0.38]));
      return merge(parts);
    }
  }
}

const RAINBOW = [0xff4f8b, 0xff8a1f, 0xffcf2e, 0x3fd06a, 0x38a0ff, 0xa064ff];
export function rainbowGeometry(): BufferGeometry {
  const band = (y: number) => RAINBOW[Math.max(0, Math.min(5, Math.floor(((0.4 - y) / 0.8) * 6)))];
  return merge([
    part(sph(0.4, 28, 20), band),
    part(new TorusGeometry(0.44, 0.03, 8, 32), 0xffffff, [0, 0, 0], [1.1, 0.4, 0]),
    part(sph(0.07, 8, 6), 0xffffff, [-0.14, 0.17, 0.32]),
  ]);
}

/** A basket that a kitten piece sits in. */
export function basketGeometry(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.4, 0.3, 0.3, 20), shade(0xe0a86a, 0x9c6634, 0.15), [0, -0.27, 0]),
    part(new TorusGeometry(0.4, 0.05, 8, 24), 0xf0c080, [0, -0.12, 0], [Math.PI / 2, 0, 0]),
    part(new TorusGeometry(0.36, 0.03, 6, 24), 0x8a5a2c, [0, -0.3, 0], [Math.PI / 2, 0, 0]),
  ]);
}

// ---------- special overlays ----------

export function wandGeometry(): BufferGeometry {
  return merge([
    part(slab(0.6, 0.07, 0.03, 0.04, 0.02), 0xffffff, [0, 0, 0.36]),
    part(new ConeGeometry(0.13, 0.2, 3), 0xfff6b0, [0.46, 0, 0.38], [0, 0, -Math.PI / 2], [1, 1, 0.4]),
    part(new ConeGeometry(0.13, 0.2, 3), 0xfff6b0, [-0.46, 0, 0.38], [0, 0, Math.PI / 2], [1, 1, 0.4]),
  ]);
}

export function puffGeometry(): BufferGeometry {
  const parts = [part(new TorusGeometry(0.45, 0.05, 8, 28), 0xff7a1a)];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(part(new ConeGeometry(0.075, 0.2, 8), k % 2 ? 0xffd23f : 0xff9a2e, [Math.cos(a) * 0.53, Math.sin(a) * 0.53, 0], [0, 0, a - Math.PI / 2]));
  }
  return merge(parts);
}

export function wingsGeometry(): BufferGeometry {
  const w = (x: number, y: number, r: number, a: number, c: number) => part(sph(r, 12, 8), c, [x, y, -0.08], [0, 0, a], [1, 0.42, 0.12]);
  return merge([w(-0.36, 0.24, 0.24, 0.5, 0xd4f6ff), w(0.36, 0.24, 0.24, -0.5, 0xd4f6ff), w(-0.32, 0.0, 0.17, -0.3, 0xf0fcff), w(0.32, 0.0, 0.17, 0.3, 0xf0fcff)]);
}

// ---------- board and blockers ----------

export const tileGeometry = () => merge([part(slab(0.8, 0.8, 0.12, 0.06, 0.05), 0xffffff, [0, 0, -0.11])]);
export const baseGeometry = () => merge([part(slab(0.98, 0.98, 0.2, 0.1, 0.09), 0xffffff, [0, 0, -0.3])]);
export const dustGeometry = () => merge([
  part(slab(0.74, 0.74, 0.1, 0.02, 0.02), 0x9a9a9a, [0, 0, 0.0]),
  ...[[-0.25, 0.25, 0.17], [0.27, -0.27, 0.13], [0.28, 0.28, 0.1], [-0.28, -0.28, 0.1]].map(([x, y, r]) =>
    part(new ExtrudeGeometry(starShape(r, r * 0.42), { depth: 0.03, bevelEnabled: false }), 0xffffff, [x, y, 0.04])),
]);

export function crateGeometry(): BufferGeometry {
  const wood = shade(0xf2c184, 0xc98a4a, 0.44);
  const dark = 0x8f5a2a;
  const parts = [part(slab(0.72, 0.72, 0.08, 0.5, 0.06), wood, [0, 0, -0.06])];
  for (const y of [-0.26, 0.26]) parts.push(part(slab(0.8, 0.1, 0.03, 0.04, 0.02), dark, [0, y, 0.48]));
  for (const x of [-0.31, 0.31]) parts.push(part(slab(0.1, 0.62, 0.03, 0.04, 0.02), dark, [x, 0, 0.47]));
  parts.push(part(slab(0.1, 0.8, 0.03, 0.03, 0.02), dark, [0, 0, 0.45], [0, 0, 0.78]));
  for (const [x, y] of [[-0.31, -0.26], [0.31, -0.26], [-0.31, 0.26], [0.31, 0.26]]) parts.push(part(sph(0.04, 8, 6), 0xffe08a, [x, y, 0.55]));
  return merge(parts);
}

export function vineGeometry(): BufferGeometry {
  const parts = [part(new TorusKnotGeometry(0.24, 0.075, 64, 8, 2, 3), shade(0x6fd65a, 0x2f9a3e, 0.35), [0, 0, 0.25])];
  const leaf = (x: number, y: number, a: number) => part(sph(0.15, 10, 6), 0x8fe86a, [x, y, 0.42], [0, 0, a], [1, 0.5, 0.25]);
  parts.push(leaf(-0.3, 0.26, 0.6), leaf(0.3, -0.26, 0.6), leaf(0.28, 0.3, -0.6), leaf(-0.28, -0.28, -0.6));
  for (let k = 0; k < 5; k++) parts.push(part(sph(0.07, 8, 6), 0xff8fd0, [0.05 + Math.cos(k * 1.257) * 0.08, 0.05 + Math.sin(k * 1.257) * 0.08, 0.52], [0, 0, 0], [1, 1, 0.5]));
  parts.push(part(sph(0.05, 8, 6), 0xfff36b, [0.05, 0.05, 0.57]));
  return merge(parts);
}

export const iceGeometry = () => merge([part(slab(0.7, 0.7, 0.12, 0.62, 0.08), 0xffffff, [0, 0, -0.08])]);

export function crabGeometry(): BufferGeometry {
  const C = 0xff5a4a, D = 0xd9302a;
  const claw = (s: number) => [
    part(sph(0.1, 10, 8), C, [s * 0.3, 0.14, 0], [0, 0, 0], [1, 1.2, 0.8]),
    part(new ConeGeometry(0.05, 0.14, 6), D, [s * 0.33, 0.27, 0], [0, 0, s * -0.3]),
    part(new CylinderGeometry(0.03, 0.03, 0.14, 6), D, [s * 0.22, 0.04, 0], [0, 0, s * -0.9]),
  ];
  return merge([
    part(sph(0.2, 16, 10), shade(0xff8a6a, D, 0.2), [0, -0.04, 0], [0, 0, 0], [1.25, 0.85, 0.8]),
    ...claw(-1), ...claw(1),
    ...[-0.08, 0.08].flatMap((x) => [part(sph(0.055, 8, 6), 0xffffff, [x, 0.1, 0.1]), part(sph(0.03, 8, 6), 0x1c1c2e, [x, 0.105, 0.145])]),
    ...[-1, 1].flatMap((s) => [0, 1].map((k) => part(new CylinderGeometry(0.02, 0.02, 0.14, 5), D, [s * (0.2 + k * 0.05), -0.17, 0], [0, 0, s * (0.5 + k * 0.3)]))),
  ]);
}

/** Groomed snow: a tile cover with corduroy ridges. */
export function trailGeometry(): BufferGeometry {
  const parts = [part(slab(0.78, 0.78, 0.11, 0.02, 0.02), 0xf4fbff, [0, 0, 0.0])];
  for (let k = -3; k <= 3; k++) parts.push(part(slab(0.045, 0.62, 0.02, 0.012, 0.01), 0xb9dcf7, [k * 0.1, 0, 0.035]));
  return merge(parts);
}

export function eggGeometry(): BufferGeometry {
  const spots = (y: number, x: number) => (Math.sin(x * 19) * Math.sin(y * 17) > 0.45 ? 0xff9a4a : mix(0xffe9c9, 0xffc27a, 0.5 - y * 1.6));
  const parts = [part(sph(0.28, 24, 16), spots, [0, 0.03, 0.22], [0, 0, 0], [1, 1.25, 1])];
  parts.push(part(new TorusGeometry(0.25, 0.09, 8, 20), shade(0xd9a868, 0x9a6a34, 0.3), [0, -0.25, 0.14], [0, 0, 0], [1.15, 0.6, 1]));
  parts.push(part(new TorusGeometry(0.2, 0.05, 6, 16), 0xe8c088, [0, -0.2, 0.2], [0, 0, 0], [1.15, 0.6, 1]));
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
    part(g, shade(0xc9b8a8, 0x7a6658, 0.4), [0, 0, 0.2]),
    part(new IcosahedronGeometry(0.07, 0), 0xffd84a, [0.15, 0.1, 0.5]), part(new IcosahedronGeometry(0.05, 0), 0xffd84a, [-0.18, -0.12, 0.46]),
    part(new IcosahedronGeometry(0.04, 0), 0xffe9a0, [-0.05, 0.22, 0.44]),
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
    part(slab(0.3, 0.14, 0.05, 0.14, 0.04), shade(0xe6eefa, 0x8a98b0, 0.1), [0.15, 0.2, -0.07], [0, 0, 0.6]),
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
