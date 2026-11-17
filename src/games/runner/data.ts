// Neko Strike season data: worlds, leagues, cups, aces (star cats), jerseys, upgrades, goals, and the save format.
// No three.js here, so the level checker and the balance simulator can import it in Node.

export type WorldId = 'field' | 'snow' | 'beach' | 'canyon' | 'desert' | 'candy' | 'city' | 'castle';
export type TrapKind =
  | 'ball' | 'sprinkler' | 'snowball' | 'penguin' | 'crab' | 'splash' | 'boulder' | 'tumbleweed'
  | 'cactus' | 'twister' | 'gumball' | 'candycane' | 'vacuum' | 'cones' | 'dragon' | 'flame';
/** How a trap moves. sweep: side to side. spin: turning bar. roll: rolls at the team. pop: rises and sinks in a lane. wall: stands still. */
export type TrapMove = 'sweep' | 'spin' | 'roll' | 'pop' | 'wall';
export const TRAP_MOVE: Record<TrapKind, TrapMove> = {
  ball: 'sweep', penguin: 'sweep', crab: 'sweep', tumbleweed: 'sweep', twister: 'sweep', vacuum: 'sweep', dragon: 'sweep',
  sprinkler: 'spin', candycane: 'spin', snowball: 'roll', boulder: 'roll', gumball: 'roll', splash: 'pop', flame: 'pop',
  cactus: 'wall', cones: 'wall',
};

export interface World {
  id: WorldId;
  name: string;
  cup: string;
  rivals: string; // rival team name
  rivalJersey: string;
  rivalTrim: string;
  captain: string; // rival captain, met in derby matches
  keeper: string; // boss keeper of the cup final
  traps: [TrapKind, TrapKind];
  swatch: [string, string]; // card colours on the season map
}
export const WORLDS: World[] = [
  { id: 'field', name: 'Colorado Fields', cup: 'Meadow Cup', rivals: 'Meadow Strikers', rivalJersey: '#ff7a1a', rivalTrim: '#3a1c08', captain: 'Briar', keeper: 'Ironwall', traps: ['ball', 'sprinkler'], swatch: ['#58c860', '#1f7a3a'] },
  { id: 'snow', name: 'Frost Peak', cup: 'Glacier Cup', rivals: 'Frost Fangs', rivalJersey: '#3d4fa8', rivalTrim: '#dfe8ff', captain: 'Rime', keeper: 'Avalanche', traps: ['snowball', 'penguin'], swatch: ['#bfe0ff', '#3f7fd8'] },
  { id: 'beach', name: 'Azure Coast', cup: 'Tidal Cup', rivals: 'Riptide', rivalJersey: '#17b3b0', rivalTrim: '#fff3c4', captain: 'Coral', keeper: 'Tsunami', traps: ['crab', 'splash'], swatch: ['#ffd070', '#0f9ad0'] },
  { id: 'canyon', name: 'Red Rock Canyon', cup: 'Canyon Cup', rivals: 'Canyon Claws', rivalJersey: '#c2452d', rivalTrim: '#ffd9a0', captain: 'Mesa', keeper: 'Monolith', traps: ['boulder', 'tumbleweed'], swatch: ['#f08a50', '#9a3018'] },
  { id: 'desert', name: 'Dune Oasis', cup: 'Oasis Cup', rivals: 'Sandstorm', rivalJersey: '#8a5fd0', rivalTrim: '#ffe08a', captain: 'Mirage', keeper: 'The Sphinx', traps: ['cactus', 'twister'], swatch: ['#ffc860', '#c87a1c'] },
  { id: 'candy', name: 'Crystal Vale', cup: 'Prism Cup', rivals: 'Prism Blades', rivalJersey: '#e040c0', rivalTrim: '#9ff0ff', captain: 'Shard', keeper: 'Bastion', traps: ['gumball', 'candycane'], swatch: ['#e070d8', '#5a3ac0'] },
  { id: 'city', name: 'Night City', cup: 'Neon Cup', rivals: 'Neon Nines', rivalJersey: '#22e0d0', rivalTrim: '#20203a', captain: 'Volt', keeper: 'Blackout', traps: ['vacuum', 'cones'], swatch: ['#5a4ac8', '#191a3c'] },
  { id: 'castle', name: 'Dragon Keep', cup: 'Dragon Cup', rivals: 'Dragon Guard', rivalJersey: '#7a2ad0', rivalTrim: '#ffcf3a', captain: 'Ember', keeper: 'Wyvern', traps: ['dragon', 'flame'], swatch: ['#b58cff', '#4a2a6a'] },
];
export const LEAGUES = ['Rookie League', 'Dusk League', 'Midnight League', 'Legends League'];
export const MATCHES = 20; // matches per cup; the last one is the cup final
export const CUPS = WORLDS.length * LEAGUES.length; // 32
export const LAST_LEVEL = CUPS * MATCHES; // 640; after that the Endless Cup starts

