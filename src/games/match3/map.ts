// The level map, drawn as a mage's star chart: one dark floating island per world, a path of 20 glowing rune stones
// joined by light motes, landmarks and a cat mage marker.
// The level buttons are HTML (game.ts) placed over the stones with `screenOf`.
import {
  AdditiveBlending, Color, ConeGeometry, CylinderGeometry, DirectionalLight, ExtrudeGeometry, HemisphereLight, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector3, type BufferGeometry,
} from 'three';
import { glowTexture, hull, inkMaterial, merge, part, ringTexture, rrect, toon, type V3 } from './art';
import { Backdrop, LOOKS } from './backdrop';
import { CATS, catGeometry } from './cats';
import { PER_WORLD } from './levels';
import { centerIn, fitDistance, reducedMotion, type Rect } from './util';

const SX = 2.7, SZ = 2.5, TILT = 0.92;
const cyl = (rt: number, rb: number, h: number, s = 14) => new CylinderGeometry(rt, rb, h, s);
const sph = (r: number) => new SphereGeometry(r, 14, 10);

function landmark(kind: string, c: number, p: V3, s: number): BufferGeometry[] {
  const at = (x: number, y: number, z: number): V3 => [p[0] + x * s, p[1] + y * s, p[2] + z * s];
  const dark = new Color(c).multiplyScalar(0.75).getHex();
  switch (kind) {
    case 'pine': return [part(cyl(0.08, 0.1, 0.4, 8), 0x7a5a3c, at(0, 0.2, 0), [0, 0, 0], s), part(new ConeGeometry(0.5, 0.8, 10), dark, at(0, 0.7, 0), [0, 0, 0], s), part(new ConeGeometry(0.38, 0.7, 10), c, at(0, 1.15, 0), [0, 0, 0], s), part(new ConeGeometry(0.2, 0.3, 10), 0xffffff, at(0, 1.4, 0), [0, 0, 0], s)];
    case 'tree': return [part(cyl(0.09, 0.12, 0.6, 8), 0x8a5a3a, at(0, 0.3, 0), [0, 0, 0], s), part(sph(0.5), (y) => (y > 0.1 ? 0x7fdc6a : c), at(0, 0.95, 0), [0, 0, 0], s), part(sph(0.3), 0x8fe87a, at(0.3, 0.75, 0.15), [0, 0, 0], s)];
    case 'palm': return [part(cyl(0.07, 0.1, 1.3, 8), 0xb8894a, at(0.08, 0.65, 0), [0, 0, -0.12], s), ...[0, 1, 2, 3, 4].map((k) => part(sph(0.4), c, at(0.16 + Math.cos(k * 1.257) * 0.35, 1.3, Math.sin(k * 1.257) * 0.35), [0, -k * 1.257, -0.3], [s, 0.12 * s, 0.4 * s])), part(sph(0.1), 0x7a5a3c, at(0.16, 1.22, 0.05), [0, 0, 0], s)];
    case 'tower': return [part(cyl(0.3, 0.36, 1.3, 12), 0xf6f0ff, at(0, 0.65, 0), [0, 0, 0], s), part(new ConeGeometry(0.45, 0.7, 12), c, at(0, 1.65, 0), [0, 0, 0], s), part(sph(0.07), 0xffe066, at(0, 2.05, 0), [0, 0, 0], s)];
    case 'cactus': return [part(cyl(0.16, 0.18, 1.0, 10), c, at(0, 0.5, 0), [0, 0, 0], s), part(sph(0.16), c, at(0, 1.0, 0), [0, 0, 0], s), part(cyl(0.09, 0.09, 0.4, 8), dark, at(-0.3, 0.75, 0), [0, 0, 0], s), part(cyl(0.09, 0.09, 0.3, 8), dark, at(-0.2, 0.55, 0), [0, 0, Math.PI / 2], s), part(sph(0.07), 0xff8fc0, at(0, 1.18, 0), [0, 0, 0], s)];
    case 'crystal': return [part(new ConeGeometry(0.22, 1.1, 5), c, at(0, 0.55, 0), [0, 0, 0], s), part(new ConeGeometry(0.15, 0.7, 5), dark, at(-0.25, 0.3, 0.1), [0, 0, 0.4], s), part(new ConeGeometry(0.13, 0.6, 5), 0xffffff, at(0.24, 0.27, -0.05), [0, 0, -0.4], s)];
    case 'pillar': return [part(cyl(0.14, 0.14, 1.4, 12), c, at(0, 0.7, 0), [0, 0, 0], s), part(cyl(0.24, 0.24, 0.1, 12), 0xffd84a, at(0, 0.05, 0), [0, 0, 0], s), part(cyl(0.24, 0.24, 0.1, 12), 0xffd84a, at(0, 1.4, 0), [0, 0, 0], s), part(sph(0.17), 0xffe9a0, at(0, 1.62, 0), [0, 0, 0], s)];
    case 'goal': return [part(cyl(0.04, 0.04, 0.8, 6), c, at(-0.6, 0.4, 0), [0, 0, 0], s), part(cyl(0.04, 0.04, 0.8, 6), c, at(0.6, 0.4, 0), [0, 0, 0], s), part(cyl(0.04, 0.04, 1.25, 6), c, at(0, 0.8, 0), [0, 0, Math.PI / 2], s), part(new IcosahedronGeometry(0.16, 1), (y) => (Math.sin(y * 40) > 0.3 ? 0x2c2c3a : 0xffffff), at(0.2, 0.16, 0.4), [0, 0, 0], s)];
    default: return [];
  }
}

