// Fixed game data: tunables, skins, arenas, journey stages, evolution, awards, save shape. No three.js here.

export const T = {
  arenaRadius: 300, // 3x the first version's 100: 9x the area
  fieldGems: 15300, // small gems kept on the field (same density as the first version: 1700 on radius 100)
  gemRegenPerSec: 315, // how fast eaten field gems grow back
  maxGems: 20000,
  bots: 36,
  startMass: 12,
  bigStartMass: 90, // "Start big" bonus
  dragonStartMass: 260, // "Dragon start" epic bonus
  baseSpeed: 7.5,
  boostSpeed: 14,
  boostCostPerSec: 5, // mass burned per second while boosting
  minBoostMass: 16,
  deathDropShare: 0.6, // share of a defeated wyrm's mass that bursts into gems
  potionCount: 45,
  potionSecs: 12,
  bubbleSecs: 12,
  zoomSecs: 8,
  frostSecs: 6,
  reviveBubbleSecs: 3,
  botRespawnSecs: 3,
  spriteCount: 54, // fleeing sprite gems on the field
  spriteValue: 15,
  spriteSpeed: 9.2,
  spriteStamina: 3.5, // seconds a sprite gem can run before it must rest
  roarRadius: 15,
  roarScareSecs: 2.5,
  rushSecs: 180,
  hoardCoins: 400, // "Royal hoard" epic bonus, first win over each boss
};

export const segCount = (mass: number) => Math.min(280, Math.round(9 + mass * 0.24));
export const radiusOf = (mass: number) => 0.5 + 0.75 * (1 - Math.exp(-mass / 700));
export const turnRateOf = (mass: number) => 4.2 - 2.2 * (1 - Math.exp(-mass / 900)); // rad/s; big wyrms turn slower
export const lengthScore = (mass: number) => Math.round(mass * 10);

// Names for computer wyrms. Fixed list, picked in order without repeats.
export const BOT_NAMES = [
  'Ashka', 'Veyra', 'Korrin', 'Sable', 'Thorne', 'Nyx',
  'Riven', 'Kael', 'Zephyr', 'Onyx', 'Vesper', 'Drav',
  'Lady Fern', 'Halcyon', 'Juniper', 'Orin', 'Sir Noodle', 'Captain Squall',
  'Bramble', 'Talon', 'Thistle', 'Mirage', 'Wisp', 'Duchess Plum',
  'Fenris', 'Solace', 'Glimmer', 'Rook', 'Maple', 'Ziggy',
  'Hazel', 'Cinder', 'Ironbark', 'Saffron', 'Nimbus', 'Garnet',
  'Quill', 'Lady Bluebell', 'Cobalt', 'Lord Ember', 'Poppy', 'Flint',
  'Comet', 'Raze', 'Rosehip', 'Echo', 'Tempest', 'Sage',
];

export type BotStyle = 'grazer' | 'hunter' | 'circler';

/** Computer wyrm strength for a difficulty tier (0 = first place, 8 = last place). */
export const tierOf = (tier: number) => ({
  careLo: 0.74 + 0.022 * tier,
  careHi: 0.91 + 0.008 * tier,
  bigShare: 0.14 + 0.03 * tier,
  bigMass: 170 + 45 * tier,
  smallMass: 45 + 10 * tier,
  hunter: 0.6 + tier * 0.3, // style weights next to 2 for grazer
  circler: 0.6 + tier * 0.2,
});

export type Accessory = 'horns' | 'ears' | 'unicorn' | 'bunny';
export type Unlock =
  | { by: 'coins'; cost: number }
  | { by: 'length'; value: number }
  | { by: 'pops'; value: number }
  | { by: 'boss'; arena: ArenaId }
  | { by: 'level'; value: number }
  | { by: 'stars'; value: number }
  | { by: 'award'; id: string };
export interface Skin {
  id: string;
  name: string;
  colors: number[]; // body stripes, repeated head to tail
  head: number;
  acc: Accessory;
  accColor: number;
  glow?: boolean; // body shines (bloom)
  unlock?: Unlock; // none = owned from the start
}

