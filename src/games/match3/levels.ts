// All Spellpaw levels: 12 worlds of 20. Layout legend: board.ts LEGEND.
// Colors: 0 flame crystal, 1 sun sigil, 2 star prism, 3 leaf rune, 4 tide orb, 5 moon sigil.
// Moves, crown-challenge moves and star scores live in tuned.ts, written by the bot (selftest.ts tune).
import type { Goal, GoalType, LevelDef } from './board';
import { SALT, TUNED } from './tuned';

export const PER_WORLD = 20;
export const WORLDS: { name: string; from: number; adds: string }[] = [
  { name: 'Verdant Reach', adds: 'Sealed Crates: match beside one to break it.' },
  { name: 'Frostspire', adds: 'Frost Seals, Miasma, and cat mages to rescue.' },
  { name: 'Wyrmwood', adds: 'Thornvines that spread, and a sixth gem.' },
  { name: 'Tidebreak Coast', adds: 'Scuttlers: match the gem above one to catch it.' },
  { name: 'Rimepeak', adds: 'Frost Paths: spread the path over every tile.' },
  { name: 'Ember Roost', adds: 'Dragon Eggs that hatch in a burst of fire.' },
  { name: 'Runestone Canyon', adds: 'Runestones that only specials can break.' },
  { name: 'Astral Hall', adds: 'Spell goals: forge specials to win.' },
  { name: 'Arcane Arena', adds: 'Every hazard so far, combined.' },
  { name: 'Skyhold', adds: 'Larger boards and three goals at once.' },
  { name: 'Aurora Lake', adds: 'Tougher mixes with fewer moves to spare.' },
  { name: 'Crown Summit', adds: 'The hardest levels in the citadel.' },
].map((w, k) => ({ ...w, from: k * PER_WORLD }));

type Draft = Pick<LevelDef, 'colors' | 'goals' | 'layout' | 'tip'>;

const open = (w: number, h: number) => Array.from({ length: h }, () => '.'.repeat(w));

// ---------- the first 12 levels of worlds 1 to 3, made by hand ----------

