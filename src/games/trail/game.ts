// Frostclaim: skiers carve tracks across the snow; close a loop back to your own land to claim what it wraps.
// This file is the page: views of a run, input, HUD, the campaign menus, the shops, sound, and saving.
import * as THREE from 'three';
import type { Camalot, LoopHandle, MusicMood, SfxName } from '../../core/contract';
import './trail.css';
import { Bursts, Gfx, Ground, Particles, Ribbon, buildLodge, buildWorld, heightAt, makeSkier, poseSkier, type Rig, type World } from './art';
import { Sim, pctOf, type Pt, type SimEvent, type SimSkier } from './sim';
import {
  ACHIEVEMENTS, BIG_START_R, CATCH_COINS, FLAKES_PER_MOUNTAIN, FLAKE_COINS, FREE_RUN, GEAR, GEAR_COST, GRID, LODGE, MOUNTAINS, PALETTE, PERK,
  PLAYER_SPEED, PLAYER_TURN, PURSE_COINS, RUNS_PER_MOUNTAIN, SKINS, STARS_FOR_DRAGON, START_R, THEMES, WIN_COINS,
  goalText, migrate, mountainOpen, runOpen, runsOf, statValue, totalFlakes, type RunDef, type SaveData, type Skin,
} from './data';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const GOLD_EPIC_FLAKES = 40; // snowflakes before the Golden Drake question opens

/** Everything drawn for one run. The rules live in Sim, so a View can be rebuilt (quality change) mid-run. */
class View {
  readonly scene = new THREE.Scene();
  readonly world: World;
  readonly ground: Ground;
  readonly snowFx: Particles;
  readonly sparkFx: Particles;
  readonly bursts = new Bursts();
  private rigs: Rig[] = [];
  private ribbons: Ribbon[] = [];
  private tagEls: HTMLElement[] = [];
  private tumble: number[] = [];
  private airMax: number[] = [];
  private claimFrom: Pt | null = null;
  private marks = '';
  private sand: boolean;

  constructor(readonly sim: Sim, tags: HTMLElement, readonly high: boolean) {
    const m = sim.mountain, th = THEMES[m.theme];
    this.sand = !!th.beach;
    this.world = buildWorld(this.scene, GRID, m, th, sim.terrain, high, !!sim.human);
    const colors = sim.skiers.map((s) => s.color);
    while (colors.length < 8) colors.push(0xffffff);
    this.ground = new Ground(GRID, th, colors, sim.terrain, this.world.lamps, this.world.sunDir, high);
    this.snowFx = new Particles(high ? 700 : 260, false);
    this.sparkFx = new Particles(high ? 400 : 140, true);
    this.scene.add(this.ground.mesh, this.snowFx.points, this.sparkFx.points, this.bursts.group);
    for (const s of sim.skiers) {
      const rig = makeSkier(s.kind, s.color, s.fur, this.sand, { gold: s.gold, champ: s.champ, ink: high });
      rig.blob.visible = !high;
      const ribbon = new Ribbon(s.color, !!th.night || s.human);
      this.scene.add(rig.root, ribbon.mesh);
      this.rigs.push(rig);
      this.ribbons.push(ribbon);
      const tag = document.createElement('div');
      tag.className = 'tr-tag' + (s.champ ? ' champ' : '');
      tag.style.setProperty('--c', hex(s.color));
      tags.append(tag);
      this.tagEls.push(tag);
      this.tumble.push(0);
      this.airMax.push(1);
    }
  }

  /** Called for every sim event, to start the matching effect. */
  onEvent(e: SimEvent) {
    if (e.t === 'claim') this.claimFrom = { x: e.who.x, z: e.who.z };
    else if (e.t === 'jump') {
      this.airMax[e.who.id - 1] = e.who.air;
      this.snowFx.burst(e.who.x, heightAt(e.who.x, e.who.z) + 0.3, e.who.z, 14, 3, 0.6, 0xffffff);
    } else if (e.t === 'down') {
      const s = e.who, y = heightAt(s.x, s.z);
      this.tumble[s.id - 1] = 1;
      this.snowFx.burst(s.x, y + 0.5, s.z, this.high ? 34 : 16, 4, 0.95, this.sand ? 0xf6e3b8 : 0xffffff);
      this.snowFx.burst(s.x, y + 0.5, s.z, 6, 3, 0.5, s.color);
      // A white snow-burst flash for any wipeout; a big coloured impact star when the player catches a rival.
      const caught = !!e.by?.human && !s.human;
      this.bursts.fire(s.x, y + 1.4, s.z, caught ? 9 : s.human ? 7 : 4.5, caught ? e.by!.color : 0xbfdcff);
      if (caught) for (let k = 0; k < 10; k++) this.sparkFx.emit(s.x, y + 1.4, s.z, Math.cos(k * 0.63) * 5, 2 + Math.random() * 3, Math.sin(k * 0.63) * 5, 0.9, 0.7, k % 2 ? e.by!.color : 0xffffff, 4);
    }
  }

