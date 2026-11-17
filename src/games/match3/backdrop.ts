// One painted backdrop per world: sky, glow, layered silhouettes, props and drifting motes. Rides on the camera.
import {
  AdditiveBlending, CircleGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Shape,
  ShapeGeometry, type BufferGeometry, type PerspectiveCamera, type Texture,
} from 'three';
import { merge, part } from './art';
import { reducedMotion } from './util';

type Ridge = 'hill' | 'peak' | 'mesa' | 'cloud' | 'flat' | 'spire';
type Prop = 'pine' | 'tree' | 'palm' | 'tower' | 'cactus' | 'crystal' | 'pillar' | 'goal' | 'none';
export interface WorldLook {
  sky: [number, number, number]; // top, middle, bottom
  ridges: [Ridge, number, number, number][]; // kind, colour, base height, size; far to near
  prop: Prop; propColor: number;
  mote: [number, number, number]; // colour, rise speed (negative falls), size
  sun: [number, number, number]; // x, y, colour
  tiles: [number, number]; frame: number; // board look
  ground: [number, number]; // map island: top and side
}

export const LOOKS: WorldLook[] = [
  { sky: [0x6fb7ff, 0xbfe3ff, 0xfff1c9], ridges: [['hill', 0xa5e08a, -0.15, 0.3], ['hill', 0x74cc6a, -0.4, 0.25], ['hill', 0x4fb35a, -0.68, 0.2]], prop: 'tree', propColor: 0x3f9a4c, mote: [0xffc2dc, -0.03, 0.02], sun: [0.9, 0.62, 0xfff3b0], tiles: [0x5a3f8f, 0x67499f], frame: 0xffc94a, ground: [0x86d96a, 0x9a7050] },
  { sky: [0x3b4fa8, 0x8fb2f0, 0xe6f3ff], ridges: [['spire', 0xb8cdf2, -0.1, 0.5], ['peak', 0x8fa8dc, -0.4, 0.4], ['hill', 0xf2f8ff, -0.72, 0.16]], prop: 'crystal', propColor: 0xbfe8ff, mote: [0xffffff, -0.06, 0.016], sun: [-0.9, 0.6, 0xdfeaff], tiles: [0x2d4a8a, 0x375799], frame: 0xbfe8ff, ground: [0xeaf4ff, 0x8fa8dc] },
  { sky: [0x2f7a6a, 0x8fd9a0, 0xf6ffc9], ridges: [['hill', 0x5fb87a, -0.1, 0.4], ['spire', 0x3f9a62, -0.38, 0.3], ['hill', 0x2a7a4c, -0.7, 0.2]], prop: 'tree', propColor: 0x1f6a3c, mote: [0xf6ff8a, 0.03, 0.018], sun: [0.7, 0.55, 0xfff7b0], tiles: [0x1f5a48, 0x276a55], frame: 0xff9a5a, ground: [0x6fcf6a, 0x7a5a3c] },
  { sky: [0x29a8e0, 0x8fe0f5, 0xfff0c0], ridges: [['flat', 0x4fc0e8, -0.3, 0.3], ['flat', 0x2fa3d6, -0.5, 0.4], ['hill', 0xf7dfa0, -0.72, 0.14]], prop: 'palm', propColor: 0x2f9a5a, mote: [0xffffff, 0.04, 0.02], sun: [0.6, 0.5, 0xfff0a0], tiles: [0x147a9a, 0x1a8aac], frame: 0xffe08a, ground: [0xf7dfa0, 0xd9b870] },
  { sky: [0x4a86e8, 0xa8ccff, 0xffffff], ridges: [['peak', 0xdbe8ff, 0.0, 0.7], ['peak', 0xb9d0f5, -0.35, 0.5], ['hill', 0xffffff, -0.7, 0.18]], prop: 'pine', propColor: 0x2f6a5a, mote: [0xffffff, -0.08, 0.02], sun: [-0.7, 0.62, 0xffffff], tiles: [0x2f5aa8, 0x3a68ba], frame: 0xff6a8a, ground: [0xffffff, 0xb9d0f5] },
  { sky: [0x3a1238, 0xa83a3a, 0xffb05a], ridges: [['peak', 0x6a2438, 0.05, 0.75], ['mesa', 0x4a1a30, -0.35, 0.4], ['hill', 0x2e1024, -0.7, 0.2]], prop: 'crystal', propColor: 0xff7a2e, mote: [0xff9a3a, 0.09, 0.016], sun: [0.0, 0.05, 0xff8a2e], tiles: [0x4a1a30, 0x5a2238], frame: 0xff9a2e, ground: [0x5a3a44, 0x2e1a24] },
  { sky: [0x3f8fd9, 0xffc38a, 0xffe9c0], ridges: [['mesa', 0xe89a5a, 0.0, 0.6], ['mesa', 0xc9703a, -0.35, 0.45], ['hill', 0xa8552c, -0.72, 0.16]], prop: 'cactus', propColor: 0x3f9a5a, mote: [0xffe0a0, 0.02, 0.014], sun: [0.8, 0.4, 0xfff0b0], tiles: [0x7a3f24, 0x8a4a2c], frame: 0xffd84a, ground: [0xe8a86a, 0xa8552c] },
  { sky: [0x1a1448, 0x5a2a8a, 0xc86ad0], ridges: [['cloud', 0x4a2a8a, 0.1, 0.3], ['flat', 0x35206a, -0.45, 0.2], ['flat', 0x24164e, -0.72, 0.1]], prop: 'pillar', propColor: 0xf2d9ff, mote: [0xffe6a0, 0.02, 0.022], sun: [0.0, 0.7, 0xffd0f5], tiles: [0x35206a, 0x432a80], frame: 0xffd84a, ground: [0x6a3fa8, 0x35206a] },
  { sky: [0x2f9ae0, 0x9fdcff, 0xe6ffd0], ridges: [['flat', 0x7a8aa8, -0.05, 0.6], ['flat', 0x58c46a, -0.5, 0.2], ['flat', 0x3fae58, -0.72, 0.1]], prop: 'goal', propColor: 0xffffff, mote: [0xffe066, -0.05, 0.02], sun: [0.85, 0.65, 0xffffff], tiles: [0x1f7a3f, 0x278a48], frame: 0xffffff, ground: [0x58c46a, 0x3a7a48] },
  { sky: [0x5aa0ff, 0xb9d9ff, 0xffe6f5], ridges: [['cloud', 0xffffff, 0.0, 0.4], ['cloud', 0xf0f6ff, -0.35, 0.4], ['cloud', 0xffffff, -0.68, 0.3]], prop: 'tower', propColor: 0xffc2e0, mote: [0xffffff, 0.03, 0.022], sun: [0.75, 0.6, 0xfff7c0], tiles: [0x4a7ad9, 0x5788e6], frame: 0xffd0ec, ground: [0xffffff, 0xcfe0ff] },
  { sky: [0x0c1640, 0x1f4a7a, 0x3fa890], ridges: [['peak', 0x1c3a66, 0.0, 0.5], ['hill', 0x163054, -0.4, 0.3], ['flat', 0x1f5a70, -0.7, 0.1]], prop: 'pine', propColor: 0x0f2440, mote: [0x9affd0, 0.03, 0.02], sun: [-0.3, 0.55, 0x7affc0], tiles: [0x123a5a, 0x18486c], frame: 0x7affd0, ground: [0x2f8a7a, 0x163054] },
  { sky: [0x241050, 0x7a3fb0, 0xffb0a0], ridges: [['peak', 0x8a6ac8, 0.1, 0.8], ['spire', 0x5a3f9a, -0.3, 0.45], ['hill', 0x3a2670, -0.7, 0.2]], prop: 'tower', propColor: 0xffd84a, mote: [0xffe9a0, 0.03, 0.022], sun: [0.0, 0.3, 0xffd0a0], tiles: [0x3a2670, 0x483088], frame: 0xffd84a, ground: [0xb89af0, 0x5a3f9a] },
];

