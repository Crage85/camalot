// Board logic self-check + level bot. Not shipped (no page imports it).
// Run: npx rolldown src/games/match3/selftest.ts -o shots/match3/selftest.mjs -p node && node shots/match3/selftest.mjs
// Tune: node shots/match3/tune-all.mjs (runs `selftest.mjs tune` in parallel, then writes tuned.ts and shots/match3/balance.txt)
import { Board, isSpecial, type GoalType, type Kind, type LevelDef } from './board';
import { LEVELS, PER_WORLD, WORLDS } from './levels';

declare const process: { argv: string[] };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('FAIL: ' + msg);
}

const base = (rows: string[], extra: Partial<LevelDef> = {}): LevelDef => ({
  moves: 20, crown: 15, colors: 6, goals: [{ type: 'score', n: 1 }], stars: [1, 2], layout: rows.map((r) => r.replace(/[a-fA-F*]/g, '.')), ...extra,
});

/** Board with exact pieces: a-f = colors 0-5, A-F = same color as a wand ('h'), '*' = rainbow, '-' = hole. */
function make(rows: string[], extra: Partial<LevelDef> = {}, kinds: Record<string, Kind> = {}): Board {
  const b = new Board(base(rows, extra), 7);
  let id = 1000;
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const c = b.cells[b.idx(x, y)];
    if (/[a-f]/.test(ch)) c.piece = { id: id++, color: ch.charCodeAt(0) - 97, kind: 'n' };
    if (/[A-F]/.test(ch)) c.piece = { id: id++, color: ch.charCodeAt(0) - 65, kind: kinds[ch] ?? 'h' };
    if (ch === '*') c.piece = { id: id++, color: -1, kind: 'rainbow' };
  }));
  return b;
}

// 1. Swaps: a non-match reverts for free; a match clears, refills and settles.
{
  const b = make(['bcdef', 'cdefb', 'aabcd', 'defab', 'efabc']);
  const r = b.swap(b.idx(2, 2), b.idx(2, 3));
  assert(r && !r.ok && b.moves === 20, 'non-matching swap reverts and costs no move');
}
{
  const b = make(['bcdef', 'cdafb', 'aabcd', 'defab', 'efcbc']);
  const r = b.swap(b.idx(2, 2), b.idx(2, 1));
  assert(r && r.ok, 'matching swap is valid');
  assert(b.moves === 19, 'valid swap costs one move');
  assert(b.score > 0 && b.collected[0] >= 3, 'match scores and collects');
  assert(b.cells.every((c) => c.hole || c.piece), 'board refilled');
  assert(b.findGroups().length === 0, 'board settled with no matches left');
  assert(r.steps.some((s) => s.type === 'clear') && r.steps.some((s) => s.type === 'fall'), 'steps include clear and fall');
}

// 2. Four in a row makes a wand at the swapped cell (a row match makes a column wand).
{
  const b = make(['bcdefb', 'cdafec', 'aabaef', 'defbcd', 'efcbde']);
  const r = b.swap(b.idx(2, 2), b.idx(2, 1));
  assert(r && r.ok, '4-match swap valid');
  const p = r.steps.find((s) => s.type === 'clear')!.cells[b.idx(2, 2)].piece;
  assert(p && p.kind === 'v' && p.color === 0, 'horizontal 4 makes a column wand at the swap cell');
}

// 3. L shape makes a fire puff at the corner.
{
  const b = make(['adcefb', 'adefbc', 'baacdb', 'adefac', 'defcbd']);
  const r = b.swap(b.idx(0, 3), b.idx(0, 2));
  assert(r && r.ok, 'L swap valid');
  assert(r.steps.find((s) => s.type === 'clear')!.cells[b.idx(0, 2)].piece?.kind === 'bomb', 'L makes a fire puff');
}

