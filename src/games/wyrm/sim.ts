// Game rules and computer wyrms. Pure logic, no three.js, so it runs the same in a test.
import {
  T, BOT_NAMES, BOT_SKINS, segCount, radiusOf, turnRateOf, tierOf, BOSS_HEARTS,
  type BotStyle, type Skin, type PotionKind, type Arena, type ObstacleKind, type ZoneKind,
} from './data';

export type Look = Pick<Skin, 'colors' | 'head' | 'acc' | 'accColor' | 'glow'>;
const MAX_SEGS = 300;

export interface Wyrm {
  id: number;
  name: string;
  isPlayer: boolean;
  auto: boolean; // computer-driven (all bots, and the player wyrm on the menu)
  isBoss: boolean;
  hearts: number;
  style: BotStyle;
  look: Look;
  evo: number; // evolution stage 0..6 (fins, wings, tail gem, aura)
  mass: number;
  ang: number;
  targetAng: number;
  boosting: boolean;
  segs: Float32Array; // x,z pairs; [0] is the head
  n: number;
  alive: boolean;
  respawn: number;
  bubble: number;
  magnet: number;
  double: number;
  zoom: number; // free boost seconds
  frozen: number; // slowed by someone's frost potion
  scared: number; // fleeing a roar
  scareX: number; scareZ: number;
  scaredBy: Wyrm | null; // a wyrm that pops while scared counts for the one who roared
  roarCd: number;
  roarMax: number; // 0 = cannot roar
  boostCost: number; // perk multipliers
  pull: number;
  zone: ZoneKind | '';
  defeats: number;
  bestMass: number;
  dropAcc: number;
  // computer brain
  think: number;
  care: number; // chance per think to check for danger (lower = clumsier)
  sight: number; // how far ahead it checks, 1 = normal bot
  seek: boolean; // goes after sprite gems on purpose
  wander: number;
  // bounds cache for collision culling
  cx: number; cz: number; br: number;
}

export type SimEvent =
  | { t: 'burst'; x: number; z: number; colors: number[]; n: number; size: number }
  | { t: 'eat'; wyrm: Wyrm; n: number }
  | { t: 'down'; wyrm: Wyrm; by: Wyrm | null }
  | { t: 'potion'; wyrm: Wyrm; kind: PotionKind }
  | { t: 'sprite'; wyrm: Wyrm; x: number; z: number }
  | { t: 'bump'; wyrm: Wyrm; x: number; z: number }
  | { t: 'zone'; wyrm: Wyrm; kind: ZoneKind }
  | { t: 'roar'; wyrm: Wyrm; scared: number }
  | { t: 'bossHit'; wyrm: Wyrm; by: Wyrm };

export interface Potion { x: number; z: number; kind: PotionKind; alive: boolean; respawn: number }
export interface Obstacle { x: number; z: number; r: number; kind: ObstacleKind }
export interface Zone { x: number; z: number; r: number; kind: ZoneKind }
export interface Sprite { x: number; z: number; ang: number; alive: boolean; respawn: number; fleeing: boolean; stamina: number; tired: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrapAng = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function seeded(seed: number) { // mulberry32: the same place always has the same layout
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sim {
  wyrms: Wyrm[] = [];
  player!: Wyrm;
  boss: Wyrm | null = null;
  // gems: struct of arrays, compacted (0..gemCount-1 are live)
  gx = new Float32Array(T.maxGems);
  gz = new Float32Array(T.maxGems);
  gv = new Float32Array(T.maxGems);
  gc = new Uint8Array(T.maxGems); // index into arena gem colours, 255 = use gcol
  gcol = new Uint32Array(T.maxGems);
  gph = new Float32Array(T.maxGems); // bob phase
  gField = new Uint8Array(T.maxGems);
  gemCount = 0;
  fieldCount = 0;
  potions: Potion[] = [];
  obstacles: Obstacle[] = [];
  zones: Zone[] = [];
  sprites: Sprite[] = [];
  events: SimEvent[] = [];
  time = 0;
  tier = 0;
  gemColors = 6;
  potionKinds: PotionKind[] = ['magnet', 'double', 'bubble'];
  private bossDef: { name: string; look: Look; mass: number } | null = null;
  private regen = 0;
  private nameIx = 0;
  private nextId = 1;
  private near: number[] = [];

  /** Choose the place (hazard layout), bot strength, and which potions appear. Call before reset. */
  setup(arena: Arena, tier: number, potionKinds: PotionKind[], boss: { name: string; look: Look; mass: number } | null = null) {
    this.tier = tier;
    this.gemColors = arena.gems.length;
    this.potionKinds = potionKinds;
    this.bossDef = boss;
    this.obstacles = [];
    this.zones = [];
    const rnd = seeded(arena.id.length * 977 + arena.id.charCodeAt(0) * 131 + arena.id.charCodeAt(1));
    const place = (r: number): { x: number; z: number } | null => {
      for (let tries = 0; tries < 60; tries++) {
        const d = 16 + rnd() * (T.arenaRadius - 26 - r), a = rnd() * Math.PI * 2;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if ([...this.obstacles, ...this.zones].every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 7)) return { x, z };
      }
      return null;
    };
    for (const [kind, n] of arena.obstacles) {
      for (let i = 0; i < n; i++) {
        const r = kind === 'pool' ? 2.6 + rnd() * 2 : kind === 'bumper' ? 1.8 + rnd() * 0.8 : 1.8 + rnd() * 1.4;
        const p = place(r);
        if (p) this.obstacles.push({ ...p, r, kind });
      }
    }
    for (const [kind, n] of arena.zones) {
      for (let i = 0; i < n; i++) {
        const r = 5 + rnd() * 3.5;
        const p = place(r);
        if (p) this.zones.push({ ...p, r, kind });
      }
    }
  }