const _c = new Color(), _hsl = { h: 0, s: 0, l: 0 };
/**
 * The dusk grade: keeps a colour's hue, lifts its saturation to at least `sMin` and sets its lightness (sRGB) to `l`.
 * Greys and whites (snow, cloud, stone) take the hue `hue` and stay a little paler.
 */
function grade(c: number, l: number, hue: number, sMin = 0.55): number {
  _c.set(c).getHSL(_hsl, SRGBColorSpace);
  const grey = _hsl.s < 0.15 || _hsl.l > 0.93;
  return _c.setHSL(grey ? hue : _hsl.h, grey ? 0.4 : Math.max(_hsl.s, sMin), grey ? Math.min(0.8, l * 1.6) : l, SRGBColorSpace).getHex();
}
const blend = (a: number, b: number, k: number) => new Color(a).lerp(new Color(b), k).getHex();
const hueOf = (c: number) => _c.set(c).getHSL(_hsl, SRGBColorSpace).h;

const tri = (x: number) => Math.abs((((x % 2) + 2) % 2) - 1);
function height(kind: Ridge, x: number, s: number): number {
  const hill = Math.sin(x * 2.1 + s) * 0.5 + Math.sin(x * 4.7 + s * 2) * 0.25 + 0.5;
  switch (kind) {
    case 'hill': return hill;
    case 'peak': return tri(x * 1.3 + s) * 0.7 + tri(x * 3.7 + s * 3) * 0.3;
    case 'mesa': return Math.round(hill * 3) / 3 + Math.sin(x * 40) * 0.01;
    case 'cloud': return Math.abs(Math.sin(x * 4.2 + s)) * 0.5 + Math.abs(Math.sin(x * 1.9 + s * 2)) * 0.5;
    case 'flat': return Math.sin(x * 9 + s) * 0.04 + 0.5;
    case 'spire': return hill * 0.6 + (Math.sin(x * 7 + s) > 0.9 ? 0.9 : Math.sin(x * 7 + s) > 0.8 ? 0.55 : 0);
  }
}

