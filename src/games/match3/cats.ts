// The cats of the kingdom: who they are, what they wear, and how they are drawn.
import { BoxGeometry, ConeGeometry, CylinderGeometry, OctahedronGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three';
import { merge, part, type V3 } from './art';

export interface CatDef {
  id: string; name: string; world: number; fur: number; fur2: number;
  pattern: 'solid' | 'tabby' | 'tux' | 'calico' | 'point' | 'spots'; eye: number; legend?: boolean;
}

const GREEN = 0x58c46a, BLUE = 0x4aa8ff, GOLD = 0xf2b632, AQUA = 0x35c9c0, VIOLET = 0x9a6bff, AMBER = 0xff9a2e;
type P = CatDef['pattern'];
const c = (world: number, name: string, fur: number, fur2: number, pattern: P, eye: number): CatDef => ({ id: name.toLowerCase(), name, world, fur, fur2, pattern, eye });

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
  { id: 'bow', name: 'Bow', cost: 3 }, { id: 'scarf', name: 'Scarf', cost: 5 }, { id: 'flower', name: 'Flower', cost: 6 },
  { id: 'party', name: 'Party hat', cost: 8 }, { id: 'shades', name: 'Sunglasses', cost: 9 }, { id: 'beanie', name: 'Ski beanie', cost: 10 },
  { id: 'jersey', name: 'Soccer jersey', cost: 12 }, { id: 'backpack', name: 'Backpack', cost: 13 }, { id: 'tutu', name: 'Tutu', cost: 15 },
  { id: 'cape', name: 'Cape', cost: 18 }, { id: 'wizard', name: 'Wizard hat', cost: 22 }, { id: 'crown', name: 'Crown', cost: 25 },
];

const sph = (r: number, ws = 14, hs = 10) => new SphereGeometry(r, ws, hs);
const cone = (r: number, h: number, s = 10) => new ConeGeometry(r, h, s);
const cyl = (rt: number, rb: number, h: number, s = 12, open = false) => new CylinderGeometry(rt, rb, h, s, 1, open);
const ORANGE = 0xf0a040, PINK = 0xff9fb8, DARK = 0x1e1e2c, WHITE = 0xffffff;