  reset(playerName: string, look: Look, startMass: number, auto: boolean) {
    this.wyrms = [];
    this.gemCount = 0;
    this.fieldCount = 0;
    this.events = [];
    this.time = 0;
    this.boss = null;
    this.nameIx = Math.floor(Math.random() * BOT_NAMES.length);
    this.player = this.makeWyrm(playerName, look, startMass, true);
    this.player.auto = auto;
    this.player.care = 0.97;
    this.wyrms.push(this.player);
    for (let i = 0; i < T.bots; i++) {
      const w = this.makeWyrm('', BOT_SKINS[i % BOT_SKINS.length], 0, false);
      this.spawnBot(w);
      this.wyrms.push(w);
    }
    this.placeSafe(this.player, true);
    if (this.bossDef) {
      const b = this.makeWyrm(this.bossDef.name, this.bossDef.look, this.bossDef.mass, false);
      b.isBoss = true;
      b.hearts = BOSS_HEARTS;
      b.style = 'hunter';
      b.care = 0.9;
      b.evo = 6;
      this.wyrms.push(b);
      this.placeSafe(b, false);
      this.boss = b;
    }
    while (this.fieldCount < T.fieldGems) this.spawnFieldGem();
    this.potions = [];
    for (let i = 0; i < T.potionCount; i++) {
      const p: Potion = { x: 0, z: 0, kind: this.potionKinds[i % this.potionKinds.length], alive: true, respawn: 0 };
      this.placePotion(p);
      this.potions.push(p);
    }
    this.sprites = [];
    for (let i = 0; i < T.spriteCount; i++) {
      const s: Sprite = { x: 0, z: 0, ang: 0, alive: true, respawn: 0, fleeing: false, stamina: T.spriteStamina, tired: 0 };
      this.placeSprite(s);
      this.sprites.push(s);
    }
  }

  private makeWyrm(name: string, look: Look, mass: number, isPlayer: boolean): Wyrm {
    return {
      id: this.nextId++, name, isPlayer, auto: !isPlayer, isBoss: false, hearts: 0, style: 'grazer', look, evo: 0, mass,
      ang: 0, targetAng: 0, boosting: false, segs: new Float32Array(MAX_SEGS * 2), n: 0,
      alive: true, respawn: 0, bubble: 0, magnet: 0, double: 0, zoom: 0, frozen: 0, scared: 0, scareX: 0, scareZ: 0, scaredBy: null,
      roarCd: 0, roarMax: 0, boostCost: 1, pull: 1, zone: '', defeats: 0, bestMass: mass, dropAcc: 0,
      think: Math.random() * 0.1, care: 0.9, sight: 1, seek: false, wander: rand(-Math.PI, Math.PI), cx: 0, cz: 0, br: 0,
    };
  }