  animate(dt: number, t: number, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, running: boolean, showTags: boolean) {
    const sim = this.sim, w = innerWidth, h = innerHeight;
    if (sim.dirty) {
      const cells = this.ground.update(sim.field.owner, this.claimFrom);
      for (const i of cells) {
        const x = (i % GRID) + 0.5, z = Math.floor(i / GRID) + 0.5;
        if (Math.hypot(x - focus.x, z - focus.z) < 40) this.sparkFx.emit(x, heightAt(x, z) + 0.2, z, 0, 1 + Math.random() * 2, 0, 0.7 + Math.random() * 0.8, 0.7 + Math.random() * 0.6, 0xffffff, -0.5);
      }
      this.claimFrom = null;
      sim.dirty = false;
      const owned = sim.terrain.marks.map((p) => !!sim.human && sim.field.owner[p.z * GRID + p.x] === sim.human.id);
      if (owned.join() !== this.marks) this.world.setMarks(owned);
      this.marks = owned.join();
    }
    this.ground.tick(dt, t);
    const v = new THREE.Vector3();
    sim.skiers.forEach((s, i) => {
      const rig = this.rigs[i], y = heightAt(s.x, s.z);
      if (this.tumble[i] > 0) {
        // A full cartwheel wipeout: skis over head, then gone in the snow burst.
        const k = (this.tumble[i] -= dt * 1.5);
        rig.lean.rotation.z -= dt * 15;
        rig.root.position.y = y + 0.9 + Math.sin(Math.max(0, k) * Math.PI) * 1.2;
        rig.root.scale.setScalar(Math.max(0.01, Math.min(1, k * 1.6)));
        rig.root.visible = k > 0;
      } else if (s.alive) {
        const hop = s.air > 0 ? Math.sin((1 - s.air / this.airMax[i]) * Math.PI) * 1.7 : 0;
        rig.root.position.set(s.x, y + hop, s.z);
        rig.root.rotation.y = -s.heading;
        rig.root.scale.setScalar(1);
        rig.lean.rotation.z = 0;
        rig.root.visible = s.safe <= 0 || Math.floor(t * 10) % 2 === 0;
        poseSkier(rig, t + i, dt, s.turnVel, s.air, running);
        rig.blob.position.y = 0.04 - hop;
        // Snow spray off the edges in a turn, and a little wake all the time.
        const near = Math.hypot(s.x - focus.x, s.z - focus.z) < 30;
        const carve = Math.abs(s.turnVel);
        if (running && near && s.air <= 0 && Math.random() < dt * (carve > 1.5 ? 110 : 10)) {
          const side = Math.sign(s.turnVel) || 1, px = -Math.sin(s.heading) * side, pz = Math.cos(s.heading) * side;
          const bx = s.x - Math.cos(s.heading) * 0.7, bz = s.z - Math.sin(s.heading) * 0.7;
          const fan = carve > 1.5 ? 2.2 + Math.random() * 2.2 : 1.2;
          this.snowFx.emit(bx, y + 0.15, bz, -px * fan + (Math.random() - 0.5), 1.4 + Math.random() * (carve > 1.5 ? 3.4 : 1.6), -pz * fan + (Math.random() - 0.5), 0.45 + Math.random() * 0.35, 0.4 + Math.random() * 0.55, this.sand ? 0xf2dcae : 0xffffff, 7);
        }
      } else rig.root.visible = false;
      this.ribbons[i].sync(s.pts);
      const tag = this.tagEls[i];
      v.set(s.x, y + 2.9, s.z).project(camera);
      const show = showTags && s.alive && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      tag.hidden = !show;
      if (show) {
        if (tag.textContent !== s.name) tag.textContent = s.name;
        tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      }
    });
    this.snowFx.update(dt, h);
    this.sparkFx.update(dt, h);
    this.bursts.update(dt, camera);
    this.world.tick(t, focus, camera.position, h);
  }

  /** A ring of sparkles and coins of light where the player closed a loop. */
  celebrate(s: SimSkier, big: boolean) {
    const y = heightAt(s.x, s.z) + 0.6;
    for (let k = 0; k < (big ? 40 : 16); k++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * (big ? 7 : 4);
      this.sparkFx.emit(s.x, y, s.z, Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp, 0.8 + Math.random() * 0.6, 0.5 + Math.random() * 0.5, k % 3 ? s.color : 0xffffff, 5);
    }
  }

