// The rules of a run with no drawing: movement, tracks, catching, computer skiers, terrain, goals.
// No three.js and no DOM, so shots/trail/balance.ts can play thousands of runs in Node.
import { Field } from './field';
import {
  BOT_KINDS, BOT_NAMES, BOT_RESPAWN, GRID, MARKS, PALETTE, PERK, PLAYER_SPEED, REVIVE_SAFE, START_R, TIERS,
  type GoalKind, type Kind, type Mountain, type RunDef,
} from './data';

export type Style = 'cautious' | 'greedy' | 'hunter';
const STYLE: Record<Style, { speed: number; out: [number, number]; nervous: number; maxTrail: number }> = {
  cautious: { speed: 0.9, out: [4, 8], nervous: 7, maxTrail: 26 },
  greedy: { speed: 0.96, out: [10, 18], nervous: 3.5, maxTrail: 75 },
  hunter: { speed: 1, out: [6, 10], nervous: 5, maxTrail: 40 },
};
const STYLES: Style[] = ['cautious', 'greedy', 'hunter'];
const CELLS = GRID * GRID;
export const pctOf = (cells: number) => (cells / CELLS) * 100;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export const ICE = 1, POWDER = 2, JUMP = 3;

export interface Pt { x: number; z: number }
interface Ai { out: [number, number]; nervous: number; maxTrail: number; hunt: number; calm: number; rest: number; blunder: number }

/** How the player's skier is set up; `auto` lets the balance sim steer it like an average player. */
export interface PlayerCfg {
  name: string;
  kind: Kind;
  color: number;
  fur: number;
  speed: number;
  turn: number;
  startR: number;
  gold?: boolean;
  auto?: { out: [number, number]; nervous: number; maxTrail: number; hunt: number; blunder: number };
}

export interface SimSkier {
  id: number;
  name: string;
  human: boolean;
  champ: boolean;
  kind: Kind;
  fur: number;
  gold: boolean;
  color: number;
  x: number;
  z: number;
  heading: number;
  want: number;
  turnVel: number;
  speed: number;
  turn: number;
  cx: number;
  cy: number;
  alive: boolean;
  respawn: number;
  safe: number;
  air: number; // seconds left in a jump
  trailCells: number;
  kills: number;
  pts: number[]; // open track: x, z, heading triples
  ai: Ai | null;
  plan: Pt[];
  goingHome: boolean;
  home: Pt | null;
  think: number;
  daze: number;
  recent: number[]; // the last four cells entered
  recentAt: number;
  rest: number;
  chase: number;
  startR: number;
}

export type SimEvent =
  | { t: 'down'; who: SimSkier; by: SimSkier | null; how: 'self' | 'cut' | 'bump' | 'wiped' }
  | { t: 'claim'; who: SimSkier; gained: number }
  | { t: 'jump'; who: SimSkier }
  | { t: 'win' };

/** Small seeded random so a mountain's terrain is the same every run. */
export function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Terrain { tiles: Uint8Array; jumps: Pt[]; marks: Pt[] }

