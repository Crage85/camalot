// The mage realm: Spellpaw Citadel in the middle and one floating themed island per world around it.
// Stars buy decorations; rescued cats live here and wander between the islands she has opened.
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, HemisphereLight,
  IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, OctahedronGeometry, PerspectiveCamera,
  PlaneGeometry, Quaternion, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3, type BufferGeometry,
} from 'three';
import { facet, hull, inkMaterial, merge, part, toon, type V3 } from './art';
import { CATS, catGeometry, type CatDef } from './cats';
import { centerIn, reducedMotion, type Rect } from './util';

export interface CastleItem { id: string; name: string; cost: number; designs: string[]; at: V3; area: number }

export const AREAS: { id: string; name: string }[] = [
  { id: 'castle', name: 'Spellpaw Citadel' }, { id: 'frost', name: 'Frostspire' }, { id: 'garden', name: 'Wyrmwood' },
  { id: 'shore', name: 'Tidebreak Coast' }, { id: 'peak', name: 'Rimepeak' }, { id: 'roost', name: 'Ember Roost' },
  { id: 'canyon', name: 'Runestone Canyon' }, { id: 'ballroom', name: 'Astral Hall' }, { id: 'cup', name: 'Arcane Arena' },
  { id: 'cloud', name: 'Skyhold' }, { id: 'aurora', name: 'Aurora Lake' }, { id: 'summit', name: 'Crown Summit' },
];

// ---------- layout ----------

const RING = 19; // distance of the outer islands from the castle
const R = 4.4; // outer island radius
const R0 = 7.4; // castle island radius
const WATER = -7; // the twilight sea far below the floating islands
const RIM = -0.62; // height of the rune rings round each island
const areaAngle = (k: number) => (k === 0 ? 0 : ((k - 1) / 11) * Math.PI * 2 + 0.29);
const areaX = (k: number) => (k === 0 ? 0 : Math.sin(areaAngle(k)) * RING);
const areaZ = (k: number) => (k === 0 ? 0 : Math.cos(areaAngle(k)) * RING);
/** Island-local point to world. Local +z points away from the castle. */
function toWorld(k: number, p: V3): V3 {
  const a = areaAngle(k), c = Math.cos(a), s = Math.sin(a);
  return [areaX(k) + p[0] * c + p[2] * s, p[1], areaZ(k) - p[0] * s + p[2] * c];
}

const SLOTS: V3[] = [[-2.0, 0, 1.3], [2.0, 0, 1.3], [-1.7, 0, -1.6], [1.7, 0, -1.6]];
const NEW_ITEMS: [string, string, string[]][][] = [
  [],
  [['a1_rink', 'Ice rink', ['Round rink', 'Twin rink', 'Star rink']], ['a1_snowcat', 'Snow guardian', ['Scarf guardian', 'Top hat guardian', 'Ribbon guardian']],
    ['a1_igloo', 'Igloo', ['Snow igloo', 'Ice block igloo', 'Starry igloo']], ['a1_spire', 'Ice spire', ['Azure spire', 'Rose spire', 'Jade spire']]],
  [['a2_pond', 'Lily pond', ['Rose lilies', 'White lilies', 'Gold lilies']], ['a2_nest', 'Dragon nest', ['Twig nest', 'Mossy nest', 'Golden nest']],
    ['a2_topiary', 'Topiary', ['Cat topiary', 'Dragon topiary', 'Heart topiary']], ['a2_gate', 'Vine gate', ['Rose gate', 'Ivy gate', 'Wisteria gate']]],
  [['a3_sand', 'Sand castle', ['Tower sand castle', 'Shell sand castle', 'Flag sand castle']], ['a3_boards', 'Surfboards', ['Sunset boards', 'Ocean boards', 'Neon boards']],
    ['a3_hut', 'Beach hut', ['Coral hut', 'Teal hut', 'Amber hut']], ['a3_palm', 'Palm tree', ['Coconut palm', 'Hammock palm', 'Lantern palm']]],
  [['a4_sled', 'Sled hill', ['Wooden sleds', 'Snow tubes', 'Ski rack']], ['a4_pines', 'Snowy pines', ['Frosted pines', 'Lantern pines', 'Blue spruce']],
    ['a4_lodge', 'Lodge', ['Log lodge', 'Stone lodge', 'Festival lodge']], ['a4_lift', 'Ski lift', ['Red lift', 'Blue lift', 'Yellow lift']]],
  [['a5_eggs', 'Egg nest', ['Ruby eggs', 'Jade eggs', 'Speckled eggs']], ['a5_brazier', 'Braziers', ['Flame bowls', 'Blue flames', 'Green flames']],
    ['a5_volcano', 'Volcano', ['Lava volcano', 'Violet volcano', 'Golden volcano']], ['a5_perch', 'Dragon perch', ['Red hatchling', 'Blue hatchling', 'Violet hatchling']]],
  [['a6_cart', 'Mine cart', ['Gold cart', 'Gem cart', 'Crystal cart']], ['a6_cactus', 'Cactus garden', ['Tall cactus', 'Paddle cactus', 'Flower cactus']],
    ['a6_shaft', 'Mine entrance', ['Timber entrance', 'Lantern entrance', 'Gem entrance']], ['a6_arch', 'Mesa arch', ['Red rock arch', 'Sandstone arch', 'Painted arch']]],
  [['a7_floor', 'Dance floor', ['Checker floor', 'Prism floor', 'Starlight floor']], ['a7_speakers', 'Speakers', ['Rose speakers', 'Azure speakers', 'Gold speakers']],
    ['a7_stage', 'Stage', ['Velvet stage', 'Silk stage', 'Star stage']], ['a7_ball', 'Mirror ball', ['Silver ball', 'Gold ball', 'Rose ball']]],
  [['a8_trophy', 'Trophy', ['Gold cup', 'Silver cup', 'Star cup']], ['a8_goal', 'Arena goal', ['White goal', 'Gold goal', 'Prism goal']],
    ['a8_stands', 'Stands', ['Blue stands', 'Red stands', 'Green stands']], ['a8_board', 'Scoreboard', ['Classic board', 'Neon board', 'Paw board']]],
  [['a9_swing', 'Cloud swing', ['Rose swing', 'Sky swing', 'Gold swing']], ['a9_bridge', 'Prism bridge', ['Prism bridge', 'Dawn bridge', 'Sunset bridge']],
    ['a9_palace', 'Sky palace', ['Azure palace', 'Rose palace', 'Sun palace']], ['a9_balloon', 'Sky balloon', ['Crimson balloon', 'Ocean balloon', 'Sunrise balloon']]],
  [['a10_boat', 'Row boat', ['Red boat', 'Teal boat', 'Sail boat']], ['a10_lanterns', 'Lantern string', ['Gold lanterns', 'Aqua lanterns', 'Rose lanterns']],
    ['a10_cabin', 'Lake cabin', ['Pine cabin', 'Berry cabin', 'Sky cabin']], ['a10_dock', 'Lake dock', ['Lantern dock', 'Fishing dock', 'Bench dock']]],
  [['a11_statue', 'Founder statue', ['Gold statue', 'Marble statue', 'Crystal statue']], ['a11_throne', 'Throne', ['Royal throne', 'Ruby throne', 'Sapphire throne']],
    ['a11_gate', 'Royal gate', ['Violet gate', 'Rose gate', 'Sky gate']], ['a11_beacon', 'Summit beacon', ['Gold beacon', 'Star beacon', 'Rose beacon']]],
];

export const ITEMS: CastleItem[] = [
  { id: 'rug', name: 'Sigil carpet', cost: 2, designs: ['Crimson sigil', 'Azure sigil', 'Koi sigil'], at: [0, 0, 0.9], area: 0 },
  { id: 'bed', name: 'Rest nook', cost: 3, designs: ['Ring cushion', 'Woven basket', 'Canopy bed'], at: [-3.3, 0, 1.3], area: 0 },
  { id: 'garden', name: 'Garden', cost: 4, designs: ['Rose garden', 'Catnip patch', 'Moon flowers'], at: [3.4, 0, 1.2], area: 0 },
  { id: 'fountain', name: 'Fountain', cost: 5, designs: ['Koi fountain', 'Star fountain', 'Shell fountain'], at: [0, 0, 3.3], area: 0 },
  { id: 'banner', name: 'Banner', cost: 5, designs: ['Paw crest', 'Moon crest', 'Heart crest'], at: [0, 2.75, -0.24], area: 0 },
  { id: 'tower', name: 'Tower', cost: 6, designs: ['Mage tower', 'Frost tower', 'Rose tower'], at: [3.9, 0, -2.4], area: 0 },
  { id: 'lamps', name: 'Lamps', cost: 6, designs: ['Star lamps', 'Koi lamps', 'Moon lamps'], at: [0, 0, 2.0], area: 0 },
  { id: 'cattree', name: 'Watch perch', cost: 7, designs: ['Oak perch', 'Cloud perch', 'Rose perch'], at: [-3.9, 0, -2.0], area: 0 },
  { id: 'dragon', name: 'Dragon', cost: 8, designs: ['Ruby dragon', 'Jade dragon', 'Gold dragon'], at: [-2.6, 0, 4.0], area: 0 },
  { id: 'arch', name: 'Arch', cost: 9, designs: ['Prism arch', 'Stone arch', 'Crystal arch'], at: [3.0, 0, 4.0], area: 0 },
  ...NEW_ITEMS.flatMap((list, a) => list.map(([id, name, designs], k): CastleItem => ({ id, name, designs, cost: a + 4 + k, at: toWorld(a, SLOTS[k]), area: a }))),
];