const sk = (id: string, name: string, colors: number[], acc: Accessory, accColor: number, unlock?: Unlock, glow = false, head = colors[0]): Skin =>
  ({ id, name, colors, head, acc, accColor, unlock, glow });
const coins = (cost: number): Unlock => ({ by: 'coins', cost });

export const SKINS: Skin[] = [
  sk('ember', 'Ember', [0xff5a2a, 0xff5a2a, 0xffa040], 'horns', 0xffe9b0),
  sk('seafoam', 'Tidecrest', [0x1fb8a8, 0x1fb8a8, 0x7fe8d0], 'horns', 0xfff0c8),
  sk('bubblegum', 'Rosethorn', [0xe8457a, 0xe8457a, 0xff8fb0], 'ears', 0xffd0dc, coins(60)),
  sk('lilac', 'Duskveil', [0x7a4de8, 0x7a4de8, 0xc0a0ff], 'horns', 0xffd88a, coins(100)),
  sk('snowcat', 'Snow Lynx', [0xeef0fa, 0xeef0fa, 0x8a94b8], 'ears', 0x7fd8ff, coins(150)),
  sk('soccer', 'Striker', [0xf4f4f8, 0x1a1a24], 'horns', 0x1a1a24, coins(200)),
  sk('aspen', 'Aspen Gold', [0xf5b81f, 0xf5b81f, 0xffe08a], 'horns', 0xffffff, coins(250)),
  sk('minty', 'Jadewind', [0x2fc88a, 0xe8fff4, 0x2fc88a, 0x1f9a6a], 'bunny', 0xffffff, coins(400)),
  sk('peach', 'Dawnfire', [0xff7a5a, 0xffb08a, 0xe8503a], 'bunny', 0xffe0c0, coins(600)),
  sk('tabby', 'Tabby', [0xe88a2a, 0xe88a2a, 0x8a4a14], 'ears', 0xffc870, coins(800)),
  sk('tuxedo', 'Tuxedo', [0x1a1a24, 0x1a1a24, 0xf4f4f8], 'ears', 0xf4f4f8, coins(1100)),
  sk('blueberry', 'Stormcaller', [0x3a4ce8, 0x7a8cff, 0x2430a8], 'unicorn', 0xffd23d, coins(1500)),
  sk('sunset', 'Sunset', [0xff3f5a, 0xff7a3a, 0xffb84a, 0xff7a3a], 'horns', 0xffe9b0, coins(2000)),
  sk('powder', 'Powder Day', [0xffffff, 0x9fd4ff, 0x2a9aff], 'bunny', 0x2a9aff, coins(2500)),
  sk('calico', 'Calico', [0xf4f4f8, 0xe88a2a, 0xf4f4f8, 0x2a2028], 'ears', 0xe88a2a, coins(3200), false, 0xf4f4f8),
  sk('galaxy', 'Galaxy', [0x2a1a8f, 0x7a4dff, 0x1a2a8f, 0xff5ad0], 'unicorn', 0xff7ad9, coins(4000), true),
  sk('unicorn', 'Prism Horn', [0xf4f4ff, 0xff7ab8, 0x7ac0ff, 0xb890ff], 'unicorn', 0xffd04a, coins(5000), true, 0xf4f4ff),
  sk('candy', 'Crimson Stripe', [0xd8243a, 0xf4f4f8], 'bunny', 0xd8243a, coins(6500), false, 0xf4f4f8),
  sk('royal', 'Sovereign', [0xf5b81f, 0xffe08a, 0xf5b81f, 0x8a2ae8], 'horns', 0xb14dff, coins(8000), true),
  sk('rainbow', 'Spectrum', [0xe83a3a, 0xff9a1f, 0xffd23d, 0x3ac85a, 0x2a9aff, 0x8a5aff], 'horns', 0xffe066, { by: 'length', value: 5000 }, false, 0xf4f4f8),
  sk('starry', 'Starry Night', [0x1f2c8f, 0x1f2c8f, 0x1f2c8f, 0xffd75e], 'ears', 0xffd75e, { by: 'pops', value: 5 }),
  sk('jade', 'Elder Jade', [0x1f9a6a, 0x6fe0a8, 0x1f9a6a, 0xf4efe6], 'horns', 0xf4efe6, { by: 'level', value: 15 }),
  sk('aurora', 'Mythic Aurora', [0x2fffb8, 0x2fb0ff, 0xa040ff, 0xff5ad0], 'unicorn', 0xffffff, { by: 'level', value: 28 }, true),
  sk('catcher', 'Star Catcher', [0xffd23d, 0xfff0b0, 0xff9a1f], 'bunny', 0xffffff, { by: 'stars', value: 100 }, true),
  sk('constellation', 'Constellation', [0x10164a, 0x10164a, 0xffffff, 0x10164a, 0x5fc8ff], 'unicorn', 0x7fd8ff, { by: 'stars', value: 216 }, true),
  sk('sprite', 'Spritebound', [0x5fe08a, 0xd8ffb0, 0x2fb86a], 'bunny', 0xffe066, { by: 'award', id: 'sprites3' }, true),
  sk('champion', 'Champion', [0xc8242a, 0xf5b81f, 0xc8242a, 0xf4f4f8], 'horns', 0xffd04a, { by: 'award', id: 'pops4' }),
  // one per boss
  sk('b-valley', 'Mossback', [0x4a7a2f, 0x6fa84a, 0x4a7a2f, 0xb88a50], 'horns', 0xc8a070, { by: 'boss', arena: 'valley' }),
  sk('b-peak', 'Rimeclaw', [0x9fdcff, 0xf4faff, 0x5aa8f0], 'ears', 0xbfe8ff, { by: 'boss', arena: 'peak' }, true),
  sk('b-beach', 'Tidereaver', [0xe8456a, 0xffa888, 0xe8456a, 0x1fc0b0], 'horns', 0x2fd0c0, { by: 'boss', arena: 'beach' }),
  sk('b-grove', 'Lumenshade', [0x6a3dff, 0x2fffd0, 0x6a3dff], 'bunny', 0x4dffd9, { by: 'boss', arena: 'grove' }, true),
  sk('b-canyon', 'Scoria', [0xc8502a, 0xe8854a, 0x9a3a1f], 'horns', 0xffe9b0, { by: 'boss', arena: 'canyon' }),
  sk('b-cat', 'Moonclaw', [0xe8dcc8, 0xe8dcc8, 0x4a3a6a], 'ears', 0x9a7aff, { by: 'boss', arena: 'cat' }, false, 0xe8dcc8),
  sk('b-disco', 'Neon Seraph', [0xff2fc8, 0x2fc8ff, 0xffd82f, 0x2fff7a], 'unicorn', 0xffffff, { by: 'boss', arena: 'disco' }, true),
  sk('b-forge', 'Cinderjaw', [0x2a1c1c, 0xff5a1f, 0x2a1c1c, 0xffb81f], 'horns', 0xffb81f, { by: 'boss', arena: 'forge' }, true),
  sk('b-cloud', 'Prism Empress', [0xff5a8a, 0xffb84a, 0xffe85a, 0x5ae07a, 0x5ab0ff, 0xb07aff], 'unicorn', 0xffd04a, { by: 'boss', arena: 'cloud' }, true, 0xf4f4ff),
];
export const DEFAULT_OWNED = ['ember', 'seafoam'];