const OLD: Draft[] = [
  // ---- Yarn Meadow ----
  { colors: 4, goals: [{ type: 'score', n: 3000 }], layout: open(7, 7),
    tip: 'Swap two adjacent gems to line up 3.' },
  { colors: 4, goals: [{ type: 'collect', color: 0, n: 35 }], layout: open(7, 8),
    tip: 'Match 4 in a row to forge a Line Spell. It clears a whole line.' },
  { colors: 5, goals: [{ type: 'collect', color: 1, n: 25 }, { type: 'collect', color: 4, n: 25 }], layout: open(8, 8),
    tip: 'Match 5 in an L or T to forge a Burst Sigil.' },
  { colors: 5, goals: [{ type: 'score', n: 3500 }], layout: [
    '-......-',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '-......-',
  ], tip: 'Match a 2 by 2 square to summon a Familiar. It homes in on a goal.' },
  { colors: 5, goals: [{ type: 'crate' }], layout: [
    '........',
    '........',
    '........',
    '.1.22.1.',
    '.1.22.1.',
    '........',
    '........',
    '........',
  ], tip: 'Match beside a Sealed Crate to break it.' },
  { colors: 5, goals: [{ type: 'collect', color: 2, n: 25 }], layout: open(8, 8),
    tip: 'Match 5 in a straight row for a Prism Nova. Swap it with any gem.' },
  { colors: 5, goals: [{ type: 'collect', color: 3, n: 25 }, { type: 'collect', color: 0, n: 25 }], layout: [
    '---...---',
    '--.....--',
    '-.......-',
    '.........',
    '.........',
    '.........',
    '-.......-',
    '--.....--',
    '---...---',
  ] },
  { colors: 5, goals: [{ type: 'crate' }], layout: [
    '........',
    '........',
    '..2222..',
    '..2..2..',
    '..2..2..',
    '..2222..',
    '........',
    '........',
  ], tip: 'Dark crates take two hits.' },
  { colors: 5, goals: [{ type: 'score', n: 9000 }], layout: open(9, 9),
    tip: 'Swap two specials together for a combo.' },
  { colors: 5, goals: [{ type: 'crate' }, { type: 'collect', color: 4, n: 30 }], layout: [
    '........',
    '........',
    '........',
    '1..11..1',
    '1..22..1',
    '........',
    '........',
    '........',
    '........',
  ] },
  { colors: 5, goals: [{ type: 'collect', color: 0, n: 25 }, { type: 'collect', color: 1, n: 25 }], layout: [
    '-..---..-',
    '.........',
    '.........',
    '.........',
    '-.......-',
    '--.....--',
    '---...---',
    '----.----',
  ] },
  { colors: 5, goals: [{ type: 'crate' }], layout: [
    '.........',
    '.........',
    '.........',
    '1.1.1.1.1',
    '2.2.2.2.2',
    '.........',
    '...333...',
    '.........',
    '.........',
  ] },

  // ---- Frost Tower ----
  { colors: 5, goals: [{ type: 'ice' }], layout: [
    '........',
    '........',
    '.i....i.',
    '...II...',
    '...II...',
    '.i....i.',
    '........',
    '........',
  ], tip: 'A Frost Seal locks a gem in place. Match the gem to break the seal.' },
  { colors: 5, goals: [{ type: 'ice' }, { type: 'collect', color: 1, n: 20 }], layout: [
    '........',
    '.I....I.',
    '........',
    '..i..i..',
    '..i..i..',
    '........',
    '.I....I.',
    '........',
  ], tip: 'Thick Frost Seals take two matches.' },
  { colors: 5, goals: [{ type: 'dust' }], layout: [
    '........',
    '........',
    '..gggg..',
    '..gGGg..',
    '..gGGg..',
    '..gggg..',
    '........',
    '........',
  ], tip: 'Match on top of Miasma to clear it.' },
  { colors: 5, goals: [{ type: 'dust' }], layout: [
    '........',
    '.gg..gg.',
    '.gGggGg.',
    '..gggg..',
    '..gggg..',
    '.gGggGg.',
    '.gg..gg.',
    '........',
  ], tip: 'Dense Miasma takes two matches.' },
  { colors: 5, goals: [{ type: 'kitten', n: 2 }], layout: [
    '...k....',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
  ], tip: 'Clear the gems under a cat mage. A mage that reaches the bottom row is rescued.' },
  { colors: 5, goals: [{ type: 'kitten', n: 3 }, { type: 'crate' }], layout: [
    '..k..k..',
    '........',
    '........',
    '.1....1.',
    '.1....1.',
    '........',
    '........',
    '........',
  ] },
  { colors: 5, goals: [{ type: 'dust' }, { type: 'ice' }], layout: [
    '........',
    '.gg..gg.',
    '.gj..jg.',
    '...gg...',
    '...gg...',
    '.gj..jg.',
    '.gg..gg.',
    '........',
  ] },
  { colors: 5, goals: [{ type: 'ice' }, { type: 'collect', color: 2, n: 30 }], layout: [
    '-.....-',
    '.......',
    '.......',
    '..i.i..',
    '.......',
    '..i.i..',
    '.......',
    '.......',
    '-.....-',
  ] },
  { colors: 5, goals: [{ type: 'kitten', n: 3 }, { type: 'ice' }], layout: [
    '.k....k.',
    '........',
    '........',
    '..i..i..',
    '........',
    '.i....i.',
    '........',
    '........',
    '........',
  ] },
  { colors: 5, goals: [{ type: 'dust' }], layout: [
    '.........',
    '.GGGGGGG.',
    '.G.....G.',
    '.G.....G.',
    '.G.....G.',
    '.G.....G.',
    '.G.....G.',
    '.GGGGGGG.',
    '.........',
  ] },
  { colors: 5, goals: [{ type: 'kitten', n: 3 }, { type: 'crate' }], layout: [
    '...k....',
    '........',
    '.3....3.',
    '........',
    '...22...',
    '........',
    '........',
    '........',
    '........',
  ] },
  { colors: 5, goals: [{ type: 'dust' }, { type: 'ice' }, { type: 'crate' }], layout: [
    '.........',
    '.2.....2.',
    '..j.j.j..',
    '..gIgIg..',
    '..ggggg..',
    '..gIgIg..',
    '..j.j.j..',
    '.3.....3.',
    '.........',
  ] },

  // ---- Dragon Garden ----
  { colors: 5, goals: [{ type: 'vine' }], layout: [
    '........',
    '........',
    '........',
    '........',
    '........',
    '..v..v..',
    '.vv..vv.',
    'v.v..v.v',
  ], tip: 'Thornvines spread on any turn you leave them alone. Match beside one to cut it.' },
  { colors: 5, goals: [{ type: 'vine' }, { type: 'collect', color: 3, n: 25 }], layout: [
    '........',
    '........',
    '........',
    '...vv...',
    '..v..v..',
    '........',
    'v......v',
    'vv....vv',
  ] },
  { colors: 6, goals: [{ type: 'score', n: 5000 }], layout: open(9, 9),
    tip: 'Six gem types now. Look for specials.' },
  { colors: 5, goals: [{ type: 'vine' }, { type: 'dust' }], layout: [
    '........',
    '........',
    '.gggggg.',
    '.gGGGGg.',
    '.gg..gg.',
    '........',
    '..v..v..',
    'v......v',
    'vv....vv',
  ] },
  { colors: 5, goals: [{ type: 'kitten', n: 3 }, { type: 'vine' }], layout: [
    '..k..k..',
    '........',
    '........',
    '........',
    '........',
    '........',
    'v......v',
    '.v....v.',
    '..v..v..',
  ] },
  { colors: 5, goals: [{ type: 'crate' }, { type: 'ice' }], layout: [
    '--.....--',
    '-...2...-',
    '.........',
    '..I...I..',
    '.2.....2.',
    '..I...I..',
    '.........',
    '-.......-',
    '--.....--',
  ] },
  { colors: 6, goals: [{ type: 'collect', color: 0, n: 25 }, { type: 'collect', color: 5, n: 25 }], layout: open(9, 8) },
  { colors: 5, goals: [{ type: 'vine' }, { type: 'crate' }], layout: [
    '.........',
    '.........',
    '.........',
    '.3.....3.',
    '...vvv...',
    '...v.v...',
    '.v.....v.',
    'vv.....vv',
    '.........',
  ] },
  { colors: 5, goals: [{ type: 'dust' }, { type: 'ice' }], layout: [
    '.........',
    '.GG...GG.',
    '.GI...IG.',
    '...ggg...',
    '...gIg...',
    '...ggg...',
    '.GI...IG.',
    '.GG...GG.',
    '.........',
  ] },
  { colors: 5, goals: [{ type: 'kitten', n: 4 }, { type: 'vine' }], layout: [
    '.k.....k.',
    '.........',
    '.........',
    '.........',
    '....v....',
    '...vvv...',
    '.........',
    'v.......v',
    'vv.....vv',
  ] },
  { colors: 5, goals: [{ type: 'kitten', n: 2 }, { type: 'dust' }, { type: 'crate' }], layout: [
    '-...k...-',
    '.........',
    '.2.....2.',
    '..ggggg..',
    '..gIgIg..',
    '..ggggg..',
    '.2.....2.',
    '...v.v...',
    '-.......-',
  ] },
  { colors: 5, goals: [{ type: 'kitten', n: 2 }, { type: 'dust' }, { type: 'crate' }, { type: 'vine' }], layout: [
    '..k...k..',
    '.........',
    '.3.ggg.3.',
    '...gjg...',
    '.i.ggg.i.',
    '.........',
    '.2.....2.',
    'v.......v',
    'vv.....vv',
  ] },
];