// ---------- geometry helpers ----------

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, s = 14) => new CylinderGeometry(rt, rb, h, s);
const sph = (r: number, ws = 14, hs = 10) => new SphereGeometry(r, ws, hs);
const dome = (r: number, ws = 16) => new SphereGeometry(r, ws, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const cone = (r: number, h: number, s = 12) => new ConeGeometry(r, h, s);
const torus = (r: number, t: number, arc = Math.PI * 2, seg = 20) => new TorusGeometry(r, t, 6, seg, arc);
const gem = (r: number) => new OctahedronGeometry(r);
const _a = new Color(), _b = new Color();
const mix = (a: number, b: number, t: number) => _a.set(a).lerp(_b.set(b), Math.max(0, Math.min(1, t))).getHex();
/** Vertical gradient over the part's own height. */
const grad = (lo: number, hi: number, y0: number, y1: number) => (y: number) => mix(lo, hi, (y - y0) / (y1 - y0));
const RAINBOW = [0xe0264e, 0xf06a14, 0xffd21a, 0x1fae5a, 0x1f7fe8, 0x8a4be8]; // the six gem colours
const GOLD = 0xffd23f, WHITE = 0xffffff, WOOD = 0xb07a45, DARKWOOD = 0x7a4f2c, STONE = 0xcfc6e6, GLOW = 0xfff0a8;
type Col = number | ((y: number, x: number) => number);
type Add = (g: BufferGeometry, color: Col, p?: V3, r?: V3, s?: number | V3) => void;
const _h = { h: 0, s: 0, l: 0 };
/** The realm's colour grade: pastels come down to rich mid tones, every hue gains saturation. */
function tone(c: number): number {
  _a.set(c).getHSL(_h);
  const l = _h.l > 0.3 ? 0.3 + (_h.l - 0.3) * 0.5 : _h.l * 0.88; // lightness is linear here, so 0.3 is already a bright mid tone
  return _a.setHSL(_h.h, Math.min(1, _h.s * (_h.l > 0.55 ? 0.8 : 1.15)), l).getHex();
}
const toned = (c: Col): Col => (typeof c === 'number' ? tone(c) : (y, x) => tone(c(y, x)));
const RUNE = 0x7af0ff, ROOF = 0x2438c0, MOON = 0xe8e2ff, SHADE = 0x4a3f96;
/** Slender mage spire from y0: shaft, flared gallery with a gold band, tall roof, finial, lit slit windows facing +z. */
function spire(A: Add, x: number, z: number, r: number, h: number, roofH: number, roof = ROOF, y0 = 0): void {
  A(cyl(r * 0.82, r, h, 12), grad(SHADE, MOON, -h / 2, h / 2), [x, y0 + h / 2, z]);
  A(cyl(r * 1.28, r * 0.84, r * 0.5, 12), MOON, [x, y0 + h, z]);
  A(cyl(r * 1.32, r * 1.32, 0.09, 12), GOLD, [x, y0 + h + r * 0.28, z]);
  A(cone(r * 1.2, roofH, 12), grad(mix(roof, 0x05041a, 0.5), mix(roof, 0x8fd0ff, 0.3), -roofH / 2, roofH / 2), [x, y0 + h + r * 0.3 + roofH / 2, z]);
  A(gem(r * 0.24), GOLD, [x, y0 + h + r * 0.3 + roofH + r * 0.2, z], [0, 0, 0], [1, 2.2, 1]);
  for (let i = 1; i * 1.5 < h; i++) A(box(r * 0.3, r * 0.8, 0.12), GLOW, [x, y0 + i * 1.5, z + r * 0.93]);
}
/** A drifting shard of rock with a crystal under it. */
function shard(A: Add, p: V3, s: number, crystal: number): void {
  A(facet(new IcosahedronGeometry(0.7 * s, 0)), grad(0x1a1238, 0x6a5a9a, -0.6 * s, 0.6 * s), p, [0.3, p[0], 0.2], [1.2, 0.75, 1]);
  A(cone(0.2 * s, 0.9 * s, 5), grad(mix(crystal, 0xffffff, 0.5), crystal, -0.45 * s, 0.45 * s), [p[0], p[1] - 0.75 * s, p[2]], [Math.PI, 0, 0]);
}

function pine(A: Add, x: number, z: number, s: number, leaf: number, snow: boolean): void {
  A(cyl(0.1 * s, 0.14 * s, 0.5 * s, 6), DARKWOOD, [x, 0.25 * s, z]);
  for (let k = 0; k < 3; k++) {
    A(cone((0.62 - k * 0.14) * s, 0.8 * s, 9), grad(leaf, snow ? WHITE : mix(leaf, 0xffffff, 0.25), -0.1 * s, 0.4 * s), [x, (0.8 + k * 0.5) * s, z]);
  }
}
function tree(A: Add, x: number, z: number, s: number, leaf = 0x58b85a): void {
  A(cyl(0.12 * s, 0.18 * s, 0.9 * s, 7), DARKWOOD, [x, 0.45 * s, z]);
  const crown = (r: number) => facet(new IcosahedronGeometry(r * s, 1)), lf = mix(leaf, 0x0f6a6a, 0.45);
  A(crown(0.8), grad(mix(lf, 0x0a1a4a, 0.55), mix(lf, 0xb8ffc0, 0.25), -0.7 * s, 0.7 * s), [x, 1.5 * s, z], [0, x, 0], [1, 1.25, 1]);
  A(crown(0.5), grad(mix(lf, 0x0a1a4a, 0.4), mix(lf, 0xb8ffc0, 0.35), -0.5 * s, 0.5 * s), [x + 0.5 * s, 1.0 * s, z + 0.2 * s]);
}
function puffs(A: Add, x: number, y: number, z: number, s: number, col = WHITE): void {
  const c = grad(mix(col, 0x3a2f8a, 0.6), col, -0.8 * s, 0.4 * s);
  A(sph(0.8 * s), c, [x, y, z]);
  A(sph(0.6 * s), c, [x + 0.8 * s, y - 0.12 * s, z + 0.1 * s]);
  A(sph(0.55 * s), c, [x - 0.75 * s, y - 0.15 * s, z - 0.1 * s]);
  A(sph(0.5 * s), c, [x + 0.1 * s, y + 0.1 * s, z + 0.5 * s]);
}
function rock(A: Add, x: number, z: number, s: number, col: number): void {
  A(new IcosahedronGeometry(0.5 * s, 0), grad(mix(col, 0x000000, 0.3), mix(col, 0xffffff, 0.2), -0.4 * s, 0.4 * s), [x, 0.25 * s, z], [0.3, x, 0.2], [1.2, 0.9, 1]);
}
function flower(A: Add, x: number, z: number, petal: number, h = 0.4): void {
  A(cyl(0.025, 0.03, h, 5), 0x3c9a3c, [x, h / 2, z]);
  for (let k = 0; k < 5; k++) A(sph(0.07, 6, 4), petal, [x + Math.cos(k * 1.257) * 0.09, h, z + Math.sin(k * 1.257) * 0.09], [0, 0, 0], [1, 0.5, 1]);
  A(sph(0.06, 6, 4), 0xfff36b, [x, h + 0.03, z]);
}
function smallCat(A: Add, color: number, p: V3, ry = 0, s = 1): void {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const at = (dx: number, dy: number, dz: number): V3 => [p[0] + (dx * c + dz * sn) * s, p[1] + dy * s, p[2] + (-dx * sn + dz * c) * s];
  A(sph(0.3 * s), color, at(0, 0.3, 0), [0, ry, 0], [0.95, 1, 1.1]);
  A(sph(0.27 * s), color, at(0, 0.72, 0.1), [0, ry, 0], [1.08, 0.95, 0.95]);
  A(cone(0.1 * s, 0.18 * s, 6), color, at(-0.16, 0.96, 0.08), [0, ry, 0.35]);
  A(cone(0.1 * s, 0.18 * s, 6), color, at(0.16, 0.96, 0.08), [0, ry, -0.35]);
  A(sph(0.05 * s, 8, 6), 0x1e1e2c, at(-0.1, 0.74, 0.34));
  A(sph(0.05 * s, 8, 6), 0x1e1e2c, at(0.1, 0.74, 0.34));
  A(sph(0.025 * s, 6, 4), 0xff7fa0, at(0, 0.67, 0.36));
  A(torus(0.2 * s, 0.05 * s, Math.PI, 10), color, at(0.2, 0.22, -0.25), [Math.PI / 2 - 0.6, ry, 0]);
}

// ---------- decorations ----------

/** Geometry for one item design, around the item's own origin, facing +z. */
function itemGeometry(id: string, d: number): BufferGeometry {
  const P: BufferGeometry[] = [];
  const A: Add = (g, color, p = [0, 0, 0], r = [0, 0, 0], s = 1) => { P.push(part(g, toned(color), p, r, s)); };
  const pick = <T,>(...v: T[]): T => v[d];
  switch (id) {
    // ---- Whisker Castle ----
    case 'rug':
      if (d === 0) { A(box(2.0, 0.06, 1.3), 0xff8fb8); A(box(1.7, 0.07, 1.0), 0xffd0e0); A(box(0.4, 0.08, 0.4), GOLD, [0, 0, 0], [0, 0.78, 0]); }
      if (d === 1) { A(cyl(0.95, 0.95, 0.06, 24), 0x7fc8ff); A(cyl(0.7, 0.7, 0.07, 24), 0xd5efff); A(cyl(0.3, 0.3, 0.08, 16), 0x3fa2ff); }
      if (d === 2) { A(sph(0.8), 0xffa64d, [0.2, 0, 0], [0, 0, 0], [1.2, 0.05, 0.7]); A(cone(0.5, 0.6, 4), 0xff8a2e, [-0.95, 0.03, 0], [0, 0, Math.PI / 2], [1, 1, 0.1]); A(sph(0.1, 6, 4), 0x222233, [0.8, 0.06, 0.15]); }
      break;
    case 'bed':
      if (d === 0) { A(torus(0.6, 0.25), grad(0xe84f78, 0xff9fb8, -0.25, 0.25), [0, 0.25, 0], [Math.PI / 2, 0, 0]); A(cyl(0.55, 0.55, 0.15), 0xffd0dc, [0, 0.1, 0]); }
      if (d === 1) { A(cyl(0.85, 0.7, 0.5), grad(0x9a6230, 0xd9a05a, -0.25, 0.25), [0, 0.25, 0]); A(cyl(0.7, 0.7, 0.1), 0xfff1dc, [0, 0.5, 0]); A(torus(0.82, 0.06), 0x9a6230, [0, 0.5, 0], [Math.PI / 2, 0, 0]); }
      if (d === 2) {
        A(box(1.5, 0.35, 1.2), 0xa56bff, [0, 0.18, 0]); A(box(1.3, 0.12, 1.0), 0xffe08a, [0, 0.4, 0]);
        for (const [x, z] of [[-0.7, -0.55], [0.7, -0.55], [-0.7, 0.55], [0.7, 0.55]]) A(cyl(0.05, 0.05, 1.6, 8), GOLD, [x, 0.8, z]);
        A(cone(1.15, 0.6, 4), grad(0xb88cff, 0xead8ff, -0.3, 0.3), [0, 1.85, 0], [0, Math.PI / 4, 0]);
      }
      smallCat(A, 0xb8b8c8, [0, d === 1 ? 0.5 : 0.35, 0], 0.8, 0.8);
      break;
    case 'garden': {
      const petal = pick(0xff4f6d, 0x8be06b, 0x8fb0ff);
      A(cyl(1.3, 1.4, 0.2, 20), 0x8a5a3a, [0, 0.1, 0]); A(cyl(1.25, 1.25, 0.05, 20), 0x5aa83e, [0, 0.22, 0]);
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4, r = 0.3 + (k % 3) * 0.33, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (d === 1) A(cone(0.14, 0.7, 6), grad(0x3a9a3a, 0x8be06b, -0.35, 0.35), [x, 0.55, z]);
        else flower(A, x, z, k % 2 ? petal : WHITE, 0.6 + (k % 3) * 0.1);
      }
      break;
    }
    case 'fountain':
      A(cyl(1.0, 1.1, 0.4, 20), grad(0xa89cc8, 0xe4dcf7, -0.2, 0.2), [0, 0.2, 0]); A(cyl(0.85, 0.85, 0.05, 20), 0x6fd0ff, [0, 0.39, 0]);
      A(cyl(0.15, 0.2, 0.9, 10), STONE, [0, 0.7, 0]); A(cyl(0.5, 0.2, 0.15, 16), STONE, [0, 1.05, 0]); A(cyl(0.44, 0.44, 0.04, 16), 0x6fd0ff, [0, 1.12, 0]);
      if (d === 0) { A(sph(0.25), 0xff9a2e, [0, 1.45, 0], [0, 0, 0.9], [1.2, 0.8, 0.7]); A(cone(0.18, 0.25, 4), 0xd8721a, [-0.2, 1.2, 0], [0, 0, 0.9 + Math.PI / 2], [1, 1, 0.5]); }
      if (d === 1) { A(gem(0.3), GOLD, [0, 1.5, 0], [0, 0.4, 0], [1, 1.4, 1]); }
      if (d === 2) { A(sph(0.35), 0xffb8d0, [0, 1.4, 0], [0, 0, 0], [1, 0.5, 1]); A(torus(0.3, 0.06), 0xffd6e4, [0, 1.4, 0]); }
      break;
    case 'banner': {
      const cloth = pick(0x3fa2ff, 0x29226b, 0xff5c8a);
      A(box(1.1, 1.1, 0.06), grad(mix(cloth, 0x000000, 0.25), cloth, -0.55, 0.3), [0, -0.4, 0]); A(cyl(0.04, 0.04, 1.4, 6), GOLD, [0, 0.27, 0], [0, 0, Math.PI / 2]);
      A(cone(0.4, 0.3, 4), cloth, [0, -1.05, 0], [Math.PI, Math.PI / 4, 0], [1, 1, 0.08]);
      if (d === 0) { A(sph(0.17), WHITE, [0, -0.5, 0.05], [0, 0, 0], [1.2, 1, 0.3]); for (const [x, y] of [[-0.2, -0.3], [-0.07, -0.22], [0.07, -0.22], [0.2, -0.3]]) A(sph(0.07, 8, 6), WHITE, [x, y, 0.05], [0, 0, 0], [1, 1, 0.3]); }
      if (d === 1) A(torus(0.25, 0.08, Math.PI * 1.3, 12), 0xfff3c0, [0, -0.4, 0.05], [0, 0, 1.2]);
      if (d === 2) { A(sph(0.15), WHITE, [-0.1, -0.33, 0.05], [0, 0, 0], [1, 1, 0.3]); A(sph(0.15), WHITE, [0.1, -0.33, 0.05], [0, 0, 0], [1, 1, 0.3]); A(cone(0.24, 0.3, 4), WHITE, [0, -0.55, 0.05], [Math.PI, Math.PI / 4, 0], [1, 1, 0.3]); }
      break;
    }
    case 'tower': {
      const [wall, roof] = pick([0xd8c8ff, 0x6b3fc8], [0xeaf6ff, 0x7fc8ff], [0xffd6e4, 0xff5c8a]);
      A(cyl(0.8, 0.9, 4.2, 18), grad(mix(wall, 0x6a5a9a, 0.35), wall, -2.1, 1), [0, 2.1, 0]);
      A(cyl(1.0, 0.85, 0.3, 18), wall, [0, 4.2, 0]);
      A(cone(1.05, d === 0 ? 2.4 : 1.6, 18), grad(mix(roof, 0x000000, 0.2), mix(roof, 0xffffff, 0.25), -0.8, 0.8), [0, d === 0 ? 5.5 : 5.1, 0]);
      if (d === 2) for (let k = 0; k < 4; k++) A(torus(0.86, 0.07), WHITE, [0, 0.6 + k, 0], [Math.PI / 2, 0, 0]);
      if (d === 1) A(cyl(1.08, 1.08, 0.18, 18), WHITE, [0, 4.4, 0]);
      A(gem(0.16), GOLD, [0, d === 0 ? 6.85 : 6.05, 0], [0, 0, 0], [1, 1.5, 1]);
      A(box(0.35, 0.5, 0.1), GLOW, [0, 2.8, 0.83]); A(box(0.35, 0.5, 0.1), GLOW, [0, 1.3, 0.87]);
      break;
    }
    case 'lamps': {
      const glow = pick(0xfff3a0, 0xffd0a0, 0xd0e8ff);
      for (const z of [-0.6, 1.0]) for (const x of [-1.3, 1.3]) {
        A(cyl(0.05, 0.08, 1.0, 8), 0x5b4a6e, [x, 0.5, z]); A(cyl(0.12, 0.14, 0.06, 8), 0x5b4a6e, [x, 0.03, z]); A(sph(0.17), glow, [x, 1.12, z]);
        if (d === 0) A(gem(0.1), GOLD, [x, 1.38, z]);
        if (d === 1) A(cone(0.08, 0.16, 4), 0xff9a2e, [x + 0.2, 1.12, z], [0, 0, -Math.PI / 2]);
        if (d === 2) A(torus(0.12, 0.04, Math.PI * 1.3, 10), 0xfff3c0, [x, 1.38, z]);
      }
      break;
    }
    case 'cattree': {
      const [post, pad] = pick([0xa0703f, 0x6fbf4f], [0xe6f0ff, 0x9fd0ff], [0xff9fc0, 0xffe08a]);
      A(cyl(0.9, 0.9, 0.2, 18), pad, [0, 0.1, 0]); A(cyl(0.15, 0.15, 2.6, 10), post, [0, 1.3, 0]);
      A(cyl(0.6, 0.6, 0.15, 16), pad, [0.3, 1.2, 0]); A(cyl(0.65, 0.65, 0.15, 16), pad, [-0.2, 2.6, 0]);
      if (d === 1) puffs(A, -0.2, 2.5, 0, 0.6);
      A(sph(0.09, 8, 6), 0xff5c8a, [0.75, 0.8, 0.1]); A(cyl(0.01, 0.01, 0.35, 4), WHITE, [0.75, 1.0, 0.1]);
      smallCat(A, 0xff9a2e, [-0.2, 2.68, 0], 0.3, 0.8);
      break;
    }
    case 'dragon': {
      const [body, belly] = pick([0xe0304a, 0xffc0a0], [0x2fae7a, 0xc8f0a0], [0xe8b030, 0xfff0b0]);
      const bc = grad(mix(body, 0x000000, 0.25), mix(body, 0xffffff, 0.15), -0.5, 0.5);
      A(cyl(0.9, 1.0, 0.5, 14), grad(0x8a7eb0, 0xc8bce0, -0.25, 0.25), [0, 0.25, 0]);
      A(sph(0.55), bc, [0, 1.0, 0], [0, 0, 0], [1, 0.9, 1.3]); A(sph(0.4), belly, [0, 0.95, 0.35], [0, 0, 0], [0.9, 0.9, 0.6]);
      A(cyl(0.18, 0.26, 0.7, 10), body, [0, 1.6, 0.4], [0.5, 0, 0]); A(sph(0.32), bc, [0, 2.0, 0.65], [0, 0, 0], [1, 0.9, 1.2]);
      A(sph(0.2), bc, [0, 1.92, 0.95], [0, 0, 0], [1, 0.7, 1]);
      A(cone(0.07, 0.25, 6), belly, [-0.15, 2.3, 0.55]); A(cone(0.07, 0.25, 6), belly, [0.15, 2.3, 0.55]);
      for (const s of [-1, 1]) { A(sph(0.075, 8, 6), WHITE, [s * 0.15, 2.1, 0.9]); A(sph(0.045, 8, 6), 0x222233, [s * 0.15, 2.1, 0.96]); }
      A(cone(0.7, 0.9, 3), body, [-0.6, 1.5, -0.1], [0, 0, 1.0], [1, 1, 0.15]); A(cone(0.7, 0.9, 3), body, [0.6, 1.5, -0.1], [0, 0, -1.0], [1, 1, 0.15]);
      A(cone(0.2, 0.9, 8), body, [0, 0.8, -0.8], [-1.9, 0, 0]);
      for (let k = 0; k < 3; k++) A(cone(0.08, 0.2, 4), belly, [0, 1.52 - k * 0.12, -0.25 - k * 0.2], [-0.6, 0, 0]);
      break;
    }
    case 'arch':
      if (d === 0) { // a dark rune arch set with one crystal of each gem colour
        A(torus(1.5, 0.1, Math.PI, 6), grad(SHADE, MOON, 0, 1.6));
        RAINBOW.forEach((c, k) => { const a = ((k + 0.5) / 6) * Math.PI; A(gem(0.2), c, [Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0], [0, 0, a - Math.PI / 2], [1, 1.7, 1]); });
      }
      if (d === 1) { A(torus(1.4, 0.25, Math.PI, 16), grad(0x8a80a8, 0xd0c8e0, 0, 1.6)); A(box(0.6, 0.3, 0.6), 0x9a90b0, [-1.4, 0.15, 0]); A(box(0.6, 0.3, 0.6), 0x9a90b0, [1.4, 0.15, 0]); }
      if (d === 2) { A(torus(1.4, 0.16, Math.PI, 16), 0xbff0ff); for (const x of [-1, -0.4, 0.4, 1]) A(gem(0.24), 0xe0c8ff, [x, Math.sqrt(1.96 - x * x) + 0.1, 0]); }
      if (d === 0) for (const x of [-1.35, 1.35]) A(gem(0.3), MOON, [x, 0.2, 0], [0, 0.6, 0], [1, 1.5, 1]);
      break;

    // ---- Frost Tower ----
    case 'a1_rink': {
      const ice = grad(0x9fdcff, 0xe8f8ff, -0.03, 0.03);
      if (d === 0) { A(cyl(1.25, 1.25, 0.08, 28), WHITE); A(cyl(1.12, 1.12, 0.1, 28), ice); }
      if (d === 1) { for (const s of [-1, 1]) A(cyl(0.68, 0.68, 0.1, 20), ice, [s * 0.48, 0, -0.3]); A(box(1.33, 0.1, 1.33), ice, [0, 0, 0.18], [0, Math.PI / 4, 0]); }
      if (d === 2) { A(cyl(1.3, 1.3, 0.1, 3), ice); A(cyl(1.3, 1.3, 0.1, 3), ice, [0, 0, 0], [0, Math.PI, 0]); }
      A(cyl(0.03, 0.03, 0.9, 6), 0x5b6a8a, [1.15, 0.45, -0.7]); A(cone(0.22, 0.3, 3), 0xff5c8a, [1.3, 0.78, -0.7], [0, 0, -Math.PI / 2], [1, 1, 0.1]);
      break;
    }
    case 'a1_snowcat':
      A(sph(0.58), grad(0xcfe0f5, WHITE, -0.5, 0.3), [0, 0.5, 0]); A(sph(0.42), grad(0xdfeaf8, WHITE, -0.4, 0.2), [0, 1.28, 0]);
      A(cone(0.14, 0.25, 6), WHITE, [-0.25, 1.68, 0], [0, 0, 0.35]); A(cone(0.14, 0.25, 6), WHITE, [0.25, 1.68, 0], [0, 0, -0.35]);
      for (const s of [-1, 1]) { A(sph(0.06, 8, 6), 0x222233, [s * 0.15, 1.36, 0.37]); A(cyl(0.02, 0.02, 0.6, 5), DARKWOOD, [s * 0.75, 0.75, 0], [0, 0, s * -0.9]); }
      A(cone(0.05, 0.2, 6), 0xff8a3a, [0, 1.26, 0.48], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 3; k++) A(sph(0.05, 6, 4), 0x3a3f5c, [0, 0.35 + k * 0.2, 0.56 - Math.abs(k - 1) * 0.04]);
      if (d === 0) { A(torus(0.34, 0.09), 0xe8404a, [0, 0.98, 0], [Math.PI / 2, 0, 0]); A(box(0.14, 0.4, 0.06), 0xe8404a, [0.22, 0.75, 0.34], [0, 0, -0.15]); }
      if (d === 1) { A(cyl(0.42, 0.42, 0.04, 16), 0x2a2a3a, [0, 1.63, 0]); A(cyl(0.26, 0.26, 0.36, 16), 0x2a2a3a, [0, 1.82, 0]); A(cyl(0.27, 0.27, 0.08, 16), 0xe8404a, [0, 1.7, 0]); }
      if (d === 2) { A(cone(0.13, 0.22, 8), 0xff5c9a, [-0.12, 1.0, 0.4], [0, 0, Math.PI / 2]); A(cone(0.13, 0.22, 8), 0xff5c9a, [0.12, 1.0, 0.4], [0, 0, -Math.PI / 2]); A(sph(0.06, 6, 4), 0xffa8c8, [0, 1.0, 0.42]); }
      break;
    case 'a1_igloo': {
      const c = pick(WHITE, 0xcfeaff, 0xe6e0ff);
      A(dome(1.0, 20), grad(mix(c, 0x7f9fd0, 0.4), c, 0, 0.9));
      A(cyl(0.45, 0.45, 0.7, 14), c, [0, 0.2, 0.85], [Math.PI / 2, 0, 0]); A(cyl(0.3, 0.3, 0.72, 14), 0x2a3558, [0, 0.14, 0.87], [Math.PI / 2, 0, 0]);
      if (d === 1) for (const y of [0.3, 0.58, 0.82]) A(torus(Math.sqrt(1 - y * y) + 0.01, 0.022, Math.PI * 2, 24), 0x8fb8e0, [0, y, 0], [Math.PI / 2, 0, 0]);
      if (d === 2) for (let k = 0; k < 9; k++) { const a = k * 2.4, y = 0.25 + (k % 4) * 0.2, r = Math.sqrt(1 - y * y) + 0.02; A(gem(0.07), GOLD, [Math.cos(a) * r, y, Math.sin(a) * r]); }
      break;
    }
    case 'a1_spire': {
      const c = pick(0x7fd0ff, 0xff9fd8, 0x8ff0c8);
      const ice = (h: number) => grad(mix(c, 0x3a5fa8, 0.3), mix(c, WHITE, 0.7), -h / 2, h / 2);
      A(cone(0.42, 2.6, 6), ice(2.6), [0, 1.3, 0]); A(cone(0.3, 1.7, 6), ice(1.7), [-0.5, 0.8, 0.15], [0, 0, 0.25]);
      A(cone(0.28, 1.4, 6), ice(1.4), [0.48, 0.65, 0.1], [0, 0, -0.3]); A(cone(0.22, 1.0, 6), ice(1.0), [0.1, 0.48, 0.45], [0.35, 0, 0]);
      A(cone(0.2, 0.9, 6), ice(0.9), [-0.2, 0.42, -0.4], [-0.3, 0, 0.1]);
      puffs(A, 0, 0.05, 0, 0.5);
      break;
    }

    // ---- Dragon Garden ----
    case 'a2_pond': {
      const petal = pick(0xff7fb8, WHITE, 0xffd84a);
      A(torus(1.12, 0.14, Math.PI * 2, 24), grad(0x8a8a9a, 0xc8c8d4, -0.14, 0.14), [0, 0.05, 0], [Math.PI / 2, 0, 0]); A(cyl(1.1, 1.1, 0.08, 24), 0x5fc8e8, [0, 0.04, 0]);
      for (const [x, z, s] of [[-0.4, 0.3, 1], [0.45, -0.2, 0.8], [0.1, 0.6, 0.7], [-0.3, -0.5, 0.9]]) {
        A(cyl(0.28 * s, 0.28 * s, 0.03, 12), 0x4fae4f, [x, 0.1, z]);
        for (let k = 0; k < 5; k++) A(cone(0.06 * s, 0.16 * s, 4), petal, [x + Math.cos(k * 1.257) * 0.07 * s, 0.17, z + Math.sin(k * 1.257) * 0.07 * s], [Math.sin(k * 1.257) * 0.5, 0, -Math.cos(k * 1.257) * 0.5]);
        A(sph(0.04 * s, 6, 4), 0xfff36b, [x, 0.17, z]);
      }
      A(cyl(0.02, 0.02, 0.7, 5), 0x3c9a3c, [0.85, 0.4, 0.5]); A(sph(0.07, 6, 4), DARKWOOD, [0.85, 0.75, 0.5], [0, 0, 0], [1, 2.2, 1]);
      break;
    }
    case 'a2_nest': {
      const c = pick(0x9a6a3a, 0x6a9a4a, 0xe8b830);
      A(torus(0.72, 0.28, Math.PI * 2, 20), grad(mix(c, 0x000000, 0.3), mix(c, WHITE, 0.2), -0.28, 0.28), [0, 0.26, 0], [Math.PI / 2, 0, 0]); A(cyl(0.7, 0.7, 0.1, 16), mix(c, 0x000000, 0.35), [0, 0.12, 0]);
      [[-0.25, 0.1, 0xb8f0d0], [0.28, 0.05, 0xffd0e8], [0, -0.28, 0xd0d8ff]].forEach(([x, z, col]) => A(sph(0.24), grad(mix(col, 0x6a7ab0, 0.3), col, -0.2, 0.2), [x, 0.48, z], [0.2, 0, x], [1, 1.3, 1]));
      for (let k = 0; k < 6; k++) A(cyl(0.025, 0.025, 0.7, 4), DARKWOOD, [Math.cos(k) * 0.85, 0.3, Math.sin(k) * 0.85], [k, k * 2, 1.2]);
      break;
    }
    case 'a2_topiary': {
      const leaf = grad(0x2f8f3f, 0x7fd060, -0.5, 0.5);
      A(cyl(0.4, 0.3, 0.45, 12), grad(0xc8643a, 0xe89060, -0.2, 0.2), [0, 0.22, 0]); A(cyl(0.07, 0.08, 0.5, 6), DARKWOOD, [0, 0.65, 0]);
      if (d === 0) { A(sph(0.5), leaf, [0, 1.25, 0]); A(sph(0.38), leaf, [0, 1.95, 0.05]); A(cone(0.14, 0.26, 6), 0x5fbf50, [-0.22, 2.32, 0.05], [0, 0, 0.3]); A(cone(0.14, 0.26, 6), 0x5fbf50, [0.22, 2.32, 0.05], [0, 0, -0.3]); A(torus(0.3, 0.07, Math.PI, 10), 0x4fae4f, [0.45, 1.1, -0.2], [0, 0, -0.4]); }
      if (d === 1) { A(sph(0.5), leaf, [0, 1.25, 0], [0, 0, 0], [1, 0.9, 1.3]); A(cyl(0.16, 0.22, 0.6, 8), 0x4fae4f, [0, 1.8, 0.4], [0.5, 0, 0]); A(sph(0.28), leaf, [0, 2.15, 0.62], [0, 0, 0], [1, 0.9, 1.3]); for (const s of [-1, 1]) A(cone(0.5, 0.7, 3), 0x5fbf50, [s * 0.55, 1.7, -0.1], [0, 0, s * -1.0], [1, 1, 0.2]); }
      if (d === 2) { for (const s of [-1, 1]) A(sph(0.42), leaf, [s * 0.3, 1.75, 0]); A(cone(0.66, 0.9, 12), leaf, [0, 1.25, 0], [Math.PI, 0, 0], [1, 1, 0.6]); }
      for (let k = 0; k < 5; k++) A(sph(0.06, 6, 4), k % 2 ? 0xff7fb8 : 0xfff36b, [Math.cos(k * 1.4) * 0.45, 1.2 + (k % 3) * 0.25, Math.sin(k * 1.4) * 0.45 + 0.1]);
      break;
    }
    case 'a2_gate': {
      const bloom = pick(0xff5c7a, 0x8fe070, 0xb08cff);
      for (const s of [-1, 1]) { A(cyl(0.14, 0.17, 1.6, 8), grad(0x7a5a3a, 0xb08a5a, -0.8, 0.8), [s * 1.0, 0.8, 0]); A(sph(0.18), 0x4fae4f, [s * 1.0, 0.2, 0.12]); }
      A(torus(1.0, 0.13, Math.PI, 18), 0x3f9a45, [0, 1.6, 0]);
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI, x = Math.cos(a) * 1.0, y = 1.6 + Math.sin(a) * 1.0;
        A(sph(0.13, 8, 6), k % 2 ? bloom : mix(bloom, WHITE, 0.45), [x, y, 0.12]);
        A(sph(0.1, 6, 4), 0x5fbf50, [x * 1.08, y + 0.05, -0.08], [0, 0, a], [1.4, 0.6, 1]);
        if (d === 2 && k % 2) A(cone(0.09, 0.4, 6), bloom, [x, y - 0.3, 0.1], [Math.PI, 0, 0]);
      }
      break;
    }

    // ---- Seashell Shore ----
    case 'a3_sand': {
      const sand = grad(0xc89858, 0xf0cf88, -0.4, 0.4);
      A(cyl(1.0, 1.2, 0.3, 18), sand, [0, 0.15, 0]);
      const tower = (x: number, z: number, h: number, r: number) => { A(cyl(r, r * 1.1, h, 12), sand, [x, 0.3 + h / 2, z]); A(cone(r * 1.15, r * 1.4, 12), d === 2 ? 0xff7f6a : sand, [x, 0.3 + h + r * 0.7, z]); };
      tower(0, 0, 0.9, 0.3); tower(-0.6, 0.3, 0.5, 0.22); tower(0.6, 0.3, 0.5, 0.22);
      if (d !== 1) { tower(-0.45, -0.45, 0.6, 0.2); tower(0.45, -0.45, 0.6, 0.2); }
      A(box(0.9, 0.35, 0.12), sand, [0, 0.47, 0.42]); A(box(0.2, 0.25, 0.14), 0x8a6a3a, [0, 0.42, 0.43]);
      if (d === 1) for (let k = 0; k < 7; k++) A(sph(0.09, 8, 6), k % 2 ? 0xffb8d0 : 0xfff0e0, [Math.cos(k * 0.9) * 0.95, 0.33, Math.sin(k * 0.9) * 0.95], [0, k, 0], [1, 0.6, 1.2]);
      if (d === 2) { A(cyl(0.015, 0.015, 0.5, 4), DARKWOOD, [0, 1.85, 0]); A(cone(0.15, 0.22, 3), 0x4ad0ff, [0.1, 2.0, 0], [0, 0, -Math.PI / 2], [1, 1, 0.1]); }
      break;
    }
    case 'a3_boards': {
      const cols = pick([0xff7f50, 0xffd23f, 0xff5c8a], [0x3fa2ff, 0x35c9c0, 0xe8f8ff], [0xff8fd0, 0xb08cff, 0x8ff0c8]);
      A(box(1.7, 0.08, 0.1), WOOD, [0, 0.75, -0.12]); for (const s of [-1, 1]) A(cyl(0.05, 0.05, 0.9, 6), WOOD, [s * 0.85, 0.45, -0.12]);
      cols.forEach((c, k) => {
        const x = (k - 1) * 0.55;
        A(sph(0.5, 14, 12), (y) => (Math.abs(y) < 0.05 ? WHITE : y > 0.25 ? mix(c, WHITE, 0.4) : c), [x, 0.95, 0], [-0.12, 0, (k - 1) * 0.06], [0.42, 1.9, 0.08]);
      });
      A(sph(0.16, 10, 8), 0xff5c8a, [0.95, 0.12, 0.35], [0, 0, 0], [1, 0.75, 1]); A(sph(0.11, 8, 6), 0xffe0a8, [0.75, 0.08, 0.5], [0, 0, 0], [1, 0.6, 1.2]);
      break;
    }
    case 'a3_hut': {
      const c = pick(0xff8f7a, 0x35c9c0, 0xffd04a);
      for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) A(cyl(0.06, 0.06, 0.5, 6), DARKWOOD, [x, 0.25, z]);
      A(box(1.5, 0.1, 1.3), WOOD, [0, 0.5, 0]);
      A(box(1.3, 1.1, 1.1), (_y, x) => (Math.sin(x * 24) > 0 ? c : mix(c, WHITE, 0.75)), [0, 1.1, 0]);
      A(cone(1.15, 0.75, 4), grad(0xd9b070, 0xf7e0a8, -0.4, 0.4), [0, 2.02, 0], [0, Math.PI / 4, 0]);
      A(box(0.4, 0.75, 0.06), 0xfff6e0, [0, 0.93, 0.56]); A(torus(0.17, 0.055, Math.PI * 2, 14), (y, x) => (x * y > 0 ? 0xff5c5c : WHITE), [0.42, 1.2, 0.58]);
      A(box(0.5, 0.06, 0.5), WOOD, [0, 0.33, 0.85], [0.5, 0, 0]);
      break;
    }
    case 'a3_palm': {
      for (let k = 0; k < 5; k++) A(cyl(0.11 - k * 0.008, 0.13 - k * 0.008, 0.5, 8), grad(0x8a6238, 0xc89a60, -0.25, 0.25), [k * k * 0.035, 0.25 + k * 0.46, 0], [0, 0, -k * 0.07]);
      const tx = 0.6, ty = 2.35;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        A(sph(0.5, 10, 6), grad(0x2f9a4a, 0x8fe070, -0.5, 0.5), [tx + Math.cos(a) * 0.55, ty - 0.12, Math.sin(a) * 0.55], [0, -a, -0.45], [1.3, 0.12, 0.35]);
      }
      A(sph(0.14, 8, 6), 0x4fae4f, [tx, ty, 0]);
      if (d === 0) for (const [x, z] of [[0.12, 0.1], [-0.12, 0], [0, -0.14]]) A(sph(0.11, 8, 6), 0x7a5230, [tx + x, ty - 0.2, z]);
      if (d === 1) { A(cyl(0.05, 0.05, 1.3, 6), DARKWOOD, [-1.3, 0.65, 0]); A(torus(0.72, 0.03, Math.PI, 12), 0xff8f7a, [-0.6, 1.2, 0], [Math.PI, 0, 0], [1, 0.5, 6]); }
      if (d === 2) for (const [x, y, z] of [[0.5, -0.5, 0.3], [-0.3, -0.45, -0.2], [0.2, -0.6, -0.4]]) { A(cyl(0.008, 0.008, 0.3, 4), 0x444444, [tx + x, ty + y + 0.22, z]); A(sph(0.1, 8, 6), GLOW, [tx + x, ty + y, z], [0, 0, 0], [1, 1.2, 1]); }
      break;
    }

    // ---- Powder Peak ----
    case 'a4_sled':
      A(sph(1.1), grad(0xcfe0f5, WHITE, -0.2, 0.4), [0, 0, 0], [0, 0, 0], [1.1, 0.4, 0.9]);
      if (d === 0) for (const [x, z, r] of [[-0.4, 0.5, 0.3], [0.5, 0.2, -0.4]]) { A(box(0.4, 0.05, 0.8), 0xd9703a, [x, 0.5, z], [0.15, r, 0]); for (const s of [-1, 1]) A(box(0.04, 0.12, 0.9), 0x5b6a8a, [x + s * 0.17, 0.42, z], [0.15, r, 0]); }
      if (d === 1) [[-0.5, 0.4, 0xff5c8a], [0.5, 0.3, 0x3fa2ff], [0, -0.35, 0xffd23f]].forEach(([x, z, c]) => A(torus(0.27, 0.13, Math.PI * 2, 16), c, [x, 0.5, z], [Math.PI / 2 - 0.15, 0, 0]));
      if (d === 2) { for (const s of [-1, 1]) A(cyl(0.04, 0.04, 1.0, 6), WOOD, [s * 0.6, 0.85, 0]); A(box(1.3, 0.06, 0.06), WOOD, [0, 1.2, 0]); [0xff5c8a, 0x3fa2ff, 0xffd23f, 0x4fd16b].forEach((c, k) => A(box(0.09, 1.25, 0.03), c, [-0.4 + k * 0.27, 0.95, 0.08], [-0.12, 0, 0])); }
      break;
    case 'a4_pines': {
      const leaf = pick(0x2f8f5a, 0x2f8f4a, 0x4a8fb0);
      pine(A, -0.6, 0, 1.3, leaf, d !== 1); pine(A, 0.5, 0.35, 1.0, leaf, d !== 1); pine(A, 0.3, -0.6, 0.8, leaf, d !== 1);
      if (d === 1) for (let k = 0; k < 12; k++) { const a = k * 1.9, y = 0.9 + (k % 4) * 0.42; A(sph(0.06, 6, 4), RAINBOW[k % 6], [-0.6 + Math.cos(a) * (0.75 - (k % 4) * 0.15), y, Math.sin(a) * (0.75 - (k % 4) * 0.15)]); }
      break;
    }
    case 'a4_lodge': {
      const wall = pick(0xa8703f, 0xa8a8b8, 0xd9a05a);
      A(box(1.8, 1.0, 1.3), (y) => (d === 0 && Math.sin(y * 28) > 0.6 ? 0x7a4f2c : wall), [0, 0.5, 0]);
      A(cyl(1.0, 1.0, 1.9, 3), d === 2 ? 0x9a5a2a : 0x8a3a3a, [0, 1.32, 0], [0, 0, Math.PI / 2], [0.75, 1, 1]);
      A(cyl(1.04, 1.04, 2.0, 3), WHITE, [0, 1.42, 0], [0, 0, Math.PI / 2], [0.62, 1, 1.02]);
      A(box(0.3, 0.7, 0.3), 0x8a6a6a, [0.55, 1.7, -0.2]); A(box(0.36, 0.08, 0.36), WHITE, [0.55, 2.06, -0.2]);
      A(box(0.36, 0.62, 0.06), 0x5a3a22, [0, 0.31, 0.66]); for (const s of [-1, 1]) A(box(0.32, 0.3, 0.06), GLOW, [s * 0.55, 0.6, 0.66]);
      if (d === 2) for (let k = 0; k < 7; k++) A(sph(0.07, 6, 4), RAINBOW[k % 6], [-0.78 + k * 0.26, 1.02, 0.67]);
      if (d === 1) for (let k = 0; k < 8; k++) A(sph(0.12, 6, 4), 0x8a8a9a, [-0.8 + (k % 4) * 0.52, 0.2 + Math.floor(k / 4) * 0.5, 0.64], [0, 0, 0], [1, 0.7, 0.3]);
      break;
    }
    case 'a4_lift': {
      const c = pick(0xe8404a, 0x3f8fe8, 0xffc82e);
      for (const s of [-1, 1]) { A(cyl(0.08, 0.12, 2.4, 8), grad(0x6a7a9a, 0xb0bcd0, -1.2, 1.2), [s * 1.2, 1.2, 0]); A(box(0.7, 0.08, 0.08), 0x8a96b0, [s * 1.2, 2.4, 0], [0, Math.PI / 2, 0]); }
      A(cyl(0.015, 0.015, 2.9, 4), 0x3a3f4c, [0, 2.42, 0.25], [0, 0, Math.PI / 2 - 0.08]);
      for (const x of [-0.45, 0.55]) {
        A(cyl(0.012, 0.012, 0.75, 4), 0x3a3f4c, [x, 2.02 + x * 0.08, 0.25]);
        A(box(0.55, 0.06, 0.25), c, [x, 1.62 + x * 0.08, 0.3]); A(box(0.55, 0.35, 0.05), c, [x, 1.8 + x * 0.08, 0.17]);
        A(box(0.6, 0.03, 0.03), 0x8a96b0, [x, 1.78 + x * 0.08, 0.44]);
      }
      break;
    }

    // ---- Ember Roost ----
    case 'a5_eggs': {
      const cols = pick([0xe0304a, 0xff7a5a, 0xc8203a], [0x2fae7a, 0x8fe0a0, 0x1f8a6a], [0xfff0d8, 0xf0d8b0, 0xffe8c8]);
      A(torus(0.75, 0.24, Math.PI * 2, 18), grad(0x2a2028, 0x5a4a50, -0.24, 0.24), [0, 0.22, 0], [Math.PI / 2, 0, 0]);
      cols.forEach((c, k) => {
        const x = [-0.3, 0.3, 0][k], z = [0.1, 0.1, -0.3][k];
        A(sph(0.3), grad(mix(c, 0x000000, 0.3), mix(c, WHITE, 0.25), -0.3, 0.3), [x, 0.55, z], [0.15, 0, x * 0.5], [1, 1.35, 1]);
        if (d === 2) for (let j = 0; j < 4; j++) A(sph(0.05, 6, 4), 0x8a5a3a, [x + Math.cos(j * 1.7 + k) * 0.24, 0.5 + j * 0.1, z + Math.abs(Math.sin(j * 1.7 + k)) * 0.24]);
      });
      for (let k = 0; k < 5; k++) A(gem(0.09), 0xff8a2e, [Math.cos(k * 1.3) * 1.0, 0.08, Math.sin(k * 1.3) * 1.0]);
      break;
    }
    case 'a5_brazier': {
      const [f1, f2] = pick([0xff7a1a, 0xffe04a], [0x3fa2ff, 0xbfeaff], [0x4fd16b, 0xe0ffb0]);
      for (const s of [-1, 1]) {
        A(cyl(0.08, 0.2, 0.9, 8), grad(0x3a3040, 0x7a6a80, -0.45, 0.45), [s * 0.7, 0.45, 0]); A(cyl(0.38, 0.14, 0.25, 12), 0x5a4a60, [s * 0.7, 1.0, 0]);
        A(cone(0.26, 0.6, 8), grad(f1, f2, -0.3, 0.3), [s * 0.7, 1.4, 0]); A(cone(0.14, 0.4, 6), f2, [s * 0.7 + 0.1, 1.3, 0.1]);
      }
      break;
    }
    case 'a5_volcano': {
      const [rk, lava] = pick([0x4a3530, 0xff6a1a], [0x4a3560, 0xff5cc8], [0x6a5020, 0xffd23f]);
      A(cyl(0.5, 1.6, 2.1, 12), grad(mix(rk, 0x000000, 0.3), mix(rk, 0xffffff, 0.2), -1, 1), [0, 1.05, 0]);
      A(cyl(0.44, 0.44, 0.06, 12), lava, [0, 2.1, 0]);
      for (const [a, l] of [[0.3, 1.3], [2.3, 0.9], [4.2, 1.5], [5.4, 0.7]]) A(box(0.14, l, 0.06), grad(mix(lava, rk, 0.5), lava, -l / 2, l / 2), [Math.sin(a) * (0.5 + l * 0.26), 2.1 - l * 0.46, Math.cos(a) * (0.5 + l * 0.26)], [0.47, a, 0]);
      rock(A, 1.4, 0.6, 0.8, rk); rock(A, -1.3, 0.8, 0.6, rk);
      break;
    }
    case 'a5_perch': {
      const c = pick(0xe0304a, 0x3f8fe8, 0x9a5ae8);
      const bc = grad(mix(c, 0x000000, 0.25), mix(c, WHITE, 0.2), -0.35, 0.35), belly = mix(c, 0xfff0c0, 0.75);
      A(cyl(0.5, 0.75, 1.1, 7), grad(0x2e2430, 0x6a5a66, -0.55, 0.55), [0, 0.55, 0]);
      A(sph(0.36), bc, [0, 1.4, 0], [0, 0, 0], [1, 1.05, 1]); A(sph(0.24), belly, [0, 1.36, 0.2], [0, 0, 0], [0.9, 1, 0.6]);
      A(sph(0.3), bc, [0, 1.92, 0.12]); A(sph(0.17), bc, [0, 1.84, 0.38], [0, 0, 0], [1, 0.75, 1]);
      for (const s of [-1, 1]) {
        A(sph(0.075, 8, 6), WHITE, [s * 0.13, 1.98, 0.36]); A(sph(0.045, 8, 6), 0x222233, [s * 0.13, 1.98, 0.42]);
        A(cone(0.05, 0.18, 6), belly, [s * 0.14, 2.24, 0.02], [-0.2, 0, s * -0.2]);
        A(cone(0.4, 0.55, 3), mix(c, WHITE, 0.2), [s * 0.45, 1.65, -0.15], [0, 0, s * -1.0], [1, 1, 0.15]);
        A(sph(0.1, 8, 6), bc, [s * 0.2, 1.1, 0.25]);
      }
      A(cone(0.12, 0.6, 8), c, [0.1, 1.2, -0.45], [-1.8, 0, 0.3]);
      break;
    }

    // ---- Canyon Mine ----
    case 'a6_cart': {
      for (const s of [-1, 1]) A(box(0.06, 0.06, 2.2), 0x6a6a7a, [s * 0.35, 0.08, 0], [0, 0.5, 0]);
      for (let k = -2; k <= 2; k++) A(box(1.0, 0.05, 0.14), DARKWOOD, [Math.sin(0.5) * k * 0.45, 0.03, Math.cos(0.5) * k * 0.45], [0, 0.5, 0]);
      A(box(0.85, 0.5, 1.1), grad(0x5a5a6a, 0x9a9aaa, -0.25, 0.25), [0, 0.55, 0], [0, 0.5, 0]); A(box(0.92, 0.07, 1.17), 0x4a4a5a, [0, 0.8, 0], [0, 0.5, 0]);
      for (const [x, z] of [[-0.42, 0.3], [0.42, 0.3], [-0.42, -0.3], [0.42, -0.3]]) { const c = Math.cos(0.5), s = Math.sin(0.5); A(cyl(0.17, 0.17, 0.08, 12), 0x3a3a48, [x * c + z * s, 0.22, -x * s + z * c], [0, 0.5, Math.PI / 2]); }
      for (let k = 0; k < 7; k++) {
        const p: V3 = [Math.cos(k * 2.2) * 0.22, 0.9 + (k % 2) * 0.12, Math.sin(k * 2.2) * 0.3];
        if (d === 0) A(new IcosahedronGeometry(0.16, 0), mix(GOLD, 0xffa82e, (k % 3) / 3), p, [k, k, 0]);
        if (d === 1) A(gem(0.15), RAINBOW[k % 6], p, [0, k, 0], [1, 1.3, 1]);
        if (d === 2) A(cone(0.1, 0.45, 6), mix(0x9fe8ff, WHITE, (k % 3) / 3), [p[0], p[1] + 0.1, p[2]], [Math.cos(k) * 0.4, 0, Math.sin(k) * 0.4]);
      }
      break;
    }
    case 'a6_cactus': {
      const g = grad(0x2f8a4a, 0x7fd070, -0.6, 0.6);
      A(cyl(1.0, 1.1, 0.12, 16), 0xe8c08a, [0, 0.06, 0]);
      if (d === 0) { A(cyl(0.2, 0.22, 1.6, 10), g, [0, 0.9, 0]); A(sph(0.2), 0x7fd070, [0, 1.7, 0]); for (const s of [-1, 1]) { A(cyl(0.11, 0.11, 0.4, 8), g, [s * 0.3, 0.9 + s * 0.1, 0], [0, 0, Math.PI / 2]); A(cyl(0.11, 0.11, 0.55, 8), g, [s * 0.47, 1.15 + s * 0.1, 0]); A(sph(0.11, 8, 6), 0x7fd070, [s * 0.47, 1.43 + s * 0.1, 0]); } }
      if (d === 1) for (const [x, y, s, r] of [[0, 0.45, 1, 0], [-0.3, 0.95, 0.75, 0.5], [0.32, 0.9, 0.7, -0.5], [-0.42, 1.4, 0.5, 0.7], [0.1, 1.35, 0.5, -0.2]]) { A(sph(0.4 * s), g, [x, y, 0], [0, 0, r], [1, 1.15, 0.4]); A(sph(0.07 * s, 6, 4), 0xff5c8a, [x - Math.sin(r) * 0.45 * s, y + Math.cos(r) * 0.45 * s, 0]); }
      if (d === 2) for (const [x, z, s] of [[-0.4, 0.2, 1], [0.4, 0.3, 0.75], [0.1, -0.45, 0.6]]) { A(sph(0.36 * s, 12, 8), (_y, xx) => (Math.sin(xx * 40) > 0.3 ? 0x3f9a50 : 0x6fc868), [x, 0.36 * s, z], [0, 0, 0], [1, 0.95, 1]); for (let k = 0; k < 5; k++) A(sph(0.07 * s, 6, 4), k ? 0xff8fd0 : 0xfff36b, [x + (k ? Math.cos(k * 1.57) * 0.09 * s : 0), 0.72 * s, z + (k ? Math.sin(k * 1.57) * 0.09 * s : 0)]); }
      rock(A, 0.85, -0.3, 0.5, 0xc8704a);
      break;
    }
    case 'a6_shaft': {
      A(dome(1.25, 12), grad(0xa85a3a, 0xe0a070, 0, 1.2), [0, 0, -0.35], [0, 0, 0], [1.1, 1, 0.9]);
      A(box(0.85, 1.0, 0.3), 0x1e1418, [0, 0.5, 0.6]);
      for (const s of [-1, 1]) A(box(0.14, 1.2, 0.16), grad(DARKWOOD, WOOD, -0.6, 0.6), [s * 0.5, 0.6, 0.75], [0, 0, s * -0.06]);
      A(box(1.3, 0.16, 0.18), WOOD, [0, 1.25, 0.75]);
      for (const s of [-1, 1]) A(box(0.05, 0.05, 1.2), 0x6a6a7a, [s * 0.22, 0.04, 1.3]);
      if (d === 1) for (const s of [-1, 1]) { A(cyl(0.01, 0.01, 0.2, 4), 0x333333, [s * 0.5, 1.08, 0.86]); A(sph(0.1, 8, 6), GLOW, [s * 0.5, 0.93, 0.86], [0, 0, 0], [1, 1.2, 1]); }
      if (d === 2) for (let k = 0; k < 8; k++) { const a = -0.3 + k * 0.5; A(gem(0.12), RAINBOW[k % 6], [Math.cos(a) * 1.25, 0.25 + Math.abs(Math.sin(a * 1.2)) * 0.75, 0.25 + Math.sin(a) * 0.3], [0, k, 0], [1, 1.4, 1]); }
      if (d === 0) { A(box(0.5, 0.3, 0.04), WOOD, [0.95, 0.75, 0.7], [0, -0.3, 0.1]); A(cyl(0.03, 0.03, 0.7, 5), DARKWOOD, [0.95, 0.35, 0.7]); }
      break;
    }
    case 'a6_arch': {
      const strata = (y: number): number => {
        if (d === 0) return Math.sin(y * 9) > 0.3 ? 0xc8553a : 0xe07850;
        if (d === 1) return Math.sin(y * 9) > 0.3 ? 0xe0b070 : 0xf2d098;
        return [0xc8553a, 0xf2a85a, 0xffd88a, 0xb86a9a, 0x8a6ac8][Math.abs(Math.floor(y * 3.2)) % 5];
      };
      A(torus(1.25, 0.34, Math.PI, 16), strata, [0, 0.1, 0], [0, 0, 0], [1, 1.15, 1.2]);
      for (const s of [-1, 1]) A(cyl(0.45, 0.55, 0.5, 8), strata, [s * 1.25, 0.2, 0]);
      A(cyl(0.5, 0.45, 0.25, 8), strata, [0.2, 1.95, 0]);
      rock(A, -1.9, 0.4, 0.6, 0xc8704a);
      break;
    }

    // ---- Starlight Ballroom ----
    case 'a7_floor':
      A(box(2.3, 0.08, 2.3), 0x2a2040, [0, 0.04, 0]);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const c = d === 0 ? ((i + j) % 2 ? 0xffe0f0 : 0xff5c9a) : d === 1 ? RAINBOW[(i + j) % 6] : (i * 3 + j * 5) % 4 === 0 ? 0xffe46a : (i + j) % 2 ? 0x3a3f9a : 0x2a2a6a;
        A(box(0.5, 0.06, 0.5), mix(c, WHITE, 0.1), [-0.81 + i * 0.54, 0.1, -0.81 + j * 0.54]);
      }
      break;
    case 'a7_speakers': {
      const c = pick(0xff7fc0, 0x4a9fff, 0xffc83a);
      for (const s of [-1, 1]) {
        A(box(0.6, 0.9, 0.5), grad(mix(c, 0x000000, 0.35), c, -0.45, 0.45), [s * 0.5, 0.45, 0], [0, s * -0.25, 0]);
        A(cyl(0.2, 0.2, 0.05, 16), 0x2a2040, [s * 0.5 - s * 0.06, 0.32, 0.25], [Math.PI / 2, 0, 0]); A(cyl(0.11, 0.11, 0.05, 12), 0x2a2040, [s * 0.5 - s * 0.06, 0.7, 0.25], [Math.PI / 2, 0, 0]);
        A(sph(0.09, 8, 6), WHITE, [s * 0.5 - s * 0.06, 0.32, 0.26], [0, 0, 0], [1, 1, 0.3]);
      }
      for (const [x, y, k] of [[-0.2, 1.35, 0], [0.25, 1.6, 2], [0.75, 1.3, 4]]) { A(sph(0.09, 8, 6), RAINBOW[k], [x, y, 0], [0, 0, 0.4], [1.2, 0.85, 1]); A(box(0.03, 0.34, 0.03), RAINBOW[k], [x + 0.09, y + 0.17, 0]); A(box(0.16, 0.05, 0.03), RAINBOW[k], [x + 0.16, y + 0.32, 0], [0, 0, -0.3]); }
      break;
    }
    case 'a7_stage': {
      const c = pick(0xc8243a, 0xff8fc8, 0x3a4fc8);
      A(cyl(1.4, 1.5, 0.3, 24), grad(0x5a3a22, 0xa87a4a, -0.15, 0.15), [0, 0.15, 0], [0, 0, 0], [1, 1, 0.75]);
      for (const s of [-1, 1]) { A(box(0.5, 1.8, 0.14), (y, x) => mix(mix(c, 0x000000, 0.4), c, 0.5 + 0.5 * Math.sin(x * 26) + y * 0.2), [s * 1.0, 1.2, -0.6]); A(cyl(0.05, 0.05, 2.0, 6), GOLD, [s * 1.3, 1.3, -0.6]); }
      A(box(2.7, 0.35, 0.18), mix(c, 0x000000, 0.2), [0, 2.2, -0.6]);
      for (let k = 0; k < 7; k++) A(sph(0.16, 8, 6), c, [-1.2 + k * 0.4, 2.02, -0.55]);
      A(gem(0.2), GOLD, [0, 2.6, -0.6], [0, 0, 0], [1, 1.3, 0.5]);
      if (d === 2) for (let k = 0; k < 5; k++) A(gem(0.09), 0xffe46a, [-0.8 + k * 0.4, 1.0 + (k % 2) * 0.5, -0.68]);
      break;
    }
    case 'a7_ball': {
      const c = pick(0xd8e0f0, 0xffd04a, 0xffa8d0);
      for (const s of [-1, 1]) A(cyl(0.06, 0.09, 2.6, 8), grad(0x4a3a8a, 0x9a8ae0, -1.3, 1.3), [s * 1.0, 1.3, 0]);
      A(box(2.2, 0.1, 0.1), 0x9a8ae0, [0, 2.6, 0]); A(cyl(0.012, 0.012, 0.4, 4), 0xcccccc, [0, 2.38, 0]);
      A(sph(0.5, 16, 12), (y, x) => ((Math.floor(y * 9 + 20) + Math.floor(x * 9 + 20)) % 2 ? c : mix(c, WHITE, 0.75)), [0, 1.75, 0]);
      for (const [x, y] of [[-0.7, 2.2], [0.75, 1.5], [0.6, 2.25], [-0.72, 1.35]]) A(gem(0.07), WHITE, [x, y, 0.3]);
      break;
    }

    // ---- Kitten Cup ----
    case 'a8_trophy': {
      const c = pick(0xffd23f, 0xd0d8e8, 0xffd23f);
      const m = grad(mix(c, 0x7a5a1a, 0.4), mix(c, WHITE, 0.5), -0.4, 0.4);
      A(box(0.9, 0.5, 0.9), grad(0x6a5a8a, 0xb0a0d0, -0.25, 0.25), [0, 0.25, 0]); A(box(0.6, 0.12, 0.04), GOLD, [0, 0.28, 0.46]);
      A(cyl(0.22, 0.3, 0.12, 14), m, [0, 0.56, 0]); A(cyl(0.07, 0.1, 0.35, 10), m, [0, 0.78, 0]); A(cyl(0.42, 0.14, 0.6, 16), m, [0, 1.24, 0]);
      for (const s of [-1, 1]) A(torus(0.17, 0.04, Math.PI * 1.2, 10), m, [s * 0.42, 1.28, 0], [0, 0, s > 0 ? -2.2 : 0.3]);
      if (d === 2) A(gem(0.2), 0xffe46a, [0, 1.75, 0], [0, 0, 0], [1, 1.3, 0.6]); else A(sph(0.2), (y, x) => (Math.sin(y * 16) * Math.sin(x * 16) > 0.3 ? 0x2a2a3a : WHITE), [0, 1.62, 0]);
      break;
    }
    case 'a8_goal': {
      const fc = (k: number) => pick(WHITE, GOLD, RAINBOW[k % 6]);
      for (const s of [-1, 1]) { A(cyl(0.06, 0.06, 1.3, 8), fc(s + 1), [s * 1.1, 0.65, 0.3]); A(cyl(0.04, 0.04, 1.45, 6), fc(s + 2), [s * 1.1, 0.62, -0.1], [0.55, 0, 0]); }
      A(cyl(0.06, 0.06, 2.3, 8), fc(4), [0, 1.3, 0.3], [0, 0, Math.PI / 2]);
      for (let k = 0; k <= 8; k++) A(box(0.02, 1.45, 0.02), 0xe8eef8, [-1.0 + k * 0.25, 0.62, -0.1], [0.55, 0, 0]);
      for (let k = 0; k < 5; k++) A(box(2.2, 0.02, 0.02), 0xe8eef8, [0, 0.15 + k * 0.28, -0.48 + k * 0.19]);
      A(sph(0.2), (y, x) => (Math.sin(y * 18) * Math.sin(x * 18) > 0.25 ? 0x2a2a3a : WHITE), [0.4, 0.2, 0.9]);
      break;
    }
    case 'a8_stands': {
      const c = pick(0x3f8fe8, 0xe8404a, 0x4fbf5a);
      for (let k = 0; k < 3; k++) { A(box(2.4, 0.3, 0.5), grad(mix(c, 0x000000, 0.3), c, -0.15, 0.15), [0, 0.15 + k * 0.3, 0.4 - k * 0.5]); A(box(2.4, 0.06, 0.4), mix(c, WHITE, 0.6), [0, 0.33 + k * 0.3, 0.4 - k * 0.5]); }
      A(box(2.5, 1.5, 0.08), mix(c, 0x000000, 0.4), [0, 0.75, -0.9]);
      for (let k = 0; k < 6; k++) A(cone(0.13, 0.24, 3), k % 2 ? WHITE : GOLD, [-1.05 + k * 0.42, 1.5, -0.88], [Math.PI, 0, 0], [1, 1, 0.15]);
      smallCat(A, 0xffc27a, [-0.6, 0.66, -0.1], 0, 0.55); smallCat(A, 0x9a9aaa, [0.5, 0.36, 0.4], 0.2, 0.55); smallCat(A, WHITE, [0.2, 0.96, -0.6], -0.2, 0.55);
      break;
    }
    case 'a8_board': {
      const [lit, lit2] = pick([0xffe46a, 0xffe46a], [0xff5cc8, 0x4ae0ff], [0xffb8d8, 0xffffff]);
      for (const s of [-1, 1]) A(cyl(0.07, 0.09, 1.5, 8), 0x6a7a9a, [s * 0.8, 0.75, 0]);
      A(box(2.2, 1.1, 0.2), grad(0x1e2030, 0x3a3f5c, -0.55, 0.55), [0, 1.9, 0]); A(box(2.3, 0.1, 0.26), 0x8a96b0, [0, 2.48, 0]);
      if (d === 2) { A(sph(0.22), lit, [0, 1.82, 0.1], [0, 0, 0], [1.2, 1, 0.3]); for (const [x, y] of [[-0.26, 2.08], [-0.09, 2.2], [0.09, 2.2], [0.26, 2.08]]) A(sph(0.09, 8, 6), lit2, [x, y, 0.1], [0, 0, 0], [1, 1, 0.3]); }
      else {
        A(box(0.1, 0.1, 0.05), WHITE, [0, 2.05, 0.11]); A(box(0.1, 0.1, 0.05), WHITE, [0, 1.75, 0.11]);
        for (const y of [1.6, 1.9, 2.2]) { A(box(0.4, 0.08, 0.05), lit, [-0.6, y, 0.11]); A(box(0.4, 0.08, 0.05), lit2, [0.6, y, 0.11]); }
        A(box(0.08, 0.68, 0.05), lit, [-0.4, 1.9, 0.11]); A(box(0.08, 0.34, 0.05), lit2, [0.8, 2.05, 0.11]); A(box(0.08, 0.34, 0.05), lit2, [0.4, 1.75, 0.11]);
      }
      break;
    }

    // ---- Cloud Kingdom ----
    case 'a9_swing': {
      const c = pick(0xff8fc8, 0x7fc8ff, 0xffd04a);
      for (const s of [-1, 1]) for (const z of [-1, 1]) A(cyl(0.05, 0.05, 2.3, 6), WHITE, [s * 0.9, 1.1, z * 0.3], [z * -0.26, 0, 0]);
      A(cyl(0.05, 0.05, 2.0, 6), c, [0, 2.2, 0], [0, 0, Math.PI / 2]);
      for (const s of [-1, 1]) A(cyl(0.012, 0.012, 1.4, 4), 0xe8e8f0, [s * 0.35, 1.5, 0.1], [0.14, 0, 0]);
      A(box(0.9, 0.08, 0.35), c, [0, 0.8, 0.2]); puffs(A, 0, 0.95, 0.2, 0.3);
      puffs(A, -0.9, 0.1, 0.3, 0.4); puffs(A, 0.9, 0.1, -0.3, 0.4);
      break;
    }
    case 'a9_bridge': {
      const cols = pick(RAINBOW, [0xffb8d8, 0xffd8b0, 0xfff0b0, 0xc8f0c8, 0xb8e0ff, 0xd8c8ff], [0xff5c5c, 0xff7a4a, 0xff9a3a, 0xffbc3a, 0xffd84a, 0xfff0a0]);
      cols.forEach((c, k) => A(torus(1.5 - k * 0.11, 0.065, Math.PI, 28), c, [0, 0.1, (k - 2.5) * 0.02]));
      puffs(A, -1.3, 0.3, 0, 0.6); puffs(A, 1.3, 0.3, 0, 0.6);
      break;
    }
    case 'a9_palace': {
      const c = pick(0x7fb8ff, 0xff9fd0, 0xffc83a);
      puffs(A, 0, 0.3, 0, 0.95); puffs(A, 0.3, 0.25, 0.6, 0.6);
      const tw = (x: number, z: number, h: number, r: number) => { A(cyl(r, r * 1.08, h, 14), grad(0xd0dcf8, WHITE, -h / 2, h / 2), [x, 0.7 + h / 2, z]); A(cone(r * 1.3, r * 2.4, 14), grad(mix(c, 0x000000, 0.15), mix(c, WHITE, 0.35), -r, r), [x, 0.7 + h + r * 1.2, z]); A(sph(0.07, 8, 6), GOLD, [x, 0.7 + h + r * 2.45, z]); A(box(r * 0.5, r * 0.8, 0.05), GLOW, [x, 0.7 + h * 0.65, z + r]); };
      tw(0, 0, 1.5, 0.36); tw(-0.65, 0.15, 0.9, 0.26); tw(0.65, 0.15, 0.9, 0.26);
      A(box(1.0, 0.6, 0.5), WHITE, [0, 1.0, 0.2]); A(cyl(0.16, 0.16, 0.42, 10), c, [0, 0.9, 0.46], [Math.PI / 2, 0, 0], [1, 0.2, 1.3]);
      break;
    }
    case 'a9_balloon': {
      const [c1, c2] = pick([0xff5c8a, 0xffe0f0], [0x3fa2ff, 0xbfeaff], [0xff9a2e, 0xffe46a]);
      A(box(0.5, 0.4, 0.5), grad(0x8a5a2a, 0xc89a5a, -0.2, 0.2), [0, 1.3, 0]); A(torus(0.36, 0.04, Math.PI * 2, 4), DARKWOOD, [0, 1.5, 0], [Math.PI / 2, Math.PI / 4, 0]);
      for (const [x, z] of [[-0.23, -0.23], [0.23, -0.23], [-0.23, 0.23], [0.23, 0.23]]) A(cyl(0.012, 0.012, 0.75, 4), 0xeeeeee, [x * 1.3, 1.85, z * 1.3], [z * -0.6, 0, x * 0.6]);
      A(sph(0.95, 18, 14), (_y, x) => (Math.sin(x * 9) > 0 ? c1 : c2), [0, 3.0, 0], [0, 0, 0], [1, 1.15, 1]);
      A(cyl(0.3, 0.42, 0.25, 12), c1, [0, 2.0, 0]);
      A(cyl(0.01, 0.01, 1.3, 4), 0xcccccc, [0, 0.65, 0]); puffs(A, 0, 0.05, 0, 0.35);
      break;
    }

    // ---- Aurora Lake ----
    case 'a10_boat': {
      const c = pick(0xe8404a, 0x35c9c0, 0xfff6e0);
      A(sph(0.6, 14, 10), (y) => (y > 0.02 ? mix(c, 0x000000, 0.3) : y > -0.1 ? WHITE : c), [0, 0.38, 0], [Math.PI, 0, 0], [0.75, 0.6, 1.9]);
      A(box(0.7, 0.05, 0.22), WOOD, [0, 0.36, 0.1]); A(box(0.6, 0.05, 0.22), WOOD, [0, 0.36, -0.5]);
      if (d === 2) { A(cyl(0.035, 0.035, 1.8, 6), WOOD, [0, 1.2, 0.2]); A(cone(0.7, 1.4, 3), 0xfff6e0, [0, 1.35, -0.18], [0, Math.PI / 2, 0], [1, 1, 0.06]); A(cone(0.14, 0.2, 3), 0xff5c8a, [0, 2.15, 0.1], [Math.PI / 2, 0, 0], [0.1, 1, 1]); }
      else for (const s of [-1, 1]) { A(cyl(0.025, 0.025, 1.3, 5), WOOD, [s * 0.7, 0.45, 0], [0, 0, s * 1.1]); A(box(0.3, 0.03, 0.14), WOOD, [s * 1.25, 0.18, 0], [0, 0, s * 1.1 - Math.PI / 2]); }
      break;
    }
    case 'a10_lanterns': {
      const c = pick(0xffd04a, 0x4ae0d0, 0xff8fc8);
      for (const s of [-1, 1]) A(cyl(0.05, 0.07, 1.9, 6), grad(DARKWOOD, WOOD, -0.95, 0.95), [s * 1.2, 0.95, 0]);
      for (let k = 0; k < 5; k++) {
        const x = -0.96 + k * 0.48, y = 1.75 - Math.sin(((k + 0.5) / 5) * Math.PI) * 0.35;
        A(cyl(0.008, 0.008, 0.16, 4), 0x444444, [x, y + 0.2, 0]);
        A(sph(0.16, 12, 8), grad(mix(c, 0xff7a2e, 0.3), mix(c, WHITE, 0.6), -0.16, 0.16), [x, y, 0], [0, 0, 0], [1, 1.15, 1]);
        A(cyl(0.07, 0.07, 0.04, 8), 0x5a3a22, [x, y + 0.18, 0]); A(cyl(0.07, 0.07, 0.04, 8), 0x5a3a22, [x, y - 0.18, 0]);
      }
      A(torus(1.6, 0.012, Math.PI * 0.42, 12), 0x444444, [0, 3.05, 0], [0, 0, Math.PI * 1.29]);
      break;
    }
    case 'a10_cabin': {
      const c = pick(0x3f8a5a, 0xc8406a, 0x4a8fd8);
      A(box(1.5, 0.15, 1.3), WOOD, [0, 0.08, 0]);
      A(cyl(1.0, 1.0, 1.3, 3), grad(mix(c, 0x000000, 0.3), c, -0.5, 1), [0, 0.65, 0], [Math.PI / 2, 0, Math.PI / 2], [1, 1, 1.3]);
      A(box(0.5, 0.9, 1.34), grad(0x8a5a2a, 0xd9a05a, -0.45, 0.45), [0, 0.55, 0]);
      A(box(0.3, 0.55, 0.05), 0x5a3a22, [0, 0.4, 0.68]); A(cyl(0.12, 0.12, 0.05, 12), GLOW, [0, 0.98, 0.68], [Math.PI / 2, 0, 0]);
      A(box(0.2, 0.5, 0.2), 0x8a6a6a, [0.35, 1.5, -0.3]);
      pine(A, -1.1, -0.2, 0.8, 0x2f7a5a, false);
      break;
    }
    case 'a10_dock': {
      A(box(1.1, 0.08, 2.4), grad(DARKWOOD, WOOD, -0.04, 0.04), [0, 0.3, 0.3]);
      for (let k = 0; k < 6; k++) A(box(1.12, 0.09, 0.03), DARKWOOD, [0, 0.3, -0.75 + k * 0.42]);
      for (const s of [-1, 1]) for (const z of [-0.7, 0.4, 1.4]) { A(cyl(0.07, 0.07, 0.8, 6), DARKWOOD, [s * 0.55, 0.3, z]); A(sph(0.08, 6, 4), WOOD, [s * 0.55, 0.72, z]); }
      if (d === 0) { A(cyl(0.035, 0.035, 1.2, 6), 0x3a3f4c, [0.55, 1.3, 1.4]); A(sph(0.15, 10, 8), GLOW, [0.55, 1.95, 1.4]); A(cone(0.2, 0.14, 6), 0x3a3f4c, [0.55, 2.12, 1.4]); }
      if (d === 1) { A(cyl(0.015, 0.02, 1.5, 4), WOOD, [-0.3, 0.95, 1.3], [0.6, 0, 0]); A(cyl(0.005, 0.005, 0.9, 3), WHITE, [-0.3, 1.1, 1.72]); A(sph(0.05, 6, 4), 0xff5c5c, [-0.3, 0.65, 1.72]); A(cyl(0.16, 0.13, 0.22, 10), 0x4a9fd8, [0.25, 0.45, 1.0]); }
      if (d === 2) { A(box(0.8, 0.06, 0.3), 0xc8406a, [0, 0.6, 0]); A(box(0.8, 0.35, 0.05), 0xc8406a, [0, 0.83, -0.14]); for (const s of [-1, 1]) A(box(0.05, 0.28, 0.28), DARKWOOD, [s * 0.35, 0.45, 0]); }
      break;
    }

    // ---- Crown Summit ----
    case 'a11_statue': {
      const c = pick(0xffd23f, 0xf4f0f8, 0xa8e4ff);
      A(cyl(0.7, 0.8, 0.25, 8), grad(0xb8a8d0, 0xf0e8ff, -0.12, 0.12), [0, 0.12, 0]); A(cyl(0.55, 0.6, 0.5, 8), grad(0xc8b8e0, 0xf8f0ff, -0.25, 0.25), [0, 0.5, 0]);
      smallCat(A, c, [0, 0.75, 0], 0, 1.1);
      A(cyl(0.2, 0.18, 0.12, 10), GOLD, [0, 1.92, 0.1]); for (let k = 0; k < 5; k++) A(cone(0.05, 0.14, 4), GOLD, [Math.sin(k * 1.257) * 0.17, 2.04, 0.1 + Math.cos(k * 1.257) * 0.17]);
      break;
    }
    case 'a11_throne': {
      const c = pick(0x7a3fd0, 0xc8243a, 0x2f5fd0);
      A(box(1.8, 0.2, 1.4), grad(0xd8c8a0, 0xfff6e0, -0.1, 0.1), [0, 0.1, 0]); A(box(1.4, 0.2, 1.1), 0xfff6e0, [0, 0.3, -0.1]);
      A(box(0.9, 0.5, 0.8), GOLD, [0, 0.65, -0.15]); A(box(0.76, 0.14, 0.7), grad(mix(c, 0x000000, 0.2), c, -0.07, 0.07), [0, 0.95, -0.1]);
      A(box(0.9, 1.6, 0.16), grad(mix(c, 0x000000, 0.3), c, -0.8, 0.8), [0, 1.7, -0.5]); A(box(1.0, 1.7, 0.1), GOLD, [0, 1.7, -0.56]);
      A(cone(0.5, 0.5, 4), GOLD, [0, 2.75, -0.53], [0, Math.PI / 4, 0], [1, 1, 0.3]); A(gem(0.14), 0xff5c8a, [0, 2.45, -0.4]);
      for (const s of [-1, 1]) { A(box(0.14, 0.4, 0.8), GOLD, [s * 0.5, 1.05, -0.15]); A(sph(0.1, 8, 6), GOLD, [s * 0.5, 1.3, 0.25]); }
      break;
    }
    case 'a11_gate': {
      const c = pick(0x8a5ae8, 0xff7fb0, 0x5aa8ff);
      for (const s of [-1, 1]) {
        A(box(0.5, 2.4, 0.5), grad(0xd8c8e8, WHITE, -1.2, 1.2), [s * 1.2, 1.2, 0]); A(box(0.62, 0.14, 0.62), GOLD, [s * 1.2, 2.45, 0]); A(box(0.62, 0.14, 0.62), GOLD, [s * 1.2, 0.07, 0]);
        A(sph(0.2), GOLD, [s * 1.2, 2.7, 0]);
        A(box(0.34, 1.1, 0.04), grad(mix(c, 0x000000, 0.25), c, -0.55, 0.55), [s * 1.2, 1.5, 0.28]); A(cone(0.17, 0.2, 3), c, [s * 1.2, 0.86, 0.28], [Math.PI, 0, 0], [1, 1, 0.12]);
      }
      A(torus(1.2, 0.14, Math.PI, 18), GOLD, [0, 2.45, 0]);
      A(cyl(0.2, 0.18, 0.14, 10), GOLD, [0, 3.72, 0]); for (let k = 0; k < 5; k++) { A(cone(0.05, 0.16, 4), GOLD, [Math.sin(k * 1.257) * 0.17, 3.86, Math.cos(k * 1.257) * 0.17]); }
      A(gem(0.1), c, [0, 3.72, 0.2]);
      break;
    }
    case 'a11_beacon': {
      const c = pick(0xffe46a, 0xbfeaff, 0xffa8d0);
      A(cyl(0.5, 0.65, 0.35, 8), grad(0xb8a8d0, 0xf0e8ff, -0.17, 0.17), [0, 0.17, 0]);
      A(cyl(0.18, 0.32, 2.6, 10), grad(0xc8b8e0, WHITE, -1.3, 1.3), [0, 1.6, 0]);
      for (const y of [1.0, 1.8, 2.6]) A(torus(0.3 - (y - 1) * 0.045, 0.045, Math.PI * 2, 14), GOLD, [0, y, 0], [Math.PI / 2, 0, 0]);
      A(cyl(0.42, 0.2, 0.2, 10), GOLD, [0, 3.0, 0]);
      A(sph(0.36, 14, 10), grad(c, WHITE, -0.36, 0.3), [0, 3.45, 0]);
      for (let k = 0; k < 4; k++) A(cone(0.06, 0.3, 4), GOLD, [Math.sin(k * 1.57) * 0.4, 3.2, Math.cos(k * 1.57) * 0.4]);
      break;
    }
  }
  return merge(P);
}

