// Munch Hollow data: every tunable number, the campaign, upgrades, abilities, skins, treasures, awards and the save format.
import type { MapId, Part } from './parts';
import type { Ability, PowKind, Skin } from './world';

// Rules Craig delegated (listed in the build report).
export const TUNE = {
  R0: 0.5, // starting hole radius
  K: 0.17, // growth: R^2 = R0^2 + K * mass
  massPow: 1.5, // an object's mass is its footprint half-diagonal to this power (1.5 keeps big things worth it without ending the round early)
  EDIBLE: 1.15, // an object can fall in when its half-diagonal is under R * EDIBLE
  FIT: 1.35, // it falls when its centre is within 0.75 R and all its corners within R * FIT
  EAT_HOLE: 1.2, // a hole eats another hole at least this many times its radius
  levelStep: 1.17, // each size level is 17 % wider
  speed: 4.2, speedPerR: 0.11,
  battleTime: 120, soloTime: 150,
  respawn: 3, shield: 3, keepOnRespawn: 0.6,
  boostTime: 2, boostCd: 6, boostMul: 1.6,
  magnetTime: 8, speedTime: 6, speedMul: 1.45, growR: 0.25, clockSecs: 10, rushTime: 8, thornShrink: 0.08,
  giantTime: 7, giantMul: 1.3, freezeTime: 5, abilityCd: 25,
  powMax: 5, powEvery: 6,
  botSpeed: 0.9, // bot speed at skill 0 (+0.45 at skill 1)
  botGain: 0.8, // bot growth share at skill 0 (+1.2 at skill 1); below skill 0.5, 60 % of that while 25 % bigger than the player
  holeGain: 0.25, // share of a swallowed rival's mass the eater gains
  smallMore: 1.3, // small props are placed 1.3x their listed count
  regrow: 22, // battle: seconds before things up to house size pop back
  regrowWorth: 0.3, // a thing that grew back is worth this share of its last growth
  bigStart: 0.35, giantStart: 1.0, // question bonuses: extra start radius
};

// ---------- upgrades ----------
export type UpKey = 'size' | 'speed' | 'time' | 'gain' | 'reach' | 'coins';
export const UPGRADES: { key: UpKey; name: string; help: string; max: number; base: number; per: number }[] = [
  { key: 'size', name: 'Start size', help: 'Begin every round wider', max: 12, base: 50, per: 0.07 },
  { key: 'gain', name: 'Appetite', help: 'Grow faster from everything', max: 12, base: 70, per: 0.06 },
  { key: 'speed', name: 'Speed', help: 'Move faster', max: 10, base: 50, per: 0.05 },
  { key: 'reach', name: 'Wide rim', help: 'Things tip in from farther out', max: 6, base: 120, per: 0.035 },
  { key: 'time', name: 'More time', help: '5 more seconds each round', max: 6, base: 80, per: 5 },
  { key: 'coins', name: 'Coin nose', help: 'More coins from every round', max: 8, base: 90, per: 0.08 },
];
export const upPrice = (u: (typeof UPGRADES)[number], lv: number) => Math.round((u.base * 1.55 ** lv) / 10) * 10;

// ---------- abilities (unlocked by campaign stars; one is worn at a time) ----------
export const ABILITIES: { id: Ability; name: string; help: string; stars: number }[] = [
  { id: 'gulp', name: 'Big Gulp', help: 'Pull in everything nearby that fits', stars: 24 },
  { id: 'giant', name: 'Giant', help: 'Be 30% wider for 7 seconds', stars: 110 },
  { id: 'freeze', name: 'Freeze', help: 'Rival holes stop for 5 seconds', stars: 220 },
];
/** Hole titles by total stars (the evolution ladder shown on the menu). */
export const TITLES: [number, string][] = [[0, 'Sprout Well'], [30, 'Moon Well'], [80, 'Star Well'], [150, 'Comet Well'], [240, 'Dragon Well'], [340, 'Sky Well'], [450, 'Legend Well'], [540, 'Crown of Wells']];
export const SIZE_NAMES = ['Tiny', 'Nibbler', 'Muncher', 'Gobbler', 'Chomper', 'Devourer', 'Titan', 'Legend'];
export const sizeName = (level: number) => SIZE_NAMES[Math.min(SIZE_NAMES.length - 1, Math.floor((level - 1) / 3))];

