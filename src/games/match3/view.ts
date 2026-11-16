// Board renderer: glossy instanced pieces, blockers, motion and effects. Animates Steps from board.ts.
import {
  AdditiveBlending, Color, DirectionalLight, Euler, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Plane, PlaneGeometry, Quaternion, Raycaster, Scene, Vector2, Vector3, type BufferGeometry, type Material,
  type Texture,
} from 'three';
import type { Cell, Fx, Kind, Step } from './board';
import {
  PIECE_COLORS, baseGeometry, basketGeometry, crabGeometry, crateGeometry, cursorGeometry, dustGeometry, eggGeometry, gloss,
  glowTexture, hammerGeometry, iceGeometry, pieceGeometry, puffGeometry, rainbowGeometry, ringTexture, rockGeometry,
  sparkleTexture, tileGeometry, trailGeometry, vineGeometry, wandGeometry, wingsGeometry,
} from './art';
import { Backdrop, LOOKS } from './backdrop';
import { CATS, catGeometry } from './cats';
import { centerIn, fitDistance, reducedMotion, type Rect } from './util';

interface Sprite {
  id: number; color: number; kind: Kind;
  fx: number; fy: number; tx: number; ty: number; t0: number; dur: number; fall: boolean;
  born: number; dying: number; land: number;
}
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; r: number; g: number; b: number; star: boolean; grav: number }
interface Flash { mesh: Mesh; t0: number; dur: number; kind: 'beam' | 'ring' | 'glow' | 'ray' | 'fly'; data: number[] }

const STEP_TIME: Record<Step['type'], number> = { swap: 0.2, bad: 0.2, clear: 0.26, fall: 0, spread: 0.32, shuffle: 0.5, convert: 0.4 };
const CAP = 128;
const Z = 0.42; // piece centre above the tiles
const FIRE = [0xff5a1f, 0xff9a2e, 0xffd23f, 0xfff3b0];
/** What happened on the board, for sound. */
export type BoardEvent = 'crate' | 'vine' | 'grow' | 'ice' | 'dust' | 'egg' | 'rock' | 'trail' | 'land';

function inst(g: BufferGeometry, m: Material, n = CAP): InstancedMesh {
  const mesh = new InstancedMesh(g, m, n);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}
const basic = (map: Texture, add = true) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: add ? AdditiveBlending : undefined, toneMapped: false });