/** Ice, deep powder, jump ramps and the five landmarks of a mountain, from its place in the campaign. */
export function makeTerrain(m: Mountain, index: number): Terrain {
  const rnd = mulberry(index * 7919 + 13);
  const tiles = new Uint8Array(CELLS);
  const blob = (kind: number) => {
    const cx = 8 + rnd() * (GRID - 16), cy = 8 + rnd() * (GRID - 16), r = 3.2 + rnd() * 2.6, ph = rnd() * 6, lobes = 2 + Math.floor(rnd() * 3);
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (x < 1 || y < 1 || x >= GRID - 1 || y >= GRID - 1) continue;
        const a = Math.atan2(y - cy, x - cx);
        if (Math.hypot(x - cx, y - cy) < r * (0.85 + 0.28 * Math.sin(a * lobes + ph))) tiles[y * GRID + x] = kind;
      }
  };
  for (let k = 0; k < m.ice; k++) blob(ICE);
  for (let k = 0; k < m.powder; k++) blob(POWDER);
  const marks: Pt[] = [];
  const a0 = rnd() * 6.28;
  for (let k = 0; k < MARKS; k++) {
    const a = a0 + (k / MARKS) * Math.PI * 2 + (rnd() - 0.5) * 0.5, r = 17 + rnd() * 12;
    marks.push({ x: Math.floor(GRID / 2 + Math.cos(a) * r), z: Math.floor(GRID / 2 + Math.sin(a) * r) });
  }
  const jumps: Pt[] = [];
  while (jumps.length < m.jumps) {
    const x = 8 + Math.floor(rnd() * (GRID - 17)), z = 8 + Math.floor(rnd() * (GRID - 17));
    if (marks.some((p) => Math.hypot(p.x - x, p.z - z) < 5) || jumps.some((p) => Math.hypot(p.x - x, p.z - z) < 8)) continue;
    jumps.push({ x: x + 1, z: z + 1 }); // centre of a 2 x 2 pad
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) tiles[(z + dz) * GRID + x + dx] = JUMP;
  }
  for (const p of marks) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) tiles[(p.z + dz) * GRID + p.x + dx] = 0;
  return { tiles, jumps, marks };
}

export class Sim {
  readonly field = new Field(GRID);
  readonly skiers: SimSkier[] = [];
  readonly terrain: Terrain;
  readonly mountain: Mountain;
  readonly run: RunDef | null;
  human: SimSkier | null = null;
  maxPct = 0;
  bigLoop = 0; // the player's best single loop, in % of the map
  revived = false;
  tumbles = 0;
  won = false;
  time = 0;
  dirty = true; // the owner grid changed; the view repaints and clears this
  onEvent: (e: SimEvent) => void = () => {};
  private names: string[];
  private rnd: () => number;

