// Builds one farm: rolling ground, water, plots with crops and things in the way, the barnyard, trees, sky and mountains.
import * as THREE from 'three';
import * as D from './data';
import * as M from './models';

export interface PlotState {
  def: D.Plot;
  cols: number; rows: number;
  x0: number; z0: number; // world position of cell (0, 0)
  cell: Int32Array; // crop index per grid cell, -1 = none
  n: number; // crops
  pos: Float32Array; // x, y, z, rotY, scale per crop
  kind: Uint8Array; // index into def.crops
  alive: Uint8Array;
  hp: Float32Array; // 1 = untouched, 0 = cut
  aliveCount: number;
  slot: Uint32Array; // instance index inside its crop mesh
  meshes: THREE.InstancedMesh[]; // one per crop kind
  sign: THREE.Mesh;
  grow: number; // regrow animation 0..1, 1 = done
  value: number; // coins for the whole plot at base prices
}
export interface Spot { x: number; z: number; r: number; h: number }

export const PAD = { x: 0, z: 0, r: 4.6 };
/** Where the sun stands, from the player: low and golden. The light, the sky and the light shafts all use it. */
export const SUN = new THREE.Vector3(30, 30, 34);
const BARN = { x: 0, z: 13, hw: 4.4, hd: 3.9 };
const WATER_Y = -0.42;
const SITE: Record<D.BuildId, [number, number, number]> = { silo: [8.6, 14, 0], market: [-12.5, 2, Math.PI / 2], windmill: [18, -9, 0.5], greenhouse: [-14.5, 15, 0], pen: [21, 12, 0] };
const DECOR_SPOTS: [number, number][] = [[-7, 7.5], [7, 7], [-12.5, -9], [12, -10], [-19.5, 7], [13.5, 2.5]];

const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const noise = (x: number, z: number) => {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const h = (a: number, b: number) => hash(a * 57 + b * 131);
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
};
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

export function inShape(def: D.Plot, col: number, row: number, cols: number, rows: number) {
  const u = (col + 0.5) / cols - 0.5, v = (row + 0.5) / rows - 0.5, r = Math.hypot(u, v);
  switch (def.shape) {
    case 'rect': return true;
    case 'round': return r < 0.5;
    case 'L': return !(u > 0.04 && v > 0.04);
    case 'ring': return r < 0.5 && r > (def.pond + 3.5) / Math.max(def.w, def.d);
    case 'blob': return r < 0.5 * (0.8 + 0.14 * Math.sin(Math.atan2(v, u) * 3 + def.x) + 0.08 * Math.sin(Math.atan2(v, u) * 5 + def.z));
    case 'diamond': return Math.abs(u) + Math.abs(v) < 0.5;
    case 'terrace': return row % 6 !== 5;
  }
}
function cropAt(def: D.Plot, col: number, row: number, cols: number, rows: number) {
  const n = def.crops.length;
  if (n === 1) return 0;
  switch (def.pat) {
    case 'stripes': return Math.floor(row / 4) % n;
    case 'checker': return (Math.floor(col / 5) + Math.floor(row / 5)) % n;
    case 'rings': return Math.min(n - 1, Math.floor(Math.hypot((col + 0.5) / cols - 0.5, (row + 0.5) / rows - 0.5) * 2.2 * n));
    case 'patches': return Math.max(0, Math.min(n - 1, Math.floor(noise(col / 5 + def.x, row / 5 + def.z) * n * 1.3 - 0.15 * n)));
  }
}