// ---------- skins ----------
const ear = (s: number): Part[] => [
  ['cone', 0xff9ec7, 0.45 * s, 0.28, -0.93, 0.48, 0.58, 0.2, 0, 0, -0.3 * s],
  ['cone', 0xffe0ec, 0.45 * s, 0.25, -0.86, 0.28, 0.38, 0.06, 0, 0, -0.3 * s],
];
const horn = (s: number): Part[] => [['cone', 0xfff3b0, 0.5 * s, 0.3, -0.88, 0.16, 0.55, 0.16, -0.3, 0, -0.45 * s]];
const GL = 0x1000000; // glow flag (parts.ts G)
const around = (n: number, from: number, to: number, f: (x: number, z: number, a: number) => Part): Part[] =>
  Array.from({ length: n }, (_, i) => { const a = from + ((to - from) * i) / Math.max(1, n - 1); return f(Math.sin(a) * 1.06, -Math.cos(a) * 1.06, a); });
const gems = (c: number, n = 6): Part[] => around(n, 0, Math.PI * 2 * (1 - 1 / n), (x, z) => ['oct', GL | c, x, 0.16, z, 0.17, 0.3, 0.17]);
// price -1: a reward skin, earned by finishing a place's treasure set (or all crowns).
export const SKINS: Skin[] = [
  { id: 'moon', name: 'Moonbeam', price: 0, colors: [0xb388ff, 0x9a6cf0], arcs: 8, inner: 0x2c1650, parts: around(3, -0.6, 0.6, (x, z) => ['oct', GL | 0xffe08a, x, 0.3, z, 0.2, 0.3, 0.2]) },
  { id: 'kitty', name: 'Kitty', price: 120, colors: [0xff9ec7, 0xffb7d5], arcs: 8, inner: 0x4a1a36, parts: [...ear(-1), ...ear(1)] },
  { id: 'dragon', name: 'Dragon', price: 200, colors: [0x5cd68a, 0x3fae6a], arcs: 10, inner: 0x12361f, parts: [...horn(-1), ...horn(1), ...around(5, 1.9, 4.4, (x, z) => ['cone', 0x3fae6a, x, 0.14, z, 0.16, 0.28, 0.16])] },
  { id: 'snow', name: 'Snowflake', price: 150, colors: [0x9fe4ff, 0xffffff], arcs: 12, inner: 0x16324c, parts: gems(0xe8fbff) },
  { id: 'soccer', name: 'Soccer', price: 150, colors: [0xffffff, 0x222222], arcs: 10, inner: 0x1b1b1b, parts: [['ball', 0xffffff, 0, 0.32, -1.08, 0.34, 0.34, 0.34]] },
  { id: 'rainbow', name: 'Rainbow', price: 300, colors: [0xff6b6b, 0xffa94d, 0xffe066, 0x69db7c, 0x4dabf7, 0xb197fc], arcs: 12, inner: 0x2a1840, parts: [] },
  { id: 'set-kingdom', name: 'Royal', price: -1, colors: [0x7e57c2, 0xffd54a], arcs: 8, inner: 0x24124a, parts: gems(0xff5c8a, 8) },
  { id: 'set-ski', name: 'Powder', price: -1, colors: [0xe8f6ff, 0x4dabf7], arcs: 8, inner: 0x10304c, parts: around(4, -0.9, 0.9, (x, z) => ['cone', 0xffffff, x, 0.2, z, 0.2, 0.4, 0.2]) },
  { id: 'set-beach', name: 'Seashell', price: -1, colors: [0xffc1cc, 0x4fc3e8, 0xfff3c4], arcs: 9, inner: 0x103848, parts: gems(0xfff3c4, 5) },
  { id: 'set-desert', name: 'Sunstone', price: -1, colors: [0xf2b84a, 0xd9773a], arcs: 8, inner: 0x4a2408, parts: gems(0x3fc4d8, 4) },
  { id: 'set-cat', name: 'Yarn', price: -1, colors: [0xff8fc8, 0x9fe4ff, 0xffe066], arcs: 12, inner: 0x3a1a4a, parts: [...ear(-1), ...ear(1), ['ball', 0xff5c8a, 0, 0.3, 1.08, 0.36, 0.36, 0.36]] },
  { id: 'set-candy', name: 'Peppermint', price: -1, colors: [0xffffff, 0xff4d6d], arcs: 16, inner: 0x4a1020, parts: gems(0xff8fc8, 4) },
  { id: 'set-park', name: 'Aspen', price: -1, colors: [0xffc93c, 0x3f8f4f], arcs: 8, inner: 0x1c3018, parts: around(5, -1.2, 1.2, (x, z) => ['cone', 0x2e8b57, x, 0.26, z, 0.2, 0.52, 0.2]) },
  { id: 'set-dragon', name: 'Ember', price: -1, colors: [0x3a2a3a, 0xff7a2a], arcs: 10, inner: 0x5a1a08, parts: [...horn(-1), ...horn(1), ...gems(0xff9a2a, 6)] },
  { id: 'set-sky', name: 'Starlight', price: -1, colors: [0x2a2470, 0xc8b8ff], arcs: 10, inner: 0x0c0830, parts: gems(0xfff3c4, 10) },
  { id: 'crown', name: 'Crowned', price: -1, colors: [0xffd54a, 0xffb300], arcs: 8, inner: 0x4a3000, parts: [...around(7, -1.2, 1.2, (x, z) => ['cone', 0xffd54a, x, 0.3, z, 0.22, 0.6, 0.22]), ...around(7, -1.2, 1.2, (x, z) => ['ball', GL | 0xff5c8a, x, 0.62, z, 0.12, 0.12, 0.12])] },
];