// ---------- hand-made first levels of the later worlds ----------

const INTRO: Record<number, Draft> = {
  // Seashell Shore: crabs
  60: { colors: 5, goals: [{ type: 'crab' }], layout: [
    '........', '........', '..c..c..', '........', '........', '........', '........', '........',
  ], tip: 'A Scuttler hides under a gem. Match that gem to catch it.' },
  61: { colors: 5, goals: [{ type: 'crab' }], layout: [
    '........', '.c....c.', '........', '........', '........', '.c....c.', '........', '........',
  ], tip: 'If a move catches no Scuttler, each one moves a tile.' },
  62: { colors: 5, goals: [{ type: 'crab' }, { type: 'crate' }], layout: [
    '-......-', '........', '..c..c..', '.1....1.', '.1....1.', '...cc...', '........', '-......-',
  ], tip: 'Familiars hunt Scuttlers for you.' },
  // Powder Peak: ski trails
  80: { colors: 5, goals: [{ type: 'trail' }], layout: [
    '......', '.tttt.', '.tttt.', '.tttt.', '.tttt.', '......',
  ], tip: 'Frost Path spreads. Make a match that touches a path tile.' },
  81: { colors: 5, goals: [{ type: 'trail' }], layout: [
    't.t.t.t', 't.t.t.t', 't.t.t.t', 't.t.t.t', 't.t.t.t', 't.t.t.t', 't.t.t.t',
  ], tip: 'A Line Spell cast from the path extends it along the whole line.' },
  82: { colors: 5, goals: [{ type: 'trail' }], layout: [
    'ttt.ttt', 'tt...tt', 't.....t', '.......', 't.....t', 'tt...tt', 'ttt.ttt',
  ], tip: 'Cover every tile to finish the Frost Path.' },
  // Ember Roost: dragon eggs
  100: { colors: 5, goals: [{ type: 'egg' }], layout: [
    '........', '........', '........', '..e..e..', '........', '........', '........', '........',
  ], tip: 'Match beside a Dragon Egg twice. It hatches in a burst of fire.' },
  101: { colors: 5, goals: [{ type: 'egg' }], layout: [
    '........', '.e....e.', '........', '........', '........', '........', '.e....e.', '........',
  ], tip: 'A hatching egg clears the tiles around it.' },
  102: { colors: 5, goals: [{ type: 'egg' }, { type: 'crate' }], layout: [
    '........', '........', '.1e..e1.', '........', '........', '.1e..e1.', '........', '........',
  ], tip: 'Hatch an egg beside crates to break them too.' },
  // Canyon Mine: boulders
  120: { colors: 5, goals: [{ type: 'rock' }], layout: [
    '........', '........', '........', '..r..r..', '........', '........', '........', '........',
  ], tip: 'Only specials break Runestones. Aim a Line Spell down their row.' },
  121: { colors: 5, goals: [{ type: 'rock' }], layout: [
    '........', '.r....r.', '........', '........', '........', '........', '.r....r.', '........',
  ], tip: 'Burst Sigils and Familiars break Runestones too.' },
  122: { colors: 5, goals: [{ type: 'rock' }], layout: [
    '........', '........', '..R..R..', '........', '........', '.r....r.', '........', '........',
  ], tip: 'Dark Runestones take two hits.' },
  // Starlight Ballroom: make specials
  140: { colors: 4, goals: [{ type: 'special', n: 3 }], layout: open(8, 8),
    tip: 'Forge specials to fill the goal: match 4, match 5, or a square.' },
  141: { colors: 5, goals: [{ type: 'special', n: 4 }], layout: open(9, 8),
    tip: 'Every Line Spell, Burst Sigil, Familiar and Prism Nova counts.' },
  142: { colors: 5, goals: [{ type: 'special', n: 5 }, { type: 'collect', color: 2, n: 25 }], layout: [
    '-......-', '........', '........', '........', '........', '........', '........', '-......-',
  ] },
};

