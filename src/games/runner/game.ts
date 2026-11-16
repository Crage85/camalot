// Kitty Cup Run: a cat soccer team runs down a path, grows through math gates, beats rival teams,
// dodges traps, and scores past the goalkeeper. Run logic and drawing; screens.ts holds the menus.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Camalot, LoopHandle, MusicMood, SfxName } from '../../core/contract';
import { applyGate, bestOpt, gateText, makeLevel, MAX_COUNT, TRACK_HALF, type Gate, type GateMove, type Level } from './levels';
import {
  goalCoins, incomeMult, JERSEYS, LAST_LEVEL, MATCHES, migrate, newSave, stadiumMult, STARS, startCats, starsOf, totalStars,
  TRAP_MOVE, where, type RunnerSave, type Stat, type TrapKind, type TrapMove,
} from './data';
import {
  buildCannon, buildCrown, buildGateRow, buildGoal, buildStands, buildTrap, buildWorld, catGeometry, catMaterial, catMesh, disposeTree,
  gateShimmer, gloveGeo, smoothMat, soccerBall, starGeometry, type CatMesh, type WorldArt,
} from './art';
import { Screens } from './screens';
import '../../core/theme.css';
import './runner.css';

// ---- Tunables (rules picked for this game) ----
const SPEED = 7.5; // run speed, units per second
const CAP = 1000; // instanced cat slots
const FAN_CAP = 1500;
const SPACING = 0.25; // crowd packing
const W = TRACK_HALF;
const TRADE_TICK = 0.09; // seconds between fight trades
const FURS = ['#f6a04d', '#f7e3c0', '#a9a9b8', '#55505e', '#ffffff', '#c98b5a', '#f6a04d', '#ffffff'].map((c) => new THREE.Color(c));
const PARTY = ['#ff5d8f', '#ffd84a', '#4aa8ff', '#2fd39a', '#9b6bff', '#ff8a3d'].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color('#ffffff');
const GOLD = new THREE.Color('#ffcf3a');

interface Cat { x: number; z: number; fur: number; phase: number; s: number; num: number; safe: number }
interface Rival { d: number; count: number; cats: Cat[]; label: HTMLDivElement; captain: boolean }
interface Stray { d: number; x: number; cats: Cat[] }
interface GateRow { d: number; opts: Gate[]; group: THREE.Group; panels: THREE.Mesh[]; lane: number; move?: GateMove; done: boolean; pop: number; chosen: number }
interface Trap { kind: TrapKind; move: TrapMove; d: number; x: number; speed: number; phase: number; objs: THREE.Object3D[]; spin?: THREE.Object3D; hits: { x: number; z: number; r: number }[]; sd: number; on: boolean }
interface Bit { kind: 0 | 1 | 2; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; color: THREE.Color; grav: number; spin: number }

export type State = 'menu' | 'run' | 'fight' | 'boss' | 'goal' | 'end' | 'lost';
const GA = 2.39996323; // golden angle

function newCat(x: number, z: number, s = 1): Cat {
  return { x, z, fur: Math.floor(Math.random() * FURS.length), phase: Math.random() * 6.28, s, num: Math.floor(Math.random() * 15), safe: 0 };
}
/** Disc formation, squeezed to fit the track when the team is wide. */
function slot(i: number, n: number, out: { x: number; z: number }) {
  const lim = W - 0.35;
  const R = SPACING * Math.sqrt(n);
  const k = R > lim ? lim / R : 1;
  const r = SPACING * Math.sqrt(i + 0.5);
  out.x = r * Math.cos(i * GA) * k;
  out.z = (r * Math.sin(i * GA)) / k;
}
function radiusZ(n: number) {
  const lim = W - 0.35;
  const R = SPACING * Math.sqrt(n);
  return R > lim ? (R * R) / lim : R;
}

export class RunnerGame {
  cam: Camalot;
  root: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
  private hemi = new THREE.HemisphereLight('#ffffff', '#88aa77', 1.2);
  private sun = new THREE.DirectionalLight('#fff4e0', 2);
  private world: (WorldArt & { key: string }) | null = null;
  private levelGroup = new THREE.Group();
  private goal = buildGoal();
  private kickBall = soccerBall(0.35);
  private cats: CatMesh;
  private fans: CatMesh;
  private catU = catMaterial();
  private blob: THREE.InstancedMesh;
  private bitMesh: THREE.InstancedMesh[];
  private coinMesh: THREE.InstancedMesh | null = null;
  private gloves: THREE.Mesh[];
  private crowns: THREE.Mesh[];
  private cannons: { d: number; fired: boolean; x: number }[] = [];

  save: RunnerSave = newSave();
  level!: Level;
  cur = 1; // level being played
  state: State = 'menu';
  paused = false;
  low = false;
  private autoLow = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  private slow = 0;
  private time = 0;
  screens: Screens;

  // run state
  private d = 0;
  private cx = 0;
  private targetX = 0;
  count = 1;
  private team: Cat[] = [];
  private rivals: Rival[] = [];
  private strays: Stray[] = [];
  private gates: GateRow[] = [];
  private traps: Trap[] = [];
  private coins: { x: number; d: number; taken: boolean }[] = [];
  private bits: Bit[] = [];
  private fightWith: Rival | null = null;
  private tradeClock = 0;
  keeperHp = 0;
  private keeperX = 0;
  private keeperTilt = 0;
  private goalClock = 0;
  private revived = false;
  bonusCats = 0;
  private resumeState: State = 'run';
  private hintClock = 0;
  private snapCam = true;
  private shake = 0;
  private streak = 0; // good gates in a row, raises the gate sound's pitch
  private coinRun = 0;
  private coinClock = 0;
  private shield = 0;
  private emberAcc = 0;
  private popClock = 0;
  private cheer = 0;
  private fireClock = 0;
  private crowd: LoopHandle | null = null;
  private maxShow = 400;
  private starLvl: Record<string, number> = {};

  // input
  private keys = new Set<string>();
  private dragId = -1;
  private dragLast = 0;

  // DOM
  hud: HTMLDivElement;
  private levelPill: HTMLDivElement;
  private coinPill: HTMLDivElement;
  private bar: HTMLDivElement;
  hint: HTMLDivElement;
  private countLabel: HTMLDivElement;
  private keeperLabel: HTMLDivElement;
  private labels: HTMLDivElement;

  constructor(root: HTMLElement, cam: Camalot) {
    this.cam = cam;
    this.root = root;
    root.classList.add('rn-root');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    root.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'rn-canvas';
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.5, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.far = 90;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.levelGroup, this.goal.group, this.kickBall);
    this.kickBall.visible = false;