/** Where an item puts particles: [x, y, z, kind] in item space. Kinds: 0 water, 1 ember, 2 smoke, 3 sparkle, 4 glow. */
const EMIT: Record<string, [number, number, number, number][]> = {
  fountain: [[0, 1.75, 0, 0]], tower: [[0, 6.6, 0, 3]],
  lamps: [[-1.3, 1.12, -0.6, 4], [1.3, 1.12, -0.6, 4], [-1.3, 1.12, 1.0, 4], [1.3, 1.12, 1.0, 4]],
  a1_spire: [[0, 2.5, 0, 3]], a2_nest: [[0, 0.9, 0, 3]], a4_lodge: [[0.55, 2.2, -0.2, 2]],
  a5_volcano: [[0, 2.2, 0, 1], [0, 2.2, 0, 2]], a5_brazier: [[-0.7, 1.6, 0, 1], [0.7, 1.6, 0, 1]],
  a6_cart: [[0, 1.1, 0, 3]], a7_ball: [[0, 1.75, 0, 3], [0, 1.75, 0, 3]], a8_trophy: [[0, 1.6, 0, 3]],
  a9_palace: [[0, 3.2, 0, 3]], a10_lanterns: [[-0.96, 1.6, 0, 4], [-0.48, 1.45, 0, 4], [0, 1.4, 0, 4], [0.48, 1.45, 0, 4], [0.96, 1.6, 0, 4]],
  a10_dock: [[0.55, 1.95, 1.4, 4]], a11_beacon: [[0, 3.45, 0, 4], [0, 3.6, 0, 3]], a11_statue: [[0, 2.1, 0, 3]],
};