// Bot looks: a fixed rotation of strong colours.
export const BOT_SKINS: Pick<Skin, 'colors' | 'head' | 'acc' | 'accColor'>[] = [
  { colors: [0x3ac85a, 0x3ac85a, 0xa8f08a], head: 0x3ac85a, acc: 'horns', accColor: 0xfff0c8 },
  { colors: [0x2a9aff, 0x2a9aff, 0x9fd8ff], head: 0x2a9aff, acc: 'ears', accColor: 0xbfe8ff },
  { colors: [0xff9a1f, 0xff9a1f, 0xffd23d], head: 0xff9a1f, acc: 'horns', accColor: 0xffffff },
  { colors: [0xe8386a, 0xe8386a, 0xff9ab8], head: 0xe8386a, acc: 'bunny', accColor: 0xffd0e0 },
  { colors: [0x7a5aff, 0x7a5aff, 0xb8a8ff], head: 0x7a5aff, acc: 'unicorn', accColor: 0xffd88a },
  { colors: [0x1fa88a, 0x1fa88a, 0xffd23d], head: 0x1fa88a, acc: 'horns', accColor: 0xffe066 },
  { colors: [0xd8d0c0, 0xd8d0c0, 0x9a6a3c], head: 0xd8d0c0, acc: 'ears', accColor: 0xc49a6c },
  { colors: [0xe8502a, 0xe8502a, 0x2a2028], head: 0xe8502a, acc: 'ears', accColor: 0xffb070 },
];

