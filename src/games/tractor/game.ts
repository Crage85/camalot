// Kitty Harvest: drive the cat farmer's tractor, harvest any crop (tough ones cut slowly), sell at the barn,
// fill orders, grow the farm, then move on to bigger farms. Knows the platform only through the Camalot contract.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Camalot, SfxName } from '../../core/contract';
import * as D from './data';
import * as M from './models';
import { buildWorld, PAD, type PlotState, type World } from './world';
import './style.css';

type Quality = 'auto' | 'high' | 'low';
interface FarmSave {
  open: boolean;
  plots: boolean[]; // owned
  done: number; // orders finished this season
  prog: number[]; // crops delivered toward the current order
  chest: number; // coins waiting in a treasure chest (epic question)
  builds: Record<D.BuildId, number>;
  animals: number[]; // crops fed to each animal
  decor: number;
  crops: string[]; // per plot, one char per crop: '1' standing, '0' cut
}
interface SaveData {
  v: 2;
  coins: number;
  lv: Record<D.TrackId, number>;
  helpers: D.Job[];
  vehicles: D.VehicleId[];
  vehicle: D.VehicleId;
  farm: number;
  farms: FarmSave[];
  album: Partial<Record<D.CropKind, number>>; // crops harvested, all time
  load: Partial<Record<D.CropKind, number>>; // in the trailer now
  season: number;
  bestSale: number;
  quality: Quality;
  x: number; z: number; heading: number;
}
/** The first version's save: six fields in a row, cutter levels that unlocked crops. */
interface SaveV1 { v: 1; coins: number; speed: number; load: number; width: number; cutter: number; helpers: number; cleared: boolean[]; carriedValue: number }

const TRACTOR_R = 1.3;
const CUT_LEN = 1.2;
const BUILD_IDS = Object.keys(D.BUILDS) as D.BuildId[];
const TRACK_IDS = Object.keys(D.TRACKS) as D.TrackId[];