function ridge(kind: Ridge, color: number, base: number, amp: number, s: number): BufferGeometry {
  const sh = new Shape();
  sh.moveTo(-4, -2);
  for (let k = 0; k <= 160; k++) { const x = -4 + k * 0.05; sh.lineTo(x, base + height(kind, x, s) * amp); }
  sh.lineTo(4, -2);
  const top = new Color(color), low = new Color(color).multiplyScalar(0.45);
  return part(new ShapeGeometry(sh), (y) => low.clone().lerp(top, Math.max(0, Math.min(1, (y - base + 0.3) / (amp + 0.3)))).getHex());
}

/** Lit window / crystal light: stays bright against the dark silhouettes. */
const LIT = 0xffd98a;
/** Silhouette props standing on a ridge: `c` body colour, `hi` its lit edge. */
function prop(kind: Prop, c: number, hi: number, x: number, y: number, s: number): BufferGeometry[] {
  const P = (g: BufferGeometry, col: number, px: number, py: number, rz = 0) => part(g, col, [x + px * s, y + py * s, 0], [0, 0, rz], s);
  const triG = (w: number, h: number, lean = 0) => { const t = new Shape(); t.moveTo(-w, 0); t.lineTo(w, 0); t.lineTo(lean, h); return new ShapeGeometry(t); };
  const spire = (px: number, w: number, h: number, roof: number) => [P(new PlaneGeometry(w, h), c, px, h / 2), P(new PlaneGeometry(w * 0.3, h), hi, px - w * 0.35, h / 2), P(triG(w * 0.8, roof), c, px, h), P(new PlaneGeometry(w * 0.22, w * 0.5), LIT, px, h * 0.7)];
  switch (kind) {
    case 'pine': return [P(triG(0.085, 0.2), c, 0, 0), P(triG(0.065, 0.2), c, 0, 0.1), P(triG(0.04, 0.16), c, 0, 0.22), P(triG(0.02, 0.2, -0.02), hi, -0.045, 0.1)];
    case 'tree': return [P(new PlaneGeometry(0.016, 0.08), c, 0, 0.04), P(triG(0.05, 0.42), c, 0, 0.05), P(triG(0.035, 0.26), c, 0.07, 0.03), P(triG(0.014, 0.36, -0.012), hi, -0.03, 0.06)];
    case 'palm': return [P(new PlaneGeometry(0.02, 0.3), c, 0, 0.15, -0.14), ...[-1.9, -1.2, -0.5, 0.5, 1.2, 1.9].map((a) => P(triG(0.022, 0.19), a < 0 ? hi : c, 0.04, 0.3, a))];
    case 'tower': return [...spire(0, 0.07, 0.34, 0.2), ...spire(0.085, 0.045, 0.2, 0.14), ...spire(-0.08, 0.04, 0.15, 0.12)];
    case 'cactus': return [P(new PlaneGeometry(0.04, 0.24), c, 0, 0.12), P(triG(0.02, 0.05), c, 0, 0.24), P(new PlaneGeometry(0.026, 0.1), c, -0.055, 0.15), P(new PlaneGeometry(0.026, 0.08), c, 0.055, 0.12), P(new PlaneGeometry(0.06, 0.022), c, -0.035, 0.1), P(new PlaneGeometry(0.06, 0.022), c, 0.035, 0.08), P(new PlaneGeometry(0.01, 0.22), hi, -0.014, 0.12)];
    case 'crystal': return [P(triG(0.04, 0.3), c, 0, 0), P(triG(0.03, 0.18), c, -0.045, 0, 0.35), P(triG(0.03, 0.16), c, 0.045, 0, -0.35), P(triG(0.012, 0.26, -0.008), LIT, -0.012, 0.01)];
    case 'pillar': return [P(new PlaneGeometry(0.045, 0.5), c, 0, 0.25), P(new PlaneGeometry(0.012, 0.5), hi, -0.014, 0.25), P(new PlaneGeometry(0.085, 0.025), c, 0, 0.5), P(new PlaneGeometry(0.085, 0.025), c, 0, 0.012), P(triG(0.022, 0.07), LIT, 0, 0.535), P(triG(0.022, -0.05), LIT, 0, 0.535)];
    case 'goal': return [P(new PlaneGeometry(0.03, 0.36), c, -0.16, 0.18), P(new PlaneGeometry(0.03, 0.36), c, 0.16, 0.18), P(triG(0.2, 0.09), c, 0, 0.36), P(new PlaneGeometry(0.29, 0.02), hi, 0, 0.36), P(triG(0.03, 0.08), LIT, 0, 0.2), P(triG(0.03, -0.08), LIT, 0, 0.2)];
    case 'none': return [];
  }
}