// 4. Five in a row makes a rainbow orb.
{
  const b = make(['bcdefbc', 'cdaeefd', 'aabaaef', 'defbcde', 'efcbdef']);
  const r = b.swap(b.idx(2, 2), b.idx(2, 1));
  assert(r && r.ok, '5 swap valid');
  assert(r.steps.find((s) => s.type === 'clear')!.cells[b.idx(2, 2)].piece?.kind === 'rainbow', '5 in a row makes a rainbow orb');
}

// 5. A 2x2 square makes a dragonfly.
{
  const b = make(['bcdefb', 'caadfc', 'eabacf', 'defbcd', 'efcbde']);
  const r = b.swap(b.idx(3, 2), b.idx(2, 2));
  assert(r && r.ok, 'square swap valid');
  const made = r.steps.find((s) => s.type === 'clear')!.cells.filter((c) => c.piece?.kind === 'fly');
  assert(made.length === 1, 'square makes one dragonfly');
}

// 6. Tapping a wand clears its row.
{
  const b = make(['bcdef', 'cdefb', 'aBcab', 'defab', 'efabc']);
  const st = b.fire(b.idx(1, 2));
  assert(st, 'wand can be fired');
  const beforeFall = st[st.findIndex((s) => s.type === 'fall') - 1];
  for (let x = 0; x < 5; x++) assert(beforeFall.cells[b.idx(x, 2)].piece === null, 'row cleared at x=' + x);
  assert(b.moves === 19, 'firing costs a move');
}

// 7. Rainbow + plain piece clears every piece of that color.
{
  const b = make(['abcde', '*cdea', 'bcdeb', 'cdeac', 'deabd']);
  const r = b.swap(b.idx(0, 1), b.idx(0, 0));
  assert(r && r.ok, 'rainbow swap valid');
  assert(r.steps.find((s) => s.type === 'clear')!.cells.every((c) => c.piece?.color !== 0), 'all yarn cleared');
}

// 8. Wand + wand combo clears row and column.
{
  const b = make(['abcde', 'bcAde', 'cdBab', 'deabc', 'eabcd']);
  const r = b.swap(b.idx(2, 1), b.idx(2, 2));
  assert(r && r.ok, 'two specials always swap');
  const c = r.steps.find((s) => s.type === 'clear')!.cells;
  for (let k = 0; k < 5; k++) {
    assert(c[b.idx(k, 2)].piece === null, 'combo row cleared');
    assert(c[b.idx(2, k)].piece === null, 'combo column cleared');
  }
}

// 9. Cascades: falling pieces make more matches (seen across seeded boards).
{
  let cascades = 0;
  for (let s = 1; s < 40 && !cascades; s++) {
    const lv = new Board(LEVELS[0], s);
    const m = lv.findMove()!;
    const r = lv.swap(m[0], m[1]);
    if (r && r.steps.filter((x) => x.type === 'clear').length > 1) cascades++;
  }
  assert(cascades > 0, 'cascades happen');
}

// 10. No moves -> shuffle gives a board with a move and no matches.
{
  const b = make(['abab', 'cdcd', 'abab', 'cdcd'], { colors: 4 });
  assert(b.findMove() === null, 'test board starts with no move');
  const st = b.shuffleNow();
  assert(st.length === 1 && b.findMove() !== null && b.findGroups().length === 0, 'shuffle leaves a move and no match');
}
{
  // a hammer hit that leaves no move triggers an automatic shuffle
  const b = make(['abab', 'cdcd', 'abab', 'cdcd'], { colors: 4 });
  const st = b.hammer(0)!;
  assert(b.findMove() !== null, 'auto-shuffle after a dead board');
  void st;
}