// ---------- campaign: 9 places x 20 levels ----------
export const PLACES: MapId[] = ['kingdom', 'ski', 'beach', 'desert', 'cat', 'candy', 'park', 'dragon', 'sky'];
export const LEVELS_PER_PLACE = 20;
/** Stars needed (all places together) to open place p, on top of beating the boss before it. */
export const starsToOpen = (p: number) => p * 36;
/** Coins that open a place for Battle and Clear Map before the campaign reaches it. */
export const placePrice = (p: number) => [0, 150, 300, 600, 900, 1300, 1800, 2400, 3000][p];

export type LevelKind = 'eat' | 'size' | 'score' | 'clear' | 'hunt' | 'battle' | 'boss';
export interface LevelDef {
  place: MapId; pi: number; n: number; id: string; kind: LevelKind;
  q: number; // eat: which prop, 0 = smallest on the map .. 1 = biggest
  frac: number; // share of the goal's pool she must reach
  time: number; half: number; maxDiag: number; bots: number; botSkill: number;
  slip: boolean; thorns: number; pows: PowKind[]; treasure: boolean; seed: number;
}
const KINDS: LevelKind[] = ['eat', 'size', 'eat', 'score', 'hunt', 'eat', 'battle', 'clear', 'eat', 'eat', 'size', 'hunt', 'eat', 'battle', 'score', 'eat', 'clear', 'hunt', 'eat', 'boss'];
const EAT_Q: Record<number, number> = { 1: 0, 3: 0.5, 6: 0.72, 9: 0.82, 10: 1, 13: 0.6, 16: 0.9, 19: 1 };
const TIME: Record<LevelKind, number> = { eat: 80, size: 80, score: 90, clear: 110, hunt: 90, battle: 120, boss: 170 };
/** Seconds on the clock per level: the balance bot's finish time on that level's own town, divided by 0.6 (shots/hole/sim.mjs par). 0 = the kind's default. */
const PAR: number[][] = [
  [150,100,75,75,65,55,0,0,100,110,85,115,90,0,85,95,0,115,90,110],
  [90,75,85,80,60,85,0,0,115,80,95,125,90,0,115,60,0,80,95,110],
  [65,65,90,60,50,70,0,0,45,95,60,80,105,0,90,95,0,85,100,95],
  [70,60,50,50,70,50,0,0,75,85,50,70,70,0,90,85,0,70,80,75],
  [90,45,45,65,60,50,0,0,80,130,240,85,65,0,75,75,0,80,60,140],
  [45,80,90,50,45,50,0,0,60,85,55,90,45,0,85,50,0,75,45,105],
  [80,50,50,60,55,60,0,0,70,75,80,50,55,0,50,75,0,90,45,80],
  [75,85,95,45,50,70,0,0,60,70,105,70,70,0,85,70,0,70,90,120],
  [85,45,95,50,45,60,0,0,55,85,85,50,80,0,65,50,0,95,60,75],
];
export const CROWN_TIME = 0.75; // a crown run gets this share of the clock
/** Coins from a round's score: grows with the square root, so huge late scores do not flood the shop. */
export const scoreCoins = (score: number) => Math.round(Math.sqrt(score) * 0.3);
/** Levels that hide one of the place's 10 treasures (5, 12, 18 are the hunts). */
export const TREASURE_LEVELS = [2, 4, 5, 8, 10, 12, 14, 16, 18, 20];

