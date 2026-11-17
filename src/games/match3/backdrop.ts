// One painted backdrop per world: sky, glow, layered silhouettes, props and drifting motes. Rides on the camera.
import {
  AdditiveBlending, CircleGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Shape,
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

/** Deep, saturated version of a base colour: the dramatic-sky grade. */
const deep = (h: number, k: number) => new Color(h).offsetHSL(0, 0.12, 0).multiplyScalar(k).getHex();

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
  const top = new Color(color), low = new Color(color).multiplyScalar(0.72);
  return part(new ShapeGeometry(sh), (y) => low.clone().lerp(top, Math.max(0, Math.min(1, (y - base + 0.3) / (amp + 0.3)))).getHex());
}

function prop(kind: Prop, c: number, x: number, y: number, s: number): BufferGeometry[] {
  const P = (g: BufferGeometry, col: number, px: number, py: number, rz = 0) => part(g, deep(col, 0.5), [x + px * s, y + py * s, 0], [0, 0, rz], s);
  const dark = new Color(c).multiplyScalar(0.7).getHex();
  const triG = (w: number, h: number) => { const t = new Shape(); t.moveTo(-w, 0); t.lineTo(w, 0); t.lineTo(0, h); return new ShapeGeometry(t); };
  switch (kind) {
    case 'pine': return [P(new PlaneGeometry(0.03, 0.1), 0x6a4a34, 0, 0.05), P(triG(0.1, 0.16), dark, 0, 0.07), P(triG(0.08, 0.14), c, 0, 0.15), P(triG(0.055, 0.1), c, 0, 0.23)];
    case 'tree': return [P(new PlaneGeometry(0.03, 0.14), 0x7a5a3c, 0, 0.07), P(new CircleGeometry(0.1, 16), dark, 0, 0.2), P(new CircleGeometry(0.075, 16), c, -0.02, 0.23)];
    case 'palm': return [P(new PlaneGeometry(0.025, 0.26), 0xa87a4a, 0, 0.13, -0.12), ...[-1.2, -0.5, 0.5, 1.2].map((a) => P(triG(0.035, 0.16), c, 0.03, 0.26, a)), P(new CircleGeometry(0.025, 8), 0x7a5a3c, 0.03, 0.25)];
    case 'tower': return [P(new PlaneGeometry(0.09, 0.3), 0xf6f0ff, 0, 0.15), P(triG(0.07, 0.14), c, 0, 0.3), P(new PlaneGeometry(0.025, 0.05), 0x5a4a8a, 0, 0.2), P(triG(0.008, 0.06), 0xffffff, 0, 0.44)];
    case 'cactus': return [P(new PlaneGeometry(0.045, 0.22), c, 0, 0.11), P(new CircleGeometry(0.0225, 8), c, 0, 0.22), P(new PlaneGeometry(0.03, 0.09), dark, -0.055, 0.14), P(new PlaneGeometry(0.03, 0.07), dark, 0.055, 0.11), P(new PlaneGeometry(0.06, 0.025), dark, -0.035, 0.1), P(new PlaneGeometry(0.06, 0.025), dark, 0.035, 0.08)];
    case 'crystal': return [P(triG(0.04, 0.24), c, 0, 0), P(triG(0.03, 0.16), dark, -0.045, 0, 0.3), P(triG(0.03, 0.14), dark, 0.045, 0, -0.3)];
    case 'pillar': return [P(new PlaneGeometry(0.05, 0.5), c, 0, 0.25), P(new PlaneGeometry(0.09, 0.03), 0xffd84a, 0, 0.5), P(new PlaneGeometry(0.09, 0.03), 0xffd84a, 0, 0.015), P(new CircleGeometry(0.03, 12), 0xffe9a0, 0, 0.58)];
    case 'goal': return [P(new PlaneGeometry(0.012, 0.16), c, -0.14, 0.08), P(new PlaneGeometry(0.012, 0.16), c, 0.14, 0.08), P(new PlaneGeometry(0.29, 0.012), c, 0, 0.16), ...[-0.07, 0, 0.07].map((px) => P(new PlaneGeometry(0.004, 0.16), 0xdfe8ff, px, 0.08))];
    case 'none': return [];
  }
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
    const [a, b, c] = L.sky.map((h, i) => new Color(deep(h, [0.34, 0.7, 1][i])));
    const layers: BufferGeometry[] = [part(new PlaneGeometry(12, 6, 1, 8), (y) => (y > 0 ? b.clone().lerp(a, y / 1.2) : c.clone().lerp(b, 1 + y / 1.2)).getHex())];
    L.ridges.forEach(([kind, color, base, amp], i) => {
      const parts = [ridge(kind, deep(color, 0.62 - i * 0.15), base, amp, k * 3.1 + i * 1.7)];
      if (i === 1 && L.prop !== 'none') {
        for (let n = 0; n < 9; n++) {
          const x = -2.6 + n * 0.65 + Math.sin(n * 7.3 + k) * 0.2;
          parts.push(...prop(L.prop, L.propColor, x, base + height(kind, x, k * 3.1 + 1.7) * amp - 0.02, 0.8 + (n % 3) * 0.25));
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
    this.sun.position.set(L.sun[0], L.sun[1], 0.01);
    this.sun.scale.setScalar(1.5);
    (this.sun.material as MeshBasicMaterial).color.set(L.sun[2]).multiplyScalar(0.3);
    this.shafts.forEach((m, i) => {
      m.position.set(L.sun[0], L.sun[1], 0.012);
      m.rotation.z = Math.atan2(-L.sun[1] - 0.6, -L.sun[0]) + Math.PI / 2 + (i - 1) * 0.42;
      m.scale.set(0.3 + i * 0.12, 5, 1);
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