    this.cats = catMesh(catGeometry(0), this.catU, CAP);
    this.fans = catMesh(catGeometry(1), this.catU, FAN_CAP);
    this.fans.mesh.castShadow = false;
    this.fans.mesh.count = 0;
    this.blob = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.22, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.2, depthWrite: false }), CAP);
    this.blob.frustumCulled = false;
    const bit = (g: THREE.BufferGeometry, n: number, m: THREE.Material) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.setColorAt(0, WHITE);
      im.frustumCulled = false;
      im.count = 0;
      return im;
    };
    this.bitMesh = [
      bit(new THREE.IcosahedronGeometry(0.2, 1), 500, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9 })),
      bit(starGeometry().scale(0.22, 0.22, 0.22), 400, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
      bit(new THREE.PlaneGeometry(0.16, 0.24), 700, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
    ];
    this.gloves = [0, 1].map(() => new THREE.Mesh(gloveGeo, smoothMat));
    this.crowns = [0, 1, 2].map(() => buildCrown());
    this.scene.add(this.cats.mesh, this.fans.mesh, this.blob, ...this.bitMesh, ...this.gloves, ...this.crowns);

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement = root) => {
      const e = document.createElement(tag);
      e.className = cls;
      parent.appendChild(e);
      return e;
    };
    this.labels = el('div', 'rn-labels');
    this.countLabel = el('div', 'rn-bubble rn-mine', this.labels);
    this.keeperLabel = el('div', 'rn-bubble rn-keeper', this.labels);
    this.hud = el('div', 'rn-hud');
    this.levelPill = el('div', 'rn-pill', this.hud);
    this.coinPill = el('div', 'rn-pill rn-coins', this.hud);
    const pauseBtn = el('button', 'cm-btn rn-iconbtn', this.hud);
    pauseBtn.setAttribute('aria-label', 'Pause');
    pauseBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg><span class="cm-key">Esc</span>';
    pauseBtn.onclick = () => this.screens.pause();
    const track = el('div', 'rn-progress', this.hud);
    this.bar = el('div', 'rn-progress-ball', track);
    this.hint = el('div', 'rn-hint');
    this.hint.innerHTML = '<span class="rn-desk"><span class="cm-key">←</span><span class="cm-key">→</span> or pointer</span><span class="rn-touch">Drag</span> to steer';
    this.screens = new Screens(this, el('div', 'rn-screen'));

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this.screens.pause());
  }

  async start() {
    this.save = migrate(await this.cam.save.load<unknown>());
    this.cur = this.save.level;
    this.applyQuality();
    this.screens.home();
    let last = performance.now();
    const loop = (now: number) => {
      const raw = (now - last) / 1000;
      const dt = Math.min(0.05, raw);
      last = now;
      if (!this.paused) this.update(dt);
      this.render(dt);
      // Auto quality: step down once if High runs slowly during play.
      if (this.save.quality === 'auto' && !this.low && this.state === 'run' && !this.paused) {
        this.slow = raw > 0.03 ? this.slow + raw : Math.max(0, this.slow - raw);
        if (this.slow > 2.5) {
          this.autoLow = true;
          this.applyQuality();
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  persist() {
    this.cam.save.store(this.save).catch((e: unknown) => console.warn(e));
  }

  // ---------------- Sound (platform audio, per the contract) ----------------
  sfx(name: SfxName, pitch = 1, volume = 1) {
    this.cam.audio?.sfx(name, { pitch: pitch * (0.96 + Math.random() * 0.08), volume, pan: Math.max(-1, Math.min(1, this.cx / W)) * 0.4 });
  }
  music(mood: MusicMood) {
    this.cam.audio?.music('runner', mood);
  }

  // ---------------- Quality ----------------
  applyQuality() {
    const q = this.save.quality;
    this.low = q === 'low' || (q === 'auto' && this.autoLow);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.low ? 1.25 : 2));
    this.renderer.shadowMap.enabled = !this.low;
    this.sun.castShadow = !this.low;
    this.blob.visible = this.low;
    this.maxShow = this.low ? 240 : 400;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
    this.resize();
  }

  // ---------------- Level setup ----------------
  star(id: string): number {
    return this.save.captain === id ? (this.save.cats[id] ?? 0) : 0;
  }

  loadLevel(n: number) {
    this.cur = n;
    this.level = makeLevel(n);
    const L = this.level;
    const wh = where(n);
    disposeTree(this.levelGroup);
    this.levelGroup.clear();
    this.rivals.forEach((r) => r.label.remove());

    const key = `${L.world}|${L.league}|${this.low}`;
    if (this.world?.key !== key) {
      if (this.world) {
        this.scene.remove(this.world.group);
        disposeTree(this.world.group);
      }
      this.world = { ...buildWorld(L.world, L.league, this.low), key };
      this.scene.add(this.world.group);
      const look = this.world.look;
      this.scene.fog = new THREE.Fog(look.skyLow, 55, 210);
      this.scene.background = look.skyLow;
      this.hemi.color.copy(look.skyTop).lerp(WHITE, 0.6);
      this.hemi.groundColor.set(look.ground).lerp(WHITE, 0.2);
      this.hemi.intensity = look.hemi;
      this.sun.color.copy(look.sunColor);
      this.sun.intensity = look.sun;
      this.bloom.strength = 0.3 + look.night * 0.3;
    }
    for (const id of ['whiskers', 'blizzard', 'sunny', 'rocky', 'dune', 'taffy', 'pixel', 'ember']) this.starLvl[id] = this.star(id);

    this.gates = [];
    this.traps = [];
    this.rivals = [];
    this.strays = [];
    this.coins = [];
    this.cannons = [];
    for (const it of L.items) {
      if (it.kind === 'gates') {
        const { group, panels, lane } = buildGateRow(it.opts);
        group.position.z = -it.d;
        this.levelGroup.add(group);
        this.gates.push({ d: it.d, opts: it.opts, group, panels, lane, move: it.move, done: false, pop: 0, chosen: -1 });
      } else if (it.kind === 'rival') {
        const label = document.createElement('div');
        label.className = 'rn-bubble rn-rival';
        this.labels.appendChild(label);
        const count = Math.max(1, Math.round(it.count * (1 - 0.06 * this.starLvl.rocky)));
        const r: Rival = { d: it.d, count, cats: [], label, captain: !!it.captain };
        this.syncCats(r.cats, Math.min(count, this.maxShow / 2), 0, -it.d, false);
        r.cats.forEach((c, i) => {
          const p = { x: 0, z: 0 };
          slot(i, r.cats.length, p);
          c.x = p.x;
          c.z = -it.d + p.z;
          c.s = 1;
        });
        this.rivals.push(r);
      } else if (it.kind === 'strays') {
        const cats: Cat[] = [];
        for (let i = 0; i < it.n; i++) cats.push(newCat(it.x + ((i % 3) - 1) * 0.5, -it.d - Math.floor(i / 3) * 0.5));
        this.strays.push({ d: it.d, x: it.x, cats });
      } else if (it.kind === 'coins') {
        for (let i = 0; i < it.n; i++) this.coins.push({ x: it.x, d: it.d + i * 1.4, taken: false });
      } else {
        this.traps.push(this.makeTrap(it.trap, it.d, it.x, it.speed, it.phase));
      }
    }
    if (this.coins.length) {
      const cm = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.09, 16).rotateX(Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: '#ffcf3a', emissive: '#ffb020', emissiveIntensity: 0.9 }), this.coins.length);
      cm.frustumCulled = false;
      this.coinMesh = cm;
      this.levelGroup.add(cm);
    } else this.coinMesh = null;

    // Stadium: a stretch of stands mid-run, and the home stadium around the goal. Stadium upgrades add rows.
    const night = this.world!.look.night;
    const seats: [number, number, number, number][] = [];
    const accent = JERSEYS.find((j) => j.id === this.save.jersey)!.color;
    const mid = buildStands(-L.stadium[0], -L.stadium[1], this.low ? 2 : 3, where(n).world.rivalJersey, false, night);
    const home = buildStands(-(L.length - 26), -(L.length + 13), Math.min(this.low ? 3 : 8, 3 + Math.floor(this.save.stadiumLvl / 2)), accent, true, night);
    this.levelGroup.add(mid.group, home.group);
    seats.push(...mid.seats, ...home.seats);
    for (const d of [L.stadium[0], L.length - 26]) {
      for (const s of [-1, 1]) {
        const c = buildCannon(s);
        c.position.set(s * (W + 1), 0, -d);
        this.levelGroup.add(c);
        this.cannons.push({ d, fired: false, x: s * (W + 1) });
      }
    }
    const fcap = this.low ? 320 : FAN_CAP;
    const stepN = Math.max(1, Math.ceil(seats.length / fcap));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const rj = new THREE.Color(wh.world.rivalJersey);
    const mj = new THREE.Color(accent);
    let fi = 0;
    for (let i = 0; i < seats.length && fi < fcap; i += stepN) {
      const [x, y, z, ry] = seats[i];
      const sc = 0.95 + ((i * 7) % 5) * 0.04;
      m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sc, sc, sc));
      this.fans.mesh.setMatrixAt(fi, m);
      const jc = (i * 13) % 5 < 3 ? mj : (i * 13) % 5 < 4 ? rj : WHITE;
      this.fans.jersey.setXYZ(fi, jc.r, jc.g, jc.b);
      this.fans.trim.setXYZ(fi, 1, 1, 1);
      const f = FURS[(i * 5) % FURS.length];
      this.fans.fur.setXYZ(fi, f.r, f.g, f.b);
      this.fans.anim.setXYZW(fi, (ry ? z : x) * 0.3, -1, 0.3, 0);
      fi++;
    }
    this.fans.mesh.count = fi;
    for (const a of [this.fans.mesh.instanceMatrix, this.fans.jersey, this.fans.trim, this.fans.fur, this.fans.anim]) a.needsUpdate = true;

    this.goal.group.position.z = -(L.length + 10);
    this.goal.ripple(-1, 0, 0);
    this.keeperX = 0;
    this.keeperTilt = 0;
    this.keeperHp = Math.max(1, Math.round(L.keeper * (1 - 0.05 * this.starLvl.pixel)));
    this.kickBall.visible = false;

    this.d = 0;
    this.cx = 0;
    this.targetX = 0;
    this.team = [];
    this.count = startCats(this.save.teamLvl) + 4 * this.starLvl.whiskers + this.bonusCats;
    this.syncTeam(false);
    this.team.forEach((c, i) => {
      const p = { x: 0, z: 0 };
      slot(i, this.team.length, p);
      c.x = p.x;
      c.z = p.z;
      c.s = 1;
    });
    this.fightWith = null;
    this.revived = false;
    this.goalClock = 0;
    this.bits = [];
    this.snapCam = true;
    this.streak = 0;
    this.coinRun = 0;
    this.cheer = 0;
    this.shield = 4 * this.starLvl.blizzard;
    this.emberAcc = 0;
  }

  private makeTrap(kind: TrapKind, d: number, x: number, speed: number, phase: number): Trap {
    const move = TRAP_MOVE[kind];
    const t: Trap = { kind, move, d, x, speed, phase, objs: [], hits: [], sd: d, on: false };
    const n = kind === 'crab' || kind === 'penguin' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const b = buildTrap(kind);
      t.objs.push(b.group);
      t.spin = b.spin;
      b.group.position.set(x, 0, -d);
      this.levelGroup.add(b.group);
    }
    this.placeTrap(t);
    return t;
  }

  /** Move a trap to where it is at the current time and record its hit circles. */
  private placeTrap(t: Trap) {
    const tt = this.time * t.speed + t.phase;
    t.hits.length = 0;
    if (t.move === 'sweep') {
      t.objs.forEach((o, k) => {
        const big = t.kind === 'ball';
        const x = (W - (big ? 1 : 0.8)) * Math.sin(tt * (big ? 1 : 1.25) + k * 2.1);
        const dir = Math.cos(tt * (big ? 1 : 1.25) + k * 2.1) > 0 ? 1 : -1;
        const z = -t.d - k * 3;
        if (t.kind === 'ball') {
          o.position.set(x, 0.9, z);
          o.rotation.z = -x / 0.9;
        } else if (t.kind === 'tumbleweed') {
          o.position.set(x, 0.75 + Math.abs(Math.sin(tt * 4)) * 0.5, z);
          o.rotation.z = -x * 1.3;
        } else if (t.kind === 'twister') {
          o.position.set(x, 0, z);
          o.rotation.y = this.time * 9;
        } else {
          o.position.set(x, t.kind === 'dragon' ? Math.abs(Math.sin(tt * 3)) * 0.25 : 0, z);
          o.rotation.y = (dir * Math.PI) / 2;
          o.rotation.z = Math.sin(this.time * 12 + k) * 0.08;
        }
        t.hits.push({ x, z, r: big ? 0.95 : 0.6 });
      });
    } else if (t.move === 'roll') {
      const o = t.objs[0];
      o.position.set(t.x, 1.0, -t.sd);
      o.rotation.x = t.sd;
      t.hits.push({ x: t.x, z: -t.sd, r: 1.05 });
    } else if (t.move === 'spin') {
      const a = tt * 1.4;
      t.spin!.rotation.y = a;
      for (let i = -5; i <= 5; i++) {
        if (i === 0) continue;
        const r = (2.2 * i) / 5;
        t.hits.push({ x: t.x + Math.cos(a) * r, z: -t.d + Math.sin(-a) * r, r: 0.3 });
      }
    } else if (t.move === 'pop') {
      const up = Math.max(0, Math.sin(tt * 1.3));
      const k = Math.min(1, up * 3);
      t.spin!.scale.set(0.6 + k * 0.4, Math.max(0.001, k), 0.6 + k * 0.4);
      t.spin!.visible = k > 0.02;
      t.spin!.rotation.y = this.time * 3;
      const on = k > 0.5;
      if (on && !t.on && Math.abs(t.d - this.d) < 30 && this.state === 'run') this.sfx(t.kind === 'flame' ? 'whoosh' : 'splash', 1, 0.5);
      t.on = on;
      if (on) t.hits.push({ x: t.x, z: -t.d, r: 1.0 });
    } else {
      for (const dx of [-1.35, -0.45, 0.45, 1.35]) t.hits.push({ x: t.x + dx, z: -t.d, r: 0.45 });
    }
  }

  // ---------------- Crowd bookkeeping ----------------
  /** Grow or shrink a cat list to n; new cats pop in at (x, z), removed ones go poof. */
  private syncCats(list: Cat[], n: number, x: number, z: number, poof: boolean) {
    while (list.length < n) list.push(newCat(x + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4, 0.2));
    while (list.length > n) {
      const c = list.pop()!;
      if (poof) this.poof(c.x, c.z);
    }
  }
  syncTeam(poof = true) {
    this.syncCats(this.team, Math.min(this.count, this.maxShow), this.cx, -this.d, poof);
    if (this.count > (this.save.stats.bigTeam ?? 0)) this.save.stats.bigTeam = this.count;
  }
  /** Remove k cats from a list, the ones nearest z = towardZ first, with a poof each. */
  private removeNearest(list: Cat[], k: number, towardZ: number) {
    for (let j = 0; j < k && list.length; j++) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < list.length; i++) {
        const dd = Math.abs(list[i].z - towardZ);
        if (dd < bd) {
          bd = dd;
          bi = i;
        }
      }
      const c = list.splice(bi, 1)[0];
      this.poof(c.x, c.z);
      if (j % 3 === 0) this.burst(1, c.x, 0.6, c.z, 1, GOLD, 2.5);
    }
  }

  /** Particles. kind 0 soft puff, 1 glowing star, 2 confetti. */
  burst(kind: 0 | 1 | 2, x: number, y: number, z: number, n: number, color: THREE.Color | null, power = 1, up = 1) {
    const max = this.low ? 350 : 1100;
    for (let i = 0; i < n; i++) {
      if (this.bits.length >= max) this.bits.shift();
      const c = color ?? PARTY[Math.floor(Math.random() * PARTY.length)];
      this.bits.push({
        kind, x, y, z,
        vx: (Math.random() - 0.5) * 2.5 * power, vy: (0.6 + Math.random() * 1.6) * power * up, vz: (Math.random() - 0.5) * 2.5 * power,
        age: 0, life: (kind === 2 ? 1.6 : 0.5) + Math.random() * 0.4, size: 0.6 + Math.random() * 0.7,
        color: kind === 1 ? c.clone().multiplyScalar(2.2) : c, grav: kind === 2 ? 2.2 : kind === 1 ? 3 : 2, spin: Math.random() * 10,
      });
    }
  }
  private poof(x: number, z: number) {
    this.burst(0, x, 0.4, z, this.low ? 2 : 4, WHITE);
  }
  private firework(x: number, y: number, z: number) {
    const c = PARTY[Math.floor(Math.random() * PARTY.length)];
    const n = this.low ? 14 : 34;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const e = Math.acos(Math.random() * 2 - 1);
      const v = 5 + Math.random() * 2;
      this.bits.push({ kind: 1, x, y, z, vx: Math.cos(a) * Math.sin(e) * v, vy: Math.cos(e) * v, vz: Math.sin(a) * Math.sin(e) * v, age: 0, life: 1 + Math.random() * 0.5, size: 1.6, color: c.clone().multiplyScalar(2.6), grav: 2.5, spin: Math.random() * 10 });
    }
    this.sfx('sparkle', 0.8 + Math.random() * 0.5, 0.6);
  }
  private float(text: string, x: number, y: number, z: number, cls = '') {
    const e = document.createElement('div');
    e.className = 'rn-float ' + cls;
    e.textContent = text;
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    e.style.left = `${((v.x + 1) / 2) * this.root.clientWidth}px`;
    e.style.top = `${((1 - v.y) / 2) * this.root.clientHeight}px`;
    this.labels.appendChild(e);
    setTimeout(() => e.remove(), 1000);
  }
  private bump(stat: Stat, by = 1) {
    this.save.stats[stat] = (this.save.stats[stat] ?? 0) + by;
  }

  // ---------------- Update ----------------
  private update(dt: number) {
    this.time += dt;
    for (const t of this.traps) this.placeTrap(t);
    const st = this.state;
    if (st === 'run' || st === 'fight' || st === 'boss') this.steer(dt);
    if (st === 'run') this.updateRun(dt);
    else if (st === 'fight') this.updateFight(dt);
    else if (st === 'boss') this.updateBoss(dt);
    else if (st === 'goal' || st === 'end') this.updateGoal(dt);
    this.moveTeam(dt);
    for (const b of this.bits) {
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.vy -= b.grav * dt;
      if (b.kind === 2) {
        b.vx *= 1 - dt;
        b.vz *= 1 - dt;
        if (b.vy < -1.6) b.vy = -1.6;
      }
    }
    this.bits = this.bits.filter((b) => b.age < b.life && b.y > -0.2);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.coinClock += dt;
    this.popClock += dt;
    if (this.hintClock > 0) {
      this.hintClock -= dt;
      if (this.hintClock <= 0) this.hint.classList.remove('on');
    }
    // Gates: slide, flip, shimmer, and the pop after a pick.
    gateShimmer().offset.x = -this.time * 0.5;
    for (const g of this.gates) {
      if (Math.abs(g.d - this.d) > 70) continue;
      if (g.move === 'slide') g.group.position.x = this.slideX(g);
      const flipped = this.flipped(g);
      g.panels.forEach((p, i) => {
        const j = flipped ? g.panels.length - 1 - i : i;
        const tx = -W + g.lane * (j + 0.5);
        p.position.x += (tx - p.position.x) * Math.min(1, dt * 9);
        const mat = p.material as THREE.MeshBasicMaterial;
        if (g.done) {
          g.pop += dt / g.panels.length;
          const k = Math.min(1, g.pop / 0.35);
          if (i === g.chosen) {
            p.scale.setScalar(1 + k * 0.7);
            mat.opacity = 1 - k;
          } else mat.opacity = Math.max(0.12, 1 - k * 2);
          p.children[0].visible = false;
        } else p.position.y = 1.5 + Math.sin(this.time * 2.5 + g.d + i) * 0.06;
      });
    }
    // Crowd sound: louder inside stadium stretches and at a goal.
    const L = this.level;
    const inStands = (this.d > L.stadium[0] - 10 && this.d < L.stadium[1] + 6) || this.d > L.length - 34;
    const target = st === 'goal' || st === 'end' ? 1 : st === 'menu' || st === 'lost' ? 0 : inStands ? 0.55 : 0.12;
    this.cheer += (Math.max(0, target - 0.12) / 0.88 - this.cheer) * Math.min(1, dt * 3);
    this.crowd?.setLevel(target);
    for (const c of this.cannons) {
      if (!c.fired && this.d > c.d - 3 && st === 'run') {
        c.fired = true;
        this.burst(2, c.x, 1.6, -c.d, this.low ? 14 : 40, null, 3.2, 2.4);
        if (c.x < 0) this.sfx('pop', 0.6, 0.8);
      }
    }
  }
  private slideX(g: GateRow) {
    return Math.sin(this.time * 0.9 + g.d) * 1.3;
  }
  private flipped(g: GateRow) {
    return g.move === 'flip' && Math.floor((this.time + g.d) / 2.4) % 2 === 1;
  }

  private steer(dt: number) {
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('a') || k.has('A')) this.targetX -= 8 * dt;
    if (k.has('ArrowRight') || k.has('d') || k.has('D')) this.targetX += 8 * dt;
    const lim = W - 0.8;
    this.targetX = Math.max(-lim, Math.min(lim, this.targetX));
    this.cx += (this.targetX - this.cx) * Math.min(1, dt * 10);
  }

  private updateRun(dt: number) {
    const prev = this.d;
    this.d += SPEED * dt;
    const front = this.d + radiusZ(this.team.length);
    // Rollers start coming at the team when it gets close.
    for (const t of this.traps) {
      if (t.move !== 'roll' || this.d < t.d - 35 || t.sd < this.d - 15) continue;
      if (t.sd === t.d) this.sfx('whoosh', 0.7);
      t.sd -= 5 * dt;
    }
    for (const g of this.gates) {
      if (g.done || prev >= g.d || this.d < g.d) continue;
      g.done = true;
      const x = this.cx - (g.move === 'slide' ? this.slideX(g) : 0);
      let i = Math.max(0, Math.min(g.opts.length - 1, Math.floor((x + W) / g.lane)));
      if (this.flipped(g)) i = g.opts.length - 1 - i;
      g.chosen = i;
      const boost = 1 + 0.08 * this.starLvl.taffy;
      const before = this.count;
      if (i === bestOpt(before, g.opts, boost)) this.bump('gates');
      this.count = applyGate(before, g.opts[i], boost);
      const up = this.count >= before;
      this.float(gateText(g.opts[i]), this.cx, 2.4, -this.d, up ? 'good' : 'bad');
      if (up) {
        this.streak++;
        this.sfx('grow', 1 + Math.min(8, this.streak) * 0.08);
        this.burst(1, this.cx, 1.4, -this.d, 12, new THREE.Color('#7fd1ff'), 3);
      } else {
        this.streak = 0;
        this.sfx('error', 0.9);
        this.shake = 0.25;
      }
      this.syncTeam();
    }
    // Strays join when the team reaches them.
    for (const s of this.strays) {
      if (s.cats.length && Math.abs(front - s.d) < 1.2 && Math.abs(this.cx - s.x) < radiusZ(this.team.length) + 1.2) {
        const add = s.cats.length * (1 + this.starLvl.dune);
        this.count = Math.min(MAX_COUNT, this.count + add);
        this.bump('strays', s.cats.length);
        this.float(`+${add}`, s.x, 1.8, -s.d, 'good');
        this.sfx('meow', 1.1);
        this.burst(1, s.x, 1, -s.d, 6, new THREE.Color('#ff9fd6'), 2);
        for (const c of s.cats) if (this.team.length < this.maxShow) this.team.push(c);
        s.cats = [];
        this.syncTeam();
      }
    }
    // Rival teams: a fight starts when the fronts meet.
    for (const r of this.rivals) {
      if (r.count > 0 && r.d > this.d && front >= r.d - radiusZ(r.cats.length) - 0.3) {
        this.fightWith = r;
        this.state = 'fight';
        this.tradeClock = 0;
        this.music('intense');
        break;
      }
    }
    this.checkHits();
    this.collectCoins();
    if (this.count <= 0) return this.lose();
    if (this.state === 'run' && this.d >= this.level.length) {
      this.state = 'boss';
      this.tradeClock = 0;
      this.music('intense');
    }
  }

  private checkHits() {
    let lost = 0;
    for (const t of this.traps) {
      const td = t.move === 'roll' ? t.sd : t.d;
      if (Math.abs(td - this.d) > 16) continue;
      for (let i = this.team.length - 1; i >= 0; i--) {
        const c = this.team[i];
        if (c.safe > this.time) continue;
        for (const h of t.hits) {
          const dx = c.x - h.x;
          const dz = c.z - h.z;
          if (dx * dx + dz * dz >= (h.r + 0.15) * (h.r + 0.15)) continue;
          this.emberAcc += 0.12 * this.starLvl.ember;
          if (this.shield > 0 || this.emberAcc >= 1) {
            // A star cat saves this one.
            if (this.shield > 0) this.shield--;
            else this.emberAcc -= 1;
            c.safe = this.time + 1.6;
            this.burst(1, c.x, 0.8, c.z, 3, new THREE.Color('#bfe8ff'), 1.5);
          } else {
            this.team.splice(i, 1);
            this.poof(c.x, c.z);
            this.burst(1, c.x, 0.7, c.z, 2, GOLD, 2.5);
            lost++;
          }
          break;
        }
      }
    }
    if (lost) {
      this.count = Math.max(0, this.count - lost);
      this.shake = Math.min(0.6, this.shake + 0.12 + lost * 0.02);
      if (this.popClock > 0.12) {
        this.popClock = 0;
        this.sfx('thud', 1, 0.8);
        if (Math.random() < 0.4) this.sfx('meow', 1.3, 0.5);
      }
      this.streak = 0;
      this.syncTeam();
    }
  }

  private collectCoins() {
    if (!this.coinMesh) return;
    const magnet = this.starLvl.sunny > 0;
    for (const c of this.coins) {
      if (c.taken || Math.abs(c.d - this.d) > 6) continue;
      let hit = magnet && Math.abs(c.d - this.d) < 1;
      if (!hit) for (const cat of this.team) if (Math.abs(cat.x - c.x) < 0.45 && Math.abs(cat.z + c.d) < 0.45) { hit = true; break; }
      if (!hit) continue;
      c.taken = true;
      this.save.coins++;
      this.bump('coins');
      this.coinRun = this.coinClock < 0.5 ? this.coinRun + 1 : 0;
      this.coinClock = 0;
      this.sfx('coin', 1 + Math.min(10, this.coinRun) * 0.06, 0.7);
      this.refreshHud();
      this.burst(1, c.x, 0.6, -c.d, 3, GOLD, 1.6);
    }
  }

  private trade(other: number, k: number, otherCats: Cat[], otherZ: number) {
    const n = Math.min(k, this.count, other);
    this.count -= n;
    // Team cats that bump the rival go poof from the front.
    const showTarget = Math.min(this.count, this.maxShow);
    if (this.team.length > showTarget) this.removeNearest(this.team, this.team.length - showTarget, otherZ);
    this.syncTeam();
    const otherTarget = Math.min(other - n, this.maxShow / 2);
    if (otherCats.length > otherTarget) this.removeNearest(otherCats, otherCats.length - otherTarget, -this.d);
    this.shake = Math.max(this.shake, 0.22);
    if (this.popClock > 0.1) {
      this.popClock = 0;
      this.sfx('pop', 0.85 + Math.random() * 0.4, 0.6);
    }
    return n;
  }

  private updateFight(dt: number) {
    const r = this.fightWith!;
    // Both teams close in on each other.
    this.d = Math.min(this.d + 2 * dt, r.d - 0.5);
    const meet = -this.d - radiusZ(this.team.length) - 0.35;
    for (const c of r.cats) c.z = Math.min(c.z + 1.5 * dt, meet);
    this.tradeClock += dt;
    while (this.tradeClock > TRADE_TICK && this.count > 0 && r.count > 0) {
      this.tradeClock -= TRADE_TICK;
      const k = Math.max(1, Math.ceil(Math.min(this.count, r.count) / 25));
      r.count -= this.trade(r.count, k, r.cats, -r.d);
    }
    if (this.count <= 0) return this.lose();
    if (r.count <= 0) {
      r.cats.forEach((c) => this.poof(c.x, c.z));
      this.burst(1, 0, 1.2, -r.d, 24, null, 4);
      this.burst(2, 0, 1.5, -r.d, this.low ? 10 : 30, null, 3, 2);
      this.float(r.captain ? `Captain ${where(this.cur).world.captain} beaten!` : 'Won!', 0, 2.6, -r.d, 'good');
      this.sfx('cheer', 1, 0.8);
      this.bump('fights');
      if (r.captain) this.bump('captains');
      r.cats = [];
      this.fightWith = null;
      this.state = 'run';
      this.music('play');
    }
  }

  private updateBoss(dt: number) {
    const kz = -(this.level.length + 8.5);
    const stop = this.level.length + 5.5 - radiusZ(this.team.length);
    this.d = Math.max(this.d, Math.min(this.d + 3.5 * dt, stop));
    this.keeperX = Math.sin(this.time * 3) * 1.2;
    if (this.d < Math.min(this.level.length + 1, stop) - 0.01) return;
    this.tradeClock += dt;
    while (this.tradeClock > TRADE_TICK && this.count > 0 && this.keeperHp > 0) {
      this.tradeClock -= TRADE_TICK;
      const k = Math.max(1, Math.ceil(Math.min(this.count, this.keeperHp) / 25));
      this.keeperHp -= this.trade(this.keeperHp, k, [], kz);
      this.burst(1, this.keeperX + (Math.random() - 0.5) * 2, 1.5, kz + 1, 2, GOLD, 3);
    }
    if (this.keeperHp <= 0) {
      this.state = 'goal';
      this.goalClock = 0;
      this.kickBall.visible = true;
      this.sfx('kick');
      this.music('win');
    } else if (this.count <= 0) this.lose();
  }

  private updateGoal(dt: number) {
    const before = this.goalClock;
    this.goalClock += dt;
    const t = Math.min(1, this.goalClock / 0.8);
    const z0 = -this.d - 1;
    const gz = -(this.level.length + 10);
    const z1 = gz - 1.6;
    this.kickBall.position.set(this.cx * (1 - t) + 2.2 * t, 0.35 + Math.sin(t * Math.PI) * 1.6 + t * 1.3, z0 + (z1 - z0) * t);
    this.kickBall.rotation.x -= dt * 12;
    if (t >= 1) this.kickBall.position.y = Math.max(0.35, 1.65 - (this.goalClock - 0.8) * 3);
    // The keeper dives the wrong way.
    this.keeperX += (-2.2 - this.keeperX) * Math.min(1, dt * 5);
    this.keeperTilt += (1.2 - this.keeperTilt) * Math.min(1, dt * 5);
    if (this.goalClock >= 0.8) this.goal.ripple(this.goalClock - 0.8, 2.2, 1.65);
    if (before < 0.8 && this.goalClock >= 0.8) {
      this.shake = 0.7;
      this.burst(2, 0, 3, gz + 3, this.low ? 60 : 220, null, 7, 1.6);
      this.burst(1, 2.2, 1.6, gz, 30, null, 5);
      this.float('GOAL!', 0, 4.6, gz, 'goal');
      this.sfx('win');
      this.sfx('cheer', 1, 1);
    }
    // Fireworks over the stadium.
    this.fireClock -= dt;
    if (this.goalClock > 0.9 && this.fireClock <= 0 && this.goalClock < 14) {
      this.fireClock = 0.28 + Math.random() * 0.3;
      this.firework((Math.random() - 0.5) * 26, 9 + Math.random() * 7, gz - 4 - Math.random() * 10);
    }
    if (this.state === 'goal' && this.goalClock > 2.6) this.finish();
  }

  private moveTeam(dt: number) {
    const n = this.team.length;
    const p = { x: 0, z: 0 };
    const lim = W - 0.3;
    const pull = this.state === 'menu' ? 1 : Math.min(1, dt * 8);
    for (let i = 0; i < n; i++) {
      const c = this.team[i];
      slot(i, n, p);
      const tx = Math.max(-lim, Math.min(lim, this.cx + p.x));
      c.x += (tx - c.x) * pull;
      c.z += (-this.d + p.z - c.z) * pull;
      c.s += (1 - c.s) * Math.min(1, dt * 8);
    }
  }

  private lose() {
    this.resumeState = this.state === 'fight' ? 'fight' : this.state === 'boss' ? 'boss' : 'run';
    this.state = 'lost';
    this.persist();
    this.sfx('lose');
    this.music('menu');
    const opp = this.resumeState === 'fight' ? (this.fightWith?.count ?? 0) : this.resumeState === 'boss' ? this.keeperHp : 0;
    this.screens.lost(opp, this.revived);
  }
  revive(back: number) {
    this.revived = true;
    this.count = back;
    this.syncTeam(false);
    this.state = this.resumeState;
    this.tradeClock = 0;
    this.paused = false;
    this.music(this.state === 'run' ? 'play' : 'intense');
  }

  private finish() {
    const L = this.level;
    const s = this.save;
    const wh = where(L.n);
    const left = this.count;
    const stars = 1 + (left >= L.star2 ? 1 : 0) + (left >= L.star3 ? 1 : 0);
    const old = starsOf(s, L.n);
    if (stars > old) {
      const a = s.stars.padEnd(L.n, '0').split('');
      a[L.n - 1] = String(stars);
      s.stars = a.join('');
      this.bump('stars', stars - old);
    }
    const reward = Math.round(goalCoins(L.n, left, wh.final) * incomeMult(s.incomeLvl) * stadiumMult(s.stadiumLvl) * (1 + 0.08 * this.starLvl.sunny));
    s.coins += reward;
    this.bump('goals');
    const news: string[] = [];
    const first = L.n === s.level;
    if (first) s.level = L.n + 1;
    const cat = STARS.find((c) => c.at === L.n && !s.cats[c.id]);
    if (cat) {
      s.cats[cat.id] = 1;
      if (!s.captain) s.captain = cat.id;
      news.push(`Star cat ${cat.name} joins your team!`);
    }
    if (wh.final && first && !wh.endless) {
      this.bump('cups');
      news.push(`You won the ${wh.world.cup}!`);
    }
    const total = totalStars(s);
    for (const j of JERSEYS) {
      if (s.jerseys.includes(j.id)) continue;
      if ((j.cup !== undefined && s.level > (j.cup + 1) * MATCHES) || (j.stars !== undefined && total >= j.stars)) {
        s.jerseys.push(j.id);
        news.push(`New jersey: ${j.name}`);
      }
    }
    if (first && L.n === LAST_LEVEL) news.push('All 32 cups won. The Endless Cup is open!');
    this.bonusCats = 0;
    this.persist();
    this.state = 'end';
    for (let i = 0; i < stars; i++) setTimeout(() => this.sfx('star', 1 + i * 0.15), 250 + i * 220);
    if (news.length) setTimeout(() => this.sfx(cat ? 'unlock' : 'levelUp'), 1000);
    this.screens.end(reward, stars, news, wh.final && !wh.endless);
  }

  // ---------------- Render ----------------
  private put(i: number, x: number, y: number, z: number, ry: number, k: number, tilt: number, jersey: THREE.Color, trim: THREE.Color, fur: THREE.Color, phase: number, run: number, hop: number, num: number) {
    const c = this.cats;
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(run > 0 ? -0.12 : 0, ry, tilt)), tmpS.set(k, k, k));
    c.mesh.setMatrixAt(i, tmpM);
    c.jersey.setXYZ(i, jersey.r, jersey.g, jersey.b);
    c.trim.setXYZ(i, trim.r, trim.g, trim.b);
    c.fur.setXYZ(i, fur.r, fur.g, fur.b);
    c.anim.setXYZW(i, phase, run, hop, num);
    if (this.low) {
      tmpM.compose(tmpP.set(x, 0.02, z), tmpQ.identity(), tmpS.set(k, k, k));
      this.blob.setMatrixAt(i, tmpM);
    }
  }

  private render(dt: number) {
    const s = this.save;
    const wh = where(this.cur);
    const j = JERSEYS.find((x) => x.id === s.jersey) ?? JERSEYS[0];
    jerseyC.set(j.color);
    trimC.set(j.trim);
    rivalC.set(wh.world.rivalJersey);
    rivalT.set(wh.world.rivalTrim);
    const st = this.state;
    const running = st === 'run' || st === 'boss' || st === 'fight';
    const party = st === 'goal' || st === 'end';
    const run = running ? 1 : 0;
    const hop = party ? 0.32 : running ? 0.1 : 0.02;
    let idx = 0;
    const menu = st === 'menu';
    for (const c of this.team) {
      if (idx >= CAP - 4) break;
      this.put(idx++, c.x, 0, c.z, menu ? 0.5 : Math.PI, c.s, 0, jerseyC, trimC, FURS[c.fur], c.phase, run, hop, c.num);
    }
    const near = (z: number) => z < -this.d + 30 && z > -this.d - 110;
    let crown = 0;
    this.crowns.forEach((c) => (c.visible = false));
    const wear = (x: number, y: number, z: number, k: number) => {
      const c = this.crowns[crown++];
      c.visible = true;
      c.position.set(x, y + 0.93 * k, z);
      c.scale.setScalar(k * 1.1);
      c.rotation.y = this.time;
    };
    // The team's captain (a star cat) leads from the front.
    const capId = STARS.find((c) => c.id === s.captain);
    if (capId && this.team.length && st !== 'lost') {
      const z = menu ? 1.1 : -this.d - radiusZ(this.team.length) - 0.55;
      const x = menu ? 0.9 : this.cx;
      furC.set(capId.fur);
      this.put(idx++, x, 0, z, menu ? 0.5 : Math.PI, 1.5, 0, GOLD, trimC, furC, 0, run, hop, 0);
      wear(x, 0, z, 1.5);
    }
    for (const r of this.rivals) {
      if (!r.cats.length || !near(-r.d)) continue;
      const fight = this.fightWith === r;
      for (const c of r.cats) if (idx < CAP - 3) this.put(idx++, c.x, 0, c.z, 0, c.s, 0, rivalC, rivalT, FURS[c.fur], c.phase, fight ? 1 : 0, fight ? 0.1 : 0.03, c.num);
      if (r.captain) {
        const z = -r.d - radiusZ(r.cats.length) - 0.7 + (fight ? r.cats[0].z + r.d : 0);
        this.put(idx++, 0, 0, z, 0, 1.8, 0, rivalT, rivalC, FURS[3], 1, 0, 0.06, 0);
        wear(0, 0, z, 1.8);
      }
    }
    for (const sg of this.strays) if (near(-sg.d)) for (const c of sg.cats) this.put(idx++, c.x, 0, c.z, 0, 0.9, 0, strayC, WHITE, FURS[c.fur], c.phase, 0, 0.06, 15);
    // Goalkeeper: a big cat with gloves; cup finals have a crowned boss keeper.
    const kz = -(this.level.length + 8.5);
    const ks = wh.final ? 3.3 : 2.6;
    const kWob = st === 'boss' && this.tradeClock > 0 ? 1 + Math.sin(this.time * 40) * 0.03 : 1;
    this.put(idx++, this.keeperX, 0, kz, 0, ks * kWob, this.keeperTilt, keeperC, keeperT, wh.final ? FURS[3] : FURS[2], 0, 0, st === 'boss' ? 0.04 : 0.01, 0);
    if (wh.final) wear(this.keeperX - Math.sin(this.keeperTilt) * 0.93 * ks, (Math.cos(this.keeperTilt) - 1) * 0.93 * ks, kz, ks);
    this.gloves.forEach((g, i) => {
      const sx = (i ? 1 : -1) * 0.34;
      const up = 0.56 + Math.abs(Math.sin(this.time * 8 + i)) * (st === 'boss' ? 0.22 : 0.05);
      const ct = Math.cos(this.keeperTilt);
      const sn = Math.sin(this.keeperTilt);
      g.position.set(this.keeperX + (sx * ct - up * sn) * ks, (sx * sn + up * ct) * ks, kz + 0.1 * ks);
      g.scale.setScalar(ks);
    });
    const cm = this.cats;
    cm.mesh.count = idx;
    this.blob.count = idx;
    for (const a of [cm.mesh.instanceMatrix, cm.jersey, cm.trim, cm.fur, cm.anim, this.blob.instanceMatrix]) a.needsUpdate = true;
    this.catU.userData.u.uTime.value = this.time;
    this.catU.userData.u.uCheer.value = this.cheer;

    // Particles
    const n = [0, 0, 0];
    for (const b of this.bits) {
      const k = b.kind;
      const life = b.age / b.life;
      const sz = (k === 0 ? Math.sin(life * Math.PI) : k === 1 ? 1 - life * life : Math.min(1, (1 - life) * 4)) * b.size;
      tmpQ.setFromEuler(tmpE.set(k === 2 ? b.spin + b.age * 9 : 0, k ? b.spin + b.age * 5 : 0, k === 1 ? b.age * 4 : 0));
      tmpM.compose(tmpP.set(b.x, b.y, b.z), tmpQ, tmpS.set(sz, sz, sz));
      this.bitMesh[k].setMatrixAt(n[k], tmpM);
      this.bitMesh[k].setColorAt(n[k], b.color);
      if (++n[k] >= this.bitMesh[k].instanceMatrix.count) break;
    }
    this.bitMesh.forEach((m, k) => {
      m.count = n[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    });

    // Coins spin
    if (this.coinMesh) {
      this.coins.forEach((c, i) => {
        tmpQ.setFromEuler(tmpE.set(0, this.time * 3 + i * 0.4, 0));
        tmpM.compose(tmpP.set(c.x, 0.55 + Math.sin(this.time * 4 + i) * 0.08, -c.d), tmpQ, tmpS.setScalar(c.taken ? 0 : 1));
        this.coinMesh!.setMatrixAt(i, tmpM);
      });
      this.coinMesh.instanceMatrix.needsUpdate = true;
    }

    // Camera: follows the team and pulls back as it grows; a hero shot in menus; sweeps up at a goal.
    const R = Math.min(5, radiusZ(this.team.length));
    const c = this.camera.position;
    let look: [number, number, number];
    let f = this.snapCam ? 1 : 1 - Math.pow(0.004, dt);
    if (menu) {
      const a = 0.5 + Math.sin(this.time * 0.25) * 0.12;
      const wide = this.camera.aspect > 1.2;
      const far = 4.6 + R * 2.2;
      camT.set(Math.sin(a) * far - (wide ? 1.9 : 0) * (far / 4.6), 1.9 + R * 0.8, 0.9 + Math.cos(a) * far);
      look = [(wide ? -1.7 : 0) * (far / 4.6), 0.75, 0];
      f = 1;
    } else if (party) {
      const k = Math.min(1, this.goalClock / 2.2);
      camT.set(this.cx * 0.3, 6.5 + R * 0.7 - k * 2, -this.d + 9 + R - k * 3);
      look = [0, 2.2 + k, -(this.level.length + 10)];
    } else {
      const x = this.cx * 0.5;
      camT.set(x, 6.5 + R * 0.7, -this.d + 8.5 + R * 0.9);
      look = [x * 0.6, 0.5, -this.d - 7];
    }
    this.snapCam = false;
    c.lerp(camT, f);
    lookAt.lerp(tmpP.set(...look), f);
    this.camera.lookAt(lookAt);
    if (this.shake > 0 && !this.paused) {
      c.x += (Math.random() - 0.5) * this.shake * 0.35;
      c.y += (Math.random() - 0.5) * this.shake * 0.35;
    }
    this.sun.target.position.set(0, 0, c.z - 16);
    this.sun.position.set(-16, 30, c.z - 16 + 14);
    const w = this.world!;
    w.follow.position.set(c.x, 0, c.z);
    if (w.dragon) {
      const a = this.time * 0.35;
      w.dragon.position.set(Math.sin(a) * 34, 17 + Math.sin(a * 2) * 2, -this.d - 55 + Math.cos(a) * 26);
      w.dragon.rotation.set(0, a + Math.PI / 2, Math.sin(a * 3) * 0.15);
    }
    if (this.low) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
    this.updateLabels();
  }

  private place(el: HTMLElement, x: number, y: number, z: number, text: string) {
    const v = tmpP.set(x, y, z).project(this.camera);
    const show = v.z < 1 && text !== '';
    el.style.display = show ? 'block' : 'none';
    if (!show) return;
    el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2) * this.root.clientWidth}px,${((1 - v.y) / 2) * this.root.clientHeight}px)`;
    if (el.textContent !== text) el.textContent = text;
  }

  private updateLabels() {
    const inPlay = this.state !== 'menu';
    this.labels.style.display = inPlay ? 'block' : 'none';
    if (!inPlay) return;
    const R = radiusZ(this.team.length);
    this.place(this.countLabel, this.cx, 1.5 + Math.min(5, R) * 0.2, -this.d + R * 0.3, this.state === 'end' ? '' : String(this.count));
    for (const r of this.rivals) {
      const vis = r.count > 0 && -r.d > -this.d - 70;
      this.place(r.label, 0, r.captain ? 2.4 : 1.4, -r.d, vis ? (r.captain ? `${where(this.cur).world.captain} · ${r.count}` : String(r.count)) : '');
    }
    const wh = where(this.cur);
    const showK = this.keeperHp > 0 && this.d > this.level.length - 40;
    this.place(this.keeperLabel, this.keeperX, wh.final ? 4.3 : 3.5, -(this.level.length + 8.5), showK ? (wh.final ? `${wh.world.keeper} · ${this.keeperHp}` : String(this.keeperHp)) : '');
    this.bar.style.left = `${Math.min(100, (this.d / this.level.length) * 100)}%`;
  }

  resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the whole track width in view on tall tablet screens.
    this.camera.fov = w / h < 1 ? 70 : 55;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- Input ----------------
  private bindInput() {
    const cv = this.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') {
        this.dragId = e.pointerId;
        this.dragLast = e.clientX;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const w = cv.clientWidth;
      if (e.pointerType === 'mouse') {
        // Trackpad or mouse: the pointer's place across the screen sets the team's place across the track.
        if (this.state === 'run' || this.state === 'fight' || this.state === 'boss') this.targetX = ((e.clientX / w - 0.5) * 2.6) * (W - 0.8);
      } else if (e.pointerId === this.dragId) {
        this.targetX += ((e.clientX - this.dragLast) / w) * W * 3.2;
        this.dragLast = e.clientX;
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.dragId) this.dragId = -1;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    window.addEventListener('keydown', (e) => {
      if (this.screens.open) return this.screens.key(e);
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') return this.screens.pause();
      this.keys.add(e.key);
      if (e.key.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
  }
  clearKeys() {
    this.keys.clear();
  }

  // ---------------- Bonus (school questions) ----------------
  /** Shows the platform's question card; the game stays paused while it is open. Epic = the harder pencil-and-paper kind. */
  async bonus(reward: string, epic = false): Promise<boolean> {
    const wasPaused = this.paused;
    this.paused = true;
    this.screens.busy(true);
    try {
      const r = await this.cam.earnBonus(epic ? { reward, size: 'epic' } : { reward });
      if (r.earned) {
        this.bump('answers');
        this.sfx('sparkle');
      }
      return r.earned;
    } finally {
      this.screens.busy(false);
      this.paused = wasPaused;
    }
  }

  // ---------------- Flow ----------------
  refreshHud() {
    const wh = where(this.cur);
    this.levelPill.textContent = wh.endless ? `Endless ${this.cur - LAST_LEVEL}` : `${wh.world.cup} ${wh.final ? 'Final' : wh.match + 1 + '/' + MATCHES}`;
    this.coinPill.innerHTML = `<i class="rn-coin"></i>${this.save.coins}`;
  }
  /** Back to the menus with level n set up behind them. */
  toMenu(n = Math.min(this.cur, this.save.level)) {
    this.state = 'menu';
    this.paused = false;
    this.loadLevel(n);
    this.hud.classList.remove('on');
    this.hint.classList.remove('on');
    this.music('menu');
  }
  play(n = this.cur) {
    this.screens.close();
    this.loadLevel(n);
    this.state = 'run';
    this.paused = false;
    this.hud.classList.add('on');
    this.refreshHud();
    this.hint.classList.add('on');
    this.hintClock = 4;
    this.music('play');
    this.crowd ??= this.cam.audio?.loop('crowd') ?? null;
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const camT = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const jerseyC = new THREE.Color();
const trimC = new THREE.Color();
const rivalC = new THREE.Color();
const rivalT = new THREE.Color();
const furC = new THREE.Color();
const strayC = new THREE.Color('#d8d8e4');
const keeperC = new THREE.Color('#b6f03c');
const keeperT = new THREE.Color('#2a2235');