export function levelDef(pi: number, n: number, crown = false): LevelDef {
  const kind = KINDS[n - 1], d = (pi * 20 + n) / 180; // d: 0..1 through the whole campaign
  const maxDiag = n <= 3 ? 1.5 : n <= 6 ? 2.5 : n <= 9 ? 4.5 : n <= 19 ? 8 : 99;
  const rivals = kind === 'battle' ? 3 : pi >= 4 && n > 10 && kind !== 'boss' && kind !== 'hunt' ? 1 + (pi >= 7 ? 1 : 0) : 0;
  const pows: PowKind[] = pi === 0 && n < 4 ? [] : ['magnet', 'speed', 'grow', ...(kind === 'clear' ? ['clock' as const] : []), ...(pi >= 5 ? ['rush' as const] : [])];
  return {
    place: PLACES[pi], pi, n, id: `${PLACES[pi]}-${n}`, kind,
    q: EAT_Q[n] ?? 0.5,
    frac: Math.min(rivals && kind === 'eat' ? 0.45 : 0.92, FRAC[kind] * (kind === 'eat' ? 0.5 + 0.3 * (n / 20) + 0.4 * d : 0.8 + 0.25 * (n / 20) + 0.45 * d)),
    time: Math.round((PAR[pi]?.[n - 1] || TIME[kind]) * (crown ? CROWN_TIME : 1)),
    half: kind === 'boss' ? 46 : Math.round(34 + Math.min(n, 14) + pi * 0.5),
    maxDiag, bots: rivals, botSkill: kind === 'battle' ? 0.1 + d * 0.6 : 0.05 + d * 0.3,
    slip: (pi === 1 && n % 3 === 0) || (pi >= 7 && n % 5 === 3),
    thorns: pi >= 3 && n > 2 && n % 2 === 0 ? 3 + pi : 0,
    pows, treasure: TREASURE_LEVELS.includes(n), seed: 7919 * (pi * 20 + n) + 13,
  };
}
// Base share of each goal's pool (items of that kind, mass, score, objects) at the start of the campaign.
const FRAC: Record<LevelKind, number> = { eat: 0.85, size: 0.7, score: 0.8, clear: 0.4, hunt: 0.5, battle: 1, boss: 1 };
/** Stars for a timed goal: share of the clock used. */
export const STAR_TIME = [1, 0.82, 0.62];
/** Clear levels: stars at the goal share and this much more. */
export const CLEAR_STEP = 0.12;
export const STAR_AT = [0.5, 0.75, 0.95]; // free-play Clear Map
export const PLACE_COINS = [40, 20, 10, 0];
export const levelCoins = (l: LevelDef, stars: number, first: boolean) => (first ? 20 + l.pi * 5 : 0) + stars * (5 + l.pi);