  private nextName() {
    const used = new Set(this.wyrms.map((w) => w.name));
    for (let k = 0; k < BOT_NAMES.length; k++) {
      const nm = BOT_NAMES[(this.nameIx++) % BOT_NAMES.length];
      if (!used.has(nm)) return nm;
    }
    return BOT_NAMES[0];
  }

  private spawnBot(w: Wyrm) {
    const tr = tierOf(this.tier);
    w.name = this.nextName();
    const pick = Math.random() * (2 + tr.hunter + tr.circler);
    w.style = pick < 2 ? 'grazer' : pick < 2 + tr.hunter ? 'hunter' : 'circler';
    // Most bots start small; a few start big so the leaderboard has someone to chase.
    w.mass = Math.random() < tr.bigShare ? rand(80, tr.bigMass) : rand(12, tr.smallMass);
    w.care = rand(tr.careLo, tr.careHi);
    w.evo = Math.min(6, Math.floor(Math.random() * (1.6 + this.tier * 0.7)));
    w.defeats = 0;
    w.magnet = w.double = w.zoom = w.frozen = w.scared = 0;
    w.bubble = 2; // a moment to get moving
    w.alive = true;
    w.bestMass = w.mass;
    this.placeSafe(w, false);
  }

  private free(x: number, z: number, pad: number) {
    for (const o of this.obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + pad) return false;
    return true;
  }

  /** Put a wyrm somewhere away from other heads, bodies, and hazards, in a straight line. */
  placeSafe(w: Wyrm, center: boolean) {
    let bx = 0, bz = 0, bestScore = -1;
    for (let tries = 0; tries < 30; tries++) {
      const r = center && tries === 0 ? 0 : Math.sqrt(Math.random()) * (T.arenaRadius - 14);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let minD = 1e9;
      for (const o of this.obstacles) minD = Math.min(minD, (Math.hypot(o.x - x, o.z - z) - o.r) * 1.6);
      for (const o of this.wyrms) {
        if (o === w || !o.alive) continue;
        for (let i = 0; i < o.n; i += 3) {
          const d = Math.hypot(o.segs[i * 2] - x, o.segs[i * 2 + 1] - z);
          if (d < minD) minD = d;
        }
      }
      if (minD > bestScore) { bestScore = minD; bx = x; bz = z; }
      if (minD > 16) break;
    }
    w.ang = w.targetAng = Math.atan2(-bz, -bx) + rand(-0.8, 0.8); // face roughly inward
    w.n = segCount(w.mass);
    const sp = radiusOf(w.mass) * 0.55;
    for (let i = 0; i < w.n; i++) {
      w.segs[i * 2] = bx - Math.cos(w.ang) * sp * i;
      w.segs[i * 2 + 1] = bz - Math.sin(w.ang) * sp * i;
    }
    w.alive = true;
  }

  private spot(margin: number, pad: number): [number, number] {
    for (let k = 0; k < 12; k++) {
      const r = Math.sqrt(Math.random()) * (T.arenaRadius - margin);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.free(x, z, pad)) return [x, z];
    }
    return [0, 0];
  }
  private placePotion(p: Potion) { [p.x, p.z] = this.spot(10, 2); p.alive = true; }
  private placeSprite(s: Sprite) { [s.x, s.z] = this.spot(12, 3); s.ang = rand(-Math.PI, Math.PI); s.alive = true; s.fleeing = false; s.stamina = T.spriteStamina; s.tired = 0; }

  private addGem(x: number, z: number, v: number, colorIx: number, rgb: number, field: boolean) {
    if (this.gemCount >= T.maxGems) return;
    const i = this.gemCount++;
    this.gx[i] = x; this.gz[i] = z; this.gv[i] = v;
    this.gc[i] = colorIx; this.gcol[i] = rgb;
    this.gph[i] = Math.random() * 6.28;
    this.gField[i] = field ? 1 : 0;
    if (field) this.fieldCount++;
  }

  private spawnFieldGem() {
    const [x, z] = this.spot(2, 2.5);
    this.addGem(x, z, Math.random() < 0.15 ? 2 : 1, Math.floor(Math.random() * this.gemColors), 0, true);
  }

  private removeGem(i: number) {
    if (this.gField[i]) this.fieldCount--;
    const last = --this.gemCount;
    if (i !== last) {
      this.gx[i] = this.gx[last]; this.gz[i] = this.gz[last]; this.gv[i] = this.gv[last];
      this.gc[i] = this.gc[last]; this.gcol[i] = this.gcol[last]; this.gph[i] = this.gph[last];
      this.gField[i] = this.gField[last];
    }
  }