// 11. Blockers: crate takes hits from adjacent matches, ice melts, stardust clears, vine grows when skipped.
{
  // row 2 starts as a match; a hammer hit elsewhere settles the board, which clears it next to the crate
  const b2 = make(['bcdef', 'cd1fb', 'aaacd', 'defab', 'efabc'], { goals: [{ type: 'crate' }] });
  b2.hammer(b2.idx(4, 4));
  assert(b2.cells[b2.idx(2, 1)].crate === 0, 'match next to a crate breaks it');
  assert(b2.remaining({ type: 'crate' }) === 0, 'crate goal done');
}
{
  const b = make(['bcdef', 'cdefb', 'aIcde', 'defab', 'efabc'], { goals: [{ type: 'ice' }] });
  // put an iced 'a' at (1,2) with layer 2 (layout 'I'), then hammer it twice
  b.cells[b.idx(1, 2)].ice = 2;
  b.cells[b.idx(1, 2)].piece = { id: 9999, color: 0, kind: 'n' };
  assert(!b.canSwap(b.idx(1, 2), b.idx(0, 2)), 'iced piece cannot move');
  b.hammer(b.idx(1, 2));
  assert(b.cells[b.idx(1, 2)].ice === 1 && b.cells[b.idx(1, 2)].piece?.id === 9999, 'one hit melts one ice layer, piece stays');
  b.hammer(b.idx(1, 2));
  assert(b.remaining({ type: 'ice' }) === 0, 'ice goal done');
}
{
  const b = new Board(LEVELS[22], 3);
  const start = b.remaining({ type: 'dust' });
  assert(start === 16, 'level 23 has 16 stardust tiles');
  for (let k = 0; k < 40 && b.remaining({ type: 'dust' }) === start; k++) {
    const m = b.findMove()!;
    if (m[0] === m[1]) b.fire(m[0]); else b.swap(m[0], m[1]);
  }
  assert(b.remaining({ type: 'dust' }) < start, 'matches clear stardust');
}
{
  const b = new Board(LEVELS[40], 5);
  const vines = b.remaining({ type: 'vine' });
  // a move far from vines lets them grow
  let grew = false;
  for (let k = 0; k < 10 && !grew; k++) {
    const m = b.findMove()!;
    const before = b.remaining({ type: 'vine' });
    const st = m[0] === m[1] ? b.fire(m[0]) : b.swap(m[0], m[1])?.steps;
    if (st?.some((s) => s.type === 'spread')) { grew = b.remaining({ type: 'vine' }) === before + 1; }
  }
  assert(vines > 0 && grew, 'vines spread when skipped');
}
{
  // kitten reaches the bottom and is rescued
  const b = make(['k', 'a', 'b', 'c'].map((r) => r + 'bcd'), { goals: [{ type: 'kitten', n: 1 }], colors: 4 });
  b.cells[0].piece = { id: 5000, color: -1, kind: 'kitten' };
  b.hammer(b.idx(0, 3));
  b.hammer(b.idx(0, 3));
  b.hammer(b.idx(0, 3));
  assert(b.rescued >= 1, 'kitten rescued at the bottom');
}

