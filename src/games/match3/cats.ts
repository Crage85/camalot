// The cats of the kingdom: who they are, what they wear, and how they are drawn.
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Matrix4, OctahedronGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three';
import { facet, merge, part, type V3 } from './art';

export interface CatDef {
  id: string; name: string; world: number; fur: number; fur2: number;
  pattern: 'solid' | 'tabby' | 'tux' | 'calico' | 'point' | 'spots'; eye: number; legend?: boolean;
}

const GREEN = 0x58c46a, BLUE = 0x4aa8ff, GOLD = 0xf2b632, AQUA = 0x35c9c0, VIOLET = 0x9a6bff, AMBER = 0xff9a2e;
type P = CatDef['pattern'];
/** Shown names for cats whose first name was replaced; ids (the first names, lower case) stay for old saves. */
const NAMES: Record<string, string> = { biscuit: 'Bramble', clover: 'Briar', pumpkin: 'Ochre', daisy: 'Linnea', snowdrop: 'Neve', mittens: 'Sable', icicle: 'Rime', sprout: 'Thorn', basil: 'Alder', sandy: 'Dune', pebble: 'Slate', mogul: 'Ridge', flurry: 'Gale', cocoa: 'Umber', paprika: 'Pyre', smokey: 'Ash', nugget: 'Aurum', dusty: 'Flint', twirl: 'Lyra', waltz: 'Vesper', sequin: 'Stella', tango: 'Rhea', cleat: 'Volt', goldie: 'Soleil', cumulus: 'Cirrus', puff: 'Nimbus', breeze: 'Zephyr', lumi: 'Lumen', duchess: 'Selene', regal: 'Regis', jewel: 'Garnet', majesty: 'Aurelia', sizzle: 'Ignis', glimmer: 'Astra' };
const c = (world: number, name: string, fur: number, fur2: number, pattern: P, eye: number): CatDef => ({ id: name.toLowerCase(), name: NAMES[name.toLowerCase()] ?? name, world, fur, fur2, pattern, eye });