// ---- places ----
export type ArenaId = 'valley' | 'peak' | 'beach' | 'grove' | 'canyon' | 'cat' | 'disco' | 'forge' | 'cloud';
export type ObstacleKind = 'rock' | 'pool' | 'bumper'; // rock and pool pop a wyrm; a bumper bounces it
export type ZoneKind = 'slow' | 'slick' | 'fast';
export interface Arena {
  id: ArenaId;
  name: string;
  blurb: string; // what is special here, one short line
  ground: number;
  groundAlt: number;
  outside: number;
  far: number; // distant hills
  skyTop: number;
  sky: number; // horizon and fog
  sun: number;
  border: number;
  night?: boolean;
  gems: number[];
  obstacles: [ObstacleKind, number][];
  zones: [ZoneKind, number][];
  boss: { name: string; skin: string };
}

const GEMS_A = [0xff3a6a, 0xffc81f, 0x2aa8ff, 0x9a5aff, 0x3ad86a, 0xff7a2a];
export const ARENAS: Arena[] = [
  { id: 'valley', name: 'Emerald Vale', blurb: 'Open grassland at golden hour. Learn the hunt here.', ground: 0x3f8f40, groundAlt: 0x2f7a3c, outside: 0x2f6e38, far: 0x4a6aa8, skyTop: 0x2456c8, sky: 0xffd9a0, sun: 0xffd9a0, border: 0xb07aff, gems: GEMS_A, obstacles: [], zones: [], boss: { name: 'Old Mossback', skin: 'b-valley' } },
  { id: 'peak', name: 'Frostfang Peak', blurb: 'Ice sheets make you slide wide.', ground: 0xdfe9fc, groundAlt: 0xa4c0f0, outside: 0xc4d6f6, far: 0x5a78c0, skyTop: 0x1440b0, sky: 0xa8d0ff, sun: 0xfff2dc, border: 0x5fe0ff, gems: [0x2a8aff, 0x9a5aff, 0xff3a6a, 0x1fc0b0, 0xffa01f, 0x5a6aff], obstacles: [], zones: [['slick', 90]], boss: { name: 'Rimeclaw', skin: 'b-peak' } },
  { id: 'beach', name: 'Coral Strand', blurb: 'Tide pools drag your speed down.', ground: 0xf0d48a, groundAlt: 0xe0bc6a, outside: 0xe8c878, far: 0x2a9a8a, skyTop: 0x1474e8, sky: 0xa8ecff, sun: 0xfff0c0, border: 0xff5a8a, gems: [0xff3a4a, 0x1fc0b0, 0xffc81f, 0xff5aa8, 0x2a9aff, 0x8a6aff], obstacles: [], zones: [['slow', 90]], boss: { name: 'Tidereaver', skin: 'b-beach' } },
  { id: 'grove', name: 'Moonspore Grove', blurb: 'Glowcaps knock you back.', ground: 0x2c4a5e, groundAlt: 0x23405a, outside: 0x1c3048, far: 0x1a2a4a, skyTop: 0x080c2a, sky: 0x2a3a6a, sun: 0x9fc8ff, border: 0x4dffd9, night: true, gems: [0x4dffd9, 0xff7ad9, 0xffe066, 0x7a9dff, 0x9dff7a, 0xffa04d], obstacles: [['bumper', 144]], zones: [], boss: { name: 'Lumenshade', skin: 'b-grove' } },
  { id: 'canyon', name: 'Red Rock Canyon', blurb: 'Stone pillars end your run. Wind gusts speed you up.', ground: 0xb8704a, groundAlt: 0x9a5638, outside: 0x9a5234, far: 0x6a3a3a, skyTop: 0x2a3ab8, sky: 0xf0a070, sun: 0xffc890, border: 0xffd04a, gems: [0x1fc0b0, 0xffe066, 0xffffff, 0x2a9aff, 0x9a5aff, 0x3ad86a], obstacles: [['rock', 126]], zones: [['fast', 45]], boss: { name: 'Scoria the Red', skin: 'b-canyon' } },
  { id: 'cat', name: 'Moonclaw Shrine', blurb: 'Temari orbs knock you back. Catmint strips give speed.', ground: 0x6aa85a, groundAlt: 0x579a50, outside: 0x4a8a4a, far: 0x8a5a9a, skyTop: 0x2a1f7a, sky: 0xff8a9a, sun: 0xffc0a0, border: 0xff5aa0, gems: [0xff5aa8, 0xffd23d, 0x5ac0ff, 0xa87aff, 0xff8a3a, 0xffffff], obstacles: [['bumper', 117]], zones: [['fast', 54]], boss: { name: 'Lady Moonclaw', skin: 'b-cat' } },
  { id: 'disco', name: 'Neon Starfloor', blurb: 'Slick tiles and speed tiles.', ground: 0x2a2050, groundAlt: 0x3a2a70, outside: 0x181030, far: 0x2a1a5a, skyTop: 0x0a0620, sky: 0x3a1a6a, sun: 0xd0a0ff, border: 0xff4dd2, night: true, gems: [0xff4dd2, 0x4dd2ff, 0xffe04d, 0x4dff88, 0xff884d, 0xb44dff], obstacles: [], zones: [['slick', 72], ['fast', 72]], boss: { name: 'Neon Seraph', skin: 'b-disco' } },
  { id: 'forge', name: 'Dragon Forge', blurb: 'Lava pools and hot rocks end your run.', ground: 0x4a3a3a, groundAlt: 0x3a2c2e, outside: 0x2a2024, far: 0x3a1a1a, skyTop: 0x1a0a14, sky: 0x6a2a1a, sun: 0xffa060, border: 0xff7a1f, night: true, gems: [0xffb81f, 0xff5a1f, 0xfff07a, 0xff7ad9, 0x7ad9ff, 0xffffff], obstacles: [['pool', 81], ['rock', 45]], zones: [], boss: { name: 'Cinderjaw', skin: 'b-forge' } },
  { id: 'cloud', name: 'Skyreach Citadel', blurb: 'Sky gaps, cloud bumpers, and jetstream strips.', ground: 0xe4e2fc, groundAlt: 0xb4b0ee, outside: 0xb8c4f4, far: 0xf09ab0, skyTop: 0x2a3ad0, sky: 0xffb890, sun: 0xfff0d0, border: 0xffd04a, gems: [0xff3a4a, 0xff9a1f, 0xffd23d, 0x3ad86a, 0x2a9aff, 0x9a5aff], obstacles: [['pool', 72], ['bumper', 72]], zones: [['fast', 54]], boss: { name: 'The Prism Empress', skin: 'b-cloud' } },
];
export const FREE_ARENAS = 3; // the first three places were open in the first version and stay open

