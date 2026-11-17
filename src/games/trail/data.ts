// Fixed game data: tuning numbers, skins, the campaign, gear, lodge items, achievements, and the save shape.
// No three.js and no DOM here, so the balance sims (shots/trail/balance.ts) can import it.

export const GRID = 80; // cells per side; one cell = one world unit
export const START_R = 3; // home patch radius
export const BIG_START_R = 7; // bonus home patch: about 5x the area
export const PLAYER_SPEED = 6.5;
export const PLAYER_TURN = 6; // radians per second
export const BOT_RESPAWN = 3; // seconds
export const REVIVE_SAFE = 2; // seconds a revived skier cannot be caught
export const STARS_FOR_DRAGON = 3;
export const RUNS_PER_MOUNTAIN = 7;
export const FLAKES_PER_MOUNTAIN = 12; // flakes needed per mountain already open (mountain m opens at m * this)
export const PURSE_COINS = 300; // epic question reward after beating a champion
export const WIN_COINS = 30;
export const FLAKE_COINS = 20;
export const CATCH_COINS = 5;

/** Jacket colours, one per arena slot. Index 0 is never used (slot ids start at 1). */
export const PALETTE = [0xffffff, 0xf0346e, 0x18b888, 0x2f86f6, 0xff9a1a, 0x8a52f0, 0xb8603a, 0x10a8c4, 0x7cc820];
const COLOR_NAMES = ['', 'Rose', 'Jade', 'Azure', 'Amber', 'Violet', 'Copper', 'Teal', 'Lime'];

export type Kind = 'cat' | 'bunny' | 'bear' | 'fox' | 'penguin' | 'dragon';

/** Each animal has one small always-on skill. */
export const PERK: Record<Kind, { text: string; turn?: number; speed?: number; air?: number; powder?: boolean; ice?: boolean; startR?: number }> = {
  cat: { text: 'Reflex: sharper turns', turn: 1.12 },
  bunny: { text: 'Long air: jumps last longer', air: 1.6 },
  bear: { text: 'Powder breaker: deep powder does not slow', powder: true },
  fox: { text: 'Swift: slightly faster', speed: 1.04 },
  penguin: { text: 'Ice edge: no slipping on ice', ice: true },
  dragon: { text: 'Wide claim: larger home patch', startR: 1 },
};

export interface Skin {
  id: string;
  name: string;
  kind: Kind;
  color: number; // index into PALETTE
  fur: number;
  cost: number; // coins; 0 = free or earned another way
  stars?: number; // unlocked by school-question stars
  flakes?: number; // unlocked by campaign snowflakes
  epic?: boolean; // unlocked by one epic school question
  gold?: boolean;
}

const KINDS: { kind: Kind; name: string; id: string; colors: number[]; furs: number[]; cost: number }[] = [
  { kind: 'cat', name: 'Lynx', id: 'kitty', colors: [1, 5, 7, 4, 3], furs: [0xfff3e6, 0x8a8a96, 0x34343c, 0xf2a25a, 0xffffff], cost: 0 },
  { kind: 'bunny', name: 'Hare', id: 'bunny', colors: [2, 1, 3, 5, 4], furs: [0xffffff, 0xf2e6d8, 0xb9a79a, 0xffd9e8, 0x8a7868], cost: 40 },
  { kind: 'bear', name: 'Bear', id: 'bear', colors: [3, 4, 8, 1, 7], furs: [0xc98d5a, 0xffffff, 0x5a4034, 0xf0d9a8, 0x34343c], cost: 80 },
  { kind: 'fox', name: 'Fox', id: 'fox', colors: [4, 7, 5, 2, 1], furs: [0xff9a4a, 0xf4f4fa, 0xc8553a, 0x8a8a96, 0xffc888], cost: 120 },
  { kind: 'penguin', name: 'Penguin', id: 'penguin', colors: [5, 1, 4, 2, 3], furs: [0x34384a, 0x2a4a7a, 0x4a3a5a, 0x2a2a30, 0x3a5a5a], cost: 160 },
  { kind: 'dragon', name: 'Drake', id: 'dragon', colors: [7, 5, 1, 8, 4], furs: [0x9fe8d8, 0xc8b0ff, 0xffb0c8, 0xb8e878, 0xffd070], cost: 0 },
];
const FLAKE_SKINS = [25, 60, 110, 170, 240, 320]; // the last colour of each animal is a snowflake prize