/** 48 cats, 4 per world (index = world * 4 + slot), then 4 legendary cats. */
export const CATS: CatDef[] = [
  c(0, 'Biscuit', 0xf2c48a, 0xc98a4a, 'tabby', GREEN), c(0, 'Clover', 0xffffff, 0x3a3a48, 'calico', GREEN), c(0, 'Pumpkin', 0xff9f45, 0xd9701a, 'tabby', GOLD), c(0, 'Daisy', 0xfff6e6, 0xf2d9b0, 'solid', BLUE),
  c(1, 'Snowdrop', 0xffffff, 0xdfe8f5, 'solid', BLUE), c(1, 'Mittens', 0x4a4e60, 0xffffff, 'tux', GOLD), c(1, 'Icicle', 0xcfe4f7, 0x8fb4d9, 'tabby', AQUA), c(1, 'Pearl', 0xf6efe6, 0x8a7868, 'point', BLUE),
  c(2, 'Fern', 0x8a8f9c, 0x5a5f6c, 'tabby', GREEN), c(2, 'Sprout', 0xf7e2c0, 0xb8763a, 'spots', GREEN), c(2, 'Juniper', 0x3a3d4a, 0x6a6e7c, 'solid', GOLD), c(2, 'Basil', 0xd9b48a, 0xffffff, 'tux', GREEN),
  c(3, 'Sandy', 0xf0d6a0, 0xc9a86a, 'tabby', AQUA), c(3, 'Coral', 0xffb39a, 0xff7f6a, 'spots', BLUE), c(3, 'Pebble', 0xb0b4bf, 0xffffff, 'tux', GOLD), c(3, 'Marina', 0xffffff, 0x5a7fa8, 'calico', AQUA),
  c(4, 'Aspen', 0xfff3d6, 0xe0a030, 'spots', GREEN), c(4, 'Mogul', 0x6a5a4c, 0xffffff, 'tux', BLUE), c(4, 'Flurry', 0xf4f8ff, 0xb8c8e0, 'tabby', VIOLET), c(4, 'Cocoa', 0x7a4f34, 0x4f2f1c, 'solid', GOLD),
  c(5, 'Cinder', 0x55505a, 0x2e2a34, 'tabby', AMBER), c(5, 'Paprika', 0xe8683a, 0xa83a1a, 'tabby', GOLD), c(5, 'Smokey', 0x9a96a4, 0x5c5866, 'point', AMBER), c(5, 'Ember', 0x2e2a34, 0xff7a2e, 'spots', AMBER),
  c(6, 'Nugget', 0xf5c84a, 0xc98f1a, 'tabby', GREEN), c(6, 'Dusty', 0xc9a98a, 0x8f6f52, 'spots', BLUE), c(6, 'Copper', 0xc9703a, 0xffffff, 'tux', GREEN), c(6, 'Sage', 0xb9c4a8, 0x7c8a6a, 'solid', GOLD),
  c(7, 'Twirl', 0xffd0e4, 0xff8fc0, 'tabby', VIOLET), c(7, 'Waltz', 0x2c2c3a, 0xffffff, 'tux', BLUE), c(7, 'Sequin', 0xe8dcff, 0xb08cff, 'spots', VIOLET), c(7, 'Tango', 0xffffff, 0xc23a4a, 'calico', GOLD),
  c(8, 'Striker', 0xffffff, 0x2c2c3a, 'spots', GREEN), c(8, 'Dash', 0xf2a03a, 0xffffff, 'tux', BLUE), c(8, 'Cleat', 0x7c8290, 0x4c5260, 'tabby', GOLD), c(8, 'Goldie', 0xffd76a, 0xe0a82a, 'solid', GREEN),
  c(9, 'Cumulus', 0xffffff, 0xcfe0ff, 'solid', BLUE), c(9, 'Puff', 0xe6f0ff, 0xa8c4f0, 'spots', VIOLET), c(9, 'Skye', 0xa8d4ff, 0xffffff, 'tux', BLUE), c(9, 'Breeze', 0xf6f0ff, 0x9a8ac8, 'point', AQUA),
  c(10, 'Lumi', 0xd6fff0, 0x7ad9c0, 'tabby', VIOLET), c(10, 'Ripple', 0x6a8fc8, 0x3f5f98, 'tabby', AQUA), c(10, 'Willow', 0xe0d0b0, 0x7a6a8a, 'point', GREEN), c(10, 'Opal', 0xffffff, 0x9a7ad9, 'calico', AQUA),
  c(11, 'Duchess', 0xffffff, 0xf0e0f8, 'solid', VIOLET), c(11, 'Regal', 0x5a3f8f, 0xffffff, 'tux', GOLD), c(11, 'Jewel', 0xf7d0e8, 0xc86aa8, 'spots', BLUE), c(11, 'Majesty', 0xf5c84a, 0xb07a1a, 'tabby', VIOLET),
  { ...c(2, 'Sizzle', 0x5fc86a, 0x2f8f4a, 'spots', GOLD), legend: true },
  { ...c(5, 'Glimmer', 0xffffff, 0xffd0ec, 'solid', VIOLET), legend: true },
  { ...c(8, 'Avalanche', 0xf2f4f8, 0x5a5f6c, 'spots', AQUA), legend: true },
  { ...c(11, 'Nova', 0x3a2f7a, 0x8a6bff, 'solid', GOLD), legend: true },
];

/** Outfits, bought with crowns. Any cat can wear any outfit she owns. */
export const ACCESSORIES: { id: string; name: string; cost: number }[] = [
  { id: 'bow', name: 'Silk ribbon', cost: 3 }, { id: 'scarf', name: 'Battle scarf', cost: 5 }, { id: 'flower', name: 'Moonflower', cost: 6 },
  { id: 'party', name: 'Apprentice cap', cost: 8 }, { id: 'shades', name: 'Shades', cost: 9 }, { id: 'beanie', name: 'Frost cap', cost: 10 },
  { id: 'jersey', name: 'Arena jersey', cost: 12 }, { id: 'backpack', name: 'Satchel', cost: 13 }, { id: 'tutu', name: 'Battle skirt', cost: 15 },
  { id: 'cape', name: 'War cape', cost: 18 }, { id: 'wizard', name: 'Archmage hat', cost: 22 }, { id: 'crown', name: 'Crown', cost: 25 },
];