function fmt(n: number) {
  n = Math.floor(n);
  if (n < 1e6) return n.toLocaleString('en-US');
  const u = ['M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  const e = Math.min(u.length - 1, Math.floor(Math.log10(n) / 3) - 2);
  return (n / Math.pow(10, (e + 2) * 3)).toFixed(2) + ' ' + u[e];
}
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
const newFarm = (i: number): FarmSave => ({
  open: i === 0, plots: D.FARMS[i].plots.map((p) => p.cost === 0), done: 0, prog: [], chest: 0,
  builds: { silo: 0, market: 0, windmill: 0, greenhouse: 0, pen: 0 }, animals: [], decor: 0, crops: [],
});

function loadSave(raw: unknown): SaveData {
  const S: SaveData = {
    v: 2, coins: 0, lv: { power: 0, speed: 0, load: 0, width: 0 }, helpers: [], vehicles: ['tractor'], vehicle: 'tractor', farm: 0,
    farms: D.FARMS.map((_, i) => newFarm(i)), album: {}, load: {}, season: 0, bestSale: 0, quality: 'auto', x: PAD.x, z: PAD.z - 9, heading: Math.PI,
  };
  const int = (v: unknown, max: number) => (typeof v === 'number' && v >= 0 ? Math.min(Math.floor(v), max) : 0);
  const r = raw as Partial<SaveData> | SaveV1 | null;
  if (r && r.v === 1) {
    // Old save: coins and upgrade levels carry over; each old cutter level becomes three harvester levels;
    // crops in the trailer are paid out; cleared fields count as finished orders on the first farm.
    S.coins = int(r.coins, 1e15) + int(r.carriedValue, 1e9);
    S.lv = { speed: int(r.speed, D.TRACKS.speed.max), load: int(r.load, 60), width: int(r.width, D.TRACKS.width.max), power: int(r.cutter, 5) * 3 };
    S.helpers = Array.from({ length: int(r.helpers, D.HELPER_MAX) }, () => 'picker' as D.Job);
    const c = Array.isArray(r.cleared) ? r.cleared.filter(Boolean).length : 0;
    S.farms[0].done = Math.min(D.FARMS[0].orders, Math.round((c / 6) * D.FARMS[0].orders));
    if (c >= 2) S.farms[0].plots = S.farms[0].plots.map((o, i) => o || i < c);
    if (c >= 6) S.farms[1].open = true;
  } else if (r && r.v === 2) {
    S.coins = int(r.coins, 1e30);
    for (const t of TRACK_IDS) S.lv[t] = int(r.lv?.[t], Math.min(400, D.TRACKS[t].max));
    if (Array.isArray(r.helpers)) S.helpers = r.helpers.filter((j) => j in D.JOBS).slice(0, D.HELPER_MAX);
    if (Array.isArray(r.vehicles)) S.vehicles = [...new Set<D.VehicleId>(['tractor', ...r.vehicles.filter((v) => v in D.VEHICLES)])];
    if (r.vehicle && S.vehicles.includes(r.vehicle)) S.vehicle = r.vehicle;
    S.season = int(r.season, 99);
    S.bestSale = int(r.bestSale, 1e30);
    if (r.quality === 'high' || r.quality === 'low') S.quality = r.quality;
    for (const k of Object.keys(D.CROPS) as D.CropKind[]) {
      if (r.album?.[k]) S.album[k] = int(r.album[k], 1e12);
      if (r.load?.[k]) S.load[k] = int(r.load[k], 1e9);
    }
    S.farms.forEach((f, i) => {
      const o = r.farms?.[i];
      if (!o) return;
      f.open = i === 0 || o.open === true;
      f.plots = f.plots.map((own, pi) => own || o.plots?.[pi] === true);
      f.done = int(o.done, 1e6);
      f.prog = Array.isArray(o.prog) ? o.prog.map((n) => int(n, 1e9)) : [];
      f.chest = int(o.chest, 1e30);
      for (const b of BUILD_IDS) f.builds[b] = int(o.builds?.[b], D.BUILD_LEVELS);
      f.animals = Array.isArray(o.animals) ? o.animals.slice(0, 6).map((n) => int(n, 1e9)) : [];
      f.decor = int(o.decor, D.FARMS[i].decor.length);
      f.crops = Array.isArray(o.crops) ? o.crops.filter((s) => typeof s === 'string') : [];
    });
    S.farm = S.farms[int(r.farm, D.FARMS.length - 1)].open ? int(r.farm, D.FARMS.length - 1) : 0;
    const R = D.FARMS[S.farm].radius;
    if (typeof r.x === 'number' && typeof r.z === 'number' && Math.hypot(r.x, r.z) < R) {
      S.x = r.x;
      S.z = r.z;
      S.heading = typeof r.heading === 'number' ? r.heading : S.heading;
    }
  }
  return S;
}

export async function runGame(camalot: Camalot, host: HTMLElement) {
  const raw = await camalot.save.load<unknown>();
  const S = loadSave(raw);
  const A = camalot.audio;
  const sfx = (n: SfxName, pitch = 1, volume = 1) => A.sfx(n, { pitch: pitch * (0.94 + Math.random() * 0.12), volume });
  const engine = A.loop('engine');

  let unlimited = false, turboT = 0, tempHelperT = 0, superT = 0, megaT = 0;
  let v = 0, paused = false, farCam = false, cutCap = Infinity, chewing = 0;

  // ---------- three.js ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.className = 'tr-canvas';
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1400);
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x8a9a5a, 1.5);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.3);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 140 });
  scene.add(hemi, sun, sun.target);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), 0.2, 0.6, 1.0));
  composer.addPass(new OutputPass());

  const autoLow = () => (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 1000) || (navigator.hardwareConcurrency ?? 8) <= 4;
  let low = S.quality === 'low' || (S.quality === 'auto' && autoLow());
  function resize() {
    const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio, low ? 1 : 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // Particles: chaff and leaves from the cutter, smoke puffs, sparkles.
  const NP = 240;
  const parts = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.16), new THREE.MeshLambertMaterial(), NP);
  parts.frustumCulled = false;
  const pp = new Float32Array(NP * 8); // x y z vx vy vz life kind
  let pNext = 0;
  const _o = new THREE.Object3D();
  const _c = new THREE.Color();
  function puff(x: number, y: number, z: number, color: number, n: number, kind = 0, spread = 1) {
    for (let k = 0; k < n; k++) {
      const i = pNext++ % NP, o = i * 8;
      pp.set([x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 3 * spread, kind ? 0.8 : 2 + Math.random() * 3.5, (Math.random() - 0.5) * 3 * spread, 1, kind], o);
      parts.setColorAt(i, _c.set(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12));
    }
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }
  function stepParts(dt: number) {
    for (let i = 0; i < NP; i++) {
      const o = i * 8;
      if (pp[o + 6] <= 0) {
        _o.scale.setScalar(0);
      } else {
        const smoke = pp[o + 7] === 1;
        pp[o + 6] -= dt * (smoke ? 0.9 : 1.3);
        if (!smoke) pp[o + 4] -= 12 * dt;
        pp[o] += pp[o + 3] * dt * (smoke ? 0.2 : 1);
        pp[o + 1] += pp[o + 4] * dt;
        pp[o + 2] += pp[o + 5] * dt * (smoke ? 0.2 : 1);
        _o.position.set(pp[o], pp[o + 1], pp[o + 2]);
        _o.rotation.set(pp[o + 6] * 9 + i, i, pp[o + 6] * 7);
        _o.scale.setScalar(Math.max(0, smoke ? (1.2 - pp[o + 6]) * 2 * pp[o + 6] : pp[o + 6] * 1.4));
      }
      _o.updateMatrix();
      parts.setMatrixAt(i, _o.matrix);
    }
    parts.instanceMatrix.needsUpdate = true;
  }
  for (let i = 0; i < NP; i++) parts.setColorAt(i, _c.set(0xffffff));
  scene.add(parts);
  const arrow = M.mesh(M.arrowGeometry(), M.PAINT, false);
  scene.add(arrow);

  // ---------- farm, vehicle, helpers ----------
  let W!: World;
  let farm!: D.Farm;
  let F!: FarmSave;
  let T!: M.Rig;
  const mult = () => D.seasonMult(S.season);
  const veh = () => D.VEHICLES[S.vehicle];
  const jobs = (j: D.Job) => S.helpers.filter((x) => x === j).length;
  const top = () => D.TRACKS.speed.stat(S.lv.speed) * veh().speed * (turboT > 0 || megaT > 0 ? D.TURBO_MULT : 1);
  const power = () => D.TRACKS.power.stat(S.lv.power) * veh().power * (megaT > 0 ? D.MEGA_POWER : superT > 0 ? D.SUPER_POWER : 1);
  const width = () => D.TRACKS.width.stat(S.lv.width) * veh().width;
  const cap = () => (unlimited ? Infinity : Math.round(D.TRACKS.load.stat(S.lv.load) * veh().load * (1 + F.builds.silo * D.BUILDS.silo.per + jobs('hauler') * D.HAULER_LOAD)));
  const grown = () => F.animals.filter((fed, i) => fed >= D.animalFeed(farm, i)).length;
  const price = () => 1 + F.builds.market * D.BUILDS.market.per + jobs('seller') * D.SELLER_PRICE + grown() * D.ANIMAL_PRICE;
  const carried = () => Object.values(S.load).reduce((a, b) => a + (b ?? 0), 0);
  const order = () => D.orderFor(S.farm, F.done, S.season);

  function setVehicle() {
    if (T) scene.remove(T.root);
    T = M.buildVehicle(S.vehicle);
    T.root.rotation.order = 'YXZ';
    scene.add(T.root);
  }
  function loadFarm(i: number, arrive = false) {
    if (W) {
      storeCrops();
      scene.remove(W.group);
      W.dispose();
    }
    S.farm = i;
    farm = D.FARMS[i];
    F = S.farms[i];
    W = buildWorld(farm, i, low);
    scene.add(W.group);
    const L = farm.look;
    scene.fog = new THREE.Fog(L.skyLow, farm.radius * 1.1, farm.radius + 520);
    scene.background = new THREE.Color(L.skyLow);
    sun.color.set(L.sun);
    hemi.color.set(L.skyLow);
    hemi.groundColor.set(L.grassB).multiplyScalar(0.75);
    W.plots.forEach((p, pi) => {
      const row = F.crops[pi];
      if (typeof row === 'string' && row.length === p.n) {
        p.aliveCount = 0;
        for (let k = 0; k < p.n; k++) {
          p.alive[k] = row[k] === '1' ? 1 : 0;
          p.aliveCount += p.alive[k];
        }
        W.drawPlot(p);
      }
    });
    if (arrive) {
      S.x = PAD.x;
      S.z = PAD.z - 9;
      S.heading = Math.PI;
      v = 0;
      camInit = false;
    }
    syncFarm();
    // An old save, or a rebuild with more trees (picture quality), can put the vehicle inside something: move it out.
    if (W.overlap(S.x, S.z, TRACTOR_R) > 0) [S.x, S.z, S.heading] = W.rescue(S.x, S.z, TRACTOR_R, S.heading);
    helpers.forEach((h) => ((h.x = S.x + 2), (h.z = S.z - 3), (h.plot = -1)));
  }
  function storeCrops() {
    F.crops = W.plots.map((p) => Array.from(p.alive).join(''));
  }
  function syncFarm() {
    for (const b of BUILD_IDS) W.setBuild(b, F.builds[b]);
    W.setDecor(F.decor);
    W.setAnimals(F.animals.map((fed, i) => fed / D.animalFeed(farm, i)));
    W.plots.forEach((p, i) => (p.sign.visible = !F.plots[i]));
  }

  interface Helper { cat: M.CatRig; x: number; z: number; heading: number; plot: number; idx: number; wait: number; hop: number }
  const helpers: Helper[] = [];
  function syncHelpers() {
    const want = S.helpers.length + (tempHelperT > 0 ? 1 : 0);
    while (helpers.length > want) scene.remove(helpers.pop()!.cat.root);
    while (helpers.length < want) {
      const i = helpers.length;
      const cat = M.buildCat(M.HELPER_COLORS[i % M.HELPER_COLORS.length], false, true);
      cat.root.scale.setScalar(0.9);
      cat.root.traverse((o) => (o.castShadow = true));
      scene.add(cat.root);
      helpers.push({ cat, x: S.x + (i - 1) * 1.5, z: S.z - 3, heading: 0, plot: -1, idx: -1, wait: 0, hop: 0 });
    }
  }
  let camInit = false;
  setVehicle();
  loadFarm(S.farm);
  syncHelpers();
  function applyQuality(rebuild: boolean) {
    low = S.quality === 'low' || (S.quality === 'auto' && autoLow());
    renderer.shadowMap.enabled = !low;
    sun.castShadow = !low;
    resize();
    if (rebuild) loadFarm(S.farm);
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }
  applyQuality(false);

  // ---------- HUD ----------
  const hud = document.createElement('div');
  hud.className = 'tr-hud';
  hud.innerHTML = `
    <div class="tr-top cm-panel">
      <span class="tr-stat"><i class="tr-coin"></i><b class="cm-num" data-coins></b></span>
      <span class="tr-stat"><span class="tr-bar"><i data-loadbar></i></span><b class="cm-num" data-load></b></span>
      <span class="tr-chips" data-chips></span>
    </div>
    <div class="tr-toast cm-panel" data-toast hidden></div>
    <div class="tr-goal cm-panel" data-goal></div>
    <div class="tr-btns">
      <button type="button" class="cm-btn good tr-unstuck" data-unstuck hidden>Unstuck<span class="cm-key">U</span></button>
      <button type="button" class="cm-btn good" data-bag hidden>Big load<span class="cm-key">Q</span></button>
      <button type="button" class="cm-btn main" data-barnbtn hidden>Barn<span class="cm-key">B</span></button>
      <button type="button" class="cm-btn main" data-buybtn hidden></button>
      <button type="button" class="cm-btn" data-cam>Camera<span class="cm-key">C</span></button>
      <button type="button" class="cm-btn" data-pause>Pause<span class="cm-key">P</span></button>
    </div>`;
  document.body.append(hud);
  const q = <E extends HTMLElement>(sel: string, root: ParentNode = hud) => root.querySelector(sel) as E;
  const elCoins = q('[data-coins]'), elLoad = q('[data-load]'), elLoadBar = q('[data-loadbar]'), elChips = q('[data-chips]'), elGoal = q('[data-goal]'), elToast = q('[data-toast]');
  const btnBag = q<HTMLButtonElement>('[data-bag]'), btnBarn = q<HTMLButtonElement>('[data-barnbtn]'), btnBuy = q<HTMLButtonElement>('[data-buybtn]'), btnCam = q<HTMLButtonElement>('[data-cam]'), btnPause = q<HTMLButtonElement>('[data-pause]'), btnUnstuck = q<HTMLButtonElement>('[data-unstuck]');
  // HUD buttons must not keep keyboard focus, or Space/Enter would press them while driving.
  for (const b of [btnBag, btnBarn, btnBuy, btnCam, btnPause, btnUnstuck]) b.addEventListener('mousedown', (e) => e.preventDefault());

  let toastTimer = 0, toastCd = 0;
  function toast(text: string, secs = 3) {
    elToast.textContent = text;
    elToast.hidden = false;
    toastTimer = secs;
  }
  /** A hint that does not repeat for a few seconds. */
  function hint(text: string) {
    if (toastCd > 0) return;
    toast(text);
    toastCd = 5;
  }
  const needText = () => order().needs.map((n, i) => `${Math.min(n.count, F.prog[i] ?? 0)}/${n.count} ${D.CROPS[n.crop].name}`).join(' and ');

  let nearSale = -1; // plot whose "for sale" sign the tractor is next to
  let lastHud = '';
  function updateHud() {
    const c = cap(), n = carried();
    const chips = [megaT > 0 ? `Mega harvest ${Math.ceil(megaT)}s` : '', turboT > 0 ? `Turbo ${Math.ceil(turboT)}s` : '', superT > 0 ? `Super cutter ${Math.ceil(superT)}s` : '', tempHelperT > 0 ? `Helper ${Math.ceil(tempHelperT)}s` : '', chewing > 0.3 ? 'Tough crop: slow cutting' : '']
      .filter(Boolean).map((t) => `<span class="tr-chip">${t}</span>`).join('');
    const goal = n >= c ? 'Full! Drive back to the barn.' : `${F.done < farm.orders ? `Order ${F.done + 1} of ${farm.orders}` : `Bonus order ${F.done + 1 - farm.orders}`}: ${needText()}`;
    const key = [Math.floor(S.coins), n, c, chips, goal, onPad, barnOpen, nearSale, stuckShow > 0].join('|');
    if (key === lastHud) return;
    lastHud = key;
    elCoins.textContent = fmt(S.coins);
    elLoad.textContent = unlimited ? `${n} / no limit` : `${n} / ${c}`;
    elLoadBar.style.width = `${unlimited ? 100 : Math.min(100, (n / c) * 100)}%`;
    elLoadBar.classList.toggle('full', n >= c);
    elLoadBar.classList.toggle('free', unlimited);
    elChips.innerHTML = chips;
    elGoal.textContent = goal;
    btnBag.hidden = !(n >= c && !unlimited);
    btnBarn.hidden = !onPad || barnOpen;
    btnBuy.hidden = nearSale < 0;
    btnUnstuck.hidden = stuckShow <= 0;
    if (nearSale >= 0) btnBuy.innerHTML = `Buy ${farm.plots[nearSale].name} <i class="tr-coin"></i>${fmt(D.plotCost(farm, farm.plots[nearSale]))}<span class="cm-key">B</span>`;
  }

  // ---------- saving ----------
  let dirty = false, saveTimer = 0;
  function save() {
    dirty = false;
    saveTimer = 0;
    storeCrops();
    camalot.save.store<SaveData>(S).catch((e) => toast(String(e instanceof Error ? e.message : e), 4));
  }
  addEventListener('pagehide', () => save());
  document.addEventListener('visibilitychange', () => document.hidden && save());

  // ---------- bonuses (school questions) ----------
  let bonusOpen = false;
  async function bonus(reward: string, epic = false): Promise<boolean> {
    if (bonusOpen) return false;
    bonusOpen = true;
    paused = true;
    keys.clear();
    const r = await camalot.earnBonus(epic ? { reward, size: 'epic' } : { reward });
    keys.clear();
    bonusOpen = false;
    paused = barnOpen;
    last = performance.now();
    if (r.earned) sfx('sparkle');
    return r.earned;
  }
  btnBag.addEventListener('click', async () => {
    if (await bonus('No load limit until your next sale')) {
      unlimited = true;
      toast('No load limit this trip!');
    }
  });
  btnCam.addEventListener('click', () => (farCam = !farCam));

  // ---------- money, orders, album ----------
  function spend(cost: number) {
    if (S.coins < cost) return false;
    S.coins -= cost;
    return true;
  }
  /** Crops reach the barn (a sale, or a picker cat's basket): coins, order progress, album medals, animal feed. */
  function deliver(crop: D.CropKind, n: number) {
    const C = D.CROPS[crop];
    const coins = n * C.value * mult() * price();
    S.coins += coins;
    const before = S.album[crop] ?? 0;
    S.album[crop] = before + n;
    D.MEDALS.forEach((need, m) => {
      if (before < need && before + n >= need) {
        const gift = D.MEDAL_REWARD[m] * C.value * mult();
        S.coins += gift;
        toast(`${D.MEDAL_NAMES[m]} medal for ${C.name}! +${fmt(gift)} coins`, 4);
        sfx('star');
      }
    });
    const hungry = F.animals.findIndex((fed, i) => fed < D.animalFeed(farm, i));
    if (hungry >= 0) {
      F.animals[hungry] += n;
      if (F.animals[hungry] >= D.animalFeed(farm, hungry)) {
        toast(`Your ${farm.animalName.toLowerCase()} is all grown up! +3% coins on this farm.`, 4);
        sfx('purr');
      }
      W.setAnimals(F.animals.map((fed, i) => fed / D.animalFeed(farm, i)));
    }
    const o = order();
    o.needs.forEach((need, i) => need.crop === crop && (F.prog[i] = Math.min(need.count, (F.prog[i] ?? 0) + n)));
    if (o.needs.every((need, i) => (F.prog[i] ?? 0) >= need.count)) {
      F.done++;
      F.prog = [];
      F.chest += o.reward * D.CHEST_MULT;
      S.coins += o.reward;
      if (F.done === farm.orders) {
        const next = D.FARMS[S.farm + 1];
        toast(next ? `All orders done! ${next.name} is waiting. See the Map in the barn.` : 'All orders done! A Golden Season is waiting. See the Map in the barn.', 7);
        sfx('win');
        sfx('cheer');
        A.music('tractor', 'win');
        winT = 8;
      } else {
        toast(`Order done! +${fmt(o.reward)} coins. A treasure chest is in the barn.`, 5);
        sfx('levelUp');
      }
    }
    return coins;
  }
  let winT = 0;

  // ---------- barn screen ----------
  let barnOpen = false, onPad = false, pauseMode = false;
  let sale: { count: number; value: number; doubled: boolean } | null = null;
  type Tab = 'shop' | 'garage' | 'farm' | 'cats' | 'goals' | 'map';
  const TABS: [Tab, string][] = [['shop', 'Upgrades'], ['garage', 'Garage'], ['farm', 'Farm'], ['cats', 'Cats & animals'], ['goals', 'Orders & album'], ['map', 'Map']];
  let tab: Tab = 'shop';
  const barnEl = document.createElement('div');
  barnEl.className = 'tr-barn';
  barnEl.hidden = true;
  document.body.append(barnEl);

  interface Card { title: string; line: string; btn: string; cost?: number; off?: boolean; help: string; act?: () => void | Promise<void>; sound?: SfxName }
  let cards: Card[] = [];
  const BONUSES: { key: string; name: string; help: string; reward: string; epic?: boolean; on: () => boolean; grant: () => void }[] = [
    { key: 'T', name: 'Turbo', help: `Answer a question: drive faster for ${D.TURBO_SECONDS} seconds.`, reward: `Turbo speed for ${D.TURBO_SECONDS} seconds`, on: () => turboT > 0, grant: () => ((turboT = D.TURBO_SECONDS), sfx('boost')) },
    { key: 'H', name: 'Helper cat', help: `Answer a question: a helper cat joins you for ${D.TEMP_HELPER_SECONDS} seconds.`, reward: `A helper cat for ${D.TEMP_HELPER_SECONDS} seconds`, on: () => tempHelperT > 0, grant: () => ((tempHelperT = D.TEMP_HELPER_SECONDS), syncHelpers(), sfx('meow')) },
    { key: 'L', name: 'Big load', help: 'Answer a question: no load limit until your next sale.', reward: 'No load limit until your next sale', on: () => unlimited, grant: () => (unlimited = true) },
    { key: 'S', name: 'Super cutter', help: `Answer a question: the cutter is ${D.SUPER_POWER} times stronger for ${D.SUPER_SECONDS} seconds.`, reward: `A cutter ${D.SUPER_POWER} times stronger for ${D.SUPER_SECONDS} seconds`, on: () => superT > 0 || megaT > 0, grant: () => ((superT = D.SUPER_SECONDS), sfx('boost')) },
    { key: 'M', name: 'Mega harvest', epic: true, help: `Epic question: for ${D.MEGA_SECONDS / 60} minutes the cutter is ${D.MEGA_POWER} times stronger, with turbo speed.`, reward: `Mega harvest: a cutter ${D.MEGA_POWER} times stronger and turbo speed for ${D.MEGA_SECONDS / 60} minutes`, on: () => megaT > 0, grant: () => ((megaT = D.MEGA_SECONDS), sfx('boost'), sfx('cheer')) },
  ];

  function buildCards(): Card[] {
    const out: Card[] = [];
    if (pauseMode) {
      out.push({ title: 'Paused', line: 'The farm waits for you.', btn: 'Keep farming', help: 'Back to the fields.', act: closeBarn });
      out.push({ title: 'Stuck?', line: 'Hop to open ground nearby.', btn: 'Unstuck', help: 'Lifts your vehicle out and sets it down on free ground. Key: U.', act: () => (closeBarn(), unstuck()) });
      out.push({ title: 'Picture quality', line: `Now: ${cap1(S.quality)}${S.quality === 'auto' ? ` (${low ? 'Low' : 'High'})` : ''}`, btn: 'Change', help: 'High looks best. Low runs smoother on tablets. Auto picks for this device.', act: () => {
        S.quality = S.quality === 'auto' ? 'high' : S.quality === 'high' ? 'low' : 'auto';
        applyQuality(true);
      } });
      out.push({ title: 'Camera', line: farCam ? 'Now: far' : 'Now: near', btn: 'Switch', help: 'Near or far view.', act: () => void (farCam = !farCam) });
      return out;
    }
    if (tab === 'shop')
      for (const id of TRACK_IDS) {
        const t = D.TRACKS[id], lv = S.lv[id], max = lv >= t.max;
        out.push({ title: t.name, line: max ? t.show(lv) : `${t.show(lv)} <span class="tr-to">&rarr;</span> <b>${t.show(lv + 1)}</b>`, btn: max ? 'Max' : '', cost: max ? undefined : t.cost(lv), off: max, help: t.help, sound: id === 'power' ? 'levelUp' : 'buy', act: () => void S.lv[id]++ });
      }
    if (tab === 'garage')
      for (const id of Object.keys(D.VEHICLES) as D.VehicleId[]) {
        const V = D.VEHICLES[id], own = S.vehicles.includes(id), here = S.farms[V.farm].open;
        const stats = `Speed x${V.speed} &middot; Load x${V.load} &middot; Cut x${V.width} &middot; Power x${V.power}`;
        if (own) out.push({ title: V.name, line: stats, btn: S.vehicle === id ? 'Driving' : 'Drive it', off: S.vehicle === id, help: V.blurb, sound: 'select', act: () => ((S.vehicle = id), setVehicle()) });
        else if (here) out.push({ title: V.name, line: stats, btn: '', cost: D.vehicleCost(id), help: V.blurb, sound: 'unlock', act: () => (S.vehicles.push(id), (S.vehicle = id), setVehicle()) });
        else out.push({ title: '???', line: `Sold at ${D.FARMS[V.farm].name}`, btn: 'Not yet', off: true, help: 'A new vehicle waits on a later farm.' });
      }
    if (tab === 'farm') {
      farm.plots.forEach((p, i) => {
        if (!F.plots[i]) out.push({ title: `Land: ${p.name}`, line: p.crops.map((c) => cap1(D.CROPS[c].name)).join(', '), btn: '', cost: D.plotCost(farm, p), help: 'Buy this plot to farm it.', sound: 'unlock', act: () => buyPlot(i, true) });
      });
      for (const b of BUILD_IDS) {
        const lv = F.builds[b], max = lv >= D.BUILD_LEVELS;
        out.push({ title: D.BUILDS[b].name, line: max ? 'Level 3' : lv ? `Level ${lv} <span class="tr-to">&rarr;</span> <b>${lv + 1}</b>` : 'Not built', btn: max ? 'Max' : '', cost: max ? undefined : D.buildCost(farm, b, lv), off: max, help: D.BUILDS[b].help, sound: 'grow', act: () => (F.builds[b]++, syncFarm()) });
      }
      const dn = F.decor, dmax = dn >= farm.decor.length;
      out.push({ title: 'Decoration', line: dmax ? 'All 6 placed' : `${dn} of 6 placed`, btn: dmax ? 'Done' : '', cost: dmax ? undefined : D.decorCost(farm, dn), off: dmax, help: 'A pretty thing for the barnyard. Just for looks.', sound: 'sparkle', act: () => (F.decor++, syncFarm()) });
    }
    if (tab === 'cats') {
      const hn = S.helpers.length, hmax = hn >= D.HELPER_MAX;
      out.push({ title: 'Hire a helper cat', line: `${hn} of ${D.HELPER_MAX} cats`, btn: hmax ? 'Full' : '', cost: hmax ? undefined : D.helperCost(hn), off: hmax, help: 'A cat friend who works with you on every farm, for good.', sound: 'meow', act: () => (S.helpers.push('picker'), syncHelpers()) });
      S.helpers.forEach((j, i) => out.push({ title: `Cat ${i + 1}: ${D.JOBS[j].name}`, line: D.JOBS[j].help, btn: 'Change job', help: 'Picker, Hauler or Seller. Change any time.', sound: 'meow', act: () => void (S.helpers[i] = j === 'picker' ? 'hauler' : j === 'hauler' ? 'seller' : 'picker') }));
      const room = F.builds.pen * D.BUILDS.pen.per, an = F.animals.length;
      F.animals.forEach((fed, i) => out.push({ title: `${farm.animalName} ${i + 1}`, line: fed >= D.animalFeed(farm, i) ? 'Grown up: +3% coins here' : `Growing: ${fed} / ${D.animalFeed(farm, i)} crops`, btn: fed >= D.animalFeed(farm, i) ? 'Happy' : 'Growing', off: true, help: 'Animals grow as you sell crops on this farm.' }));
      out.push({ title: `Raise a ${farm.animalName.toLowerCase()}`, line: room ? `${an} of ${room} in the pen` : 'Build an animal pen first (Farm tab)', btn: an >= room ? (room >= 6 ? 'Full' : 'No room') : '', cost: an >= room ? undefined : D.animalCost(farm, an), off: an >= room, help: 'A baby animal. It grows as you sell crops here, then adds coins to every sale.', sound: 'pop', act: () => (F.animals.push(0), syncFarm()) });
    }
    if (tab === 'goals') {
      out.push({ title: F.done < farm.orders ? `Order ${F.done + 1} of ${farm.orders}` : `Bonus order ${F.done + 1 - farm.orders}`, line: `${cap1(needText())}. Pays ${fmt(order().reward)}.`, btn: 'In progress', off: true, help: 'Sell these crops to fill the order. Finish all the orders to open the next farm.' });
      out.push({ title: 'Treasure chest', line: F.chest ? `${fmt(F.chest)} coins inside` : 'Empty. Finish an order to fill it.', btn: 'Open (epic question)', off: !F.chest, help: 'Epic question: pencil-and-paper math for a big pile of coins.', act: async () => {
        if (await bonus(`A treasure chest with ${fmt(F.chest)} coins`, true)) {
          S.coins += F.chest;
          F.chest = 0;
          sfx('coin');
          sfx('cheer');
        }
      } });
      for (const k of Object.keys(D.CROPS) as D.CropKind[]) {
        const n = S.album[k] ?? 0;
        if (!n) continue;
        const m = D.MEDALS.filter((x) => n >= x).length;
        out.push({ title: cap1(D.CROPS[k].name), line: `${fmt(n)} harvested${m < 3 ? ` &middot; next medal at ${fmt(D.MEDALS[m])}` : ''}`, btn: m ? `${D.MEDAL_NAMES[m - 1]} medal` : 'No medal yet', off: true, help: 'Album: harvest more of a crop to earn bronze, silver and gold medals.' });
      }
    }
    if (tab === 'map') {
      D.FARMS.forEach((f, i) => {
        const fs = S.farms[i], prev = S.farms[i - 1];
        const line = `${f.region} &middot; ${D.farmCrops(f).map((c) => D.CROPS[c].name).join(', ')}`;
        if (i === S.farm) out.push({ title: f.name, line, btn: 'You are here', off: true, help: `${Math.min(fs.done, f.orders)} of ${f.orders} orders done.` });
        else if (fs.open) out.push({ title: f.name, line, btn: 'Travel', help: 'Drive to this farm. Everything you own comes along.', sound: 'whoosh', act: () => travel(i) });
        else if (prev && prev.done >= D.FARMS[i - 1].orders) out.push({ title: f.name, line, btn: '', cost: D.farmCost(f), help: 'Move to this bigger farm. Your upgrades, vehicles and cats come along.', sound: 'unlock', act: () => ((fs.open = true), travel(i)) });
        else out.push({ title: f.name, line: f.region, btn: 'Locked', off: true, help: `Finish all ${D.FARMS[i - 1].orders} orders at ${D.FARMS[i - 1].name} first.` });
      });
      const last = S.farms[D.FARMS.length - 1];
      if (last.open) {
        const ready = last.done >= D.FARMS[D.FARMS.length - 1].orders;
        out.push({ title: `Golden Season ${S.season + 1}`, line: `Every crop is ${D.SEASON_STEP} times tougher and worth ${D.SEASON_STEP} times more.`, btn: ready ? 'Start' : 'Locked', off: !ready, help: 'Play every farm again with golden crops. You keep everything; orders start over.', sound: 'win', act: () => {
          S.season++;
          S.farms.forEach((f) => ((f.done = 0), (f.prog = [])));
          travel(0);
        } });
      }
    }
    return out;
  }

  function renderBarn(focusSel?: string) {
    cards = buildCards();
    const cardHtml = cards.map((c, i) => {
      const short = c.cost !== undefined && S.coins < c.cost;
      return `<div class="tr-card"><div class="cm-label">${c.title}</div><div class="tr-stat-row">${c.line}</div>
        <button type="button" class="cm-btn tr-buy${short ? ' short' : ''}" data-card="${i}" data-help="${c.help}" ${c.off ? 'disabled' : ''}>
        ${c.cost !== undefined ? `<i class="tr-coin"></i><span class="cm-num">${fmt(c.cost)}</span>` : c.btn}${i < 9 ? `<span class="cm-key">${i + 1}</span>` : ''}</button></div>`;
    }).join('');
    const saleRow = sale && !pauseMode
      ? `<div class="tr-sale"><span>Sold ${sale.count} crops</span><b class="cm-num"><i class="tr-coin"></i>+${fmt(sale.value * (sale.doubled ? 2 : 1))}</b>
         ${sale.doubled ? '<span class="tr-done">Doubled</span>' : `<button type="button" class="cm-btn good" data-double data-help="Answer a school question to double these coins.">Double coins<span class="cm-key">X</span></button>`}</div>`
      : '';
    const tabRow = pauseMode ? '' : `<div class="tr-tabs" role="tablist">${TABS.map(([id, name]) => `<button type="button" role="tab" class="cm-btn${id === tab ? ' main' : ''}" data-tab="${id}" data-help="${name}. Switch tabs with [ and ].">${name}</button>`).join('')}</div>`;
    const bonusRow = pauseMode || tab !== 'shop' ? '' : `<div class="tr-bonus"><span class="cm-label">Earn a bonus</span>${BONUSES.map((b, i) =>
      `<button type="button" class="cm-btn${b.epic ? ' good' : ''}" data-bonus="${i}" data-help="${b.help}" ${b.on() ? 'disabled' : ''}>${b.on() ? `${b.name} on` : b.name}<span class="cm-key">${b.key}</span></button>`).join('')}</div>`;
    barnEl.innerHTML = `<div class="tr-barn-panel cm-panel" role="dialog" aria-label="${pauseMode ? 'Paused' : 'Barn'}">
      <div class="tr-barn-head"><h2 class="cm-title">${pauseMode ? 'Paused' : farm.name}</h2><span class="tr-stat"><i class="tr-coin"></i><b class="cm-num">${fmt(S.coins)}</b></span></div>
      ${saleRow}${tabRow}
      <div class="tr-cards">${cardHtml}</div>${bonusRow}
      <div class="tr-barn-foot"><p class="cm-help" data-help-text></p>
        <button type="button" class="cm-btn main" data-drive data-help="Back to the fields.">Drive<span class="cm-key">Esc</span></button></div>
    </div>`;
    const target = (focusSel && barnEl.querySelector<HTMLElement>(focusSel + ':not(:disabled)')) || barnEl.querySelector<HTMLElement>('[data-drive]')!;
    target.focus();
    showHelp(target);
  }
  function showHelp(t: Element | null) {
    const h = barnEl.querySelector('[data-help-text]');
    if (h) h.textContent = (t as HTMLElement | null)?.dataset?.help ?? '';
  }
  barnEl.addEventListener('focusin', (e) => showHelp(e.target as Element));
  barnEl.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (b) barnAction(b);
  });

  function openBarn(pause = false) {
    pauseMode = pause;
    barnOpen = true;
    paused = true;
    v = 0;
    keys.clear();
    barnEl.hidden = false;
    sfx('select');
    A.music('tractor', 'menu');
    renderBarn();
    updateHud();
  }
  function closeBarn() {
    barnOpen = false;
    paused = false;
    barnEl.hidden = true;
    sale = null;
    keys.clear();
    last = performance.now();
    (document.activeElement as HTMLElement | null)?.blur();
    sfx('back');
    save();
    updateHud();
  }
  btnBarn.addEventListener('click', () => openBarn());
  btnPause.addEventListener('click', () => openBarn(true));

  function travel(i: number) {
    closeBarn();
    sfx('whoosh');
    loadFarm(i, true);
    wasOnPad = false;
    toast(`Welcome to ${D.FARMS[i].name}!`, 5);
    save();
  }
  function buyPlot(i: number, paid = false) {
    const cost = D.plotCost(farm, farm.plots[i]);
    if (!paid && !spend(cost)) {
      sfx('error');
      return hint(`You need ${fmt(cost - S.coins)} more coins for ${farm.plots[i].name}.`);
    }
    F.plots[i] = true;
    syncFarm();
    const p = W.plots[i].sign.position;
    puff(p.x, p.y + 2, p.z, 0xffd84f, 30, 0, 3);
    if (!paid) {
      sfx('unlock');
      toast(`${farm.plots[i].name} is yours!`);
      save();
    }
  }
  btnBuy.addEventListener('click', () => nearSale >= 0 && buyPlot(nearSale));
  btnUnstuck.addEventListener('click', () => unstuck());

  async function barnAction(b: HTMLButtonElement) {
    if (b.disabled) return;
    if (b.dataset.drive !== undefined) return closeBarn();
    if (b.dataset.tab) {
      tab = b.dataset.tab as Tab;
      sfx('tap');
      return renderBarn(`[data-tab="${tab}"]`);
    }
    if (b.dataset.card !== undefined) {
      const c = cards[Number(b.dataset.card)];
      if (!c?.act || c.off) return;
      if (c.cost !== undefined && !spend(c.cost)) {
        b.classList.remove('shake');
        void b.offsetWidth;
        b.classList.add('shake');
        sfx('error');
        const help = barnEl.querySelector('[data-help-text]');
        if (help) help.textContent = `You need ${fmt(c.cost - S.coins)} more coins.`;
        return;
      }
      sfx(c.sound ?? (c.cost !== undefined ? 'buy' : 'tap'));
      await c.act();
      if (!barnOpen) return;
      save();
      return renderBarn(`[data-card="${b.dataset.card}"]`);
    }
    if (b.dataset.double !== undefined && sale && !sale.doubled) {
      if (await bonus('Double the coins from this sale')) {
        S.coins += sale.value;
        sale.doubled = true;
        sfx('coin');
        save();
      }
      return renderBarn('[data-drive]');
    }
    if (b.dataset.bonus !== undefined) {
      const bo = BONUSES[Number(b.dataset.bonus)];
      if (await bonus(bo.reward, bo.epic)) bo.grant();
      renderBarn(`[data-bonus="${b.dataset.bonus}"]`);
    }
  }

  // Arrow keys move focus to the nearest button in that direction.
  function moveFocus(dx: number, dy: number) {
    const all = [...barnEl.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.disabled || b.dataset.card);
    const cur = document.activeElement as HTMLElement;
    const r0 = cur?.getBoundingClientRect();
    if (!r0 || !all.includes(cur as HTMLButtonElement)) return all.at(-1)?.focus();
    const cx = r0.x + r0.width / 2, cy = r0.y + r0.height / 2;
    let best: HTMLElement | null = null, bestD = Infinity;
    for (const b of all) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect();
      const ox = r.x + r.width / 2 - cx, oy = r.y + r.height / 2 - cy;
      const along = ox * dx + oy * dy;
      if (along <= 4) continue;
      const d = along + Math.abs(ox * dy + oy * dx) * 2.5;
      if (d < bestD) (bestD = d), (best = b);
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest' });
      sfx('tap', 1, 0.5);
    }
  }

  // ---------- input ----------
  const keys = new Set<string>();
  let target: THREE.Vector3 | null = null;
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (barnOpen) {
      if (bonusOpen) return;
      const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dirs[k]) {
        e.preventDefault();
        return moveFocus(...dirs[k]);
      }
      if (k === 'Escape' || (pauseMode && k === 'p')) return closeBarn();
      if (pauseMode && k === 'u') return closeBarn(), unstuck();
      if (k === 'Enter' || k === ' ') {
        const a = document.activeElement;
        e.preventDefault();
        if (a instanceof HTMLButtonElement && barnEl.contains(a)) barnAction(a);
        else closeBarn();
        return;
      }
      if ((k === '[' || k === ']') && !pauseMode) {
        tab = TABS[(TABS.findIndex((t) => t[0] === tab) + (k === ']' ? 1 : TABS.length - 1)) % TABS.length][0];
        sfx('tap');
        return renderBarn(`[data-tab="${tab}"]`);
      }
      const bi = BONUSES.findIndex((b) => b.key.toLowerCase() === k);
      const sel = k >= '1' && k <= '9' ? `[data-card="${Number(k) - 1}"]` : k === 'x' ? '[data-double]' : bi >= 0 ? `[data-bonus="${bi}"]` : '';
      const b = sel && barnEl.querySelector<HTMLButtonElement>(sel);
      if (b) {
        b.focus();
        barnAction(b);
      }
      return;
    }
    if (paused) return;
    if (k === 'c') farCam = !farCam;
    else if (k === 'b' && onPad) openBarn();
    else if (k === 'b' && nearSale >= 0) buyPlot(nearSale);
    else if (k === 'p' || k === 'Escape') openBarn(true);
    else if (k === 'q' && !btnBag.hidden) btnBag.click();
    else if (k === 'u') unstuck();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' '].includes(k)) {
      e.preventDefault();
      keys.add(k);
      target = null;
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());

  // Tap, click or drag on the ground: the tractor drives to that spot.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = false;
  function pointTo(e: PointerEvent) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // March the ray down to the rolling ground.
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.y >= -0.02) return;
    let t = (W.groundY(S.x, S.z) - o.y) / d.y;
    for (let i = 0; i < 4; i++) t = (W.groundY(o.x + d.x * t, o.z + d.z * t) - o.y) / d.y;
    target = new THREE.Vector3(o.x + d.x * t, 0, o.z + d.z * t);
  }
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (paused) return;
    dragging = true;
    renderer.domElement.setPointerCapture(e.pointerId);
    pointTo(e);
  });
  renderer.domElement.addEventListener('pointermove', (e) => dragging && !paused && pointTo(e));
  const endDrag = () => (dragging = false);
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  // ---------- simulation ----------
  const shrinking: { p: PlotState; i: number; t: number }[] = [];
  let snipCd = 0, bumpCd = 0;

  function cutCrop(pi: number, i: number, byCat = false) {
    const p = W.plots[pi];
    p.alive[i] = 0;
    p.hp[i] = 0;
    p.aliveCount--;
    shrinking.push({ p, i, t: 0 });
    dirty = true;
    const kind = p.def.crops[p.kind[i]];
    if (shrinking.length % (low ? 3 : 1) === 0) puff(p.pos[i * 5], p.pos[i * 5 + 1] + 0.5, p.pos[i * 5 + 2], D.CROPS[kind].color, byCat ? 4 : 3, 0, 0.8);
    if (snipCd <= 0) {
      sfx(byCat ? 'pop' : 'snip', 0.85 + (Object.keys(D.CROPS).indexOf(kind) % 5) * 0.07, byCat ? 0.3 : 0.45);
      snipCd = 0.07;
    }
    if (p.aliveCount === 0) {
      const gift = p.value * mult() * (D.SWEEP_BONUS + F.builds.greenhouse * D.BUILDS.greenhouse.per);
      S.coins += gift;
      toast(`Clean sweep of ${p.def.name}! +${fmt(gift)} coins. It grows back after your next sale.`, 4);
      sfx('star');
      puff(S.x, W.groundY(S.x, S.z) + 2, S.z, 0xffd84f, 40, 0, 4);
    }
    return kind;
  }

  function sell() {
    const count = carried();
    let value = 0;
    for (const [k, n] of Object.entries(S.load) as [D.CropKind, number][]) value += deliver(k, n);
    sale = { count, value, doubled: false };
    S.load = {};
    S.bestSale = Math.max(S.bestSale, value);
    unlimited = false;
    sfx('coin');
    puff(PAD.x, 1.5, PAD.z, 0xffd84f, 30, 0, 3);
    // Emptied plots grow back after a sale.
    let regrew = false;
    for (const p of W.plots)
      if (p.aliveCount === 0 && p.n) {
        p.alive.fill(1);
        p.hp.fill(1);
        p.aliveCount = p.n;
        p.grow = 0;
        regrew = true;
      }
    if (regrew) sfx('grow');
    save();
  }

  const fwd = new THREE.Vector3();
  /** Returns true while she is trying to drive (keys or a tap target). */
  function stepTractor(dt: number) {
    let throttle = 0, steer = 0;
    if (keys.has('ArrowUp') || keys.has('w')) throttle += 1;
    if (keys.has('ArrowDown') || keys.has('s')) throttle -= 1;
    if (keys.has('ArrowLeft') || keys.has('a')) steer += 1;
    if (keys.has('ArrowRight') || keys.has('d')) steer -= 1;
    if (target && !throttle && !steer) {
      const dx = target.x - S.x, dz = target.z - S.z, dist = Math.hypot(dx, dz);
      if (dist < 1.0 && !dragging) target = null;
      else {
        let diff = Math.atan2(dx, dz) - S.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        steer = Math.max(-1, Math.min(1, diff * 2.5));
        throttle = dist < 1.0 ? 0 : Math.max(0.15, Math.cos(diff)) * Math.min(1, dist / 3);
      }
    }
    // Hills: slower going up, faster going down.
    const sx = Math.sin(S.heading), sz = Math.cos(S.heading);
    const grade = (W.groundY(S.x + sx, S.z + sz) - W.groundY(S.x - sx, S.z - sz)) / 2;
    const hill = S.vehicle === 'snowcat' ? 1 : Math.max(0.6, Math.min(1.25, 1 - grade * D.SLOPE_FACTOR * Math.sign(v || 1)));
    const max = Math.min(top() * hill, cutCap);
    const want = throttle * (throttle < 0 ? Math.min(max, top() * 0.5) : max);
    v += (want - v) * Math.min(1, dt * (Math.abs(want) < Math.abs(v) ? 7 : 4));
    const turnRate = 2.4 * (0.35 + 0.65 * Math.min(1, Math.abs(v) / 4 + (throttle === 0 ? 1 : 0)));
    S.heading += steer * turnRate * dt * (v < -0.1 ? -1 : 1);
    const nx = S.x + Math.sin(S.heading) * v * dt, nz = S.z + Math.cos(S.heading) * v * dt;
    let hit: number;
    [S.x, S.z, hit] = W.move(S.x, S.z, nx, nz, TRACTOR_R);
    if (hit && Math.abs(v) > 0.05) {
      if (Math.abs(v) > 2.5 && bumpCd <= 0) {
        sfx(hit === 2 ? 'splash' : 'thud', 1, 0.6);
        if (hit === 2) puff(nx, 0, nz, 0xbfeaff, 14, 0, 1.5);
        if (hit === 3) hint('This is the edge of the farm.');
        bumpCd = 0.8;
      }
      v *= 0.5;
    }
    if (Math.abs(v) > 0.05) dirty = true;
    return throttle !== 0;
  }

  // ---------- un-stuck: a hop to the nearest free spot she can drive away from ----------
  let hop: { fx: number; fz: number; fh: number; tx: number; tz: number; th: number; t: number } | null = null;
  let hopY = 0, stuckT = 0, stuckShow = 0, anchorX = S.x, anchorZ = S.z;
  function unstuck() {
    if (hop || paused) return;
    const [tx, tz, th] = W.rescue(S.x, S.z, TRACTOR_R, S.heading);
    hop = { fx: S.x, fz: S.z, fh: S.heading, tx, tz, th, t: 0 };
    v = 0;
    target = null;
    stuckT = stuckShow = 0;
    keys.clear();
    sfx('whoosh');
    puff(S.x, W.groundY(S.x, S.z) + 0.4, S.z, 0xf4f0e8, 18, 1, 2.6);
    updateHud();
  }
  function stepHop(dt: number) {
    const h = hop!;
    h.t = Math.min(1, h.t + dt / D.HOP_SECONDS);
    const e = h.t * h.t * (3 - 2 * h.t);
    S.x = h.fx + (h.tx - h.fx) * e;
    S.z = h.fz + (h.tz - h.fz) * e;
    S.heading = h.fh + Math.atan2(Math.sin(h.th - h.fh), Math.cos(h.th - h.fh)) * e;
    hopY = Math.sin(h.t * Math.PI) * (D.HOP_HEIGHT + Math.hypot(h.tx - h.fx, h.tz - h.fz) * 0.15);
    if (h.t < 1) return;
    hop = null;
    hopY = 0;
    anchorX = S.x;
    anchorZ = S.z;
    sfx('thud', 1.1, 0.7);
    sfx('pop');
    puff(S.x, W.groundY(S.x, S.z) + 0.2, S.z, farm.look.path, 24, 1, 3);
    dirty = true;
  }

  function stepCutting(dt: number, t: number) {
    fwd.set(Math.sin(S.heading), 0, Math.cos(S.heading));
    const hz = T.header.position.z + 0.2;
    const cx = S.x + fwd.x * hz, cz = S.z + fwd.z * hz, r = width(), pw = power(), SP = D.CROP_SPACING;
    let toughest = 0, room = cap() - carried();
    for (let pi = 0; pi < W.plots.length; pi++) {
      const p = W.plots[pi], d = p.def;
      if (Math.abs(cx - d.x) > d.w / 2 + r || Math.abs(cz - d.z) > d.d / 2 + r || p.aliveCount === 0) continue;
      const c0 = Math.max(0, Math.floor((cx - r - p.x0) / SP)), c1 = Math.min(p.cols - 1, Math.ceil((cx + r - p.x0) / SP));
      const r0 = Math.max(0, Math.floor((cz - r - p.z0) / SP)), r1 = Math.min(p.rows - 1, Math.ceil((cz + r - p.z0) / SP));
      for (let row = r0; row <= r1; row++)
        for (let col = c0; col <= c1; col++) {
          const i = p.cell[row * p.cols + col];
          if (i < 0 || !p.alive[i] || Math.hypot(p.pos[i * 5] - cx, p.pos[i * 5 + 2] - cz) > r) continue;
          if (!F.plots[pi]) {
            hint(`${d.name} is for sale: ${fmt(D.plotCost(farm, d))} coins. Drive to its sign, or buy it in the barn.`);
            continue;
          }
          if (room <= 0) {
            if (Math.abs(v) > 0.5) hint('Your trailer is full! Sell at the barn.');
            continue;
          }
          const kind = d.crops[p.kind[i]], tough = D.CROPS[kind].tough * mult();
          toughest = Math.max(toughest, tough);
          p.hp[i] -= (dt * D.CUT_K * pw) / tough / CUT_LEN;
          if (p.hp[i] <= 0) {
            cutCrop(pi, i);
            S.load[kind] = (S.load[kind] ?? 0) + 1;
            room--;
            T.pileMat.color.setHex(D.CROPS[kind].color);
          } else W.setCrop(p, i, 1, Math.sin(t * 40 + i) * 0.25 * (1 - p.hp[i]));
        }
    }
    const slow = toughest ? D.cutSpeed(pw, toughest, 1e9) : Infinity;
    cutCap = toughest ? slow * 0.9 : Infinity;
    chewing = toughest && slow < top() * 0.7 ? Math.min(1, chewing + dt * 2) : Math.max(0, chewing - dt);
    if (chewing > 0.5 && bumpCd <= 0 && Math.abs(v) > 0.1) {
      sfx('crunch', 0.9, 0.5);
      bumpCd = 0.4;
    }
    if (toughest && slow < top() * 0.35) hint('Tough crop! It cuts slowly. A stronger Harvester (barn) cuts it faster.');
  }

  function stepHelpers(dt: number, t: number) {
    const fast = (1 + F.builds.windmill * D.BUILDS.windmill.per) * (S.vehicle === 'wagon' ? 2 : 1);
    helpers.forEach((h, hi) => {
      const picker = hi >= S.helpers.length || S.helpers[hi] === 'picker';
      if (picker && (h.plot < 0 || !W.plots[h.plot].alive[h.idx])) {
        // Work the owned plot nearest the tractor that still has crops.
        h.plot = -1;
        let bd = 60;
        W.plots.forEach((p, pi) => {
          const d = Math.hypot(p.def.x - S.x, p.def.z - S.z) - Math.max(p.def.w, p.def.d) / 2;
          if (F.plots[pi] && p.aliveCount > 0 && d < bd) (bd = d), (h.plot = pi);
        });
        if (h.plot >= 0) {
          const p = W.plots[h.plot];
          const taken = new Set(helpers.filter((o) => o !== h && o.plot === h.plot).map((o) => o.idx));
          let best = -1, bdd = Infinity;
          for (let i = 0; i < p.n; i++) {
            if (!p.alive[i] || taken.has(i)) continue;
            const d = (p.pos[i * 5] - h.x) ** 2 + (p.pos[i * 5 + 2] - h.z) ** 2;
            if (d < bdd) (bdd = d), (best = i);
          }
          h.idx = best;
          h.wait = 0;
          if (best < 0) h.plot = -1;
        }
      }
      let tx: number, tz: number;
      if (picker && h.plot >= 0) {
        tx = W.plots[h.plot].pos[h.idx * 5];
        tz = W.plots[h.plot].pos[h.idx * 5 + 2];
      } else {
        // Nothing to pick (or another job): tag along behind the tractor.
        tx = S.x - Math.sin(S.heading) * (6 + hi * 1.4) + Math.cos(S.heading) * ((hi % 3) - 1) * 1.6;
        tz = S.z - Math.cos(S.heading) * (6 + hi * 1.4) - Math.sin(S.heading) * ((hi % 3) - 1) * 1.6;
      }
      const dx = tx - h.x, dz = tz - h.z, dist = Math.hypot(dx, dz);
      if (picker && h.plot >= 0 && dist < 0.6) {
        const p = W.plots[h.plot], kind = p.def.crops[p.kind[h.idx]];
        h.wait += dt * fast;
        W.setCrop(p, h.idx, 1, Math.sin(t * 30) * 0.2);
        if (h.wait >= D.pickSeconds(power(), D.CROPS[kind].tough * mult())) {
          cutCrop(h.plot, h.idx, true);
          deliver(kind, 1);
          h.hop = 1;
          h.plot = -1;
        }
      } else if (dist > 0.4) {
        const step = Math.min(dist, D.HELPER_SPEED * fast * (dist > 10 ? 2.5 : 1) * dt);
        h.x += (dx / dist) * step;
        h.z += (dz / dist) * step;
        h.heading = Math.atan2(dx, dz);
      }
      h.hop = Math.max(0, h.hop - dt * 3);
      const walking = dist > 0.4 ? Math.abs(Math.sin(t * 12 + hi)) * 0.15 : 0;
      h.cat.root.position.set(h.x, W.groundY(h.x, h.z) + walking + Math.sin(h.hop * Math.PI) * 0.6, h.z);
      h.cat.root.rotation.y = h.heading;
      M.animateCat(h.cat, t, hi + 1);
    });
  }

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3();
  let camFree: number[] | null = null; // test hook only
  function stepCamera(dt: number) {
    const portrait = camera.aspect < 1 ? 1.35 : 1;
    const gy = W.groundY(S.x, S.z);
    let dist = (farCam ? 27 : 12.5) * portrait, hgt = (farCam ? 23 : 6.4) * portrait;
    // Keep the camera out of the barn and other tall buildings: slide it closer and higher until it is clear.
    for (let k = 0; k < 8; k++) {
      const x = S.x - Math.sin(S.heading) * dist, z = S.z - Math.cos(S.heading) * dist;
      if (!W.tall.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 2 && gy + hgt < b.h + 6)) break;
      dist *= 0.8;
      hgt += 2.2;
    }
    want.set(S.x - Math.sin(S.heading) * dist, gy + hgt, S.z - Math.cos(S.heading) * dist);
    want.y = Math.max(want.y, W.groundY(want.x, want.z) + 3);
    look.set(S.x + Math.sin(S.heading) * (farCam ? 4 : 7), gy + (farCam ? 0.8 : 1.6), S.z + Math.cos(S.heading) * (farCam ? 4 : 7));
    const k = camInit ? Math.min(1, dt * 2.5) : 1;
    camInit = true;
    camPos.lerp(want, k);
    camLook.lerp(look, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (camFree) {
      camera.position.set(camFree[0], camFree[1], camFree[2]);
      camera.lookAt(camFree[3], camFree[4], camFree[5]);
    }
    sun.position.set(S.x + 26, gy + 46, S.z + 34);
    sun.target.position.set(S.x, gy, S.z);
    W.sky.position.copy(camera.position);
  }

  let smokeCd = 0;
  function stepVisuals(dt: number, t: number) {
    M.uTime.value = t;
    const gy = W.groundY(S.x, S.z), sx = Math.sin(S.heading), sz = Math.cos(S.heading);
    T.root.position.set(S.x, gy + hopY, S.z);
    const pitch = Math.atan2(W.groundY(S.x + sx * 1.5, S.z + sz * 1.5) - W.groundY(S.x - sx * 1.5, S.z - sz * 1.5), 3);
    const roll = Math.atan2(W.groundY(S.x + sz, S.z - sx) - W.groundY(S.x - sz, S.z + sx), 2);
    T.root.rotation.set(-pitch, S.heading, roll);
    const sp = Math.min(1, Math.abs(v) / 6);
    T.body.position.y = Math.sin(t * 31) * 0.012 + Math.abs(Math.sin(t * 9)) * 0.05 * sp + chewing * Math.sin(t * 50) * 0.02;
    T.body.rotation.z = Math.sin(t * 6.3) * 0.012 * sp;
    for (const w of T.wheels) w.rotation.x += (v * dt) / w.userData.r;
    T.reel.rotation.x += dt * (5 + Math.abs(v) * 1.5 + chewing * 10);
    T.header.scale.x = width() * 2;
    const n = carried();
    const fill = unlimited ? Math.min(1.6, 0.4 + n / 400) : Math.min(1, n / cap());
    T.pile.scale.y = (0.02 + fill * 0.75) * T.pileBase;
    T.pile.visible = n > 0;
    T.cat.root.position.y = T.catY + Math.abs(Math.sin(t * 9)) * 0.05 * sp;
    T.cat.root.rotation.z = Math.sin(t * 4) * 0.04 * sp;
    M.animateCat(T.cat, t);
    T.flap.forEach((f, i) => {
      if (f.userData.side) f.rotation.z = f.userData.side * (0.25 + Math.sin(t * (4 + sp * 6)) * 0.35);
      else f.position.y = Math.abs(Math.sin(t * (6 + sp * 6) + i * 1.5)) * 0.25 * (0.2 + sp);
    });
    if (T.exhaust && dt > 0 && (smokeCd -= dt * (1 + sp * 2 + chewing * 2)) <= 0) {
      smokeCd = 0.22;
      const e = T.exhaust.clone().applyMatrix4(T.root.matrixWorld);
      puff(e.x, e.y, e.z, S.vehicle === 'dragon' ? 0xffb8e8 : chewing > 0.5 ? 0x8a8a96 : 0xdedee6, 1, 1, 0.1);
    }
    for (let i = shrinking.length - 1; i >= 0; i--) {
      const s = shrinking[i];
      s.t += dt * 6;
      if (!s.p.alive[s.i]) W.setCrop(s.p, s.i, s.t >= 1 ? 0 : (1 - s.t) * (1 + s.t * 0.4), s.t);
      if (s.t >= 1) shrinking.splice(i, 1);
    }
    for (const p of W.plots)
      if (p.grow < 1) {
        p.grow = Math.min(1, p.grow + dt * 1.2);
        W.drawPlot(p);
      }
    W.plots.forEach((p, i) => p.sign.visible && (p.sign.position.y = W.groundY(p.sign.position.x, p.sign.position.z) + Math.abs(Math.sin(t * 2 + i)) * 0.3));

    // Guide arrow: to the barn when full, else to the nearest plot of hers that grows what the order needs.
    let gx: number | null = null, gz = 0;
    if (n >= cap()) (gx = PAD.x), (gz = PAD.z);
    else {
      const needs = order().needs.filter((nd, i) => (F.prog[i] ?? 0) + (S.load[nd.crop] ?? 0) < nd.count).map((nd) => nd.crop);
      let bd = Infinity, inside = false;
      W.plots.forEach((p, i) => {
        if (!F.plots[i] || p.aliveCount === 0 || (needs.length && !p.def.crops.some((c) => needs.includes(c)))) return;
        const d = Math.hypot(p.def.x - S.x, p.def.z - S.z);
        if (Math.abs(S.x - p.def.x) < p.def.w / 2 + 2 && Math.abs(S.z - p.def.z) < p.def.d / 2 + 2) inside = true;
        if (d < bd) (bd = d), (gx = p.def.x), (gz = p.def.z);
      });
      if (inside) gx = null;
    }
    arrow.visible = gx !== null && Math.hypot((gx ?? 0) - S.x, gz - S.z) > PAD.r + 2;
    if (arrow.visible && gx !== null) {
      const [wx, wz] = W.route(S.x, S.z, gx, gz);
      const a = Math.atan2(wx - S.x, wz - S.z), r = 5.5 + Math.sin(t * 5) * 0.4;
      const ax = S.x + Math.sin(a) * r, az = S.z + Math.cos(a) * r;
      arrow.position.set(ax, W.groundY(ax, az) + 0.5, az);
      arrow.rotation.y = a;
    }
    W.update(t);
    stepParts(dt);
  }

  // ---------- loop ----------
  resize();
  let last = performance.now();
  let wasOnPad = Math.hypot(S.x - PAD.x, S.z - PAD.z) < PAD.r;
  let slowT = 0, frames = 0;
  function tick(dt: number, t: number) {
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) elToast.hidden = true;
    toastCd -= dt;
    snipCd -= dt;
    bumpCd -= dt;
    turboT = Math.max(0, turboT - dt);
    superT = Math.max(0, superT - dt);
    megaT = Math.max(0, megaT - dt);
    if (tempHelperT > 0 && (tempHelperT = Math.max(0, tempHelperT - dt)) === 0) syncHelpers();
    if (hop) stepHop(dt);
    else if (stepTractor(dt)) {
      // Trying to drive but barely moving for a while: light up the Unstuck button.
      if (Math.hypot(S.x - anchorX, S.z - anchorZ) > D.STUCK_MOVE) (anchorX = S.x), (anchorZ = S.z), (stuckT = 0);
      else stuckT += dt;
    } else (anchorX = S.x), (anchorZ = S.z), (stuckT = 0);
    stuckShow = stuckT > D.STUCK_SECONDS ? 4 : stuckShow - dt;
    stepCutting(dt, t);
    stepHelpers(dt, t);
    onPad = Math.hypot(S.x - PAD.x, S.z - PAD.z) < PAD.r;
    if (onPad && !wasOnPad) {
      if (carried() > 0) sell();
      tab = sale ? tab : 'shop';
      openBarn();
    }
    wasOnPad = onPad;
    nearSale = W.plots.findIndex((p, i) => !F.plots[i] && Math.hypot(p.sign.position.x - S.x, p.sign.position.z - S.z) < 6);
    if (dirty && (saveTimer += dt) > 5) save();
    winT -= dt;
    A.music('tractor', winT > 0 ? 'win' : turboT > 0 || megaT > 0 ? 'intense' : 'play');
  }
  function frame(now: number) {
    const real = (now - last) / 1000;
    const dt = Math.min(0.05, real);
    last = now;
    const t = now / 1000;
    if (!paused) {
      tick(dt, t);
      // On "auto", drop to Low when the first seconds of driving run slowly.
      if (S.quality === 'auto' && !low && frames++ > 30 && frames < 400 && (slowT = slowT * 0.97 + real * 0.03) > 0.045) {
        low = true;
        S.quality = 'low';
        applyQuality(true);
        toast('Picture quality set to Low so the game runs smoothly. Change it in Pause.', 5);
      }
    }
    engine.setLevel(paused ? 0 : S.vehicle === 'wagon' ? 0 : 0.15 + Math.min(0.3, Math.abs(v) / 14) + chewing * 0.1);
    engine.setPitch(0.7 + Math.abs(v) / 12 + chewing * 0.25);
    stepVisuals(paused ? 0 : dt, t);
    stepCamera(dt);
    updateHud();
    if (low) renderer.render(scene, camera);
    else composer.render();
    requestAnimationFrame(frame);
  }
  updateHud();
  A.music('tractor', 'play');
  if (!raw) toast('Drive with the arrow keys, or tap where to go. Any crop can be cut: tough ones just take longer.', 7);
  else if ((raw as { v?: number }).v === 1) toast('Welcome back! Your coins and upgrades came along to the new farm.', 6);
  if (import.meta.env.DEV)
    (window as unknown as Record<string, unknown>).__tr = { S, cam: (a: number[] | null) => (camFree = a), go: (x: number, z: number, h: number) => ((S.x = x), (S.z = z), (S.heading = h), (v = 0), (hop = null), (hopY = 0), (camInit = false)),
      W: () => W, R: TRACTOR_R, unstuck, closeBarn, veh: (id: D.VehicleId) => ((S.vehicle = id), setVehicle()), state: () => ({ v, hop: !!hop, hopY, stuckT, stuckShow, paused }), sync: () => (setVehicle(), syncFarm(), syncHelpers()), travel, drive: (sec: number, ks: string[]) => {
      ks.forEach((k) => keys.add(k));
      for (let i = 0; i < sec * 60 && !paused; i++) tick(1 / 60, performance.now() / 1000 + i / 60);
      keys.clear();
      camInit = false;
    } };
  requestAnimationFrame(frame);
}