export function buildWorld(farm: D.Farm, farmIdx: number, low: boolean) {
  const group = new THREE.Group();
  const L = farm.look;
  const SP = D.CROP_SPACING;
  const ponds = [...farm.ponds];
  for (const p of farm.plots) if (p.pond && !ponds.some((q) => q[0] === p.x && q[1] === p.z)) ponds.push([p.x, p.z, p.pond]);
  const st = farm.stream;

  // ---------- ground shape ----------
  const streamDist = (x: number, z: number) => {
    if (!st) return 1e9;
    let d = 1e9;
    for (let i = 0; i < st.pts.length - 1; i++) d = Math.min(d, segDist(x, z, st.pts[i][0], st.pts[i][1], st.pts[i + 1][0], st.pts[i + 1][1]));
    return d;
  };
  /** 0 = dry land, 1 = open water. */
  const wet = (x: number, z: number) => {
    let w = 0;
    for (const [px, pz, pr] of ponds) w = Math.max(w, 1 - smooth(pr - 1.5, pr + 2.5, Math.hypot(x - px, z - pz)));
    if (st) w = Math.max(w, 1 - smooth(st.half - 1, st.half + 2.5, streamDist(x, z)));
    if (farm.ocean !== undefined) w = Math.max(w, smooth(farm.ocean - 5, farm.ocean + 7, z + Math.sin(x * 0.07) * 4));
    return w;
  };
  const land = (x: number, z: number) => {
    // Always above the water line: only ponds, streams and the sea are wet.
    const hill = farm.hills * 0.6 * (1.8 + Math.sin(x * 0.043 + 1.3 + farmIdx) * Math.cos(z * 0.051 + 0.4) * 0.8 + Math.sin((x + z) * 0.023 + 2 + farmIdx * 2) * 0.7 + Math.sin(x * 0.09 + z * 0.03) * 0.25);
    const rim = smooth(farm.radius, farm.radius + 55, Math.hypot(x, z));
    const calm = st ? smooth(st.half, st.half + 16, streamDist(x, z)) : 1;
    const h = hill * smooth(16, 42, Math.hypot(x, z - 6)) * (0.25 + 0.75 * calm) + rim * rim * 9;
    const w = wet(x, z);
    return h * (1 - w) - 1.5 * w;
  };

  // Bridges: flat decks across the stream.
  interface Bridge { x: number; z: number; ax: number; az: number; len: number; hA: number; hB: number }
  const bridges: Bridge[] = [];
  if (st)
    for (const f of st.bridges) {
      const s = f * (st.pts.length - 1), i = Math.min(st.pts.length - 2, Math.floor(s)), k = s - i;
      const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
      const dl = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / dl, nz = (bx - ax) / dl; // across the stream
      const x = ax + (bx - ax) * k, z = az + (bz - az) * k, len = st.half * 2 + 8;
      bridges.push({ x, z, ax: nx, az: nz, len, hA: Math.max(0.1, land(x - (nx * len) / 2, z - (nz * len) / 2)), hB: Math.max(0.1, land(x + (nx * len) / 2, z + (nz * len) / 2)) });
    }
  const deckAt = (x: number, z: number): number | null => {
    for (const b of bridges) {
      const a = (x - b.x) * b.ax + (z - b.z) * b.az, c = (x - b.x) * b.az - (z - b.z) * b.ax;
      if (Math.abs(a) < b.len / 2 + 0.4 && Math.abs(c) < 1.9) return b.hA + (b.hB - b.hA) * Math.max(0, Math.min(1, a / b.len + 0.5)) + 0.12;
    }
    return null;
  };
  const groundY = (x: number, z: number) => {
    const d = deckAt(x, z), h = land(x, z);
    return d !== null && d > h ? d : h;
  };
  /** Which bank of the stream a spot is on (-1 or 1); 1 when there is no stream. */
  const bank = (x: number, z: number) => {
    if (!st) return 1;
    let i = 0;
    while (i < st.pts.length - 2 && x > st.pts[i + 1][0]) i++;
    const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
    return z < az + ((bz - az) * (x - ax)) / (bx - ax) ? -1 : 1;
  };
  /** Next spot to drive to on the way from a to b: a bridge when the stream is in between. */
  const route = (fx: number, fz: number, tx: number, tz: number): [number, number] => {
    if (bank(fx, fz) === bank(tx, tz) || !bridges.length) return [tx, tz];
    let best = bridges[0], bd = 1e9;
    for (const b of bridges) {
      const d = Math.hypot(b.x - fx, b.z - fz) + Math.hypot(b.x - tx, b.z - tz);
      if (d < bd) (bd = d), (best = b);
    }
    const s = bank(fx, fz) === bank(best.x + best.ax * best.len, best.z + best.az * best.len) ? -1 : 1;
    return Math.hypot(best.x - fx, best.z - fz) < 3 ? [best.x + best.ax * best.len * 0.7 * s, best.z + best.az * best.len * 0.7 * s] : [best.x, best.z];
  };

  // ---------- things you bump into ----------
  const circles = new Map<number, Spot[]>();
  const things: { x: number; z: number; r: number; kind: string }[] = []; // every solid, for the stuck test
  let reach: Uint8Array | null = null; // drivable grid joined to the pad; rebuilt after anything new is placed
  const solid = (x: number, z: number, r: number, kind = 'thing') => {
    const s = { x, z, r, h: 2 };
    things.push({ x, z, r, kind });
    reach = null;
    for (let cx = Math.floor((x - r) / 8); cx <= Math.floor((x + r) / 8); cx++)
      for (let cz = Math.floor((z - r) / 8); cz <= Math.floor((z + r) / 8); cz++) {
        const k = cx * 1000 + cz;
        if (!circles.has(k)) circles.set(k, []);
        circles.get(k)!.push(s);
      }
    return s;
  };
  const tall: Spot[] = [{ x: BARN.x, z: BARN.z, r: 7, h: 10 }]; // the camera stays out of these
  /** 0 = free, 1 = something solid, 2 = water, 3 = edge of the farm. */
  const blocked = (x: number, z: number, r: number) => {
    if (Math.hypot(x, z) > farm.radius + 6) return 3;
    if (Math.abs(x - BARN.x) < BARN.hw + r && Math.abs(z - BARN.z) < BARN.hd + r) return 1;
    for (let cx = Math.floor((x - r) / 8); cx <= Math.floor((x + r) / 8); cx++)
      for (let cz = Math.floor((z - r) / 8); cz <= Math.floor((z + r) / 8); cz++)
        for (const s of circles.get(cx * 1000 + cz) ?? []) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (s.r + r) ** 2) return 1;
    if (land(x, z) < -0.6 && deckAt(x, z) === null) return 2;
    return 0;
  };
  /** How far a vehicle of radius r at x, z sits inside things (0 = free). A move that lowers it is always allowed. */
  const overlap = (x: number, z: number, r: number) => {
    let d = Math.max(0, Math.hypot(x, z) - farm.radius - 6);
    d = Math.max(d, Math.min(BARN.hw + r - Math.abs(x - BARN.x), BARN.hd + r - Math.abs(z - BARN.z)));
    for (let cx = Math.floor((x - r) / 8); cx <= Math.floor((x + r) / 8); cx++)
      for (let cz = Math.floor((z - r) / 8); cz <= Math.floor((z + r) / 8); cz++)
        for (const s of circles.get(cx * 1000 + cz) ?? []) d = Math.max(d, s.r + r - Math.hypot(s.x - x, s.z - z));
    const h = land(x, z);
    if (h < -0.6 && deckAt(x, z) === null) d = Math.max(d, -0.6 - h + 0.01);
    return d;
  };
  /**
   * One step of driving from x, z toward nx, nz. Takes the whole step if it is free, else slides along one axis.
   * Root-cause fix for getting stuck: the old code tested x and z apart and then took both, so a diagonal step
   * could land inside a rock; from inside, every later step was blocked for good.
   * Returns the new spot and what was hit (0 = nothing, else a `blocked` code).
   */
  const move = (x: number, z: number, nx: number, nz: number, r: number): [number, number, number] => {
    const cur = overlap(x, z, r);
    const ok = (px: number, pz: number) => {
      const o = overlap(px, pz, r);
      return o <= 0 || o < cur - 1e-6;
    };
    if (ok(nx, nz)) return [nx, nz, 0];
    const hit = blocked(nx, nz, r) || 1;
    if (ok(nx, z)) return [nx, z, hit];
    if (ok(x, nz)) return [x, nz, hit];
    return [x, z, hit];
  };
  /**
   * The bump-out spot: nearest place a vehicle of radius r can drive from (free with a margin, and joined to the
   * barn pad by open ground, so never water, a closed-in pocket, or off the farm), facing the most open ground.
   */
  const RG = 0.5, RN = Math.ceil(((farm.radius + 6) * 2) / RG) + 1, RO = -(RN - 1) * RG * 0.5;
  const rescue = (x: number, z: number, r: number, heading: number): [number, number, number] => {
    const at = (i: number) => RO + i * RG;
    if (!reach) {
      // Flood fill from the pad over every grid point the vehicle fits on.
      reach = new Uint8Array(RN * RN); // 0 unseen, 1 reachable, 2 blocked
      const i0 = Math.round((PAD.x - RO) / RG), j0 = Math.round((PAD.z - RO) / RG);
      const q = [j0 * RN + i0];
      reach[q[0]] = 1;
      for (let k = 0; k < q.length; k++) {
        const i = q[k] % RN, j = (q[k] - i) / RN;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj, c = b * RN + a;
          if (a < 0 || b < 0 || a >= RN || b >= RN || reach[c]) continue;
          reach[c] = blocked(at(a), at(b), r) ? 2 : 1;
          if (reach[c] === 1) q.push(c);
        }
      }
    }
    const ci = Math.round((x - RO) / RG), cj = Math.round((z - RO) / RG);
    let best: [number, number] | null = null, bd = Infinity;
    for (let ring = 0; ring < RN && !best; ring++)
      for (let j = cj - ring; j <= cj + ring; j++)
        for (let i = ci - ring; i <= ci + ring; i += Math.abs(j - cj) === ring || ring === 0 ? 1 : ring * 2) {
          if (i < 0 || j < 0 || i >= RN || j >= RN || reach[j * RN + i] !== 1) continue;
          const px = at(i), pz = at(j), d = Math.hypot(px - x, pz - z);
          if (d < bd && !blocked(px, pz, r + 0.5)) (bd = d), (best = [px, pz]);
        }
    const [px, pz] = best ?? [PAD.x, PAD.z - 9];
    // Face the direction with the longest open run; ties go to the old heading.
    let bh = heading, bs = -Infinity;
    for (let k = 0; k < 16; k++) {
      const h = heading + (k * Math.PI) / 8;
      let run = 0;
      while (run < 8 && !blocked(px + Math.sin(h) * (run + 0.5), pz + Math.cos(h) * (run + 0.5), r)) run += 0.5;
      const s = run - Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading))) * 0.05;
      if (s > bs) (bs = s), (bh = h);
    }
    return [px, pz, bh];
  };

  // Roads: pad to every plot, over a bridge when needed.
  const roads: number[][] = [];
  for (const p of farm.plots) {
    const [wx, wz] = route(PAD.x, PAD.z, p.x, p.z);
    roads.push([PAD.x, PAD.z, wx, wz]);
    if (wx !== p.x || wz !== p.z) roads.push([wx, wz, p.x, p.z]);
  }
  const roadDist = (x: number, z: number) => {
    let d = 1e9;
    for (const r of roads) d = Math.min(d, segDist(x, z, r[0], r[1], r[2], r[3]));
    return d;
  };

  // ---------- ground mesh ----------
  const G = farm.radius + 150;
  const seg = low ? 110 : 190;
  const geo = new THREE.PlaneGeometry(G * 2, G * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const gp = geo.getAttribute('position');
  const gc = new Float32Array(gp.count * 3);
  const cA = new THREE.Color(L.grassA), cB = new THREE.Color(L.grassB), cPath = new THREE.Color(L.path), cRock = new THREE.Color(L.rock), cWet = new THREE.Color(L.path).lerp(new THREE.Color(L.water), 0.6), c = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, land(x, z));
    c.copy(cA).lerp(cB, noise(x * 0.08, z * 0.08) * 0.8 + noise(x * 0.4, z * 0.4) * 0.5);
    c.multiplyScalar(0.9 + noise(x * 0.03 + 7, z * 0.03) * 0.22 + (Math.sin((x + z) * 1.1) > 0 ? 0.025 : 0));
    c.lerp(cPath, Math.max((1 - smooth(1.3, 3.2, roadDist(x, z))) * 0.9, 1 - smooth(7, 11, Math.hypot(x - PAD.x, z - PAD.z))));
    c.lerp(cWet, smooth(0.02, 0.5, wet(x, z)));
    c.lerp(cRock, smooth(farm.radius + 20, farm.radius + 60, Math.hypot(x, z)) * 0.8);
    gc.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, M.MAT);
  ground.receiveShadow = true;
  group.add(ground);

  const waterMat = new THREE.MeshToonMaterial({ color: L.water, gradientMap: M.GRAD, emissive: L.water, emissiveIntensity: 0.3, transparent: true, opacity: 0.9 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(G * 2, G * 2), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  group.add(water);

  const _o = new THREE.Object3D();
  const place = (im: THREE.InstancedMesh, i: number, x: number, z: number, rot: number, s: number, y = groundY(x, z)) => {
    _o.position.set(x, y, z);
    _o.rotation.set(0, rot, 0);
    _o.scale.setScalar(s);
    _o.updateMatrix();
    im.setMatrixAt(i, _o.matrix);
  };
  /** `ink` = outline thickness; clutter is only outlined on High. */
  const instanced = (g: THREE.BufferGeometry, mat: THREE.Material, spots: number[][], shadow = true, ink = 0, sway = 0) => {
    const im = new THREE.InstancedMesh(g, mat, spots.length);
    spots.forEach(([x, z, rot, s], i) => place(im, i, x, z, rot, s));
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    if (ink && !low) group.add(M.inkInstanced(im, ink, sway));
    return im;
  };
  const inkHi = (t: number) => (low ? 0 : t);
  for (const b of bridges) {
    const m = M.mesh(M.bridgeGeometry(b.len), M.MAT, true, inkHi(0.05));
    m.position.set(b.x, (b.hA + b.hB) / 2 + 0.12, b.z);
    m.rotation.order = 'YZX';
    m.rotation.y = -Math.atan2(b.az, b.ax);
    m.rotation.z = Math.atan2(b.hB - b.hA, b.len);
    m.receiveShadow = true;
    group.add(m);
    for (const s of [-1, 1]) for (let a = -b.len / 2; a <= b.len / 2; a += 1.2) solid(b.x + b.ax * a + b.az * 2.5 * s, b.z + b.az * a - b.ax * 2.5 * s, 0.35, 'bridge');
  }

  // ---------- plots ----------
  const rocks: number[][] = [], bales: number[][] = [], fencesAt: number[][] = [], plotTrees: number[][] = [];
  const cropGeo = new Map<D.CropKind, THREE.BufferGeometry>();
  const soilPos: number[] = [], soilCol: number[] = [];
  const sA = new THREE.Color(L.soilA), sB = new THREE.Color(L.soilB);
  const plots: PlotState[] = farm.plots.map((def, pi) => {
    const cols = Math.floor(def.w / SP), rows = Math.floor(def.d / SP);
    const x0 = def.x - ((cols - 1) / 2) * SP, z0 = def.z - ((rows - 1) / 2) * SP;
    // Things in the way, placed the same every time.
    const obs: number[][] = []; // x, z, clear radius
    const rnd = (k: number) => hash(farmIdx * 977 + pi * 131 + k);
    const scatterIn = (count: number, list: number[][], clear: number, r: number, k0: number, kind: string) => {
      for (let i = 0, tries = 0; i < count && tries < 200; tries++) {
        const col = Math.floor(rnd(k0 + tries * 2) * cols), row = Math.floor(rnd(k0 + tries * 2 + 1) * rows);
        const x = x0 + col * SP, z = z0 + row * SP;
        if (!inShape(def, col, row, cols, rows) || wet(x, z) > 0.05 || obs.some((o) => Math.hypot(o[0] - x, o[1] - z) < o[2] + clear + 2.6)) continue;
        obs.push([x, z, clear]);
        list.push([x, z, rnd(k0 + tries) * 6.28, 0.85 + rnd(k0 - tries) * 0.5]);
        solid(x, z, r, kind);
        i++;
      }
    };
    scatterIn(def.rocks, rocks, 1.3, 1.1, 10, 'rock');
    scatterIn(def.bales, bales, 1.2, 1.0, 500, 'bale');
    scatterIn(def.trees, plotTrees, 1.5, 0.7, 900, 'tree');
    const fenceRows: number[] = [];
    for (let f = 0; f < def.fences; f++) {
      const row = Math.round(((f + 1) / (def.fences + 1)) * rows), gate = 3 + Math.floor(rnd(70 + f) * (cols - 8));
      fenceRows.push(row);
      for (let col = 0; col < cols; col += 1) {
        if (col >= gate && col < gate + 4) continue; // the gate
        if (!inShape(def, col, Math.min(rows - 1, row), cols, rows)) continue;
        const x = x0 + col * SP, z = z0 + row * SP - SP / 2;
        solid(x, z, 0.5, 'fence');
        if (col % 2 === 0 && !(col + 1 >= gate && col + 1 < gate + 4)) fencesAt.push([x + SP / 2, z, 0, SP]);
      }
    }
    const cell = new Int32Array(cols * rows).fill(-1);
    const P: number[] = [], K: number[] = [];
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        if (!inShape(def, col, row, cols, rows)) continue;
        const gx = x0 + col * SP, gz = z0 + row * SP;
        if (wet(gx, gz) > 0.02) continue;
        // soil under every cell of the plot, in two tones by row
        const sc = row % 2 ? sA : sB;
        const h = SP / 2 + 0.02;
        const q = [[-h, -h], [-h, h], [h, -h], [h, -h], [-h, h], [h, h]];
        for (const [ox, oz] of q) {
          soilPos.push(gx + ox, land(gx + ox, gz + oz) + 0.06, gz + oz);
          soilCol.push(sc.r, sc.g, sc.b);
        }
        if (fenceRows.includes(row) || fenceRows.includes(row + 1) || obs.some((o) => Math.hypot(o[0] - gx, o[1] - gz) < o[2])) continue;
        const k = farmIdx * 100000 + pi * 10000 + row * cols + col;
        const x = gx + (hash(k) - 0.5) * 0.3, z = gz + (hash(k + 0.5) - 0.5) * 0.25;
        cell[row * cols + col] = K.length;
        K.push(cropAt(def, col, row, cols, rows));
        P.push(x, land(x, z) + 0.06, z, hash(k + 0.25) * Math.PI * 2, 0.85 + hash(k + 0.75) * 0.3);
      }
    const n = K.length;
    const kind = Uint8Array.from(K);
    const slot = new Uint32Array(n);
    const counts = def.crops.map(() => 0);
    for (let i = 0; i < n; i++) slot[i] = counts[kind[i]]++;
    const meshes = def.crops.map((ck, ki) => {
      if (!cropGeo.has(ck)) cropGeo.set(ck, M.cropGeometry(ck));
      const im = new THREE.InstancedMesh(cropGeo.get(ck)!, M.CROP_MAT, Math.max(1, counts[ki]));
      im.count = counts[ki];
      im.receiveShadow = true;
      group.add(im);
      return im;
    });
    // "For sale" sign on the side facing the barn.
    const dl = Math.hypot(def.x, def.z), sx = def.x - (def.x / dl) * (Math.min(def.w, def.d) / 2 + 2.5), sz = def.z - (def.z / dl) * (Math.min(def.w, def.d) / 2 + 2.5);
    const sign = M.mesh(M.signGeometry(), M.MAT, true, inkHi(0.04));
    sign.position.set(sx, groundY(sx, sz), sz);
    sign.rotation.y = Math.atan2(-def.x, -def.z);
    sign.scale.setScalar(1.3);
    group.add(sign);
    let value = 0;
    for (let i = 0; i < n; i++) value += D.CROPS[def.crops[kind[i]]].value;
    return { def, cols, rows, x0, z0, cell, n, pos: Float32Array.from(P), kind, alive: new Uint8Array(n).fill(1), hp: new Float32Array(n).fill(1), aliveCount: n, slot, meshes, sign, grow: 1, value };
  });
  const soilGeo = new THREE.BufferGeometry();
  soilGeo.setAttribute('position', new THREE.Float32BufferAttribute(soilPos, 3));
  soilGeo.setAttribute('color', new THREE.Float32BufferAttribute(soilCol, 3));
  soilGeo.computeVertexNormals();
  const soil = new THREE.Mesh(soilGeo, M.MAT);
  soil.receiveShadow = true;
  group.add(soil);

  function setCrop(p: PlotState, i: number, s: number, lean = 0) {
    const a = p.pos, o = i * 5;
    _o.position.set(a[o], a[o + 1], a[o + 2]);
    _o.rotation.set(lean, a[o + 3], 0);
    _o.scale.setScalar(a[o + 4] * s);
    _o.updateMatrix();
    const im = p.meshes[p.kind[i]];
    im.setMatrixAt(p.slot[i], _o.matrix);
    im.instanceMatrix.needsUpdate = true;
  }
  function drawPlot(p: PlotState) {
    const g = p.grow < 1 ? 1 - Math.pow(1 - p.grow, 3) : 1;
    for (let i = 0; i < p.n; i++) setCrop(p, i, p.alive[i] ? g : 0);
    for (const m of p.meshes) m.computeBoundingSphere();
  }
  plots.forEach(drawPlot);

  // ---------- barnyard ----------
  const barn = M.mesh(M.barnGeometry(farm.barn), M.MAT, true, 0.1);
  barn.position.set(BARN.x, 0, BARN.z);
  barn.receiveShadow = true;
  group.add(barn);
  const pad = M.mesh(M.padGeometry(PAD.r), M.MAT, false);
  pad.position.set(PAD.x, 0.02, PAD.z);
  pad.receiveShadow = true;
  group.add(pad);
  const coin = M.mesh(M.coinGeometry(), M.MAT, true, 0.05);
  group.add(coin);

  const built = new Map<D.BuildId, { obj: THREE.Object3D; lv: number; spot: Spot }>();
  let blades: THREE.Mesh | null = null;
  function setBuild(id: D.BuildId, lv: number) {
    const cur = built.get(id);
    if (cur?.lv === lv || lv <= 0) return;
    if (cur) {
      group.remove(cur.obj);
      cur.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const [x, z, rot] = SITE[id];
    const obj = new THREE.Group();
    if (id === 'windmill') {
      const [tower, bl, hubY] = M.windmillGeometry(lv);
      obj.add(M.mesh(tower, M.MAT, true, inkHi(0.07)));
      blades = M.mesh(bl, M.MAT, true, inkHi(0.05));
      blades.position.set(0, hubY, -1.9);
      obj.add(blades);
    } else obj.add(M.mesh(M.buildingGeometry(id, lv), M.MAT, true, inkHi(id === 'pen' ? 0.035 : 0.07)));
    obj.position.set(x, groundY(x, z), z);
    obj.rotation.y = rot;
    group.add(obj);
    const spot = cur?.spot ?? (id === 'pen' ? { x, z, r: 0, h: 0 } : solid(x, z, id === 'market' ? 2.3 : id === 'greenhouse' ? 3 : 2, 'building'));
    if (id === 'pen' && !cur) for (let a = 0; a < 6.28; a += 0.22) solid(x + Math.sin(a) * 4.4, z + Math.cos(a) * 4.4, 0.6, 'pen');
    if (!cur && (id === 'silo' || id === 'windmill')) tall.push({ x, z, r: 3, h: 9 });
    built.set(id, { obj, lv, spot });
  }
  const decor: THREE.Mesh[] = [];
  function setDecor(count: number) {
    while (decor.length < count && decor.length < DECOR_SPOTS.length) {
      const [x, z] = DECOR_SPOTS[decor.length];
      const m = M.mesh(M.decorGeometry(farm.decor[decor.length]), M.MAT, true, inkHi(0.035));
      m.position.set(x, groundY(x, z), z);
      m.rotation.y = Math.atan2(-x, -z);
      m.scale.setScalar(1.15);
      group.add(m);
      solid(x, z, 1.1, 'decor');
      decor.push(m);
    }
  }
  const animals: { m: THREE.Mesh; a: number; r: number }[] = [];
  let animalGeo: THREE.BufferGeometry | null = null;
  /** `growth` is 0..1 per animal: babies are small. */
  function setAnimals(growth: number[]) {
    while (animals.length < growth.length) {
      const m = M.mesh((animalGeo ??= M.animalGeometry(farm.animal)), M.MAT, true, 0.022);
      group.add(m);
      animals.push({ m, a: animals.length * 1.9, r: 1.2 + (animals.length % 3) * 0.9 });
    }
    animals.forEach((an, i) => an.m.scale.setScalar(0.55 + 0.75 * Math.min(1, growth[i])));
  }

  // ---------- trees, rocks, tufts ----------
  const free = (x: number, z: number, margin: number) => {
    if (Math.hypot(x, z - 6) < 27 || wet(x, z) > 0 || roadDist(x, z) < 4) return false;
    for (const p of farm.plots) if (Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin) return false;
    for (const b of bridges) if (Math.hypot(x - b.x, z - b.z) < b.len) return false;
    return true;
  };
  const byKind = new Map<D.TreeKind, number[][]>();
  const nTrees = low ? 70 : 150;
  for (let i = 0, made = 0; made < nTrees && i < nTrees * 20; i++) {
    const a = hash(i * 3 + farmIdx * 50) * 6.283, r = 24 + Math.sqrt(hash(i * 3 + 1 + farmIdx * 50)) * (farm.radius + 30);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!free(x, z, 3.5)) continue;
    const k = farm.trees[Math.floor(hash(i * 7 + 2) * farm.trees.length)];
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push([x, z, hash(i) * 6.28, 0.8 + hash(i * 5) * 0.7]);
    if (r < farm.radius + 6) solid(x, z, 0.6, 'tree');
    made++;
  }
  if (plotTrees.length) byKind.set(farm.trees[0], [...(byKind.get(farm.trees[0]) ?? []), ...plotTrees]);
  for (const [k, spots] of byKind) instanced(M.treeGeometry(k), M.TREE_MAT, spots, true, 0.07, 0.004);
  for (let i = 0; i < 26; i++) {
    const x = (hash(i + 4000 + farmIdx) - 0.5) * farm.radius * 2, z = (hash(i + 4100 + farmIdx) - 0.5) * farm.radius * 2;
    if (free(x, z, 3) && Math.hypot(x, z) < farm.radius) {
      rocks.push([x, z, hash(i) * 6.28, 0.7 + hash(i + 9) * 0.9]);
      solid(x, z, 1.0, 'rock');
    }
  }
  instanced(M.rockGeometry(), M.MAT, rocks, true, 0.05);
  if (bales.length) instanced(M.baleGeometry(), M.MAT, bales, true, 0.045);
  if (fencesAt.length) instanced(M.fenceGeometry(), M.MAT, fencesAt.map(([x, z, rot]) => [x, z, rot, SP]), true, 0.03);
  if (!low) {
    // Grass tufts and wild flowers that sway.
    const tufts: number[][] = [];
    for (let i = 0; tufts.length < 1500 && i < 9000; i++) {
      const x = (hash(i + 9000) - 0.5) * farm.radius * 2.2, z = (hash(i + 9500) - 0.5) * farm.radius * 2.2;
      if (wet(x, z) === 0 && roadDist(x, z) > 2.5 && Math.hypot(x, z) > 9 && !farm.plots.some((p) => Math.abs(x - p.x) < p.w / 2 + 1 && Math.abs(z - p.z) < p.d / 2 + 1)) tufts.push([x, z, hash(i) * 6.28, 0.6 + hash(i + 3) * 0.8]);
    }
    const tc = new THREE.Color(L.grassB).multiplyScalar(0.82).getHex();
    const tuft = (flower: number | null) => {
      const P = [0, 1, 2, 3].map((i) => {
        const g = new THREE.ConeGeometry(0.07, 0.8, 3).toNonIndexed();
        g.translate(0, 0.4, 0);
        g.rotateZ((i - 1.5) * 0.35);
        g.rotateY(i * 1.7);
        return g;
      });
      if (flower !== null) P.push(new THREE.IcosahedronGeometry(0.11, 0).translate(0.05, 0.85, 0));
      const merged = P.map((x, i) => {
        x.deleteAttribute('uv');
        const col = new Float32Array(x.getAttribute('position').count * 3);
        c.set(i === 4 ? flower! : tc);
        for (let v = 0; v < col.length; v += 3) col.set([c.r, c.g, c.b], v);
        x.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return x;
      });
      return merged;
    };
    const flowerCols = [0xffffff, 0xffe066, 0xff8fb8, 0xb58cf0];
    [null, ...flowerCols.slice(0, 2 + (farmIdx % 3))].forEach((fc, gi, all) => {
      instanced(mergeAll(tuft(fc)), M.CROP_MAT, tufts.filter((_, i) => Math.max(0, (i % (all.length + 2)) - 2) === gi), false);
    });
  }

  // ---------- sky ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(L.skyTop) }, low: { value: new THREE.Color(L.skyLow) }, sunDir: { value: SUN.clone().normalize() }, sunCol: { value: new THREE.Color(L.sun) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y * 1.5 + 0.06, 0.0, 1.0);
          vec3 col = mix(low, top, pow(h, 0.55));
          col = mix(col, top * 0.5, smoothstep(0.3, 1.0, d.y));
          col += vec3(1.0, 0.55, 0.25) * pow(1.0 - abs(d.y), 9.0) * 0.16;
          float s = max(dot(d, sunDir), 0.0);
          vec3 rt = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0))); vec3 r = d - sunDir * s;
          float spokes = 0.55 + 0.45 * sin(atan(dot(r, rt), dot(r, cross(rt, sunDir))) * 16.0);
          col += sunCol * vec3(1.0, 0.74, 0.5) * pow(s, 5.0) * 0.4;
          col += sunCol * (smoothstep(0.9982, 0.999, s) * 2.2 + pow(s, 70.0) * spokes * 0.7);
          gl_FragColor = vec4(col, 1.0); }`,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  const far = new THREE.Color(L.rock).lerp(new THREE.Color(L.skyTop).lerp(new THREE.Color(L.skyLow), 0.5), 0.5).getHex();
  group.add(new THREE.Mesh(M.mountainRing(22, farm.radius + 210, 62, L.rock, L.snowLine, farmIdx * 13 + 1), M.MAT));
  group.add(new THREE.Mesh(M.mountainRing(16, farm.radius + 330, 120, far, L.snowLine + 0.08, farmIdx * 29 + 5), M.MAT));
  const nClouds = low ? 8 : 16;
  const clouds = new THREE.InstancedMesh(M.cloudGeometry(), M.toon({ emissive: new THREE.Color(L.skyLow).lerp(new THREE.Color(0x8a78b8), 0.5), emissiveIntensity: 0.55, fog: false }), nClouds);
  const cloudAt = Array.from({ length: nClouds }, (_, i) => [(hash(i + 300) - 0.5) * 900, 60 + hash(i + 310) * 60, (0.5 + hash(i + 320) * 0.5) * (i % 2 ? 420 : -420), 7 + hash(i + 330) * 9]);
  clouds.frustumCulled = false;
  group.add(clouds);

  function update(t: number) {
    coin.rotation.y = t * 2;
    coin.position.set(PAD.x, 2.4 + Math.sin(t * 2) * 0.25, PAD.z);
    if (blades) blades.rotation.z = t * 0.9;
    waterMat.opacity = 0.8 + Math.sin(t * 1.3) * 0.04;
    water.position.y = WATER_Y + Math.sin(t * 0.8) * 0.04;
    cloudAt.forEach(([x, y, z, s], i) => {
      _o.position.set(((x + t * 2.2 + 450) % 900) - 450, y, z);
      _o.rotation.set(0, i, 0);
      _o.scale.set(s * 1.3, s, s);
      _o.updateMatrix();
      clouds.setMatrixAt(i, _o.matrix);
    });
    clouds.instanceMatrix.needsUpdate = true;
    const [px, pz] = SITE.pen;
    animals.forEach((an, i) => {
      const a = an.a + Math.sin(t * 0.25 + i * 1.7) * 2.2, x = px + Math.sin(a) * an.r, z = pz + Math.cos(a) * an.r;
      an.m.position.set(x, groundY(x, z) + Math.abs(Math.sin(t * 5 + i)) * 0.12, z);
      an.m.rotation.y = a + (Math.cos(t * 0.25 + i * 1.7) > 0 ? Math.PI / 2 : -Math.PI / 2);
    });
  }
  function dispose() {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      if (m.material && !M.SHARED.has(m.material as THREE.Material)) (m.material as THREE.Material).dispose();
    });
  }
  return { group, farm, plots, groundY, blocked, overlap, move, rescue, things, route, setCrop, drawPlot, setBuild, setDecor, setAnimals, update, dispose, tall, sky, water };
}
export type World = ReturnType<typeof buildWorld>;

function mergeAll(parts: THREE.BufferGeometry[]) {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    p.computeVertexNormals();
    pos.set(p.getAttribute('position').array, o);
    col.set(p.getAttribute('color').array, o);
    nor.set(p.getAttribute('normal').array, o);
    o += p.getAttribute('position').count * 3;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}