export const SKINS: Skin[] = [
  ...KINDS.flatMap((k, ki) =>
    k.colors.map((color, v): Skin => {
      const base = { id: v ? `${k.id}${v}` : k.id, name: `${COLOR_NAMES[color]} ${k.name}`, kind: k.kind, color, fur: k.furs[v], cost: 0 };
      if (v === 0) return k.kind === 'dragon' ? { ...base, name: 'Frost Drake', stars: STARS_FOR_DRAGON } : { ...base, cost: k.cost };
      if (v === 4) return { ...base, flakes: FLAKE_SKINS[ki] };
      return { ...base, cost: 200 + v * 220 + ki * 90 };
    }),
  ),
  { id: 'golddragon', name: 'Golden Drake', kind: 'dragon', color: 4, fur: 0xffd24a, cost: 0, epic: true, gold: true },
];

export const BOT_KINDS: { kind: Kind; fur: number }[] = [
  { kind: 'cat', fur: 0xfff3e6 },
  { kind: 'cat', fur: 0x8a8a96 },
  { kind: 'bunny', fur: 0xf2e6d8 },
  { kind: 'bear', fur: 0xc98d5a },
  { kind: 'fox', fur: 0xff9a4a },
  { kind: 'penguin', fur: 0x34384a },
];

export const BOT_NAMES = [
  'Kestrel', 'Maple', 'Juniper', 'Rook', 'Sable', 'Pike', 'Clover', 'Onyx',
  'Wren', 'Flint', 'Sorrel', 'Nova', 'Fig', 'Ash', 'Tempest', 'Frost',
];

// ---- Computer skier difficulty ----

/** speed = share of PLAYER_SPEED for the fastest style; hunt = how far a hunter looks for an open track; rest = seconds off after a chase. */
export const TIERS = [
  { speed: 0.66, hunt: 0, calm: 20, rest: 20, loop: 0.55, big: 0 },
  { speed: 0.69, hunt: 3, calm: 16, rest: 18, loop: 0.65, big: 0 },
  { speed: 0.72, hunt: 4, calm: 13, rest: 16, loop: 0.75, big: 0 },
  { speed: 0.74, hunt: 4.5, calm: 11, rest: 15, loop: 0.82, big: 0.5 },
  { speed: 0.76, hunt: 5, calm: 10, rest: 14, loop: 0.88, big: 0.5 },
  { speed: 0.78, hunt: 5.5, calm: 9, rest: 13, loop: 0.94, big: 1 },
];

// ---- Campaign ----

export type Theme = 'snow' | 'pine' | 'sunset' | 'ice' | 'night' | 'beach' | 'storm' | 'autumn' | 'candy' | 'dragon' | 'aurora' | 'lagoon' | 'cloud';
export type Weather = 'clear' | 'snow' | 'storm';

export interface ThemeDef {
  top: number; // sky overhead
  sky: number; // sky at the horizon; also the fog colour
  ground: number; // unclaimed snow or sand
  outer: number; // valley floor (or sea) below the plateau
  rock: number; // cliffs and boulders
  peak: number; // distant mountains
  cap: number; // their snow caps
  tree: number;
  sun: number;
  sunPower: number;
  amb: number; // hemisphere light strength
  night?: boolean; // stars, lamps, glowing tracks
  low?: boolean; // the sun sits low: long shadows and strong light shafts
  beach?: boolean; // boards, palms, sea
  aurora?: boolean;
}

