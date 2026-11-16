// Pure grid logic for the territory: who owns each cell, whose open trail lies on it, and loop closing.
// No three.js and no DOM here, so `node -e "import('./src/games/trail/field.ts').then(m => m.selfCheck())"` runs it.

export class Field {
  readonly n: number;
  readonly owner: Uint8Array; // 0 = nobody, else skier id 1..8
  readonly trail: Uint8Array; // 0 = no trail, else skier id whose open trail crosses this cell
  readonly counts = new Int32Array(9); // owned cells per id, refreshed by recount()
  private seen: Uint8Array;
  private stack: Int32Array;

  constructor(n: number) {
    this.n = n;
    this.owner = new Uint8Array(n * n);
    this.trail = new Uint8Array(n * n);
    this.seen = new Uint8Array(n * n);
    this.stack = new Int32Array(n * n);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.n && y < this.n;
  }

  /** Give a round patch of land to `id` (start or revive). */
  claimDisk(id: number, cx: number, cy: number, r: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (this.inside(x, y) && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.owner[y * this.n + x] = id;
    this.recount();
  }

  /** True when a disk around (cx, cy) has no land and no trail: a free spot to drop a skier. */
  isFree(cx: number, cy: number, r: number): boolean {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inside(x, y)) return false;
        const i = y * this.n + x;
        if (this.owner[i] || this.trail[i]) return false;
      }
    return true;
  }

  /**
   * The skier is back on its own land: its trail becomes land, and every cell the trail walls off from the
   * map edge becomes land too (empty snow and rival land alike). Rivals' open trails stay where they are.
   * Returns the number of cells gained.
   */
  closeLoop(id: number): number {
    const { n, owner, trail, seen, stack } = this;
    const before = this.countOf(id);
    for (let i = 0; i < n * n; i++)
      if (trail[i] === id) {
        trail[i] = 0;
        owner[i] = id;
      }
    // Flood (4-neighbour) from every edge cell that is not ours; whatever it cannot reach is enclosed.
    // An 8-connected wall stops a 4-connected flood, so diagonal steps in the trail still seal.
    seen.fill(0);
    let top = 0;
    const push = (i: number) => {
      if (!seen[i] && owner[i] !== id) {
        seen[i] = 1;
        stack[top++] = i;
      }
    };
    for (let k = 0; k < n; k++) {
      push(k);
      push((n - 1) * n + k);
      push(k * n);
      push(k * n + n - 1);
    }
    while (top > 0) {
      const i = stack[--top];
      const x = i % n;
      if (x > 0) push(i - 1);
      if (x < n - 1) push(i + 1);
      if (i >= n) push(i - n);
      if (i < n * n - n) push(i + n);
    }
    for (let i = 0; i < n * n; i++) if (!seen[i]) owner[i] = id;
    this.recount();
    return this.countOf(id) - before;
  }

  /** Remove every cell of land and trail that belongs to `id`. Returns the land cells it had. */
  wipe(id: number): number[] {
    const had: number[] = [];
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] === id) {
        this.owner[i] = 0;
        had.push(i);
      }
      if (this.trail[i] === id) this.trail[i] = 0;
    }
    this.recount();
    return had;
  }

  clearTrail(id: number): void {
    for (let i = 0; i < this.trail.length; i++) if (this.trail[i] === id) this.trail[i] = 0;
  }

  countOf(id: number): number {
    return this.counts[id];
  }

  recount(): void {
    this.counts.fill(0);
    for (let i = 0; i < this.owner.length; i++) this.counts[this.owner[i]]++;
  }
}

/** Assert-based self-check of the enclosure fill. Throws on the first failure. */
export function selfCheck(): string {
  const ok = (cond: boolean, msg: string) => {
    if (!cond) throw new Error('trail field self-check failed: ' + msg);
  };
  const f = new Field(20);
  const at = (x: number, y: number) => f.owner[y * 20 + x];
  const lay = (id: number, cells: [number, number][]) => cells.forEach(([x, y]) => (f.trail[y * 20 + x] = id));
  const line = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]);
    return out;
  };

  // 1. A rectangle loop out of a home patch fills its inside, not its outside.
  f.claimDisk(1, 5, 5, 2);
  ok(at(5, 5) === 1 && at(7, 5) === 1 && at(8, 5) === 0, 'home disk radius');
  f.owner[8 * 20 + 10] = 2; // a rival cell that the loop will surround
  lay(1, [...line(8, 5, 12, 5), ...line(12, 6, 12, 10), ...line(5, 10, 11, 10), ...line(5, 8, 5, 9)]);
  const gained = f.closeLoop(1);
  ok(at(10, 8) === 1, 'rival land inside the loop is stolen');
  ok(at(9, 7) === 1 && at(11, 9) === 1, 'inside filled');
  ok(at(12, 10) === 1, 'trail itself becomes land');
  ok(at(13, 7) === 0 && at(15, 15) === 0 && at(0, 0) === 0, 'outside stays empty');
  ok(f.trail.every((t) => t === 0), 'trail cleared');
  ok(gained > 30 && f.countOf(2) === 0, 'counts updated');

  // 2. A diagonal (8-connected) trail still seals the area.
  const g = new Field(12);
  g.claimDisk(1, 2, 2, 1);
  for (let k = 0; k < 6; k++) g.trail[(3 + k) * 12 + 3 + k] = 1; // diagonal down-right
  for (let x = 3; x <= 8; x++) g.trail[8 * 12 + x] = 1; // back along the bottom
  for (let y = 3; y <= 8; y++) g.trail[y * 12 + 2] = 1; // up the left side to home
  g.closeLoop(1);
  ok(g.owner[7 * 12 + 4] === 1, 'cell under the diagonal filled');
  ok(g.owner[4 * 12 + 7] === 0, 'cell above the diagonal stays empty');

  // 3. A loop that only touches the map edge encloses nothing beyond its own trail.
  const h = new Field(10);
  h.claimDisk(1, 1, 5, 1);
  for (let x = 2; x <= 5; x++) h.trail[3 * 10 + x] = 1;
  h.closeLoop(1);
  ok(h.owner[0 * 10 + 4] === 0, 'edge region not enclosed');

  // 4. Wipe removes land and trail.
  f.trail[0] = 1;
  const had = f.wipe(1);
  ok(had.length > 0 && f.countOf(1) === 0 && f.trail[0] === 0, 'wipe clears all');
  return 'trail field self-check passed';
}