  /** Defeat a wyrm. Gems spill now unless `hold` (the player may still revive). */
  down(w: Wyrm, by: Wyrm | null, hold: boolean) {
    if (!w.alive) return;
    w.alive = false;
    w.boosting = false;
    if (w.scared > 0 && w.scaredBy?.alive) by = w.scaredBy;
    if (by && by !== w) by.defeats++;
    this.events.push({ t: 'burst', x: w.segs[0], z: w.segs[1], colors: w.look.colors, n: 40, size: radiusOf(w.mass) });
    this.events.push({ t: 'down', wyrm: w, by });
    if (!hold) this.spill(w);
    if (!w.isBoss && (!w.isPlayer || w.auto)) w.respawn = T.botRespawnSecs;
  }

  /** Burst a defeated wyrm into big gems along its body. */
  spill(w: Wyrm, share = T.deathDropShare) {
    const total = w.mass * share;
    const count = Math.max(6, Math.min(90, Math.round(w.n / 2)));
    const v = total / count;
    const step = w.n / count;
    for (let k = 0; k < count; k++) {
      const i = Math.min(w.n - 1, Math.floor(k * step));
      const col = w.look.colors[k % w.look.colors.length];
      this.addGem(w.segs[i * 2] + rand(-0.8, 0.8), w.segs[i * 2 + 1] + rand(-0.8, 0.8), v, 255, col, false);
    }
    for (let k = 0; k < count; k += 6) {
      const i = Math.min(w.n - 1, Math.floor(k * step));
      this.events.push({ t: 'burst', x: w.segs[i * 2], z: w.segs[i * 2 + 1], colors: w.look.colors, n: 8, size: 0.6 });
    }
  }

  revive(w: Wyrm) {
    this.placeSafe(w, false);
    w.bubble = Math.max(w.bubble, T.reviveBubbleSecs);
    w.boosting = false;
    w.frozen = 0;
  }

  /** Roar: smaller wyrms nearby panic and run. Returns false while it recharges. */
  roar(w: Wyrm): boolean {
    if (!w.alive || w.roarMax <= 0 || w.roarCd > 0) return false;
    w.roarCd = w.roarMax;
    let n = 0;
    for (const o of this.wyrms) {
      if (o === w || !o.alive || o.isBoss || !o.auto || o.mass > w.mass * 1.5) continue;
      if (Math.hypot(o.segs[0] - w.segs[0], o.segs[1] - w.segs[1]) > T.roarRadius + radiusOf(w.mass) * 4) continue;
      o.scared = T.roarScareSecs;
      o.scaredBy = w;
      o.scareX = w.segs[0]; o.scareZ = w.segs[1];
      o.think = 0;
      n++;
    }
    this.events.push({ t: 'roar', wyrm: w, scared: n });
    return true;
  }

  /** The boss ran head-first into a body: it loses a heart, shrinks, and backs off. */
  private bossHit(b: Wyrm, by: Wyrm) {
    b.hearts--;
    this.events.push({ t: 'bossHit', wyrm: b, by });
    if (b.hearts <= 0) { this.down(b, by, false); return; }
    this.spill(b, 0.2);
    b.mass *= 0.8;
    b.bubble = 3;
    b.ang = b.targetAng = wrapAng(b.ang + Math.PI);
    this.events.push({ t: 'burst', x: b.segs[0], z: b.segs[1], colors: b.look.colors, n: 30, size: 1.2 });
  }

