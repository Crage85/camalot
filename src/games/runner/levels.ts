// Level data for Kitty Cup Run. Every level is generated from its number, so level 7 is always the same level 7.
import { LAST_LEVEL, parTeamLvl, startCats, TRAP_MOVE, where, type TrapKind, type WorldId } from './data';

export type GateOp = '+' | '-' | 'x' | '÷' | '%';
export interface Gate {
  op: GateOp;
  n: number; // for '%': signed percent, +50 or -25
  then?: { op: GateOp; n: number }; // two-step gate: do the first step, then this one
}
export type GateMove = 'slide' | 'flip';

export type Item =
  | { kind: 'gates'; d: number; opts: Gate[]; move?: GateMove }
  | { kind: 'rival'; d: number; count: number; captain?: boolean }
  | { kind: 'trap'; d: number; trap: TrapKind; x: number; speed: number; phase: number }
  | { kind: 'coins'; d: number; x: number; n: number }
  | { kind: 'strays'; d: number; x: number; n: number };

export interface Level {
  n: number;
  world: WorldId;
  league: number;
  length: number; // distance from start to the penalty spot
  items: Item[];
  keeper: number; // goalkeeper strength: cats it takes to score
  start: number; // starting team the level is tuned for
  best: number; // cats left before the keeper with the best gate picks
  star2: number; // cats left after the goal for 2 stars
  star3: number; // and for 3 stars
  stadium: [number, number]; // a stretch of the run with stands on both sides
}

export const TRACK_HALF = 4; // half the track width, world units
export const MAX_COUNT = 999; // team size cap
export const GAP = 20; // distance between track sections
export const TRAP_LOSS = 0.85; // share of the team the generator expects to keep per trap

/** New gate kinds arrive one cup at a time through the Kitten League. */
export const FEATURES: { cup: number; name: string; text: string }[] = [
  { cup: 1, name: 'Sliding gates', text: 'Some gates slide side to side.' },
  { cup: 2, name: 'Three gates', text: 'Pick from three gates.' },
  { cup: 3, name: 'Flip gates', text: 'Some gates swap places. Watch the timing.' },
  { cup: 4, name: 'Percent gates', text: '+50% adds half your team.' },
  { cup: 5, name: 'Two-step gates', text: 'Do the first step, then the second.' },
  { cup: 6, name: 'Double rows', text: 'Two gate rows in a row. The order matters.' },
];

function step(c: number, op: GateOp, n: number): number {
  if (op === '+') return c + n;
  if (op === '-') return c - n;
  if (op === 'x') return c * n;
  if (op === '÷') return Math.floor(c / n);
  return Math.floor(c * (1 + n / 100));
}
export function applyGate(count: number, g: Gate, plusBoost = 1): number {
  let c = step(count, g.op, g.op === '+' ? Math.round(g.n * plusBoost) : g.n);
  if (g.then) c = step(c, g.then.op, g.then.n);
  return Math.max(0, Math.min(MAX_COUNT, c));
}
const sym = (op: GateOp, n: number) =>
  op === 'x' ? `×${n}` : op === '-' ? `−${n}` : op === '%' ? `${n > 0 ? '+' : '−'}${Math.abs(n)}%` : `${op}${n}`;