export const THEMES: Record<Theme, ThemeDef> = {
  snow: { top: 0x1a62d8, sky: 0xa6d4ff, ground: 0xf4f8ff, outer: 0xc4d8f4, rock: 0x566490, peak: 0x6486c8, cap: 0xffffff, tree: 0x1c5a50, sun: 0xfff0d0, sunPower: 2.4, amb: 1.5 },
  pine: { top: 0x1f6ac0, sky: 0xb4e0ec, ground: 0xf0f8f8, outer: 0xc4dcdc, rock: 0x566c74, peak: 0x4a8490, cap: 0xf4ffff, tree: 0x124838, sun: 0xffecc8, sunPower: 2.2, amb: 1.5 },
  sunset: { top: 0x34247e, sky: 0xff8e5c, ground: 0xffe6dc, outer: 0xd09ab8, rock: 0x64426e, peak: 0x74428e, cap: 0xffbca8, tree: 0x2c4a52, sun: 0xff9450, sunPower: 2.6, amb: 1.25, low: true },
  ice: { top: 0x1660c4, sky: 0x9ee8ff, ground: 0xe8f6ff, outer: 0xb8dcf4, rock: 0x4c74a8, peak: 0x62a0d8, cap: 0xffffff, tree: 0x1e6660, sun: 0xf0f8ff, sunPower: 2.3, amb: 1.6 },
  night: { top: 0x050824, sky: 0x222c74, ground: 0x8ca4ea, outer: 0x4a5cae, rock: 0x2e3866, peak: 0x283470, cap: 0x8ca4ea, tree: 0x143e46, sun: 0x9fb8ff, sunPower: 1.3, amb: 1.0, night: true },
  beach: { top: 0x1a84e0, sky: 0xa0e2ff, ground: 0xf6dfae, outer: 0x1fa8d8, rock: 0xa8845e, peak: 0x3e9458, cap: 0x7ccc78, tree: 0x2a9a4c, sun: 0xfff2c8, sunPower: 2.6, amb: 1.6, beach: true },
  storm: { top: 0x3c4868, sky: 0x8e9ab8, ground: 0xdce2f2, outer: 0xaeb8d0, rock: 0x4a5470, peak: 0x6a7694, cap: 0xdce2f2, tree: 0x1e4844, sun: 0xd4dcf0, sunPower: 1.5, amb: 1.6 },
  autumn: { top: 0x2a74d0, sky: 0xffd898, ground: 0xfaf4e8, outer: 0xe4d0a8, rock: 0x7a6452, peak: 0x9a7444, cap: 0xfff4e0, tree: 0xe89410, sun: 0xffd890, sunPower: 2.5, amb: 1.4, low: true },
  candy: { top: 0x7048d0, sky: 0xffa8d0, ground: 0xfff0f8, outer: 0xe8b0d4, rock: 0x8a5a92, peak: 0x9c66c0, cap: 0xffe8f6, tree: 0xe0528e, sun: 0xffd0e4, sunPower: 2.3, amb: 1.5, low: true },
  dragon: { top: 0x2a1c4c, sky: 0xd4684e, ground: 0xf0e0e6, outer: 0xa07c90, rock: 0x3e2e48, peak: 0x4c3258, cap: 0xf0b8a8, tree: 0x2e3c4e, sun: 0xff8c54, sunPower: 2.4, amb: 1.2, low: true },
  aurora: { top: 0x040e24, sky: 0x12405e, ground: 0x94c8de, outer: 0x3c7c98, rock: 0x224058, peak: 0x1e4460, cap: 0x9ceedc, tree: 0x124e48, sun: 0x9fffe0, sunPower: 1.3, amb: 1.0, night: true, aurora: true },
  lagoon: { top: 0x0c1440, sky: 0x40307e, ground: 0xb4a2c6, outer: 0x1c3c90, rock: 0x4e3e66, peak: 0x2e3c74, cap: 0x5e6eaa, tree: 0x1e6c60, sun: 0xc0b0ff, sunPower: 1.4, amb: 1.0, night: true, beach: true },
  cloud: { top: 0x2a74f0, sky: 0xffd8a0, ground: 0xfffaf2, outer: 0xffe8cc, rock: 0xb4a0d8, peak: 0xd8c0f0, cap: 0xffffff, tree: 0xc890f0, sun: 0xffe8b0, sunPower: 2.6, amb: 1.5, low: true },
};

export interface Mountain {
  id: string;
  name: string;
  blurb: string;
  theme: Theme;
  weather: Weather;
  tier: number;
  bots: number;
  ice: number; // number of ice patches
  powder: number; // number of deep-powder patches
  jumps: number; // number of jump ramps
  champ: { name: string; kind: Kind; fur: number };
}

const M = (id: string, name: string, blurb: string, theme: Theme, weather: Weather, bots: number, ice: number, powder: number, jumps: number, champ: string, kind: Kind, fur: number): Mountain =>
  ({ id, name, blurb, theme, weather, tier: 0, bots, ice, powder, jumps, champ: { name: champ, kind, fur } });