  step(dt: number) {
    this.time += dt;
    const R = T.arenaRadius;
    for (const w of this.wyrms) {
      if (!w.alive) {
        if (w.respawn > 0 && (w.respawn -= dt) <= 0) {
          if (w.isPlayer) { w.mass = T.startMass; this.placeSafe(w, false); } else this.spawnBot(w);
        }
        continue;
      }
      if (w.auto) this.brain(w, dt);
      const r = radiusOf(w.mass);
      const s = w.segs;
      // zone under the head
      let zone: ZoneKind | '' = '';
      for (const z of this.zones) if ((s[0] - z.x) ** 2 + (s[1] - z.z) ** 2 < z.r * z.r) { zone = z.kind; break; }
      if (zone !== w.zone) { w.zone = zone; if (zone) this.events.push({ t: 'zone', wyrm: w, kind: zone }); }
      // turn toward target
      const diff = wrapAng(w.targetAng - w.ang);
      const maxTurn = turnRateOf(w.mass) * dt * (w.boosting ? 0.8 : 1) * (zone === 'slick' ? 0.4 : 1);
      w.ang = wrapAng(w.ang + Math.max(-maxTurn, Math.min(maxTurn, diff)));
      // boost burns mass and drops a trail of small gems
      if (w.boosting && (w.frozen > 0 || (w.mass <= T.minBoostMass && w.zoom <= 0))) w.boosting = false;
      let speed = (w.boosting ? T.boostSpeed : T.baseSpeed) * (1 + r * 0.12);
      if (zone === 'slow') speed *= 0.6; else if (zone === 'fast') speed *= 1.35;
      if (w.frozen > 0) speed *= 0.45;
      if (w.boosting && w.zoom <= 0) {
        const cost = T.boostCostPerSec * dt * (1 + w.mass / 800) * w.boostCost;
        w.mass -= cost;
        w.dropAcc += cost * 0.6;
        if (w.dropAcc >= 1) {
          const t = (w.n - 1) * 2;
          this.addGem(s[t] + rand(-0.3, 0.3), s[t + 1] + rand(-0.3, 0.3), w.dropAcc, 255, w.look.colors[0], false);
          w.dropAcc = 0;
        }
      }
      // move head, then the body follows at fixed spacing
      s[0] += Math.cos(w.ang) * speed * dt;
      s[1] += Math.sin(w.ang) * speed * dt;
      const want = segCount(w.mass);
      while (w.n < want) { s[w.n * 2] = s[(w.n - 1) * 2]; s[w.n * 2 + 1] = s[(w.n - 1) * 2 + 1]; w.n++; }
      if (w.n > want) w.n = want;
      const sp = r * 0.55;
      let minx = s[0], maxx = s[0], minz = s[1], maxz = s[1];
      for (let i = 1; i < w.n; i++) {
        const dx = s[i * 2 - 2] - s[i * 2], dz = s[i * 2 - 1] - s[i * 2 + 1];
        const d = Math.hypot(dx, dz);
        if (d > sp) { const k = (d - sp) / d; s[i * 2] += dx * k; s[i * 2 + 1] += dz * k; }
        const x = s[i * 2], z = s[i * 2 + 1];
        if (x < minx) minx = x; else if (x > maxx) maxx = x;
        if (z < minz) minz = z; else if (z > maxz) maxz = z;
      }
      w.cx = (minx + maxx) / 2; w.cz = (minz + maxz) / 2;
      w.br = Math.hypot(maxx - minx, maxz - minz) / 2 + r;
      w.bubble = Math.max(0, w.bubble - dt);
      w.magnet = Math.max(0, w.magnet - dt);
      w.double = Math.max(0, w.double - dt);
      w.zoom = Math.max(0, w.zoom - dt);
      w.frozen = Math.max(0, w.frozen - dt);
      w.scared = Math.max(0, w.scared - dt);
      w.roarCd = Math.max(0, w.roarCd - dt);
      // border: a bubble (or a boss) bounces off, otherwise the wyrm pops
      const hd = Math.hypot(s[0], s[1]);
      if (hd + r > R) {
        if (w.bubble > 0 || w.isBoss) { s[0] *= (R - r) / hd; s[1] *= (R - r) / hd; w.ang = w.targetAng = Math.atan2(-s[1], -s[0]); }
        else { this.down(w, null, w.isPlayer && !w.auto); continue; }
      }
      // rocks and pools pop; bumpers (and any hazard while bubbled) bounce
      let popped = false;
      for (const o of this.obstacles) {
        const dx = s[0] - o.x, dz = s[1] - o.z, lim = o.r + r * 0.7;
        if (dx * dx + dz * dz >= lim * lim) continue;
        if (o.kind === 'bumper' || w.bubble > 0 || w.isBoss) {
          const d = Math.hypot(dx, dz) || 1;
          s[0] = o.x + (dx / d) * (lim + 0.3); s[1] = o.z + (dz / d) * (lim + 0.3);
          w.ang = w.targetAng = Math.atan2(dz, dx) + rand(-0.5, 0.5);
          this.events.push({ t: 'bump', wyrm: w, x: o.x, z: o.z });
        } else { this.down(w, null, w.isPlayer && !w.auto); popped = true; }
        break;
      }
      if (popped) continue;
      this.eat(w, r);
    }
    this.collide();
    this.moveSprites(dt);
    for (const p of this.potions) if (!p.alive && (p.respawn -= dt) <= 0) this.placePotion(p);
    // eaten gems grow back at a steady rate, so a grazed patch stays thin for a while
    this.regen = Math.min(5, this.regen + dt * T.gemRegenPerSec);
    while (this.fieldCount < T.fieldGems && this.regen >= 1) { this.spawnFieldGem(); this.regen--; }
  }