export interface Where { cup: number; league: number; world: World; match: number; final: boolean; derby: boolean; endless: boolean }
export function where(n: number): Where {
  const cup = Math.floor((n - 1) / MATCHES);
  const match = (n - 1) % MATCHES;
  const endless = n > LAST_LEVEL;
  return {
    cup, league: Math.min(3, Math.floor(cup / WORLDS.length)), world: WORLDS[cup % WORLDS.length], match,
    final: match === MATCHES - 1, derby: match % 5 === 4 && match !== MATCHES - 1, endless,
  };
}
export function matchTitle(n: number): string {
  const w = where(n);
  if (w.endless) return `Endless Cup · Match ${n - LAST_LEVEL}`;
  return `${w.world.cup} · ${w.final ? 'Final' : `Match ${w.match + 1}`}`;
}

// ---- Aces (star cats): one joins after each Rookie League mid-cup derby. One is the captain of a run. ----
export interface StarCat { id: string; name: string; fur: string; at: number; what: (lvl: number) => string }
export const STAR_MAX = 5;
export const STARS: StarCat[] = [
  { id: 'whiskers', name: 'Kaze', fur: '#f08a2e', at: 10, what: (l) => `Start with ${4 * l} more players.` },
  { id: 'blizzard', name: 'Blizzard', fur: '#ffffff', at: 30, what: (l) => `An ice shield saves the first ${4 * l} players a trap would hit.` },
  { id: 'sunny', name: 'Sol', fur: '#ffcf4a', at: 50, what: (l) => `Pulls in coins from far away. Goal coins +${8 * l}%.` },
  { id: 'rocky', name: 'Ridge', fur: '#a8623a', at: 70, what: (l) => `Rival teams count ${6 * l}% smaller.` },
  { id: 'dune', name: 'Dune', fur: '#e8c890', at: 90, what: (l) => `Each free agent who joins brings ${l} more.` },
  { id: 'taffy', name: 'Shard', fur: '#d88af0', at: 110, what: (l) => `Plus gates give ${8 * l}% more players.` },
  { id: 'pixel', name: 'Volt', fur: '#5a6a9a', at: 130, what: (l) => `The keeper is ${5 * l}% weaker.` },
  { id: 'ember', name: 'Ember', fur: '#e0523a', at: 150, what: (l) => `Saves ${12 * l} of every 100 players a trap would hit.` },
];
export const starCost = (lvl: number) => [0, 800, 3000, 9000, 25000][lvl] ?? Infinity; // cost to go from lvl to lvl + 1