  dispose() {
    for (const tag of this.tagEls) tag.remove();
    this.scene.traverse((o) => {
      // Skier parts share page-wide geometry and sit deeper in the tree; only direct children own theirs.
      if ((o instanceof THREE.Mesh || o instanceof THREE.Points) && o.parent === this.scene) o.geometry.dispose();
    });
    for (const u of Object.values(this.ground.uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
  }
}

// =====================================================================================================
// The page
// =====================================================================================================

type State = 'title' | 'shop' | 'lodge' | 'play' | 'dying' | 'paused' | 'tumbled' | 'over' | 'card';
interface Item { label: string; note: string; help: string; color?: number; act?: () => void | Promise<void>; skin?: Skin; done?: boolean }

export async function runTrail(camalot: Camalot): Promise<void> {
  const save: SaveData = migrate(await camalot.save.load<unknown>());
  const store = () => camalot.save.store(save);
  const audio = camalot.audio;
  const sfx = (name: SfxName, volume = 1, pitch = 1) => audio.sfx(name, { volume, pitch: pitch * (0.95 + Math.random() * 0.1) });

  const gfx = new Gfx();
  const isHigh = () => (save.quality === 'auto' ? Gfx.auto() : save.quality === 'high');
  gfx.setQuality(isHigh());
  const canvas = gfx.renderer.domElement;
  canvas.className = 'tr-view';
  document.body.prepend(canvas);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 900);
  const camAt = new THREE.Vector3(GRID / 2, 0, GRID / 2);

  const tags = div('tr-tags');
  const speedLines = div('tr-speed');
  const ui = div('tr-ui');
  document.body.append(speedLines, tags, ui);

  let state: State = 'title';
  let mIndex = 0; // start on the newest open mountain
  MOUNTAINS.forEach((_, i) => mountainOpen(save, i) && totalFlakes(save) >= i * FLAKES_PER_MOUNTAIN && (mIndex = i));
  let run: RunDef | null = null;
  let runIndex = -1; // -1 = free ski
  let bigStart = false;
  let view = new View(new Sim(MOUNTAINS[mIndex], mIndex, null, null), tags, gfx.high);
  let preview: Rig | null = null;
  let lodge: THREE.Scene | null = null;

  // ---------------- HUD ----------------
  const land = div('cm-panel tr-land');
  land.innerHTML = `<div class="cm-label tr-goal"></div><div class="tr-land-num">0%</div><div class="tr-bar"><i></i></div><div class="tr-extra"></div>`;
  const board = div('cm-panel tr-board');
  board.innerHTML = '<div class="cm-label">Top skiers</div><ol></ol>';
  const pauseBtn = button('Pause', 'P', () => setPaused(true));
  pauseBtn.classList.add('tr-pause');
  const toast = div('cm-panel tr-toast');
  const hud = [land, board, pauseBtn];
  ui.append(land, board, pauseBtn, toast);
  let toastT = 0;
  const say = (text: string) => {
    toast.textContent = text;
    toast.hidden = false;
    toastT = 2;
  };
  toast.hidden = true;

  let menu: HTMLElement | null = null;
  const showHud = (on: boolean) => hud.forEach((e) => (e.hidden = !on));

  // ---------------- sound ----------------
  let ski: LoopHandle | null = null, wind: LoopHandle | null = null;
  let mood: MusicMood = 'menu';
  const setMood = (m: MusicMood) => audio.music('trail', (mood = m));
  const WIND = { clear: 0.12, snow: 0.3, storm: 0.55 };

  // ---------------- input ----------------
  const keys = new Set<string>();
  let pointer: { x: number; y: number } | null = null;
  let mode: 'keys' | 'pointer' = 'keys';
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const DIRS: Record<string, [number, number]> = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  };