  /** Sprite gems drift until a head comes near, then run. They are faster than a wyrm that is not boosting. */
  private moveSprites(dt: number) {
    const R = T.arenaRadius - 3;
    for (const sp of this.sprites) {
      if (!sp.alive) { if ((sp.respawn -= dt) <= 0) this.placeSprite(sp); continue; }
      let near: Wyrm | null = null, nd = 9;
      for (const w of this.wyrms) {
        if (!w.alive) continue;
        const d = Math.hypot(w.segs[0] - sp.x, w.segs[1] - sp.z);
        if (d < nd) { nd = d; near = w; }
      }
      // a sprite runs until it is out of breath, then it has to rest: chase it and it can be caught
      sp.tired = Math.max(0, sp.tired - dt);
      sp.fleeing = !!near && sp.tired <= 0;
      let speed = 1.5;
      if (near) {
        const away = Math.atan2(sp.z - near.segs[1], sp.x - near.segs[0]);
        sp.ang += wrapAng(away - sp.ang) * Math.min(1, dt * 6);
        speed = sp.fleeing ? T.spriteSpeed : 3;
        if (sp.fleeing && (sp.stamina -= dt) <= 0) { sp.tired = 2.5; sp.stamina = T.spriteStamina; }
      } else {
        sp.ang += Math.sin(this.time * 0.7 + sp.x) * dt;
        sp.stamina = Math.min(T.spriteStamina, sp.stamina + dt);
      }
      let nx = sp.x + Math.cos(sp.ang) * speed * dt, nz = sp.z + Math.sin(sp.ang) * speed * dt;
      const d = Math.hypot(nx, nz);
      if (d > R) { nx *= R / d; nz *= R / d; sp.ang += dt * 3; } // slides along the border, so it can be cornered
      for (const o of this.obstacles) {
        const od = Math.hypot(nx - o.x, nz - o.z);
        if (od < o.r + 0.8) { nx = o.x + ((nx - o.x) / od) * (o.r + 0.8); nz = o.z + ((nz - o.z) / od) * (o.r + 0.8); }
      }
      sp.x = nx; sp.z = nz;
      if (near && nd < radiusOf(near.mass) + 0.9) {
        sp.alive = false;
        sp.respawn = 8;
        near.mass += T.spriteValue * (near.double > 0 ? 2 : 1);
        if (near.mass > near.bestMass) near.bestMass = near.mass;
        this.events.push({ t: 'sprite', wyrm: near, x: sp.x, z: sp.z });
      }
    }
  }

  private eat(w: Wyrm, r: number) {
    const hx = w.segs[0], hz = w.segs[1];
    const pull = (r * 2.2 + 1.2 + (w.magnet > 0 ? 7 : 0)) * w.pull;
    const bite = r + 0.55;
    const mult = w.double > 0 ? 2 : 1;
    let ate = 0;
    for (let i = this.gemCount - 1; i >= 0; i--) {
      const dx = hx - this.gx[i], dz = hz - this.gz[i];
      if (dx > pull || dx < -pull || dz > pull || dz < -pull) continue;
      const d = Math.hypot(dx, dz);
      if (d < bite) {
        w.mass += this.gv[i] * mult;
        this.removeGem(i);
        ate++;
      } else if (d < pull) {
        const k = Math.min(1, 0.22 + (w.magnet > 0 ? 0.08 : 0)) * (1 - d / pull) + 0.04;
        this.gx[i] += dx * k; this.gz[i] += dz * k;
      }
    }
    if (ate) {
      if (w.mass > w.bestMass) w.bestMass = w.mass;
      this.events.push({ t: 'eat', wyrm: w, n: ate });
    }
    for (const p of this.potions) {
      if (!p.alive || Math.hypot(hx - p.x, hz - p.z) > r + 1.1) continue;
      p.alive = false;
      p.respawn = 20;
      if (p.kind === 'magnet') w.magnet = T.potionSecs;
      else if (p.kind === 'double') w.double = T.potionSecs;
      else if (p.kind === 'bubble') w.bubble = T.bubbleSecs;
      else if (p.kind === 'zoom') w.zoom = T.zoomSecs;
      else for (const o of this.wyrms) if (o !== w && o.alive && !o.isBoss) o.frozen = T.frostSecs;
      this.events.push({ t: 'potion', wyrm: w, kind: p.kind });
    }
  }