const TIER_OF = [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5];
export const MOUNTAINS: Mountain[] = [
  M('peak', 'Firstlight Peak', 'Wide open slopes. Learn your lines.', 'snow', 'clear', 3, 0, 0, 0, 'Captain Veyl', 'cat', 0x8a8a96),
  M('meadow', 'Whitegrass Meadow', 'Soft snow and the first jumps.', 'pine', 'clear', 3, 0, 1, 2, 'Thistle', 'bunny', 0xf2e6d8),
  M('pine', 'Pine Hollow', 'Deep powder between the pines.', 'pine', 'snow', 4, 0, 4, 0, 'Hazel', 'bear', 0x5a4034),
  M('sunset', 'Alpenglow Ridge', 'The ridge burns gold at dusk.', 'sunset', 'clear', 4, 0, 2, 2, 'Ember', 'fox', 0xc8553a),
  M('bowl', 'Lynx Bowl', 'Jump ramps everywhere.', 'snow', 'clear', 5, 0, 2, 6, 'Vesper', 'bunny', 0xffd9e8),
  M('lake', 'Glass Lake', 'Black ice across the lake.', 'ice', 'snow', 5, 5, 0, 2, 'Admiral Rime', 'penguin', 0x2a4a7a),
  M('star', 'Starlight Run', 'Night skiing under the lamps.', 'night', 'clear', 5, 2, 2, 3, 'Midnight', 'cat', 0x34343c),
  M('beach', 'Sunbreak Shore', 'Board the warm sand.', 'beach', 'clear', 6, 0, 3, 3, 'Dune', 'bear', 0xf0d9a8),
  M('pass', 'Blizzard Pass', 'A snowstorm hides the far side.', 'storm', 'storm', 6, 3, 5, 2, 'Gale', 'fox', 0xf4f4fa),
  M('falls', 'Frozen Falls', 'Blue ice under falling snow.', 'ice', 'storm', 6, 5, 1, 4, 'Shard', 'cat', 0xffffff),
  M('aspen', 'Golden Aspens', 'Colorado gold in the fall.', 'autumn', 'clear', 6, 2, 3, 5, 'Marigold', 'bunny', 0xb9a79a),
  M('cove', 'Coral Cove', 'Warm sand by the reef.', 'beach', 'clear', 6, 0, 5, 5, 'Pearl', 'penguin', 0x4a3a5a),
  M('moon', 'Moonfall Glacier', 'Ice that glows in the dark.', 'night', 'snow', 6, 5, 2, 3, 'Luna', 'bunny', 0xffffff),
  M('candy', 'Rosefrost Summit', 'Rose snow under a blossom dawn.', 'candy', 'snow', 6, 3, 4, 6, 'Sakura', 'cat', 0xffffff),
  M('ember', 'Emberglow Ridge', 'Red evening light on dark rock.', 'dragon', 'clear', 6, 2, 4, 6, 'Blaze', 'fox', 0xffc888),
  M('tooth', "Dragon's Tooth", 'Dragon weather: wind and snow.', 'dragon', 'storm', 6, 3, 4, 5, 'Cinder', 'dragon', 0xffb0c8),
  M('aurora', 'Aurora Crown', 'Northern lights over the crown.', 'aurora', 'clear', 6, 4, 3, 5, 'Borealis', 'dragon', 0xc8b0ff),
  M('lagoon', 'Moonlit Lagoon', 'Night surf with glowing tracks.', 'lagoon', 'clear', 6, 2, 4, 6, 'Tide', 'penguin', 0x3a5a5a),
  M('spire', 'Storm Spire', 'The wildest weather on the map.', 'storm', 'storm', 6, 2, 4, 6, 'Thunder', 'bear', 0x34343c),
  M('cloud', 'Skyhold', 'Above the clouds. The last summit.', 'cloud', 'snow', 7, 4, 4, 8, 'Empress Nimbus', 'dragon', 0xffd070),
];

MOUNTAINS.forEach((m, i) => (m.tier = TIER_OF[i]));

export type GoalKind = 'land' | 'catch' | 'marks' | 'loop';
export interface RunDef {
  name: string;
  goal: GoalKind;
  need: number; // land %, skiers caught, landmarks owned at once, or % claimed by one loop
  extra: { goal: 'land' | 'catch'; need: number }; // third snowflake
  champ: boolean; // the mountain's champion is in this run
}

export const MARKS = 5; // landmarks on every mountain
export const LAND_BASE = 13;
export const LAND_STEP = 0.2;