export type PotionKind = 'magnet' | 'double' | 'bubble' | 'zoom' | 'frost';
export const POTIONS: Record<PotionKind, { color: number; label: string; level: number }> = {
  magnet: { color: 0xffc23d, label: 'Magnet', level: 1 },
  double: { color: 0xff5fa2, label: 'Double gems', level: 1 },
  bubble: { color: 0x7fd8ff, label: 'Ward', level: 1 },
  zoom: { color: 0x7dff6a, label: 'Free boost', level: 10 },
  frost: { color: 0xc8f4ff, label: 'Frost', level: 15 },
};

// ---- journey: 8 goals per place, the last one is a boss ----
export type GoalKind = 'length' | 'pops' | 'sprites' | 'rush' | 'crown' | 'boss';
export interface Stage {
  id: string; // `${arena}-${n}`
  arena: ArenaId;
  chapter: number;
  n: number; // 1..8
  kind: GoalKind;
  tiers: [number, number, number]; // 1, 2, 3 stars
  text: string;
}
// Targets come from bot runs (shots/wyrm/balance.ts, calib): about the 45th, 72nd, and 90th percentile of what a
// computer player reaches in that place, so 1 star takes a couple of tries and 3 stars takes practice.
// Retuned for the radius-300 field (calib-v3.txt): wyrms meet less often, so runs last longer, lengths run higher,
// sprite gems are easier to find, and pops stay about as hard.
const LEN_A = [[2500, 5000, 9000], [3000, 6000, 10000], [3000, 6500, 11000], [3000, 6000, 9000]];
const LEN_B = [[6000, 10000, 14000], [7000, 11000, 15000], [7000, 11500, 16000], [5000, 7500, 10000]];
export const STAGES: Stage[] = ARENAS.flatMap((a, c) => {
  const mk = (n: number, kind: GoalKind, t: number[], text: string): Stage =>
    ({ id: `${a.id}-${n}`, arena: a.id, chapter: c, n, kind, tiers: [t[0], t[1], t[2]], text });
  return [
    mk(1, 'length', LEN_A[Math.min(3, c)], 'Grow long'),
    mk(2, 'pops', [1, 2, 3], 'Take down wyrms'),
    mk(3, 'sprites', c < 3 ? [4, 8, 14] : c < 7 ? [3, 6, 10] : [2, 4, 7], 'Catch sprite gems'),
    mk(4, 'rush', [4000, 6000, 8500].map((v) => v + c * 100), 'Gem rush: 3 minutes'),
    mk(5, 'crown', [10, 30, 60].map((v) => v + c * 2), 'Stay in the top 3'),
    mk(6, 'length', LEN_B[Math.min(3, c)], 'Grow massive'),
    mk(7, 'pops', c < 3 ? [2, 3, 4] : [1, 2, 4], 'Take down more'),
    mk(8, 'boss', [1, 2, 3], `Boss: ${a.boss.name}`),
  ];
});
export const stagesOf = (arena: ArenaId) => STAGES.filter((s) => s.arena === arena);
export const MAX_STARS = STAGES.length * 3;
export function goalText(st: Stage, tier: number): string {
  const v = st.tiers[Math.min(2, tier)];
  switch (st.kind) {
    case 'length': return `Reach length ${v}`;
    case 'pops': return `Take down ${v} ${v === 1 ? 'wyrm' : 'wyrms'}`;
    case 'sprites': return `Catch ${v} sprite gems`;
    case 'rush': return `Reach length ${v} in 3 minutes`;
    case 'crown': return `Stay in the top 3 for ${v} seconds`;
    case 'boss': return tier === 0 ? `Make ${ARENAS[st.chapter].boss.name} crash ${BOSS_HEARTS} times` : 'Win without a revive';
  }
}
export const bossMass = (chapter: number) => 420 + chapter * 110;
export const BOSS_HEARTS = 4;