/** A cat about 1 unit tall, feet at y = 0, facing +z. */
export function catGeometry(cat: CatDef, acc: string | null, pose: 'sit' | 'walk' = 'sit'): BufferGeometry {
  const { fur, fur2, pattern: pt } = cat;
  const sit = pose === 'sit';
  const H: V3 = sit ? [0, 0.68, 0.05] : [0, 0.58, 0.3]; // head centre
  const B: V3 = sit ? [0, 0.27, 0] : [0, 0.31, -0.06]; // body centre
  const h = (x: number, y: number, z: number): V3 => [H[0] + x, H[1] + y, H[2] + z];
  const b = (x: number, y: number, z: number): V3 => [B[0] + x, B[1] + y, B[2] + z];
  const out: BufferGeometry[] = [];
  const add = (g: BufferGeometry, color: number | ((y: number, x: number) => number), p: V3, r: V3 = [0, 0, 0], s: number | V3 = 1) => out.push(part(g, color, p, r, s));

  // pattern as vertex colours (y, x are local to the sphere)
  const headCol = (y: number, x: number): number => {
    if (pt === 'tabby') return y > 0.12 && Math.abs(Math.sin(x * 26)) > 0.72 ? fur2 : fur;
    if (pt === 'calico') return x > 0.04 && y > -0.02 ? fur2 : x < -0.06 && y > 0.05 ? ORANGE : fur;
    if (pt === 'point') return Math.abs(x) < 0.16 && y < 0.1 && y > -0.22 ? fur2 : fur;
    return fur;
  };
  const bodyCol = (y: number, x: number): number => {
    if (pt === 'tabby') return Math.sin(y * 34 + 1) > 0.5 ? fur2 : fur;
    if (pt === 'calico') return x < -0.05 && y > 0 ? fur2 : x > 0.06 && y < 0.08 ? ORANGE : fur;
    return fur;
  };
  const paw = pt === 'tux' || pt === 'point' ? fur2 : pt === 'calico' ? WHITE : fur;
  const tip = pt === 'solid' || pt === 'spots' ? fur : fur2;
  const earL = pt === 'point' ? fur2 : pt === 'calico' ? ORANGE : fur;
  const earR = pt === 'point' || pt === 'calico' ? fur2 : fur;

  // body
  if (sit) {
    add(sph(0.26), bodyCol, b(0, 0, 0), [0, 0, 0], [1, 1.08, 0.95]);
    if (pt === 'tux' || pt === 'calico') add(sph(0.17), pt === 'tux' ? fur2 : WHITE, b(0, 0.02, 0.13), [0, 0, 0], [0.85, 1.05, 0.6]);
    for (const x of [-0.1, 0.1]) add(sph(0.075, 10, 8), paw, [x, 0.06, 0.2], [0, 0, 0], [1, 0.8, 1.2]);
    for (const x of [-0.21, 0.21]) add(sph(0.08, 10, 8), paw, [x, 0.055, 0.06], [0, 0, 0], [1, 0.7, 1.3]);
    add(new TorusGeometry(0.2, 0.05, 6, 14, Math.PI * 1.1), fur, [0.16, 0.2, -0.16], [Math.PI / 2 - 0.5, 0, -0.5]);
    add(sph(0.062, 8, 6), tip, [0.35, 0.3, -0.07]);
  } else {
    add(sph(0.22), bodyCol, b(0, 0, 0), [Math.PI / 2, 0, 0], [0.95, 1.5, 0.9]);
    if (pt === 'tux' || pt === 'calico') add(sph(0.15), pt === 'tux' ? fur2 : WHITE, b(0, -0.06, 0.2), [0, 0, 0], [0.9, 0.8, 0.9]);
    for (const x of [-0.12, 0.12]) for (const z of [0.14, -0.26]) {
      add(cyl(0.055, 0.05, 0.2, 8), fur, [x, 0.13, z]);
      add(sph(0.065, 8, 6), paw, [x, 0.04, z + 0.02], [0, 0, 0], [1, 0.65, 1.25]);
    }
    add(cyl(0.04, 0.055, 0.42, 8), fur, [0, 0.52, -0.44], [-0.45, 0, 0]);
    add(sph(0.058, 8, 6), tip, [0, 0.72, -0.54]);
  }
  if (pt === 'spots') {
    const spots: V3[] = sit ? [[-0.2, 0.12, 0.08], [0.21, 0.02, 0.06], [0.1, 0.2, -0.16], [-0.12, -0.05, -0.2]] : [[-0.17, 0.08, 0.05], [0.18, 0.06, -0.1], [0, 0.19, -0.05], [0.08, 0.16, 0.18], [-0.1, 0.15, -0.25]];
    for (const [x, y, z] of spots) add(sph(0.06, 8, 6), fur2, b(x, y, z), [0, 0, 0], [1, 1, 1]);
    for (const [x, y, z] of [[-0.14, 0.24, 0.02], [0.16, 0.22, -0.04], [0.02, 0.27, -0.1]] as V3[]) add(sph(0.05, 8, 6), fur2, h(x, y, z), [0, 0, 0], [1, 0.6, 1]);
  }

  // head
  add(sph(0.3, 18, 14), headCol, h(0, 0, 0), [0, 0, 0], [1.1, 0.95, 0.95]);
  add(cone(0.12, 0.22, 8), earL, h(-0.2, 0.27, -0.02), [0, 0, 0.38]);
  add(cone(0.12, 0.22, 8), earR, h(0.2, 0.27, -0.02), [0, 0, -0.38]);
  add(cone(0.065, 0.14, 6), PINK, h(-0.195, 0.255, 0.035), [0, 0, 0.38]);
  add(cone(0.065, 0.14, 6), PINK, h(0.195, 0.255, 0.035), [0, 0, -0.38]);
  add(sph(0.1, 10, 8), pt === 'tux' ? fur2 : WHITE, h(0, -0.08, 0.215), [0, 0, 0], [1.35, 0.8, 0.6]);
  add(sph(0.028, 8, 6), 0xff7fa0, h(0, -0.045, 0.285), [0, 0, 0], [1.2, 0.8, 0.8]);
  for (const s of [-1, 1]) {
    add(sph(0.075, 12, 10), cat.eye, h(s * 0.125, 0.02, 0.232), [0, 0, 0], [1, 1.15, 0.6]);
    add(sph(0.058, 12, 10), DARK, h(s * 0.125, 0.02, 0.252), [0, 0, 0], [1, 1.15, 0.6]);
    add(sph(0.024, 8, 6), WHITE, h(s * 0.125 + 0.025, 0.05, 0.283));
    add(sph(0.012, 6, 4), WHITE, h(s * 0.125 - 0.022, -0.012, 0.286));
    add(sph(0.05, 8, 6), 0xffa8b8, h(s * 0.215, -0.07, 0.19), [0, 0, 0], [1, 0.6, 0.4]);
  }

  // legendary extras
  if (cat.id === 'sizzle') {
    for (const s of [-1, 1]) {
      add(cone(0.3, 0.5, 3), 0xff7a3a, b(s * 0.3, 0.25, -0.16), [0.2, s * 0.5, s * -1.0], [1, 1, 0.12]);
      add(cone(0.04, 0.14, 6), 0xffe08a, h(s * 0.09, 0.3, 0.05), [0.2, 0, s * -0.2]);
    }
  }
  if (cat.id === 'glimmer') {
    add(cone(0.05, 0.3, 8), 0xffd84a, h(0, 0.38, 0.13), [0.35, 0, 0]);
    [0xff8fc8, 0xb08cff, 0x7fd0ff, 0xff8fc8].forEach((col, k) => add(sph(0.085, 8, 6), col, h(0, 0.24 - k * 0.11, -0.2 - (k === 3 ? -0.04 : k * 0.03))));
  }
  if (cat.id === 'avalanche') add(sph(0.1, 10, 8), WHITE, sit ? [0.33, 0.27, -0.1] : [0, 0.66, -0.52], [0, 0, 0], [1.1, 1.3, 1.1]);
  if (cat.id === 'nova') {
    add(new OctahedronGeometry(0.07), 0xffe46a, h(0, 0.17, 0.25), [0, 0, 0], [1, 1, 0.4]);
    for (const [x, y, z] of [[-0.42, 0.25, 0], [0.44, 0.1, 0.05], [0.3, 0.42, -0.1], [-0.3, -0.25, 0.2]] as V3[]) add(new OctahedronGeometry(0.045), 0xffe46a, h(x, y, z));
  }

  // outfit
  const neck: V3 = sit ? [0, 0.47, 0.03] : [0, 0.42, 0.17];
  const ring: V3 = sit ? [Math.PI / 2, 0, 0] : [0.5, 0, 0];
  const waist: V3 = sit ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  switch (acc) {
    case 'bow':
      add(cone(0.09, 0.15, 8), 0xff4f8a, h(0.1, 0.27, 0.1), [0, 0, Math.PI / 2 + 0.3]);
      add(cone(0.09, 0.15, 8), 0xff4f8a, h(0.27, 0.22, 0.1), [0, 0, -Math.PI / 2 + 0.3]);
      add(sph(0.045, 8, 6), 0xffa8c8, h(0.185, 0.245, 0.11));
      break;
    case 'scarf':
      add(new TorusGeometry(0.2, 0.06, 8, 16), 0xe8404a, neck, ring, [1, 1, 0.9]);
      add(new BoxGeometry(0.1, 0.2, 0.04), 0xe8404a, [neck[0] + 0.12, neck[1] - 0.12, neck[2] + 0.2], [0.2, 0, -0.15]);
      add(new BoxGeometry(0.1, 0.04, 0.045), WHITE, [neck[0] + 0.135, neck[1] - 0.2, neck[2] + 0.215], [0.2, 0, -0.15]);
      break;
    case 'flower':
      for (let k = 0; k < 5; k++) add(sph(0.05, 8, 6), 0xff8fd0, h(-0.19 + Math.cos(k * 1.257) * 0.065, 0.24 + Math.sin(k * 1.257) * 0.065, 0.12), [0, 0, 0], [1, 1, 0.5]);
      add(sph(0.04, 8, 6), 0xffe04a, h(-0.19, 0.24, 0.14));
      break;
    case 'party':
      add(cone(0.13, 0.32, 12), (y) => (Math.sin(y * 30) > 0 ? 0xff5c8a : 0x4ad0ff), h(0, 0.41, 0), [0, 0, 0.1]);
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
      add(cone(0.42, 0.13, 16), (y) => (y > 0 ? 0xff7fc0 : 0xffc8e4), sit ? b(0, -0.07, 0) : b(0, 0, -0.14), sit ? [0, 0, 0] : [-Math.PI / 2, 0, 0], sit ? 1 : 0.82);
      add(new TorusGeometry(sit ? 0.235 : 0.2, 0.03, 5, 16), 0xff4f9a, sit ? b(0, -0.01, 0) : b(0, 0, -0.08), waist);
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
        add(sph(0.025, 6, 4), k % 2 ? 0x4ad0ff : 0xff5c8a, h(Math.sin(a) * 0.14, 0.455, Math.cos(a) * 0.14));
      }
      break;
    }
  }
  return merge(out);
}
