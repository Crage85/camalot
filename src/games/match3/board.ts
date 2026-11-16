// Match-3 rules. Pure logic: no DOM, no three.js. Every action returns Steps (board snapshots + effects) for the view to animate.

export type Kind = 'n' | 'h' | 'v' | 'bomb' | 'fly' | 'rainbow' | 'kitten';
export interface Piece { id: number; color: number; kind: Kind }
export interface Cell {
  hole: boolean; piece: Piece | null; crate: number; vine: boolean; ice: number; dust: number;
  /** A crab sits on this tile. Clear the piece under it to catch it; it scuttles one tile after a move that catches none. */
  crab: boolean;
  /** Groomed ski trail. A match that touches a groomed tile grooms all its tiles. */
  trail: boolean;
  /** Dragon egg (hits left). Fills the tile. Hatches with a 3 by 3 fire burst. */
  egg: number;
  /** Boulder (hits left). Fills the tile. Only specials and the hammer break it. */
  rock: number;
}

export type GoalType = 'score' | 'collect' | 'dust' | 'crate' | 'vine' | 'ice' | 'kitten' | 'crab' | 'trail' | 'egg' | 'rock' | 'special';
export interface Goal { type: GoalType; n?: number; color?: number }

export interface LevelDef {
  moves: number;
  /** Moves in the crown challenge replay. */
  crown: number;
  /** Marked on the map as a harder level. */
  hard?: boolean;
  colors: number; // 4..6: pieces use colors 0..colors-1
  goals: Goal[];
  stars: [number, number]; // score for 2 and 3 stars (1 star = win)
  layout: string[]; // see LEGEND
  tip?: string;
}

/** Layout characters. */
export const LEGEND = {
  '.': 'cell', '-': 'hole', '1': 'crate 1', '2': 'crate 2', '3': 'crate 3', v: 'vine',
  i: 'ice 1', I: 'ice 2', g: 'stardust 1', G: 'stardust 2', j: 'ice + stardust', k: 'kitten',
  c: 'crab', t: 'groomed trail', e: 'dragon egg (2 hits)', r: 'boulder 1', R: 'boulder 2',
} as const;

export type Fx =
  | { t: 'line'; x: number; y: number; dir: 'h' | 'v' }
  | { t: 'blast'; x: number; y: number; r: number }
  | { t: 'fly'; x: number; y: number; tx: number; ty: number }
  | { t: 'beam'; x: number; y: number; tx: number; ty: number }
  | { t: 'rescue'; x: number; y: number }
  | { t: 'hatch'; x: number; y: number }
  | { t: 'catch'; x: number; y: number }
  | { t: 'hop'; x: number; y: number; tx: number; ty: number }
  | { t: 'make'; x: number; y: number; kind: Kind };

export type StepType = 'swap' | 'bad' | 'clear' | 'fall' | 'spread' | 'shuffle' | 'convert';
export interface Step {
  type: StepType;
  cells: Cell[];
  fx: Fx[];
  /** Spawned piece id -> board row it starts falling from (negative = above the board). */
  spawn: Record<number, number>;
  /** Cascade depth when this step happened (1 = the player's own match). */
  depth: number;
  /** Score and goals left after this step, for the HUD. */
  score: number;
  left: number[];
}

export interface MoveResult { ok: boolean; steps: Step[] }

interface Group { cells: number[]; color: number; make: Kind | null; anchor: number }

const SPECIAL_BONUS: Partial<Record<Kind, number>> = { h: 60, v: 60, fly: 60, bomb: 100, rainbow: 200 };
export const FINALE_MAX = 10; // leftover moves turned into wands at the end; the rest pay 300 points each

export const isSpecial = (p: Piece | null): boolean => !!p && p.kind !== 'n' && p.kind !== 'kitten';

export class Board {
  w: number;
  h: number;
  cells: Cell[];
  moves: number;
  score = 0;
  collected = [0, 0, 0, 0, 0, 0];
  rescued = 0;
  /** Specials the player has made (goal 'special'). */
  made = 0;
  readonly def: LevelDef;
  /** false in bot clones: skips snapshots. */
  record = true;