/** A towering anime cumulus: a stack of discs in shadow colour, with the lit side laid over it toward the sun. */
function cloud(x: number, y: number, s: number, seed: number, lit: number, shadow: number, side: number): BufferGeometry[] {
  const discs: [number, number, number][] = [];
  for (let k = 0; k < 9; k++) {
    const u = k / 8 - 0.5, tower = Math.exp(-u * u * 7);
    const r = (0.07 + 0.06 * Math.abs(Math.sin(seed * 3.3 + k * 2.1))) * (0.6 + tower * 0.7);
    discs.push([u * 0.62, tower * (0.16 + 0.1 * Math.sin(seed + k)), r]);
    if (k % 2) discs.push([u * 0.5, tower * 0.34 + 0.02, r * 0.8]);
  }
  const disc = (c: number, dx: number, dy: number, k: number, z: number) => discs.map(([cx, cy, r]) => part(new CircleGeometry(r * k * s, 14), c, [x + (cx + dx) * s, y + (cy + dy) * s, z]));
  return [...disc(shadow, 0, 0, 1, 0.004), ...disc(lit, side * 0.03, 0.035, 0.82, 0.008)];
}

const MOTES = 48;

export class Backdrop {
  readonly group = new Group();
  world = -1;
  private mat = new MeshBasicMaterial({ vertexColors: true, fog: false });
  private meshes: Mesh[] = [];
  private sun: Mesh;
  private motes: InstancedMesh;
  private shafts: Mesh[] = [];
  private m = new Matrix4();
  private look = LOOKS[0];
  hi = true;