// ---- wyrm level and evolution ----
export const xpToNext = (level: number) => 120 + 6 * level * level; // xp from this level to the next
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++; }
  return { level, into: xp, need: xpToNext(level) };
}
export const xpFor = (length: number, pops: number, newStars: number) => Math.round(length / 40) + pops * 8 + newStars * 40;

export interface Evo { level: number; name: string; perk: string }
export const EVOS: Evo[] = [
  { level: 1, name: 'Hatchling', perk: '' },
  { level: 3, name: 'Whelp', perk: 'Grows back fins.' },
  { level: 6, name: 'Drake', perk: 'Grows wings. New move: Roar scares smaller wyrms.' },
  { level: 10, name: 'Wyvern', perk: 'Bigger wings. Boost costs less. Free boost potions appear.' },
  { level: 15, name: 'Elder', perk: 'Tail gem. Pulls gems from farther. Frost potions appear.' },
  { level: 21, name: 'Ancient', perk: 'Glowing aura. Starts every run longer.' },
  { level: 28, name: 'Mythic', perk: 'Star trail. Roar is ready sooner.' },
];
export const MAX_LEVEL = 30; // past this, levels still count as Mythic ranks
export const evoOf = (level: number) => { let i = 0; while (i + 1 < EVOS.length && level >= EVOS[i + 1].level) i++; return i; };
/** What a wyrm's level changes in play. */
export const perksOf = (level: number) => {
  const e = evoOf(level);
  return {
    evo: e,
    roarCd: e >= 6 ? 12 : e >= 2 ? 20 : 0, // 0 = no roar yet
    boostCost: e >= 3 ? 0.8 : 1,
    pull: e >= 4 ? 1.25 : 1,
    startMass: e >= 5 ? 30 : T.startMass,
  };
};