// ---------- islands ----------

const THEME: { top: number; side: number; flag: number }[] = [
  { top: 0x7fd36a, side: 0x9a7050, flag: 0xff5c8a }, { top: 0xeaf4ff, side: 0x9fb8d8, flag: 0x4ad0ff }, { top: 0x5fbf5a, side: 0x7a5a3a, flag: 0x4fd16b },
  { top: 0xf5dfa0, side: 0xd9b878, flag: 0xff8f6a }, { top: 0xf8fbff, side: 0xa8b8c8, flag: 0x3f8fe8 }, { top: 0x5a4650, side: 0x2e2430, flag: 0xff7a1a },
  { top: 0xd98a55, side: 0xa85a3a, flag: 0xffc83a }, { top: 0x6a4fb0, side: 0x3a2a6a, flag: 0xff7fc8 }, { top: 0x58c060, side: 0x7a5a3a, flag: 0xffffff },
  { top: 0xffffff, side: 0xdce6ff, flag: 0x9fc8ff }, { top: 0x2f8a80, side: 0x1f4a58, flag: 0x7af0d0 }, { top: 0xf2e6c8, side: 0xc8a868, flag: 0xa56bff },
];
const FLAG_AT: V3 = [-3.3, 2.2, 2.3]; // island-local top of the flag pole