// ---------- rule-made levels ----------
// A level = one hand-drawn board mask + blocker stamps placed by rule + goals, all picked by a seeded
// generator from the level number. Moves and star scores are never set here: the bot tunes them (tuned.ts).

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rows = (s: string) => s.split('/');
/** Board shapes. Left-right symmetric; every column is one unbroken run of tiles. */
const MASKS: string[][] = [
  open(7, 7), open(8, 8), open(7, 8), open(8, 7), open(9, 7), open(7, 9), open(8, 9), open(9, 8), open(9, 9),
  rows('-......-/......../......../......../......../......../......../-......-'),
  rows('--....--/-......-/......../......../......../......../........'),
  rows('......../......../......../......../......../-......-/--....--'),
  rows('--...--/-.....-/......./......./......./......./-.....-/--...--'),
  rows('---...---/--.....--/-.......-/........./........./........./........./.........'),
  rows('---...---/--.....--/-.......-/........./........./........./-.......-/--.....--/---...---'),
  rows('--.....--/--.....--/........./........./........./........./........./--.....--/--.....--'),
  rows('-..---..-/........./........./........./-.......-/--.....--/---...---/----.----'),
  rows('........./........./........./........./........./-.......-/--.....--/---...---'),
  rows('--.....--/-.......-/........./........./........./........./........./-.......-/--.....--'),
  rows('.-.-.-.-./........./........./........./........./........./........./.........'),
  rows('...--.../...--.../......../......../......../......../......../........'),
  rows('......../......../......../......../......../......../...--.../...--...'),
  rows('.--..--./......../......../......../......../......../......../.--..--.'),
  rows('-.......-/-.......-/........./........./........./........./........./-.......-/-.......-'),
];
const SIMPLE = 13; // masks before this index are the plainer shapes, used early in a world