export const gateText = (g: Gate) => sym(g.op, g.n) + (g.then ? ' ' + sym(g.then.op, g.then.n) : '');
export const gateGood = (g: Gate) => applyGate(100, g) >= 100;
/** Index of the option that leaves the biggest team. */
export function bestOpt(count: number, opts: Gate[], plusBoost = 1): number {
  let bi = 0;
  opts.forEach((g, i) => {
    if (applyGate(count, g, plusBoost) > applyGate(count, opts[bi], plusBoost)) bi = i;
  });
  return bi;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const nice = (v: number) => Math.max(2, v >= 100 ? Math.round(v / 10) * 10 : v >= 20 ? Math.round(v / 5) * 5 : Math.round(v));

export function makeLevel(n: number): Level {
  const r = rng(n * 7919 + 13);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const w = where(n);
  const { league, match, cup } = w;
  const extra = w.endless ? Math.min(0.2, (n - LAST_LEVEL) * 0.002) : 0; // the Endless Cup keeps getting harder
  const sections = 8 + league * 2 + Math.floor(match / 5) + (w.final ? 1 : 0); // 8 to 18
  const items: Item[] = [];
  const start = startCats(parTeamLvl(n));
  let best = start; // team size with the best gate picks; keeps every level winnable

  const goodGate = (): Gate => {
    const roll = r();
    const plus: Gate = { op: '+', n: n <= 3 ? 4 + Math.floor(r() * 6) : nice(Math.max(5, best * (best > 500 ? 0.1 : 0.25 + r() * 0.5))) };
    if (best > 450 || roll < 0.4) return plus;
    if (cup >= 5 && roll < 0.52) return r() < 0.5 ? { op: 'x', n: 2, then: { op: '-', n: nice(best * 0.3) } } : { op: '+', n: nice(best * 0.2), then: { op: 'x', n: 2 } };
    if (cup >= 4 && roll < 0.64) return { op: '%', n: pick([50, 50, 100, 20]) };
    if (roll < 0.9 || best > 200) return { op: 'x', n: 2 };
    return { op: 'x', n: 3 };
  };
  const badGate = (): Gate => {
    const roll = r();
    if (roll < 0.45 || best < 6) return { op: '-', n: nice(Math.max(2, best * (0.2 + r() * 0.3))) };
    if (cup >= 4 && roll < 0.6) return { op: '%', n: pick([-25, -50]) };
    return { op: '÷', n: league >= 1 && r() < 0.3 ? 3 : 2 };
  };
  const gateRow = (d: number) => {
    const three = cup >= 2 && r() < 0.3;
    const opts = [goodGate(), n <= 2 || r() < 0.5 + league * 0.07 ? goodGate() : badGate()];
    if (three) opts.push(badGate());
    // No two options with the same result.
    for (let i = 1; i < opts.length; i++) while (opts.slice(0, i).some((o) => applyGate(best, o) === applyGate(best, opts[i]))) opts[i] = { op: '-', n: nice(best * (0.1 + r() * 0.5)) };
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    const mr = r();
    const move: GateMove | undefined = cup >= 3 && mr < 0.18 && !three ? 'flip' : cup >= 1 && mr < 0.4 ? 'slide' : undefined;
    items.push({ kind: 'gates', d, opts, move });
    best = Math.max(...opts.map((o) => applyGate(best, o)));
  };

  for (let i = 0; i < sections; i++) {
    const d = GAP + i * GAP;
    if (i % 2 === 0) {
      gateRow(d);
      if (cup >= 6 && r() < 0.3) gateRow(d + 8);
      if (r() < 0.6) items.push({ kind: 'coins', d: d - 10, x: pick([-2.2, 0, 2.2]), n: 5 });
      continue;
    }
    const roll = r();
    const lastEvent = i >= sections - 2;
    // Rivals and traps only show up once the team is big enough to lose some cats.
    if (w.derby && lastEvent && best >= 8) {
      const count = Math.max(3, Math.round(best * Math.min(0.75, 0.4 - league * 0.03 + extra)));
      items.push({ kind: 'rival', d, count, captain: true });
      best -= count;
    } else if (n >= 2 && best >= 8 && roll < 0.4) {
      const count = Math.max(2, Math.round(best * Math.min(0.7, 0.25 - league * 0.02 + match * 0.003 + extra)));
      items.push({ kind: 'rival', d, count });
      best -= count;
    } else if (n >= 3 && best >= 8 && roll < 0.82) {
      const trap = pick(w.world.traps);
      const mv = TRAP_MOVE[trap];
      const x = mv === 'spin' ? pick([-1.6, 1.6]) : mv === 'roll' || mv === 'pop' ? pick([-2, 0, 2]) : mv === 'wall' ? pick([-1.4, 1.4]) : 0;
      items.push({ kind: 'trap', d, trap, x, speed: 1.2 + r() * 0.6 + league * 0.15, phase: r() * 6.28 });
      best = Math.floor(best * TRAP_LOSS);
      if (league >= 2 && mv !== 'spin' && r() < 0.5) {
        items.push({ kind: 'trap', d: d + 7, trap, x: -x, speed: 1.3 + r() * 0.6, phase: r() * 6.28 });
        best = Math.floor(best * TRAP_LOSS);
      }
    } else {
      const k = 3 + Math.floor(r() * 4) + league * 2;
      items.push({ kind: 'strays', d, x: pick([-2, 2]), n: k });
      items.push({ kind: 'coins', d: d + 4, x: 0, n: 6 });
      best += k;
    }
  }
  // Level 1 teaches one small rival near the end.
  if (n === 1) {
    const count = Math.max(2, Math.round(best * 0.25));
    items.push({ kind: 'rival', d: GAP * sections + 4, count });
    best -= count;
  }
  const length = GAP * sections + 24;
  const keeper = Math.max(3, Math.round(best * Math.min(0.85, 0.3 - league * 0.02 + match * 0.003 + (w.final ? 0.12 : 0) + extra)));
  const left = best - keeper;
  const mid = GAP * Math.floor(sections / 2);
  return {
    n, world: w.world.id, league, length, items, keeper, start, best,
    star2: Math.max(1, Math.round(left * 0.3)), star3: Math.max(2, Math.round(left * 0.65)), stadium: [mid - 12, mid + 28],
  };
}