// ---- awards: fixed goals with fixed prizes ----
export type StatKey = 'gems' | 'pops' | 'length' | 'sprites' | 'potions' | 'bosses' | 'roars' | 'bestRun' | 'places' | 'stars';
export interface Award { id: string; text: string; stat: StatKey; value: number; coins: number }
const ladder = (key: string, stat: StatKey, text: (v: number) => string, steps: [number, number][]): Award[] =>
  steps.map(([value, c], i) => ({ id: `${key}${i + 1}`, text: text(value), stat, value, coins: c }));
export const AWARDS: Award[] = [
  ...ladder('gems', 'gems', (v) => `Eat ${v} gems`, [[500, 40], [5000, 120], [25000, 300], [100000, 700]]),
  ...ladder('pops', 'pops', (v) => `Take down ${v} wyrms`, [[10, 40], [50, 120], [200, 300], [600, 700]]),
  ...ladder('length', 'length', (v) => `Grow ${v} length in total`, [[50000, 60], [500000, 250], [2000000, 700]]),
  ...ladder('sprites', 'sprites', (v) => `Catch ${v} sprite gems`, [[10, 40], [100, 150], [400, 500]]),
  ...ladder('potions', 'potions', (v) => `Drink ${v} potions`, [[10, 30], [100, 120], [300, 300]]),
  ...ladder('bosses', 'bosses', (v) => `Beat ${v} ${v === 1 ? 'boss' : 'bosses'}`, [[1, 80], [5, 300], [9, 800]]),
  ...ladder('roars', 'roars', (v) => `Roar ${v} times`, [[20, 50], [200, 250]]),
  ...ladder('best', 'bestRun', (v) => `Reach length ${v} in one run`, [[2000, 50], [5000, 150], [10000, 400], [20000, 800]]),
  ...ladder('places', 'places', (v) => `Play in ${v} places`, [[3, 30], [6, 150], [9, 400]]),
  ...ladder('stars', 'stars', (v) => `Earn ${v} stars`, [[25, 100], [75, 250], [150, 500], [216, 1000]]),
];