function islandGeometry(k: number): BufferGeometry {
  const P: BufferGeometry[] = [];
  const A: Add = (g, color, p = [0, 0, 0], r = [0, 0, 0], s = 1) => { P.push(part(g, toned(color), p, r, s)); };
  const RAW: Add = (g, color, p = [0, 0, 0], r = [0, 0, 0], s = 1) => { P.push(part(g, color, p, r, s)); }; // light sources keep their full brightness
  const th = THEME[k];
  const rad = k === 0 ? R0 : R;
  const edge = (y: number, x: number) => mix(th.top, mix(th.top, 0x000000, 0.12), Math.abs(Math.sin(x * 1.7 + y * 3)) * 0.6);
  A(cyl(rad, rad * 0.985, 0.5, 40), edge, [0, -0.25, 0]);
  const rockC = grad(mix(th.side, 0x0a0620, 0.75), mix(th.side, 0x2a1a4a, 0.2), -1.4, 1.4);
  A(facet(cyl(rad * 0.985, rad * 0.5, 2.2, 11)), rockC, [0, -1.6, 0]);
  A(facet(cone(rad * 0.5, rad, 9)), rockC, [0, -2.7 - rad * 0.5, 0], [Math.PI, 0.4, 0]);
  for (let i = 0; i < 8; i++) {
    const a = i * 0.83 + k, fr = 0.55 + (i % 3) * 0.14, h = 1.1 + (i % 3) * 0.8;
    RAW(cone(0.24 + (i % 2) * 0.14, h, 5), grad(mix(th.flag, 0xffffff, 0.2), mix(th.flag, 0xffffff, 0.75), -h / 2, h / 2), [Math.sin(a) * rad * fr, -0.5 - ((0.985 - fr) / 0.485) * 2.2 - h / 2 + 0.25, Math.cos(a) * rad * fr], [Math.PI, a, 0.12]);
  }
  RAW(torus(rad + 0.22, 0.06, Math.PI * 2, 48), mix(th.flag, 0xffffff, 0.45), [0, -0.5, 0], [Math.PI / 2, 0, 0]);
  // drifting shards, kept behind the island so they never block the close-up camera
  shard(A, [rad * 0.95, 2.6 + (k % 3) * 0.6, -rad * 0.8], 0.9 + (k % 2) * 0.4, th.flag);
  shard(A, [-rad * 1.05, -1.8, -rad * 0.6], 0.7, th.flag);
  if (k > 0) {
    // bridge of light towards the citadel (local -z), entered through a rune gate
    const L = RING - R0 - R + 0.9, zc = -(R + L / 2 - 0.45), beam = mix(th.flag, 0xffffff, 0.5), gz = -R + 0.45;
    RAW(new BoxGeometry(0.9, 0.05, L, 2, 1, 1), (_y, x) => (Math.abs(x) > 0.36 ? th.flag : mix(beam, 0xffffff, 0.7)), [0, -0.02, zc]);
    for (let i = 0; i <= 3; i++) {
      const z = zc - L / 2 + 0.5 + (i / 3) * (L - 1);
      A(torus(0.8, 0.04, Math.PI, 16), GOLD, [0, -0.05, z]);
      for (const sd of [-1, 1]) RAW(gem(0.12), beam, [sd * 0.8, 0, z], [0, 0, 0], [1, 2, 1]);
    }
    for (const sd of [-1, 1]) { A(box(0.4, 2.0, 0.4), grad(SHADE, MOON, -1, 1), [sd * 1.05, 1.0, gz]); A(cone(0.3, 0.7, 4), ROOF, [sd * 1.05, 2.35, gz], [0, Math.PI / 4, 0]); }
    A(torus(1.05, 0.12, Math.PI, 14), MOON, [0, 1.7, gz]); RAW(gem(0.2), RUNE, [0, 3.15, gz], [0, 0, 0], [1, 1.6, 1]);
    // the island's ward crystal and its rune ring
    RAW(gem(0.32), beam, [0, 4.7, -0.3], [0, 0.5, 0], [1, 1.7, 1]); RAW(torus(0.75, 0.035, Math.PI * 2, 28), th.flag, [0, 4.7, -0.3], [Math.PI / 2 + 0.3, 0, 0.2]);
    A(cyl(0.04, 0.05, FLAG_AT[1] + 0.3, 6), 0xe8e0f0, [FLAG_AT[0], (FLAG_AT[1] + 0.3) / 2, FLAG_AT[2]]); A(sph(0.07, 6, 4), GOLD, [FLAG_AT[0], FLAG_AT[1] + 0.32, FLAG_AT[2]]);
  }
  switch (k) {
    case 0: {
      const stone = grad(SHADE, MOON, -1.4, 1.4), dark = 0x1a1238;
      A(box(1.4, 0.05, 5.4), 0x3a3278, [0, 0.02, 2.5]);
      for (let i = 0; i < 9; i++) RAW(cyl(0.16, 0.16, 0.06, 6), RUNE, [(i % 2 ? 0.3 : -0.3), 0.04, 0.4 + i * 0.55], [0, i, 0]);
      // great hall with a portal of light
      A(box(4.6, 2.8, 2.6), stone, [0, 1.4, -1.6]); A(box(4.9, 0.16, 2.9), GOLD, [0, 2.86, -1.6]);
      A(box(1.2, 1.6, 0.1), dark, [0, 0.8, -0.28]); A(cyl(0.6, 0.6, 0.1, 20), dark, [0, 1.6, -0.28], [Math.PI / 2, 0, 0]);
      RAW(box(1.0, 1.5, 0.1), grad(0x2a2a9a, RUNE, -0.75, 0.75), [0, 0.75, -0.24]); RAW(cyl(0.5, 0.5, 0.1, 20), RUNE, [0, 1.5, -0.24], [Math.PI / 2, 0, 0]);
      for (const x of [-1.6, 1.6]) { A(box(0.4, 1.1, 0.08), GLOW, [x, 1.6, -0.28]); A(cone(0.28, 0.5, 4), GLOW, [x, 2.38, -0.3], [0, Math.PI / 4, 0], [1, 1, 0.15]); }
      for (const x of [-1.1, 1.1]) A(cone(0.18, 1.0, 6), GOLD, [x, 3.4, -0.5]);
      // spires, flying arches, rune rings
      for (const x of [-2.6, 2.6]) { spire(A, x, -1.6, 0.8, 4.6, 2.8); A(cyl(0.03, 0.03, 1.2, 5), MOON, [x, 8.4, -1.6]); A(torus(1.3, 0.09, Math.PI, 14), MOON, [x / 2, 4.3, -1.9]); }
      for (const x of [-1.5, 1.5]) spire(A, x, -3.4, 0.5, 5.6, 2.2, 0x5a2ac8);
      spire(A, 0, -2.1, 1.0, 3.6, 3.6, ROOF, 2.8);
      A(cyl(0.03, 0.03, 1.3, 5), MOON, [0, 10.9, -2.1]);
      RAW(torus(1.9, 0.05, Math.PI * 2, 40), RUNE, [0, 7.6, -2.1], [Math.PI / 2 + 0.22, 0, 0.1]);
      RAW(torus(1.45, 0.04, Math.PI * 2, 32), GLOW, [0, 8.9, -2.1], [Math.PI / 2 - 0.25, 0, -0.15]);
      for (const [x, z, s] of [[-5.4, -3.2, 1.2], [5.6, 0.4, 0.9], [-5.9, 2.2, 1.0], [5.2, -3.8, 1.1], [-1.5, -5.6, 1.1], [1.9, -5.8, 0.9]]) tree(A, x, z, s);
      for (let i = 0; i < 14; i++) { const a = i * 0.9 + 0.3, r = 6.3 + (i % 3) * 0.3; if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue; flower(A, Math.sin(a) * r, Math.cos(a) * r, [0xff7fb8, 0xfff36b, 0xb08cff, WHITE][i % 4], 0.3); }
      for (const [x, z] of [[-1.2, 5.6], [1.2, 5.6], [-4.6, 4.2], [4.7, 4.0]]) A(sph(0.4), grad(0x3a9a4a, 0x8be06b, -0.3, 0.4), [x, 0.2, z], [0, 0, 0], [1.2, 0.8, 1]);
      break;
    }
    case 1:
      spire(A, 0, -3.0, 0.8, 3.6, 2.6, 0x2a7ad8);
      for (const [x, z, s] of [[-3.4, -1.4, 1], [3.5, -1.0, 0.8], [3.2, 2.4, 0.7]]) pine(A, x, z, s, 0x3a8f7a, true);
      for (const [x, z, s] of [[-3.6, 0.8, 1], [2.6, 3.2, 0.7], [-1.0, 3.8, 0.6]]) A(cone(0.25 * s, 1.0 * s, 6), grad(0x7fc8ff, WHITE, -0.5 * s, 0.5 * s), [x, 0.5 * s, z], [0.1, 0, 0.15]);
      puffs(A, 2.9, 0, -2.6, 0.5); puffs(A, -2.4, 0, 3.2, 0.4);
      break;
    case 2:
      tree(A, -3.2, -1.8, 1.3, 0x4fae5a); tree(A, 3.3, -2.0, 1.1, 0x6fbf4f); tree(A, 0.2, -3.6, 1.5, 0x3f9a50);
      for (let i = 0; i < 12; i++) { const a = i * 1.1 + 0.4, r = 3.5 + (i % 3) * 0.25; flower(A, Math.sin(a) * r, Math.cos(a) * r, [0xff5c7a, 0xffd84a, 0xb08cff][i % 3], 0.35); }
      for (const [x, z] of [[3.6, 1.0], [-3.7, 1.4], [1.2, 3.7]]) A(sph(0.45), grad(0x2f8f3f, 0x7fd060, -0.3, 0.4), [x, 0.2, z], [0, 0, 0], [1.2, 0.8, 1]);
      A(torus(0.5, 0.1, Math.PI * 1.5, 14), 0x3f9a45, [-0.3, 0.1, 3.4], [Math.PI / 2, 0, 0]);
      break;
    case 3:
      A(cyl(0.04, 0.04, 1.6, 6), WHITE, [3.3, 0.8, 0.6]); A(cone(1.0, 0.5, 10), (_y, x) => (Math.sin(x * 6) > 0 ? 0xff5c7a : WHITE), [3.3, 1.7, 0.6]);
      A(box(0.6, 0.04, 1.1), 0x4ad0ff, [3.3, 0.03, 1.3], [0, 0.3, 0]);
      for (let i = 0; i < 9; i++) { const a = i * 1.5, r = 3.3 + (i % 3) * 0.3; A(sph(0.12, 8, 6), [0xffb8d0, 0xfff0e0, 0xffd0a8][i % 3], [Math.sin(a) * r, 0.05, Math.cos(a) * r], [0, a, 0], [1.2, 0.5, 1]); }
      for (let i = 0; i < 5; i++) A(cone(0.09, 0.3, 4), 0xff8f6a, [-3.4 + Math.cos(i * 1.257) * 0.2, 0.04, -0.6 + Math.sin(i * 1.257) * 0.2], [Math.PI / 2, 0, -i * 1.257 + Math.PI / 2], [1, 1, 0.4]);
      rock(A, -3.0, -2.4, 1.0, 0xb8a890); rock(A, 0.4, -3.8, 0.7, 0xb8a890);
      A(sph(0.3), (y, x) => (Math.sin(x * 10 + y * 3) > 0 ? 0xff5c8a : 0xffe46a), [-2.9, 0.3, 2.9]);
      break;
    case 4:
      A(cone(2.3, 4.2, 7), grad(0x8a96b0, 0xe8eef8, -2.1, 0.8), [0.3, 2.1, -2.9]); A(cone(1.0, 1.8, 7), WHITE, [0.3, 3.32, -2.9]);
      A(cone(1.5, 2.6, 7), grad(0x8a96b0, WHITE, -1.3, 0.9), [-2.3, 1.3, -2.6]);
      for (const [x, z, s] of [[3.5, -0.4, 1], [-3.7, 0.2, 0.9], [3.0, 2.6, 0.7], [-2.6, 3.0, 0.6]]) pine(A, x, z, s, 0x2f7f5a, true);
      for (let i = 0; i < 4; i++) { A(cyl(0.02, 0.02, 0.7, 4), 0x3a3f4c, [-0.9 + i * 0.6, 0.35, 3.6 - Math.abs(i - 1.5) * 0.2]); A(cone(0.12, 0.2, 3), i % 2 ? 0xe8404a : 0x3f8fe8, [-0.78 + i * 0.6, 0.6, 3.6 - Math.abs(i - 1.5) * 0.2], [0, 0, -Math.PI / 2], [1, 1, 0.1]); }
      break;
    case 5:
      for (const [x, z, s] of [[-3.4, -1.6, 1.3], [3.5, -1.2, 1.0], [0.3, -3.7, 1.5], [3.2, 2.5, 0.7], [-3.0, 2.8, 0.8]]) A(cone(0.5 * s, 2.0 * s, 5), grad(0x2a2028, 0x7a5a60, -s, s), [x, 1.0 * s, z], [0.1 * s, x, 0.12]);
      for (const [x, z, r, l] of [[0, 0.2, 0.4, 3.2], [-1.2, 2.2, 1.9, 2.0], [1.6, -2.0, 2.4, 2.2], [2.4, 1.5, 0.9, 1.6]]) A(box(0.16, 0.03, l), 0xff7a1a, [x, 0.012, z], [0, r, 0]);
      for (let i = 0; i < 6; i++) A(gem(0.12), 0xff9a3a, [Math.sin(i * 1.3) * 3.7, 0.1, Math.cos(i * 1.3) * 3.7]);
      break;
    case 6:
      for (const [x, z, s] of [[-3.0, -2.2, 1.2], [3.2, -2.0, 0.9], [0.2, -3.6, 1.0]]) {
        A(cyl(0.9 * s, 1.1 * s, 1.2 * s, 9), (y) => (Math.sin(y * 9) > 0.2 ? 0xc8553a : 0xe07850), [x, 0.6 * s, z]);
        A(cyl(0.7 * s, 0.9 * s, 0.7 * s, 9), (y) => (Math.sin(y * 9) > 0.2 ? 0xe07850 : 0xf2a070), [x, 1.5 * s, z]);
      }
      for (const [x, z] of [[3.6, 1.2], [-3.7, 1.0]]) { A(cyl(0.14, 0.16, 1.0, 8), grad(0x2f8a4a, 0x7fd070, -0.5, 0.5), [x, 0.5, z]); A(sph(0.14, 8, 6), 0x7fd070, [x, 1.0, z]); }
      rock(A, 2.6, 3.0, 0.8, 0xc8704a); rock(A, -2.4, 3.2, 0.6, 0xc8704a);
      for (const s of [-1, 1]) A(box(0.05, 0.05, 2.6), 0x6a6a7a, [s * 0.25 - 0.4, 0.04, 2.9], [0, 1.2, 0]);
      break;
    case 7:
      A(cyl(3.9, 3.9, 0.06, 40), (y, x) => mix(0x7a5fc8, 0x9a7fe8, Math.abs(Math.sin(x * 2 + y))), [0, 0.03, 0]);
      for (let i = 0; i < 7; i++) {
        const a = -1.5 + i * 0.5, x = Math.sin(a) * 3.7, z = -Math.cos(a) * 3.7;
        A(cyl(0.2, 0.24, 2.6, 12), grad(0xd8c8f8, WHITE, -1.3, 1.3), [x, 1.3, z]); A(cyl(0.34, 0.22, 0.2, 12), GOLD, [x, 2.7, z]); A(cyl(0.3, 0.36, 0.16, 12), GOLD, [x, 0.08, z]);
        if (i < 6) { const a2 = a + 0.25; A(sph(0.3, 10, 8), 0xc8243a, [Math.sin(a2) * 3.7, 2.55, -Math.cos(a2) * 3.7], [0, -a2, 0], [3.0, 0.9, 0.5]); }
      }
      for (let i = 0; i < 6; i++) A(gem(0.1), 0xffe46a, [Math.sin(i * 1.05 + 2.4) * 3.6, 0.15, Math.cos(i * 1.05 + 2.4) * 3.6]);
      break;
    case 8:
      for (let i = 0; i < 6; i++) A(box(1.1, 0.02, 6.2), i % 2 ? 0x58c060 : 0x6ad070, [-2.75 + i * 1.1, 0.012, 0]);
      A(torus(1.0, 0.04, Math.PI * 2, 28), WHITE, [0, 0.03, 0], [Math.PI / 2, 0, 0]); A(box(6.4, 0.03, 0.07), WHITE, [0, 0.03, 0]);
      for (const s of [-1, 1]) { A(box(0.07, 0.03, 6.2), WHITE, [s * 3.2, 0.03, 0]); A(box(6.4, 0.03, 0.07), WHITE, [0, 0.03, s * 3.1]); }
      for (const [x, z] of [[-3.2, -3.1], [3.2, -3.1], [3.2, 3.1]]) { A(cyl(0.025, 0.025, 0.9, 4), WHITE, [x, 0.45, z]); A(cone(0.15, 0.24, 3), 0xffd23f, [x + 0.12, 0.8, z], [0, 0, -Math.PI / 2], [1, 1, 0.1]); }
      break;
    case 9:
      for (let i = 0; i < 11; i++) { const a = i * 0.571; puffs(A, Math.sin(a) * 4.1, -0.25, Math.cos(a) * 4.1, 0.75 + (i % 3) * 0.12, i % 4 === 0 ? 0xffe8f4 : WHITE); }
      for (const [x, z] of [[-3.2, -2.0], [3.2, -2.0]]) { A(cyl(0.22, 0.26, 2.2, 12), grad(0xd0dcf8, WHITE, -1.1, 1.1), [x, 1.1, z]); A(sph(0.3), GOLD, [x, 2.4, z]); }
      puffs(A, 0, 0.2, -3.4, 0.9);
      break;
    case 10:
      for (const [x, z, s] of [[-3.3, -1.8, 1.2], [3.4, -1.4, 1.0], [0.4, -3.7, 1.4], [-1.8, -3.2, 0.8], [3.0, 2.6, 0.7]]) pine(A, x, z, s, 0x1f6a5a, false);
      for (let i = 0; i < 7; i++) { const a = i * 1.7 + 1, r = 3.4 + (i % 2) * 0.4, x = Math.sin(a) * r, z = Math.cos(a) * r; A(cyl(0.04, 0.05, 0.25, 6), 0xe8f0e0, [x, 0.12, z]); A(dome(0.16, 10), [0x7af0d0, 0xb08cff, 0xff8fd0][i % 3], [x, 0.24, z]); }
      rock(A, -3.4, 1.4, 0.8, 0x5a7a88); rock(A, 2.2, 3.4, 0.6, 0x5a7a88);
      break;
    case 11:
      A(cyl(3.6, 3.8, 0.14, 40), grad(0xe8d8b0, 0xfffaf0, -0.07, 0.07), [0, 0.07, 0]); A(cyl(2.9, 3.0, 0.14, 40), 0xfffaf0, [0, 0.2, 0]);
      A(box(1.0, 0.03, 3.4), 0xc8243a, [0, 0.29, 1.6]);
      for (let i = 0; i < 6; i++) {
        const a = -1.25 + i * 0.5, x = Math.sin(a) * 3.3, z = -Math.cos(a) * 3.3;
        A(cyl(0.2, 0.24, 2.8, 12), grad(0xe8d8f0, WHITE, -1.4, 1.4), [x, 1.6, z]); A(cyl(0.34, 0.22, 0.2, 12), GOLD, [x, 3.1, z]); A(gem(0.2), [0xff5c8a, 0x4ad0ff, 0xa56bff][i % 3], [x, 3.5, z], [0, 0, 0], [1, 1.4, 1]);
      }
      for (const s of [-1, 1]) A(sph(0.4), grad(0x3a9a4a, 0x8be06b, -0.3, 0.4), [s * 3.3, 0.3, 2.0]);
      break;
  }
  return merge(P);
}