  constructor(mountain: Mountain, index: number, run: RunDef | null, player: PlayerCfg | null, rnd: () => number = Math.random) {
    this.mountain = mountain;
    this.run = run;
    this.rnd = rnd;
    this.terrain = makeTerrain(mountain, index);
    this.names = BOT_NAMES.slice();
    for (let i = this.names.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [this.names[i], this.names[j]] = [this.names[j], this.names[i]];
    }
    const count = Math.min(8, mountain.bots + (player ? 1 : 0));
    const colors = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => PALETTE[c]).filter((c) => !player || c !== player.color);
    const tier = TIERS[mountain.tier];
    const c = GRID / 2;
    const a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const human = !!player && k === 0;
      const champ = !human && !!run?.champ && k === count - 1;
      const style = champ ? 'hunter' : STYLES[k % 3];
      const st = STYLE[style];
      const t = champ ? TIERS[Math.min(TIERS.length - 1, mountain.tier + 1)] : tier;
      const look = human ? player! : champ ? mountain.champ : BOT_KINDS[Math.floor(rnd() * BOT_KINDS.length)];
      const perk = PERK[look.kind];
      const s: SimSkier = {
        id: k + 1, name: human ? player!.name : champ ? mountain.champ.name : this.names.pop()!, human, champ,
        kind: look.kind, fur: look.fur, gold: human && !!player!.gold, color: human ? player!.color : colors.shift()!,
        x: 0, z: 0, heading: 0, want: 0, turnVel: 0,
        speed: human ? player!.speed : PLAYER_SPEED * (champ ? Math.min(0.97, t.speed + 0.04) : t.speed * st.speed) * (perk.speed ?? 1),
        turn: human ? player!.turn : 3.6 * (perk.turn ?? 1),
        cx: 0, cy: 0, alive: true, respawn: 0, safe: 0, air: 0, trailCells: 0, kills: 0, pts: [],
        ai: human
          ? player!.auto ? { ...player!.auto, calm: 0, rest: 3 } : null
          : { out: champ ? [8 * t.loop, 15 * t.loop] : [st.out[0] * t.loop, st.out[1] * t.loop], nervous: st.nervous, maxTrail: st.maxTrail * t.loop, hunt: style === 'hunter' ? t.hunt : 0, calm: t.calm, rest: t.rest, blunder: 0 },
        plan: [], goingHome: false, home: null, think: 0, daze: 0, recent: [-1, -1, -1, -1], recentAt: 0, rest: 0, chase: 0,
        startR: human ? player!.startR : START_R + (champ ? 2 : t.big),
      };
      this.skiers.push(s);
      const a = a0 + (k / count) * Math.PI * 2;
      const r = human ? 8 : GRID * 0.32;
      this.place(s, Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r), s.startR);
      if (human) this.human = s;
    }
  }

  private place(s: SimSkier, cx: number, cy: number, r: number) {
    this.field.claimDisk(s.id, cx, cy, r);
    s.x = cx + 0.5;
    s.z = cy + 0.5;
    s.cx = cx;
    s.cy = cy;
    // Face the open middle of the map.
    s.heading = s.want = Math.atan2(GRID / 2 - s.z, GRID / 2 - s.x) + (this.rnd() - 0.5);
    s.alive = true;
    s.trailCells = 0;
    s.air = 0;
    s.pts.length = 0;
    s.plan = [];
    s.goingHome = false;
    this.dirty = true;
  }

  landPct(s: SimSkier) {
    return pctOf(this.field.countOf(s.id));
  }

  marksOwned(): number {
    const h = this.human;
    return h ? this.terrain.marks.filter((p) => this.field.owner[p.z * GRID + p.x] === h.id).length : 0;
  }

  /** Progress toward a goal, in the goal's own unit. */
  value(goal: GoalKind): number {
    const h = this.human;
    if (!h) return 0;
    return goal === 'land' ? this.landPct(h) : goal === 'catch' ? h.kills : goal === 'loop' ? this.bigLoop : this.marksOwned();
  }

  extraDone(): boolean {
    const e = this.run!.extra;
    return (e.goal === 'land' ? this.maxPct : this.human!.kills) >= e.need;
  }

  step(dt: number, humanWant: number | null) {
    if (dt <= 0 || this.won) return; // two frames can share a timestamp; dt = 0 would make turn speed NaN
    this.time += dt;
    for (const s of this.skiers) {
      if (!s.alive) {
        if (!s.human && (s.respawn -= dt) <= 0) this.respawnBot(s);
        continue;
      }
      s.safe = Math.max(0, s.safe - dt);
      if (s.ai) this.think(s, dt);
      else if (humanWant !== null) s.want = humanWant;
      this.move(s, dt);
    }
    this.headOn();
    const h = this.human;
    if (h?.alive) {
      this.maxPct = Math.max(this.maxPct, this.landPct(h));
      if (this.run && this.value(this.run.goal) >= this.run.need) {
        this.won = true;
        this.onEvent({ t: 'win' });
      }
    }
  }

  private move(s: SimSkier, dt: number) {
    const tile = this.terrain.tiles[s.cy * GRID + s.cx];
    const perk = PERK[s.kind];
    let sp = s.speed, tr = s.turn;
    if (s.air > 0) {
      s.air -= dt;
      sp *= 1.45;
    } else if (tile === ICE && !perk.ice) {
      tr *= 0.45;
      sp *= 1.1;
    } else if (tile === POWDER && !perk.powder) sp *= 0.7;
    const d = wrap(s.want - s.heading);
    const turn = Math.max(-tr * dt, Math.min(tr * dt, d));
    s.heading = wrap(s.heading + turn);
    s.turnVel = turn / dt;
    s.x = Math.max(0.05, Math.min(GRID - 0.05, s.x + Math.cos(s.heading) * sp * dt));
    s.z = Math.max(0.05, Math.min(GRID - 0.05, s.z + Math.sin(s.heading) * sp * dt));
    const nx = Math.floor(s.x), ny = Math.floor(s.z);
    if (nx !== s.cx || ny !== s.cy) {
      // A diagonal step also visits the side cell, so trails have no diagonal gaps to slip through.
      if (nx !== s.cx && ny !== s.cy) this.enter(s, nx, s.cy);
      if (s.alive) this.enter(s, nx, ny);
      s.cx = nx;
      s.cy = ny;
      if (s.alive && s.air <= 0 && this.terrain.tiles[ny * GRID + nx] === JUMP) {
        s.air = 0.8 * (perk.air ?? 1);
        this.onEvent({ t: 'jump', who: s });
      }
    }
    if (s.alive && s.trailCells > 0) this.addPt(s, s.x, s.z);
  }

  private addPt(s: SimSkier, x: number, z: number) {
    const n = s.pts.length;
    if (n >= 4500) return;
    if (n && (x - s.pts[n - 3]) ** 2 + (z - s.pts[n - 2]) ** 2 < 0.12) return;
    s.pts.push(x, z, s.heading);
  }

  private enter(s: SimSkier, x: number, y: number) {
    const i = y * GRID + x;
    const t = this.field.trail[i];
    // Wobbling over a cell edge re-enters a cell from a moment ago; only an older piece of her own track trips her.
    const fresh = s.recent.includes(i);
    s.recent[s.recentAt++ & 3] = i;
    if (t === s.id) {
      if (s.safe <= 0 && !fresh) this.defeat(s, null, 'self');
      return;
    }
    if (t) {
      const v = this.skiers[t - 1];
      if (v.alive && v.safe <= 0) this.defeat(v, s, 'cut');
    }
    if (this.field.owner[i] === s.id) {
      if (s.trailCells > 0) this.claim(s);
    } else if (!this.field.trail[i]) {
      if (s.trailCells === 0) this.addPt(s, s.x - Math.cos(s.heading) * 0.6, s.z - Math.sin(s.heading) * 0.6);
      this.field.trail[i] = s.id;
      s.trailCells++;
    }
  }

  private claim(s: SimSkier) {
    const gained = this.field.closeLoop(s.id);
    s.trailCells = 0;
    s.pts.length = 0;
    this.dirty = true;
    if (s.human) this.bigLoop = Math.max(this.bigLoop, pctOf(gained));
    this.onEvent({ t: 'claim', who: s, gained });
    for (const o of this.skiers) if (o !== s && o.alive && this.field.countOf(o.id) === 0) this.defeat(o, s, 'wiped');
  }

  /** Head-on bump: the skier with the longer open trail tumbles; equal open trails both tumble. */
  private headOn() {
    for (let a = 0; a < this.skiers.length; a++)
      for (let b = a + 1; b < this.skiers.length; b++) {
        const p = this.skiers[a], q = this.skiers[b];
        if (!p.alive || !q.alive || p.air > 0 || q.air > 0 || (p.x - q.x) ** 2 + (p.z - q.z) ** 2 > 0.64) continue;
        if (p.trailCells === 0 && q.trailCells === 0) continue;
        if (p.trailCells >= q.trailCells && p.safe <= 0) this.defeat(p, q, 'bump');
        if (q.trailCells >= p.trailCells && q.safe <= 0) this.defeat(q, p, 'bump');
      }
  }

  private defeat(v: SimSkier, by: SimSkier | null, how: 'self' | 'cut' | 'bump' | 'wiped') {
    if (!v.alive) return;
    v.alive = false;
    v.trailCells = 0;
    v.pts.length = 0;
    if (v.human) {
      this.tumbles++;
      this.field.clearTrail(v.id); // land waits for the revive choice
    } else {
      this.field.wipe(v.id);
      v.respawn = BOT_RESPAWN;
    }
    if (by && by !== v) by.kills++;
    this.dirty = true;
    this.onEvent({ t: 'down', who: v, by, how });
  }

  private respawnBot(s: SimSkier) {
    for (let k = 0; k < 40; k++) {
      const cx = 5 + Math.floor(this.rnd() * (GRID - 10)), cy = 5 + Math.floor(this.rnd() * (GRID - 10));
      if (!this.field.isFree(cx, cy, START_R + 1)) continue;
      if (!s.champ) {
        this.names.unshift(s.name);
        s.name = this.names.pop()!;
      }
      s.kills = 0;
      this.place(s, cx, cy, START_R);
      return;
    }
    s.respawn = 1; // map too full right now; try again soon
  }

  revive() {
    const h = this.human!;
    this.revived = true;
    if (this.field.countOf(h.id) === 0) this.field.claimDisk(h.id, h.cx, h.cy, START_R);
    const p = this.nearestOwn(h);
    h.x = p.x;
    h.z = p.z;
    h.cx = Math.floor(p.x);
    h.cy = Math.floor(p.z);
    h.alive = true;
    h.safe = REVIVE_SAFE;
    this.dirty = true;
  }

  giveUp() {
    if (this.human) this.field.wipe(this.human.id);
    this.dirty = true;
  }

  // ---------------- computer skiers ----------------

  private think(s: SimSkier, dt: number) {
    const ai = s.ai!;
    if ((s.daze -= dt) > 0) return;
    if (ai.blunder && s.trailCells > 0 && this.rnd() < ai.blunder * dt) return void (s.daze = 0.7);
    s.think -= dt;
    if (s.trailCells === 0) s.goingHome = false;
    else if (!s.goingHome) {
      let threat = Infinity;
      for (const o of this.skiers) if (o !== s && o.alive) threat = Math.min(threat, Math.hypot(o.x - s.x, o.z - s.z));
      if (threat < ai.nervous || s.trailCells > ai.maxTrail) {
        s.goingHome = true;
        s.plan = [];
        s.think = 0;
      }
    }
    // Hunters give everyone a few calm seconds at the start of a run.
    // A chase lasts a few seconds, then the hunter rests, so nobody is hounded.
    s.rest -= dt;
    let target: Pt | null = ai.hunt > 0 && this.time > ai.calm && s.rest <= 0 && s.trailCells < 30 ? this.exposedTrail(s, ai.hunt) : null;
    const chasing = !!target;
    if (target && (s.chase += dt) > 4) {
      s.chase = 0;
      s.rest = ai.rest;
    }
    if (!target && s.goingHome) {
      if (s.think <= 0 || !s.home) {
        s.home = this.wayHome(s);
        s.think = 0.2;
      }
      target = s.home;
    }
    if (!target) {
      if (!s.plan.length) {
        if (s.trailCells === 0) this.makePlan(s);
        else s.goingHome = true;
      }
      if (s.plan.length && Math.hypot(s.plan[0].x - s.x, s.plan[0].z - s.z) < 1.2) s.plan.shift();
      target = s.plan[0] ?? null;
    }
    if (target) s.want = this.safeHeading(s, Math.atan2(target.z - s.z, target.x - s.x), !s.human && !chasing);
  }

  private makePlan(s: SimSkier) {
    const [lo, hi] = s.ai!.out;
    // The balance sim's player skis to a landmark she does not own yet on landmark runs.
    if (s.human && this.run?.goal === 'marks') {
      const own = this.field.owner;
      const todo = this.terrain.marks.filter((p) => own[p.z * GRID + p.x] !== s.id).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
      if (todo && Math.hypot(todo.x - s.x, todo.z - s.z) > 2) {
        const a = Math.atan2(todo.z - s.z, todo.x - s.x), d = Math.min(hi, Math.hypot(todo.x - s.x, todo.z - s.z) + 2);
        const px = -Math.sin(a) * 3, pz = Math.cos(a) * 3;
        s.plan = [{ x: s.x + Math.cos(a) * d + px, z: s.z + Math.sin(a) * d + pz }, { x: s.x + Math.cos(a) * d - px, z: s.z + Math.sin(a) * d - pz }];
        return;
      }
    }
    for (let k = 0; k < 12; k++) {
      const a = this.rnd() * Math.PI * 2;
      const L = lo + this.rnd() * (hi - lo), W = lo + this.rnd() * (hi - lo);
      const side = this.rnd() < 0.5 ? -1 : 1;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz * side, pz = dx * side;
      const p1 = { x: s.x + dx * L, z: s.z + dz * L };
      const p2 = { x: p1.x + px * W, z: p1.z + pz * W };
      const p3 = { x: p2.x - dx * L * 0.8, z: p2.z - dz * L * 0.8 };
      if ([p1, p2, p3].every((p) => p.x > 2 && p.z > 2 && p.x < GRID - 2 && p.z < GRID - 2)) {
        s.plan = [p1, p2, p3];
        return;
      }
    }
    s.plan = [{ x: GRID / 2, z: GRID / 2 }];
  }

  /**
   * Turn as little as possible away from `want` so the next cells ahead hold none of our own trail.
   * Only hunters on a chase cut the player's track; everyone else politely skis around it.
   */
  private safeHeading(s: SimSkier, want: number, polite = false): number {
    const tr = this.field.trail;
    const hid = polite && this.human ? this.human.id : -1;
    for (const o of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3, 3]) {
      const h = want + o;
      let ok = true;
      for (const d of [0.9, 1.7, 2.5]) {
        const x = Math.floor(s.x + Math.cos(h) * d), y = Math.floor(s.z + Math.sin(h) * d);
        if (x === s.cx && y === s.cy) continue;
        if (!this.field.inside(x, y) || tr[y * GRID + x] === s.id || tr[y * GRID + x] === hid) {
          ok = false;
          break;
        }
      }
      if (ok) return h;
    }
    return want;
  }

  private from = new Int32Array(CELLS);
  private queue = new Int32Array(CELLS);

  /** A point a few cells along the shortest way back to own land that never crosses the skier's own track. */
  private wayHome(s: SimSkier): Pt {
    const { from, queue } = this;
    const own = this.field.owner, tr = this.field.trail;
    const start = s.cy * GRID + s.cx;
    from.fill(-1);
    from[start] = start;
    queue[0] = start;
    for (let head = 0, tail = 1; head < tail; head++) {
      const i = queue[head];
      if (own[i] === s.id && i !== start) {
        // Walk back to the cell three steps from the skier, or the goal itself when it is closer.
        const path: number[] = [];
        for (let k = i; k !== start; k = from[k]) path.push(k);
        const k = path[Math.max(0, path.length - 3)];
        return { x: (k % GRID) + 0.5, z: Math.floor(k / GRID) + 0.5 };
      }
      const x = i % GRID;
      for (const j of [x > 0 ? i - 1 : -1, x < GRID - 1 ? i + 1 : -1, i - GRID, i + GRID]) {
        if (j < 0 || j >= CELLS || from[j] >= 0 || tr[j] === s.id) continue;
        from[j] = i;
        queue[tail++] = j;
      }
    }
    return this.nearestOwn(s); // boxed in by her own track: head for land and hope
  }

  nearestOwn(s: SimSkier): Pt {
    let best = Infinity, bx = s.x, bz = s.z;
    const own = this.field.owner;
    for (let i = 0; i < CELLS; i++) {
      if (own[i] !== s.id) continue;
      const x = (i % GRID) + 0.5, z = Math.floor(i / GRID) + 0.5;
      const d = (x - s.x) ** 2 + (z - s.z) ** 2;
      if (d < best) [best, bx, bz] = [d, x, z];
    }
    return { x: bx, z: bz };
  }

  private exposedTrail(s: SimSkier, range: number): Pt | null {
    let best = range * range, out: Pt | null = null;
    for (const o of this.skiers) {
      if (o === s || !o.alive || o.trailCells < 6 || o.safe > 0) continue;
      const p = o.pts;
      for (let k = 0; k < p.length - 9; k += 9) {
        const d = (p[k] - s.x) ** 2 + (p[k + 1] - s.z) ** 2;
        if (d < best) [best, out] = [d, { x: p[k], z: p[k + 1] }];
      }
    }
    return out;
  }

  /** How close the nearest hunting skier is to the player's open track; drives the tense music. */
  danger(): number {
    const h = this.human;
    if (!h?.alive || h.trailCells < 4) return Infinity;
    let best = Infinity;
    for (const o of this.skiers) {
      if (o === h || !o.alive) continue;
      for (let k = 0; k < h.pts.length; k += 9) best = Math.min(best, Math.hypot(h.pts[k] - o.x, h.pts[k + 1] - o.z));
    }
    return best;
  }
}