// 12. New blockers and goals.
const PLAIN = ['bcdef', 'cdafb', 'aabcd', 'defab', 'efcbc']; // swapping (2,2) up makes the row a-a-a at y=2
{
  // crab: caught when the piece on its tile clears
  const b = make(PLAIN, { goals: [{ type: 'crab' }] });
  b.cells[b.idx(0, 2)].crab = true;
  const r = b.swap(b.idx(2, 2), b.idx(2, 1));
  assert(r && r.ok && b.remaining({ type: 'crab' }) === 0, 'clearing the piece on a crab catches it');
  assert(r.steps.some((s) => s.fx.some((f) => f.t === 'catch')), 'catch effect is reported');
}
{
  // crab: scuttles one tile when the move catches none
  let hopped = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const b = make(PLAIN, { goals: [{ type: 'crab' }] });
    b.reseed(seed);
    b.cells[b.idx(4, 4)].crab = true;
    const r = b.swap(b.idx(2, 2), b.idx(2, 1))!;
    const hop = r.steps.flatMap((s) => s.fx).find((f) => f.t === 'hop');
    if (!hop || hop.t !== 'hop') continue; // a lucky cascade caught it
    hopped++;
    assert(hop.x === 4 && hop.y === 4 && Math.abs(hop.tx - 4) + Math.abs(hop.ty - 4) === 1, 'crab hops to a neighbour tile');
    assert(!b.cells[b.idx(4, 4)].crab && b.cells[b.idx(hop.tx, hop.ty)].crab && b.remaining({ type: 'crab' }) === 1, 'crab moved, not copied');
  }
  assert(hopped > 0, 'a missed crab scuttles');
}
{
  // trail: a match touching a groomed tile grooms all its tiles
  const b = make(PLAIN, { goals: [{ type: 'trail' }] });
  b.cells[b.idx(0, 2)].trail = true;
  const before = b.remaining({ type: 'trail' });
  b.swap(b.idx(2, 2), b.idx(2, 1));
  assert(b.cells[b.idx(1, 2)].trail && b.cells[b.idx(2, 2)].trail, 'match through a groomed tile spreads the trail');
  assert(b.remaining({ type: 'trail' }) <= before - 2, 'trail goal counts down');
}
{
  // trail: a wand fired from a groomed tile grooms its line
  const b = make(['bcdef', 'cdefb', 'aBcab', 'defab', 'efabc'], { goals: [{ type: 'trail' }] });
  b.cells[b.idx(1, 2)].trail = true;
  b.fire(b.idx(1, 2));
  for (let x = 0; x < 5; x++) assert(b.cells[b.idx(x, 2)].trail, 'wand from groomed snow grooms x=' + x);
}
{
  // egg: two hits, then a 3 by 3 burst
  const b = make(['bcdef', 'cdefb', 'aaacd', 'defab', 'efabc'], { goals: [{ type: 'egg' }] });
  const e = b.idx(2, 1);
  b.cells[e].piece = null;
  b.cells[e].egg = 2;
  b.hammer(b.idx(4, 4)); // settling clears the a-a-a row under the egg
  assert(b.cells[e].egg === 1, 'a match next to an egg cracks it once');
  const st = b.hammer(e)!;
  const k = st.findIndex((s) => s.fx.some((f) => f.t === 'hatch'));
  assert(k >= 0 && b.remaining({ type: 'egg' }) === 0, 'second hit hatches the egg');
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    assert(st[k + 1].cells[b.idx(2 + dx, 1 + dy)].piece === null, `hatch burst clears neighbour ${dx},${dy}`);
  }
}
{
  // boulder: ignores matches next to it, breaks from a wand line
  const b = make(['bcdef', 'cdefb', 'aaacd', 'defab', 'efabc'], { goals: [{ type: 'rock' }] });
  const r = b.idx(2, 1);
  b.cells[r].piece = null;
  b.cells[r].rock = 1;
  b.hammer(b.idx(4, 4));
  assert(b.cells[r].rock === 1, 'a match next to a boulder does nothing to it');
  b.cells[b.idx(0, 1)].piece = { id: 7777, color: 1, kind: 'h' };
  b.fire(b.idx(0, 1));
  assert(b.remaining({ type: 'rock' }) === 0, 'a wand line breaks the boulder');
}
{
  // special goal counts the specials she makes
  const b = make(['bcdefbc', 'cdaeefd', 'aabaaef', 'defbcde', 'efcbdef'], { goals: [{ type: 'special', n: 1 }] });
  assert(b.remaining(b.def.goals[0]) === 1, 'special goal starts unmet');
  b.swap(b.idx(2, 2), b.idx(2, 1));
  assert(b.made >= 1 && b.won(), 'making a special fills the special goal');
}