export class BoardView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.1, 200);
  readonly root = new Group();
  w = 0;
  h = 0;
  cells: Cell[] = [];
  cursor: { x: number; y: number } | null = null;
  selected = -1;
  hint: [number, number] | null = null;
  hammer = false;
  onEvent: (e: BoardEvent) => void = () => {};

  private glow = glowTexture();
  private sparkle = sparkleTexture();
  private ringTex = ringTexture();
  private quad = new PlaneGeometry(1, 1);
  private backdrop = new Backdrop(this.camera, this.glow, 120);
  private sprites = new Map<number, Sprite>();
  private pieces = PIECE_COLORS.map((_, c) => inst(pieceGeometry(c), gloss()));
  private rainbow = inst(rainbowGeometry(), gloss({ roughness: 0.15, emissive: 0x332244 }), 32);
  private basket = inst(basketGeometry(), gloss({ roughness: 0.6 }), 16);
  private kitten = inst(catGeometry(CATS[3], null, 'sit'), gloss({ roughness: 0.7, clearcoatRoughness: 0.6 }), 16);
  private wand = inst(wandGeometry(), new MeshBasicMaterial({ vertexColors: true, color: new Color(1.5, 1.5, 1.3), toneMapped: false }));
  private puff = inst(puffGeometry(), gloss({ emissive: 0xff5a00, emissiveIntensity: 0.9 }));
  private wings = inst(wingsGeometry(), gloss({ emissive: 0x4488aa, transparent: true, opacity: 0.85 }));
  private tiles = inst(tileGeometry(), gloss({ roughness: 0.85, clearcoat: 0 }), 100);
  private bases = inst(baseGeometry(), gloss({ roughness: 0.5, metalness: 0.25, clearcoat: 0 }), 100);
  private shadows = inst(this.quad, new MeshBasicMaterial({ map: this.glow, color: 0x10061c, transparent: true, opacity: 0.55, depthWrite: false }));
  private dust = inst(dustGeometry(), gloss({ emissive: 0x8a2ccc, emissiveIntensity: 0.3, roughness: 0.5, clearcoat: 0 }), 100);
  private trail = inst(trailGeometry(), gloss({ roughness: 0.8, clearcoat: 0 }), 100);
  private crates = inst(crateGeometry(), gloss({ roughness: 0.55, clearcoatRoughness: 0.5 }), 100);
  private vines = inst(vineGeometry(), gloss({ roughness: 0.5 }), 100);
  private eggs = inst(eggGeometry(), gloss(), 100);
  private rocks = inst(rockGeometry(), gloss({ roughness: 0.8, clearcoatRoughness: 0.7, flatShading: true }), 100);
  private crabs = inst(crabGeometry(), gloss(), 32);
  private ice1 = inst(iceGeometry(), gloss({ transparent: true, opacity: 0.32, roughness: 0.15, color: 0x7fc8f5, depthWrite: false }), 100);
  private ice2 = inst(iceGeometry(), gloss({ transparent: true, opacity: 0.6, roughness: 0.15, color: 0x9fd8fa, depthWrite: false }), 100);
  private dots = inst(this.quad, basic(this.glow), 500);
  private stars = inst(this.quad, basic(this.sparkle), 200);
  private cursorMesh = new Mesh(cursorGeometry(), new MeshBasicMaterial({ color: new Color(2.2, 1.8, 0.7), toneMapped: false }));
  private ring = new Mesh(this.quad, basic(this.ringTex));
  private hammerMesh = new Mesh(hammerGeometry(), gloss());
  private flyGeo = wingsGeometry();
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private hops = new Map<number, { x: number; y: number; t0: number }>();
  private ray = new Raycaster();
  private plane = new Plane(new Vector3(0, 0, 1), -Z);
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private v = new Vector3();
  private s = new Vector3();
  private col = new Color();
  private region: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private W = 1;
  private H = 1;
  private base = new Vector3();
  private shake = 0;
  private now = 0;
  private hi = true;
  private shimmer = 0;

  constructor() {
    this.scene.add(new HemisphereLight(0xffffff, 0x8a6ab0, 1.0));
    const sun = new DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(-6, 4, 6);
    this.scene.add(sun, this.root, this.camera);
    for (const m of [this.bases, this.tiles, this.trail, this.dust, this.shadows, ...this.pieces, this.rainbow, this.basket, this.kitten, this.wand, this.puff, this.wings, this.crates, this.vines, this.eggs, this.rocks, this.crabs, this.ice1, this.ice2, this.dots, this.stars]) this.root.add(m);
    this.root.add(this.cursorMesh, this.ring, this.hammerMesh);
    this.ring.visible = this.hammerMesh.visible = false;
    (this.ring.material as MeshBasicMaterial).color.setRGB(2.4, 1.9, 0.8);
  }

  setQuality(hi: boolean): void { this.hi = hi; this.backdrop.hi = hi; }
  setWorld(k: number): void { this.backdrop.setWorld(k); }

  // ---------- coordinates ----------
  wx(x: number) { return x - (this.w - 1) / 2; }
  wy(y: number) { return (this.h - 1) / 2 - y; }

  setRegion(r: Rect, W: number, H: number): void {
    this.region = r;
    this.W = W;
    this.H = H;
    centerIn(this.camera, r, W, H);
    const d = fitDistance(this.camera, this.w + 1.3, this.h + 1.3, r, W, H) * 1.02;
    this.base.set(0, -d * 0.13, d);
    this.camera.position.copy(this.base);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  /** Cell under a screen point (CSS px), or -1. */
  pick(cx: number, cy: number): number {
    this.ray.setFromCamera(new Vector2((cx / this.W) * 2 - 1, -(cy / this.H) * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this.v);
    if (!hit) return -1;
    const x = Math.round(hit.x + (this.w - 1) / 2);
    const y = Math.round((this.h - 1) / 2 - hit.y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || this.cells[y * this.w + x].hole) return -1;
    return y * this.w + x;
  }
  /** Screen position (CSS px) of a cell centre. */
  screenOf(x: number, y: number): [number, number] {
    this.v.set(this.wx(x), this.wy(y), Z).project(this.camera);
    return [((this.v.x + 1) / 2) * this.W, ((1 - this.v.y) / 2) * this.H];
  }
  /** Screen size of one cell in CSS px (for drag distance). */
  cellPx(): number { return Math.abs(this.screenOf(1, 0)[0] - this.screenOf(0, 0)[0]); }

  // ---------- board ----------

  setBoard(w: number, h: number, cells: Cell[]): void {
    this.w = w;
    this.h = h;
    this.sprites.clear();
    this.particles = [];
    this.hops.clear();
    this.selected = -1;
    this.hint = null;
    this.cursor = null;
    this.cells = cells;
    const look = LOOKS[Math.max(0, this.backdrop.world)];
    let n = 0;
    cells.forEach((c, i) => {
      if (c.hole) return;
      const x = i % w;
      const y = Math.floor(i / w);
      this.place(this.tiles, n, this.wx(x), this.wy(y), 0, 1.04);
      this.tiles.setColorAt(n, this.col.set(look.tiles[(x + y) % 2]));
      this.place(this.bases, n, this.wx(x), this.wy(y), 0, 1.18);
      this.bases.setColorAt(n, this.col.set(look.frame));
      n++;
    });
    this.tiles.count = this.bases.count = n;
    for (const m of [this.tiles, this.bases]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    cells.forEach((c, i) => {
      if (c.piece) this.sprites.set(c.piece.id, this.sprite(c.piece.id, c.piece.color, c.piece.kind, i % w, Math.floor(i / w)));
    });
    this.drawBlockers(cells);
    this.setRegion(this.region, this.W, this.H);
  }

  private sprite(id: number, color: number, kind: Kind, x: number, y: number): Sprite {
    return { id, color, kind, fx: x, fy: y, tx: x, ty: y, t0: 0, dur: 0, fall: false, born: -10, dying: -1, land: -10 };
  }

  private place(mesh: InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, rz = 0, ry = 0): void {
    this.e.set(0, ry, rz);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sx));
    mesh.setMatrixAt(i, this.m);
  }

  private drawBlockers(cells: Cell[]): void {
    const n = { dust: 0, trail: 0, crate: 0, vine: 0, egg: 0, rock: 0, ice1: 0, ice2: 0 };
    cells.forEach((c, i) => {
      const x = this.wx(i % this.w);
      const y = this.wy(Math.floor(i / this.w));
      if (c.trail && !c.hole) this.place(this.trail, n.trail++, x, y, 0.0, 1.1);
      if (c.dust) {
        this.place(this.dust, n.dust, x, y, 0.03, 1.15);
        this.dust.setColorAt(n.dust++, this.col.set(c.dust > 1 ? 0xc85cff : 0xffc4ff));
      }
      if (c.crate) {
        this.place(this.crates, n.crate, x, y, 0, 1.12);
        this.crates.setColorAt(n.crate++, this.col.set([0xffffff, 0xffffff, 0xc09a80, 0x8a6a58][c.crate]));
      }
      if (c.vine) this.place(this.vines, n.vine++, x, y, 0, 1.1, 1.1, (i * 1.7) % 6);
      if (c.egg) {
        this.place(this.eggs, n.egg, x, y, 0, 1.15, 1.15, c.egg > 1 ? 0 : 0.18);
        this.eggs.setColorAt(n.egg++, this.col.set(c.egg > 1 ? 0xffffff : 0xffb49a));
      }
      if (c.rock) {
        this.place(this.rocks, n.rock, x, y, 0, c.rock > 1 ? 1.12 : 0.95, c.rock > 1 ? 1.12 : 0.95, i);
        this.rocks.setColorAt(n.rock++, this.col.set(c.rock > 1 ? 0x9a8f8a : 0xffffff));
      }
      if (c.ice === 1) this.place(this.ice1, n.ice1++, x, y, 0, 1.25);
      if (c.ice > 1) this.place(this.ice2, n.ice2++, x, y, 0, 1.3);
    });
    const set = (m: InstancedMesh, k: number) => { m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
    set(this.dust, n.dust); set(this.trail, n.trail); set(this.crates, n.crate); set(this.vines, n.vine);
    set(this.eggs, n.egg); set(this.rocks, n.rock); set(this.ice1, n.ice1); set(this.ice2, n.ice2);
  }

  /** Animates one step. Resolves when it has played. */
  play(step: Step): Promise<void> {
    const t = this.now;
    const still = reducedMotion();
    let dur = STEP_TIME[step.type];
    const seen = new Set<number>();
    step.cells.forEach((c, i) => {
      if (!c.piece) return;
      const x = i % this.w;
      const y = Math.floor(i / this.w);
      let s = this.sprites.get(c.piece.id);
      if (!s) {
        const sy = step.spawn[c.piece.id];
        s = this.sprite(c.piece.id, c.piece.color, c.piece.kind, x, sy ?? y);
        if (sy === undefined) s.born = t;
        this.sprites.set(s.id, s);
      } else {
        const [px, py] = this.pos(s, t);
        s.fx = px;
        s.fy = py;
      }
      if (s.kind !== c.piece.kind) s.born = t; // turned special: pop
      s.kind = c.piece.kind;
      s.color = c.piece.color;
      s.tx = x;
      s.ty = y;
      s.fall = step.type === 'fall' && (s.ty !== s.fy || s.tx !== s.fx);
      const dist = Math.hypot(s.tx - s.fx, s.ty - s.fy);
      s.t0 = t + (s.fall ? x * 0.012 : 0);
      s.dur = s.fall ? 0.1 + 0.105 * Math.sqrt(dist) : STEP_TIME[step.type];
      if (still) s.dur = Math.min(s.dur, 0.08);
      if (s.fall) dur = Math.max(dur, s.t0 - t + s.dur + 0.03);
      seen.add(s.id);
    });
    if (still) dur = Math.min(dur, 0.08);
    for (const s of this.sprites.values()) {
      if (seen.has(s.id) || s.dying >= 0) continue;
      s.dying = t;
      const [px, py] = this.pos(s, t);
      const c = s.color >= 0 ? PIECE_COLORS[s.color] : 0xffffff;
      this.burst(this.wx(px), this.wy(py), c, 9);
      this.burst(this.wx(px), this.wy(py), 0xffffff, 3, 0, true);
      this.flash('glow', this.wx(px), this.wy(py), c, 0.25, [1.3]);
    }
    // blocker chips
    step.cells.forEach((c, i) => {
      const o = this.cells[i];
      if (!o) return;
      const x = this.wx(i % this.w);
      const y = this.wy(Math.floor(i / this.w));
      if (c.crate < o.crate) { this.burst(x, y, 0xd9a060, 12); this.onEvent('crate'); }
      if (!c.vine && o.vine) { this.burst(x, y, 0x6fd65a, 12); this.burst(x, y, 0xff8fd0, 4); this.onEvent('vine'); }
      if (c.vine && !o.vine) { this.burst(x, y, 0x3fae4a, 6); this.onEvent('grow'); }
      if (c.ice < o.ice) { this.burst(x, y, 0xdff8ff, 12); this.burst(x, y, 0xffffff, 5, 0, true); this.onEvent('ice'); }
      if (c.dust < o.dust) { this.burst(x, y, 0xf6a8ff, 8, 0, true); this.onEvent('dust'); }
      if (c.egg < o.egg && c.egg > 0) { this.burst(x, y, 0xffe9c9, 8); this.onEvent('egg'); }
      if (c.rock < o.rock) { this.burst(x, y, 0xb8a898, 14); this.burst(x, y, 0xffd84a, 4, 0, true); this.onEvent('rock'); }
      if (c.trail && !o.trail) { this.burst(x, y, 0xffffff, 3, 0, true); this.onEvent('trail'); }
    });
    this.cells = step.cells;
    this.drawBlockers(step.cells);
    for (const f of step.fx) this.effect(f);
    return new Promise((res) => setTimeout(res, dur * 1000));
  }

  private pos(s: Sprite, t: number): [number, number] {
    const k = s.dur > 0 ? Math.max(0, Math.min(1, (t - s.t0) / s.dur)) : 1;
    const e = s.fall ? k * k : 1 - (1 - k) * (1 - k);
    return [s.fx + (s.tx - s.fx) * e, s.fy + (s.ty - s.fy) * e];
  }

  // ---------- effects ----------

  burst(x: number, y: number, color: number, n: number, up = 0, star = false, speed = 1): void {
    if (reducedMotion() || !this.hi) n = Math.ceil(n / 3);
    const cap = this.hi ? 480 : 140;
    this.col.set(color);
    const boost = this.hi ? 1.5 : 1.1;
    for (let k = 0; k < n && this.particles.length < cap; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + Math.random() * 3) * speed;
      this.particles.push({
        x, y, z: Z + 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + up, vz: 1 + Math.random() * 2,
        life: 0, max: (star ? 0.5 : 0.4) + Math.random() * 0.4, size: (star ? 0.34 : 0.2) * (0.6 + Math.random() * 0.8),
        r: this.col.r * boost, g: this.col.g * boost, b: this.col.b * boost, star, grav: star ? 1 : 5,
      });
    }
  }

  private flash(kind: Flash['kind'], x: number, y: number, color: number, dur: number, data: number[], tex: Texture = this.glow): Mesh {
    const mat = basic(tex);
    mat.color.set(color).multiplyScalar(kind === 'glow' ? 0.22 : kind === 'beam' ? 0.6 : this.hi ? 1.2 : 0.9);
    const mesh = new Mesh(kind === 'fly' ? this.flyGeo : this.quad, kind === 'fly' ? this.wings.material : mat);
    mesh.position.set(x, y, Z + 0.5);
    mesh.renderOrder = 5;
    this.root.add(mesh);
    this.flashes.push({ mesh, t0: this.now, dur: reducedMotion() ? Math.min(dur, 0.15) : dur, kind, data });
    return mesh;
  }

  /** Jolts the camera. Off under reduced motion. */
  jolt(a: number): void { if (!reducedMotion()) this.shake = Math.min(0.5, this.shake + a); }

  private effect(f: Fx): void {
    const x = this.wx(f.x), y = this.wy(f.y);
    if (f.t === 'line') {
      const h = f.dir === 'h';
      this.flash('beam', h ? 0 : x, h ? y : 0, 0xfff2b0, 0.45, [h ? 1 : 0, (h ? this.w : this.h) + 1]);
      for (let k = 0; k < (h ? this.w : this.h); k++) this.burst(h ? this.wx(k) : x, h ? y : this.wy(k), 0xffe9a0, 2, 0, true, 0.6);
      this.jolt(0.07);
    } else if (f.t === 'blast') {
      this.flash('ring', x, y, 0xffa040, 0.5, [f.r * 2 + 1.5], this.ringTex);
      this.flash('glow', x, y, 0xffc070, 0.35, [f.r * 2 + 1]);
      for (const c of FIRE) this.burst(x, y, c, 7, 0, false, 1.4);
      this.burst(x, y, 0xffffff, 6, 0, true, 1.5);
      this.jolt(0.1 + f.r * 0.05);
    } else if (f.t === 'fly') {
      this.flash('fly', x, y, 0xffffff, 0.45, [x, y, this.wx(f.tx), this.wy(f.ty)]);
    } else if (f.t === 'beam') {
      const tx = this.wx(f.tx), ty = this.wy(f.ty);
      this.flash('ray', (x + tx) / 2, (y + ty) / 2, PIECE_COLORS[(f.tx + f.ty) % 6], 0.42, [Math.atan2(ty - y, tx - x), Math.hypot(tx - x, ty - y)]);
      this.burst(tx, ty, 0xffffff, 2, 0, true);
      this.jolt(0.012);
    } else if (f.t === 'rescue') {
      this.flash('ring', x, y, 0xff9fc8, 0.6, [3], this.ringTex);
      this.burst(x, y, 0xff7fb0, 16, 3);
      this.burst(x, y, 0xffffff, 10, 3, true);
    } else if (f.t === 'hatch') {
      this.flash('ring', x, y, 0xff7a2e, 0.45, [4], this.ringTex);
      this.flash('glow', x, y, 0xffb060, 0.3, [3]);
      for (const c of FIRE) this.burst(x, y, c, 6, 0, false, 1.2);
      this.burst(x, y, 0xffe9c9, 8);
      this.jolt(0.12);
    } else if (f.t === 'catch') {
      this.flash('ring', x, y, 0xfff2b0, 0.4, [2.2], this.ringTex);
      this.burst(x, y, 0xff6a5a, 8, 2);
      this.burst(x, y, 0xffffff, 6, 2, true);
    } else if (f.t === 'hop') {
      this.hops.set(f.ty * this.w + f.tx, { x: f.x, y: f.y, t0: this.now });
    } else if (f.t === 'make') {
      const big = f.kind === 'rainbow' || f.kind === 'bomb';
      this.flash('ring', x, y, big ? 0xffb0f0 : 0xfff2b0, 0.5, [big ? 3.4 : 2.4], this.ringTex);
      this.burst(x, y, 0xfff6c0, big ? 14 : 8, 0, true, 1.2);
      if (big) this.jolt(0.05);
    }
  }

  // ---------- frame ----------

  update(t: number, dt: number): void {
    this.now = t;
    const still = reducedMotion();
    this.backdrop.update(t);
    // camera shake
    this.shake *= Math.exp(-dt * 8);
    this.camera.position.set(this.base.x + (Math.random() - 0.5) * this.shake, this.base.y + (Math.random() - 0.5) * this.shake, this.base.z);

    const counts = new Array(PIECE_COLORS.length).fill(0);
    let nr = 0, nk = 0, nw = 0, np = 0, nf = 0, ns = 0;
    const hintIds = this.hint ? this.hint.map((i) => this.cells[i]?.piece?.id) : [];
    const selId = this.selected >= 0 ? this.cells[this.selected]?.piece?.id : undefined;
    const specials: Sprite[] = [];
    for (const s of [...this.sprites.values()]) {
      let sx = 1, sy = 1, rz = 0;
      const [px, py] = this.pos(s, t);
      let x = this.wx(px);
      let y = this.wy(py);
      let z = Z;
      if (s.dying >= 0) {
        const k = (t - s.dying) / 0.2;
        if (k >= 1) { this.sprites.delete(s.id); continue; }
        sx = sy = k < 0.3 ? 1 + (k / 0.3) * 0.22 : 1.22 * (1 - (k - 0.3) / 0.7);
        rz = k * 0.8;
        z += k * 0.4;
      } else if (t - s.born < 0.32) {
        const k = (t - s.born) / 0.32;
        sx = sy = k < 0.6 ? (k / 0.6) * 1.28 : 1.28 - ((k - 0.6) / 0.4) * 0.28;
      }
      // falling: stretch, then squash and bounce on landing
      if (s.fall) {
        const k = (t - s.t0) / s.dur;
        if (k >= 1) { s.fall = false; s.land = t; s.fx = s.tx; s.fy = s.ty; if (s.ty >= 0) this.onEvent('land'); }
        else if (k > 0 && !still) { sy *= 1.1; sx *= 0.94; }
      }
      const lk = (t - s.land) / 0.3;
      if (lk >= 0 && lk < 1 && !still) {
        const q = Math.sin(lk * Math.PI * 2) * (1 - lk) * (1 - lk) * 0.3;
        sy *= 1 - q;
        sx *= 1 + q * 0.6;
        y -= q * 0.4;
      }
      let ry = still ? 0 : Math.sin(t * 1.3 + s.id * 1.7) * 0.16;
      if (s.id === selId) { const k = 1.14 + Math.sin(t * 8) * 0.05; sx *= k; sy *= k; z += 0.3; rz = Math.sin(t * 9) * 0.08; }
      if (hintIds.includes(s.id)) { y += Math.abs(Math.sin(t * 7)) * 0.14; sx *= 1.06; sy *= 1.06; }
      if (py < -0.5) { const k = Math.max(0, 1 + (py + 0.5) * 1.2); sx *= k; sy *= k; } // grow in from above the board
      if (s.dying < 0 && py > -0.5) this.place(this.shadows, ns++, x + 0.05, y - 0.1, 0.02, 1.05 * sx);
      const special = s.kind === 'h' || s.kind === 'v' || s.kind === 'bomb' || s.kind === 'fly';
      if (s.kind !== 'n' && s.kind !== 'kitten' && s.dying < 0) specials.push(s);
      if (s.kind === 'rainbow') { this.place(this.rainbow, nr++, x, y, z, sx, sy, 0, t * 1.6); continue; }
      if (s.kind === 'kitten') {
        this.place(this.basket, nk, x, y, z, sx, sy);
        this.place(this.kitten, nk++, x, y - 0.33 + Math.abs(Math.sin(t * 3 + s.id)) * 0.03, z, 0.72 * sx, 0.72 * sy, Math.sin(t * 2 + s.id) * 0.07);
        continue;
      }
      if (s.color < 0) continue;
      const pulse = special ? 0.94 + Math.sin(t * 5 + s.id) * 0.03 : 1;
      this.place(this.pieces[s.color], counts[s.color]++, x, y, z, sx * pulse * 1.1, sy * pulse * 1.1, rz, ry);
      if (s.kind === 'h' || s.kind === 'v') this.place(this.wand, nw++, x, y, z, sx, sy, s.kind === 'v' ? Math.PI / 2 : 0);
      if (s.kind === 'bomb') this.place(this.puff, np++, x, y, z, sx * (1 + Math.sin(t * 6) * 0.05), sy * (1 + Math.sin(t * 6) * 0.05), t * 0.8);
      if (s.kind === 'fly') this.place(this.wings, nf++, x, y, z, sx * (0.8 + Math.abs(Math.sin(t * 10)) * 0.3), sy);
    }
    this.pieces.forEach((m, c) => (m.count = counts[c]));
    this.rainbow.count = nr;
    this.basket.count = this.kitten.count = nk;
    this.wand.count = nw;
    this.puff.count = np;
    this.wings.count = nf;
    this.shadows.count = ns;
    for (const m of [...this.pieces, this.rainbow, this.basket, this.kitten, this.wand, this.puff, this.wings, this.shadows]) m.instanceMatrix.needsUpdate = true;

    // specials shimmer
    this.shimmer -= dt;
    if (this.shimmer < 0 && specials.length && !still) {
      this.shimmer = this.hi ? 0.09 : 0.3;
      const s = specials[Math.floor(Math.random() * specials.length)];
      const [px, py] = this.pos(s, t);
      this.particles.push({ x: this.wx(px) + (Math.random() - 0.5) * 0.7, y: this.wy(py) + (Math.random() - 0.5) * 0.7, z: Z + 0.5, vx: 0, vy: 0.3, vz: 0, life: 0, max: 0.5, size: 0.3, r: 2.4, g: 2.2, b: 1.6, star: true, grav: 0 });
    }

    // crabs
    let nc = 0;
    this.cells.forEach((c, i) => {
      if (!c.crab || nc >= 32) return;
      let x = i % this.w, y = Math.floor(i / this.w), z = Z + 0.42;
      const hop = this.hops.get(i);
      if (hop) {
        const k = (t - hop.t0) / 0.3;
        if (k >= 1) this.hops.delete(i);
        else { x = hop.x + (x - hop.x) * k; y = hop.y + (y - hop.y) * k; z += Math.sin(k * Math.PI) * 0.5; }
      }
      this.place(this.crabs, nc++, this.wx(x) + (still ? 0 : Math.sin(t * 6 + i) * 0.03), this.wy(y) - 0.02, z, 1.25, 1.25, still ? 0 : Math.sin(t * 5 + i) * 0.08);
    });
    this.crabs.count = nc;
    this.crabs.instanceMatrix.needsUpdate = true;

    // particles
    let nd = 0, nst = 0;
    const live: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      live.push(p);
      p.vz -= p.grav * dt;
      p.vx *= 1 - dt * 2.5;
      p.vy *= 1 - dt * 2.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = 1 - p.life / p.max;
      const mesh = p.star ? this.stars : this.dots;
      const n = p.star ? nst++ : nd++;
      if (n >= (p.star ? 200 : 500)) continue;
      this.place(mesh, n, p.x, p.y, Math.max(0.1, p.z), p.size * (p.star ? Math.sin(k * Math.PI) * 1.4 : 0.4 + k), undefined, p.star ? p.life * 2 : 0);
      mesh.setColorAt(n, this.col.setRGB(p.r * k, p.g * k, p.b * k));
    }
    this.particles = live;
    this.dots.count = Math.min(nd, 500);
    this.stars.count = Math.min(nst, 200);
    for (const m of [this.dots, this.stars]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    // flashes
    this.flashes = this.flashes.filter((f) => {
      const k = (t - f.t0) / f.dur;
      const mat = f.mesh.material as MeshBasicMaterial;
      if (k >= 1) { this.root.remove(f.mesh); if (f.kind !== 'fly') mat.dispose(); return false; }
      if (f.kind === 'beam') {
        const len = f.data[1] * Math.min(1, k * 4) * 1.6;
        const wd = 1.1 * (1 - k) + 0.15;
        mat.opacity = 1 - k * k;
        f.mesh.scale.set(f.data[0] ? len : wd, f.data[0] ? wd : len, 1);
      } else if (f.kind === 'ring' || f.kind === 'glow') {
        mat.opacity = 1 - k;
        f.mesh.scale.setScalar(f.data[0] * (f.kind === 'ring' ? 0.25 + 0.75 * (1 - (1 - k) * (1 - k)) : 0.5 + k * 0.5));
      } else if (f.kind === 'ray') {
        mat.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI);
        f.mesh.rotation.z = f.data[0];
        f.mesh.scale.set(f.data[1] * 1.5, 0.5, 1);
      } else {
        const [x0, y0, x1, y1] = f.data;
        const e = k * k * (3 - 2 * k);
        f.mesh.position.set(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, Z + 0.6 + Math.sin(k * Math.PI) * 1.4);
        f.mesh.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
        f.mesh.scale.set(0.8 + Math.abs(Math.sin(t * 30)) * 0.4, 1, 1);
        if (!still) this.particles.push({ x: f.mesh.position.x, y: f.mesh.position.y, z: f.mesh.position.z, vx: 0, vy: 0, vz: 0, life: 0, max: 0.35, size: 0.3, r: 1.2, g: 2.2, b: 2.6, star: true, grav: 0 });
      }
      return true;
    });

    // cursor, selection, hammer
    const c = this.cursor;
    this.cursorMesh.visible = !!c;
    if (c) { this.cursorMesh.position.set(this.wx(c.x), this.wy(c.y), 0); this.cursorMesh.scale.setScalar(1.08 + Math.sin(t * 5) * 0.04); }
    this.ring.visible = this.selected >= 0;
    if (this.selected >= 0) {
      this.ring.position.set(this.wx(this.selected % this.w), this.wy(Math.floor(this.selected / this.w)), 0.15);
      this.ring.scale.setScalar(1.5 + Math.sin(t * 6) * 0.08);
    }
    this.hammerMesh.visible = this.hammer && !!c;
    if (this.hammer && c) {
      this.hammerMesh.position.set(this.wx(c.x) + 0.3, this.wy(c.y) + 0.35, 1.3);
      this.hammerMesh.rotation.z = Math.sin(t * 6) * 0.3;
      this.hammerMesh.scale.setScalar(1.3);
    }
  }
}