function cloudGeometry(s: number): BufferGeometry {
  const P: BufferGeometry[] = [];
  puffs((g, c, p, r, sc) => { P.push(part(g, c, p, r, sc)); }, 0, 0, 0, s, 0xc88ab0);
  return merge(P);
}

// ---------- the view ----------

const MAXP = 240;
const PCOL: V3[] = [[0.75, 1.0, 1.35], [2.4, 0.95, 0.2], [0.72, 0.72, 0.78], [2.0, 1.6, 0.6], [2.2, 1.7, 0.75], [0.6, 1.5, 2.2]]; // last: drifting motes
const CAT_SCALE = 0.85;
const LOW_CATS = 12;

interface Resident {
  def: CatDef; acc: string; mesh: Mesh; ink: Mesh; sit: BufferGeometry; walk: BufferGeometry; sitH?: BufferGeometry; walkH?: BufferGeometry;
  x: number; z: number; rot: number; area: number; walking: boolean; wait: number; phase: number;
  path: Float32Array; n: number; i: number;
}

export class CastleView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.5, 400);
  orbit = true;

  private mat = toon();
  private pale = toon({ color: 0x5a528e, transparent: true, opacity: 0.5, vertexColors: false });
  private ink = inkMaterial(); // every outline; hidden as one on Low
  private inkN = 0; // islands outlined so far (one per frame, so loading never stalls)
  private inkCache = new Map<string, BufferGeometry>();
  private shafts: InstancedMesh;
  private islands: Mesh[] = [];
  private covers: Mesh[] = [];
  private flags: Mesh[] = [];
  private flagGeo = new PlaneGeometry(0.95, 0.55, 8, 2);
  private flagBase: Float32Array;
  private water: Mesh;
  private waterBase: Float32Array;
  private foam: InstancedMesh;
  private clouds = new Group();
  private items = new Map<string, Mesh>();
  private cache = new Map<string, BufferGeometry>();
  private state: { castle: Record<string, number>; cats: Record<string, string>; areas: number } = { castle: {}, cats: {}, areas: 1 };
  private previewing: { id: string; d: number } | null = null;
  private residents = new Map<string, Resident>();
  private hi = true;

  // particles
  private sparks: InstancedMesh;
  private emitters: number[] = []; // x, y, z, kind
  private pp = new Float32Array(MAXP * 8); // x y z vx vy vz life max
  private pk = new Uint8Array(MAXP);
  private pn = 0;
  private spawnAcc = 0;

  // camera
  private mode: 'all' | 'area' | 'item' | 'cat' = 'all';
  private focusK = 0;
  private focusId: string | null = null;
  private catId: string | null = null;
  private look = new Vector3(0, 1.5, 0);
  private az = 0;
  private dist = 52;
  private height = 30;
  private fit = 1;
  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private s = new Vector3();
  private col = new Color();

  constructor() {
    const sky = document.createElement('canvas');
    sky.width = 4;
    sky.height = 256;
    const g = sky.getContext('2d')!;
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, '#0b0f3a');
    lg.addColorStop(0.4, '#33248a');
    lg.addColorStop(0.7, '#b0408c');
    lg.addColorStop(0.9, '#ff8a55');
    lg.addColorStop(1, '#ffd48a');
    g.fillStyle = lg;
    g.fillRect(0, 0, 4, 256);
    const tex = new CanvasTexture(sky);
    tex.colorSpace = SRGBColorSpace;
    this.scene.background = tex;

    this.scene.fog = new Fog(0x7a3f92, 60, 160);
    this.scene.environmentIntensity = 0.45; // the game sets scene.environment; keep whites from blowing out
    this.scene.add(new HemisphereLight(0xb8c4ff, 0x3a1f6a, 0.8));
    const sun = new DirectionalLight(0xffdcb0, 2.6);
    sun.position.set(-14, 17, 12);
    this.scene.add(sun);

    // water
    const wg = new PlaneGeometry(170, 170, 56, 56);
    wg.rotateX(-Math.PI / 2);
    this.waterBase = (wg.attributes.position.array as Float32Array).slice();
    this.water = new Mesh(wg, toon({ color: 0x1c2488, vertexColors: false }));
    this.water.position.y = WATER;
    this.scene.add(this.water);
    const ring = new RingGeometry(1, 1.09, 48);
    ring.rotateX(-Math.PI / 2);
    this.foam = new InstancedMesh(ring, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending }), 24);
    this.foam.frustumCulled = false;
    this.scene.add(this.foam);

    // islands, locked covers, flags
    this.flagGeo.translate(0.475, 0, 0);
    this.flagBase = (this.flagGeo.attributes.position.array as Float32Array).slice();
    const flag = (color: number, p: V3, parent: Group | Scene) => {
      const f = new Mesh(this.flagGeo, toon({ color, vertexColors: false, side: DoubleSide }));
      f.position.set(...p);
      parent.add(f);
      this.flags.push(f);
      return f;
    };
    for (let k = 0; k < AREAS.length; k++) {
      const grp = new Group();
      grp.position.set(areaX(k), 0, areaZ(k));
      grp.rotation.y = areaAngle(k);
      const isl = new Mesh(islandGeometry(k), this.mat);
      const cover = new Mesh(cloudGeometry(k === 0 ? 1 : 2.6), this.mat);
      cover.position.y = 1.6;
      cover.scale.set(1.05, 0.6, 1.05);
      isl.add(new Mesh(undefined, this.ink));
      grp.add(isl, cover);
      this.islands.push(isl);
      this.covers.push(cover);
      if (k === 0) { flag(0xc8203a, [-2.6, 8.7, -1.6], grp); flag(0xc8203a, [2.6, 8.7, -1.6], grp); flag(0xffc22e, [0, 11.2, -2.1], grp); }
      else flag(THEME[k].flag, [FLAG_AT[0], FLAG_AT[1] - 0.05, FLAG_AT[2]], grp).name = 'area';
      this.scene.add(grp);
    }
    this.updateFoam(0);

    // sky clouds
    for (let i = 0; i < 9; i++) {
      const c = new Mesh(cloudGeometry(1.6 + (i % 3) * 0.7), this.mat);
      const a = i * 0.7, rad = 36 + (i % 3) * 9;
      c.position.set(Math.sin(a) * rad, 9 + (i % 4) * 2.5, Math.cos(a) * rad);
      c.scale.set(2.2, 0.45, 1.3); // long dusk cloud banks
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);

    for (const it of ITEMS) {
      const mesh = new Mesh(undefined, this.mat);
      mesh.position.set(...it.at);
      mesh.rotation.y = areaAngle(it.area);
      mesh.visible = false;
      mesh.add(new Mesh(undefined, this.ink));
      this.items.set(it.id, mesh);
      this.scene.add(mesh);
    }

    this.sparks = new InstancedMesh(new IcosahedronGeometry(0.08, 0), new MeshBasicMaterial({ toneMapped: false }), MAXP);
    this.sparks.frustumCulled = false;
    this.sparks.count = 0;
    this.scene.add(this.sparks);

    // light shafts: one additive instanced mesh, bright at the top and fading out towards the ground (High only)
    const sg = part(new CylinderGeometry(0.3, 1.7, 30, 10, 4, true), (y) => mix(0x000000, 0xffc890, Math.sin(((y + 15) / 30) * Math.PI)));
    this.shafts = new InstancedMesh(sg, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.09, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }), 4);
    const dir = new Vector3(-14, 17, 12).normalize();
    this.q.setFromUnitVectors(this.v.set(0, 1, 0), dir);
    [0, 3, 7, 10].forEach((k, i) => {
      this.m.compose(new Vector3(areaX(k), 0, areaZ(k)).addScaledVector(dir, 14), this.q, this.s.set(k ? 1 : 2.2, 1, k ? 1 : 2.2));
      this.shafts.setMatrixAt(i, this.m);
    });
    this.shafts.frustumCulled = false;
    this.scene.add(this.shafts);
    this.refresh();
  }

  // ---------- state ----------

  setState(s: { castle: Record<string, number>; cats: Record<string, string>; areas: number }): void {
    this.state = { castle: { ...s.castle }, cats: { ...s.cats }, areas: Math.max(1, Math.min(AREAS.length, s.areas)) };
    this.refresh();
  }

  /** Show a design for an item without buying it (null = back to owned state). */
  preview(id: string | null, d = 0): void {
    this.previewing = id ? { id, d } : null;
    this.refresh();
  }

  focus(id: string | null): void {
    this.focusId = id;
    this.catId = null;
    const it = ITEMS.find((i) => i.id === id);
    this.mode = it ? 'item' : 'all';
    if (it) this.focusK = it.area;
  }

  focusArea(k: number | null): void {
    this.focusId = null;
    this.catId = null;
    this.mode = k === null ? 'all' : 'area';
    if (k !== null) this.focusK = k;
  }

  focusCat(id: string | null): void {
    this.focusId = null;
    this.catId = id && this.residents.has(id) ? id : null;
    this.mode = this.catId ? 'cat' : 'all';
    this.showCats();
  }

  setQuality(hi: boolean): void {
    this.hi = hi;
    this.ink.visible = this.shafts.visible = hi;
    if (hi) this.refresh();
    if (!hi) {
      (this.water.geometry.attributes.position.array as Float32Array).set(this.waterBase);
      this.water.geometry.attributes.position.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
    }
    this.showCats();
  }

  setRegion(r: Rect, W: number, H: number): void {
    centerIn(this.camera, r, W, H);
    // distances below assume the picture fills the canvas height; step back when the free area is smaller or narrow
    this.fit = Math.max(H / r.h, (1.45 * H) / r.w);
  }

  private geo(id: string, d: number): BufferGeometry {
    const k = id + d;
    if (!this.cache.has(k)) this.cache.set(k, itemGeometry(id, d));
    return this.cache.get(k)!;
  }

  /** Ink outline of a cached item geometry, made on first use. */
  private geoInk(id: string, d: number): BufferGeometry {
    const k = id + d;
    if (!this.inkCache.has(k)) this.inkCache.set(k, hull(this.geo(id, d), 0.05));
    return this.inkCache.get(k)!;
  }

  /** Puts a cat in its sitting or walking shape, with the matching outline on High. */
  private pose(r: Resident, walk: boolean): void {
    r.mesh.geometry = walk ? r.walk : r.sit;
    if (!this.hi) return;
    if (walk) r.ink.geometry = r.walkH ??= hull(r.walk, 0.022);
    else r.ink.geometry = r.sitH ??= hull(r.sit, 0.022);
  }

  private refresh(): void {
    const open = this.state.areas;
    for (let k = 0; k < AREAS.length; k++) {
      this.islands[k].material = k < open ? this.mat : this.pale;
      this.islands[k].children[0].visible = k < open;
      this.covers[k].visible = k >= open;
    }
    for (const f of this.flags) if (f.name === 'area') f.visible = this.islands[this.flags.indexOf(f) - 2].material === this.mat;
    this.emitters.length = 0;
    for (const it of ITEMS) {
      const mesh = this.items.get(it.id)!;
      const d = this.previewing?.id === it.id ? this.previewing.d : this.state.castle[it.id];
      mesh.visible = d !== undefined && d >= 0 && it.area < open;
      if (!mesh.visible) continue;
      mesh.geometry = this.geo(it.id, d);
      if (this.hi) (mesh.children[0] as Mesh).geometry = this.geoInk(it.id, d);
      const a = areaAngle(it.area), c = Math.cos(a), s = Math.sin(a);
      for (const [x, y, z, kind] of EMIT[it.id] ?? []) this.emitters.push(it.at[0] + x * c + z * s, it.at[1] + y, it.at[2] - x * s + z * c, kind);
    }
    // residents
    for (const [id, r] of this.residents) {
      if (this.state.cats[id] !== undefined) continue;
      this.scene.remove(r.mesh);
      r.sit.dispose();
      r.walk.dispose();
      r.sitH?.dispose();
      r.walkH?.dispose();
      this.residents.delete(id);
    }
    for (const def of CATS) {
      const acc = this.state.cats[def.id];
      if (acc === undefined) continue;
      let r = this.residents.get(def.id);
      if (r && r.acc === acc) continue;
      if (r) { r.sit.dispose(); r.walk.dispose(); r.sitH?.dispose(); r.walkH?.dispose(); r.sitH = r.walkH = undefined; }
      const sit = catGeometry(def, acc || null, 'sit');
      const walk = catGeometry(def, acc || null, 'walk');
      if (!r) {
        const mesh = new Mesh(sit, this.mat);
        mesh.scale.setScalar(CAT_SCALE);
        const ink = new Mesh(undefined, this.ink);
        mesh.add(ink);
        this.scene.add(mesh);
        r = { def, acc, mesh, ink, sit, walk, x: 0, z: 0, rot: 0, area: Math.min(def.world, open - 1), walking: false, wait: Math.random() * 4, phase: Math.random() * 6, path: new Float32Array(48), n: 0, i: 0 };
        this.spot(r.area, r.path, 0);
        r.x = r.path[0];
        r.z = r.path[1];
        r.rot = Math.random() * 6;
        this.residents.set(def.id, r);
      } else { r.acc = acc; r.sit = sit; r.walk = walk; }
      this.pose(r, r.walking);
    }
    // motes drift over every open island (kind 5, High only)
    for (let k = 0; k < open; k++) this.emitters.push(areaX(k), 0.4, areaZ(k), 5);
    if (this.catId && !this.residents.has(this.catId)) this.focusCat(null);
    this.showCats();
  }

  private showCats(): void {
    let n = 0;
    for (const r of this.residents.values()) r.mesh.visible = this.hi || n++ < LOW_CATS || r.def.id === this.catId;
  }

  // ---------- cats ----------

  /** Writes a random standing spot in area k into out[o], out[o + 1]. */
  private spot(k: number, out: Float32Array, o: number): void {
    if (k === 0) {
      // ponytail: cats keep to the castle's outer lawn so they never walk through the keep; items there can still be clipped
      const a = Math.random() * Math.PI * 2, r = 5.3 + Math.random() * 1.2;
      out[o] = Math.sin(a) * r;
      out[o + 1] = Math.cos(a) * r;
      return;
    }
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3.4;
    const w = toWorld(k, [Math.sin(a) * r, 0, Math.cos(a) * r * 0.9 + 0.2]);
    out[o] = w[0];
    out[o + 1] = w[2];
  }

  private route(r: Resident, to: number): void {
    const p = r.path;
    let n = 0;
    const push = (x: number, z: number) => { if (n < 46) { p[n++] = x; p[n++] = z; } };
    const gate = (k: number, rad: number) => push(Math.sin(areaAngle(k)) * rad, Math.cos(areaAngle(k)) * rad);
    let a = Math.atan2(r.x, r.z);
    if (r.area !== 0 && to !== r.area) { gate(r.area, RING - R + 0.7); gate(r.area, R0 - 0.5); a = areaAngle(r.area); }
    if (to === r.area && to !== 0) { this.spot(to, p, n); n += 2; }
    else {
      // walk round the castle lawn to the target angle
      let b: number;
      if (to === 0) { this.spot(0, p, 46); b = Math.atan2(p[46], p[47]); } else b = areaAngle(to);
      let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const steps = Math.ceil(Math.abs(d) / 0.55);
      d /= steps || 1;
      for (let i = 1; i < steps; i++) push(Math.sin(a + d * i) * 6.0, Math.cos(a + d * i) * 6.0);
      if (to === 0) push(p[46], p[47]);
      else { gate(to, R0 - 0.5); gate(to, RING - R + 0.7); this.spot(to, p, n); n += 2; }
    }
    r.n = n / 2;
    r.i = 0;
    r.area = to;
  }

  private moveCats(t: number, dt: number): void {
    const open = this.state.areas;
    for (const r of this.residents.values()) {
      if (!r.mesh.visible) continue;
      const held = r.def.id === this.catId;
      if (held) {
        if (r.walking) { r.walking = false; this.pose(r, false); }
        r.rot = this.az;
        r.wait = 2;
      } else if (!r.walking) {
        r.wait -= dt;
        if (r.wait <= 0) {
          this.route(r, open > 1 && Math.random() < 0.3 ? Math.floor(Math.random() * open) : r.area);
          r.walking = true;
          this.pose(r, true);
        }
      } else {
        const tx = r.path[r.i * 2], tz = r.path[r.i * 2 + 1];
        const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz), step = 1.5 * dt;
        if (d <= step) {
          r.x = tx;
          r.z = tz;
          if (++r.i >= r.n) { r.walking = false; r.wait = 2.5 + Math.random() * 6; this.pose(r, false); }
        } else {
          r.x += (dx / d) * step;
          r.z += (dz / d) * step;
          const want = Math.atan2(dx, dz);
          r.rot += (((want - r.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8);
        }
      }
      const bob = r.walking ? Math.abs(Math.sin(t * 11 + r.phase)) * 0.07 : Math.sin(t * 2 + r.phase) * 0.012;
      r.mesh.position.set(r.x, bob, r.z);
      r.mesh.rotation.set(0, r.rot, r.walking ? Math.sin(t * 11 + r.phase) * 0.06 : 0);
    }
  }

  // ---------- frame ----------

  private updateFoam(t: number): void {
    let n = 0;
    for (let k = 0; k < AREAS.length; k++) for (let j = 0; j < 2; j++) {
      const ph = (t * 0.25 + j * 0.5 + k * 0.13) % 1;
      const rad = (k === 0 ? R0 : R) + 0.55 + ph * 0.9;
      this.m.compose(this.v.set(areaX(k), RIM + 0.06 + j * 0.005, areaZ(k)), this.q.identity(), this.s.set(rad, 1, rad));
      this.foam.setMatrixAt(n, this.m);
      const f = Math.sin(ph * Math.PI);
      this.foam.setColorAt(n++, this.col.setRGB(0.55 + f * 0.45, 0.85 + f * 0.15, 1));
    }
    this.foam.instanceMatrix.needsUpdate = true;
    if (this.foam.instanceColor) this.foam.instanceColor.needsUpdate = true;
  }

  private particles(t: number, dt: number): void {
    const calm = reducedMotion();
    const cap = this.hi && !calm ? MAXP : 50;
    const p = this.pp;
    // spawn
    const ne = this.emitters.length / 4;
    this.spawnAcc += dt * (calm ? 4 : this.hi ? 26 + this.state.areas * 3 : 10);
    while (this.spawnAcc >= 1 && ne > 0) {
      this.spawnAcc -= 1;
      if (this.pn >= cap) continue;
      const e = Math.floor(Math.random() * ne) * 4, kind = this.emitters[e + 3], o = this.pn * 8;
      if (kind === 5 && (!this.hi || calm)) continue;
      const a = Math.random() * Math.PI * 2;
      p[o] = this.emitters[e]; p[o + 1] = this.emitters[e + 1]; p[o + 2] = this.emitters[e + 2];
      p[o + 3] = 0; p[o + 4] = 0; p[o + 5] = 0; p[o + 6] = 0; p[o + 7] = 1;
      if (kind === 0) { p[o + 3] = Math.cos(a) * 0.9; p[o + 5] = Math.sin(a) * 0.9; p[o + 4] = 2.6; p[o + 7] = 0.8; }
      if (kind === 1) { p[o + 3] = Math.cos(a) * 0.3; p[o + 5] = Math.sin(a) * 0.3; p[o + 4] = 1.2 + Math.random(); p[o + 7] = 1.3; }
      if (kind === 2) { p[o + 3] = 0.25; p[o + 4] = 0.7; p[o + 7] = 2.6; }
      if (kind === 3) { p[o] += Math.cos(a) * 0.6; p[o + 2] += Math.sin(a) * 0.6; p[o + 1] += (Math.random() - 0.5) * 0.8; p[o + 4] = 0.25; p[o + 7] = 1.0; }
      if (kind === 4) p[o + 7] = 1.6;
      if (kind === 5) { const rr = Math.random() * (p[o] || p[o + 2] ? R : R0); p[o] += Math.cos(a) * rr; p[o + 2] += Math.sin(a) * rr; p[o + 1] += Math.random() * 5; p[o + 3] = 0.15; p[o + 4] = 0.4; p[o + 7] = 3.5; }
      this.pk[this.pn++] = kind;
    }
    if (ne === 0) this.spawnAcc = 0;
    // move + draw
    for (let i = 0; i < this.pn; ) {
      const o = i * 8;
      p[o + 6] += dt;
      if (p[o + 6] >= p[o + 7]) {
        this.pn--;
        p.copyWithin(o, this.pn * 8, this.pn * 8 + 8);
        this.pk[i] = this.pk[this.pn];
        continue;
      }
      const kind = this.pk[i], k = p[o + 6] / p[o + 7];
      if (kind === 0) p[o + 4] -= 7.5 * dt;
      p[o] += p[o + 3] * dt; p[o + 1] += p[o + 4] * dt; p[o + 2] += p[o + 5] * dt;
      const size = kind === 2 ? 0.8 + k * 1.6 : kind === 4 ? 2.6 * Math.sin(k * Math.PI) : kind === 3 ? 1.3 * Math.sin(k * Math.PI) : kind === 5 ? 0.8 * Math.sin(k * Math.PI) : 1.1 * (1 - k * 0.6);
      this.m.compose(this.v.set(p[o], p[o + 1], p[o + 2]), this.q.identity(), this.s.set(size, size, size));
      this.sparks.setMatrixAt(i, this.m);
      const c = PCOL[kind], f = kind === 2 ? 1 : kind === 1 ? 1 - k * 0.6 : 1;
      this.sparks.setColorAt(i, this.col.setRGB(c[0] * f, c[1] * f, c[2] * f));
      i++;
    }
    void t;
    this.sparks.count = this.pn;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }

  update(t: number, dt: number): void {
    const calm = reducedMotion();

    // camera
    let tx = 0, ty = 0.5, tz = 0, dist = 46, height = 26, az = this.az;
    if (this.mode === 'all') az = this.orbit && !calm ? this.az + dt * 0.07 : calm ? 0 : Math.sin(t * 0.2) * 0.15;
    else {
      const k = this.focusK;
      az = areaAngle(k) + (calm ? 0 : Math.sin(t * 0.25) * 0.1);
      tx = areaX(k); tz = areaZ(k);
      if (this.mode === 'area') { dist = k === 0 ? 18 : 10.5; height = k === 0 ? 8 : 6.5; ty = k === 0 ? 3.4 : 1.0; }
      const it = this.mode === 'item' ? ITEMS.find((i) => i.id === this.focusId) : undefined;
      if (it) { tx = it.at[0] * 0.75 + tx * 0.25; tz = it.at[2] * 0.75 + tz * 0.25; ty = 1.2 + it.at[1] * 0.5; dist = k === 0 ? 14 : 10; height = k === 0 ? 7 : 5.5; }
      const r = this.mode === 'cat' && this.catId ? this.residents.get(this.catId) : undefined;
      if (r) { tx = r.x; tz = r.z; ty = 0.5; dist = 3.4; height = 1.3; az = Math.atan2(r.x, r.z); }
    }
    const k = Math.min(1, dt * 3);
    this.az += this.mode === 'all' && this.orbit && !calm ? az - this.az : (((az - this.az + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;
    this.dist += (dist - this.dist) * k;
    this.height += (height - this.height) * k;
    this.look.lerp(this.v.set(tx, ty, tz), k);
    const f = this.fit;
    this.camera.position.set(this.look.x + Math.sin(this.az) * this.dist * f, this.look.y + this.height * f, this.look.z + Math.cos(this.az) * this.dist * f);
    this.camera.lookAt(this.look);

    // preview pulse
    const pv = this.previewing && this.items.get(this.previewing.id);
    for (const [id, mesh] of this.items) if (mesh.visible) mesh.scale.setScalar(mesh === pv ? 1 + Math.sin(t * 5) * 0.04 : id === this.focusId ? 1.02 : 1);

    // flags (one shared wave)
    const fp = this.flagGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < fp.length; i += 3) fp[i + 2] = Math.sin(this.flagBase[i] * 7 - t * (calm ? 1.5 : 7)) * 0.1 * this.flagBase[i];
    this.flagGeo.attributes.position.needsUpdate = true;

    // clouds and locked covers
    if (!calm) this.clouds.rotation.y += dt * 0.012;
    for (let i = 0; i < this.covers.length; i++) if (this.covers[i].visible) this.covers[i].position.y = 1.6 + Math.sin(t * 0.6 + i) * 0.15;

    // water
    if (this.hi && !calm) {
      const wp = this.water.geometry.attributes.position.array as Float32Array;
      const wn = this.water.geometry.attributes.normal.array as Float32Array;
      const b = this.waterBase;
      for (let i = 0; i < wp.length; i += 3) {
        const x = b[i], z = b[i + 2];
        const a = x * 0.35 + t * 0.9, c = z * 0.3 - t * 0.7, e = (x + z) * 0.2 + t * 0.5;
        wp[i + 1] = Math.sin(a) * 0.09 + Math.sin(c) * 0.08 + Math.sin(e) * 0.07;
        const nx = -(Math.cos(a) * 0.0315 + Math.cos(e) * 0.014) * 3, nz = -(Math.cos(c) * 0.024 + Math.cos(e) * 0.014) * 3;
        const l = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
        wn[i] = nx * l; wn[i + 1] = l; wn[i + 2] = nz * l;
      }
      this.water.geometry.attributes.position.needsUpdate = true;
      this.water.geometry.attributes.normal.needsUpdate = true;
      this.updateFoam(t);
    }

    // outlines for the islands, one island per frame
    if (this.hi && this.inkN < this.islands.length) { const isl = this.islands[this.inkN++]; (isl.children[0] as Mesh).geometry = hull(isl.geometry, 0.07); }

    this.moveCats(t, dt);
    this.particles(t, dt);
  }
}