/** The seven runs of mountain number m. Goals grow gently down the list of mountains. */
export function runsOf(m: number): RunDef[] {
  const land = Math.round(LAND_BASE + m * LAND_STEP);
  const catches = 2 + Math.floor(m / 3);
  const side = 1 + Math.floor(m / 7);
  return [
    { name: 'Green run', goal: 'land', need: land, extra: { goal: 'catch', need: side }, champ: false },
    { name: 'Hunt run', goal: 'catch', need: catches, extra: { goal: 'land', need: land - 4 }, champ: false },
    { name: 'Landmark run', goal: 'marks', need: m < 3 ? 3 : 4, extra: { goal: 'catch', need: side }, champ: false },
    { name: 'Big loop run', goal: 'loop', need: +(2 + m * 0.1).toFixed(1), extra: { goal: 'land', need: land - 2 }, champ: false },
    { name: 'Blue run', goal: 'land', need: land + 4, extra: { goal: 'catch', need: side + 1 }, champ: false },
    { name: 'Grand tour', goal: 'marks', need: 5, extra: { goal: 'land', need: land }, champ: false },
    { name: 'Champion run', goal: 'land', need: land + 7, extra: { goal: 'catch', need: side + 1 }, champ: true },
  ];
}

export const FREE_RUN: RunDef = { name: 'Free ski', goal: 'land', need: 100, extra: { goal: 'catch', need: 999 }, champ: true };

export function goalText(g: { goal: GoalKind; need: number }): string {
  if (g.goal === 'land') return `Claim ${g.need}% of the mountain`;
  if (g.goal === 'catch') return `Catch ${g.need} skier${g.need > 1 ? 's' : ''}`;
  if (g.goal === 'loop') return `Claim ${g.need}% with one loop`;
  return `Own ${g.need} landmarks at once`;
}

// ---- Gear (coins) ----

export type GearId = 'wax' | 'edges' | 'patch' | 'scarf';
export const GEAR: { id: GearId; name: string; text: string; per: number }[] = [
  { id: 'wax', name: 'Ski wax', text: 'Faster skis: +2% speed per level', per: 0.02 },
  { id: 'edges', name: 'Sharp edges', text: 'Tighter turns: +6% per level', per: 0.06 },
  { id: 'patch', name: 'Base camp', text: 'Bigger home patch: +0.5 per level', per: 0.5 },
  { id: 'scarf', name: 'Windscarf', text: 'More coins: +8% per level', per: 0.08 },
];
export const GEAR_COST = [80, 180, 340, 560, 850];

// ---- Lodge decorations (coins) ----

export const LODGE: { id: string; name: string; cost: number }[] = [
  { id: 'rug', name: 'Crest rug', cost: 150 },
  { id: 'fire', name: 'Stone hearth', cost: 300 },
  { id: 'bed', name: 'Lodge cat', cost: 400 },
  { id: 'lights', name: 'Lantern string', cost: 500 },
  { id: 'cocoa', name: 'Tea table', cost: 600 },
  { id: 'rack', name: 'Ski rack', cost: 700 },
  { id: 'tree', name: 'Winter pine', cost: 800 },
  { id: 'ball', name: 'Soccer ball', cost: 900 },
  { id: 'disco', name: 'Mirror orb', cost: 1050 },
  { id: 'shelf', name: 'Trophy shelf', cost: 1200 },
  { id: 'egg', name: 'Drake egg', cost: 1400 },
  { id: 'snowman', name: 'Ice spire', cost: 1600 },
];

// ---- Achievements: fixed goals, fixed coin rewards ----

export interface Stats { runs: number; wins: number; land: number; catches: number; claims: number; bigLoop: number; jumps: number; clean: number; champs: number }
export const NEW_STATS: Stats = { runs: 0, wins: 0, land: 0, catches: 0, claims: 0, bigLoop: 0, jumps: 0, clean: 0, champs: 0 };

export interface Achievement { id: string; name: string; text: string; stat: keyof Stats | 'flakes' | 'stars' | 'skins' | 'lodge'; need: number; coins: number }
const tiers = (id: string, name: string, text: string, stat: Achievement['stat'], needs: number[], coins: number[]): Achievement[] =>
  needs.map((need, k) => ({ id: id + (k + 1), name: `${name} ${'I'.repeat(k + 1)}`, text: text.replace('#', String(need)), stat, need, coins: coins[k] }));