const sph = (r: number, ws = 14, hs = 10) => new SphereGeometry(r, ws, hs);
const cone = (r: number, h: number, s = 10) => new ConeGeometry(r, h, s);
const cyl = (rt: number, rb: number, h: number, s = 12, open = false) => new CylinderGeometry(rt, rb, h, s, 1, open);
const ORANGE = 0xf0a040, DARK = 0x1e1e2c, WHITE = 0xffffff;

const mix = (a: number, b: number, k: number) => new Color(a).lerp(new Color(b), k).getHex();
/** Robe colour by home world. */
const ROBES = [0x2f6a3a, 0x2a4a9a, 0x1f5a48, 0x147a9a, 0x3a4aa8, 0x8a2424, 0x8a4a1c, 0x4a2a8a, 0x1f6a3f, 0x3a5ab8, 0x12506a, 0x5a2a9a];
const BODY_WEAR = ['jersey', 'backpack', 'tutu', 'cape'];
const fit = (from: V3, to: V3, k: number) =>
  new Matrix4().makeTranslation(to[0], to[1], to[2]).multiply(new Matrix4().makeScale(k, k, k)).multiply(new Matrix4().makeTranslation(-from[0], -from[1], -from[2]));

/**
 * A cat mage about 1 unit tall (staff a little taller), feet at y = 0, facing +z: slim, robed, staff in hand.
 * One standing model serves both poses.
 */