// ---- Jerseys: main colour + trim. Fixed ways to get each one; nothing is random. ----
export interface Jersey { id: string; name: string; color: string; trim: string; cost?: number; cup?: number; stars?: number; epic?: boolean }
export const JERSEYS: Jersey[] = [
  { id: 'berry', name: 'Crimson', color: '#e8305a', trim: '#ffffff', cost: 0 },
  { id: 'sky', name: 'Azure', color: '#2f8cf0', trim: '#ffffff', cost: 150 },
  { id: 'mint', name: 'Jade', color: '#12b890', trim: '#145a44', cost: 300 },
  { id: 'sun', name: 'Solar', color: '#ffb020', trim: '#c2452d', cost: 500 },
  { id: 'grape', name: 'Violet', color: '#7a4ae8', trim: '#ffe08a', cost: 800 },
  { id: 'snow', name: 'Frost', color: '#f4f4ff', trim: '#4aa8ff', cost: 1200 },
  { id: 'lava', name: 'Magma', color: '#ff5a2a', trim: '#2a2235', cost: 3000 },
  { id: 'ocean', name: 'Abyss', color: '#1f6fd1', trim: '#7fe0d0', cost: 6000 },
  { id: 'bubble', name: 'Sakura', color: '#ff8ac8', trim: '#7fd1ff', cost: 12000 },
  { id: 'midnight', name: 'Midnight', color: '#2a2a5a', trim: '#ffd84a', cost: 25000 },
  ...WORLDS.map((w, i): Jersey => ({ id: 'cup-' + w.id, name: w.rivals, color: w.rivalJersey, trim: w.rivalTrim, cup: WORLDS.length + i })),
  { id: 'starry', name: 'Starfall', color: '#3a2a8a', trim: '#ffe86a', stars: 300 },
  { id: 'rainbow', name: 'Aurora', color: '#ff7ad0', trim: '#5ae0ff', stars: 900 },
  { id: 'gold', name: 'Champion Gold', color: '#ffcf3a', trim: '#ffffff', cup: CUPS - 1 },
  { id: 'galaxy', name: 'Galaxy', color: '#6a3ad8', trim: '#3affd0', epic: true },
];

// ---- Upgrades ----
export const TEAM_MAX = 60;
export const INCOME_MAX = 20;
export const STADIUM_MAX = 10;
export const teamCost = (l: number) => Math.round(40 + 120 * l + 4 * l * l);
export const incomeCost = (l: number) => Math.round(100 + 150 * l + 25 * l * l);
export const stadiumCost = (l: number) => Math.round((500 * Math.pow(1.9, l)) / 50) * 50;
export const startCats = (l: number) => 1 + 2 * l;
export const incomeMult = (l: number) => 1 + 0.05 * l;
export const stadiumMult = (l: number) => 1 + 0.03 * l;
/** Team upgrade level the levels are tuned for. */
export const parTeamLvl = (n: number) => Math.min(TEAM_MAX, Math.floor(n / 16));
/** Coins for a goal before boosts. */
export const goalCoins = (n: number, left: number, final: boolean) => Math.round((20 + 3 * Math.min(n, LAST_LEVEL) + left / 4) * (final ? 3 : 1));
export const COIN_MULT = 3; // normal question: triple goal coins
export const EPIC_PILE = 10; // epic question after a cup final: goal coins x10
export const BONUS_CATS = 10;
export const REVIVE_MIN = 10;

// ---- Goals (achievements): fixed targets, coin rewards ----
export type Stat = 'goals' | 'fights' | 'bigTeam' | 'coins' | 'gates' | 'stars' | 'cups' | 'answers' | 'strays' | 'captains';
export interface Goal { id: Stat; name: string; text: (n: number) => string; tiers: number[]; reward: number[] }
export const GOALS: Goal[] = [
  { id: 'goals', name: 'Goal Scorer', text: (n) => `Score ${n} goals`, tiers: [5, 25, 100, 300, 640], reward: [50, 200, 1000, 4000, 12000] },
  { id: 'cups', name: 'Cup Collector', text: (n) => `Win ${n} cups`, tiers: [1, 4, 8, 16, 32], reward: [200, 800, 2500, 8000, 25000] },
  { id: 'stars', name: 'Star Hunter', text: (n) => `Earn ${n} stars`, tiers: [15, 100, 400, 1000, 1920], reward: [60, 400, 2000, 8000, 30000] },
  { id: 'bigTeam', name: 'Full Squad', text: (n) => `Field ${n} players at once`, tiers: [50, 150, 400, 700, 999], reward: [40, 150, 600, 2000, 6000] },
  { id: 'fights', name: 'Derby Day', text: (n) => `Win ${n} team fights`, tiers: [10, 60, 250, 800], reward: [50, 300, 1500, 6000] },
  { id: 'captains', name: 'Captain Breaker', text: (n) => `Beat ${n} rival captains`, tiers: [1, 8, 32, 96], reward: [80, 500, 2500, 9000] },
  { id: 'gates', name: 'Gate Reader', text: (n) => `Pick the best gate ${n} times`, tiers: [20, 150, 600, 2000], reward: [50, 300, 1500, 6000] },
  { id: 'coins', name: 'Treasury', text: (n) => `Collect ${n} coins on the track`, tiers: [100, 1000, 5000, 15000], reward: [50, 300, 1500, 5000] },
  { id: 'strays', name: 'Recruiter', text: (n) => `Sign ${n} free agents`, tiers: [25, 200, 1000, 4000], reward: [40, 250, 1200, 5000] },
  { id: 'answers', name: 'Sharp Mind', text: (n) => `Answer ${n} bonus questions`, tiers: [3, 15, 50, 150], reward: [60, 300, 1200, 4000] },
];