  constructor(private cam: PerspectiveCamera, glow: Texture, private dist: number) {
    this.sun = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: glow, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
    this.motes = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: glow, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }), MOTES);
    this.motes.frustumCulled = false;
    this.group.add(this.sun, this.motes);
    for (let k = 0; k < 3; k++) { // light shafts through the sun (High only)
      const m = new Mesh(this.sun.geometry, (this.sun.material as MeshBasicMaterial).clone());
      this.shafts.push(m);
      this.group.add(m);
    }
    cam.add(this.group);
  }

  setWorld(k: number): void {
    if (k === this.world) return;
    this.world = k;
    const L = (this.look = LOOKS[k]);
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    const hue = hueOf(L.sky[0]);
    // dramatic dusk sky: near-black zenith, rich mid band, burning horizon in the sun's colour
    const top = new Color(grade(L.sky[0], 0.1, hue, 0.7)), mid = new Color(grade(L.sky[1], 0.36, hue, 0.6)), low = new Color(grade(blend(L.sky[2], L.sun[2], 0.5), 0.7, hue, 0.75));
    const sky = (y: number) => (y > 0.1 ? mid.clone().lerp(top, Math.min(1, (y - 0.1) / 0.5)) : low.clone().lerp(mid, Math.max(0, Math.min(1, (y + 0.45) / 0.55)))).getHex();
    const back: BufferGeometry[] = [part(new PlaneGeometry(12, 6, 1, 48), sky)];
    for (let n = 0; n < 60; n++) { // stars in the dark upper sky
      const x = ((n * 0.6180339) % 1) * 3.6 - 1.8, y = 0.12 + ((n * 0.7548776) % 1) * 0.55, r = 0.003 + (n % 5) * 0.001;
      back.push(part(new CircleGeometry(r, 4), blend(0xffffff, low.getHex(), (n % 3) * 0.25), [x, y, 0.002]));
    }
    const side = L.sun[0] >= 0 ? 1 : -1;
    const cl = blend(low.getHex(), mid.getHex(), 0.25), cs = blend(cl, mid.getHex(), 0.6);
    [[-1.25, 1.0, 0.3], [-0.2, 0.75, 1.9], [0.85, 1.15, 4.1], [1.75, 0.8, 5.6]].forEach(([x, s, seed]) => back.push(...cloud(x + Math.sin(k * 1.7) * 0.2, L.ridges[0][2] + L.ridges[0][3] * 0.35, s, seed + k, cl, cs, side)));
    const layers: BufferGeometry[] = [merge(back)];
    L.ridges.forEach(([kind, color, base, amp], i) => {
      // far ridges sink into the horizon haze; near ones are dark silhouettes
      const rc = blend(grade(color, [0.3, 0.19, 0.1][i], hue), low.getHex(), [0.3, 0.1, 0][i]);
      const parts = [ridge(kind, rc, base, amp, k * 3.1 + i * 1.7)];
      if (i === 1 && L.prop !== 'none') {
        const pc = grade(L.propColor, 0.12, hue), ph = blend(pc, low.getHex(), 0.45);
        for (let n = 0; n < 9; n++) {
          const x = -2.6 + n * 0.65 + Math.sin(n * 7.3 + k) * 0.2;
          parts.push(...prop(L.prop, pc, ph, x, base + height(kind, x, k * 3.1 + 1.7) * amp - 0.02, 0.8 + (n % 3) * 0.25));
        }
      }
      layers.push(merge(parts));
    });
    layers.forEach((g, i) => {
      const m = new Mesh(g, this.mat);
      m.position.z = i * 0.02;
      m.frustumCulled = false;
      this.meshes.push(m);
      this.group.add(m);
    });
    // the sun sits low, behind the far ridge
    const sx = L.sun[0] * 0.75, sy = L.ridges[0][2] + L.ridges[0][3] * 0.5;
    this.sun.position.set(sx, sy, 0.01);
    this.sun.scale.setScalar(1.0);
    (this.sun.material as MeshBasicMaterial).color.set(L.sun[2]).multiplyScalar(0.3);
    this.shafts.forEach((m, i) => {
      m.position.set(sx, sy, 0.012);
      m.rotation.z = (sx > 0 ? 1 : -1) * (0.55 + i * 0.4);
      m.scale.set(0.22 + i * 0.1, 5, 1);
      (m.material as MeshBasicMaterial).color.set(L.sun[2]).multiplyScalar(0.1);
    });
    (this.motes.material as MeshBasicMaterial).color.set(L.mote[0]).multiplyScalar(1.1);
  }

  update(t: number): void {
    // cover the view at `dist`, with room for the picture shift of centerIn
    const s = this.dist * Math.tan((this.cam.fov * Math.PI) / 360) * 1.75;
    this.group.position.set(0, 0, -this.dist);
    this.group.scale.set(s, s, s);
    for (const m of this.shafts) m.visible = this.hi;
    const n = this.hi ? MOTES : 0;
    const [, vy, size] = this.look.mote;
    const still = reducedMotion();
    for (let i = 0; i < n; i++) {
      const tt = still ? 0 : t;
      const x = ((i * 0.6180339 * 5.2 + Math.sin(tt * 0.3 + i) * 0.08) % 5.2) - 2.6;
      const y = ((((i * 0.37 + tt * vy * (0.6 + (i % 5) * 0.2)) % 2.2) + 2.2) % 2.2) - 1.1;
      const k = size * (0.6 + (i % 4) * 0.3) * (0.7 + 0.3 * Math.sin(tt * 2 + i * 1.3));
      this.m.makeScale(k, k, k).setPosition(x, y, 0.1);
      this.motes.setMatrixAt(i, this.m);
    }
    this.motes.count = n;
    this.motes.instanceMatrix.needsUpdate = true;
  }
}