  private seed: number;
  private nextId = 1;
  private kittenGoal = 0;
  private sinceKitten = 0;
  private vineHit = false;
  private crabHit = false;
  private cascade = 1;
  private lastSwap: [number, number] | null = null;
  private steps: Step[] = [];
  private fx: Fx[] = [];
  private spawnMap: Record<number, number> = {};
  private fresh = new Set<number>();

  constructor(def: LevelDef, seed: number) {
    this.def = def;
    this.seed = seed >>> 0 || 1;
    this.moves = def.moves;
    this.h = def.layout.length;
    this.w = Math.max(...def.layout.map((r) => r.length));
    this.kittenGoal = def.goals.find((g) => g.type === 'kitten')?.n ?? 0;
    this.cells = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = def.layout[y][x] ?? '-';
        const c: Cell = { hole: ch === '-', piece: null, crate: 0, vine: false, ice: 0, dust: 0, crab: ch === 'c', trail: ch === 't', egg: ch === 'e' ? 2 : 0, rock: ch === 'r' ? 1 : ch === 'R' ? 2 : 0 };
        if (ch >= '1' && ch <= '3') c.crate = +ch;
        if (ch === 'v') c.vine = true;
        if (ch === 'i' || ch === 'j') c.ice = 1;
        if (ch === 'I') c.ice = 2;
        if (ch === 'g' || ch === 'j') c.dust = 1;
        if (ch === 'G') c.dust = 2;
        if (ch === 'k') c.piece = { id: this.nextId++, color: -1, kind: 'kitten' };
        this.cells.push(c);
      }
    }
    for (let tries = 0; tries < 100; tries++) {
      this.fillStart();
      if (this.findMove() && !this.findGroups().length) break;
    }
  }

  // ---------- helpers ----------

  rand(): number {
    // mulberry32
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  idx(x: number, y: number): number { return y * this.w + x; }
  xy(i: number): [number, number] { return [i % this.w, Math.floor(i / this.w)]; }
  inside(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h && !this.cells[this.idx(x, y)].hole; }
  private nb4(i: number): number[] {
    const [x, y] = this.xy(i);
    const out: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.inside(x + dx, y + dy)) out.push(this.idx(x + dx, y + dy));
    return out;
  }
  private colorAt(i: number): number {
    const p = this.cells[i].piece;
    return p && p.color >= 0 ? p.color : -1;
  }
  private newPiece(color: number, kind: Kind = 'n'): Piece { return { id: this.nextId++, color, kind }; }
  private randColor(): number { return Math.floor(this.rand() * this.def.colors); }
  private needsPiece(c: Cell): boolean { return !c.hole && !solid(c) && !c.piece; }

  private fillStart(): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.cells[this.idx(x, y)];
        if (c.piece?.kind === 'kitten') continue;
        c.piece = null;
        if (!this.needsPiece(c)) continue;
        const col = (dx: number, dy: number) => (this.inside(x + dx, y + dy) ? this.colorAt(this.idx(x + dx, y + dy)) : -2);
        const banned = new Set<number>();
        if (col(-1, 0) >= 0 && col(-1, 0) === col(-2, 0)) banned.add(col(-1, 0));
        if (col(0, -1) >= 0 && col(0, -1) === col(0, -2)) banned.add(col(0, -1));
        if (col(-1, 0) >= 0 && col(-1, 0) === col(0, -1) && col(-1, 0) === col(-1, -1)) banned.add(col(-1, 0));
        const ok = [...Array(this.def.colors).keys()].filter((k) => !banned.has(k));
        c.piece = this.newPiece(ok[Math.floor(this.rand() * ok.length)]);
      }
    }
  }

  private snap(type: StepType): void {
    if (this.record) this.steps.push({ type, cells: cloneCells(this.cells), fx: this.fx, spawn: this.spawnMap, depth: this.cascade, score: this.score, left: this.def.goals.map((g) => this.remaining(g)) });
    this.fx = [];
    this.spawnMap = {};
  }

  private begin(): void {
    this.steps = [];
    this.fx = [];
    this.spawnMap = {};
    this.vineHit = false;
    this.crabHit = false;
    this.cascade = 1;
    this.lastSwap = null;
  }

  // ---------- matching ----------

  findGroups(): Group[] {
    const { w, h } = this;
    const runs: { cells: number[]; dir: 'h' | 'v' }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; ) {
        const c = this.colorAt(this.idx(x, y));
        let e = x + 1;
        if (c >= 0) while (e < w && this.colorAt(this.idx(e, y)) === c) e++;
        if (c >= 0 && e - x >= 3) runs.push({ cells: range(x, e).map((xx) => this.idx(xx, y)), dir: 'h' });
        x = e;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; ) {
        const c = this.colorAt(this.idx(x, y));
        let e = y + 1;
        if (c >= 0) while (e < h && this.colorAt(this.idx(x, e)) === c) e++;
        if (c >= 0 && e - y >= 3) runs.push({ cells: range(y, e).map((yy) => this.idx(x, yy)), dir: 'v' });
        y = e;
      }
    }
    const squares: number[][] = [];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const sq = [this.idx(x, y), this.idx(x + 1, y), this.idx(x, y + 1), this.idx(x + 1, y + 1)];
        const c = this.colorAt(sq[0]);
        if (c >= 0 && sq.every((i) => this.colorAt(i) === c)) squares.push(sq);
      }
    }
    if (!runs.length && !squares.length) return [];

    const parent = new Map<number, number>();
    const find = (i: number): number => {
      let r = i;
      while (parent.get(r)! !== r) r = parent.get(r)!;
      parent.set(i, r);
      return r;
    };
    const join = (list: number[]) => {
      for (const i of list) if (!parent.has(i)) parent.set(i, i);
      for (const i of list) parent.set(find(i), find(list[0]));
    };
    runs.forEach((r) => join(r.cells));
    squares.forEach(join);

    const byRoot = new Map<number, { cells: Set<number>; runs: typeof runs; squares: number[][] }>();
    const get = (i: number) => {
      const r = find(i);
      if (!byRoot.has(r)) byRoot.set(r, { cells: new Set(), runs: [], squares: [] });
      return byRoot.get(r)!;
    };
    for (const r of runs) { const g = get(r.cells[0]); g.runs.push(r); r.cells.forEach((i) => g.cells.add(i)); }
    for (const s of squares) { const g = get(s[0]); g.squares.push(s); s.forEach((i) => g.cells.add(i)); }

    const out: Group[] = [];
    for (const g of byRoot.values()) {
      const cells = [...g.cells];
      const color = this.colorAt(cells[0]);
      const longest = g.runs.reduce((a, r) => (r.cells.length > (a?.cells.length ?? 0) ? r : a), null as (typeof runs)[number] | null);
      const maxLen = longest?.cells.length ?? 0;
      const hasH = g.runs.some((r) => r.dir === 'h');
      const hasV = g.runs.some((r) => r.dir === 'v');
      let make: Kind | null = null;
      let pref: number | undefined;
      if (maxLen >= 5) { make = 'rainbow'; pref = longest!.cells[2]; }
      else if (hasH && hasV) {
        make = 'bomb';
        const hs = new Set(g.runs.filter((r) => r.dir === 'h').flatMap((r) => r.cells));
        pref = g.runs.filter((r) => r.dir === 'v').flatMap((r) => r.cells).find((i) => hs.has(i));
      } else if (maxLen === 4) { make = longest!.dir === 'h' ? 'v' : 'h'; pref = longest!.cells[1]; }
      else if (g.squares.length) { make = 'fly'; pref = g.squares[0][2]; }
      const free = cells.filter((i) => !this.cells[i].ice);
      let anchor = -1;
      if (make) {
        if (this.lastSwap) anchor = [this.lastSwap[1], this.lastSwap[0]].find((i) => free.includes(i)) ?? -1;
        if (anchor < 0 && pref !== undefined && free.includes(pref)) anchor = pref;
        if (anchor < 0) anchor = free[0] ?? -1;
        if (anchor < 0) make = null;
      }
      out.push({ cells, color, make, anchor });
    }
    return out;
  }

  canSwap(a: number, b: number): boolean {
    const [ax, ay] = this.xy(a);
    const [bx, by] = this.xy(b);
    if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return false;
    const A = this.cells[a];
    const B = this.cells[b];
    return !A.hole && !B.hole && !!A.piece && !!B.piece && !A.ice && !B.ice;
  }

  private isCombo(p: Piece, q: Piece): boolean {
    if (isSpecial(p) && isSpecial(q)) return true;
    return (p.kind === 'rainbow' && q.kind !== 'kitten') || (q.kind === 'rainbow' && p.kind !== 'kitten');
  }

  /** A valid move as [a, b], or [i, i] for a special she can tap, or null. */
  findMove(): [number, number] | null {
    let tap: [number, number] | null = null;
    for (let i = 0; i < this.cells.length; i++) {
      const [x, y] = this.xy(i);
      for (const j of [x + 1 < this.w ? i + 1 : -1, y + 1 < this.h ? i + this.w : -1]) {
        if (j < 0 || !this.canSwap(i, j)) continue;
        const A = this.cells[i];
        const B = this.cells[j];
        if (this.isCombo(A.piece!, B.piece!)) return [i, j];
        [A.piece, B.piece] = [B.piece, A.piece];
        const found = this.findGroups().length > 0;
        [A.piece, B.piece] = [B.piece, A.piece];
        if (found) return [i, j];
      }
      if (!tap && isSpecial(this.cells[i].piece) && !this.cells[i].ice) tap = [i, i];
    }
    return tap;
  }

  // ---------- clearing ----------

  /** `adj` = this tile was only next to a match, not in a match or a blast. */
  private hit(i: number, next: number[], adj = false): void {
    const c = this.cells[i];
    if (c.hole) return;
    if (c.rock > 0) { if (!adj) { c.rock--; this.score += 30; } return; }
    if (c.egg > 0) {
      c.egg--;
      this.score += 20;
      if (!c.egg) {
        const [x, y] = this.xy(i);
        this.score += 80;
        this.fx.push({ t: 'hatch', x, y });
        next.push(...this.area(x, y, 1, false).filter((j) => j !== i));
      }
      return;
    }
    if (c.crate > 0) { c.crate--; this.score += 20; return; }
    if (c.vine) { c.vine = false; this.vineHit = true; this.score += 20; return; }
    const p = c.piece;
    if (!p || p.kind === 'kitten' || this.fresh.has(p.id)) return;
    if (c.dust > 0) { c.dust--; this.score += 20; }
    if (c.ice > 0) { c.ice--; this.score += 20; return; }
    c.piece = null;
    this.score += 10 * this.cascade;
    if (c.crab) this.catchCrab(i);
    if (p.color >= 0) this.collected[p.color]++;
    if (p.kind !== 'n') {
      const from = next.length;
      this.trigger(p, i, next);
      if (c.trail) this.groom(next.slice(from));
    }
  }

  private catchCrab(i: number): void {
    const [x, y] = this.xy(i);
    this.cells[i].crab = false;
    this.crabHit = true;
    this.score += 50;
    this.fx.push({ t: 'catch', x, y });
  }

  private groom(list: number[]): void {
    for (const j of list) if (!this.cells[j].hole) this.cells[j].trail = true;
  }

  /** Cells a special clears when it fires at i (the special's own cell excluded). */
  private effect(kind: Kind, i: number, next: number[]): void {
    const [x, y] = this.xy(i);
    if (kind === 'h') { for (let xx = 0; xx < this.w; xx++) next.push(this.idx(xx, y)); this.fx.push({ t: 'line', x, y, dir: 'h' }); }
    if (kind === 'v') { for (let yy = 0; yy < this.h; yy++) next.push(this.idx(x, yy)); this.fx.push({ t: 'line', x, y, dir: 'v' }); }
    if (kind === 'bomb') { next.push(...this.area(x, y, 2, true)); this.fx.push({ t: 'blast', x, y, r: 2 }); }
  }

  private area(x: number, y: number, r: number, diamond: boolean): number[] {
    const out: number[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (diamond && Math.abs(dx) + Math.abs(dy) > r) continue;
      if (this.inside(x + dx, y + dy)) out.push(this.idx(x + dx, y + dy));
    }
    return out;
  }

  private trigger(p: Piece, i: number, next: number[]): void {
    const [x, y] = this.xy(i);
    if (p.kind === 'fly') {
      next.push(...this.nb4(i));
      const t = this.pickTarget(i);
      if (t >= 0) { next.push(t); const [tx, ty] = this.xy(t); this.fx.push({ t: 'fly', x, y, tx, ty }); }
    } else if (p.kind === 'rainbow') {
      this.rainbowColor(this.commonColor(), i, next);
    } else this.effect(p.kind, i, next);
  }

  private rainbowColor(color: number, from: number, next: number[]): number[] {
    const [x, y] = this.xy(from);
    const hits: number[] = [];
    this.cells.forEach((c, j) => {
      if (c.piece && c.piece.color === color) { hits.push(j); const [tx, ty] = this.xy(j); this.fx.push({ t: 'beam', x, y, tx, ty }); }
    });
    next.push(...hits);
    return hits;
  }

  private commonColor(): number {
    const n = [0, 0, 0, 0, 0, 0];
    for (const c of this.cells) if (c.piece && c.piece.color >= 0) n[c.piece.color]++;
    return n.indexOf(Math.max(...n));
  }

  /** Where a dragonfly flies: the level's goal tiles first. */
  private pickTarget(from: number): number {
    const skip = new Set([from, ...this.nb4(from)]);
    const types = new Set(this.def.goals.map((g) => g.type));
    const buckets: ((c: Cell, i: number) => boolean)[] = [];
    if (types.has('dust')) buckets.push((c) => c.dust > 0 && !!c.piece && c.piece.kind !== 'kitten');
    if (types.has('crab')) buckets.push((c) => c.crab);
    if (types.has('egg')) buckets.push((c) => c.egg > 0);
    if (types.has('rock')) buckets.push((c) => c.rock > 0);
    if (types.has('crate')) buckets.push((c) => c.crate > 0);
    if (types.has('vine')) buckets.push((c) => c.vine);
    if (types.has('ice')) buckets.push((c) => c.ice > 0);
    for (const g of this.def.goals) if (g.type === 'collect' && this.remaining(g) > 0) buckets.push((c) => c.piece?.color === g.color);
    buckets.push((c) => !!c.piece && c.piece.kind !== 'kitten');
    for (const test of buckets) {
      const list = this.cells.map((c, i) => (!skip.has(i) && test(c, i) ? i : -1)).filter((i) => i >= 0);
      if (list.length) return list[Math.floor(this.rand() * list.length)];
    }
    return -1;
  }

  /** Clears `first`, then every wave of specials it sets off. Groups make their specials after the first wave. */
  private runWaves(first: number[], groups: Group[]): void {
    let wave = new Set(first);
    const adj = new Set<number>();
    for (const g of groups) {
      if (g.cells.some((i) => this.cells[i].trail)) this.groom(g.cells);
      for (const i of g.cells) for (const n of this.nb4(i)) if (!wave.has(n) && solid(this.cells[n])) adj.add(n);
    }
    for (const n of adj) wave.add(n);
    let make = groups.filter((g) => g.make);
    while (wave.size) {
      const next: number[] = [];
      for (const i of wave) this.hit(i, next, adj.has(i));
      adj.clear();
      for (const g of make) {
        const c = this.cells[g.anchor];
        if (!this.needsPiece(c)) continue;
        c.piece = this.newPiece(g.make === 'rainbow' ? -1 : g.color, g.make!);
        this.fresh.add(c.piece.id);
        this.score += SPECIAL_BONUS[g.make!] ?? 0;
        this.made++;
        const [x, y] = this.xy(g.anchor);
        this.fx.push({ t: 'make', x, y, kind: g.make! });
      }
      make = [];
      this.snap('clear');
      wave = new Set(next);
    }
    this.fresh.clear();
  }

  // ---------- gravity ----------

  private holesAbove(x: number, y: number): boolean {
    for (let k = y; k >= 0; k--) if (!this.cells[this.idx(x, k)].hole) return false;
    return true;
  }

  private spawnPiece(): Piece {
    const onBoard = this.cells.filter((c) => c.piece?.kind === 'kitten').length;
    this.sinceKitten++;
    if (this.kittenGoal && onBoard === 0 && this.rescued + onBoard < this.kittenGoal && this.sinceKitten >= 6) {
      this.sinceKitten = 0;
      return this.newPiece(-1, 'kitten');
    }
    return this.newPiece(this.randColor());
  }

  private fall(): boolean {
    const { w, h } = this;
    const spawned = new Array(w).fill(0);
    let any = false;
    for (let guard = 0; guard < 500; guard++) {
      let changed = false;
      for (let x = 0; x < w; x++) {
        for (let y = h - 1; y >= 0; y--) {
          const c = this.cells[this.idx(x, y)];
          if (!this.needsPiece(c)) continue;
          let k = y - 1;
          let src = -1;
          let open = true;
          for (; k >= 0; k--) {
            const a = this.cells[this.idx(x, k)];
            if (a.hole) { open = this.holesAbove(x, k); break; }
            if (solid(a) || (a.piece && a.ice)) { open = false; break; }
            if (a.piece) { src = k; break; }
          }
          if (src >= 0) {
            const a = this.cells[this.idx(x, src)];
            c.piece = a.piece;
            a.piece = null;
            changed = true;
          } else if (open) {
            c.piece = this.spawnPiece();
            let top = 0;
            while (this.cells[this.idx(x, top)].hole) top++;
            this.spawnMap[c.piece.id] = top - 1 - spawned[x]++;
            changed = true;
          }
        }
      }
      if (!changed) {
        // Slide sideways into gaps under blockers.
        outer: for (let y = h - 1; y >= 1; y--) {
          for (let x = 0; x < w; x++) {
            const c = this.cells[this.idx(x, y)];
            if (!this.needsPiece(c)) continue;
            for (const dx of this.rand() < 0.5 ? [-1, 1] : [1, -1]) {
              if (x + dx < 0 || x + dx >= w) continue;
              const s = this.cells[this.idx(x + dx, y - 1)];
              if (s.hole || !s.piece || s.ice) continue;
              c.piece = s.piece;
              s.piece = null;
              changed = true;
              break outer;
            }
          }
        }
      }
      if (!changed) break;
      any = true;
    }
    return any;
  }

  private rescue(): boolean {
    let any = false;
    for (let x = 0; x < this.w; x++) {
      let y = this.h - 1;
      while (y >= 0 && this.cells[this.idx(x, y)].hole) y--;
      if (y < 0) continue;
      const c = this.cells[this.idx(x, y)];
      if (c.piece?.kind === 'kitten') {
        c.piece = null;
        this.rescued++;
        this.score += 100;
        this.fx.push({ t: 'rescue', x, y });
        any = true;
      }
    }
    return any;
  }

  private settle(): void {
    for (let guard = 0; guard < 60; guard++) {
      if (this.fall()) this.snap('fall');
      if (this.rescue()) { this.snap('clear'); continue; }
      const groups = this.findGroups();
      if (!groups.length) break;
      this.cascade++;
      this.lastSwap = null;
      this.runWaves(groups.flatMap((g) => g.cells), groups);
    }
  }

  private spreadVine(): void {
    const cand: number[] = [];
    this.cells.forEach((c, i) => {
      if (!c.vine) return;
      for (const n of this.nb4(i)) {
        const t = this.cells[n];
        if (!solid(t) && !t.ice && !t.crab && t.piece?.kind === 'n') cand.push(n);
      }
    });
    if (!cand.length) return;
    const t = this.cells[cand[Math.floor(this.rand() * cand.length)]];
    t.piece = null;
    t.vine = true;
    this.snap('spread');
  }

  /** Crabs that were not caught this move each scuttle one tile. */
  private scuttle(): void {
    const fx: Fx[] = [];
    this.cells.forEach((c, i) => {
      if (!c.crab) return;
      const to = this.nb4(i).filter((n) => { const t = this.cells[n]; return !t.crab && !t.ice && !!t.piece && t.piece.kind !== 'kitten'; });
      if (!to.length) return;
      const n = to[Math.floor(this.rand() * to.length)];
      c.crab = false;
      this.cells[n].crab = true;
      const [x, y] = this.xy(i);
      const [tx, ty] = this.xy(n);
      fx.push({ t: 'hop', x, y, tx, ty });
    });
    if (!fx.length) return;
    this.fx.push(...fx);
    this.snap('spread');
  }

  private shuffle(): void {
    const idxs = this.cells.map((c, i) => (c.piece && !c.ice && c.piece.kind !== 'kitten' ? i : -1)).filter((i) => i >= 0);
    const pieces = idxs.map((i) => this.cells[i].piece!);
    for (let tries = 0; tries < 300; tries++) {
      for (let k = pieces.length - 1; k > 0; k--) {
        const r = Math.floor(this.rand() * (k + 1));
        [pieces[k], pieces[r]] = [pieces[r], pieces[k]];
      }
      idxs.forEach((i, k) => (this.cells[i].piece = pieces[k]));
      if (tries > 150) for (const p of pieces) if (p.kind === 'n') p.color = this.randColor(); // tiny boards: recolor too
      if (!this.findGroups().length && this.findMove()) return;
    }
  }

  private ensureMoves(): void {
    if (!this.findMove()) { this.shuffle(); this.snap('shuffle'); }
  }

  private endMove(): Step[] {
    this.settle();
    if (!this.vineHit) this.spreadVine();
    if (!this.crabHit) this.scuttle();
    this.ensureMoves();
    return this.steps;
  }

  // ---------- player actions ----------

  swap(a: number, b: number): MoveResult | null {
    if (!this.canSwap(a, b)) return null;
    this.begin();
    const A = this.cells[a];
    const B = this.cells[b];
    [A.piece, B.piece] = [B.piece, A.piece];
    this.snap('swap');
    if (this.isCombo(B.piece!, A.piece!)) {
      this.moves--;
      this.combo(b, a);
      return { ok: true, steps: this.endMove() };
    }
    this.lastSwap = [a, b];
    const groups = this.findGroups();
    if (!groups.length) {
      [A.piece, B.piece] = [B.piece, A.piece];
      this.snap('bad');
      return { ok: false, steps: this.steps };
    }
    this.moves--;
    this.runWaves(groups.flatMap((g) => g.cells), groups);
    return { ok: true, steps: this.endMove() };
  }

  /** Tap a special to fire it in place. Costs a move. */
  fire(i: number): Step[] | null {
    const c = this.cells[i];
    if (!isSpecial(c.piece) || c.ice) return null;
    this.begin();
    this.moves--;
    this.runWaves([i], []);
    return this.endMove();
  }

  /** Hammer booster: hits one tile. No move spent. */
  hammer(i: number): Step[] | null {
    const c = this.cells[i];
    if (c.hole || (!solid(c) && (!c.piece || c.piece.kind === 'kitten'))) return null;
    this.begin();
    this.runWaves([i], []);
    this.settle();
    this.ensureMoves();
    return this.steps;
  }

  /** Shuffle booster. No move spent. */
  shuffleNow(): Step[] {
    this.begin();
    this.shuffle();
    this.snap('shuffle');
    return this.steps;
  }

  /** Pre-level booster: turns random plain pieces into these specials. */
  place(kinds: Kind[]): void {
    for (const kind of kinds) {
      const list = this.cells.map((c, i) => (c.piece?.kind === 'n' && !c.ice ? i : -1)).filter((i) => i >= 0);
      if (!list.length) return;
      const p = this.cells[list[Math.floor(this.rand() * list.length)]].piece!;
      p.kind = kind;
      if (kind === 'rainbow') p.color = -1;
    }
  }

  private removeQuiet(i: number): void {
    const c = this.cells[i];
    const p = c.piece!;
    c.piece = null;
    if (c.dust > 0) c.dust--;
    if (c.crab) this.catchCrab(i);
    if (p.color >= 0) this.collected[p.color]++;
    this.score += 10;
  }

  private combo(at: number, other: number): void {
    const P = this.cells[at].piece!;
    const Q = this.cells[other].piece!;
    const groomed = this.cells[at].trail || this.cells[other].trail;
    this.removeQuiet(at);
    this.removeQuiet(other);
    const [x, y] = this.xy(at);
    const kinds = [P.kind, Q.kind];
    const line = (k: Kind) => k === 'h' || k === 'v';
    const first: number[] = [];
    if (P.kind === 'rainbow' && Q.kind === 'rainbow') {
      this.cells.forEach((_, i) => first.push(i));
      this.fx.push({ t: 'blast', x, y, r: Math.max(this.w, this.h) });
      this.score += 1000;
    } else if (kinds.includes('rainbow')) {
      const R = P.kind === 'rainbow' ? Q : P;
      if (R.kind === 'n') this.rainbowColor(R.color, at, first);
      else {
        const hits = this.rainbowColor(R.color, at, []).filter((i) => this.cells[i].piece!.kind === 'n' && !this.cells[i].ice);
        for (const i of hits) {
          const p = this.cells[i].piece!;
          p.kind = line(R.kind) ? (this.rand() < 0.5 ? 'h' : 'v') : R.kind;
        }
        this.snap('convert');
        first.push(...hits);
      }
    } else if (line(P.kind) && line(Q.kind)) {
      this.effect('h', at, first);
      this.effect('v', at, first);
    } else if ((line(P.kind) || line(Q.kind)) && kinds.includes('bomb')) {
      for (let d = -1; d <= 1; d++) {
        if (y + d >= 0 && y + d < this.h) this.effect('h', this.idx(x, y + d), first);
        if (x + d >= 0 && x + d < this.w) this.effect('v', this.idx(x + d, y), first);
      }
    } else if (P.kind === 'bomb' && Q.kind === 'bomb') {
      first.push(...this.area(x, y, 3, false));
      this.fx.push({ t: 'blast', x, y, r: 3 });
    } else {
      // dragonfly + something
      const O = P.kind === 'fly' ? Q : P;
      first.push(...this.nb4(at), ...this.nb4(other));
      const flights = O.kind === 'fly' ? 3 : 1;
      for (let k = 0; k < flights; k++) {
        const t = this.pickTarget(at);
        if (t < 0) break;
        const [tx, ty] = this.xy(t);
        this.fx.push({ t: 'fly', x, y, tx, ty });
        first.push(t);
        if (O.kind !== 'fly') this.effect(O.kind, t, first);
      }
    }
    if (groomed) this.groom([at, other, ...first]);
    this.runWaves(first, []);
  }

  /** End-of-level bonus: leftover moves become wands that fire. */
  finale(): Step[] {
    this.begin();
    const left = this.moves;
    this.moves = 0;
    const cand = this.cells.map((c, i) => (c.piece?.kind === 'n' && !c.ice ? i : -1)).filter((i) => i >= 0);
    for (let k = cand.length - 1; k > 0; k--) {
      const r = Math.floor(this.rand() * (k + 1));
      [cand[k], cand[r]] = [cand[r], cand[k]];
    }
    const n = Math.min(left, FINALE_MAX, cand.length);
    for (let k = 0; k < n; k++) this.cells[cand[k]].piece!.kind = k % 2 ? 'h' : 'v';
    this.score += n * 50 + (left - n) * 300;
    if (n) this.snap('convert');
    for (let guard = 0; guard < 10; guard++) {
      const sp = this.cells.map((c, i) => (isSpecial(c.piece) && !c.ice ? i : -1)).filter((i) => i >= 0);
      if (!sp.length) break;
      this.runWaves(sp, []);
      this.settle();
    }
    return this.steps;
  }

  // ---------- goals ----------

  remaining(g: Goal): number {
    const count = (f: (c: Cell) => boolean) => this.cells.filter(f).length;
    switch (g.type) {
      case 'score': return Math.max(0, (g.n ?? 0) - this.score);
      case 'collect': return Math.max(0, (g.n ?? 0) - this.collected[g.color ?? 0]);
      case 'dust': return count((c) => c.dust > 0);
      case 'crate': return count((c) => c.crate > 0);
      case 'vine': return count((c) => c.vine);
      case 'ice': return count((c) => c.ice > 0);
      case 'kitten': return Math.max(0, (g.n ?? 0) - this.rescued);
      case 'crab': return count((c) => c.crab);
      case 'trail': return count((c) => !c.hole && !c.trail);
      case 'egg': return count((c) => c.egg > 0);
      case 'rock': return count((c) => c.rock > 0);
      case 'special': return Math.max(0, (g.n ?? 0) - this.made);
    }
  }
  won(): boolean { return this.def.goals.every((g) => this.remaining(g) === 0); }
  starsFor(score = this.score): number { return score >= this.def.stars[1] ? 3 : score >= this.def.stars[0] ? 2 : 1; }

  /** Copy for look-ahead (bots, tests). */
  clone(): Board {
    const b = Object.create(Board.prototype) as Board;
    Object.assign(b, this);
    b.cells = cloneCells(this.cells);
    b.collected = [...this.collected];
    b.steps = [];
    b.fx = [];
    b.spawnMap = {};
    b.fresh = new Set();
    return b;
  }
  reseed(seed: number): void { this.seed = seed >>> 0 || 1; }
}

/** True when a blocker fills the tile, so no piece can sit in it or fall through it. */
export const solid = (c: Cell): boolean => c.crate > 0 || c.vine || c.egg > 0 || c.rock > 0;

export function cloneCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ ...c, piece: c.piece ? { ...c.piece } : null }));
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a }, (_, k) => a + k);
}
