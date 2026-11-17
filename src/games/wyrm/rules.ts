// Run scoring and progress: what a run counts, how many stars it earns, and what it pays. Pure logic, shared by the
// game and the balance test so both use the same numbers.
import {
  T, SKINS, ARENAS, AWARDS, STAGES, POTIONS, coinsFor, xpFor, levelOf, lengthScore, totalStars, perksOf, bossMass,
  STAR_COINS, BOSS_COINS,
  type SaveData, type Stage, type ArenaId, type Skin, type Award, type Arena, type PotionKind,
} from './data';
import type { Sim, SimEvent } from './sim';

export interface RunResult {
  arena: ArenaId;
  stage: Stage | null;
  length: number; // best length in the run
  pops: number;
  sprites: number;
  gems: number;
  potions: number;
  roars: number;
  crown: number; // seconds in the top 3
  time: number;
  bossBeaten: boolean;
  revived: boolean;
}

/** Configure the sim for a place, goal, and wyrm level. */
export function setupRun(sim: Sim, arena: Arena, stage: Stage | null, level: number) {
  const chapter = ARENAS.indexOf(arena);
  const kinds = (Object.keys(POTIONS) as PotionKind[]).filter((k) => POTIONS[k].level <= level);
  const bossSkin = SKINS.find((s) => s.id === arena.boss.skin)!;
  sim.setup(arena, chapter, kinds, stage?.kind === 'boss' ? { name: arena.boss.name, look: bossSkin, mass: bossMass(chapter) } : null);
}
/** Apply the wyrm's level perks to the player after sim.reset. */
export function applyPerks(sim: Sim, level: number) {
  const p = perksOf(level), w = sim.player;
  w.evo = p.evo; w.roarMax = p.roarCd; w.boostCost = p.boostCost; w.pull = p.pull;
}

export class RunTracker {
  r: RunResult;
  constructor(arena: ArenaId, public stage: Stage | null) {
    this.r = { arena, stage, length: 0, pops: 0, sprites: 0, gems: 0, potions: 0, roars: 0, crown: 0, time: 0, bossBeaten: false, revived: false };
  }
  event(e: SimEvent, sim: Sim) {
    const p = sim.player, r = this.r;
    if (e.t === 'eat' && e.wyrm === p) r.gems += e.n;
    else if (e.t === 'sprite' && e.wyrm === p) r.sprites++;
    else if (e.t === 'potion' && e.wyrm === p) r.potions++;
    else if (e.t === 'roar' && e.wyrm === p) r.roars++;
    else if (e.t === 'down') {
      if (e.by === p && e.wyrm !== p) r.pops++;
      if (e.wyrm.isBoss) r.bossBeaten = true;
    }
  }
  tick(sim: Sim, dt: number) {
    const p = sim.player, r = this.r;
    r.time += dt;
    r.length = Math.max(r.length, lengthScore(p.bestMass));
    if (p.alive && sim.wyrms.filter((w) => w.alive && w !== p && !w.isBoss && w.mass > p.mass).length < 3) r.crown += dt;
  }
  /** Current number for the goal (length, pops, seconds...). */
  value(): number {
    const r = this.r;
    switch (this.stage?.kind) {
      case 'pops': return r.pops;
      case 'sprites': return r.sprites;
      case 'crown': return Math.floor(r.crown);
      case 'boss': return r.bossBeaten ? (r.revived ? 2 : 3) : 0;
      default: return r.length;
    }
  }
  stars(): number {
    const st = this.stage;
    if (!st) return 0;
    const v = this.value();
    return st.tiers.filter((t) => v >= t).length;
  }
  timeLeft(): number { return this.stage?.kind === 'rush' ? Math.max(0, T.rushSecs - this.r.time) : Infinity; }
}

export interface Settled {
  coins: number; // run coins (the part a "Coins x2" bonus repeats)
  extraCoins: number; // star, boss, and award coins
  stars: number;
  newStars: number;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  newSkins: Skin[];
  newAwards: Award[];
  newBest: boolean;
  opened: Arena | null;
  bossFirst: boolean;
}

export function skinEarned(s: Skin, save: SaveData, run: RunResult | null): boolean {
  const u = s.unlock;
  if (!u) return true;
  switch (u.by) {
    case 'coins': return false;
    case 'length': return !!run && run.length >= u.value;
    case 'pops': return !!run && run.pops >= u.value;
    case 'boss': return (save.stars[`${u.arena}-8`] ?? 0) > 0;
    case 'level': return levelOf(save.xp).level >= u.value;
    case 'stars': return totalStars(save) >= u.value;
    case 'award': return save.awards.includes(u.id);
  }
}
export function unlockText(s: Skin): string {
  const u = s.unlock;
  if (!u) return '';
  switch (u.by) {
    case 'coins': return `${u.cost} coins`;
    case 'length': return `Reach length ${u.value} in one run`;
    case 'pops': return `Take down ${u.value} wyrms in one run`;
    case 'boss': return `Beat ${ARENAS.find((a) => a.id === u.arena)!.boss.name}`;
    case 'level': return `Reach wyrm level ${u.value}`;
    case 'stars': return `Earn ${u.value} stars`;
    case 'award': return AWARDS.find((a) => a.id === u.id)!.text;
  }
}

/** Bank a finished run into the save. Everything is a fixed formula. */
export function settle(save: SaveData, run: RunResult, stars: number): Settled {
  const st = run.stage;
  const levelBefore = levelOf(save.xp).level;
  const prev = st ? save.stars[st.id] ?? 0 : 0;
  const newStars = Math.max(0, stars - prev);
  const bossFirst = !!st && st.kind === 'boss' && prev === 0 && stars > 0;
  if (st && stars > prev) save.stars[st.id] = stars;
  let newBest = false;
  if (!st && run.length > (save.best[run.arena] ?? 0)) { save.best[run.arena] = run.length; newBest = true; }
  if (!save.played.includes(run.arena)) save.played.push(run.arena);
  const s = save.stats;
  s.gems += run.gems; s.pops += run.pops; s.length += run.length; s.sprites += run.sprites; s.potions += run.potions; s.roars += run.roars;
  s.bestRun = Math.max(s.bestRun, run.length);
  s.places = save.played.length;
  s.stars = totalStars(save);
  s.bosses = STAGES.filter((x) => x.kind === 'boss' && (save.stars[x.id] ?? 0) > 0).length;
  const coins = coinsFor(run.length, run.pops);
  let extraCoins = newStars * STAR_COINS + (bossFirst ? BOSS_COINS : 0);
  const xp = xpFor(run.length, run.pops, newStars);
  save.xp += xp;
  const newAwards = AWARDS.filter((a) => !save.awards.includes(a.id) && s[a.stat] >= a.value);
  for (const a of newAwards) { save.awards.push(a.id); extraCoins += a.coins; }
  save.coins += coins + extraCoins;
  const newSkins = SKINS.filter((k) => !save.owned.includes(k.id) && skinEarned(k, save, run));
  for (const k of newSkins) save.owned.push(k.id);
  const opened = bossFirst && st!.chapter + 1 < ARENAS.length ? ARENAS[st!.chapter + 1] : null;
  return { coins, extraCoins, stars, newStars, xp, levelBefore, levelAfter: levelOf(save.xp).level, newSkins, newAwards, newBest, opened, bossFirst };
}