export function catGeometry(cat: CatDef, acc: string | null, _pose: 'sit' | 'walk' = 'sit'): BufferGeometry {
  const { fur, fur2, pattern: pt } = cat;
  const H: V3 = [0, 0.77, 0.02]; // head centre
  const robe = cat.legend ? 0x2a2238 : ROBES[cat.world % ROBES.length];
  const robeLo = mix(robe, 0x0a0618, 0.55), trim = cat.legend ? 0xffd84a : 0xe0b860;
  const out: BufferGeometry[] = [];
  let M: Matrix4 | null = null;
  const add = (g: BufferGeometry, color: number | ((y: number, x: number) => number), p: V3, r: V3 = [0, 0, 0], s: number | V3 = 1) => {
    const q = part(g, color, p, r, s);
    out.push(M ? q.applyMatrix4(M) : q);
  };
  const hh = (x: number, y: number, z: number): V3 => [H[0] + x, H[1] + y, H[2] + z];

  // fur pattern as vertex colours (y, x in the old big-head scale)
  const headCol = (y: number, x: number): number => {
    if (pt === 'tabby') return y > 0.12 && Math.abs(Math.sin(x * 26)) > 0.72 ? fur2 : fur;
    if (pt === 'calico') return x > 0.04 && y > -0.02 ? fur2 : x < -0.06 && y > 0.05 ? ORANGE : fur;
    if (pt === 'point') return Math.abs(x) < 0.16 && y < 0.1 && y > -0.22 ? fur2 : fur;
    return fur;
  };
  const paw = pt === 'tux' || pt === 'point' ? fur2 : pt === 'calico' ? WHITE : fur;
  const tip = pt === 'solid' || pt === 'spots' ? fur : fur2;
  const earL = pt === 'point' ? fur2 : pt === 'calico' ? ORANGE : fur;
  const earR = pt === 'point' || pt === 'calico' ? fur2 : fur;

  // robe, mantle and cloak
  add(facet(cyl(0.085, 0.2, 0.5, 8)), (y) => (y < -0.2 ? trim : y < -0.1 ? robeLo : robe), [0, 0.27, 0]);
  add(sph(0.105, 10, 8), robe, [0, 0.53, 0], [0, 0, 0], [1.15, 0.8, 0.85]);
  add(facet(cone(0.15, 0.14, 6)), mix(robe, 0xffffff, 0.22), [0, 0.57, 0]);
  add(facet(cone(0.21, 0.46, 6)), robeLo, [0, 0.35, -0.08], [-0.12, 0, 0], [1, 1, 0.4]);
  add(facet(new OctahedronGeometry(0.028)), trim, [0, 0.545, 0.105]);
  add(facet(cyl(0.1, 0.105, 0.035, 8)), trim, [0, 0.36, 0]);
  // sleeves, paws, feet, tail
  for (const s of [-1, 1]) {
    add(facet(cyl(0.035, 0.062, 0.25, 6)), robe, [s * 0.15, 0.44, 0.035], [-0.25, 0, s * 0.45]);
    add(sph(0.036, 8, 6), paw, [s * 0.212, 0.335, 0.07]);
    add(sph(0.04, 8, 6), paw, [s * 0.06, 0.03, 0.15], [0, 0, 0], [1, 0.6, 1.3]);
  }
  add(cyl(0.018, 0.03, 0.38, 6), (y) => (y > 0.08 ? tip : fur), [0.15, 0.2, -0.2], [-0.5, 0, -0.9]);
  // staff
  add(cyl(0.013, 0.013, 0.95, 6), 0x3a2a1c, [0.235, 0.475, 0.09]);
  add(new TorusGeometry(0.06, 0.012, 4, 12), trim, [0.235, 0.94, 0.09]);
  add(facet(new OctahedronGeometry(0.055)), cat.eye, [0.235, 1.01, 0.09], [0, 0, 0], [0.75, 1.5, 0.75]);

  // head: small, sharp ears, almond eyes
  add(sph(0.165, 16, 12), (y, x) => headCol(y * 1.8, x * 1.8), hh(0, 0, 0), [0, 0, 0], [1.05, 0.95, 0.95]);
  add(facet(cone(0.07, 0.2, 4)), earL, hh(-0.105, 0.17, -0.01), [0, 0, 0.3]);
  add(facet(cone(0.07, 0.2, 4)), earR, hh(0.105, 0.17, -0.01), [0, 0, -0.3]);
  add(cone(0.032, 0.12, 4), 0xa85a70, hh(-0.103, 0.16, 0.022), [0, 0, 0.3]);
  add(cone(0.032, 0.12, 4), 0xa85a70, hh(0.103, 0.16, 0.022), [0, 0, -0.3]);
  add(sph(0.055, 10, 8), pt === 'tux' ? fur2 : WHITE, hh(0, -0.055, 0.12), [0, 0, 0], [1.25, 0.75, 0.6]);
  add(sph(0.016, 6, 4), 0x8a3a4a, hh(0, -0.035, 0.155), [0, 0, 0], [1.3, 0.8, 0.8]);
  for (const s of [-1, 1]) {
    add(sph(0.04, 10, 8), cat.eye, hh(s * 0.068, 0.012, 0.126), [0, 0, s * 0.3], [1.25, 0.8, 0.5]);
    add(sph(0.022, 8, 6), DARK, hh(s * 0.068, 0.012, 0.14), [0, 0, 0], [0.5, 1.15, 0.5]);
    add(sph(0.011, 6, 4), WHITE, hh(s * 0.068 + 0.016, 0.028, 0.15));
    add(new BoxGeometry(0.105, 0.015, 0.02), DARK, hh(s * 0.072, 0.046, 0.132), [0, 0, s * 0.32]);
  }
  if (pt === 'spots') for (const [x, y, z] of [[-0.08, 0.13, 0.02], [0.09, 0.12, -0.02], [0.01, 0.15, -0.06]] as V3[]) add(sph(0.03, 8, 6), fur2, hh(x, y, z), [0, 0, 0], [1, 0.6, 1]);

  // legendary extras
  if (cat.id === 'sizzle') {
    for (const s of [-1, 1]) {
      add(facet(cone(0.2, 0.42, 3)), 0xff6a2a, [s * 0.24, 0.56, -0.13], [0.2, s * 0.5, s * -1.0], [1, 1, 0.12]);
      add(cone(0.022, 0.09, 5), 0xffe08a, hh(s * 0.05, 0.17, 0.03), [0.2, 0, s * -0.2]);
    }
  }
  if (cat.id === 'glimmer') {
    add(cone(0.026, 0.17, 6), 0xffd84a, hh(0, 0.2, 0.07), [0.35, 0, 0]);
    [0xb08cff, 0x7fd0ff, 0xb08cff, 0x7fd0ff].forEach((col, k) => add(facet(new OctahedronGeometry(0.05)), col, hh(0, 0.13 - k * 0.07, -0.13 - (k === 3 ? -0.02 : k * 0.015))));
  }
  if (cat.id === 'avalanche') add(new TorusGeometry(0.11, 0.04, 6, 12), WHITE, [0, 0.6, 0], [Math.PI / 2, 0, 0]);
  if (cat.id === 'nova') {
    add(new OctahedronGeometry(0.04), 0xffe46a, hh(0, 0.1, 0.14), [0, 0, 0], [1, 1, 0.4]);
    for (const [x, y, z] of [[-0.26, 0.14, 0], [0.27, 0.02, 0.03], [0.17, 0.26, -0.06], [-0.2, -0.16, 0.12]] as V3[]) add(new OctahedronGeometry(0.035), 0xffe46a, hh(x, y, z));
  }

  // outfits are modelled against the old big-head layout, then fitted to the mage
  const sit = true;
  const H0: V3 = [0, 0.68, 0.05], B0: V3 = [0, 0.27, 0];
  const h = (x: number, y: number, z: number): V3 => [H0[0] + x, H0[1] + y, H0[2] + z];
  const b = (x: number, y: number, z: number): V3 => [B0[0] + x, B0[1] + y, B0[2] + z];
  M = acc && BODY_WEAR.includes(acc) ? fit(B0, [0, 0.4, 0], 0.6) : fit(H0, H, 0.56);

  // outfit
  const neck: V3 = sit ? [0, 0.47, 0.03] : [0, 0.42, 0.17];
  const ring: V3 = sit ? [Math.PI / 2, 0, 0] : [0.5, 0, 0];
  const waist: V3 = sit ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  switch (acc) {
    case 'bow':
      add(cone(0.09, 0.15, 8), 0xc8203c, h(0.1, 0.27, 0.1), [0, 0, Math.PI / 2 + 0.3]);
      add(cone(0.09, 0.15, 8), 0xc8203c, h(0.27, 0.22, 0.1), [0, 0, -Math.PI / 2 + 0.3]);
      add(sph(0.045, 8, 6), 0xe0b860, h(0.185, 0.245, 0.11));
      break;
    case 'scarf':
      add(new TorusGeometry(0.2, 0.06, 8, 16), 0xe8404a, neck, ring, [1, 1, 0.9]);
      add(new BoxGeometry(0.1, 0.2, 0.04), 0xe8404a, [neck[0] + 0.12, neck[1] - 0.12, neck[2] + 0.2], [0.2, 0, -0.15]);
      add(new BoxGeometry(0.1, 0.04, 0.045), WHITE, [neck[0] + 0.135, neck[1] - 0.2, neck[2] + 0.215], [0.2, 0, -0.15]);
      break;
    case 'flower':
      for (let k = 0; k < 5; k++) add(sph(0.05, 8, 6), 0xb8a0ff, h(-0.19 + Math.cos(k * 1.257) * 0.065, 0.24 + Math.sin(k * 1.257) * 0.065, 0.12), [0, 0, 0], [1, 1, 0.5]);
      add(sph(0.04, 8, 6), 0xffe04a, h(-0.19, 0.24, 0.14));
      break;
    case 'party':
      add(cone(0.13, 0.32, 12), (y) => (Math.sin(y * 30) > 0 ? 0x2a2a7a : 0xe0b860), h(0, 0.41, 0), [0, 0, 0.1]);
      add(sph(0.045, 8, 6), 0xffe04a, h(-0.017, 0.58, 0));
      break;
    case 'shades':
      for (const s of [-1, 1]) add(sph(0.085, 10, 8), 0x1a1a2a, h(s * 0.125, 0.025, 0.26), [0, 0, 0], [1.1, 0.85, 0.45]);
      add(new BoxGeometry(0.14, 0.025, 0.03), 0x1a1a2a, h(0, 0.05, 0.285));
      add(new BoxGeometry(0.62, 0.025, 0.03), 0x1a1a2a, h(0, 0.05, 0.12), [0, 0, 0], [1, 1, 8]);
      break;
    case 'beanie':
      add(sph(0.27, 14, 8), 0x35b8c9, h(0, 0.11, -0.01), [0, 0, 0], [1.08, 0.75, 0.95]);
      add(new TorusGeometry(0.265, 0.05, 6, 18), WHITE, h(0, 0.14, 0), [Math.PI / 2, 0, 0], [1.08, 0.95, 1]);
      add(sph(0.07, 8, 6), WHITE, h(0, 0.33, -0.01));
      break;
    case 'jersey':
      add(cyl(0.225, 0.26, 0.2, 14, true), (y) => (y > 0.04 ? WHITE : 0x2f7fe0), sit ? b(0, 0.06, 0) : b(0, 0, 0.02), sit ? [0, 0, 0] : [Math.PI / 2, 0, 0], sit ? [1.04, 1, 1] : [1, 1.2, 1]);
      break;
    case 'backpack':
      add(new BoxGeometry(0.24, 0.24, 0.13), 0x4a8fe8, sit ? b(0, 0.06, -0.27) : b(0, 0.22, -0.1), sit ? [0, 0, 0] : [Math.PI / 2, 0, 0]);
      add(new BoxGeometry(0.16, 0.1, 0.04), 0xffd04a, sit ? b(0, 0.02, -0.35) : b(0, 0.3, -0.12), sit ? [0, 0, 0] : [Math.PI / 2, 0, 0]);
      add(new TorusGeometry(sit ? 0.25 : 0.2, 0.025, 5, 14), 0x2a5fa8, sit ? b(0, 0.08, 0) : b(0, 0, 0), waist, sit ? [1, 1, 1] : [1, 1.1, 1]);
      break;
    case 'tutu':
      add(cone(0.42, 0.13, 16), (y) => (y > 0 ? 0x8a1c4a : 0xc83a6a), sit ? b(0, -0.07, 0) : b(0, 0, -0.14), sit ? [0, 0, 0] : [-Math.PI / 2, 0, 0], sit ? 1 : 0.82);
      add(new TorusGeometry(sit ? 0.235 : 0.2, 0.03, 5, 16), 0xe0b860, sit ? b(0, -0.01, 0) : b(0, 0, -0.08), waist);
      break;
    case 'cape':
      add(cone(0.34, 0.5, 12, ), (y) => (y < -0.15 ? 0x6a2fc8 : 0x8a4fe8), sit ? [0, 0.24, -0.13] : [0, 0.36, -0.22], sit ? [-0.25, 0, 0] : [-1.1, 0, 0], [1, 1, 0.45]);
      add(sph(0.045, 8, 6), 0xffd84a, [neck[0], neck[1] - 0.02, neck[2] + 0.2]);
      break;
    case 'wizard':
      add(cyl(0.3, 0.3, 0.03, 16), 0x5a3fc8, h(0, 0.25, 0));
      add(cone(0.18, 0.42, 12), (y) => (y < -0.14 ? 0xffd84a : 0x6a4fe0), h(0.01, 0.46, -0.01), [0, 0, -0.12]);
      add(new OctahedronGeometry(0.045), 0xffe46a, h(0.0, 0.42, 0.14));
      break;
    case 'crown': {
      add(cyl(0.16, 0.15, 0.09, 12), 0xffd23f, h(0, 0.3, 0));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        add(cone(0.045, 0.12, 4), 0xffd23f, h(Math.sin(a) * 0.14, 0.39, Math.cos(a) * 0.14));
        add(sph(0.025, 6, 4), k % 2 ? 0x4ad0ff : 0xe0264e, h(Math.sin(a) * 0.14, 0.455, Math.cos(a) * 0.14));
      }
      break;
    }
  }
  return merge(out);
}