  function humanWant(): number | null {
    const h = view.sim.human;
    if (!h) return null;
    if (mode === 'keys') {
      let dx = 0, dz = 0;
      for (const k of keys) if (DIRS[k]) [dx, dz] = [dx + DIRS[k][0], dz + DIRS[k][1]];
      return dx || dz ? Math.atan2(dz, dx) : null;
    }
    if (!pointer) return null;
    ray.setFromCamera(new THREE.Vector2((pointer.x / innerWidth) * 2 - 1, -(pointer.y / innerHeight) * 2 + 1), camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return Math.hypot(hit.x - h.x, hit.z - h.z) > 0.6 ? Math.atan2(hit.z - h.z, hit.x - h.x) : null;
  }

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && !pointer) return;
    pointer = { x: e.clientX, y: e.clientY };
    mode = 'pointer';
  });
  canvas.addEventListener('pointerdown', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    mode = 'pointer';
    if (e.pointerType === 'touch') canvas.setPointerCapture(e.pointerId);
  });
  const lift = (e: PointerEvent) => {
    if (e.pointerType === 'touch') pointer = null;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') pointer = null;
  });

  addEventListener('keydown', (e) => {
    if (state === 'card') return;
    if (state === 'play' || state === 'dying') {
      if (DIRS[e.code]) {
        keys.add(e.code);
        mode = 'keys';
        e.preventDefault();
      } else if (e.code === 'KeyP' || e.code === 'Escape') setPaused(true);
      return;
    }
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[data-f]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Enter' || e.key === ' ') {
      // A focused button clicks itself; with nothing focused, Enter takes the main action.
      if (at < 0) {
        e.preventDefault();
        (items.find((b) => b.classList.contains('main')) ?? items[0])?.click();
      }
      return;
    }
    const hot = items.find((b) => b.dataset.key === e.key.toUpperCase());
    if (hot) {
      e.preventDefault();
      hot.focus();
      hot.click();
    } else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const next = items[(Math.max(0, at) + step + items.length) % items.length];
      next?.focus();
      next?.scrollIntoView({ block: 'nearest' });
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') setPaused(true);
  });

  // ---------------- menus ----------------
  function openMenu(cls: string, build: (m: HTMLElement) => HTMLElement | void) {
    menu?.remove();
    menu = div('cm-panel tr-menu ' + cls);
    const first = build(menu);
    ui.append(menu);
    (first ?? menu.querySelector<HTMLElement>('[data-f]'))?.focus();
  }
  function closeMenu() {
    menu?.remove();
    menu = null;
  }

  /** A school question. The game is paused while the card is open; the reward is given only when earned. */
  async function bonus(reward: string, epic = false): Promise<boolean> {
    const back = state;
    state = 'card';
    const { earned } = await camalot.earnBonus({ reward, size: epic ? 'epic' : 'normal' });
    state = back;
    if (earned) {
      save.stars++;
      sfx('star');
      if (save.stars >= STARS_FOR_DRAGON && !save.skins.includes('dragon')) {
        save.skins.push('dragon');
        say('Frost Drake unlocked');
        sfx('unlock');
      }
      checkAwards();
      await store();
    }
    return earned;
  }

  /** Pays out any achievement whose goal is now met. Fixed goals, fixed coins. */
  function checkAwards(): string[] {
    const got: string[] = [];
    for (const a of ACHIEVEMENTS)
      if (!save.ach.includes(a.id) && statValue(save, a.stat) >= a.need) {
        save.ach.push(a.id);
        save.coins += a.coins;
        got.push(`${a.name} +${a.coins}`);
      }
    for (const sk of SKINS)
      if (sk.flakes && !save.skins.includes(sk.id) && totalFlakes(save) >= sk.flakes) {
        save.skins.push(sk.id);
        got.push(`${sk.name} skin`);
      }
    if (got.length) sfx('levelUp');
    return got;
  }

  const pips = (n: number) => `<span class="tr-pips">${[1, 2, 3].map((k) => `<i class="${n >= k ? 'on' : ''}"></i>`).join('')}</span>`;
  const wallet = () => `Coins ${save.coins}  ·  Snowflakes ${totalFlakes(save)}`;

  function title() {
    state = 'title';
    showHud(false);
    lodge = null;
    setMood('menu');
    ski?.setLevel(0);
    wind?.setLevel(0.08);
    if (view.sim.human || view.sim.mountain !== MOUNTAINS[mIndex]) newView(new Sim(MOUNTAINS[mIndex], mIndex, null, null));
    setPreview(null);
    const m = MOUNTAINS[mIndex], open = mountainOpen(save, mIndex), runs = runsOf(mIndex);
    openMenu('side', (el) => {
      el.append(h1('Frostclaim'), p(wallet(), 'cm-label'));
      const go = (d: number) => () => {
        mIndex = (mIndex + d + MOUNTAINS.length) % MOUNTAINS.length;
        sfx('tap');
        title();
      };
      const head = div('tr-peak');
      head.innerHTML = `<b>${mIndex + 1}. ${esc(m.name)}</b><small>${esc(m.blurb)} Champion: ${esc(m.champ.name)}.</small>`;
      el.append(div('tr-row tr-nav', button('Back', 'Q', go(-1)), head, button('Next', 'E', go(1))));
      const list = div('tr-list');
      let first: HTMLElement | null = null;
      runs.forEach((r, i) => {
        const got = save.flakes[`${m.id}:${i}`] ?? 0, can = open && runOpen(save, mIndex, i);
        const b = button(r.name, '', () => startPlay(i));
        b.classList.add('tr-tile');
        b.innerHTML = `<span>${r.name} ${pips(got)}</span><small>${can ? goalText(r) : 'Locked'}</small>`;
        b.disabled = !can;
        if (can && !got && !first) first = b;
        list.append(b);
      });
      const free = button('Free ski', 'F', () => startPlay(-1));
      free.disabled = !open;
      free.classList.add('tr-tile');
      free.innerHTML = `<span>Free ski</span><small>${save.best[m.id] ? `Best ${save.best[m.id].toFixed(1)}%` : 'No goal. Just ski.'}</small>`;
      list.append(free);
      el.append(list);
      if (!open) el.append(p(`Opens at ${mIndex * FLAKES_PER_MOUNTAIN} snowflakes. You have ${totalFlakes(save)}.`, 'cm-help'));
      const big = button(bigStart ? 'Big start ready' : 'Big start', 'B', async () => {
        if (await bonus('Start with a bigger home patch')) bigStart = true;
        title();
      });
      big.disabled = bigStart;
      const row = div('tr-row', big, button('Skins', 'S', skinsMenu), button('Gear', 'G', gearMenu));
      const row2 = div('tr-row', button('Lodge', 'L', lodgeMenu), button('Awards', 'W', awardsMenu));
      const purse = MOUNTAINS.find((x) => (save.flakes[`${x.id}:${RUNS_PER_MOUNTAIN - 1}`] ?? 0) > 0 && !save.purses.includes(x.id));
      if (purse) row2.append(button(`Purse +${PURSE_COINS}`, 'U', () => claimPurse(purse.id).then(title)));
      el.append(row, row2);
      return first ?? list.querySelector<HTMLElement>('[data-f]:not(:disabled)') ?? undefined;
    });
  }

  async function claimPurse(id: string) {
    if (save.purses.includes(id)) return;
    if (await bonus(`The champion's purse: ${PURSE_COINS} coins`, true)) {
      save.purses.push(id);
      save.coins += PURSE_COINS;
      sfx('coin');
      say(`+${PURSE_COINS} coins`);
      await store();
    }
  }

  /** One list screen for skins, gear, lodge and awards. A tap on a tile that is not focused only shows it. */
  function listMenu(name: string, items: () => Item[], focusAt = 0) {
    state = name === 'Lodge' ? 'lodge' : 'shop';
    let fresh = false;
    const draw = (at: number) =>
      openMenu('side', (el) => {
        el.append(h1(name), p(wallet() + `  ·  Stars ${save.stars}`, 'cm-label'));
        const grid = div('tr-grid tr-list');
        const help = p('', 'cm-help tr-help');
        let lit: HTMLElement | null = null;
        items().forEach((it, i) => {
          const b = button(it.label, '', async () => {
            if (fresh) return void (fresh = false);
            if (!it.act) return;
            await it.act();
            await store();
            draw(i);
          });
          b.addEventListener('pointerdown', () => (fresh = document.activeElement !== b));
          b.classList.add('tr-tile');
          if (it.done) b.classList.add('done');
          if (it.color !== undefined) {
            b.style.setProperty('--c', hex(it.color));
            b.classList.add('sel');
          }
          b.innerHTML = `<span>${esc(it.label)}</span><small>${esc(it.note)}</small>`;
          b.addEventListener('focus', () => {
            help.textContent = it.help;
            if (it.skin) setPreview(it.skin);
          });
          if (i === at) lit = b;
          grid.append(b);
        });
        const back = button('Back', 'Esc', () => {
          sfx('back');
          title();
        });
        back.dataset.key = 'ESCAPE';
        el.append(grid, help, back);
        return lit ?? undefined;
      });
    draw(focusAt);
  }

  const buy = (cost: number, then: () => void) => () => {
    if (save.coins < cost) return void sfx('error');
    save.coins -= cost;
    then();
    sfx('buy');
    const got = checkAwards();
    if (got.length) say(got[0]);
  };

  function skinsMenu() {
    sfx('select');
    listMenu('Skins', () =>
      SKINS.map((sk): Item => {
        const owned = save.skins.includes(sk.id), perk = PERK[sk.kind].text;
        const base = { label: sk.name, color: PALETTE[sk.color], skin: sk };
        if (owned) return { ...base, note: sk.id === save.skin ? 'Worn' : 'Owned', help: sk.id === save.skin ? `You wear this one. ${perk}.` : `Enter or tap again to wear it. ${perk}.`, act: () => void ((save.skin = sk.id), sfx('select')) };
        if (sk.stars) return { ...base, note: `${sk.stars} stars`, help: `Answer school questions to earn stars. You have ${save.stars} of ${sk.stars}. ${perk}.`, act: async () => void (await bonus('A star toward the Frost Drake')) };
        if (sk.flakes) return { ...base, note: `${sk.flakes} snowflakes`, help: `A prize for ${sk.flakes} snowflakes. You have ${totalFlakes(save)}.` };
        if (sk.epic) {
          const ready = totalFlakes(save) >= GOLD_EPIC_FLAKES;
          return { ...base, note: 'Big question', help: ready ? 'A rare glowing skin. One big pencil-and-paper question wins it.' : `Collect ${GOLD_EPIC_FLAKES} snowflakes, then one big question wins it.`,
            act: !ready ? undefined : async () => {
              if (await bonus('The rare Golden Drake skin', true)) {
                save.skins.push(sk.id);
                save.skin = sk.id;
                sfx('unlock');
              }
            } };
        }
        return { ...base, note: `${sk.cost} coins`, help: save.coins >= sk.cost ? `Buy for ${sk.cost} coins. ${perk}.` : `Needs ${sk.cost} coins. ${perk}.`, act: buy(sk.cost, () => (save.skins.push(sk.id), (save.skin = sk.id))) };
      }), SKINS.findIndex((s) => s.id === save.skin));
  }

  function gearMenu() {
    sfx('select');
    listMenu('Gear', () =>
      GEAR.map((g): Item => {
        const lv = save.gear[g.id], max = lv >= GEAR_COST.length;
        return { label: `${g.name}  ${lv}/${GEAR_COST.length}`, note: max ? 'Top level' : `${GEAR_COST[lv]} coins`, help: g.text + '.', done: max, act: max ? undefined : buy(GEAR_COST[lv], () => save.gear[g.id]++) };
      }));
  }

  function lodgeMenu() {
    sfx('select');
    lodge = buildLodge(save.lodge, gfx.high);
    listMenu('Lodge', () =>
      LODGE.map((it): Item => {
        const own = save.lodge.includes(it.id);
        return { label: it.name, note: own ? 'In your lodge' : `${it.cost} coins`, help: own ? 'Already in your lodge.' : 'Add it to your lodge.', done: own,
          act: own ? undefined : buy(it.cost, () => (save.lodge.push(it.id), (lodge = buildLodge(save.lodge, gfx.high)))) };
      }));
  }

  function awardsMenu() {
    sfx('select');
    listMenu('Awards', () =>
      ACHIEVEMENTS.map((a): Item => {
        const done = save.ach.includes(a.id);
        return { label: a.name, note: done ? 'Done' : `${Math.min(a.need, Math.floor(statValue(save, a.stat)))} / ${a.need}`, help: `${a.text}. Prize: ${a.coins} coins.`, done };
      }));
  }

  function setPreview(sk: Skin | null) {
    if (preview) view.scene.remove(preview.root);
    preview = null;
    if (!sk) return;
    preview = makeSkier(sk.kind, PALETTE[sk.color], sk.fur, !!THEMES[view.sim.mountain.theme].beach, { gold: sk.gold, ink: gfx.high });
    preview.blob.visible = !gfx.high;
    preview.root.position.set(GRID / 2, heightAt(GRID / 2, GRID / 2), GRID / 2);
    view.scene.add(preview.root);
  }

  function newView(sim: Sim) {
    view.dispose();
    view = new View(sim, tags, gfx.high);
    sim.onEvent = onSimEvent;
    preview = null;
  }

  function setQuality(q: SaveData['quality']) {
    save.quality = q;
    void store();
    gfx.setQuality(isHigh());
    newView(view.sim); // same run, redrawn
  }

  function startPlay(index: number) {
    closeMenu();
    runIndex = index;
    run = index < 0 ? FREE_RUN : runsOf(mIndex)[index];
    const skin = SKINS.find((s) => s.id === save.skin) ?? SKINS[0], perk = PERK[skin.kind];
    newView(new Sim(MOUNTAINS[mIndex], mIndex, run, {
      name: camalot.player.name, kind: skin.kind, color: PALETTE[skin.color], fur: skin.fur, gold: skin.gold,
      speed: PLAYER_SPEED * (1 + save.gear.wax * GEAR[0].per) * (perk.speed ?? 1),
      turn: PLAYER_TURN * (1 + save.gear.edges * GEAR[1].per) * (perk.turn ?? 1),
      startR: (bigStart ? BIG_START_R : START_R) + save.gear.patch * GEAR[2].per + (perk.startR ?? 0),
    }));
    bigStart = false;
    doubled = false;
    keys.clear();
    state = 'play';
    showHud(true);
    hudT = 0;
    land.querySelector('.tr-goal')!.textContent = index < 0 ? 'Free ski' : goalText(run);
    land.querySelector('.tr-extra')!.textContent = index < 0 ? '' : `Bonus: ${goalText(run.extra).toLowerCase()}`;
    say(index < 0 ? 'Leave your land, then ski back' : goalText(run));
    sfx('whoosh');
    setMood('play');
    ski ??= audio.loop('ski');
    wind ??= audio.loop('wind');
    wind.setLevel(WIND[THEMES[MOUNTAINS[mIndex].theme].beach ? 'clear' : MOUNTAINS[mIndex].weather]);
  }

  let dyingT = 0;
  let marksHad = 0;
  function onSimEvent(e: SimEvent) {
    view.onEvent(e);
    const sim = view.sim, h = sim.human;
    if (!h) return;
    const near = (s: SimSkier) => Math.max(0, 1 - Math.hypot(s.x - h.x, s.z - h.z) / 30);
    if (e.t === 'win') return endRound(true);
    if (e.t === 'jump') {
      if (e.who.human) {
        save.stats.jumps++;
        sfx('boost');
      } else if (near(e.who) > 0.3) sfx('whoosh', near(e.who) * 0.4);
    } else if (e.t === 'claim') {
      if (!e.who.human) return void (near(e.who) > 0.4 && sfx('sparkle', near(e.who) * 0.25, 0.8));
      const pct = pctOf(e.gained);
      save.stats.claims++;
      save.stats.bigLoop = Math.max(save.stats.bigLoop, pct);
      view.celebrate(h, pct >= 2);
      sfx('sparkle', 0.6, 1 + Math.min(0.5, pct * 0.08));
      sfx('coin', 0.4);
      if (pct >= 3) sfx('cheer', 0.5);
      const marks = sim.marksOwned();
      if (marks > marksHad) sfx('star');
      marksHad = marks;
      if (pct >= 0.1) say(`+${pct.toFixed(1)}% land`);
    } else if (e.t === 'down') {
      if (e.who.human) {
        state = 'dying';
        dyingT = 1.2;
        sfx('thud', 0.7);
        sfx('pop', 0.5, 0.7);
        say(e.how === 'cut' ? `${e.by!.name} crossed your track` : e.how === 'bump' ? `Head-on with ${e.by!.name}` : e.how === 'wiped' ? `${e.by!.name} looped your land` : 'You hit your own track');
      } else if (e.by?.human) {
        save.stats.catches++;
        sfx('pop', 0.7);
        sfx('star', 0.6);
        say(e.who.champ ? `Champion down: ${e.who.name}` : `Caught ${e.who.name}`);
      } else if (near(e.who) > 0.2) sfx('pop', near(e.who) * 0.35, 1.3);
    }
  }

  function tumbledMenu() {
    state = 'tumbled';
    const sim = view.sim, h = sim.human!;
    setMood('menu');
    openMenu('', (m) => {
      m.append(h1('Wipeout'), p(`Your land: ${sim.landPct(h).toFixed(1)}%`));
      const revive = button('Revive', 'R', async () => {
        if (await bonus('Revive your skier in this run')) {
          sim.revive();
          closeMenu();
          state = 'play';
          sfx('grow');
          setMood('play');
        } else tumbledMenu();
      }, true);
      revive.disabled = sim.revived;
      const done = button('Done', sim.revived ? 'Enter' : 'D', () => endRound(false), sim.revived);
      m.append(p(sim.revived ? 'Revive is used up this run.' : 'Answer a question to keep going.', 'cm-help'), div('tr-row', revive, done));
      return sim.revived ? done : revive;
    });
  }

  let doubled = false;
  function endRound(won: boolean) {
    const sim = view.sim, h = sim.human!, m = MOUNTAINS[mIndex], st = save.stats;
    const best = Math.max(sim.maxPct, won ? sim.landPct(h) : 0);
    if (!won) sim.giveUp();
    state = 'over';
    showHud(false);
    ski?.setLevel(0);
    const key = `${m.id}:${runIndex}`;
    const had = runIndex < 0 ? 0 : save.flakes[key] ?? 0;
    const flakes = won ? 1 + (sim.tumbles === 0 ? 1 : 0) + (sim.extraDone() ? 1 : 0) : 0;
    const newFlakes = Math.max(0, flakes - had);
    const base = Math.round((Math.round(best) + h.kills * CATCH_COINS + (won ? WIN_COINS : 0)) * (1 + save.gear.scarf * GEAR[3].per));
    const coins = base + newFlakes * FLAKE_COINS;
    save.coins += coins;
    st.runs++;
    st.land += best;
    if (runIndex < 0) save.best[m.id] = Math.max(save.best[m.id] ?? 0, best);
    else if (won) {
      save.flakes[key] = Math.max(had, flakes);
      st.wins++;
      if (sim.tumbles === 0) st.clean++;
      if (run!.champ && !had) st.champs++;
    }
    const awards = checkAwards();
    const opened = won ? MOUNTAINS.findIndex((_, i) => i > mIndex && mountainOpen(save, i) && totalFlakes(save) - newFlakes < i * FLAKES_PER_MOUNTAIN) : -1;
    void store();
    setMood(won ? 'win' : 'menu');
    sfx(won ? 'win' : 'lose');
    if (won) sfx('cheer');
    if (opened > 0) sfx('unlock');
    const draw = () =>
      openMenu('', (el) => {
        el.append(h1(won ? 'Run cleared' : runIndex < 0 ? 'Good run' : 'Not this time'));
        if (runIndex >= 0) el.append(p(run!.name + ' on ' + m.name, 'cm-label'));
        const stats = div('tr-stats');
        stats.innerHTML =
          (won ? `<span>Run complete</span><b>${pips(1)}</b><span>No wipeouts</span><b>${pips(sim.tumbles === 0 ? 1 : 0)}</b><span>${esc(goalText(run!.extra))}</span><b>${pips(sim.extraDone() ? 1 : 0)}</b>` : '') +
          `<span>Best land</span><b>${best.toFixed(1)}%</b><span>Skiers caught</span><b>${h.kills}</b><span>Coins</span><b>+${coins + (doubled ? base : 0)}</b>`;
        el.append(stats);
        if (opened > 0) el.append(p(`${MOUNTAINS[opened].name} unlocked`, 'cm-label'));
        for (const a of awards) el.append(p('Award: ' + a, 'cm-label'));
        const next = won && runIndex >= 0 && runIndex < RUNS_PER_MOUNTAIN - 1;
        const again = button(next ? 'Next run' : 'Again', 'Enter', () => startPlay(next ? runIndex + 1 : runIndex), true);
        const dbl = button('Double coins', 'C', async () => {
          if (doubled || !(await bonus(`Double this run's ${base} coins`))) return;
          doubled = true;
          save.coins += base;
          sfx('coin');
          await store();
          draw();
        });
        dbl.disabled = doubled || base === 0;
        const row = div('tr-row', again, dbl, button('Map', 'M', title));
        el.append(row);
        if (won && run!.champ && runIndex >= 0 && !save.purses.includes(m.id)) el.append(button(`Champion's purse +${PURSE_COINS} (big question)`, 'U', () => claimPurse(m.id).then(draw)));
        return again;
      });
    draw();
  }

  function setPaused(on: boolean) {
    if (on && state === 'play') {
      state = 'paused';
      keys.clear();
      ski?.setLevel(0);
      sfx('tap');
      const draw = () =>
        openMenu('', (m) => {
          m.append(h1('Paused'), p(runIndex < 0 ? 'Free ski' : goalText(run!), 'cm-label'));
          const resume = button('Resume', 'Enter', () => setPaused(false), true);
          const quit = button('Map', 'M', () => {
            view.sim.giveUp();
            title();
          });
          const q = button(`Graphics: ${save.quality === 'auto' ? `Auto (${gfx.high ? 'High' : 'Low'})` : save.quality === 'high' ? 'High' : 'Low'}`, 'G', () => {
            setQuality(save.quality === 'auto' ? 'high' : save.quality === 'high' ? 'low' : 'auto');
            draw();
          });
          m.append(div('tr-row', resume, quit), q, p('Low is smoother on tablets.', 'cm-help'));
          return resume;
        });
      draw();
    } else if (!on && state === 'paused') {
      closeMenu();
      state = 'play';
    }
  }

  // ---------------- frame loop ----------------
  let last = performance.now();
  let time = 0;
  let hudT = 0;
  let straightT = 0, flickT = 0;
  const lodgeCam = new THREE.PerspectiveCamera(40, 1, 0.5, 100);
  const resize = () => {
    gfx.resize();
    camera.aspect = lodgeCam.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    lodgeCam.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const sim = view.sim, h = sim.human;
    const inMenu = state === 'title' || state === 'shop' || state === 'lodge';
    const running = state === 'play' || state === 'dying' || inMenu;
    if (running) {
      time += dt;
      sim.step(dt, state === 'play' ? humanWant() : null);
    }
    if (state === 'dying' && (dyingT -= dt) <= 0) tumbledMenu();

    // Camera: follow the player a little ahead of her skis; slow orbit or a close look at a skin in menus.
    const portrait = innerWidth < innerHeight;
    if (h && !inMenu) {
      const ahead = state === 'play' ? 2.5 : 0;
      camAt.lerp(new THREE.Vector3(h.x + Math.cos(h.heading) * ahead, heightAt(h.x, h.z), h.z + Math.sin(h.heading) * ahead), Math.min(1, dt * 4));
      camera.position.set(camAt.x, camAt.y + (portrait ? 27 : 17.5), camAt.z + (portrait ? 17 : 15.5));
      camera.lookAt(camAt.x, camAt.y, camAt.z - 1.5);
    } else if (state === 'shop' && preview) {
      preview.root.rotation.y += dt * 0.8;
      poseSkier(preview, time, dt, Math.sin(time * 1.5) * 3, 0, true);
      const side = portrait ? 0 : 1.6, y = preview.root.position.y;
      camAt.set(GRID / 2, y, GRID / 2);
      camera.position.set(GRID / 2 + 6.4, y + 2.7, GRID / 2 + side);
      camera.lookAt(GRID / 2, y + 1.5, GRID / 2 + side);
    } else {
      const a = time * 0.05;
      camAt.set(GRID / 2, 0, GRID / 2);
      camera.position.set(GRID / 2 + Math.cos(a) * 58, 26, GRID / 2 + Math.sin(a) * 58);
      camera.lookAt(GRID / 2, 2, GRID / 2);
      // On a wide screen the menu covers the left side, so slide the mountain to the right.
      if (!portrait) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.16, 0, innerWidth, innerHeight);
    }
    if (state !== 'title' && camera.view) camera.clearViewOffset();
    view.animate(dt, time, camera, camAt, running, !!h && !inMenu);
    if (state === 'lodge' && lodge) {
      lodgeCam.position.set(portrait ? 2 : 4.5, 4.8, portrait ? 13 : 11.5);
      lodgeCam.lookAt(0, 1.9, -0.5);
      if (portrait) lodgeCam.clearViewOffset();
      else lodgeCam.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.24, 0, innerWidth, innerHeight); // clear of the menu
      gfx.render(lodge, lodgeCam);
    } else gfx.render(view.scene, camera);

    // Speed lines: full strength in the air, a light streak on a long straight line.
    straightT = h && state === 'play' && Math.abs(h.turnVel) < 0.5 ? straightT + dt : 0;
    const rush = h && state === 'play' ? (h.air > 0 ? 1 : Math.min(0.4, Math.max(0, straightT - 0.8) * 0.4)) : 0;
    speedLines.style.opacity = String(rush);
    if (rush > 0 && (flickT -= dt) <= 0) {
      flickT = 0.07;
      speedLines.style.setProperty('--a', `${Math.random() * 360}deg`);
    }
    if ((toastT -= dt) <= 0) toast.hidden = true;
    if (h && state === 'play') {
      ski?.setLevel(h.air > 0 ? 0.05 : Math.min(0.7, 0.45 + Math.abs(h.turnVel) * 0.12));
      ski?.setPitch(0.9 + Math.abs(h.turnVel) * 0.05 + (h.air > 0 ? 0.3 : 0));
    }
    if (h && !inMenu && (hudT -= dt) <= 0) {
      hudT = 0.25;
      const goal = run!.goal, val = sim.value(goal);
      (land.querySelector('.tr-land-num') as HTMLElement).textContent =
        runIndex < 0 ? `${val.toFixed(1)}%` : goal === 'land' || goal === 'loop' ? `${val.toFixed(1)} / ${run!.need}%` : `${val} / ${run!.need}`;
      const bar = land.querySelector('.tr-bar i') as HTMLElement;
      bar.style.width = `${Math.min(100, (val / run!.need) * 100)}%`;
      bar.style.setProperty('--c', hex(h.color));
      land.querySelector('.tr-extra')!.classList.toggle('ok', runIndex >= 0 && sim.extraDone());
      const top = sim.skiers.filter((s) => s.alive || s.human).sort((a, b) => sim.field.countOf(b.id) - sim.field.countOf(a.id)).slice(0, 5);
      if (!top.includes(h)) top[4] = h;
      board.querySelector('ol')!.innerHTML = top
        .map((s) => `<li class="${s.human ? 'me' : ''}"><i class="cm-dot" style="--sw:${hex(s.color)}"></i><span>${esc(s.name)}${s.champ ? ' (champ)' : ''}</span><span>${sim.landPct(s).toFixed(1)}%</span></li>`)
        .join('');
      // Tense music while her open track is long or a skier is close to it.
      if (state === 'play') {
        const tense = h.trailCells > 45 || sim.danger() < 6;
        if (tense !== (mood === 'intense')) setMood(tense ? 'intense' : 'play');
      }
    }
    requestAnimationFrame(frame);
  }

  view.sim.onEvent = onSimEvent;
  title();
  requestAnimationFrame(frame);
}

// ---------------- small DOM helpers ----------------

function div(cls: string, ...kids: HTMLElement[]): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.append(...kids);
  return d;
}
function h1(text: string) {
  const e = document.createElement('h1');
  e.className = 'cm-title';
  e.textContent = text;
  return e;
}
function p(text: string, cls = '') {
  const e = document.createElement('p');
  e.className = cls;
  e.textContent = text;
  return e;
}
function button(label: string, key: string, onClick: () => void, main = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'cm-btn' + (main ? ' main' : '');
  b.dataset.f = '';
  if (key) b.dataset.key = key.toUpperCase();
  b.innerHTML = `<span>${esc(label)}</span>${key ? `<span class="cm-key">${esc(key)}</span>` : ''}`;
  b.addEventListener('click', onClick);
  return b;
}
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