// ---- save ----
export type Quality = 'auto' | 'high' | 'low';
export interface SaveData {
  v: 2;
  coins: number;
  owned: string[];
  skin: string;
  arena: ArenaId;
  goal: number; // 0 = free play, 1..8 = journey goal in the chosen place
  best: Partial<Record<ArenaId, number>>; // best free-play length per place
  runs: number;
  xp: number;
  stars: Record<string, number>; // stage id -> 0..3
  awards: string[]; // award ids already paid
  stats: Record<StatKey, number>;
  played: ArenaId[];
  quality: Quality;
}
export const newSave = (): SaveData => ({
  v: 2, coins: 0, owned: [...DEFAULT_OWNED], skin: 'ember', arena: 'valley', goal: 1, best: {}, runs: 0, xp: 0,
  stars: {}, awards: [], stats: { gems: 0, pops: 0, length: 0, sprites: 0, potions: 0, bosses: 0, roars: 0, bestRun: 0, places: 0, stars: 0 },
  played: [], quality: 'auto',
});

/** Loads any earlier save. Version 1 had coins, owned, skin, arena, best, runs, sound; all but sound carry over. */
export function migrate(raw: unknown): SaveData {
  const s = newSave();
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Partial<SaveData> & Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  s.coins = num(o.coins);
  s.runs = num(o.runs);
  if (Array.isArray(o.owned)) s.owned = [...new Set([...DEFAULT_OWNED, ...o.owned.filter((id) => SKINS.some((k) => k.id === id))])];
  if (SKINS.some((k) => k.id === o.skin) && s.owned.includes(o.skin as string)) s.skin = o.skin as string;
  if (ARENAS.some((a) => a.id === o.arena)) s.arena = o.arena as ArenaId;
  if (o.best && typeof o.best === 'object') for (const a of ARENAS) { const b = num((o.best as Record<string, unknown>)[a.id]); if (b > 0) s.best[a.id] = b; }
  if (o.v === 2) {
    s.goal = Math.max(0, Math.min(8, Math.round(num(o.goal, 1))));
    s.xp = num(o.xp);
    if (o.stars && typeof o.stars === 'object') for (const st of STAGES) { const v = num(o.stars[st.id]); if (v > 0) s.stars[st.id] = Math.min(3, Math.round(v)); }
    if (Array.isArray(o.awards)) s.awards = o.awards.filter((id) => AWARDS.some((a) => a.id === id));
    if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(s.stats) as StatKey[]) s.stats[k] = num(o.stats[k]);
    if (Array.isArray(o.played)) s.played = o.played.filter((id) => ARENAS.some((a) => a.id === id));
    if (o.quality === 'high' || o.quality === 'low') s.quality = o.quality;
  } else {
    // version 1: credit earlier play so an old player does not start from zero
    const bests = Object.values(s.best).map((b) => b ?? 0);
    s.stats.bestRun = Math.max(0, ...bests);
    s.xp = Math.round(s.runs * 30 + bests.reduce((a, b) => a + b, 0) / 40);
    s.played = ARENAS.filter((a) => s.best[a.id]).map((a) => a.id);
    s.stats.places = s.played.length;
  }
  return s;
}

export const totalStars = (s: SaveData) => Object.values(s.stars).reduce((a, b) => a + b, 0);
/** A place opens when the boss of the place before it is beaten. The first three are always open for free play. */
export const chapterOpen = (s: SaveData, chapter: number) => chapter === 0 || (s.stars[`${ARENAS[chapter - 1].id}-8`] ?? 0) > 0;
export const arenaOpen = (s: SaveData, chapter: number) => chapter < FREE_ARENAS || chapterOpen(s, chapter);
/** A goal opens when the goal before it has a star. */
export const stageOpen = (s: SaveData, st: Stage) => chapterOpen(s, st.chapter) && (st.n === 1 || (s.stars[`${st.arena}-${st.n - 1}`] ?? 0) > 0);

// Coins: fixed formulas, never random.
export const coinsFor = (length: number, defeats: number) => Math.floor(length / 100) + defeats * 5;
export const STAR_COINS = 20; // per new star
export const BOSS_COINS = 100; // first win over a boss