  private collide() {
    for (const a of this.wyrms) {
      if (!a.alive || a.bubble > 0) continue;
      const hx = a.segs[0], hz = a.segs[1];
      const ra = radiusOf(a.mass);
      for (const b of this.wyrms) {
        if (b === a || !b.alive) continue;
        if (Math.hypot(hx - b.cx, hz - b.cz) > b.br + ra) continue;
        const rb = radiusOf(b.mass);
        const hit = (ra * 0.75 + rb * 0.85) ** 2;
        let crashed = false;
        for (let i = 0; i < b.n; i++) {
          const dx = hx - b.segs[i * 2], dz = hz - b.segs[i * 2 + 1];
          if (dx * dx + dz * dz < hit) { crashed = true; break; }
        }
        if (crashed) {
          if (a.isBoss) this.bossHit(a, b); else this.down(a, b, a.isPlayer && !a.auto);
          break;
        }
      }
    }
  }

  // ---- computer wyrms ----
  private brain(w: Wyrm, dt: number) {
    w.think -= dt;
    if (w.think > 0) return;
    w.think = 0.1;
    const hx = w.segs[0], hz = w.segs[1];
    const r = radiusOf(w.mass);
    let goal = w.ang;
    let boost = false;
    let care = w.care;
    const toward = (x: number, z: number) => Math.atan2(z - hz, x - hx);

    // biggest nearby threat and smallest nearby prey
    let threat: Wyrm | null = null, threatD = 1e9, prey: Wyrm | null = null, preyD = 1e9;
    for (const o of this.wyrms) {
      if (o === w || !o.alive) continue;
      const d = Math.hypot(o.segs[0] - hx, o.segs[1] - hz);
      if (o.mass > w.mass * 1.2 && d < 12 && d < threatD) { threat = o; threatD = d; }
      if (o.mass < w.mass * 0.8 && d < 26 && d < preyD) { prey = o; preyD = d; }
    }

    if (w.scared > 0) {
      // panic: run from the roar, and look where it is going only half the time
      goal = toward(w.scareX, w.scareZ) + Math.PI + rand(-0.5, 0.5);
      boost = w.mass > 20;
      care *= 0.5;
    } else if (w.isBoss) {
      // the boss charges the player; a charging boss is careless, which is how it gets beaten
      const p = this.player;
      const pd = p.alive ? Math.hypot(p.segs[0] - hx, p.segs[1] - hz) : 1e9;
      if (pd < 45) {
        const lead = Math.min(10, pd * 0.4);
        goal = toward(p.segs[0] + Math.cos(p.ang) * lead, p.segs[1] + Math.sin(p.ang) * lead);
        boost = pd < 20 && pd > 5;
        care = boost ? 0.45 : 0.8;
      } else goal = toward(0, 0) + Math.sin(this.time * 0.3) * 1.2;
    } else if (threat && w.style !== 'hunter') {
      goal = toward(threat.segs[0], threat.segs[1]) + Math.PI;
      boost = threatD < 6 && w.mass > 40;
    } else if (prey && w.style === 'hunter' && w.mass > 35) {
      const lead = 4 + radiusOf(prey.mass) * 3;
      goal = toward(prey.segs[0] + Math.cos(prey.ang) * lead, prey.segs[1] + Math.sin(prey.ang) * lead);
      boost = preyD < 12 && w.mass > 60;
    } else if (prey && w.style === 'circler' && w.n > 50 && preyD < 15) {
      goal = toward(prey.segs[0], prey.segs[1]) + Math.PI / 2.2;
    } else {
      // graze: best gem or sprite nearby by value over distance, else wander
      let best = -1, bx = 0, bz = 0, bv = 0;
      const look = w.style === 'hunter' ? 30 : 18;
      for (let i = 0; i < this.gemCount; i++) {
        const dx = this.gx[i] - hx, dz = this.gz[i] - hz;
        if (Math.abs(dx) > look || Math.abs(dz) > look) continue;
        const d = Math.hypot(dx, dz) + 1;
        const ahead = Math.cos(Math.atan2(dz, dx) - w.ang) * 0.5 + 1; // prefer gems in front
        const score = (this.gv[i] * ahead) / d;
        if (score > best) { best = score; bx = this.gx[i]; bz = this.gz[i]; bv = this.gv[i]; }
      }
      let chase = false;
      if (w.mass > 40 || w.seek) for (const sp of this.sprites) {
        if (!sp.alive) continue;
        const d = Math.hypot(sp.x - hx, sp.z - hz) + 1;
        const val = T.spriteValue * (w.seek ? 12 : 1) / d;
        if (d < (w.seek ? 40 : 14) && val > best) { best = val; bx = sp.x; bz = sp.z; bv = T.spriteValue; chase = w.seek && d < 14; }
      }
      if (best >= 0) goal = toward(bx, bz);
      else {
        if (Math.random() < 0.05) w.wander += rand(-1.5, 1.5);
        goal = w.wander;
      }
      boost = chase ? w.mass > 25 : best >= 0 && bv >= 4 && w.mass > 50 && Math.random() < 0.3;
    }

    // stay off the border
    const hd = Math.hypot(hx, hz);
    if (hd > T.arenaRadius - 10 - r * 4) goal = toward(0, 0) + rand(-0.6, 0.6);

    // steer around rocks and pools well before reaching them
    for (const o of this.obstacles) {
      if (o.kind === 'bumper') continue;
      const dx = o.x - hx, dz = o.z - hz;
      const lim = o.r + r + 6;
      if (dx * dx + dz * dz > lim * lim) continue;
      const rel = wrapAng(goal - Math.atan2(dz, dx));
      if (Math.abs(rel) < 1.2) goal = Math.atan2(dz, dx) + (rel >= 0 ? 1.4 : -1.4);
    }

    // danger check: pick the steering angle nearest the goal with a clear path
    if (Math.random() < care) goal = this.clearPath(w, goal, r);
    w.targetAng = goal;
    w.boosting = boost;
  }