type Pat = (ax: number, ay: number, cx: number, cy: number, y: number, h: number) => boolean;
const near = (a: number, b: number) => Math.abs(a - b) < 0.3;
/** Stamp shapes. ax, ay = distance from the board centre, so every stamp is symmetric. */
const PATS: Record<string, Pat> = {
  block: (ax, ay) => ax < 1.1 && ay < 1.1,
  ring: (ax, ay) => { const m = Math.max(ax, ay); return m > 1.4 && m < 2.6; },
  corners: (ax, ay, cx, cy) => cx - ax > 0.9 && cx - ax < 2.1 && cy - ay > 0.9 && cy - ay < 2.1,
  midrow: (_ax, ay) => ay < 0.6,
  cols: (ax, ay, cx, cy) => near(cx - ax, 1) && ay < cy - 0.9,
  checker: (ax, ay) => ay < 1.6 && (Math.floor(ax) + Math.floor(ay)) % 2 === 0,
  diag: (ax, ay) => Math.abs(ax - ay) < 0.3 && ax > 0.6,
  frame: (ax, ay, cx, cy) => (near(cx - ax, 1) && cy - ay > 0.9) || (near(cy - ay, 1) && cx - ax > 0.9),
  sides: (ax, ay, cx) => cx - ax < 1.1 && ay < 1.6,
  bottom: (ax, _ay, _cx, _cy, y, h) => y >= h - 2 && (Math.floor(ax) % 2 === 0 || y === h - 1),
  low: (ax, _ay, cx, _cy, y, h) => y === h - 3 && cx - ax > 0.9,
  wide: (ax, ay, cx, cy) => cx - ax > 0.9 && cy - ay > 0.9,
};