// ---- Save ----
export type QualitySetting = 'auto' | 'high' | 'low';
export interface RunnerSave {
  v: 2;
  level: number; // next unbeaten level
  coins: number;
  teamLvl: number;
  incomeLvl: number;
  stadiumLvl: number;
  jerseys: string[];
  jersey: string;
  stars: string; // one digit (0-3) per level, level 1 first
  cats: Record<string, number>; // star cat id -> level
  captain: string; // active star cat id, or ''
  stats: Partial<Record<Stat, number>>;
  claimed: Partial<Record<Stat, number>>; // goal id -> tiers already paid
  quality: QualitySetting;
}
export const newSave = (): RunnerSave => ({
  v: 2, level: 1, coins: 0, teamLvl: 0, incomeLvl: 0, stadiumLvl: 0, jerseys: ['berry'], jersey: 'berry',
  stars: '', cats: {}, captain: '', stats: {}, claimed: {}, quality: 'auto',
});

/** Loads any earlier save. Version 1 had: level, coins, teamLvl, incomeLvl, jerseys, jersey (60 levels in 3 worlds). */
export function migrate(raw: unknown): RunnerSave {
  const s = newSave();
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Partial<RunnerSave>;
  const num = (v: unknown, d: number, max = 1e9) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : d);
  s.level = Math.max(1, num(o.level, 1));
  s.coins = num(o.coins, 0);
  s.teamLvl = num(o.teamLvl, 0, TEAM_MAX);
  s.incomeLvl = num(o.incomeLvl, 0, INCOME_MAX);
  s.stadiumLvl = num(o.stadiumLvl, 0, STADIUM_MAX);
  const known = (id: unknown) => JERSEYS.some((j) => j.id === id);
  if (Array.isArray(o.jerseys)) s.jerseys = [...new Set(['berry', ...o.jerseys.filter(known)])];
  if (known(o.jersey) && s.jerseys.includes(o.jersey!)) s.jersey = o.jersey!;
  if (o.v === 2) {
    if (typeof o.stars === 'string') s.stars = o.stars.replace(/[^0-3]/g, '0');
    for (const c of STARS) if (o.cats && o.cats[c.id]) s.cats[c.id] = num(o.cats[c.id], 1, STAR_MAX);
    if (typeof o.captain === 'string' && s.cats[o.captain]) s.captain = o.captain;
    for (const g of GOALS) {
      s.stats[g.id] = num(o.stats?.[g.id], 0);
      s.claimed[g.id] = num(o.claimed?.[g.id], 0, g.tiers.length);
    }
    if (o.quality === 'high' || o.quality === 'low') s.quality = o.quality;
  } else {
    // Version 1: every level already beaten counts as a one-star win, and star cats met on the way join the team.
    s.stats.goals = s.level - 1;
    s.stats.stars = s.level - 1;
  }
  s.stars = s.stars.padEnd(s.level - 1, '1');
  for (const c of STARS) if (s.level > c.at && !s.cats[c.id]) s.cats[c.id] = 1;
  if (!s.captain) s.captain = STARS.find((c) => s.cats[c.id])?.id ?? '';
  s.stats.cups = Math.max(s.stats.cups ?? 0, Math.min(CUPS, Math.floor((s.level - 1) / MATCHES)));
  return s;
}
export const starsOf = (s: RunnerSave, n: number) => Number(s.stars[n - 1] ?? 0);
export const totalStars = (s: RunnerSave) => [...s.stars].reduce((a, c) => a + Number(c), 0);
