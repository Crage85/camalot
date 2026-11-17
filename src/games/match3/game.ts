// Whisker Castle: screens, input, saves, sound and bonus hooks. Gets the platform services passed in; never imports core.
import './style.css';
import {
  DirectionalLight, Group, HalfFloatType, HemisphereLight, Mesh, PMREMGenerator, PerspectiveCamera, Scene, Vector2,
  WebGLRenderTarget, WebGLRenderer, type BufferGeometry, type Material, type Texture,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Camalot, SfxName, SfxOptions } from '../../core/contract';
import { Board, isSpecial, type Goal, type Kind, type Step } from './board';
import { LEVELS, PER_WORLD, WORLDS } from './levels';
import { BoardView, type BoardEvent } from './view';
import { MapView } from './map';
import { AREAS, CastleView, ITEMS } from './castle';
import { ACCESSORIES, CATS, catGeometry, type CatDef } from './cats';
import {
  basketGeometry, crabGeometry, crateGeometry, crownGeometry, dustGeometry, eggGeometry, gloss, hammerGeometry, iceGeometry,
  pieceGeometry, puffGeometry, rainbowGeometry, rockGeometry, setGloss, shuffleGeometry, trailGeometry, vineGeometry, wandGeometry,
} from './art';
import { reducedMotion, type Rect } from './util';

type BoosterId = 'hammer' | 'shuffle' | 'puff' | 'rainbow';
type Quality = 'auto' | 'high' | 'low';
interface Stats { specials: number; kittens: number; chain: number; doubles: number }
export interface SaveData {
  v: 2; stars: number[]; best: number[]; crowns: number[]; boosters: Record<BoosterId, number>; castle: Record<string, number>;
  /** Owned cat id -> outfit id ('' = none). */
  cats: Record<string, string>;
  /** Outfits bought with crowns. */
  acc: string[];
  /** Trophies already paid out. */
  done: string[];
  stats: Stats; quality: Quality;
}
interface SaveV1 { v: 1; stars: number[]; best: number[]; boosters: Record<BoosterId, number>; castle: Record<string, number> }

const BOOSTER: Record<BoosterId, { name: string; bonus: string; key: string }> = {
  hammer: { name: 'Hammer', bonus: 'One hammer', key: 'H' },
  shuffle: { name: 'Shuffle', bonus: 'One shuffle', key: 'R' },
  puff: { name: 'Fire puff', bonus: 'Start with a fire puff and a wand', key: '1' },
  rainbow: { name: 'Rainbow', bonus: 'Start with a rainbow orb', key: '2' },
};
const BOOSTER_IDS = Object.keys(BOOSTER) as BoosterId[];
/** First win of every 3rd level pays one booster, in this order. */
const REWARD_CYCLE: BoosterId[] = ['hammer', 'puff', 'shuffle', 'rainbow'];
const rewardFor = (n: number): BoosterId | null => ((n + 1) % 3 === 0 ? REWARD_CYCLE[((n + 1) / 3 - 1) % 4] : null);
/** First win of levels 5, 10, 15 and 20 of a world rescues one of its four cats. */
const catFor = (n: number): CatDef | null => (n % 5 === 4 ? CATS[Math.floor(n / PER_WORLD) * 4 + ((n % PER_WORLD) - 4) / 5] : null);
const HINT_AFTER = 6; // seconds idle before a hint wiggle
const LOW_MOVES = 5; // music turns intense
const CHEST = 2; // boosters of each kind in the epic treasure chest
const CALLOUT = ['', '', 'Nice!', 'Purr-fect!', 'Meow-velous!', 'Cat-tastic!'];

interface Trophy { id: string; name: string; goal: number; stat: (g: Game) => number; reward: [BoosterId, number] }
const tiers = (id: string, name: (n: number) => string, goals: number[], stat: (g: Game) => number, rewards: BoosterId[]): Trophy[] =>
  goals.map((goal, k) => ({ id: id + goal, name: name(goal), goal, stat, reward: [rewards[k % rewards.length], 1 + Math.floor(k / 2)] }));
const TROPHIES: Trophy[] = [
  ...tiers('lv', (n) => `Win ${n} levels`, [20, 60, 120, 180, 240], (g) => g.wonLevels(), ['hammer', 'puff']),
  ...tiers('st', (n) => `Earn ${n} stars`, [50, 150, 300, 450, 600, 720], (g) => g.totalStars(), ['shuffle', 'rainbow']),
  ...tiers('cr', (n) => `Win ${n} crown challenges`, [10, 50, 120, 240], (g) => g.totalCrowns(), ['rainbow', 'puff']),
  ...tiers('ct', (n) => `Rescue ${n} cats`, [12, 24, 48, 52], (g) => Object.keys(g.save.cats).length, ['hammer', 'rainbow']),
  ...tiers('it', (n) => `Build ${n} kingdom pieces`, [10, 30, 54], (g) => Object.keys(g.save.castle).length, ['puff', 'shuffle']),
  ...tiers('sp', (n) => `Make ${n} specials`, [100, 500, 2000], (g) => g.save.stats.specials, ['hammer', 'puff']),
  ...tiers('kt', (n) => `Carry ${n} kittens to safety`, [25, 100], (g) => g.save.stats.kittens, ['shuffle', 'rainbow']),
  ...tiers('ch', (n) => `Make a chain of ${n}`, [4, 6], (g) => g.save.stats.chain, ['puff', 'rainbow']),
  ...tiers('db', () => 'Swap two rainbow orbs', [1], (g) => g.save.stats.doubles, ['rainbow']),
];

const STAR = '<svg class="star{c}" viewBox="0 0 24 24"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>';
const star = (on: boolean) => STAR.replace('{c}', on ? ' on' : '');
const stars = (n: number) => [0, 1, 2].map((k) => star(k < n)).join('');
const CROWN = '<svg class="crown{c}" viewBox="0 0 24 24"><path d="M3 18h18l1.5-10-5.5 4-5-7-5 7-5.5-4z"/></svg>';
const crown = (on = true) => CROWN.replace('{c}', on ? ' on' : '');
// Lucide "check" (ISC)
const CHECK = '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const key = (k: string) => `<span class="cm-key">${k}</span>`;

export function freshSave(): SaveData {
  return {
    v: 2, stars: [], best: [], crowns: [], boosters: { hammer: 1, shuffle: 1, puff: 1, rainbow: 1 }, castle: {}, cats: {}, acc: [], done: [],
    stats: { specials: 0, kittens: 0, chain: 0, doubles: 0 }, quality: 'auto',
  };
}

/** Old saves had 3 worlds of 12 levels. Those levels now sit at the start of the first 3 worlds of 20. */
export function migrate(raw: SaveData | SaveV1 | null): SaveData {
  const s = freshSave();
  if (!raw) return s;
  if (raw.v === 2) return { ...s, ...raw, stats: { ...s.stats, ...raw.stats } };
  if (raw.v !== 1) return s;
  const move = (list: number[]) => {
    const out: number[] = [];
    list.forEach((v, n) => { if (v) out[Math.floor(n / 12) * PER_WORLD + (n % 12)] = v; });
    return out;
  };
  return { ...s, stars: move(raw.stars ?? []), best: move(raw.best ?? []), boosters: { ...s.boosters, ...raw.boosters }, castle: { ...raw.castle } };
}

/** Renders small pictures of game pieces and cats for the HTML panels. */
class Icons {
  private r = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  private scene = new Scene();
  private cam = new PerspectiveCamera(30, 1, 0.1, 20);
  private cache = new Map<string, string>();
  readonly pic: Record<string, string> = {};