/** tier = which char (thin, thick, thickest) by position in the world. n = how many at level 1 and at level 20 of a world. '' = scattered. */
const FEAT: Record<string, { ch: string[]; pats: string[]; n: [number, number]; solid: boolean; goal: GoalType }> = {
  crate: { ch: ['1', '2', '3'], pats: ['block', 'ring', 'corners', 'midrow', 'cols', 'checker', 'diag', 'sides', 'low'], n: [6, 14], solid: true, goal: 'crate' },
  ice: { ch: ['i', 'I', 'I'], pats: ['corners', 'checker', 'diag', 'block', 'sides', 'ring'], n: [5, 12], solid: false, goal: 'ice' },
  dust: { ch: ['g', 'G', 'G'], pats: ['block', 'ring', 'frame', 'checker', 'midrow', 'diag', 'wide'], n: [8, 26], solid: false, goal: 'dust' },
  vine: { ch: ['v', 'v', 'v'], pats: ['bottom', 'sides', 'corners', 'low'], n: [4, 9], solid: true, goal: 'vine' },
  crab: { ch: ['c', 'c', 'c'], pats: ['', 'diag', 'corners', 'ring'], n: [3, 7], solid: false, goal: 'crab' },
  trail: { ch: ['t', 't', 't'], pats: ['block', 'midrow', 'corners', 'diag', 'cols'], n: [18, 9], solid: false, goal: 'trail' },
  egg: { ch: ['e', 'e', 'e'], pats: ['corners', 'cols', '', 'sides', 'diag'], n: [3, 6], solid: true, goal: 'egg' },
  rock: { ch: ['r', 'r', 'R'], pats: ['corners', 'sides', '', 'cols'], n: [2, 6], solid: true, goal: 'rock' },
};
/** What each world brings in. Worlds 8 and up mix everything. */
const INTRODUCED = [['crate'], ['ice', 'dust', 'kitten'], ['vine'], ['crab'], ['trail'], ['egg'], ['rock'], ['special']];
const CLASH: [string, string][] = [['rock', 'kitten'], ['rock', 'trail'], ['egg', 'kitten']];

/** Places up to `want` of `ch` on free tiles of the stamp, in mirror pairs. Returns how many were placed. */
function put(g: string[][], ch: string, pat: Pat | null, want: number, r: () => number, solid: boolean, skip: Set<number>): number {
  const h = g.length;
  const w = g[0].length;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const ok = (x: number, y: number) => g[y][x] === '.' && !(solid && (y === 0 || skip.has(x)));
  const cand: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= cx; x++) {
      if (ok(x, y) && ok(w - 1 - x, y) && (!pat || pat(Math.abs(x - cx), Math.abs(y - cy), cx, cy, y, h))) cand.push([x, y]);
    }
  }
  const total = cand.reduce((a, [x]) => a + (x === w - 1 - x ? 1 : 2), 0);
  if (!pat || total > want * 1.6) {
    for (let k = cand.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [cand[k], cand[j]] = [cand[j], cand[k]];
    }
  }
  let n = 0;
  for (const [x, y] of cand) {
    if (n >= want || (pat && total <= want * 1.6 && n >= want * 1.6)) break;
    g[y][x] = ch;
    g[y][w - 1 - x] = ch;
    n += x === w - 1 - x ? 1 : 2;
  }
  return n;
}

function plan(w: number, k: number, r: () => number): { feats: string[]; colors: number } {
  const earlier = INTRODUCED.slice(0, Math.min(w, 8)).flat();
  const own = w < 8 ? INTRODUCED[w] : [];
  const feats: string[] = [];
  const pick = (pool: string[]) => {
    const p = pool.filter((f) => !feats.includes(f) && !CLASH.some(([a, b]) => (f === a && feats.includes(b)) || (f === b && feats.includes(a))));
    if (p.length) feats.push(p[Math.floor(r() * p.length)]);
  };
  if (w < 8) {
    // the 4th level of each five is a breather without the world's new thing
    if (k % 5 !== 3) feats.push(own[k % own.length]);
    const extra = k < 5 ? 0 : k < 12 ? (r() < 0.6 ? 1 : 0) : r() < 0.45 ? 2 : 1;
    const pool = w === 1 ? [...own, ...earlier] : earlier;
    for (let i = 0; i < extra + (feats.length ? 0 : 1); i++) pick(pool);
  } else {
    const n = k < 6 ? 2 : k % 5 === 4 || k > 14 || r() < 0.5 ? 3 : 2;
    for (let i = 0; i < n; i++) pick(earlier);
  }
  const calm = feats.includes('trail') || feats.includes('special');
  const six = w === 2 ? k % 3 === 2 : w > 2 && !calm && r() < (k % 5 === 4 ? 0.5 : 0.12);
  return { feats, colors: six ? 6 : 5 };
}