// ---------- treasures: 10 per place, one hidden in each treasure level ----------
export const TREASURES: Record<MapId, string[]> = {
  kingdom: ['Golden Acorn', 'Tiny Crown', 'Wishing Coin', 'Silver Bell', 'Royal Teacup', 'Glass Slipper', 'Knight\'s Spoon', 'Rose Brooch', 'Moon Key', 'Star Scepter'],
  ski: ['Frozen Pinecone', 'Lucky Mitten', 'Golden Ski Pass', 'Snow Globe', 'Cocoa Medal', 'Ice Diamond', 'Silver Sled Bell', 'First Snowflake', 'Summit Flag', 'Powder Trophy'],
  beach: ['Pink Pearl', 'Message Bottle', 'Sand Dollar', 'Coral Comb', 'Sailor\'s Compass', 'Gold Flip-Flop', 'Mermaid Mirror', 'Sunset Shell', 'Captain\'s Whistle', 'Tide Crown'],
  desert: ['Sun Coin', 'Oasis Lily', 'Brass Lamp', 'Star Map', 'Sand Rose', 'Turquoise Ring', 'Silk Kite', 'Date Palm Seed', 'Mirage Gem', 'Sun Palace Key'],
  cat: ['Golden Yarn', 'Jingle Bell', 'Feather Wand', 'Silver Fish', 'Catnip Bouquet', 'Velvet Collar', 'Paw Stamp', 'Cream Saucer', 'Whisker Comb', 'Palace Tuna'],
  candy: ['Rainbow Sprinkle', 'Golden Gumdrop', 'Sugar Star', 'Mint Medal', 'Caramel Key', 'Cherry Jewel', 'Frosting Rose', 'Toffee Crown', 'Jelly Moon', 'Birthday Candle'],
  park: ['Blue Columbine', 'Aspen Leaf of Gold', 'Ranger Badge', 'Trail Compass', 'Pyrite Nugget', 'River Stone Heart', 'Elk Whistle', 'Campfire Mug', 'Summit Register', 'Fourteener Pin'],
  dragon: ['Ember Scale', 'Dragon Tooth', 'Lava Pearl', 'Hoard Coin', 'Smoke Ring', 'Obsidian Mirror', 'Fire Opal', 'Hatchling Shell', 'Flame Lantern', 'Heart of the Volcano'],
  sky: ['Fallen Star', 'Moon Dust Jar', 'Comet Tail', 'Cloud Pillow', 'Rocket Ticket', 'Saturn Ring', 'Nebula Marble', 'Wishing Lens', 'Aurora Ribbon', 'Moon Palace Crown'],
};
export const treasureAt = (l: LevelDef) => TREASURE_LEVELS.indexOf(l.n); // -1 = none