export class MapView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(34, 1, 0.5, 900);
  private glow = glowTexture();
  private backdrop = new Backdrop(this.camera, this.glow, 600);
  private land: Mesh | null = null;
  private stones = new InstancedMesh(cyl(0.74, 0.88, 0.26, 6), toon({ vertexColors: false }), PER_WORLD);
  /** Glow ring lying on each open rune stone. */
  private runes = new InstancedMesh(new PlaneGeometry(1.85, 1.85).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending }), PER_WORLD);
  private dotsMesh = new InstancedMesh(new OctahedronGeometry(0.13), new MeshBasicMaterial({ toneMapped: false }), PER_WORLD * 4);
  private marker = new Mesh(undefined, toon());
  private landInk = new Mesh(undefined, inkMaterial());
  private markerInk = new Mesh(undefined, inkMaterial());
  private halo = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  private flag = new Mesh(new PlaneGeometry(0.9, 0.5, 6, 1), new MeshBasicMaterial({ color: 0xff5c8a, side: 2 }));
  private pos: Vector3[] = [];
  private cols = 5;
  private world = -1;
  private current = -1;
  private region: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private W = 1;
  private H = 1;
  private v = new Vector3();
  private m = new Matrix4();
  private col = new Color();
  private state: number[] = [];

  constructor() {
    this.scene.add(new HemisphereLight(0xffffff, 0x8a7ab0, 1.0));
    const sun = new DirectionalLight(0xfff4e0, 1.5);
    sun.position.set(-5, 10, 6);
    this.halo.rotation.x = -Math.PI / 2;
    (this.halo.material as MeshBasicMaterial).color.setRGB(2.4, 1.6, 0.8);
    this.marker.add(this.markerInk);
    this.scene.add(sun, this.camera, this.stones, this.runes, this.dotsMesh, this.marker, this.halo, this.flag);
  }

  /** Low: no ink outlines. */
  setQuality(hi: boolean): void { this.backdrop.hi = this.landInk.visible = this.markerInk.visible = hi; }

  /** `state[k]`: -1 locked, 0 open, 1..3 stars, for the 20 levels of `world`. `current` = index to mark, or -1. */
  setWorld(world: number, state: number[], current: number): void {
    this.state = state;
    this.current = current;
    if (world !== this.world) { this.world = world; this.backdrop.setWorld(world); this.build(); } else this.paint();
  }

  private build(): void {
    const look = LOOKS[this.world];
    const cols = this.cols, rows = PER_WORLD / cols;
    this.pos = [];
    for (let i = 0; i < PER_WORLD; i++) {
      const row = Math.floor(i / cols);
      const c = row % 2 ? cols - 1 - (i % cols) : i % cols;
      this.pos.push(new Vector3((c - (cols - 1) / 2) * SX + Math.sin(row * 2.1 + c * 1.3) * 0.35, 0, ((rows - 1) / 2 - row) * SZ + Math.sin(i * 1.9) * 0.4));
    }
    if (this.land) { this.scene.remove(this.land); this.land.geometry.dispose(); }
    const w = cols * SX + 2.6, d = rows * SZ + 2.6;
    const slab = (dw: number, depth: number, y: number, color: number) => {
      const g = new ExtrudeGeometry(rrect(w + dw, d + dw, 2.6), { depth, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 3, curveSegments: 10 });
      g.rotateX(Math.PI / 2);
      return part(g, color, [0, y, 0]);
    };
    // night ground: the world's own hue, pulled deep toward indigo so the rune stones carry the light
    const night = (c: number, to: number, k: number) => this.col.set(c).lerp(new Color(to), k).getHex();
    const P: BufferGeometry[] = [slab(0, 0.5, -0.3, night(look.ground[0], 0x1a2048, 0.62)), slab(-0.8, 1.6, -1.1, night(look.ground[1], 0x0a0c1e, 0.72))];
    // landmarks between the rows and round the rim
    let seed = this.world * 97 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      if (rnd() < 0.3) continue;
      P.push(...landmark(look.prop, look.propColor, [(c - (cols - 2) / 2) * SX + (rnd() - 0.5) * 0.8, -0.1, ((rows - 2) / 2 - r) * SZ + (rnd() - 0.5) * 0.3], 0.55 + rnd() * 0.35));
    }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + 0.2;
      P.push(...landmark(k % 3 ? look.prop : 'tree', k % 3 ? look.propColor : 0x4fb35a, [Math.cos(a) * (w / 2 - 0.2) * (0.94 + rnd() * 0.05), -0.1, Math.sin(a) * (d / 2 - 0.2) * (0.94 + rnd() * 0.05)], 0.6 + rnd() * 0.4));
    }
    // gate at the end of the path
    const end = this.pos[PER_WORLD - 1];
    P.push(...landmark('tower', look.frame, [end.x, -0.1, end.z - 1.1], 0.9));
    this.land = new Mesh(merge(P), toon());
    this.landInk.geometry.dispose();
    this.landInk.geometry = hull(this.land.geometry, 0.035);
    this.land.add(this.landInk);
    this.scene.add(this.land);
    this.flag.position.set(end.x + 0.45, 2.2, end.z - 1.1);
    (this.flag.material as MeshBasicMaterial).color.set(look.frame);
    // light motes floating along the path (coloured in paint)
    let n = 0;
    for (let i = 0; i + 1 < PER_WORLD; i++) for (let k = 1; k <= 3; k++) {
      this.v.lerpVectors(this.pos[i], this.pos[i + 1], k / 4);
      this.m.makeScale(1, 1.7, 1).setPosition(this.v.x, 0.3, this.v.z);
      this.dotsMesh.setMatrixAt(n++, this.m);
    }
    this.dotsMesh.count = n;
    this.dotsMesh.instanceMatrix.needsUpdate = true;
    this.marker.geometry.dispose();
    this.markerInk.geometry.dispose();
    this.marker.geometry = catGeometry(CATS[this.world * 4], null, 'sit');
    this.markerInk.geometry = hull(this.marker.geometry, 0.02);
    this.paint();
    this.fit();
  }

  private paint(): void {
    this.pos.forEach((p, i) => {
      const s = this.state[i] ?? -1;
      this.m.makeTranslation(p.x, 0, p.z);
      this.stones.setMatrixAt(i, this.m);
      this.stones.setColorAt(i, this.col.set(s < 0 ? 0x2a2d44 : s === 0 ? 0x3d5fc0 : s === 3 ? 0xd9a93a : 0x9a7a3c));
      // rune glow: none while sealed, mana blue when open, gold once won (values over 1 feed the bloom on High)
      this.m.makeScale(s < 0 ? 0 : 1, 1, s < 0 ? 0 : 1).setPosition(p.x, 0.15, p.z);
      this.runes.setMatrixAt(i, this.m);
      this.runes.setColorAt(i, s > 0 ? this.col.setRGB(0.95, 0.68, 0.26) : this.col.setRGB(0.35, 0.75, 1.4));
      // the three motes leading to stone i + 1 light up when that stone is open
      const lit = (this.state[i + 1] ?? -1) >= 0;
      if (i + 1 < PER_WORLD) for (let k = 0; k < 3; k++) this.dotsMesh.setColorAt(i * 3 + k, lit ? this.col.setRGB(0.7, 1.25, 1.9) : this.col.setRGB(0.2, 0.22, 0.38));
    });
    for (const im of [this.stones, this.runes, this.dotsMesh]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.marker.visible = this.halo.visible = this.current >= 0;
  }

  setRegion(r: Rect, W: number, H: number): void {
    this.region = r;
    this.W = W;
    this.H = H;
    const cols = r.w / r.h > 1.15 ? 5 : 4;
    if (cols !== this.cols) { this.cols = cols; if (this.world >= 0) this.build(); }
    this.fit();
  }

  private fit(): void {
    const rows = PER_WORLD / this.cols;
    centerIn(this.camera, this.region, this.W, this.H);
    const d = fitDistance(this.camera, this.cols * SX + 1.2, rows * SZ * Math.sin(TILT) + 3.2, this.region, this.W, this.H);
    this.camera.position.set(0, Math.sin(TILT) * d, Math.cos(TILT) * d);
    this.camera.lookAt(0, 0.4, 0);
    this.camera.updateMatrixWorld();
  }

  /** Screen position (CSS px) of level stone `i` (0..19). */
  screenOf(i: number): [number, number] {
    this.v.copy(this.pos[i]).setY(0.3).project(this.camera);
    return [((this.v.x + 1) / 2) * this.W, ((1 - this.v.y) / 2) * this.H];
  }

  update(t: number): void {
    this.backdrop.update(t);
    const still = reducedMotion();
    if (this.current >= 0) {
      const p = this.pos[this.current];
      this.marker.position.set(p.x, 0.15 + (still ? 0 : Math.abs(Math.sin(t * 3)) * 0.15), p.z - 1.0);
      this.marker.rotation.y = still ? 0 : Math.sin(t * 1.5) * 0.3;
      this.marker.scale.setScalar(1.35);
      this.halo.position.set(p.x, 0.14, p.z);
      this.halo.scale.setScalar(2.3 + (still ? 0 : Math.sin(t * 4) * 0.25));
    }
    const g = this.flag.geometry.attributes.position;
    for (let i = 0; i < g.count; i++) g.setZ(i, still ? 0 : Math.sin(g.getX(i) * 5 - t * 6) * 0.07 * (g.getX(i) + 0.45));
    g.needsUpdate = true;
  }
}