// 13. Every level loads: no starting match, has a move, goals start unmet, unique within its world.
assert(LEVELS.length === WORLDS.length * PER_WORLD && LEVELS.length === 240, '240 levels');
LEVELS.forEach((lv, n) => {
  const w = lv.layout[0].length;
  const h = lv.layout.length;
  assert(lv.layout.every((r) => r.length === w), `level ${n + 1} rows same width`);
  assert(w >= 5 && w <= 9 && h >= 5 && h <= 9, `level ${n + 1} board size`);
  assert(lv.layout.every((r) => /^[-.123viIgGjkcteRr]+$/.test(r)), `level ${n + 1} uses known tiles`);
  assert(lv.goals.length >= 1 && lv.goals.length <= 4, `level ${n + 1} has 1 to 4 goals`);
  assert(lv.moves >= 5 && lv.crown <= lv.moves - 2 && lv.stars[0] < lv.stars[1], `level ${n + 1} tuned numbers`);
  for (const g of lv.goals) if (g.type === 'collect') assert(g.color! < lv.colors, `level ${n + 1} collect color exists`);
  for (let x = 0; x < w; x++) {
    const col = lv.layout.map((r) => r[x]).join('');
    assert(/^-*[^-]+-*$/.test(col), `level ${n + 1} column ${x} is one run of tiles`);
    // rule-made levels keep kitten columns free of blockers that fill a tile (three hand-made ones do not)
    if (col.includes('k') && (n >= 60 || n % PER_WORLD >= 12)) assert(/^-*k[^123verR]*-*$/.test(col), `level ${n + 1} kitten column ${x} is open`);
  }
  const world = Math.floor(n / PER_WORLD);
  for (let m = world * PER_WORLD; m < n; m++) {
    assert(LEVELS[m].layout.join() !== lv.layout.join() || JSON.stringify(LEVELS[m].goals) !== JSON.stringify(lv.goals), `level ${n + 1} repeats level ${m + 1}`);
  }
  for (let s = 1; s <= 5; s++) {
    const b = new Board(lv, s * 101);
    assert(b.findGroups().length === 0, `level ${n + 1} starts without matches`);
    assert(b.findMove(), `level ${n + 1} starts with a move`);
    assert(!b.won(), `level ${n + 1} not already won`);
  }
});

console.log('selftest: all asserts passed');

// ---------- bot: greedy player. Tunes moves, crown moves and star scores for every level. ----------

const WEIGHT: Record<GoalType, number> = { score: 0.02, collect: 10, dust: 10, crate: 10, vine: 10, ice: 10, kitten: 40, crab: 14, trail: 5, egg: 12, rock: 16, special: 25 };

/** Plays one game with `budget` moves. need = moves used to win (Infinity if not won). With `tuned`, the score is what a win in `tuned` moves pays. */
function botPlay(lv: LevelDef, seed: number, budget: number, tuned = budget): { need: number; score: number } {
  const b = new Board({ ...lv, moves: budget }, seed);
  b.record = false;
  const types = new Set(lv.goals.map((g) => g.type));
  const wantSpecials = types.has('special') || types.has('rock');
  let rnd = seed >>> 0;
  const noise = () => ((rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0) / 4294967296) * 0.5;
  const value = (x: Board) => {
    let v = x.score * 0.02;
    for (const g of lv.goals) v -= x.remaining(g) * WEIGHT[g.type];
    x.cells.forEach((c, i) => {
      // layers left count too, so a hit that does not finish a blocker is still progress
      v -= c.crate * (types.has('crate') ? 4 : 1) + c.egg * (types.has('egg') ? 6 : 1) + c.rock * (types.has('rock') ? 8 : 1);
      if (types.has('ice')) v -= c.ice * 4;
      if (types.has('dust')) v -= c.dust * 3;
      if (c.piece?.kind === 'kitten') v += Math.floor(i / x.w) * 3;
      else if (wantSpecials && isSpecial(c.piece)) v += 6;
    });
    return v;
  };
  for (let turn = 0; turn < 200 && !b.won() && b.moves > 0; turn++) {
    let best: (() => unknown) | null = null;
    let bestV = -Infinity;
    for (let i = 0; i < b.cells.length; i++) {
      const [x, y] = b.xy(i);
      for (const j of [x + 1 < b.w ? i + 1 : -1, y + 1 < b.h ? i + b.w : -1]) {
        if (j < 0 || !b.canSwap(i, j)) continue;
        const t = b.clone();
        t.reseed(seed * 31 + turn * 7 + i);
        const r = t.swap(i, j);
        if (!r || !r.ok) continue;
        const v = value(t) + noise();
        if (v > bestV) { bestV = v; best = () => b.swap(i, j); }
      }
      if (isSpecial(b.cells[i].piece) && !b.cells[i].ice) {
        const t = b.clone();
        t.reseed(seed + i);
        if (t.fire(i)) { const v = value(t) - 2; if (v > bestV) { bestV = v; best = () => b.fire(i); } }
      }
    }
    if (!best) break;
    best();
  }
  if (!b.won()) return { need: Infinity, score: b.score };
  const need = budget - b.moves;
  b.moves = Math.max(0, tuned - need);
  b.finale();
  return { need, score: b.score };
}

