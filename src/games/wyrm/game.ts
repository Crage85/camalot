// Gem Wyrm: screens, input, HUD, sound, and the run loop. Talks to the platform only through the Camalot object.
import './wyrm.css';
import type { Camalot, LoopHandle, SfxName, SfxOptions } from '../../core/contract';
import {
  T, SKINS, ARENAS, POTIONS, EVOS, AWARDS, STAGES, MAX_STARS, MAX_LEVEL, BOSS_HEARTS, lengthScore, radiusOf, migrate, levelOf, perksOf, evoOf,
  stagesOf, goalText, totalStars, chapterOpen, arenaOpen, stageOpen,
  type SaveData, type Skin, type PotionKind, type Stage, type Arena, type Quality,
} from './data';
import { Sim, type Wyrm } from './sim';
import { World } from './world';
import { RunTracker, setupRun, applyPerks, settle, unlockText, type Settled } from './rules';

type State = 'menu' | 'play' | 'pause' | 'down' | 'results' | 'card' | 'book';

const ICON = {
  // Lucide icons (ISC): pause, chevron-left, chevron-right
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const QUIZ = '<span class="cm-key wy-quiz">Quiz</span>'; // shown on touch too, unlike key caps
const BIGQUIZ = '<span class="cm-key wy-quiz big">Big quiz</span>';
const key = (k: string) => `<span class="cm-key">${k}</span>`;
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const starRow = (n: number, of = 3) => `<span class="wy-stars">${'<b>★</b>'.repeat(n)}${'<i>★</i>'.repeat(Math.max(0, of - n))}</span>`;

function autoLow(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return matchMedia('(pointer: coarse)').matches || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
}

export async function runWyrm(root: HTMLElement, camalot: Camalot) {
  const save: SaveData = migrate(await camalot.save.load<unknown>());
  const store = () => camalot.save.store(save);
  const audio = camalot.audio;
  const sfx = (name: SfxName, opts?: SfxOptions) => audio.sfx(name, opts);
  const vary = (name: SfxName, volume = 1, pitch = 1) => sfx(name, { volume, pitch: pitch * (0.94 + Math.random() * 0.12) });

  root.innerHTML = `
    <div class="wy">
      <canvas class="wy-view"></canvas>
      <div class="wy-tags"></div>
      <div class="wy-hud" hidden>
        <div class="wy-top">
          <button class="cm-btn wy-icon" data-hud="pause" aria-label="Pause">${ICON.pause}</button>
          <div class="cm-panel wy-len"><span class="cm-label">Length</span><b class="num">0</b></div>
        </div>
        <div class="cm-panel wy-goal" hidden></div>
        <div class="cm-panel wy-board"></div>
        <div class="wy-powers"></div>
        <canvas class="wy-map" width="240" height="240"></canvas>
        <div class="cm-panel wy-keys"></div>
        <div class="cm-panel wy-toast" hidden></div>
        <button class="wy-boost" hidden>Boost</button>
        <button class="wy-roar" hidden>Roar</button>
        <div class="wy-stick" hidden><i></i></div>
      </div>
      <div class="wy-screen" hidden></div>
    </div>`;
  const $ = <E extends HTMLElement>(sel: string) => root.querySelector(sel) as E;
  const canvas = $<HTMLCanvasElement>('.wy-view');
  const hud = $('.wy-hud');
  const lenEl = $('.wy-len b');
  const goalEl = $('.wy-goal');
  const board = $('.wy-board');
  const powers = $('.wy-powers');
  const mapCv = $<HTMLCanvasElement>('.wy-map');
  const map = mapCv.getContext('2d')!;
  const toastEl = $('.wy-toast');
  const boostBtn = $<HTMLButtonElement>('.wy-boost');
  const roarBtn = $<HTMLButtonElement>('.wy-roar');
  const stick = $('.wy-stick');
  const keysHint = $('.wy-keys');
  const tagsEl = $('.wy-tags');
  const screen = $('.wy-screen');

  const isLow = (q: Quality) => (q === 'auto' ? autoLow() : q === 'low');
  const world = new World(canvas, isLow(save.quality));
  let arena = ARENAS.find((a) => a.id === save.arena) ?? ARENAS[0];
  let skin = SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
  const sim = new Sim();
  const level = () => levelOf(save.xp).level;

  let state: State = 'menu';
  let startBonus: '' | 'big' | 'dragon' = ''; // pre-run bonus earned and waiting for Play
  let tracker = new RunTracker(arena.id, null);
  let starsShown = 0;
  let mult = 1;
  let hoard = false;
  let downTimer = 0;
  let winTimer = 0;
  let rushRespawn = 0;
  let combo = 0, comboT = 0, lastGulp = 0, nextGrow = 1000;
  let wasBoosting = false;
  let wind: LoopHandle | null = null, waves: LoopHandle | null = null;
  let slowFrames = 0, frames = 0;

  const resize = () => world.resize(root.clientWidth || innerWidth, root.clientHeight || innerHeight);
  addEventListener('resize', resize);
  resize();

  // ---- input ----
  const held = new Set<string>();
  let steer: 'keys' | 'pointer' | 'stick' | 'none' = 'none';
  let ptr = { x: 0, y: 0 };
  let stickId = -1, stickO = { x: 0, y: 0 }, stickAng = 0;
  let mouseBoost = false, touchBoost = false;
  let touchSeen = matchMedia('(pointer: coarse)').matches;

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId !== stickId) return;
      const dx = e.clientX - stickO.x, dy = e.clientY - stickO.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) { stickAng = Math.atan2(dy, dx); steer = 'stick'; }
      const k = Math.min(1, 34 / (d || 1));
      (stick.firstElementChild as HTMLElement).style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      return;
    }
    ptr = { x: e.clientX, y: e.clientY };
    steer = 'pointer';
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      if (!touchSeen) { touchSeen = true; syncHud(); }
      if (state !== 'play' || stickId !== -1) return;
      stickId = e.pointerId;
      stickO = { x: e.clientX, y: e.clientY };
      stick.style.left = `${e.clientX}px`;
      stick.style.top = `${e.clientY}px`;
      (stick.firstElementChild as HTMLElement).style.transform = '';
      stick.hidden = false;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    ptr = { x: e.clientX, y: e.clientY };
    steer = 'pointer';
    if (state === 'play' && e.button === 0) mouseBoost = true;
  });
  const ptrUp = (e: PointerEvent) => {
    if (e.pointerId === stickId) { stickId = -1; stick.hidden = true; }
    if (e.pointerType !== 'touch') mouseBoost = false;
  };
  canvas.addEventListener('pointerup', ptrUp);
  canvas.addEventListener('pointercancel', ptrUp);
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (state === 'play') roar(); }); // two-finger tap on a trackpad
  boostBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touchBoost = true; boostBtn.classList.add('on'); });
  const boostOff = () => { touchBoost = false; boostBtn.classList.remove('on'); };
  boostBtn.addEventListener('pointerup', boostOff);
  boostBtn.addEventListener('pointercancel', boostOff);
  boostBtn.addEventListener('pointerleave', boostOff);
  roarBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (state === 'play') roar(); });
  $('[data-hud="pause"]').addEventListener('click', () => { if (state === 'play') pause(); });

  addEventListener('keydown', (e) => {
    if (state === 'card') return; // the question card owns the keyboard
    const k = e.key.toLowerCase();
    if (state === 'play') {
      if (['arrowleft', 'arrowright', 'arrowup', 'a', 'd', 'w', ' '].includes(k)) { e.preventDefault(); held.add(k); }
      if (k === 'arrowleft' || k === 'arrowright' || k === 'a' || k === 'd') steer = 'keys';
      if ((k === 'e' || k === 'shift' || k === 'arrowdown' || k === 's') && !e.repeat) roar();
      if (k === 'escape' || k === 'p') pause();
      return;
    }
    if (!screen.hidden) menuKey(e);
  });
  addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { held.clear(); mouseBoost = false; boostOff(); if (state === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });

  function applyInput() {
    const p = sim.player;
    if (!p.alive) return;
    const left = held.has('arrowleft') || held.has('a');
    const right = held.has('arrowright') || held.has('d');
    if (left !== right) p.targetAng = p.ang + (right ? 1 : -1) * 1.2;
    else if (steer === 'keys') p.targetAng = p.ang;
    else if (steer === 'pointer') {
      const r = canvas.getBoundingClientRect();
      const g = world.groundAt(ptr.x - r.left, ptr.y - r.top, r.width, r.height);
      if (g) {
        const dx = g.x - p.segs[0], dz = g.z - p.segs[1];
        if (dx * dx + dz * dz > 0.6) p.targetAng = Math.atan2(dz, dx);
      }
    } else if (steer === 'stick') p.targetAng = stickAng;
    p.boosting = held.has(' ') || held.has('arrowup') || held.has('w') || mouseBoost || touchBoost;
  }

  /** The roar has no shared sound, so it is built here on the platform's audio graph (volume and mute still apply). */
  function roarSound() {
    if (skin.acc === 'ears') { sfx('meow', { pitch: 0.6, volume: 1 }); return; }
    const ctx = audio.context, out = audio.sfxOut;
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.7);
    o2.frequency.setValueAtTime(96, t); o2.frequency.exponentialRampToValueAtTime(48, t + 0.7);
    f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.15); f.frequency.exponentialRampToValueAtTime(300, t + 0.7);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(f); o2.connect(f); f.connect(g).connect(out);
    o.start(t); o2.start(t); o.stop(t + 0.8); o2.stop(t + 0.8);
  }
  function roar() {
    const p = sim.player;
    if (p.roarMax <= 0) return;
    if (!sim.roar(p)) sfx('error', { volume: 0.4 });
  }

  // ---- menus: one focus system for keys, pointer, and touch ----
  type Actions = Record<string, () => void>;
  let actions: Actions = {};
  let lr: Record<string, (dir: number) => void> = {};

  function show(html: string, acts: Actions, side: 'center' | 'left' = 'center', lrs: typeof lr = {}) {
    screen.className = `wy-screen ${side}`;
    screen.innerHTML = html;
    screen.hidden = false;
    actions = acts;
    lr = lrs;
    const first = screen.querySelector<HTMLElement>('[data-f].main') ?? screen.querySelector<HTMLElement>('[data-f]');
    if (first) focus(first);
    screen.querySelectorAll<HTMLElement>('[data-f]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const dirBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-dir]');
        focus(el);
        (document.activeElement as HTMLElement | null)?.blur(); // keys go through menuKey, never a second native click
        if (dirBtn) { sfx('tap'); lr[el.dataset.lr!]?.(Number(dirBtn.dataset.dir)); }
        else if (el.dataset.act) { sfx('select'); actions[el.dataset.act]?.(); }
      });
    });
  }
  function hideScreen() { screen.hidden = true; screen.innerHTML = ''; }
  function focus(el: HTMLElement) {
    screen.querySelectorAll('.f').forEach((x) => x.classList.remove('f'));
    el.classList.add('f');
    const help = screen.querySelector('.wy-help');
    if (help) help.innerHTML = el.dataset.help ?? '';
  }
  const focusOn = (sel: string) => { const el = screen.querySelector<HTMLElement>(sel); if (el) focus(el); };
  function menuKey(e: KeyboardEvent) {
    const items = [...screen.querySelectorAll<HTMLElement>('[data-f]')];
    const cur = screen.querySelector<HTMLElement>('.f');
    const i = cur ? items.indexOf(cur) : -1;
    const k = e.key;
    if (k === 'ArrowDown' || k === 's' || k === 'Tab' && !e.shiftKey) { e.preventDefault(); sfx('tap'); focus(items[(i + 1) % items.length]); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'Tab' && e.shiftKey) { e.preventDefault(); sfx('tap'); focus(items[(i - 1 + items.length) % items.length]); }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd') && cur?.dataset.lr) {
      e.preventDefault();
      sfx('tap');
      lr[cur.dataset.lr]?.(k === 'ArrowLeft' || k === 'a' ? -1 : 1);
    } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && cur) {
      // side-by-side buttons: left and right move between them
      e.preventDefault(); sfx('tap'); focus(items[(i + (k === 'ArrowLeft' ? -1 : 1) + items.length) % items.length]);
    } else if ((k === 'Enter' || k === ' ') && cur) {
      e.preventDefault();
      sfx('select');
      if (cur.dataset.act) actions[cur.dataset.act]?.();
      else if (cur.dataset.lr) lr[cur.dataset.lr]?.(1);
    } else if (k === 'Escape' && actions.back) { e.preventDefault(); sfx('back'); actions.back(); }
  }

  // ---- picks ----
  const owned = (s: Skin) => save.owned.includes(s.id);
  const chapter = () => ARENAS.indexOf(arena);
  const stage = (): Stage | null => {
    const st = save.goal > 0 ? stagesOf(arena.id)[save.goal - 1] : null;
    return st && stageOpen(save, st) ? st : null;
  };
  function skinStatus(s: Skin) {
    if (owned(s)) return '';
    const u = s.unlock!;
    return `<span class="lock ${u.by === 'coins' && save.coins < u.cost ? 'short' : ''}">${unlockText(s)}</span>`;
  }
  /** The goal a player most likely wants next in this place. */
  function defaultGoal(): number {
    if (!chapterOpen(save, chapter())) return 0;
    const sts = stagesOf(arena.id);
    const next = sts.find((s) => stageOpen(save, s) && !(save.stars[s.id] ?? 0)) ?? sts.find((s) => stageOpen(save, s) && (save.stars[s.id] ?? 0) < 3);
    return next ? next.n : 0;
  }
  function setArena(a: Arena) {
    arena = a;
    save.arena = a.id;
    waves?.stop(); waves = null;
    if (a.id === 'beach') { waves = audio.loop('waves'); waves.setLevel(0.3); }
  }

  // ---- screens ----
  function menu() {
    state = 'menu';
    hud.hidden = true;
    audio.music('wyrm', 'menu');
    const lv = levelOf(save.xp), evo = EVOS[evoOf(lv.level)];
    const ch = chapter(), openA = arenaOpen(save, ch), openC = chapterOpen(save, ch);
    const st = stage();
    if (!st && save.goal > 0) save.goal = 0;
    const pick = (id: string, label: string, value: string, extra: string, help: string, act = '') => `
      <div class="wy-pick" data-f data-lr="${id}" ${act ? `data-act="${act}"` : ''} data-help="${esc(help)}">
        <button class="cm-btn" data-dir="-1" aria-label="Previous">${ICON.left}</button>
        <div class="mid"><span class="cm-label">${label}</span><span>${value}</span>${extra}</div>
        <button class="cm-btn" data-dir="1" aria-label="Next">${ICON.right}</button>
      </div>`;
    const locked = !owned(skin);
    const buyable = locked && skin.unlock?.by === 'coins';
    const placeStars = stagesOf(arena.id).reduce((a, s) => a + (save.stars[s.id] ?? 0), 0);
    const placeExtra = openA ? `<span class="sub">${starRow(0, 0)}${placeStars}/24 stars${openC ? '' : ' (free play only)'}</span>` : `<span class="lock">Beat ${esc(ARENAS[ch - 1].boss.name)} to open</span>`;
    const goalValue = !openA ? 'Locked' : st ? `${st.n}. ${esc(st.text)}` : 'Free play';
    const goalExtra = st ? starRow(save.stars[st.id] ?? 0) : openA ? `<span class="sub">Best ${save.best[arena.id] ?? 0}</span>` : '';
    const goalHelp = !openA ? '' : st ? `${goalText(st, Math.min(2, save.stars[st.id] ?? 0))}. ${esc(arena.blurb)}` : `Grow as long as you can. ${esc(arena.blurb)}`;
    const arrows = touchSeen ? 'Tap the arrows to change.' : `${key('← →')} change`;
    show(`
      <div class="cm-panel wy-card wy-menu">
        <h1 class="cm-title">Gem Wyrm</h1>
        <div class="wy-level"><span>Level <b class="num">${lv.level}</b> ${esc(evo.name)}</span><span class="wy-stars"><b>★</b></span><span class="num">${totalStars(save)}/${MAX_STARS}</span>
          <div class="wy-bar"><i style="width:${Math.round((lv.into / lv.need) * 100)}%"></i></div></div>
        ${pick('arena', 'Place', esc(arena.name), placeExtra, `${esc(arena.blurb)} ${arrows}`)}
        ${pick('goal', 'Goal', goalValue, goalExtra, `${goalHelp} ${arrows}`)}
        ${pick('skin', 'Wyrm', esc(skin.name), skinStatus(skin), buyable ? `${touchSeen ? 'Tap' : key('Enter')} to buy for ${(skin.unlock as { cost: number }).cost} coins` : arrows, buyable ? 'buy' : '')}
        <div class="wy-row">
          <button class="cm-btn" data-f data-act="big" data-help="Answer a question. Start longer, with a gem magnet.">
            <span>Start big</span>${startBonus === 'big' ? '<span class="wy-done">Ready</span>' : QUIZ}</button>
          <button class="cm-btn" data-f data-act="dragon" data-help="Answer a hard math question on paper. Start huge, with magnet, double gems, and a bubble.">
            <span>Dragon start</span>${startBonus === 'dragon' ? '<span class="wy-done">Ready</span>' : BIGQUIZ}</button>
        </div>
        <button class="cm-btn main" data-f data-act="play" data-help="${esc(touchSeen ? 'Drag anywhere to steer. Hold Boost to go fast.' : `${key('← →')} or pointer to steer. ${key('Space')} or hold click to boost.`)}">
          <span>Play</span>${key('Enter')}
        </button>
        <button class="cm-btn" data-f data-act="book" data-help="Your wyrm's growth, awards, and wyrm collection."><span>Wyrm book</span><span class="sub num">${save.awards.length}/${AWARDS.length} awards</span></button>
        <div class="cm-help wy-help"></div>
        <div class="wy-foot"><span>Coins <b class="num">${save.coins}</b></span><span>Wyrms <b class="num">${save.owned.length}/${SKINS.length}</b></span></div>
      </div>`,
      {
        play: () => {
          if (!arenaOpen(save, chapter())) { sfx('error'); return; }
          if (!owned(skin)) { skin = SKINS.find((x) => x.id === save.skin) ?? SKINS[0]; }
          startRun();
        },
        buy: () => buySkin(),
        big: () => void preBonus('big'),
        dragon: () => void preBonus('dragon'),
        book: () => book('grow'),
      },
      'left',
      {
        arena: (dir) => {
          setArena(ARENAS[(chapter() + dir + ARENAS.length) % ARENAS.length]);
          save.goal = defaultGoal();
          void store();
          attract();
          menu();
          focusOn('[data-lr="arena"]');
        },
        goal: (dir) => {
          const opts = [0, ...stagesOf(arena.id).filter((s) => stageOpen(save, s)).map((s) => s.n)];
          save.goal = opts[(opts.indexOf(save.goal) + dir + opts.length) % opts.length];
          void store();
          menu();
          focusOn('[data-lr="goal"]');
        },
        skin: (dir) => {
          skin = SKINS[(SKINS.indexOf(skin) + dir + SKINS.length) % SKINS.length];
          if (owned(skin)) { save.skin = skin.id; void store(); if (skin.acc === 'ears') sfx('purr', { volume: 0.6 }); }
          sim.player.look = skin;
          menu();
          focusOn('[data-lr="skin"]');
        },
      },
    );
  }
  async function preBonus(kind: 'big' | 'dragon') {
    if (startBonus !== kind) {
      const ok = kind === 'big' ? await bonus('Start big with a gem magnet') : await bonus('Dragon start: begin huge with three potions', true);
      if (ok) { startBonus = kind; sfx('unlock'); }
    }
    menu();
    focusOn(`[data-act="${kind}"]`);
  }
  function buySkin() {
    const u = skin.unlock;
    if (owned(skin) || u?.by !== 'coins' || save.coins < u.cost) { sfx('error'); focusOn('[data-lr="skin"]'); return; }
    save.coins -= u.cost;
    save.owned.push(skin.id);
    save.skin = skin.id;
    void store();
    sfx('buy');
    world.confetti(sim.player.segs[0], sim.player.segs[1], 60);
    world.puff(sim.player);
    menu();
    focusOn('[data-lr="skin"]');
  }

  /** Wyrm book: growth stages, awards, and the collection. Read-only pages. */
  function book(tab: 'grow' | 'awards' | 'wyrms') {
    state = 'book';
    const lv = level(), e = evoOf(lv);
    let body = '';
    if (tab === 'grow') {
      body = `<div class="wy-list">${EVOS.map((x, i) => `<div class="row ${i <= e ? 'done' : ''} ${i === e ? 'now' : ''}"><b class="num">Lv ${x.level}</b><span><b>${esc(x.name)}</b> ${esc(x.perk)}</span></div>`).join('')}
        <div class="row ${lv >= MAX_LEVEL ? 'done' : ''}"><b class="num">Lv ${MAX_LEVEL}+</b><span><b>Mythic ranks</b> Every level past ${MAX_LEVEL} is a new rank${lv > MAX_LEVEL ? `: rank ${lv - MAX_LEVEL}` : ''}.</span></div></div>`;
    } else if (tab === 'awards') {
      body = `<div class="wy-list two">${AWARDS.map((a) => {
        const done = save.awards.includes(a.id);
        return `<div class="row ${done ? 'done' : ''}"><span>${esc(a.text)}</span><b class="num">${done ? 'Done' : `${Math.min(a.value, Math.floor(save.stats[a.stat]))}/${a.value}`}</b><i class="num">+${a.coins}</i></div>`;
      }).join('')}</div>`;
    } else {
      body = `<div class="wy-grid">${SKINS.map((s) => `<div class="chip ${owned(s) ? 'done' : ''}"><i style="background:linear-gradient(90deg, ${s.colors.slice(0, 3).map((c) => hex(c)).join(', ')})"></i><span><b>${esc(s.name)}</b>${owned(s) ? '' : `<br>${esc(unlockText(s))}`}</span></div>`).join('')}</div>`;
    }
    const tabBtn = (id: string, label: string) => `<button class="cm-btn ${tab === id ? 'main' : ''}" data-f data-act="${id}"><span>${label}</span></button>`;
    show(`
      <div class="cm-panel wy-card wy-book">
        <h2 class="cm-title">Wyrm book</h2>
        <div class="wy-row">${tabBtn('grow', 'Growth')}${tabBtn('awards', 'Awards')}${tabBtn('wyrms', 'Wyrms')}<button class="cm-btn" data-f data-act="back"><span>Back</span>${key('Esc')}</button></div>
        ${body}
      </div>`,
      { grow: () => book('grow'), awards: () => book('awards'), wyrms: () => book('wyrms'), back: () => { menu(); focusOn('[data-act="book"]'); } });
    focusOn(`[data-act="${tab}"]`);
  }

  function attract() {
    setupRun(sim, arena, null, level());
    world.setArena(arena, sim);
    sim.reset(camalot.player.name, skin, 60, true);
    applyPerks(sim, level());
    world.snapCamera(sim.player);
  }

  function startRun() {
    const st = stage();
    const lv = level(), perks = perksOf(lv);
    setupRun(sim, arena, st, lv);
    sim.reset(camalot.player.name, skin, startBonus === 'dragon' ? T.dragonStartMass : startBonus === 'big' ? T.bigStartMass : perks.startMass, false);
    applyPerks(sim, lv);
    const p = sim.player;
    p.bubble = 3;
    if (startBonus === 'big') p.magnet = 20;
    if (startBonus === 'dragon') { p.magnet = 30; p.double = 30; p.bubble = 10; }
    startBonus = '';
    tracker = new RunTracker(arena.id, st);
    starsShown = 0;
    downTimer = winTimer = rushRespawn = 0;
    combo = 0;
    nextGrow = Math.ceil((lengthScore(p.mass) + 1) / 1000) * 1000;
    held.clear();
    world.snapCamera(p);
    save.runs++;
    hideScreen();
    state = 'play';
    syncHud();
    sfx('whoosh');
    audio.music('wyrm', st?.kind === 'boss' ? 'intense' : 'play');
    toast(st ? goalText(st, 0) : `Free play: ${arena.name}`);
    wind ??= audio.loop('wind');
  }

  function syncHud() {
    hud.hidden = state === 'menu' || state === 'book';
    const canRoar = sim.player.roarMax > 0;
    boostBtn.hidden = !touchSeen;
    roarBtn.hidden = !touchSeen || !canRoar;
    keysHint.hidden = touchSeen;
    keysHint.innerHTML = `${key('← →')} turn ${key('Space')} boost${canRoar ? ` ${key('E')} roar` : ''}`;
  }

  function pause() {
    state = 'pause';
    held.clear();
    mouseBoost = false;
    const q = { auto: 'Auto', high: 'High', low: 'Low' }[save.quality];
    show(`
      <div class="cm-panel wy-card">
        <h2 class="cm-title">Paused</h2>
        <button class="cm-btn main" data-f data-act="resume"><span>Resume</span>${key('Esc')}</button>
        <button class="cm-btn" data-f data-act="quality" data-help="High looks best. Low runs smoother on tablets. Auto picks for this device."><span>Picture quality</span><span>${q}${save.quality === 'auto' ? ` (${world.low ? 'Low' : 'High'})` : ''}</span></button>
        <button class="cm-btn" data-f data-act="quit"><span>End run</span></button>
        <div class="cm-help wy-help"></div>
      </div>`,
      {
        resume: () => { hideScreen(); state = 'play'; },
        back: () => { hideScreen(); state = 'play'; },
        quality: () => {
          save.quality = save.quality === 'auto' ? 'high' : save.quality === 'high' ? 'low' : 'auto';
          void store();
          world.setQuality(isLow(save.quality));
          slowFrames = frames = 0;
          pause();
          focusOn('[data-act="quality"]');
        },
        quit: () => finish(),
      });
  }

  function downScreen() {
    state = 'down';
    if (tracker.r.revived) { finish(); return; }
    const len = lengthScore(sim.player.mass);
    show(`
      <div class="cm-panel wy-card">
        <h2 class="cm-title">Popped!</h2>
        <div class="wy-stats"><span>Length</span><b class="big num">${len}</b></div>
        <button class="cm-btn main" data-f data-act="revive" data-help="Answer a question. Keep your size. Once per run."><span>Revive</span>${QUIZ}</button>
        <button class="cm-btn" data-f data-act="finish" data-help="End the run and collect coins."><span>Finish</span></button>
        <div class="cm-help wy-help"></div>
      </div>`,
      {
        revive: async () => {
          const ok = await bonus('Revive your wyrm at the same size');
          if (ok) {
            tracker.r.revived = true;
            sim.revive(sim.player);
            world.snapCamera(sim.player);
            world.ring(sim.player.segs[0], sim.player.segs[1], 0x7fd8ff, 9);
            sfx('whoosh'); sfx('sparkle');
            hideScreen();
            held.clear();
            state = 'play';
            audio.music('wyrm', tracker.stage?.kind === 'boss' ? 'intense' : 'play');
          } else { state = 'down'; downScreen(); }
        },
        finish: () => finish(),
      });
  }

  function finish() {
    if (sim.player.alive) sim.player.auto = true; // a win: the wyrm keeps gliding behind the results
    else sim.spill(sim.player);
    wind?.setLevel(0);
    const before = levelOf(save.xp);
    const res = settle(save, tracker.r, tracker.stars());
    mult = 1;
    hoard = false;
    void store();
    audio.music('wyrm', res.stars > 0 || res.newBest ? 'win' : 'menu');
    if (res.newStars > 0) sfx('win'); else if (res.coins > 0) sfx('coin');
    if (res.levelAfter > res.levelBefore) setTimeout(() => sfx('levelUp'), 500);
    if (res.newSkins.length || res.opened) setTimeout(() => sfx('unlock'), 900);
    results(res, before.into / before.need);
  }

  function results(res: Settled, xpFrom: number) {
    state = 'results';
    hud.hidden = true;
    const r = tracker.r, st = tracker.stage;
    const lv = levelOf(save.xp);
    const canMult = mult < 3 && res.coins > 0;
    const canHoard = res.bossFirst && !hoard;
    const next = st && (save.stars[st.id] ?? 0) > 0 ? STAGES[STAGES.indexOf(st) + 1] : undefined;
    const nextOk = next && stageOpen(save, next) ? next : undefined;
    const news: string[] = [];
    if (res.levelAfter > res.levelBefore) {
      news.push(`Level up! Level ${res.levelAfter}`);
      const e = evoOf(res.levelAfter);
      if (e > evoOf(res.levelBefore)) news.push(`Your wyrm grew into a ${EVOS[e].name}. ${EVOS[e].perk}`);
      for (const k of Object.keys(POTIONS) as PotionKind[]) if (POTIONS[k].level > res.levelBefore && POTIONS[k].level <= res.levelAfter) news.push(`New potion: ${POTIONS[k].label}`);
    }
    if (res.opened) news.push(`New place: ${res.opened.name}`);
    for (const k of res.newSkins) news.push(`New wyrm: ${k.name}`);
    for (const a of res.newAwards) news.push(`Award: ${a.text} (+${a.coins} coins)`);
    const title = st ? (res.stars > 0 ? (res.stars === 3 ? 'Three stars!' : 'Goal complete!') : 'So close!') : 'Run over';
    const pct = Math.round((lv.into / lv.need) * 100);
    show(`
      <div class="cm-panel wy-card wy-results">
        <h2 class="cm-title">${title}</h2>
        ${st ? `<div class="wy-bigstars">${starRow(res.stars)}</div><p class="sub">${st.n}. ${esc(st.text)}${res.stars < 3 ? `. Next star: ${goalText(st, res.stars)}` : ''}</p>` : ''}
        <div class="wy-stats">
          <span>Length</span><b class="big num">${r.length}</b>
          ${st ? '' : `<span>Best</span><b class="num">${res.newBest ? '<span class="wy-new">New best</span>' : save.best[arena.id] ?? 0}</b>`}
          <span>Wyrms popped</span><b class="num">${r.pops}</b>
          <span>Coins</span><b class="num">+${res.coins * mult + res.extraCoins + (hoard ? T.hoardCoins : 0)}${mult > 1 ? ` (run x${mult})` : ''}</b>
          <span>Level ${lv.level} ${esc(EVOS[evoOf(lv.level)].name)}</span><b class="num">+${res.xp} xp</b>
        </div>
        <div class="wy-bar"><i style="width:${res.levelAfter > res.levelBefore ? 0 : Math.round(xpFrom * 100)}%" data-to="${pct}"></i></div>
        ${news.map((n) => `<div class="wy-new">${esc(n)}</div>`).join('')}
        <button class="cm-btn main" data-f data-act="${nextOk ? 'next' : 'again'}"><span>${nextOk ? `Next goal: ${esc(nextOk.text)}` : 'Play again'}</span>${key('Enter')}</button>
        ${canHoard ? `<button class="cm-btn" data-f data-act="hoard" data-help="Answer a hard math question on paper. Win the boss's hoard: ${T.hoardCoins} coins."><span>Royal hoard +${T.hoardCoins}</span>${BIGQUIZ}</button>` : ''}
        ${canMult ? `<button class="cm-btn" data-f data-act="mult" data-help="Answer a question. Each right answer adds the run's coins again, up to x3."><span>Run coins x${mult + 1}</span>${QUIZ}</button>` : ''}
        <div class="wy-row">${nextOk ? '<button class="cm-btn" data-f data-act="again"><span>Play again</span></button>' : ''}<button class="cm-btn" data-f data-act="menu"><span>Menu</span></button></div>
        <div class="cm-help wy-help"></div>
      </div>`,
      {
        again: () => startRun(),
        next: () => {
          if (!nextOk) return;
          if (nextOk.arena !== arena.id) { setArena(ARENAS[nextOk.chapter]); attract(); }
          save.goal = nextOk.n;
          void store();
          startRun();
        },
        menu: () => { save.goal = defaultGoal(); attract(); menu(); },
        back: () => { save.goal = defaultGoal(); attract(); menu(); },
        mult: async () => {
          const ok = await bonus(`Run coins x${mult + 1}`);
          if (ok) { mult++; save.coins += res.coins; void store(); sfx('coin'); }
          results(res, lv.into / lv.need);
          focusOn('[data-act="mult"]');
        },
        hoard: async () => {
          const ok = await bonus(`Royal hoard: ${T.hoardCoins} coins`, true);
          if (ok) { hoard = true; save.coins += T.hoardCoins; void store(); sfx('coin'); sfx('cheer'); }
          results(res, lv.into / lv.need);
        },
      });
    const bar = screen.querySelector<HTMLElement>('.wy-bar i');
    if (bar) requestAnimationFrame(() => { bar.style.width = `${bar.dataset.to}%`; });
  }

  async function bonus(reward: string, epic = false): Promise<boolean> {
    const prev = state;
    state = 'card';
    held.clear();
    mouseBoost = false;
    boostOff();
    screen.hidden = true;
    const r = await camalot.earnBonus({ reward, size: epic ? 'epic' : 'normal' });
    screen.hidden = false;
    state = prev;
    return r.earned;
  }

  // ---- HUD ----
  const tagPool: HTMLDivElement[] = [];
  let toastT = 0;
  function toast(text: string) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove('in');
    void toastEl.offsetWidth;
    toastEl.classList.add('in');
    toastT = 2.2;
  }
  /** A word that pops up over a spot in the world and floats away. */
  function popText(text: string, x: number, z: number, cls = '') {
    const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight;
    const s = world.toScreen(x, 2.5, z, W, H);
    if (!s || s.x < 0 || s.y < 0 || s.x > W || s.y > H) return;
    const el = document.createElement('div');
    el.className = `wy-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    root.querySelector('.wy')!.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  let goalHtml = '';
  function drawHud(dt: number) {
    const p = sim.player;
    lenEl.textContent = String(lengthScore(p.mass));
    const rank = sim.ranking();
    const top = rank.slice(0, 5);
    const rows = top.map((w, i) => row(i + 1, w));
    if (!top.includes(p)) rows.push(row(rank.indexOf(p) + 1, p));
    const html = rows.join('');
    if (board.innerHTML !== html) board.innerHTML = html;
    const pw: string[] = [];
    const chip = (color: number, label: string, secs: number) => secs > 0 && pw.push(`<div class="cm-panel chip"><i style="background:${hex(color)}"></i>${label} <span class="num">${Math.ceil(secs)}</span></div>`);
    for (const k of ['magnet', 'double', 'bubble', 'zoom'] as const) chip(POTIONS[k].color, POTIONS[k].label, p[k]);
    chip(POTIONS.frost.color, 'Frozen', p.frozen);
    const ph = pw.join('');
    if (powers.innerHTML !== ph) powers.innerHTML = ph;
    // goal panel
    const st = tracker.stage;
    let gh = '';
    if (st) {
      const stars = tracker.stars(), v = tracker.value(), tier = Math.min(2, stars);
      const prev = tier > 0 ? st.tiers[tier - 1] : 0;
      const pct = st.kind === 'boss' ? 0 : Math.max(0, Math.min(100, Math.round(((v - prev) / (st.tiers[tier] - prev)) * 100)));
      const hearts = sim.boss ? `<span class="wy-hearts">${'<b>♥</b>'.repeat(Math.max(0, sim.boss.hearts))}${'<i>♥</i>'.repeat(BOSS_HEARTS - Math.max(0, sim.boss.hearts))}</span>` : '';
      const tl = tracker.timeLeft();
      const clock = Number.isFinite(tl) ? `<b class="num wy-clock${tl < 30 ? ' hot' : ''}">${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}</b>` : '';
      gh = `<div class="top">${starRow(stars)}${clock}${hearts}</div><div>${stars >= 3 ? 'All stars!' : goalText(st, tier)}</div>${st.kind === 'boss' ? '' : `<div class="wy-bar"><i style="width:${pct}%"></i></div><span class="num sub">${Math.min(v, st.tiers[tier])} / ${st.tiers[tier]}</span>`}`;
    }
    if (gh !== goalHtml) { goalHtml = gh; goalEl.innerHTML = gh; goalEl.hidden = !gh; }
    if (p.roarMax > 0) {
      const k = 1 - p.roarCd / p.roarMax;
      roarBtn.style.setProperty('--k', `${Math.round(k * 360)}deg`);
      roarBtn.classList.toggle('ready', p.roarCd <= 0);
    }
    if (toastT > 0 && (toastT -= dt) <= 0) toastEl.hidden = true;
    drawMap();
  }
  function row(n: number, w: Wyrm) {
    return `<div class="row${w === sim.player ? ' me' : ''}${w.isBoss ? ' boss' : ''}"><span class="num">${n}</span><span>${esc(w.name)}</span><b class="num">${lengthScore(w.mass)}</b></div>`;
  }
  function drawMap() {
    const s = mapCv.width, c = s / 2, k = (c - 8) / T.arenaRadius;
    map.clearRect(0, 0, s, s);
    map.fillStyle = '#0d1118cc';
    map.beginPath(); map.arc(c, c, c, 0, 7); map.fill();
    map.strokeStyle = hex(arena.border); map.lineWidth = 4;
    map.beginPath(); map.arc(c, c, c - 6, 0, 7); map.stroke();
    for (const o of sim.obstacles) {
      map.fillStyle = o.kind === 'bumper' ? '#ffffff55' : '#ff6b6b99';
      map.beginPath(); map.arc(c + o.x * k, c + o.z * k, Math.max(2, o.r * k), 0, 7); map.fill();
    }
    for (const pt of sim.potions) {
      if (!pt.alive) continue;
      map.fillStyle = hex(POTIONS[pt.kind].color);
      map.fillRect(c + pt.x * k - 3, c + pt.z * k - 3, 6, 6);
    }
    map.fillStyle = '#ffe066';
    for (const sp of sim.sprites) if (sp.alive) { map.beginPath(); map.arc(c + sp.x * k, c + sp.z * k, 2.5, 0, 7); map.fill(); }
    for (const w of sim.wyrms) {
      if (!w.alive || w === sim.player) continue;
      map.fillStyle = w.isBoss ? '#ff5a5a' : '#f4efe6aa';
      map.beginPath(); map.arc(c + w.segs[0] * k, c + w.segs[1] * k, (w.isBoss ? 6 : 3) + radiusOf(w.mass) * 4, 0, 7); map.fill();
    }
    const p = sim.player;
    map.fillStyle = '#ffe3a0';
    map.beginPath(); map.arc(c + p.segs[0] * k, c + p.segs[1] * k, 7, 0, 7); map.fill();
  }
  function drawTags() {
    const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight;
    let used = 0;
    if (state !== 'menu' && state !== 'book') {
      for (const w of sim.wyrms) {
        if (!w.alive) continue;
        const r = radiusOf(w.mass) * 1.3;
        const s = world.toScreen(w.segs[0], r * 3.6, w.segs[1], W, H);
        if (!s || s.x < -50 || s.y < 0 || s.x > W + 50 || s.y > H) continue;
        const el = tagPool[used] ?? tagsEl.appendChild(document.createElement('div'));
        tagPool[used] = el as HTMLDivElement;
        el.className = `wy-tag${w === sim.player ? ' me' : ''}${w.isBoss ? ' boss' : ''}`;
        if (el.textContent !== w.name) el.textContent = w.name;
        el.style.left = `${s.x}px`;
        el.style.top = `${s.y}px`;
        el.hidden = false;
        used++;
      }
    }
    for (let i = used; i < tagPool.length; i++) tagPool[i].hidden = true;
  }

  // ---- what happens in the world: effects and sound for every event ----
  const panOf = (x: number) => Math.max(-1, Math.min(1, (x - sim.player.segs[0]) / 30));
  const nearPlayer = (x: number, z: number) => Math.hypot(x - sim.player.segs[0], z - sim.player.segs[1]) < 45;
  function onEvents(playing: boolean, now: number) {
    const p = sim.player;
    for (const e of sim.events) {
      if (playing) tracker.event(e, sim);
      switch (e.t) {
        case 'burst': world.burst(e.x, e.z, e.colors, e.n, e.size); break;
        case 'eat':
          world.gulp(e.wyrm);
          if (!playing || e.wyrm !== p) break;
          if (now - lastGulp > 70) {
            combo = comboT > 0 ? Math.min(14, combo + 1) : 0;
            comboT = 0.6;
            lastGulp = now;
            sfx('gulp', { pitch: 0.9 + combo * 0.045, volume: 0.55 });
          }
          break;
        case 'potion':
          world.ring(e.wyrm.segs[0], e.wyrm.segs[1], POTIONS[e.kind].color, 7);
          world.puff(e.wyrm);
          if (!playing) break;
          if (e.wyrm === p) {
            sfx(e.kind === 'zoom' ? 'boost' : e.kind === 'frost' ? 'crunch' : 'sparkle');
            toast(e.kind === 'frost' ? 'Frost! The other wyrms are slow' : POTIONS[e.kind].label);
          } else if (e.kind === 'frost') { toast(`${e.wyrm.name} froze you!`); sfx('crunch', { pitch: 0.7 }); }
          break;
        case 'sprite':
          world.burst(e.x, e.z, [0xffe066, 0xfff4c2], 26, 0.8);
          world.ring(e.x, e.z, 0xffe066, 6);
          if (playing && e.wyrm === p) { sfx('sparkle', { pitch: 1.3 }); sfx('coin'); popText(`+${T.spriteValue * 10}`, e.x, e.z, 'gold'); }
          break;
        case 'bump':
          world.bump(e.x, e.z);
          if (playing && e.wyrm === p) { vary('thud'); world.shake(0.25); }
          else if (playing && nearPlayer(e.x, e.z)) sfx('thud', { volume: 0.25, pan: panOf(e.x) });
          break;
        case 'zone':
          if (playing && e.wyrm === p) sfx(e.kind === 'slow' ? 'splash' : e.kind === 'fast' ? 'boost' : 'whoosh', { volume: 0.6, pitch: e.kind === 'slick' ? 0.7 : 1.2 });
          break;
        case 'roar': {
          const x = e.wyrm.segs[0], z = e.wyrm.segs[1];
          world.ring(x, z, 0xffffff, T.roarRadius * 2, 0.7);
          world.ring(x, z, e.wyrm.look.accColor, T.roarRadius * 1.4, 0.5);
          world.shake(0.45);
          world.puff(e.wyrm);
          if (playing) { roarSound(); if (e.scared) popText(e.scared === 1 ? 'Scared 1!' : `Scared ${e.scared}!`, x, z); }
          break;
        }
        case 'bossHit':
          world.shake(0.7);
          world.confetti(e.wyrm.segs[0], e.wyrm.segs[1], 50);
          world.ring(e.wyrm.segs[0], e.wyrm.segs[1], 0xff6b6b, 16, 0.8);
          if (playing) { sfx('explode'); popText(e.wyrm.hearts > 0 ? 'Ouch!' : 'Beaten!', e.wyrm.segs[0], e.wyrm.segs[1], 'gold'); if (e.wyrm.hearts > 0) toast(`${e.wyrm.name} crashed! ${e.wyrm.hearts} to go`); }
          break;
        case 'down': {
          const x = e.wyrm.segs[0], z = e.wyrm.segs[1];
          world.ring(x, z, e.wyrm.look.colors[0], 8 + radiusOf(e.wyrm.mass) * 6);
          if (!playing) break;
          if (e.wyrm === p) {
            sfx('lose');
            world.shake(0.8);
            if (tracker.stage?.kind === 'rush') { rushRespawn = 1.5; toast('Popped! Back in a moment'); } else downTimer = 1.1;
          } else if (e.by === p) {
            vary('pop'); sfx('cheer', { volume: 0.5 });
            world.shake(0.35);
            world.confetti(x, z, 30);
            popText('Pop!', x, z, 'gold');
            toast(`You popped ${e.wyrm.name}!`);
          } else if (nearPlayer(x, z)) sfx('pop', { volume: 0.3, pan: panOf(x), pitch: 0.8 + Math.random() * 0.3 });
          if (e.wyrm.isBoss) { sfx('cheer'); world.confetti(x, z, 140); winTimer = 2; }
          break;
        }
      }
    }
    sim.events.length = 0;
  }

  /** Stars, growth milestones, music mood, and the loops, once per frame while playing. */
  function onPlayFrame(dt: number) {
    const p = sim.player, st = tracker.stage;
    tracker.tick(sim, dt);
    comboT -= dt;
    const stars = tracker.stars();
    if (stars > starsShown && st?.kind !== 'boss') {
      starsShown = stars;
      sfx('star', { pitch: 0.9 + stars * 0.12 });
      world.confetti(p.segs[0], p.segs[1], 40 + stars * 30);
      world.ring(p.segs[0], p.segs[1], 0xffe066, 12);
      world.puff(p);
      popText('★'.repeat(stars), p.segs[0], p.segs[1], 'gold big');
      if (stars >= 3) { toast('Three stars!'); sfx('cheer'); winTimer = 1.6; }
      else toast(`Star ${stars}! Next: ${goalText(st!, stars)}`);
    }
    const len = lengthScore(p.mass);
    if (p.alive && len >= nextGrow) {
      nextGrow = Math.ceil((len + 1) / 1000) * 1000;
      sfx('grow');
      world.puff(p);
      world.ring(p.segs[0], p.segs[1], p.look.colors[0], 8);
      popText(`Length ${Math.floor(len / 1000) * 1000}!`, p.segs[0], p.segs[1]);
    }
    if (p.boosting && !wasBoosting) vary('boost', 0.7);
    wasBoosting = p.boosting;
    wind?.setLevel(p.alive ? (p.boosting ? 0.7 : arena.id === 'peak' || arena.id === 'canyon' || arena.id === 'cloud' ? 0.22 : 0.06) : 0);
    wind?.setPitch(p.boosting ? 1.4 : 1);
    const rank = sim.ranking().indexOf(p);
    const tl = tracker.timeLeft();
    const hot = st?.kind === 'boss' || tl < 30 || (rank >= 0 && rank < 3 && p.mass > 150);
    audio.music('wyrm', hot ? 'intense' : 'play');
    if (st?.kind === 'rush') {
      if (tl <= 0) { sfx('win'); finish(); return; }
      if (rushRespawn > 0 && (rushRespawn -= dt) <= 0) {
        sim.spill(p);
        p.mass = perksOf(level()).startMass;
        sim.revive(p);
        world.snapCamera(p);
        sfx('whoosh');
      }
    }
    if (winTimer > 0 && (winTimer -= dt) <= 0) { finish(); return; }
    if (downTimer > 0 && (downTimer -= dt) <= 0) downScreen();
  }

  // ---- loop ----
  let last = performance.now();
  function frame(now: number) {
    const real = (now - last) / 1000;
    const dt = Math.min(0.05, real);
    last = now;
    const running = state === 'play' || state === 'menu' || state === 'book' || state === 'down' || state === 'results';
    if (running) {
      if (state === 'play') applyInput();
      sim.step(dt);
      onEvents(state === 'play', now);
      if (state === 'play') onPlayFrame(dt);
    }
    world.render(sim, running ? dt : 0, sim.player, state === 'menu' || state === 'book');
    if (state === 'play' || state === 'pause' || state === 'down' || state === 'card') drawHud(running ? dt : 0);
    drawTags();
    // Auto quality: if High cannot hold a smooth frame rate here, drop to Low once.
    if (save.quality === 'auto' && !world.low && state === 'play' && ++frames > 60) {
      if (real > 1 / 30) slowFrames++;
      if (frames > 240) {
        if (slowFrames > 90) { world.setQuality(true); toast('Picture set to Low for smooth play'); }
        frames = 61; slowFrames = 0;
      }
    }
    requestAnimationFrame(frame);
  }

  setArena(arena);
  if (!arenaOpen(save, chapter())) setArena(ARENAS[0]);
  if (save.goal > 0 && !stage()) save.goal = defaultGoal();
  attract();
  menu();
  requestAnimationFrame(frame);
  return { sim, world, save, menu, startRun, attract, tracker: () => tracker, goto: (i: number, goal = 0) => { setArena(ARENAS[i]); save.goal = goal; attract(); menu(); } };
}