  constructor() {
    this.r.setPixelRatio(1);
    this.r.setSize(112, 112, false);
    this.scene.environment = new PMREMGenerator(this.r).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    this.scene.add(new HemisphereLight(0xffffff, 0x8a6ab0, 1.6));
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(-3, 5, 8);
    this.scene.add(sun);
    this.cam.position.set(0, -0.3, 2.5);
    this.cam.lookAt(0, 0, 0);
    const m = gloss();
    const shot = (name: string, parts: [BufferGeometry, Material?][], z = 0) => (this.pic[name] = this.shot(parts, z));
    for (let c = 0; c < 6; c++) shot('p' + c, [[pieceGeometry(c), m]]);
    shot('kitten', [[basketGeometry(), m], [catGeometry(CATS[3], null).translate(0, -0.33, 0).scale(0.72, 0.72, 0.72), m]]);
    shot('crate', [[crateGeometry(), m]], -0.4);
    shot('vine', [[vineGeometry(), m]], -0.3);
    shot('ice', [[pieceGeometry(4), m], [iceGeometry(), gloss({ color: 0xbff0ff, transparent: true, opacity: 0.6, roughness: 0.05 })]], -0.5);
    shot('dust', [[dustGeometry(), gloss({ color: 0xe07bff, emissive: 0x882299 })]], -0.2);
    shot('crab', [[crabGeometry(), m]], 0.9);
    shot('trail', [[trailGeometry(), m]], -0.2);
    shot('egg', [[eggGeometry(), m]], -0.2);
    shot('rock', [[rockGeometry(), gloss({ flatShading: true, roughness: 0.8 })]], -0.3);
    shot('special', [[pieceGeometry(2), m], [wandGeometry(), m]], -0.2);
    shot('hammer', [[hammerGeometry(), m]], 0.5);
    shot('shuffle', [[shuffleGeometry(), m]], 0.3);
    shot('puff', [[pieceGeometry(1), m], [puffGeometry(), gloss({ emissive: 0xff5a00 })]], -0.4);
    shot('rainbow', [[rainbowGeometry(), m]]);
    shot('crown', [[crownGeometry(), m]]);
  }

  private shot(parts: [BufferGeometry, Material?][], z = 0): string {
    const g = new Group();
    for (const [geo, m] of parts) g.add(new Mesh(geo, m));
    g.position.z = z;
    this.scene.add(g);
    this.r.render(this.scene, this.cam);
    this.scene.remove(g);
    return this.r.domElement.toDataURL();
  }

  cat(c: CatDef, acc: string): string {
    const k = c.id + '/' + acc;
    if (!this.cache.has(k)) {
      const g = catGeometry(c, acc || null).rotateY(0.35).translate(0, -0.52, 0);
      this.cache.set(k, this.shot([[g, gloss({ roughness: 0.7, clearcoatRoughness: 0.6 })]], -0.6));
      g.dispose();
    }
    return this.cache.get(k)!;
  }
}

export async function runGame(camalot: Camalot): Promise<void> {
  const g = new Game(camalot, migrate(await camalot.save.load<SaveData | SaveV1>()));
  if (import.meta.env.DEV) (window as unknown as { m3: unknown }).m3 = g; // screenshot harness only
}

type Screen = 'map' | 'pre' | 'play' | 'castle' | 'cats';

class Game {
  private canvas = document.createElement('canvas');
  private ui = document.createElement('div');
  private renderer: WebGLRenderer;
  private composer: EffectComposer;
  private pass: RenderPass;
  private bloom: UnrealBloomPass;
  private view = new BoardView();
  private map = new MapView();
  private castle = new CastleView();
  private icons = new Icons();
  private hi = true;
  private slow = 0;
  private screen: Screen = 'map';
  private board: Board | null = null;
  private level = 0;
  private crownRun = false;
  private world = 0;
  private area = 0;
  private catId = '';
  private busy = false;
  private modal: 'none' | 'pause' | 'win' | 'lose' | 'bonus' | 'info' = 'none';
  private picked = new Set<BoosterId>();
  private hammerOn = false;
  private lastInput = 0;
  private down: { i: number; x: number; y: number; moved: boolean } | null = null;
  private t = 0;
  private back: (() => void) | null = null;
  private keys: Record<string, () => void> = {};
  private watch = new ResizeObserver(() => this.resize());
  private lastSfx: Record<string, number> = {};
  private seenMade = 0;
  private seenRescued = 0;