/** Bot win rate the level aims for, in percent. */
function target(n: number): number {
  const k = n % PER_WORLD;
  let t = 95 - (15 * n) / (LEVELS.length - 1);
  if (k === PER_WORLD - 1) t -= 18;
  else if (k % 5 === 4) t -= 12;
  if (k < 3) t += 5;
  return Math.min(97, Math.round(t));
}

const goalText = (lv: LevelDef) => lv.goals.map((g) => g.type + (g.type === 'collect' ? g.color : '') + (g.n ? ':' + g.n : '')).join('+');

const levelKey = (lv: LevelDef) => lv.layout.join('/') + JSON.stringify(lv.goals);
// `keys`: what each level is right now, so the tuning script can tell which results are stale.
if (process.argv.includes('keys')) console.log(JSON.stringify(LEVELS.map(levelKey)));

// `tune <levels,comma,separated> [seeds]`: prints one JSON line per level. shots/match3/tune-all.mjs turns the lines into tuned.ts.
if (process.argv.includes('tune')) {
  const at = process.argv.indexOf('tune');
  const N = Number(process.argv[at + 2]) || 32;
  const BUDGET = 60;
  for (const n of process.argv[at + 1].split(',').map(Number)) {
    const lv = LEVELS[n];
    const tgt = target(n);
    // pass 1: how many moves does a win take?
    const needs = Array.from({ length: N }, (_, s) => botPlay(lv, 1000 + s * 17, BUDGET).need).sort((a, b) => a - b);
    const q = (p: number) => needs[Math.min(N - 1, Math.max(0, Math.ceil(p * N) - 1))];
    const solved = needs.filter((v) => v <= BUDGET).length / N;
    const out: Record<string, unknown> = { n, key: levelKey(lv), world: Math.floor(n / PER_WORLD), k: n % PER_WORLD, hard: !!lv.hard, goals: goalText(lv), size: lv.layout[0].length + 'x' + lv.layout.length, colors: lv.colors, target: tgt, solved };
    if (solved < 0.9 || !isFinite(q(tgt / 100))) { console.log(JSON.stringify({ ...out, reject: true })); continue; }
    // human allowance: +10% on normal levels, none on hard ones (so they stay hard); never under 12 moves
    const moves = Math.max(12, Math.ceil(q(tgt / 100) * (lv.hard ? 1 : 1.1)));
    const crown = Math.min(q(0.45), moves - 2);
    // pass 2: fresh boards at the tuned moves
    const runs = Array.from({ length: N }, (_, s) => botPlay(lv, 500000 + s * 31, moves + 5, moves));
    const share = (m: number) => Math.round((runs.filter((r) => r.need <= m).length / N) * 100);
    const wins = runs.filter((r) => r.need <= moves).map((r) => r.score).sort((a, b) => a - b);
    const med = wins[wins.length >> 1] ?? 0;
    const r100 = (v: number) => Math.max(100, Math.round(v / 100) * 100);
    const star2 = r100(med * 0.6);
    const star3 = Math.max(star2 + 100, r100(med * 0.95));
    console.log(JSON.stringify({
      ...out, moves, raw: q(tgt / 100), crown, win: share(moves), win5: share(moves + 5), crownWin: share(crown), star2, star3,
      p3: wins.length ? wins.filter((s) => s >= star3).length / wins.length : 0,
      p2: wins.length ? wins.filter((s) => s >= star2).length / wins.length : 0,
    }));
  }
}
