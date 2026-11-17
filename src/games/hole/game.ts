// Riftmaw: menus, HUD, input, save data, the campaign and the round flow. Gets the platform services from main.ts.
import './style.css';
import type { Camalot, SfxName, LoopHandle } from '../../core/contract';
import { MAPS, type MapId } from './props';
import { World, radiusFor, massFor, type Ability, type Hole, type PowKind, type Quality, type Swallowed } from './world';
import {
  TUNE, UPGRADES, upPrice, ABILITIES, TITLES, sizeName, SKINS, PLACES, LEVELS_PER_PLACE, starsToOpen, placePrice, levelDef, STAR_TIME, CLEAR_STEP, STAR_AT,
  PLACE_COINS, levelCoins, scoreCoins, TREASURES, treasureAt, AWARDS, migrate, type LevelDef, type PlayMode, type Save, type Stat, type UpKey,
} from './data';

const POW_NAME: Record<PowKind, string> = { magnet: 'Magnet', speed: 'Speed', grow: 'Grow', clock: '+10 seconds', rush: 'Overdrive: double growth', treasure: 'Treasure', thorn: 'Thornball: rift shrinks' };

// Lucide icons (lucide.dev, ISC): pause, zap, sparkles.
const svg = (p: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON_PAUSE = svg('<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>');
const ICON_ZAP = svg('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>');
const ICON_STAR = svg('<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>');

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const key = (k: string) => `<span class="cm-key">${k}</span>`;
const fmtTime = (t: number) => { const s = Math.ceil(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th'][n] ?? `${n + 1}th`;
const starRow = (n: number, of = 3) => `<span class="hh-st">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const bigStars = (n: number) => `<div class="hh-stars" aria-label="${n} of 3 stars">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}" style="animation-delay:${i * 0.35}s"></i>`).join('')}</div>`;
const mapName = (id: MapId) => MAPS.find((m) => m.id === id)!.name;

interface Goal { text: string; target: number; value: () => number; item?: string; unit?: string }
interface Round { lv: LevelDef | null; crown: boolean; mode: PlayMode | 'level'; goal: Goal | null; time: number; eaten: Record<string, number>; gobbled: number; bosses: number; won: boolean }

export async function run(cm: Camalot) {
  const save: Save = migrate(await cm.save.load<unknown>());
  const persist = () => cm.save.store(save);
  const au = cm.audio;
  const sfx = (n: SfxName, pitch = 1, volume = 1) => au.sfx(n, { pitch: pitch * (0.95 + Math.random() * 0.1), volume });

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = 'hh';
  root.innerHTML = `
    <canvas tabindex="-1" aria-label="Game"></canvas>
    <div class="hh-tags"></div>
    <div class="hh-speed"></div>
    <div class="hh-flash"></div>
    <div class="hh-arrow" hidden></div>
    <div class="hh-hud" hidden>
      <div class="hh-timer cm-panel"><b>2:00</b></div>
      <div class="hh-board cm-panel"></div>
      <button class="hh-pause cm-btn" aria-label="Pause">${ICON_PAUSE}${key('P')}</button>
      <div class="hh-fx"></div>
      <div class="hh-scores"></div>
      <div class="hh-size cm-panel"><b>Size 1</b><div class="hh-bar"><i></i></div></div>
      <div class="hh-acts">
        <button class="hh-abil cm-btn" aria-label="Ability" hidden>${ICON_STAR}<span></span>${key('E')}</button>
        <button class="hh-boost cm-btn" aria-label="Boost">${ICON_ZAP}Boost${key('Space')}</button>
      </div>
      <div class="hh-pop cm-panel" hidden></div>
      <div class="hh-msg cm-panel" hidden></div>
    </div>
    <div class="hh-stick" hidden><i></i></div>
    <div class="hh-screen"></div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>('canvas');
  const hud = $('.hh-hud'), screen = $('.hh-screen'), tags = $('.hh-tags'), stick = $('.hh-stick'), arrow = $('.hh-arrow');
  const timerEl = $('.hh-timer'), boardEl = $('.hh-board'), sizeEl = $('.hh-size b'), barEl = $('.hh-bar i');
  const popEl = $('.hh-pop'), msgEl = $('.hh-msg'), boostEl = $('.hh-boost'), abilEl = $('.hh-abil'), fxEl = $('.hh-fx');

  // Quality: High on laptops, Low on tablets and small machines; she can change it in Pause.
  const autoQuality = (): Quality => (matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'high');
  let slowDrop = false; // Auto fell back to Low this session because frames were slow
  const quality = (): Quality => (save.quality === 'auto' ? (slowDrop ? 'low' : autoQuality()) : save.quality);
  const world = new World(canvas, quality());
  const resize = () => world.resize(root.clientWidth, root.clientHeight);
  addEventListener('resize', resize);
  resize();

  // ---------- round state ----------
  type State = 'menu' | 'brief' | 'play' | 'pause' | 'card' | 'timeup' | 'results';
  let state: State = 'menu';
  let back: () => void = () => showHome();
  let startBonus = 0; // extra start radius earned from a question, used by the next round
  let timeUpOffered = false;
  let combo = 0, comboT = 0, popT = 0, lastLevel = 1, lastGulp = 0, abilCd = 0;
  let roundCoins = 0;
  let round: Round = { lv: null, crown: false, mode: 'battle', goal: null, time: 0, eaten: {}, gobbled: 0, bosses: 0, won: false };
  let wind: LoopHandle | null = null, waves: LoopHandle | null = null;
  const stopLoops = () => { wind?.stop(); waves?.stop(); wind = waves = null; };

  const flashEl = $('.hh-flash');
  const flash = () => { flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); };
  const pop = (text: string, secs = 1.2) => { popEl.textContent = text; popEl.hidden = false; popT = secs; };

  // ---------- score popups: "+N" rising from the hole. One pooled layer of 10 nodes, nothing allocated per item. ----------
  // Tiers by item size (half-diagonal): tiny, small, house, big, giant, landmark; bigger tiers are larger, bolder and
  // gold, and big and up show the item's name. Unnamed items swallowed within MERGE seconds share one popup with a
  // count ("+36 x6"). Every popup rises at the same speed, so a new one takes the lowest lane clear of the others;
  // when every lane is busy it joins the newest popup instead.
  const COMBO_AT = [10, 25, 50, 100];
  const TIER_AT = [0.5, 1.5, 2.8, 4.5, 9], TIER_LIFE = [0.8, 1.0, 1.2, 1.5, 1.8, 2.4], MERGE = 0.4, NAMED = 3;
  const LANE = 46, LANES = 4, RISE = 60; // px per lane, lanes above the hole, px per second
  const scoresEl = $('.hh-scores');
  const scorePops = Array.from({ length: 10 }, () => {
    const el = document.createElement('div');
    el.hidden = true;
    scoresEl.append(el);
    return { el, t: 9, life: 0, v: 0, n: 0, tier: 0, lane: 0, name: '', kind: '' };
  });
  const singular = (s: string) => s.replace(/ies$/, 'y').replace(/(ch|sh|x|o)es$/, '$1').replace(/s$/, '');
  const itemName = (kind: string) => singular(world.kinds.get(kind)?.label ?? kind).replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());
  const popY = (s: (typeof scorePops)[number]) => s.lane * LANE + s.t * RISE;
  function scorePop(v: number, diag: number, kind: string) {
    const tier = TIER_AT.findIndex((d) => diag < d) < 0 ? TIER_AT.length : TIER_AT.findIndex((d) => diag < d);
    const live = scorePops.filter((s) => !s.el.hidden);
    let sp = tier < NAMED ? live.find((s) => !s.name && s.t < MERGE) : undefined;
    const lane = sp ? -1 : Array.from({ length: LANES }, (_, i) => i).find((L) => live.every((s) => Math.abs(popY(s) - L * LANE) >= LANE)) ?? -1;
    if (!sp && lane < 0) sp = live.reduce((a, b) => (b.t < a.t ? b : a)); // every lane busy: join the newest
    if (sp) {
      sp.v += v; sp.n++;
      if (tier > sp.tier) sp.tier = tier;
      if (sp.kind !== kind) sp.name = '';
      sp.life = Math.max(sp.life, sp.t + 0.6);
    } else {
      sp = scorePops.reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a)); // a free node, or the one nearest its end
      Object.assign(sp, { t: 0, v, n: 1, tier, lane, life: TIER_LIFE[tier], kind, name: tier >= NAMED ? itemName(kind) : '' });
    }
    sp.el.className = `hh-sc t${sp.tier}`;
    sp.el.innerHTML = `+${sp.v}${sp.n > 1 ? `<small> x${sp.n}</small>` : ''}${sp.name ? `<em>${esc(sp.name)}</em>` : ''}`;
    sp.el.hidden = false;
  }
  function drawScorePops(dt: number, p: Hole) {
    const c = world.toScreen(p.x, 0, p.z, root.clientWidth, root.clientHeight);
    for (const s of scorePops) {
      if (s.el.hidden) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { s.el.hidden = true; continue; }
      const grow = s.t < 0.12 ? 0.55 + (s.t / 0.12) * 0.45 : 1;
      s.el.style.opacity = String(k < 0.65 ? 1 : (1 - k) / 0.35);
      s.el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y - 30 - popY(s))}px) translate(-50%, -50%) scale(${grow.toFixed(2)})`;
    }
  }
  const clearScorePops = () => { for (const s of scorePops) { s.t = 9; s.el.hidden = true; } };
  const sizeBox = $('.hh-size');
  const sizeJump = () => { sizeBox.classList.remove('jump'); void sizeBox.offsetWidth; sizeBox.classList.add('jump'); hudT = 0; };
  const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
  const placeStars = (pi: number) => Array.from({ length: LEVELS_PER_PLACE }, (_, i) => save.stars[`${PLACES[pi]}-${i + 1}`] ?? 0).reduce((a, b) => a + b, 0);
  const placeOpen = (pi: number) => pi === 0 || (!!save.stars[`${PLACES[pi - 1]}-${LEVELS_PER_PLACE}`] && totalStars() >= starsToOpen(pi));
  const levelOpen = (pi: number, n: number) => placeOpen(pi) && (n === 1 || !!save.stars[`${PLACES[pi]}-${n - 1}`]);
  const title = () => [...TITLES].reverse().find(([s]) => totalStars() >= s)![1];
  const abilityOpen = (a: (typeof ABILITIES)[number]) => totalStars() >= a.stars;
  const bump = (stat: Stat, v: number, max = false) => { save.stats[stat] = max ? Math.max(save.stats[stat], v) : save.stats[stat] + v; };

  world.events = {
    swallow(h: Hole, o: Swallowed) {
      if (!h.player) return;
      round.eaten[o.kind] = (round.eaten[o.kind] ?? 0) + 1;
      comboT = 1.0;
      combo++;
      // Combo bonus goes into the item's own "+N"; the banner only marks milestones, so it never reads x1060.
      const bonus = combo >= 5 ? Math.min(20, combo) : 0;
      h.score += bonus;
      if (combo >= 5 && combo % 5 === 0) { if (COMBO_AT.includes(combo)) pop(`Chain x${combo}`); sfx('cascade', 1 + Math.min(1, combo / 60), 0.6); }
      bump('combo', combo, true);
      scorePop(o.score * (h.rushT > 0 ? 2 : 1) + bonus, o.diag, o.kind);
      if (o.diag >= TIER_AT[1] || o.diag > h.R * 0.4) sizeJump();
      if (o.boss) { round.bosses++; pop('LANDMARK DEVOURED', 2.5); flash(); sfx('explode'); sfx('cheer'); return; }
      const now = performance.now();
      if (now - lastGulp < 45) return;
      lastGulp = now;
      // Gulp sizes: tiny things pop, bigger things gulp lower and louder, houses crunch, halls thud.
      if (o.diag < 0.45) sfx('pop', 1.35 - o.diag, 0.35);
      else if (o.diag < 1.5) sfx('gulp', 1.3 - o.diag * 0.3, 0.5);
      else if (o.diag < 4.5) { sfx('crunch', 1.2 - o.diag * 0.1, 0.7); sfx('gulp', 0.75, 0.6); }
      else { sfx('thud', 0.8, 0.8); sfx('gulp', 0.5, 0.7); }
    },
    holeEaten(victim: Hole, by: Hole) {
      if (victim.player) {
        msgEl.innerHTML = `Consumed by <b>${esc(by.name)}</b><br>Reforming`;
        msgEl.hidden = false;
        sfx('lose', 1.2, 0.7);
      } else if (by.player) {
        round.gobbled++;
        pop(`${victim.name} consumed`, 1.6);
        sfx('gulp', 0.6); sfx(save.skin === 'kitty' || save.skin === 'set-cat' ? 'meow' : 'cheer', 1, 0.7);
      }
    },
    power(h: Hole, kind: PowKind) {
      if (!h.player) return;
      if (kind === 'speed' && h.boostT > 0 && h.speedT <= 0) return void sfx('whoosh');
      pop(POW_NAME[kind], kind === 'treasure' ? 2.2 : 1.2);
      sfx(kind === 'thorn' ? 'error' : kind === 'grow' ? 'grow' : kind === 'speed' ? 'boost' : kind === 'treasure' ? 'unlock' : kind === 'clock' ? 'coin' : 'sparkle');
      if (kind === 'treasure' && round.lv) {
        const id = `${round.lv.place}-${treasureAt(round.lv)}`;
        if (!save.treasures.includes(id)) { save.treasures.push(id); bump('treasures', 1); pop(`Treasure: ${TREASURES[round.lv.place][treasureAt(round.lv)]}`, 2.6); }
      }
    },
  };

  const skin = () => SKINS.find((s) => s.id === save.skin) ?? SKINS[0];

  function attract() {
    stopLoops();
    world.setQuality(quality());
    world.setup(save.map, 'attract', { skin: skin(), name: '', startR: TUNE.R0, time: 0, bots: 3, regrow: true });
    world.paused = false;
    au.music('hole', 'menu');
  }

  const playerOpts = (bonus: number) => ({
    skin: skin(), name: cm.player.name, startR: TUNE.R0 + save.up.size * UPGRADES[0].per + bonus,
    speed: 1 + save.up.speed * 0.05, gain: 1 + save.up.gain * 0.06, reach: save.up.reach * 0.035,
  });

  /** Builds the level's town and works out its goal from what is really on the map. */
  function prepare(lv: LevelDef | null, crown: boolean, mode: PlayMode | 'level') {
    const bonus = startBonus;
    if (lv) {
      const time = lv.time + save.up.time * 5;
      world.setup(lv.place, lv.kind === 'battle' ? 'battle' : 'level', {
        ...playerOpts(bonus), time, bots: lv.bots, seed: lv.seed, half: lv.half, maxDiag: lv.maxDiag, botSkill: lv.botSkill,
        regrow: lv.kind === 'battle', slip: lv.slip, pows: lv.pows, thorns: lv.thorns, treasure: lv.treasure && (lv.kind === 'hunt' || !save.treasures.includes(`${lv.place}-${treasureAt(lv)}`)),
      });
      round = { lv, crown, mode: 'level', goal: makeGoal(lv), time, eaten: {}, gobbled: 0, bosses: 0, won: false };
    } else {
      const solo = mode === 'solo';
      const time = (solo ? TUNE.soloTime : TUNE.battleTime) + save.up.time * 5;
      world.setup(save.map, solo ? 'solo' : 'battle', { ...playerOpts(bonus), time, bots: solo ? 0 : 3, botSkill: save.rank / 20, regrow: !solo });
      round = { lv: null, crown: false, mode: mode as PlayMode, goal: null, time, eaten: {}, gobbled: 0, bosses: 0, won: false };
    }
    world.paused = true;
  }

  function makeGoal(lv: LevelDef): Goal | null {
    const p = world.player!;
    const kinds = [...world.kinds.entries()].sort((a, b) => a[1].diag - b[1].diag);
    const sizeFor = (frac: number) => Math.max(World.level(p.R).level + 2, World.level(radiusFor(p.startMass + frac * world.totalMass)).level);
    if (lv.kind === 'eat' || lv.kind === 'boss') {
      const [item, k] = kinds[lv.kind === 'boss' ? kinds.length - 1 : Math.round(lv.q * (kinds.length - 1))];
      const target = lv.kind === 'boss' ? 1 : Math.max(1, lv.bots ? Math.floor(k.count * lv.frac) : k.count <= 4 ? k.count : Math.round(k.count * lv.frac)); // rivals eat goal items too, so ask for under half
      return { text: lv.kind === 'boss' ? `Swallow the ${k.label.replace(/s$/, '')}` : `Swallow ${target} ${k.label}`, target, item, value: () => round.eaten[item] ?? 0 };
    }
    if (lv.kind === 'size') { const t = sizeFor(lv.frac); return { text: `Grow to size ${t}`, target: t, value: () => World.level(p.R).level }; }
    if (lv.kind === 'score') { const t = Math.max(100, Math.round((world.totalMass * 20 * lv.frac) / 50) * 50); return { text: `Score ${t} points`, target: t, value: () => p.score }; }
    if (lv.kind === 'clear') { const t = Math.round(lv.frac * 100); return { text: `Clear ${t}% of the town`, target: t, unit: '%', value: () => Math.floor((world.swallowed / world.total) * 100) }; }
    if (lv.kind === 'hunt') {
      const t = sizeFor(lv.frac);
      world.treasureR = TUNE.R0 * TUNE.levelStep ** (t - 1);
      return { text: `Find the treasure chest. It opens at size ${t}`, target: 1, value: () => (world.treasure?.alive ? 0 : 1) };
    }
    return null; // battle: decided when the clock runs out
  }

  function begin() {
    startBonus = 0;
    timeUpOffered = false;
    combo = 0; comboT = 0; abilCd = 0; lastLevel = World.level(world.player!.R).level;
    msgEl.hidden = true; popEl.hidden = true; clearScorePops();
    keys.clear(); stickState = null; stick.hidden = true;
    setScreen('');
    hud.hidden = false;
    state = 'play';
    world.paused = false;
    au.music('hole', 'play');
    sfx('whoosh');
    stopLoops();
    wind = au.loop('wind');
    if (world.map.plan.sea) waves = au.loop('waves');
    const ab = ABILITIES.find((a) => a.id === save.ability);
    abilEl.hidden = !ab;
    if (ab) abilEl.querySelector('span')!.textContent = ab.name;
    canvas.focus();
  }

  function startFree(mode: PlayMode) { save.mode = mode; prepare(null, false, mode); begin(); }

  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    world.paused = true;
    wind?.setLevel(0); waves?.setLevel(0);
    showPause();
  }
  function resume() {
    setScreen('');
    state = 'play';
    world.paused = false;
    canvas.focus();
  }

  function onTimeUp() {
    world.paused = true;
    if (timeUpOffered || (round.lv?.kind === 'battle')) return endRound();
    timeUpOffered = true;
    state = 'timeup';
    sfx('error', 0.8);
    setScreen(`
      <div class="hh-card cm-panel">
        <h1 class="cm-title">Time is up</h1>
        <p class="hh-help cm-help">Answer a question for 30 more seconds.</p>
        <div class="hh-actions">
          <button class="cm-btn main" data-a="more">+30 seconds ${key('Enter')}</button>
          <button class="cm-btn" data-a="finish">Finish ${key('Esc')}</button>
        </div>
      </div>`, true);
  }

  /** Every school-question bonus goes through here: the game is paused while the card is open. */
  async function ask(reward: string, epic = false) {
    const was = state, wasPaused = world.paused;
    state = 'card';
    world.paused = true;
    const r = await cm.earnBonus(epic ? { reward, size: 'epic' } : { reward });
    world.paused = wasPaused;
    state = was;
    if (r.earned) { bump('questions', 1); sfx('sparkle'); }
    return r.earned;
  }

  async function askMoreTime() {
    setScreen('');
    if (await ask('30 more seconds')) { world.timeLeft += 30; round.time += 30; pop('+30 seconds'); resume(); } else endRound();
  }

  function goalStars(): number {
    const lv = round.lv, g = round.goal, p = world.player!;
    if (!lv) return 0;
    if (lv.kind === 'battle') {
      const order = [...world.holes].sort((a, b) => b.mass - a.mass);
      if (order[0] !== p) return 0;
      const ratio = p.mass / Math.max(0.01, order[1]?.mass ?? 0.01);
      return ratio >= 1.8 ? 3 : ratio >= 1.3 ? 2 : 1;
    }
    if (!g) return 0;
    if (lv.kind === 'clear') return [0, CLEAR_STEP, CLEAR_STEP * 2].filter((s) => g.value() >= Math.min(97, g.target + s * 100)).length;
    if (g.value() < g.target) return 0;
    const used = 1 - world.timeLeft / round.time;
    return STAR_TIME.filter((t) => used <= t).length;
  }

  function endRound() {
    state = 'results';
    world.paused = true;
    hud.hidden = true; arrow.hidden = true;
    msgEl.hidden = true;
    stopLoops();
    const p = world.player!, lv = round.lv;
    const news: string[] = [];
    const starsBefore = totalStars(), openBefore = PLACES.filter((_, i) => placeOpen(i)).length;
    let head: string, extra = '', coins = scoreCoins(p.score), stars = 0;
    const bestKey = lv ? lv.id : `${save.map}-${round.mode}`;
    const best = save.best[bestKey] ?? 0, newBest = p.score > best;
    if (newBest) save.best[bestKey] = p.score;
    if (lv) {
      stars = goalStars();
      round.won = stars > 0;
      const first = !save.stars[lv.id];
      if (stars > 0) {
        coins += levelCoins(lv, stars, first);
        save.stars[lv.id] = Math.max(save.stars[lv.id] ?? 0, stars);
        if (round.crown && !save.crowns.includes(lv.id)) { save.crowns.push(lv.id); bump('crowns', 1); coins += 50 + lv.pi * 10; news.push('Crown won!'); }
      }
      head = stars > 0 ? `${mapName(lv.place)} ${lv.n} ${round.crown ? 'crowned' : 'complete'}` : 'Goal missed';
      extra = bigStars(stars) + `<p class="hh-help cm-help">${esc(round.goal?.text ?? 'Finish first')}</p>`;
    } else if (round.mode === 'solo') {
      const share = world.swallowed / world.total;
      stars = STAR_AT.filter((s) => share >= s).length;
      round.won = stars > 0;
      coins += stars * 15;
      head = `Map ${Math.floor(share * 100)}% clear`;
      extra = bigStars(stars);
    } else {
      const place = [...world.holes].sort((a, b) => b.mass - a.mass).indexOf(p);
      round.won = place === 0;
      coins += Math.round(PLACE_COINS[place] * (1 + save.rank * 0.1));
      head = `${ordinal(place)} place`;
      if (place === 0) { bump('wins', 1); if (save.rank < 20) { save.rank++; news.push(`Battle rank ${save.rank}: rivals get tougher`); } }
    }
    if (lv?.kind === 'battle' && round.won) bump('wins', 1);
    bump('eaten', p.count); bump('gobbled', round.gobbled); bump('bosses', round.bosses); bump('maxLevel', World.level(p.R).level, true);
    save.stats.stars = totalStars();
    // What this round opened: places, abilities, treasure-set skins, awards.
    PLACES.forEach((id, i) => { if (placeOpen(i) && !save.maps.includes(id)) save.maps.push(id); });
    const openNow = PLACES.filter((_, i) => placeOpen(i)).length;
    save.stats.places = Math.max(save.stats.places, openNow);
    if (openNow > openBefore) news.push(`New place: ${mapName(PLACES[openNow - 1])}`);
    for (const a of ABILITIES) if (starsBefore < a.stars && totalStars() >= a.stars) { news.push(`New ability: ${a.name}`); if (!save.ability) save.ability = a.id; }
    for (const id of PLACES) if (TREASURES[id].every((_, i) => save.treasures.includes(`${id}-${i}`)) && !save.skins.includes(`set-${id}`)) { save.skins.push(`set-${id}`); news.push(`Treasure set complete: ${SKINS.find((s) => s.id === `set-${id}`)!.name} skin`); }
    if (save.crowns.length >= PLACES.length * LEVELS_PER_PLACE && !save.skins.includes('crown')) { save.skins.push('crown'); news.push('Every crown won: Crowned skin'); }
    for (const a of AWARDS) if (!save.awards.includes(a.id) && save.stats[a.stat] >= a.goal) { save.awards.push(a.id); save.coins += a.coins; news.push(`Award: ${a.name} +${a.coins} coins`); }
    roundCoins = Math.round(coins * (1 + save.up.coins * 0.08));
    save.coins += roundCoins;
    void persist();
    au.music('hole', round.won ? 'win' : 'menu');
    sfx(round.won ? 'win' : 'lose');
    for (let i = 0; i < stars; i++) setTimeout(() => sfx('star', 1 + i * 0.15), 350 * (i + 1));
    if (news.length) setTimeout(() => sfx('unlock'), 1400);
    const nextLv = lv && round.won && lv.n < LEVELS_PER_PLACE ? lv.n + 1 : 0;
    setScreen(`
      <div class="hh-card cm-panel">
        <h1 class="cm-title">${head}</h1>
        ${extra}
        <div class="hh-stats">
          <span>Score</span><b>${p.score}</b>
          <span>${newBest ? 'New best' : 'Best'}</span><b>${Math.max(best, p.score)}</b>
          <span>Coins</span><b class="hh-got">+${roundCoins}</b>
        </div>
        ${news.length ? `<ul class="hh-news">${news.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <div class="hh-actions">
          ${nextLv ? `<button class="cm-btn main" data-a="next">Next level ${key('Enter')}</button><button class="cm-btn" data-a="again">Again</button>` : `<button class="cm-btn main" data-a="again">Play again ${key('Enter')}</button>`}
          <button class="cm-btn" data-a="double">Double coins ${key('D')}</button>
          <button class="cm-btn" data-a="triple">Triple coins: big question ${key('T')}</button>
          <button class="cm-btn" data-a="menu">${lv ? 'Levels' : 'Menu'} ${key('Esc')}</button>
        </div>
      </div>`, true);
  }

  /** Question bonus on the results card: a normal question doubles the coins, a big (epic) one triples them. */
  async function multiplyCoins(btn: HTMLButtonElement, times: 2 | 3) {
    const ok = await ask(`${times === 3 ? 'Triple' : 'Double'} your coins: +${roundCoins * (times - 1)}`, times === 3);
    if (ok) {
      save.coins += roundCoins * (times - 1);
      void persist();
      sfx('coin');
      $('.hh-got').textContent = `+${roundCoins * times}`;
      for (const a of ['double', 'triple']) { const b = $<HTMLButtonElement>(`[data-a="${a}"]`); b.disabled = true; }
      btn.textContent = times === 3 ? 'Coins tripled' : 'Coins doubled';
      ($('.hh-actions .main') as HTMLButtonElement).focus();
    } else btn.focus();
  }

  async function startBoost(epic: boolean) {
    if (await ask(epic ? 'Titan start: begin the next round at full size' : 'Start the next round bigger', epic)) startBonus = epic ? TUNE.giantStart : TUNE.bigStart;
    showHome();
  }

  // ---------- screens ----------
  function setScreen(html: string, dim = false) {
    screen.innerHTML = html;
    screen.classList.toggle('dim', dim);
    (screen.querySelector('.main') as HTMLElement | null)?.focus();
  }
  const focus = (sel?: string) => { if (sel) (screen.querySelector(sel) as HTMLElement | null)?.focus(); };
  const head = (t: string) => `<div class="hh-head"><h1 class="cm-title">${t}</h1><span class="hh-coins">${save.coins} coins &nbsp; ${totalStars()} ★</span></div>`;
  const backBtn = `<button class="cm-btn main" data-a="back">Back ${key('Esc')}</button>`;

  function showHome(focusSel?: string) {
    state = 'menu';
    back = () => showHome();
    hud.hidden = true; arrow.hidden = true;
    if (world.mode !== 'attract') attract();
    const pi = Math.max(0, PLACES.map((_, i) => placeOpen(i)).lastIndexOf(true));
    const boost = startBonus ? `<button class="cm-btn" disabled>${startBonus >= TUNE.giantStart ? 'Titan' : 'Big'} start ready</button>` :
      `<button class="cm-btn" data-a="big">Bigger start ${key('B')}</button><button class="cm-btn" data-a="giant">Titan start: big question ${key('G')}</button>`;
    setScreen(`
      <div class="hh-card cm-panel">
        ${head('Riftmaw')}
        <p class="hh-help cm-help">Rank: ${title()}. Start small. Grow. Swallow everything.</p>
        <button class="cm-btn main hh-play" data-a="adv">Campaign<small>${mapName(PLACES[pi])}: ${placeStars(pi)} of ${LEVELS_PER_PLACE * 3} stars</small></button>
        <div class="hh-grid two">
          <button class="cm-btn hh-tile" data-a="battle">Battle<small>Rank ${save.rank}: beat 3 rivals</small></button>
          <button class="cm-btn hh-tile" data-a="solo">Clear map<small>Leave nothing standing</small></button>
        </div>
        <div class="hh-row4">
          <button class="cm-btn" data-a="ups">Upgrades ${key('U')}</button>
          <button class="cm-btn" data-a="skins">Skins ${key('K')}</button>
          <button class="cm-btn" data-a="album">Treasures</button>
          <button class="cm-btn" data-a="awards">Awards</button>
        </div>
        <div class="hh-actions">${boost}</div>
      </div>`);
    focus(focusSel);
  }

  let advPlace = 0;
  function showAdventure(pi = advPlace, focusSel?: string) {
    state = 'menu';
    back = () => showHome('[data-a="adv"]');
    advPlace = pi = Math.max(0, Math.min(PLACES.length - 1, pi));
    hud.hidden = true; arrow.hidden = true;
    if (save.map !== PLACES[pi] && placeOpen(pi)) { save.map = PLACES[pi]; attract(); } else if (world.mode !== 'attract') attract();
    const open = placeOpen(pi), bossDone = !!save.stars[`${PLACES[pi]}-${LEVELS_PER_PLACE}`];
    const tiles = Array.from({ length: LEVELS_PER_PLACE }, (_, i) => {
      const n = i + 1, lv = levelDef(pi, n), ok = levelOpen(pi, n), st = save.stars[lv.id] ?? 0;
      const tag = lv.kind === 'boss' ? 'Boss' : lv.kind === 'battle' ? 'Battle' : lv.kind === 'hunt' ? 'Hunt' : '';
      return `<button class="cm-btn hh-lv ${lv.kind}" data-lv="${n}" ${ok ? '' : 'disabled'}><b>${n}</b>${tag ? `<em>${tag}</em>` : ''}${starRow(st)}${save.crowns.includes(lv.id) ? '<u>crown</u>' : ''}</button>`;
    }).join('');
    const need = pi > 0 && !open ? `Beat the ${mapName(PLACES[pi - 1])} boss and earn ${starsToOpen(pi)} stars to open this place. You have ${totalStars()}.` :
      bossDone ? 'Boss beaten. Every level here now has a crown run: the same goal with less time.' : `${placeStars(pi)} of ${LEVELS_PER_PLACE * 3} stars. Level 20 is the boss.`;
    setScreen(`
      <div class="hh-card wide cm-panel">
        ${head(`${pi + 1}. ${mapName(PLACES[pi])}`)}
        <p class="hh-help cm-help">${need}</p>
        <div class="hh-levels">${tiles}</div>
        <div class="hh-actions">
          <button class="cm-btn" data-a="prev" ${pi === 0 ? 'disabled' : ''}>Previous place ${key('[')}</button>
          <button class="cm-btn main" data-a="back">Back ${key('Esc')}</button>
          <button class="cm-btn" data-a="nextp" ${pi === PLACES.length - 1 ? 'disabled' : ''}>Next place ${key(']')}</button>
        </div>
      </div>`, true);
    focus(focusSel ?? `[data-lv="${Math.min(LEVELS_PER_PLACE, 1 + Array.from({ length: LEVELS_PER_PLACE }, (_, i) => save.stars[`${PLACES[pi]}-${i + 1}`]).filter(Boolean).length)}"]:not(:disabled)`);
  }

  function showBrief(pi: number, n: number, crown = false) {
    const lv = levelDef(pi, n, crown);
    world.setQuality(quality());
    prepare(lv, crown, 'level');
    world.snapCamera();
    state = 'brief';
    back = () => showAdventure(pi, `[data-lv="${n}"]`);
    const notes = [
      lv.slip ? 'Icy ground: you slide.' : '', lv.thorns ? 'Thornballs shrink you. Steer around them.' : '', lv.kind !== 'battle' && lv.bots ? 'Rival rifts hunt the same targets.' : '',
      lv.pows.includes('rush') ? 'Overdrive crystals give double growth.' : '', lv.treasure && lv.kind !== 'hunt' && world.treasure ? 'A treasure chest is hidden here.' : '',
      lv.kind === 'battle' ? 'Be the biggest rift when time runs out.' : lv.kind === 'clear' ? 'More cleared means more stars.' : 'Finish fast for more stars.',
    ].filter(Boolean);
    const canCrown = !crown && !!save.stars[lv.id] && !!save.stars[`${lv.place}-${LEVELS_PER_PLACE}`] && !save.crowns.includes(lv.id);
    setScreen(`
      <div class="hh-card cm-panel">
        <div class="hh-head"><h1 class="cm-title">${mapName(lv.place)} ${n}${crown ? ': crown run' : ''}</h1>${starRow(save.stars[lv.id] ?? 0)}</div>
        <p class="hh-goal">${esc(round.goal?.text ?? 'Battle: finish in first place')}</p>
        <p class="hh-help cm-help">${fmtTime(round.time)} on the clock. ${notes.join(' ')}</p>
        <div class="hh-actions">
          <button class="cm-btn main" data-a="go">Play ${key('Enter')}</button>
          ${canCrown ? `<button class="cm-btn" data-a="crown">Crown run</button>` : ''}
          <button class="cm-btn" data-a="back">Back ${key('Esc')}</button>
        </div>
      </div>`);
  }

  function showFree(mode: PlayMode, focusSel?: string) {
    state = 'menu';
    save.mode = mode;
    back = () => showHome(`[data-a="${mode}"]`);
    const tile = (id: MapId, pi: number) => {
      const owned = save.maps.includes(id), price = placePrice(pi), b = save.best[`${id}-${mode}`];
      const sub = owned ? (b ? `Best ${b}` : '&nbsp;') : `Open ${price}`;
      return `<button class="cm-btn hh-tile" data-map="${id}" aria-pressed="${save.map === id}">${mapName(id)}<small class="${!owned && save.coins < price ? 'short' : ''}">${sub}</small></button>`;
    };
    setScreen(`
      <div class="hh-card cm-panel">
        ${head(mode === 'battle' ? `Battle: rank ${save.rank}` : 'Clear map')}
        <p class="hh-help cm-help">${mode === 'battle' ? 'Two minutes against three rival rifts. Each win raises your rank and theirs.' : 'Swallow the whole town before time runs out.'} Places open in the Campaign, or early with coins.</p>
        <div class="hh-grid">${PLACES.map(tile).join('')}</div>
        <div class="hh-actions"><button class="cm-btn main hh-play" data-a="play">Play ${key('Enter')}</button><button class="cm-btn" data-a="back">Back ${key('Esc')}</button></div>
      </div>`, true);
    focus(focusSel);
  }

  function showUpgrades(focusKey?: string) {
    back = () => showHome('[data-a="ups"]');
    const abil = ABILITIES.map((a) => {
      const ok = abilityOpen(a);
      return `<button class="cm-btn hh-up" data-abil="${a.id}" aria-pressed="${save.ability === a.id}" ${ok ? '' : 'disabled'}><span>${a.name}<small>${ok ? a.help : `Opens at ${a.stars} stars`}</small></span><span class="p">${save.ability === a.id ? 'Worn' : ok ? 'Wear' : ''}</span></button>`;
    }).join('');
    setScreen(`
      <div class="hh-card wide cm-panel">
        ${head('Upgrades')}
        <div class="hh-cols"><div class="hh-group">${UPGRADES.map((u) => {
          const lv = save.up[u.key], price = upPrice(u, lv), max = lv >= u.max;
          return `<button class="cm-btn hh-up" data-up="${u.key}" ${max ? 'disabled' : ''}>
            <span>${u.name}<small>${u.help}</small></span>
            <span class="lv">${lv}/${u.max}</span>
            <span class="p" style="${!max && save.coins < price ? 'color:var(--cm-bad)' : ''}">${max ? 'Max' : price}</span></button>`;
        }).join('')}</div>
        <div class="hh-group"><span class="cm-label">Ability ${key('E')} in play</span>${abil}</div></div>
        ${backBtn}
      </div>`, true);
    focus(focusKey);
  }

  function showSkins(focusId?: string) {
    back = () => showHome('[data-a="skins"]');
    const grad = (c: number[]) => `conic-gradient(${c.map(hex).join(',')},${hex(c[0])})`;
    setScreen(`
      <div class="hh-card wide cm-panel">
        ${head('Skins')}
        <div class="hh-grid four">${SKINS.map((s) => {
          const owned = save.skins.includes(s.id);
          const sub = save.skin === s.id ? 'Worn' : owned ? 'Wear' : s.price < 0 ? (s.id === 'crown' ? 'All crowns' : `${mapName(s.id.slice(4) as MapId)} set`) : `${s.price}`;
          return `<button class="cm-btn hh-tile" data-skin="${s.id}" aria-pressed="${save.skin === s.id}"><span class="hh-swatch" style="--g:${grad(s.colors)}"></span>${s.name}<small class="${!owned && (s.price < 0 || save.coins < s.price) ? 'short' : ''}">${sub}</small></button>`;
        }).join('')}</div>
        ${backBtn}
      </div>`, true);
    focus(focusId && `[data-skin="${focusId}"]`);
  }

  function showAlbum() {
    back = () => showHome('[data-a="album"]');
    setScreen(`
      <div class="hh-card wide cm-panel">
        ${head(`Treasures ${save.treasures.length} of ${PLACES.length * 10}`)}
        <p class="hh-help cm-help">One chest hides in each treasure level. Find all 10 in a place to win its skin.</p>
        <div class="hh-album">${PLACES.map((id) => `<div><span class="cm-label">${mapName(id)}</span>${TREASURES[id].map((t, i) => `<i class="${save.treasures.includes(`${id}-${i}`) ? 'on' : ''}">${save.treasures.includes(`${id}-${i}`) ? esc(t) : '?'}</i>`).join('')}</div>`).join('')}</div>
        ${backBtn}
      </div>`, true);
  }

  function showAwards() {
    back = () => showHome('[data-a="awards"]');
    setScreen(`
      <div class="hh-card wide cm-panel">
        ${head(`Awards ${save.awards.length} of ${AWARDS.length}`)}
        <div class="hh-album awards">${AWARDS.map((a) => `<i class="${save.awards.includes(a.id) ? 'on' : ''}"><b>${a.name}</b> ${a.text} <em>${Math.min(a.goal, save.stats[a.stat]).toLocaleString('en-US')} / ${a.goal.toLocaleString('en-US')} &middot; ${a.coins} coins</em></i>`).join('')}</div>
        ${backBtn}
      </div>`, true);
  }

  function showPause() {
    const q = save.quality === 'auto' ? `Auto (${quality() === 'high' ? 'High' : 'Low'})` : save.quality === 'high' ? 'High' : 'Low';
    setScreen(`
      <div class="hh-card cm-panel">
        <h1 class="cm-title">Paused</h1>
        ${round.goal ? `<p class="hh-goal">${esc(round.goal.text)}</p>` : ''}
        <div class="hh-actions">
          <button class="cm-btn main" data-a="resume">Resume ${key('P')}</button>
          <button class="cm-btn" data-a="quality">Graphics: ${q} ${key('G')}</button>
          <button class="cm-btn" data-a="quit">Quit round ${key('Q')}</button>
        </div>
      </div>`, true);
  }

  // ---------- menu actions ----------
  const buy = (price: number) => { if (save.coins < price) { sfx('error'); return false; } save.coins -= price; sfx('buy'); return true; };
  const pickMap = (id: MapId) => {
    if (!save.maps.includes(id)) { if (!buy(placePrice(PLACES.indexOf(id)))) return; save.maps.push(id); } else sfx('select');
    if (save.map !== id) { save.map = id; attract(); }
    void persist();
    showFree(save.mode, `[data-map="${id}"]`);
  };
  const buyUp = (k: UpKey) => {
    const u = UPGRADES.find((x) => x.key === k)!, lv = save.up[k];
    if (lv >= u.max || !buy(upPrice(u, lv))) return;
    save.up[k] = lv + 1;
    void persist();
    showUpgrades(`[data-up="${k}"]`);
  };
  const pickSkin = (id: string) => {
    const s = SKINS.find((x) => x.id === id)!;
    if (!save.skins.includes(id)) { if (s.price < 0) return void sfx('error'); if (!buy(s.price)) return; save.skins.push(id); } else sfx(id === 'kitty' || id === 'set-cat' ? 'purr' : 'select');
    save.skin = id;
    void persist();
    showSkins(id);
  };
  const quit = () => { stopLoops(); if (round.lv) showAdventure(round.lv.pi, `[data-lv="${round.lv.n}"]`); else showHome(); };

  screen.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const a = b.dataset.a, d = b.dataset;
    if (d.map) return pickMap(d.map as MapId);
    if (d.up) return buyUp(d.up as UpKey);
    if (d.skin) return pickSkin(d.skin);
    if (d.abil) { save.ability = d.abil as Ability; void persist(); sfx('select'); return showUpgrades(`[data-abil="${d.abil}"]`); }
    if (d.lv) { sfx('select'); return showBrief(advPlace, +d.lv); }
    if (a === 'back') { sfx('back'); return back(); }
    if (a !== 'resume' && a !== 'more' && a !== 'double' && a !== 'triple') sfx('tap');
    if (a === 'adv') return showAdventure(Math.max(0, PLACES.map((_, i) => placeOpen(i)).lastIndexOf(true)));
    if (a === 'battle' || a === 'solo') return showFree(a);
    if (a === 'play') return save.maps.includes(save.map) ? startFree(save.mode) : void sfx('error');
    if (a === 'go') return begin();
    if (a === 'crown') return showBrief(round.lv!.pi, round.lv!.n, true);
    if (a === 'prev') return showAdventure(advPlace - 1, '[data-a="prev"]');
    if (a === 'nextp') return showAdventure(advPlace + 1, '[data-a="nextp"]');
    if (a === 'again') { if (round.lv) { showBrief(round.lv.pi, round.lv.n, round.crown); return begin(); } return startFree(round.mode as PlayMode); }
    if (a === 'next') return showBrief(round.lv!.pi, round.lv!.n + 1);
    if (a === 'big') return void startBoost(false);
    if (a === 'giant') return void startBoost(true);
    if (a === 'ups') return showUpgrades();
    if (a === 'skins') return showSkins();
    if (a === 'album') return showAlbum();
    if (a === 'awards') return showAwards();
    if (a === 'resume') return resume();
    if (a === 'quality') {
      save.quality = save.quality === 'auto' ? 'high' : save.quality === 'high' ? 'low' : 'auto';
      void persist();
      world.setQuality(quality());
      showPause();
      return focus('[data-a="quality"]');
    }
    if (a === 'quit' || a === 'menu') return quit();
    if (a === 'more') return void askMoreTime();
    if (a === 'finish') return endRound();
    if (a === 'double') return void multiplyCoins(b, 2);
    if (a === 'triple') return void multiplyCoins(b, 3);
  });

  // ---------- input ----------
  const keys = new Set<string>();
  let boostTap = false, abilTap = false;
  let lastInput: 'keys' | 'pointer' = 'keys';
  let mouse: { x: number; y: number } | null = null;
  let stickState: { id: number; ox: number; oy: number; x: number; y: number } | null = null;

  /** Arrow keys move focus to the nearest button in that direction. */
  const moveFocus = (dx: number, dy: number) => {
    const list = [...screen.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const cur = document.activeElement as HTMLElement;
    if (!list.includes(cur as HTMLButtonElement)) return list[0]?.focus();
    const a = cur.getBoundingClientRect();
    let best: HTMLElement | null = null, bs = Infinity;
    for (const b of list) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect();
      const vx = r.left + r.width / 2 - (a.left + a.width / 2), vy = r.top + r.height / 2 - (a.top + a.height / 2);
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const score = along + Math.abs(vx * dy + vy * dx) * 2.5;
      if (score < bs) { bs = score; best = b; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  };

  const click = (sel: string) => (screen.querySelector(sel) as HTMLButtonElement | null)?.click();
  // Menu hotkeys: key -> the button it presses, when that button is on screen.
  const HOT: Record<string, string> = { u: 'ups', k: 'skins', b: 'big', g: 'giant', d: 'double', t: 'triple', q: 'quit', '[': 'prev', ']': 'nextp', p: 'resume' };

  addEventListener('keydown', (e) => {
    const k = e.key;
    lastInput = 'keys';
    if (state === 'play') {
      if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); return pause(); }
      if (k === ' ') { e.preventDefault(); boostTap = true; return; }
      if (k === 'e' || k === 'E' || k === 'Shift') { abilTap = true; return; }
      keys.add(k.length === 1 ? k.toLowerCase() : k);
      if (k.startsWith('Arrow')) e.preventDefault();
      return;
    }
    if (state === 'card') return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k]) { e.preventDefault(); return moveFocus(...arrows[k]); }
    const kk = k.toLowerCase();
    if (k === 'Escape') {
      e.preventDefault();
      if (state === 'pause') return resume();
      if (state === 'timeup') return endRound();
      if (state === 'results') return click('[data-a="menu"]');
      sfx('back');
      return back();
    }
    if (state === 'pause' && kk === 'g') return click('[data-a="quality"]');
    if (HOT[kk]) { e.preventDefault(); return click(`[data-a="${HOT[kk]}"]`); } // hotkeys must not also type into the question card
    if (k === 'Enter' && !(document.activeElement instanceof HTMLButtonElement && screen.contains(document.activeElement))) return click('.main');
  });
  addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'play') return;
    if (e.pointerType === 'mouse') { mouse = { x: e.clientX, y: e.clientY }; lastInput = 'pointer'; return; }
    if (stickState) return;
    stickState = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    stick.style.left = `${e.clientX}px`; stick.style.top = `${e.clientY}px`;
    stick.hidden = false;
    lastInput = 'pointer';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouse = { x: e.clientX, y: e.clientY }; lastInput = 'pointer'; return; }
    if (stickState && e.pointerId === stickState.id) { stickState.x = e.clientX; stickState.y = e.clientY; }
  });
  const endStick = (e: PointerEvent) => { if (stickState && e.pointerId === stickState.id) { stickState = null; stick.hidden = true; } };
  canvas.addEventListener('pointerup', endStick);
  canvas.addEventListener('pointercancel', endStick);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse = null; });
  $('.hh-pause').addEventListener('click', pause);
  boostEl.addEventListener('pointerdown', (e) => { e.preventDefault(); boostTap = true; });
  abilEl.addEventListener('pointerdown', (e) => { e.preventDefault(); abilTap = true; });

  function readInput() {
    let x = 0, z = 0;
    const on = (...ks: string[]) => ks.some((k) => keys.has(k));
    if (keys.size) {
      x = (on('ArrowRight', 'd') ? 1 : 0) - (on('ArrowLeft', 'a') ? 1 : 0);
      z = (on('ArrowDown', 's') ? 1 : 0) - (on('ArrowUp', 'w') ? 1 : 0);
    } else if (stickState) {
      const dx = stickState.x - stickState.ox, dy = stickState.y - stickState.oy, d = Math.hypot(dx, dy);
      if (d > 8) { const m = Math.min(1, d / 50); x = (dx / d) * m; z = (dy / d) * m; }
      const kx = Math.min(d, 48) / (d || 1);
      ($('.hh-stick i') as HTMLElement).style.transform = `translate(${dx * kx}px, ${dy * kx}px)`;
    } else if (mouse && lastInput === 'pointer' && world.player) {
      // Trackpad: the hole follows the pointer. Rest the pointer on the hole to stop.
      const p = world.toScreen(world.player.x, 0, world.player.z, root.clientWidth, root.clientHeight);
      const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
      if (d > 16) { const m = Math.min(1, (d - 16) / 110); x = (dx / d) * m; z = (dy / d) * m; }
    }
    const d = Math.hypot(x, z);
    if (d > 1) { x /= d; z /= d; }
    world.input.x = x; world.input.z = z;
    world.input.boost = boostTap;
    boostTap = false;
    if (abilTap && save.ability && abilCd <= 0 && world.player?.alive) {
      world.ability(save.ability);
      abilCd = TUNE.abilityCd;
      pop(ABILITIES.find((a) => a.id === save.ability)!.name);
      sfx(save.ability === 'gulp' ? 'whoosh' : save.ability === 'giant' ? 'grow' : 'sparkle', 0.8);
    }
    abilTap = false;
  }

  // ---------- HUD ----------
  const tagEls = new Map<Hole, HTMLDivElement>();
  let hudT = 0;
  function drawTags() {
    const w = root.clientWidth, h = root.clientHeight;
    const live = new Set(world.holes);
    for (const [hole, el] of tagEls) if (!live.has(hole)) { el.remove(); tagEls.delete(hole); }
    const inRound = state === 'play' || state === 'pause' || state === 'card' || state === 'timeup';
    for (const hole of world.holes) {
      let el = tagEls.get(hole);
      if (!el) {
        el = document.createElement('div');
        el.className = 'hh-tag';
        el.textContent = hole.name;
        el.style.setProperty('--c', hex(hole.color));
        tags.append(el);
        tagEls.set(hole, el);
      }
      const show = hole.alive && inRound;
      el.hidden = !show;
      if (!show) continue;
      // Below the near rim, so the tag never hides the hole's ornaments.
      const p = world.toScreen(hole.x, 0, hole.z + hole.R * 1.2, w, h);
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + 6)}px) translateX(-50%)`;
    }
    // Pointer to the goal: the treasure chest, or the boss landmark.
    const g = round.goal, t = world.treasure?.alive ? world.treasure : round.lv?.kind === 'boss' && g?.item ? world.find(g.item) : null;
    arrow.hidden = !(inRound && t);
    if (inRound && t) {
      const p = world.toScreen(t.x, 1, t.z, w, h), m = 46;
      const on = !p.behind && p.x > m && p.x < w - m && p.y > m && p.y < h - m;
      const cx = w / 2, cy = h / 2, dx = (p.behind ? -1 : 1) * (p.x - cx), dy = (p.behind ? -1 : 1) * (p.y - cy), s = Math.min((cx - m) / Math.abs(dx || 1), (cy - m) / Math.abs(dy || 1), 1);
      arrow.style.transform = `translate(${cx + dx * s}px, ${cy + dy * s}px) rotate(${Math.atan2(dy, dx)}rad)`;
      arrow.classList.toggle('on', on);
    }
  }

  function drawHud(dt: number) {
    const p = world.player;
    if (!p) return;
    popT -= dt;
    if (popT <= 0) popEl.hidden = true;
    drawScorePops(dt, p);
    comboT -= dt;
    if (comboT <= 0) combo = 0;
    abilCd = Math.max(0, abilCd - dt);
    if (p.alive) msgEl.hidden = true;
    const lv = World.level(p.R);
    if (lv.level > lastLevel) { lastLevel = lv.level; pop(`Size ${lv.level}: ${sizeName(lv.level)}`); sfx('levelUp', 0.8 + lv.level * 0.03); }
    const sp = Math.hypot(p.vx, p.vz) / (world.holeSpeed(p) || 1);
    wind?.setLevel(p.alive ? sp * 0.35 + (p.boostT > 0 ? 0.3 : 0) : 0);
    wind?.setPitch(0.8 + p.R * 0.03 + (p.boostT > 0 ? 0.4 : 0));
    waves?.setLevel(Math.max(0, Math.min(0.5, 0.5 - (p.z + world.half * 0.56) / 50)));
    au.music('hole', world.timeLeft <= 20 ? 'intense' : 'play');
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.1;
    timerEl.querySelector('b')!.textContent = fmtTime(world.timeLeft);
    timerEl.classList.toggle('low', world.timeLeft <= 10);
    sizeEl.textContent = `Size ${lv.level}`;
    barEl.style.width = `${Math.round(lv.frac * 100)}%`;
    const g = round.goal;
    if (g) {
      const v = Math.min(g.target, g.value());
      boardEl.className = 'hh-board cm-panel hh-goalbox';
      boardEl.innerHTML = `<span class="cm-label">Goal</span><b>${esc(g.text)}</b><div class="hh-bar"><i style="width:${Math.round((v / g.target) * 100)}%"></i></div><small>${v}${g.unit ?? ''} / ${g.target}${g.unit ?? ''}</small>`;
    } else if (round.mode === 'solo') {
      boardEl.className = 'hh-board cm-panel hh-pct';
      boardEl.innerHTML = `<span class="cm-label">Cleared</span><b>${Math.floor((world.swallowed / world.total) * 100)}%</b>`;
    } else {
      boardEl.className = 'hh-board cm-panel';
      boardEl.innerHTML = [...world.holes].sort((a, b) => b.mass - a.mass).map((h) =>
        `<div class="hh-row ${h.player ? 'me' : ''}"><span class="cm-dot" style="--sw:${hex(h.color)}"></span><span class="n">${esc(h.name)}</span><span class="v">${World.level(h.R).level}</span></div>`).join('');
    }
    boostEl.dataset.cd = p.boostCd > 0 && p.boostT <= 0 ? '1' : '0';
    abilEl.dataset.cd = abilCd > 0 ? '1' : '0';
    const fx: string[] = [];
    if (p.magnetT > 0) fx.push(`Magnet ${Math.ceil(p.magnetT)}`);
    if (p.speedT > 0) fx.push(`Speed ${Math.ceil(p.speedT)}`);
    if (p.rushT > 0) fx.push(`Overdrive ${Math.ceil(p.rushT)}`);
    if (p.giantT > 0) fx.push(`Colossus ${Math.ceil(p.giantT)}`);
    if (world.freezeT > 0) fx.push(`Stasis ${Math.ceil(world.freezeT)}`);
    if (p.shieldT > 0) fx.push('Warded');
    fxEl.innerHTML = fx.map((f) => `<span>${f}</span>`).join('');
  }

  // ---------- main loop ----------
  let last = performance.now(), slowT = 0, frames = 0;
  const frame = (now: number) => {
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
    last = now;
    if (state === 'play') {
      // Auto quality: if High cannot hold about 30 frames a second, drop to Low for this session.
      if (save.quality === 'auto' && !slowDrop && world.quality === 'high' && ++frames > 30) { slowT += raw; if (frames >= 150) { if (slowT / 120 > 0.034) { slowDrop = true; world.setQuality('low'); } frames = 30; slowT = 0; } }
      readInput();
      world.update(dt);
      drawHud(dt);
      const lv = round.lv, g = round.goal;
      if (g && lv && lv.kind !== 'clear' && g.value() >= g.target) endRound();
      else if (world.timeLeft <= 0) onTimeUp();
      else if ((round.mode === 'solo' || lv?.kind === 'clear') && world.swallowed >= world.total) endRound();
    } else if (state === 'menu') {
      world.update(dt);
    }
    drawTags();
    root.classList.toggle('boost', state === 'play' && !!world.player?.alive && (world.player.boostT > 0 || world.player.speedT > 0));
    world.render(dt);
    requestAnimationFrame(frame);
  };

  attract();
  showHome();
  requestAnimationFrame(frame);

  // Dev-server test hook for the screenshot and balance harness (shots/hole); absent from the built game.
  if (import.meta.env.DEV) {
    (window as unknown as { __hole: unknown }).__hole = {
      world, save, clearScorePops, startFree, endRound, onTimeUp, showBrief, begin, showAdventure, showHome, showUpgrades, showSkins, showAlbum, showAwards, showFree, radiusFor, massFor, levelDef,
      state: () => state, round: () => round, goalStars,
    };
  }
}