// ---------- awards (each pays coins once) ----------
export type Stat = 'eaten' | 'bosses' | 'gobbled' | 'treasures' | 'stars' | 'crowns' | 'maxLevel' | 'wins' | 'combo' | 'questions' | 'places';
const AW: [Stat, string, string, number[]][] = [
  ['eaten', 'Hungry', 'Swallow {n} things', [500, 5000, 25000, 100000]],
  ['maxLevel', 'Growing up', 'Reach size {n}', [8, 12, 16, 20]],
  ['bosses', 'Landmark lover', 'Swallow {n} giant landmarks', [1, 5, 9, 30]],
  ['stars', 'Star catcher', 'Earn {n} stars', [30, 120, 300, 540]],
  ['places', 'Explorer', 'Open {n} places', [3, 6, 9]],
  ['treasures', 'Treasure hunter', 'Find {n} treasures', [10, 45, 90]],
  ['crowns', 'Royalty', 'Win {n} crowns', [10, 60, 180]],
  ['wins', 'Champion', 'Win {n} battles', [5, 25, 100]],
  ['gobbled', 'Rival muncher', 'Gobble {n} rival holes', [10, 100, 500]],
  ['combo', 'Chain eater', 'Reach a combo of {n}', [20, 50, 100]],
  ['questions', 'Bright spark', 'Earn {n} question bonuses', [10, 50, 200]],
];
export const AWARDS = AW.flatMap(([stat, name, text, goals]) => goals.map((goal, i) => ({ id: `${stat}-${goal}`, stat, name: `${name} ${'I'.repeat(i + 1).replace('IIII', 'IV')}`, text: text.replace('{n}', goal.toLocaleString('en-US')), goal, coins: 20 * (i + 1) * (i + 1) })));

// ---------- save ----------
export type PlayMode = 'battle' | 'solo';
export interface Save {
  v: 2;
  coins: number;
  up: Record<UpKey, number>;
  maps: MapId[]; // places open for free play
  skins: string[]; skin: string;
  best: Record<string, number>;
  map: MapId; mode: PlayMode;
  quality: 'auto' | 'high' | 'low';
  stars: Record<string, number>; // level id -> 1..3
  crowns: string[]; treasures: string[]; awards: string[];
  stats: Record<Stat, number>;
  ability: Ability | '';
  rank: number; // battle rank 0..20: rivals get stronger as she wins
}
export const newSave = (): Save => ({
  v: 2, coins: 0, up: { size: 0, speed: 0, time: 0, gain: 0, reach: 0, coins: 0 }, maps: ['kingdom'], skins: ['moon'], skin: 'moon', best: {}, map: 'kingdom', mode: 'battle',
  quality: 'auto', stars: {}, crowns: [], treasures: [], awards: [],
  stats: { eaten: 0, bosses: 0, gobbled: 0, treasures: 0, stars: 0, crowns: 0, maxLevel: 1, wins: 0, combo: 0, questions: 0, places: 1 }, ability: '', rank: 0,
});
/** Loads any older save: version 1 had coins, three upgrades, maps, skins, bests, and its own sound switch (now a platform setting). */
export function migrate(old: unknown): Save {
  const s = newSave(), o = (old && typeof old === 'object' ? old : {}) as Partial<Save>;
  const arr = <T>(a: T[] | undefined, d: T[]) => (Array.isArray(a) ? [...new Set([...d, ...a])] : d);
  return {
    ...s,
    coins: Math.max(0, Math.floor(Number(o.coins) || 0)),
    up: { ...s.up, ...(o.up ?? {}) },
    maps: arr(o.maps, s.maps).filter((m) => PLACES.includes(m)), skins: arr(o.skins, s.skins),
    skin: SKINS.some((k) => k.id === o.skin) ? o.skin! : 'moon',
    best: { ...(o.best ?? {}) },
    map: PLACES.includes(o.map!) ? o.map! : 'kingdom', mode: o.mode === 'solo' ? 'solo' : 'battle',
    quality: o.quality ?? 'auto', stars: { ...(o.stars ?? {}) }, crowns: arr(o.crowns, []), treasures: arr(o.treasures, []), awards: arr(o.awards, []),
    stats: { ...s.stats, ...(o.stats ?? {}) }, ability: o.ability ?? '', rank: o.rank ?? 0,
  };
}