  constructor(private camalot: Camalot, readonly save: SaveData) {
    this.canvas.id = 'm3-canvas';
    this.ui.id = 'm3-ui';
    document.body.prepend(this.canvas, this.ui);
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    const env: Texture = new PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    for (const s of [this.view.scene, this.map.scene]) { s.environment = env; s.environmentIntensity = 0.3; }
    this.castle.scene.environment = env; // the kingdom sets its own intensity
    this.composer = new EffectComposer(this.renderer, new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 }));
    this.pass = new RenderPass(this.view.scene, this.view.camera);
    this.bloom = new UnrealBloomPass(new Vector2(4, 4), 0.32, 0.5, 1.1);
    this.composer.addPass(this.pass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.view.onEvent = (e) => this.boardSound(e);
    this.grantCats();
    this.syncKingdom();
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    addEventListener('keydown', (e) => this.onKey(e));
    this.ui.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (b && !b.disabled && this.modal !== 'bonus') this.act(b.dataset.act!, b);
    });
    this.ui.addEventListener('focusin', (e) => this.onFocus(e.target as HTMLElement));
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', () => this.onUp());
    addEventListener('pointercancel', () => (this.down = null));
    this.showMap();
    let last = performance.now();
    const loop = (now: number) => {
      const real = Math.max(0, (now - last) / 1000); // the first frame's stamp can be older than `last`
      const dt = Math.min(0.05, real);
      this.watchSpeed(real);
      last = now;
      this.t += dt;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------- sound ----------

  private sfx(name: SfxName, o: SfxOptions = {}, gap = 0.05): void {
    if (this.t - (this.lastSfx[name] ?? -1) < gap) return;
    this.lastSfx[name] = this.t;
    this.camalot.audio.sfx(name, { ...o, pitch: (o.pitch ?? 1) * (0.96 + Math.random() * 0.08) });
  }
  private music(): void {
    const b = this.board;
    const mood = this.screen !== 'play' ? 'menu' : this.modal === 'win' ? 'win' : b && b.moves <= LOW_MOVES && !b.won() ? 'intense' : 'play';
    this.camalot.audio.music('match3', mood);
  }
  private boardSound(e: BoardEvent): void {
    switch (e) {
      case 'crate': return this.sfx('crunch');
      case 'vine': return this.sfx('snip');
      case 'grow': return this.sfx('grow');
      case 'ice': return this.sfx('crunch', { pitch: 1.6, volume: 0.8 });
      case 'dust': return this.sfx('sparkle', { volume: 0.5 });
      case 'egg': return this.sfx('thud', { pitch: 1.4 });
      case 'rock': return this.sfx('crunch', { pitch: 0.7 });
      case 'trail': return this.sfx('whoosh', { volume: 0.3, pitch: 1.5 }, 0.15);
      case 'land': return this.sfx('thud', { volume: 0.16, pitch: 1.3 }, 0.09);
    }
  }
  private stepSound(s: Step, removed: number): void {
    if (s.type === 'swap') this.sfx('swap');
    if (s.type === 'bad') this.sfx('error');
    if (s.type === 'shuffle') this.sfx('whoosh');
    if (s.type === 'convert') this.sfx('sparkle');
    if (s.type === 'clear' && removed) {
      this.sfx('match', { pitch: 1 + 0.12 * Math.min(8, s.depth - 1) }, 0);
      if (s.depth >= 3) this.sfx('cascade', { pitch: 1 + 0.06 * (s.depth - 3), volume: 0.7 });
    }
    for (const f of s.fx) {
      if (f.t === 'line') this.sfx('whoosh');
      if (f.t === 'blast') this.sfx('explode');
      if (f.t === 'fly') this.sfx('whoosh', { pitch: 1.5 });
      if (f.t === 'beam') this.sfx('sparkle', { pitch: 1.3 });
      if (f.t === 'rescue') { this.sfx('meow'); this.sfx('cheer', { volume: 0.6 }); }
      if (f.t === 'hatch') { this.sfx('explode', { pitch: 1.4, volume: 0.8 }); this.sfx('gulp', { pitch: 1.5 }); }
      if (f.t === 'catch') { this.sfx('pop', { pitch: 1.3 }); this.sfx('coin'); }
      if (f.t === 'hop') this.sfx('pop', { pitch: 0.8, volume: 0.5 });
      if (f.t === 'make') this.sfx(f.kind === 'rainbow' || f.kind === 'bomb' ? 'boost' : 'sparkle', { pitch: 1.1 });
    }
  }

  // ---------- quality ----------

  private autoHigh(): boolean {
    return !matchMedia('(pointer: coarse)').matches && (navigator.hardwareConcurrency ?? 4) > 4;
  }
  private applyQuality(): void {
    const q = this.save.quality;
    this.hi = q === 'high' || (q === 'auto' && this.autoHigh() && this.slow < 3);
    setGloss(this.hi);
    this.view.setQuality(this.hi);
    this.map.setQuality(this.hi);
    this.castle.setQuality(this.hi);
    this.resize();
  }
  /** On Auto, drops to Low if frames stay slow for 3 seconds. */
  private watchSpeed(dt: number): void {
    if (this.save.quality !== 'auto' || !this.hi || document.hidden) return;
    this.slow = dt > 1 / 28 ? this.slow + dt : Math.max(0, this.slow - dt);
    if (this.slow >= 3) this.applyQuality();
  }

  // ---------- frame + layout ----------

  private resize(): void {
    const W = innerWidth;
    const H = innerHeight;
    const ratio = Math.min(devicePixelRatio, this.hi ? 2 : 1.25);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(W, H, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(W, H);
    let r: Rect = { x: 0, y: 0, w: W, h: H };
    const box = (sel: string) => this.ui.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    const panel = box('.m3-hud, .m3-side');
    if (this.screen === 'map') {
      const top = box('.m3-topbar')?.bottom ?? 0;
      r = { x: 8, y: top + 4, w: W - 16, h: (box('.m3-botbar')?.top ?? H) - top - 8 };
    } else if (panel) {
      const help = this.screen === 'play' || this.screen === 'pre' ? 56 : 0;
      if (panel.height > H * 0.7) r = { x: panel.right + 8, y: 8, w: W - panel.right - 16, h: H - 16 - help };
      else if (panel.top + panel.bottom < H) r = { x: 8, y: panel.bottom + 8, w: W - 16, h: H - panel.bottom - 16 - help };
      else r = { x: 0, y: 0, w: W, h: panel.top - 8 };
    }
    r.w = Math.max(50, r.w);
    r.h = Math.max(50, r.h);
    this.view.setRegion(r, W, H);
    this.map.setRegion(r, W, H);
    this.castle.setRegion(r, W, H);
    this.placeNodes();
  }

  private frame(dt: number): void {
    const play = (this.screen === 'play' || this.screen === 'pre') && this.board;
    const v = play ? this.view : this.screen === 'map' ? this.map : this.castle;
    if (v === this.view) {
      if (!this.busy && this.modal === 'none' && this.board && this.t - this.lastInput > HINT_AFTER && !this.view.hint) this.view.hint = this.board.findMove();
      this.view.update(this.t, dt);
    } else if (v === this.map) this.map.update(this.t);
    else this.castle.update(this.t, dt);
    if (this.hi) {
      this.bloom.threshold = v === this.castle ? 1.45 : 1.1; // the kingdom has large white areas
      this.bloom.strength = v === this.castle ? 0.18 : 0.32;
      this.pass.scene = v.scene;
      this.pass.camera = v.camera;
      this.composer.render(dt);
    } else this.renderer.render(v.scene, v.camera);
  }

  private mount(html: string, back: (() => void) | null, keys: Record<string, () => void> = {}, focus = '.main'): void {
    this.ui.innerHTML = html;
    this.back = back;
    this.keys = keys;
    this.modal = 'none';
    this.watch.disconnect();
    for (const p of this.ui.querySelectorAll('.m3-hud, .m3-side, .m3-topbar, .m3-botbar')) this.watch.observe(p);
    this.resize();
    const f = this.ui.querySelector<HTMLElement>(focus) ?? this.ui.querySelector<HTMLElement>('[data-act]:not(:disabled)');
    f?.focus();
    this.music();
  }

  /** Adds a modal panel over the current screen (HUD stays). */
  private overlay(html: string, back: (() => void) | null, keys: Record<string, () => void> = {}): void {
    this.ui.querySelectorAll('.m3-over').forEach((e) => e.remove());
    const wrap = document.createElement('div');
    wrap.className = 'm3-over';
    wrap.innerHTML = `<div class="m3-scrim"></div><div class="cm-panel m3-modal">${html}</div>`;
    this.ui.append(wrap);
    this.back = back;
    this.keys = keys;
    wrap.querySelector<HTMLElement>('.main')?.focus();
  }
  private closeOverlay(): void {
    this.ui.querySelectorAll('.m3-over').forEach((e) => e.remove());
    this.modal = 'none';
    if (this.screen === 'play') { this.back = () => this.pause(); this.keys = this.playKeys(); } else this.showMap(this.world);
  }

  private store(): void { void this.camalot.save.store(this.save); }

  private async bonus(reward: string, epic = false): Promise<boolean> {
    const prev = this.modal;
    this.modal = 'bonus';
    try {
      const r = await this.camalot.earnBonus(epic ? { reward, size: 'epic' } : { reward });
      return r.earned;
    } finally {
      this.modal = prev;
    }
  }

  // ---------- progress ----------

  private unlocked(n: number): boolean { return n === 0 || (this.save.stars[n - 1] ?? 0) > 0 || (this.save.stars[n] ?? 0) > 0; }
  totalStars(): number { return this.save.stars.reduce((a, b) => a + (b ?? 0), 0); }
  wonLevels(): number { return this.save.stars.filter((s) => s > 0).length; }
  totalCrowns(): number { return this.save.crowns.filter((c) => c > 0).length; }
  private freeStars(): number { return this.totalStars() - ITEMS.reduce((a, it) => a + (this.save.castle[it.id] !== undefined ? it.cost : 0), 0); }
  private freeCrowns(): number { return this.totalCrowns() - ACCESSORIES.reduce((a, x) => a + (this.save.acc.includes(x.id) ? x.cost : 0), 0); }
  /** Areas open in the kingdom: one per world reached. */
  private areasOpen(): number { return WORLDS.filter((w) => this.unlocked(w.from)).length; }
  private worldDone(k: number): boolean { return (this.save.stars[WORLDS[k].from + PER_WORLD - 1] ?? 0) > 0; }

  /** Every won milestone level has its cat (also covers migrated saves). */
  private grantCats(): CatDef[] {
    const got: CatDef[] = [];
    this.save.stars.forEach((s, n) => {
      const c = s > 0 ? catFor(n) : null;
      if (c && this.save.cats[c.id] === undefined) { this.save.cats[c.id] = ''; got.push(c); }
    });
    return got;
  }
  private syncKingdom(): void {
    this.castle.setState({ castle: this.save.castle, cats: this.save.cats, areas: this.areasOpen() });
  }
  /** Pays out any trophy just reached. Returns lines for the screen. */
  private trophies(): string[] {
    const out: string[] = [];
    for (const tr of TROPHIES) {
      if (this.save.done.includes(tr.id) || tr.stat(this) < tr.goal) continue;
      this.save.done.push(tr.id);
      this.save.boosters[tr.reward[0]] += tr.reward[1];
      out.push(`<div class="m3-row m3-prize"><img class="icon" src="${this.icons.pic[tr.reward[0]]}" alt=""><span>Trophy: ${tr.name}<br><b>+${tr.reward[1]} ${BOOSTER[tr.reward[0]].name}</b></span></div>`);
    }
    return out;
  }
  private toast(html: string): void {
    const d = document.createElement('div');
    d.className = 'cm-panel m3-toast';
    d.innerHTML = html;
    this.ui.append(d);
    setTimeout(() => d.remove(), 3200);
  }
  /** After a purchase or rescue outside a level. */
  private afterGain(): void {
    const lines = this.trophies();
    this.store();
    if (lines.length) { this.sfx('unlock'); this.toast(lines.join('')); }
  }

  // ---------- map ----------

  private showMap(world?: number): void {
    this.screen = 'map';
    this.board = null;
    const next = LEVELS.findIndex((_, n) => this.unlocked(n) && !this.save.stars[n]);
    const cur = next < 0 ? LEVELS.length - 1 : next;
    this.world = world ?? Math.floor(cur / PER_WORLD);
    const w = WORLDS[this.world];
    const state = Array.from({ length: PER_WORLD }, (_, k) => (this.unlocked(w.from + k) ? this.save.stars[w.from + k] ?? 0 : -1));
    this.map.setWorld(this.world, state, Math.floor(cur / PER_WORLD) === this.world ? cur - w.from : -1);
    const nodes = state.map((s, k) => {
      const n = w.from + k;
      return `<button class="m3-node${n === cur ? ' main' : ''}${LEVELS[n].hard ? ' hard' : ''}${s > 0 ? ' won' : ''}" data-act="level" data-n="${n}" ${s < 0 ? 'disabled' : ''} aria-label="Level ${n + 1}">${this.save.crowns[n] ? crown() : ''}<b>${n + 1}</b><span>${s > 0 ? stars(s) : ''}</span></button>`;
    }).join('');
    const got = state.reduce((a, s) => a + Math.max(0, s), 0);
    this.mount(`<div class="cm-panel m3-topbar">
        <button class="cm-btn" data-act="world" data-n="${this.world - 1}" ${this.world ? '' : 'disabled'} aria-label="World before">${key('Q')} &#9664;</button>
        <div class="m3-world"><h1 class="cm-title">${w.name}</h1><div class="cm-help">World ${this.world + 1} of ${WORLDS.length}. ${w.adds}</div></div>
        <button class="cm-btn" data-act="world" data-n="${this.world + 1}" ${this.world + 1 < WORLDS.length ? '' : 'disabled'} aria-label="Next world">&#9654; ${key('E')}</button>
        <span class="m3-total m3-num"><small>World</small>${star(true)}${got}/${PER_WORLD * 3}</span>
        <span class="m3-total m3-num"><small>Spend</small>${star(true)}${this.freeStars()}</span>
        <span class="m3-total m3-num">${crown()}${this.freeCrowns()}</span>
      </div>
      <div class="m3-nodes">${nodes}</div>
      <div class="cm-panel m3-botbar">
        <button class="cm-btn" data-act="castle">Kingdom ${key('C')}</button>
        <button class="cm-btn" data-act="cats">Cats ${key('K')}</button>
        <button class="cm-btn" data-act="trophies">Trophies ${key('T')}</button>
        <button class="cm-btn" data-act="chest">Treasure chest</button>
      </div>`, null, {
      c: () => this.showCastle(),
      k: () => this.showCats(),
      t: () => this.showTrophies(),
      q: () => this.world > 0 && this.showMap(this.world - 1),
      e: () => this.world + 1 < WORLDS.length && this.showMap(this.world + 1),
    }, '.m3-node.main');
  }

  private placeNodes(): void {
    if (this.screen !== 'map') return;
    const nodes = this.ui.querySelectorAll<HTMLElement>('.m3-node');
    if (!nodes.length) return;
    const [ax, ay] = this.map.screenOf(0);
    const [bx, by] = this.map.screenOf(1);
    const size = Math.max(44, Math.min(84, Math.hypot(bx - ax, by - ay) * 0.56));
    nodes.forEach((el, k) => {
      const [x, y] = this.map.screenOf(k);
      el.style.cssText = `left:${x}px;top:${y}px;--s:${size}px`;
    });
  }

  private showTrophies(): void {
    this.modal = 'info';
    const rows = TROPHIES.map((tr) => {
      const have = Math.min(tr.goal, tr.stat(this));
      const done = this.save.done.includes(tr.id);
      return `<div class="m3-trophy${done ? ' done' : ''}"><span>${tr.name}</span><span class="m3-num">${done ? CHECK : `${have}/${tr.goal}`}</span><div class="m3-meter"><i style="width:${(have / tr.goal) * 100}%"></i></div><small>Prize: ${tr.reward[1]} ${BOOSTER[tr.reward[0]].name}</small></div>`;
    }).join('');
    this.overlay(`<h2 class="cm-title">Trophies</h2><div class="cm-help">${this.save.done.length} of ${TROPHIES.length} won. Each trophy pays boosters.</div>
      <div class="m3-scroll" tabindex="0">${rows}</div>
      <div class="m3-row"><button class="cm-btn main" data-act="resume">Back ${key('Esc')}</button></div>`, () => this.closeOverlay());
  }

  /** Epic question: a chest with boosters of every kind. */
  private async chest(): Promise<void> {
    if (!(await this.bonus(`Treasure chest: ${CHEST} of every booster`, true))) return;
    for (const id of BOOSTER_IDS) this.save.boosters[id] += CHEST;
    this.store();
    this.sfx('unlock');
    this.toast(`<div class="m3-row m3-prize">${BOOSTER_IDS.map((id) => `<img class="icon" src="${this.icons.pic[id]}" alt="">`).join('')}<b>+${CHEST} of each booster</b></div>`);
  }

  // ---------- pre-level ----------

  private goalHtml(g: Goal, left: number): string {
    const done = left <= 0;
    const num = done ? CHECK : `<span class="m3-num">${left}</span>`;
    if (g.type === 'score') return `<span class="m3-goal"><span class="cm-label">Score</span>${num}</span>`;
    const icon = g.type === 'collect' ? 'p' + g.color : g.type;
    return `<span class="m3-goal${done ? ' done' : ''}"><img class="icon" src="${this.icons.pic[icon]}" alt="${icon}">${num}</span>`;
  }

  private showPre(n: number): void {
    if (!this.unlocked(n)) return;
    this.level = n;
    this.screen = 'pre';
    this.crownRun = false;
    const lv = LEVELS[n];
    const probe = new Board(lv, 1);
    this.board = probe;
    this.view.setWorld(Math.floor(n / PER_WORLD));
    this.view.setBoard(probe.w, probe.h, probe.cells);
    this.picked.clear();
    this.mount(this.hudHtml(), null);
    this.updateHud();
    const boost = (id: BoosterId) => {
      const have = this.save.boosters[id];
      return `<button class="cm-btn m3-booster" data-act="pick" data-id="${id}"><img class="icon" src="${this.icons.pic[id]}" alt="">${BOOSTER[id].name}<small>${have > 0 ? 'Have ' + have : 'Earn one'} ${key(BOOSTER[id].key)}</small></button>`;
    };
    const won = (this.save.stars[n] ?? 0) > 0;
    const crownBtn = won ? `<button class="cm-btn" data-act="playcrown">${crown(!!this.save.crowns[n])} Crown challenge: ${lv.crown} moves ${key('W')}</button>` : '';
    this.overlay(`<h2 class="cm-title">Level ${n + 1}${lv.hard ? ' <small class="m3-hardtag">Hard</small>' : ''}</h2>
      <div class="m3-row">${lv.goals.map((g) => this.goalHtml(g, probe.remaining(g))).join('')}</div>
      <div class="cm-label">${lv.moves} moves ${won ? stars(this.save.stars[n]) : ''}</div>
      <div class="m3-row">${boost('puff')}${boost('rainbow')}</div>
      <p class="cm-help m3-help">${lv.tip ?? (won ? 'Win the crown challenge to earn a crown for cat outfits.' : '')}</p>
      <div class="m3-row"><button class="cm-btn" data-act="map">Back ${key('Esc')}</button>${crownBtn}<button class="cm-btn main" data-act="play">Play ${key('Enter')}</button></div>`,
    () => this.showMap(this.world), { 1: () => this.pick('puff'), 2: () => this.pick('rainbow'), w: () => won && this.start(true) });
  }

  private async pick(id: BoosterId): Promise<void> {
    const b = this.ui.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (this.picked.has(id)) {
      this.picked.delete(id);
    } else {
      if (this.save.boosters[id] <= 0) {
        if (!(await this.bonus(BOOSTER[id].bonus))) return;
        this.save.boosters[id]++;
        this.store();
        b?.querySelector('small')?.replaceChildren(`Have ${this.save.boosters[id]} `);
        b?.querySelector('small')?.insertAdjacentHTML('beforeend', key(BOOSTER[id].key));
      }
      this.picked.add(id);
    }
    this.sfx('select');
    b?.classList.toggle('on', this.picked.has(id));
    b?.focus();
  }

  // ---------- play ----------

  private hudHtml(): string {
    return `<div class="cm-panel m3-hud"></div><div class="m3-helpbar"><div class="cm-panel cm-help">Swipe, drag or click two pieces. Keys: arrows move, Enter picks.</div></div><div class="m3-pops"></div>`;
  }

  private start(crownRun = this.crownRun): void {
    const lv = LEVELS[this.level];
    this.crownRun = crownRun;
    const b = new Board(crownRun ? { ...lv, moves: lv.crown } : lv, (Math.random() * 2 ** 31) >>> 0);
    const kinds: Kind[] = [];
    for (const id of this.picked) {
      this.save.boosters[id]--;
      kinds.push(...(id === 'puff' ? (['bomb', 'h'] as Kind[]) : (['rainbow'] as Kind[])));
    }
    b.place(kinds);
    if (this.picked.size) this.store();
    this.picked.clear();
    this.board = b;
    this.seenMade = this.seenRescued = 0;
    this.screen = 'play';
    this.hammerOn = false;
    this.view.hammer = false;
    this.view.setWorld(Math.floor(this.level / PER_WORLD));
    this.view.setBoard(b.w, b.h, b.cells);
    this.mount(this.hudHtml(), () => this.pause(), this.playKeys(), '.none');
    this.updateHud();
    this.lastInput = this.t;
    (document.activeElement as HTMLElement | null)?.blur();
    this.sfx('whoosh', { pitch: 0.8 });
  }

  private playKeys(): Record<string, () => void> {
    return { h: () => this.useHammer(), r: () => this.useShuffle() };
  }

  /** `s` = show the score and goals as they were after that step, so the HUD counts along with the cascade. */
  private updateHud(s?: Step): void {
    const b = this.board;
    const hud = this.ui.querySelector('.m3-hud');
    if (!b || !hud) return;
    const lv = b.def;
    const score = s?.score ?? b.score;
    const left = s?.left ?? lv.goals.map((g) => b.remaining(g));
    const top = lv.stars[1] * 1.15;
    const pct = (v: number) => Math.min(100, (v / top) * 100);
    const tool = (id: 'hammer' | 'shuffle') => `<button class="cm-btn${id === 'hammer' && this.hammerOn ? ' on' : ''}" data-act="${id}"><img class="icon" src="${this.icons.pic[id]}" alt="${BOOSTER[id].name}"><span class="m3-num">${this.save.boosters[id] || '+'}</span>${key(BOOSTER[id].key)}</button>`;
    hud.innerHTML = `<div class="m3-movebox${b.moves <= LOW_MOVES ? ' low' : ''}"><div class="cm-label">Level ${this.level + 1} ${this.crownRun ? crown() : ''}</div><div class="m3-moves m3-num">${b.moves}</div><div class="cm-label">moves</div></div>
      <div class="m3-goals">${lv.goals.map((g, k) => this.goalHtml(g, left[k])).join('')}</div>
      <div class="m3-meterbox"><div class="m3-row"><span class="m3-num">${score}</span><span>${stars((left.every((v) => v === 0) ? 1 : 0) + (score >= lv.stars[0] ? 1 : 0) + (score >= lv.stars[1] ? 1 : 0))}</span></div>
        <div class="m3-meter"><i style="width:${pct(score)}%"></i><b style="left:${pct(lv.stars[0])}%"></b><b style="left:${pct(lv.stars[1])}%"></b></div></div>
      <div class="m3-tools">${tool('hammer')}${tool('shuffle')}<button class="cm-btn" data-act="pause">Pause ${key('Esc')}</button></div>`;
  }

  private pop(text: string, x: number, y: number, cls = ''): void {
    const box = this.ui.querySelector('.m3-pops');
    if (!box || reducedMotion()) return;
    const d = document.createElement('div');
    d.className = 'm3-pop ' + cls;
    d.textContent = text;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    box.append(d);
    setTimeout(() => d.remove(), 1000);
  }

  private async run(steps: Step[]): Promise<void> {
    const b = this.board!;
    this.busy = true;
    this.view.hint = null;
    let score = steps.length ? steps[0].score : b.score;
    let chain = 1;
    for (const s of steps) {
      // where pieces vanish this step, for the score pop
      let n = 0, sx = 0, sy = 0;
      s.cells.forEach((c, i) => {
        const o = this.view.cells[i]?.piece;
        if (o && (!c.piece || c.piece.id !== o.id) && !s.cells.some((d) => d.piece?.id === o.id)) { n++; sx += i % b.w; sy += Math.floor(i / b.w); }
      });
      this.stepSound(s, n);
      const wait = this.view.play(s);
      if (s.type === 'clear' && n && s.score > score) {
        const [px, py] = this.view.screenOf(sx / n, sy / n);
        this.pop('+' + (s.score - score), px, py);
        if (s.depth > chain) {
          chain = s.depth;
          const [cx, cy] = this.view.screenOf((b.w - 1) / 2, (b.h - 1) / 2);
          if (chain >= 2) this.pop(CALLOUT[Math.min(chain, CALLOUT.length - 1)], cx, cy, 'big');
          if (chain >= 4) this.view.jolt(0.12);
        }
      }
      score = s.score;
      await wait;
      this.updateHud(s);
    }
    this.save.stats.chain = Math.max(this.save.stats.chain, chain);
    this.save.stats.specials += b.made - this.seenMade;
    this.save.stats.kittens += b.rescued - this.seenRescued;
    this.seenMade = b.made;
    this.seenRescued = b.rescued;
    this.busy = false;
    this.lastInput = this.t;
    this.updateHud();
    this.music();
    if (b.won()) return this.win();
    if (b.moves <= 0) this.lose();
  }

  private canAct(): boolean { return this.screen === 'play' && !this.busy && this.modal === 'none' && !!this.board; }

  private async trySwap(a: number, c: number): Promise<void> {
    if (!this.canAct()) return;
    this.view.selected = -1;
    const b = this.board!;
    if (b.cells[a].piece?.kind === 'rainbow' && b.cells[c].piece?.kind === 'rainbow') this.save.stats.doubles++;
    const r = b.swap(a, c);
    if (r) await this.run(r.steps);
  }

  private async tap(i: number): Promise<void> {
    if (!this.canAct() || i < 0) return;
    const b = this.board!;
    this.lastInput = this.t;
    this.view.hint = null;
    if (this.hammerOn) return this.hammerAt(i);
    const sel = this.view.selected;
    if (sel === i) {
      this.view.selected = -1;
      if (isSpecial(b.cells[i].piece)) {
        const st = b.fire(i);
        if (st) await this.run(st);
      }
      return;
    }
    if (sel >= 0 && b.canSwap(sel, i)) return this.trySwap(sel, i);
    this.view.selected = b.cells[i].piece && !b.cells[i].ice ? i : -1;
    if (this.view.selected >= 0) this.sfx('select');
  }

  private async useHammer(): Promise<void> {
    if (!this.canAct()) return;
    if (this.hammerOn) { this.hammerOn = false; this.view.hammer = false; this.updateHud(); return; }
    if (this.save.boosters.hammer <= 0) {
      if (!(await this.bonus(BOOSTER.hammer.bonus))) return;
      this.save.boosters.hammer++;
      this.store();
    }
    this.hammerOn = true;
    this.view.hammer = true;
    this.view.selected = -1;
    if (!this.view.cursor) this.view.cursor = { x: this.board!.w >> 1, y: this.board!.h >> 1 };
    this.sfx('select');
    this.updateHud();
  }

  private async hammerAt(i: number): Promise<void> {
    const st = this.board!.hammer(i);
    if (!st) return;
    this.hammerOn = false;
    this.view.hammer = false;
    this.save.boosters.hammer--;
    this.store();
    this.sfx('thud');
    this.view.jolt(0.1);
    await this.run(st);
  }

  private async useShuffle(): Promise<void> {
    if (!this.canAct()) return;
    if (this.save.boosters.shuffle <= 0) {
      if (!(await this.bonus(BOOSTER.shuffle.bonus))) return;
      this.save.boosters.shuffle++;
    }
    this.save.boosters.shuffle--;
    this.store();
    await this.run(this.board!.shuffleNow());
  }

  private pause(): void {
    if (this.busy || this.modal !== 'none') return;
    if (this.hammerOn) { this.hammerOn = false; this.view.hammer = false; this.updateHud(); return; }
    if (this.view.selected >= 0) { this.view.selected = -1; return; }
    this.modal = 'pause';
    const q = (id: Quality, label: string) => `<button class="cm-btn${this.save.quality === id ? ' on' : ''}" data-act="quality" data-id="${id}">${label}</button>`;
    this.overlay(`<h2 class="cm-title">Paused</h2>
      <div class="m3-row"><button class="cm-btn main" data-act="resume">Play on ${key('Esc')}</button></div>
      <div class="m3-row"><button class="cm-btn" data-act="restart">Restart</button><button class="cm-btn" data-act="map">Map</button></div>
      <div class="cm-label">Picture quality (now ${this.hi ? 'High' : 'Low'})</div>
      <div class="m3-row">${q('auto', 'Auto')}${q('high', 'High')}${q('low', 'Low')}</div>
      <p class="cm-help m3-help">Low is smoother on tablets and older laptops.</p>`,
    () => this.closeOverlay());
  }

  private setQuality(q: Quality): void {
    this.save.quality = q;
    this.slow = 0;
    this.store();
    this.applyQuality();
    this.modal = 'none';
    this.pause();
    this.ui.querySelector<HTMLElement>(`[data-act="quality"][data-id="${q}"]`)?.focus();
  }

  private lose(): void {
    const b = this.board!;
    this.modal = 'lose';
    this.sfx('lose');
    this.store();
    this.overlay(`<h2 class="cm-title">Out of moves</h2>
      <div class="m3-row">${b.def.goals.map((g) => this.goalHtml(g, b.remaining(g))).join('')}</div>
      <div class="m3-row"><button class="cm-btn main" data-act="more">+5 moves ${key('Enter')}</button></div>
      <p class="cm-help m3-help">Answer a question to keep playing.</p>
      <div class="m3-row"><button class="cm-btn" data-act="restart">Try again</button><button class="cm-btn" data-act="map">Map ${key('Esc')}</button></div>`,
    () => this.showMap(this.world));
  }

  private async moreMoves(): Promise<void> {
    if (!(await this.bonus('+5 moves'))) { this.ui.querySelector<HTMLElement>('.m3-over .main')?.focus(); return; }
    this.board!.moves += 5;
    this.closeOverlay();
    this.updateHud();
    this.music();
  }

  private async win(): Promise<void> {
    const b = this.board!;
    this.busy = true;
    this.modal = 'win';
    this.music();
    this.sfx('win');
    if (b.moves > 0) {
      this.banner('Bonus!');
      await new Promise((r) => setTimeout(r, reducedMotion() ? 200 : 700));
      this.ui.querySelector('.m3-banner')?.remove();
      for (const s of b.finale()) { this.stepSound(s, 1); await this.view.play(s); this.updateHud(s); }
    }
    this.busy = false;
    const n = this.level;
    const got = b.starsFor();
    const first = !this.save.stars[n];
    const areas = this.areasOpen();
    this.save.stars[n] = Math.max(this.save.stars[n] ?? 0, got);
    this.save.best[n] = Math.max(this.save.best[n] ?? 0, b.score);
    const prizes: string[] = [];
    const prize = (img: string, text: string) => prizes.push(`<div class="m3-row m3-prize"><img class="icon" src="${img}" alt=""><span>${text}</span></div>`);
    if (this.crownRun && !this.save.crowns[n]) { this.save.crowns[n] = 1; prize(this.icons.pic.crown, '<b>Crown won</b><br>Spend crowns on cat outfits.'); }
    const reward = first ? rewardFor(n) : null;
    if (reward) { this.save.boosters[reward]++; prize(this.icons.pic[reward], `<b>+1 ${BOOSTER[reward].name}</b>`); }
    for (const c of this.grantCats()) prize(this.icons.cat(c, ''), `<b>${c.name} is safe</b><br>${c.name} moved into your kingdom.`);
    if (this.areasOpen() > areas) prize(this.icons.pic.p5, `<b>New land: ${AREAS[this.areasOpen() - 1].name}</b><br>Build it up in your kingdom.`);
    prizes.push(...this.trophies());
    this.store();
    this.syncKingdom();
    this.updateHud();
    if (prizes.length) setTimeout(() => this.sfx('unlock'), 900);
    for (let k = 0; k < got; k++) setTimeout(() => this.sfx('star', { pitch: 1 + k * 0.15 }, 0), 250 + k * 280);
    const hasNext = n + 1 < LEVELS.length;
    this.overlay(`<h2 class="cm-title">Level clear</h2>
      <div class="m3-bigstars">${stars(got)}</div>
      <div class="m3-num m3-score">${b.score}</div>
      ${prizes.join('')}
      <div class="m3-row"><button class="cm-btn" data-act="map">Map ${key('Esc')}</button>${hasNext ? `<button class="cm-btn main" data-act="next">Next ${key('Enter')}</button>` : `<button class="cm-btn main" data-act="castle">My kingdom</button>`}</div>`,
    () => this.showMap());
  }

  private banner(text: string): void {
    const d = document.createElement('div');
    d.className = 'cm-panel m3-banner';
    d.textContent = text;
    this.ui.append(d);
  }

  // ---------- kingdom ----------

  private showCastle(area = this.area, focusId?: string): void {
    this.screen = 'castle';
    this.board = null;
    this.area = area;
    this.castle.orbit = false;
    this.castle.preview(null);
    this.castle.focusCat(null);
    this.castle.focusArea(area);
    const open = area < this.areasOpen();
    const items = ITEMS.filter((it) => it.area === area);
    const rows = items.map((it) => {
      const built = this.save.castle[it.id] !== undefined;
      return `<button class="cm-btn${built ? ' built' : ''}" data-act="item" data-id="${it.id}" ${open ? '' : 'disabled'}><span>${it.name}</span><span class="m3-num">${built ? CHECK : star(true) + it.cost}</span></button>`;
    }).join('');
    const built = items.filter((it) => this.save.castle[it.id] !== undefined).length;
    this.mount(`<div class="cm-panel m3-side">
      <div class="m3-top"><h1 class="cm-title">${AREAS[area].name}</h1><span class="m3-total m3-num">${star(true)}${this.freeStars()}</span></div>
      <div class="m3-row"><button class="cm-btn" data-act="area" data-n="${area - 1}" ${area ? '' : 'disabled'}>${key('Q')} &#9664;</button><span class="cm-help m3-grow">Land ${area + 1} of ${AREAS.length}. ${open ? `${built} of ${items.length} built.` : `Reach ${WORLDS[area].name} to open it.`}</span><button class="cm-btn" data-act="area" data-n="${area + 1}" ${area + 1 < AREAS.length ? '' : 'disabled'}>&#9654; ${key('E')}</button></div>
      <div class="m3-items m3-scroll">${rows}</div>
      <div class="m3-designs"></div>
      <p class="cm-help m3-help"></p>
      <div class="m3-row"><button class="cm-btn" data-act="map">Map ${key('Esc')}</button><button class="cm-btn" data-act="cats">Cats ${key('K')}</button><button class="cm-btn" data-act="area" data-n="-9">Whole kingdom</button></div>
    </div>`, () => this.showMap(), {
      q: () => area > 0 && this.showCastle(area - 1),
      e: () => area + 1 < AREAS.length && this.showCastle(area + 1),
      k: () => this.showCats(),
    }, focusId ? `[data-id="${focusId}"]` : '[data-act="item"]');
    if (!open) this.help(`Reach ${WORLDS[area].name} on the map to open this land.`);
  }

  private pickItem(id: string): void {
    const it = ITEMS.find((i) => i.id === id)!;
    const owned = this.save.castle[id];
    const box = this.ui.querySelector('.m3-designs');
    this.castle.focus(id);
    if (!box) return;
    box.innerHTML = it.designs.map((d, k) => `<button class="cm-btn${owned === k ? ' owned' : ''}" data-act="design" data-id="${id}" data-n="${k}">${d}<small>${owned === k ? 'Placed' : owned !== undefined ? 'Swap' : star(true) + it.cost}</small></button>`).join('');
    this.ui.querySelectorAll('.m3-items .cm-btn').forEach((b) => b.classList.toggle('sel', (b as HTMLElement).dataset.id === id));
    this.help(owned !== undefined ? 'Pick a look. Swapping is free.' : this.freeStars() >= it.cost ? `Pick a look to build it for ${it.cost} stars.` : `Win more stars: ${it.cost - this.freeStars()} more needed.`);
  }

  private help(text: string): void {
    const h = this.ui.querySelector('.m3-side .m3-help');
    if (h) h.textContent = text;
  }

  private design(id: string, k: number): void {
    const it = ITEMS.find((i) => i.id === id)!;
    const owned = this.save.castle[id] !== undefined;
    if (!owned && this.freeStars() < it.cost) { this.sfx('error'); this.help(`You need ${it.cost - this.freeStars()} more stars.`); return; }
    this.save.castle[id] = k;
    this.sfx(owned ? 'select' : 'buy');
    this.afterGain();
    this.syncKingdom();
    this.showCastle(this.area, id);
    this.pickItem(id);
    this.ui.querySelector<HTMLElement>(`[data-act="design"][data-n="${k}"]`)?.focus();
    this.help(owned ? `${it.designs[k]} placed.` : `${it.designs[k]} built.`);
  }

  // ---------- cats ----------

  private showCats(id = this.catId): void {
    this.screen = 'cats';
    this.board = null;
    this.castle.orbit = true;
    this.castle.preview(null);
    this.castle.focusArea(null);
    const owned = Object.keys(this.save.cats).length;
    const cells = CATS.map((c) => {
      const has = this.save.cats[c.id] !== undefined;
      return `<button class="m3-cat${has ? '' : ' locked'}${c.legend ? ' legend' : ''}" data-act="cat" data-id="${c.id}" aria-label="${has ? c.name : 'Cat not rescued yet'}"><img src="${this.icons.cat(c, has ? this.save.cats[c.id] : '')}" alt=""><span>${has ? c.name : '?'}</span></button>`;
    }).join('');
    this.mount(`<div class="cm-panel m3-side">
      <div class="m3-top"><h1 class="cm-title">My cats</h1><span class="m3-total m3-num">${owned}/${CATS.length} &nbsp;${crown()}${this.freeCrowns()}</span></div>
      <div class="m3-catgrid m3-scroll">${cells}</div>
      <div class="m3-catinfo"></div>
      <div class="m3-row"><button class="cm-btn" data-act="map">Map ${key('Esc')}</button><button class="cm-btn" data-act="castle">Kingdom ${key('C')}</button></div>
    </div>`, () => this.showMap(), { c: () => this.showCastle() }, id ? `[data-act="cat"][data-id="${id}"]` : '[data-act="cat"]');
    this.pickCat(id || CATS[0].id);
  }

  private pickCat(id: string): void {
    const c = CATS.find((x) => x.id === id)!;
    const info = this.ui.querySelector('.m3-catinfo');
    if (!info) return;
    this.catId = id;
    const has = this.save.cats[id] !== undefined;
    this.castle.focusCat(has ? id : null);
    this.ui.querySelectorAll('.m3-cat').forEach((b) => b.classList.toggle('sel', (b as HTMLElement).dataset.id === id));
    if (!has) {
      const w = WORLDS[c.world];
      const k = CATS.indexOf(c);
      info.innerHTML = c.legend
        ? this.worldDone(c.world)
          ? `<div class="cm-help">${c.name} is a legendary cat. Answer a big question to bring ${c.name} home.</div><div class="m3-row"><button class="cm-btn main" data-act="legend" data-id="${id}">Rescue ${c.name}</button></div>`
          : `<div class="cm-help">A legendary cat. Finish ${w.name} to meet it.</div>`
        : `<div class="cm-help">Win level ${w.from + 5 * ((k % 4) + 1)} in ${w.name} to rescue this cat.</div>`;
      return;
    }
    const worn = this.save.cats[id];
    const chip = (acc: string, name: string, cost: number) => {
      const own = !acc || this.save.acc.includes(acc);
      return `<button class="cm-btn m3-chip${worn === acc ? ' on' : ''}" data-act="wear" data-id="${acc}">${name}${own ? '' : `<small>${crown()}${cost}</small>`}</button>`;
    };
    info.innerHTML = `<div class="m3-row"><img class="m3-portrait" src="${this.icons.cat(c, worn)}" alt=""><div><b>${c.name}</b><div class="cm-help">${c.legend ? 'Legendary cat' : 'From ' + WORLDS[c.world].name}. Pick an outfit.</div></div></div>
      <div class="m3-chips">${chip('', 'None', 0)}${ACCESSORIES.map((a) => chip(a.id, a.name, a.cost)).join('')}</div>`;
  }

  private wear(acc: string): void {
    const a = ACCESSORIES.find((x) => x.id === acc);
    if (a && !this.save.acc.includes(acc)) {
      if (this.freeCrowns() < a.cost) {
        this.sfx('error');
        this.toast(`<div class="cm-help">${a.name} costs ${a.cost} crowns. Win crown challenges on levels you have beaten.</div>`);
        return;
      }
      this.save.acc.push(acc);
      this.sfx('buy');
    } else this.sfx('purr');
    this.save.cats[this.catId] = acc;
    this.afterGain();
    this.syncKingdom();
    this.showCats(this.catId);
    this.ui.querySelector<HTMLElement>(`[data-act="wear"][data-id="${acc}"]`)?.focus();
  }

  /** Epic question: a legendary cat. */
  private async legend(id: string): Promise<void> {
    const c = CATS.find((x) => x.id === id)!;
    if (!(await this.bonus(`${c.name}, a legendary cat, joins your kingdom`, true))) return;
    this.save.cats[id] = '';
    this.sfx('meow');
    this.sfx('cheer', { volume: 0.6 });
    this.afterGain();
    this.syncKingdom();
    this.showCats(id);
  }

  private onFocus(el: HTMLElement): void {
    if (this.screen === 'castle') {
      if (el.dataset.act === 'item') { this.castle.preview(null); this.pickItem(el.dataset.id!); }
      if (el.dataset.act === 'design') this.castle.preview(el.dataset.id!, Number(el.dataset.n));
    }
    if (this.screen === 'cats' && el.dataset.act === 'cat') this.pickCat(el.dataset.id!);
  }

  // ---------- actions ----------

  private act(a: string, el: HTMLElement): void {
    const n = Number(el.dataset.n);
    const id = el.dataset.id!;
    if (!['pick', 'design', 'wear', 'item', 'cat', 'hammer', 'shuffle'].includes(a)) this.sfx(a === 'map' || a === 'resume' ? 'back' : 'tap');
    switch (a) {
      case 'level': return this.showPre(n);
      case 'world': return this.showMap(n);
      case 'castle': return this.showCastle();
      case 'cats': return this.showCats();
      case 'trophies': return this.showTrophies();
      case 'chest': void this.chest(); return;
      case 'map': return this.showMap(this.screen === 'play' || this.screen === 'pre' ? this.world : undefined);
      case 'pick': void this.pick(id as BoosterId); return;
      case 'play': return this.start(false);
      case 'playcrown': return this.start(true);
      case 'pause': return this.pause();
      case 'resume': return this.closeOverlay();
      case 'restart': return this.start();
      case 'quality': return this.setQuality(id as Quality);
      case 'more': void this.moreMoves(); return;
      case 'next': return this.showPre(this.level + 1);
      case 'hammer': void this.useHammer(); return;
      case 'shuffle': void this.useShuffle(); return;
      case 'area': if (n < 0) { this.castle.focusArea(null); this.castle.orbit = true; return; } return this.showCastle(n);
      case 'item': el.focus(); return this.pickItem(id);
      case 'design': return this.design(id, n);
      case 'cat': el.focus(); this.sfx(this.save.cats[id] !== undefined ? 'meow' : 'tap', { volume: 0.6 }); return this.pickCat(id);
      case 'wear': return this.wear(id);
      case 'legend': void this.legend(id); return;
    }
  }

  // ---------- input ----------

  private onKey(e: KeyboardEvent): void {
    if (this.modal === 'bonus' || document.querySelector('dialog[open]')) return;
    const k = e.key;
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const playing = this.screen === 'play' && this.modal === 'none';
    if (k === 'Escape') { e.preventDefault(); if (this.back) { this.sfx('back'); this.back(); } return; }
    if (playing) {
      if (dirs[k]) { e.preventDefault(); this.boardArrow(...dirs[k]); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); this.boardEnter(); return; }
    } else if (dirs[k]) {
      e.preventDefault();
      this.focusMove(...dirs[k]);
      return;
    } else if (k === 'Enter' || k === ' ') {
      const f = document.activeElement as HTMLElement | null;
      if (f && this.ui.contains(f) && f.dataset.act) { e.preventDefault(); f.click(); }
      return;
    }
    const fn = this.keys[k.toLowerCase()];
    if (fn) { e.preventDefault(); fn(); }
  }

  private boardArrow(dx: number, dy: number): void {
    const b = this.board!;
    this.lastInput = this.t;
    this.view.hint = null;
    if (!this.view.cursor) {
      const s = this.view.selected;
      this.view.cursor = s >= 0 ? { x: s % b.w, y: Math.floor(s / b.w) } : { x: b.w >> 1, y: b.h >> 1 };
      if (s < 0) return;
    }
    const c = this.view.cursor;
    const x = c.x + dx;
    const y = c.y + dy;
    if (!b.inside(x, y)) return;
    if (this.view.selected >= 0 && !this.hammerOn) {
      const from = this.view.selected;
      this.view.cursor = { x, y };
      void this.trySwap(from, b.idx(x, y));
      return;
    }
    this.view.cursor = { x, y };
  }

  private boardEnter(): void {
    const b = this.board!;
    if (!this.view.cursor) { this.view.cursor = { x: b.w >> 1, y: b.h >> 1 }; return; }
    void this.tap(b.idx(this.view.cursor.x, this.view.cursor.y));
  }

  /** Spatial focus: nearest button in the arrow's direction. */
  private focusMove(dx: number, dy: number): void {
    const all = [...this.ui.querySelectorAll<HTMLElement>('[data-act]:not(:disabled)')].filter((e) => !this.ui.querySelector('.m3-over') || e.closest('.m3-over'));
    const cur = document.activeElement as HTMLElement;
    if (!all.includes(cur)) { all[0]?.focus(); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const el of all) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2 - ax;
      const ey = r.top + r.height / 2 - ay;
      const along = ex * dx + ey * dy;
      if (along <= 4) continue;
      const d = along + Math.abs(ex * dy + ey * dx) * 2.5;
      if (d < bestD) { bestD = d; best = el; }
    }
    best?.focus();
  }

  private onDown(e: PointerEvent): void {
    if (!this.canAct()) return;
    const i = this.view.pick(e.clientX, e.clientY);
    this.view.cursor = this.hammerOn && i >= 0 ? { x: i % this.board!.w, y: Math.floor(i / this.board!.w) } : null;
    if (i < 0) { this.view.selected = -1; return; }
    this.down = { i, x: e.clientX, y: e.clientY, moved: false };
  }

  private onMove(e: PointerEvent): void {
    const d = this.down;
    if (!d || d.moved || !this.canAct() || this.hammerOn) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < this.view.cellPx() * 0.35) return;
    d.moved = true;
    const b = this.board!;
    const [x, y] = b.xy(d.i);
    const [sx, sy] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    if (b.inside(x + sx, y + sy)) void this.trySwap(d.i, b.idx(x + sx, y + sy));
  }

  private onUp(): void {
    const d = this.down;
    this.down = null;
    if (d && !d.moved) void this.tap(d.i);
  }
}