  private clearPath(w: Wyrm, goal: number, r: number): number {
    const hx = w.segs[0], hz = w.segs[1];
    const reach = (3 + r * 4) * w.sight;
    const near = this.near;
    near.length = 0;
    for (const o of this.wyrms) {
      if (o === w || !o.alive) continue;
      if (Math.hypot(hx - o.cx, hz - o.cz) > o.br + reach + 2) continue;
      const pad = radiusOf(o.mass) + r + 0.4;
      for (let i = 0; i < o.n; i += 2) {
        const x = o.segs[i * 2], z = o.segs[i * 2 + 1];
        if (Math.abs(x - hx) < reach + pad && Math.abs(z - hz) < reach + pad) near.push(x, z, pad);
      }
    }
    for (const o of this.obstacles) {
      const pad = o.r + r + 0.6;
      if (Math.abs(o.x - hx) < reach + pad && Math.abs(o.z - hz) < reach + pad) near.push(o.x, o.z, pad);
    }
    const blocked = (a: number) => {
      const steps = w.sight > 1 ? 5 : 3;
      for (let k = 1; k <= steps; k++) {
        const px = hx + Math.cos(a) * reach * k / steps, pz = hz + Math.sin(a) * reach * k / steps;
        if (Math.hypot(px, pz) > T.arenaRadius - r - 1) return true;
        for (let j = 0; j < near.length; j += 3) {
          const dx = px - near[j], dz = pz - near[j + 1];
          if (dx * dx + dz * dz < near[j + 2] * near[j + 2]) return true;
        }
      }
      return false;
    };
    const rel = wrapAng(goal - w.ang);
    const clamped = w.ang + Math.max(-1.3, Math.min(1.3, rel));
    if (!blocked(clamped)) return goal;
    for (let k = 1; k <= 8; k++) {
      for (const sgn of [1, -1]) {
        const a = clamped + sgn * k * 0.32;
        if (!blocked(a)) return a;
      }
    }
    return w.ang + Math.PI * 0.9; // boxed in: hard turn
  }

  ranking(): Wyrm[] {
    return this.wyrms.filter((w) => w.alive || (w.isPlayer && !w.auto)).sort((a, b) => b.mass - a.mass);
  }
}