export const ACHIEVEMENTS: Achievement[] = [
  ...tiers('win', 'Trail blazer', 'Win # runs', 'wins', [1, 10, 50, 140], [20, 60, 150, 300]),
  ...tiers('catch', 'Hunter', 'Catch # skiers', 'catches', [5, 50, 200], [20, 80, 200]),
  ...tiers('land', 'Land baron', 'Claim #% of land in total', 'land', [100, 1000, 5000], [20, 80, 200]),
  ...tiers('loop', 'Big loop', 'Claim #% in one loop', 'bigLoop', [5, 10, 20], [20, 60, 150]),
  ...tiers('jump', 'Air time', 'Hit # jumps', 'jumps', [10, 100], [30, 100]),
  ...tiers('clean', 'Clean line', 'Win # runs without a wipeout', 'clean', [5, 30], [40, 150]),
  ...tiers('champ', 'Champion', 'Beat # champions', 'champs', [1, 10, 20], [50, 150, 400]),
  ...tiers('flake', 'Snowflakes', 'Collect # snowflakes', 'flakes', [25, 120, 280, 420], [40, 120, 250, 500]),
  ...tiers('star', 'Scholar', 'Earn # question stars', 'stars', [3, 15, 40], [30, 80, 200]),
  ...tiers('skin', 'Wardrobe', 'Own # skins', 'skins', [5, 15, 31], [30, 100, 300]),
  ...tiers('lodge', 'Lodge keeper', 'Place # lodge items', 'lodge', [4, 12], [50, 200]),
];

// ---- Save ----

export type Quality = 'auto' | 'high' | 'low';
export interface SaveData {
  v: 2;
  coins: number;
  skins: string[];
  skin: string;
  stars: number;
  flakes: Record<string, number>; // "<mountain id>:<run index>" -> 0..3
  open: string[]; // mountains opened another way (old saves)
  best: Record<string, number>; // best free-ski land % per mountain
  gear: Record<GearId, number>;
  lodge: string[];
  ach: string[];
  purses: string[]; // mountains whose champion purse was earned
  stats: Stats;
  quality: Quality;
}

export const newSave = (): SaveData => ({
  v: 2, coins: 0, skins: ['kitty'], skin: 'kitty', stars: 0, flakes: {}, open: [], best: {},
  gear: { wax: 0, edges: 0, patch: 0, scarf: 0 }, lodge: [], ach: [], purses: [], stats: { ...NEW_STATS }, quality: 'auto',
});

/** Loads any save this game ever wrote. Version 1 had { coins, skins, skin, maps, best, stars } and a 40% win. */
export function migrate(raw: unknown): SaveData {
  const s = newSave();
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Partial<SaveData> & { maps?: string[] };
  if (o.v === 2) return { ...s, ...o, gear: { ...s.gear, ...o.gear }, stats: { ...s.stats, ...o.stats } };
  s.coins = o.coins ?? 0;
  s.stars = o.stars ?? 0;
  s.skins = (o.skins ?? []).filter((id) => SKINS.some((k) => k.id === id));
  if (!s.skins.includes('kitty')) s.skins.unshift('kitty');
  s.skin = s.skins.includes(o.skin ?? '') ? o.skin! : 'kitty';
  s.open = (o.maps ?? []).filter((id) => MOUNTAINS.some((m) => m.id === id));
  for (const [id, best] of Object.entries(o.best ?? {})) {
    s.best[id] = best;
    if (best >= 40) s.flakes[id + ':0'] = 1; // an old win counts as the first run of that mountain
  }
  return s;
}

export const totalFlakes = (s: SaveData) => Object.values(s.flakes).reduce((a, b) => a + b, 0);
export const mountainOpen = (s: SaveData, m: number) => totalFlakes(s) >= m * FLAKES_PER_MOUNTAIN || s.open.includes(MOUNTAINS[m].id);
export const runOpen = (s: SaveData, m: number, r: number) => r === 0 || (s.flakes[`${MOUNTAINS[m].id}:${r - 1}`] ?? 0) > 0;
export function statValue(s: SaveData, stat: Achievement['stat']): number {
  if (stat === 'flakes') return totalFlakes(s);
  if (stat === 'stars') return s.stars;
  if (stat === 'skins') return s.skins.length;
  if (stat === 'lodge') return s.lodge.length;
  return s.stats[stat];
}