function build(n: number, salt: number): Draft {
  const w = Math.floor(n / PER_WORLD);
  const k = n % PER_WORLD;
  const r = mulberry(n * 7919 + salt * 104729 + 13);
  const { feats, colors } = plan(w, k, r);
  const tier = k < 7 ? 0 : k < 14 ? 1 : 2;
  const depth = w < 8 ? k / 19 : 0.4 + (0.6 * k) / 19; // how far along the blocker counts are; mix worlds start fuller
  const cellsOf = (m: string[]) => m.join('').split('.').length - 1;
  let pool = w >= 8 || k >= 10 ? MASKS : MASKS.slice(0, SIMPLE);
  if (feats.includes('trail')) pool = pool.filter((m) => cellsOf(m) <= 56);
  const g = pool[Math.floor(r() * pool.length)].map((row) => [...row]);
  const W = g[0].length;
  let solidLeft = Math.floor(cellsOf(g.map((row) => row.join(''))) * 0.3);
  const goals: Goal[] = [];
  const skip = new Set<number>(); // kitten columns stay free of blockers that fill a tile
  if (feats.includes('kitten')) {
    const x = Math.floor(r() * Math.ceil(W / 2));
    for (const c of new Set([x, W - 1 - x])) {
      g[g.findIndex((row) => row[c] === '.')][c] = 'k';
      skip.add(c);
    }
    goals.push({ type: 'kitten', n: 2 + Math.floor(k / 8) });
  }
  for (const f of feats) {
    const F = FEAT[f];
    if (!F) continue;
    let want = Math.round(F.n[0] + (F.n[1] - F.n[0]) * depth * (0.7 + 0.6 * r()));
    if (F.solid) want = Math.min(want, solidLeft);
    const name = F.pats[Math.floor(r() * F.pats.length)];
    const placed = want > 0 ? put(g, F.ch[tier], name ? PATS[name] : null, want, r, F.solid, skip) : 0;
    if (F.solid) solidLeft -= placed;
    if (placed) goals.push({ type: F.goal });
  }
  if (feats.includes('special')) goals.push({ type: 'special', n: 3 + Math.round((k / 19) * 5) + (w > 7 ? 1 : 0) });
  // one blocker goal alone is a short level: add pieces to collect (grooming a whole trail is long enough)
  if (goals.length < 2 && !goals.some((g) => g.type === 'trail')) {
    if (goals.length === 0 && r() < 0.3) goals.push({ type: 'score', n: 3000 + 500 * Math.floor(k / 2) + 1000 * Math.floor(r() * 3) });
    else {
      const c = Math.floor(r() * colors);
      const amount = () => 20 + 5 * Math.floor(r() * 3) + (k >= 10 ? 5 : 0);
      goals.push({ type: 'collect', color: c, n: amount() });
      if (goals.length === 1 && r() < 0.6) goals.push({ type: 'collect', color: (c + 1 + Math.floor(r() * (colors - 1))) % colors, n: amount() });
    }
  }
  return { colors, goals, layout: g.map((row) => row.join('')) };
}

const key = (d: Draft) => d.layout.join('/') + JSON.stringify(d.goals);

/** Every level without its tuned numbers. The tuning script (selftest.ts) reads this. */
export const DRAFTS: Draft[] = [];
for (let n = 0; n < WORLDS.length * PER_WORLD; n++) {
  const w = Math.floor(n / PER_WORLD);
  const k = n % PER_WORLD;
  let d: Draft | undefined = w < 3 && k < 12 ? OLD[w * 12 + k] : INTRO[n];
  const taken = new Set(DRAFTS.slice(w * PER_WORLD).map(key));
  // SALT (tuned.ts): the bot check bumps it for a rule-made level it rejected, to draw a different one
  for (let salt = SALT[n] ?? 0; !d || taken.has(key(d)); salt++) d = build(n, salt);
  DRAFTS.push(d);
}

export const LEVELS: LevelDef[] = DRAFTS.map((d, n) => {
  const [moves, crown, star2, star3] = TUNED[n];
  return { ...d, moves, crown, stars: [star2, star3], ...(n % 5 === 4 ? { hard: true } : {}) };
});
