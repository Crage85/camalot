// Every tunable for Kitty Harvest: crops, upgrade curves, farms, plots, vehicles, buildings, animals, orders, bonuses.
// Pure data and formulas with no imports, so the balance simulator (shots/tractor/balance.mjs) reads the same numbers.

export type CropKind =
  | 'wheat' | 'corn' | 'sunflower' | 'carrot' | 'columbine' | 'blueberry' | 'lavender' | 'apple' | 'pumpkin' | 'mushroom'
  | 'melon' | 'hibiscus' | 'pineapple' | 'cabbage' | 'frostberry' | 'icelily' | 'moonbloom' | 'crystal' | 'dragonfruit' | 'starflower';

export interface Crop {
  name: string; // plural, shown in the HUD
  value: number; // coins per crop
  tough: number; // harvester power needed to cut it at full driving speed is tough / CUT_K
  color: number; // chaff, load pile, HUD dot
}

/** Value grows about x1.6 per step and toughness about x1.8, so tougher crops pay less per second of cutting but more per trailer. */
export const CROPS: Record<CropKind, Crop> = {
  wheat: { name: 'wheat', value: 1, tough: 1, color: 0xf2c94c },
  corn: { name: 'corn', value: 3, tough: 3.5, color: 0xffe066 },
  sunflower: { name: 'sunflowers', value: 7, tough: 10, color: 0xffc21a },
  carrot: { name: 'carrots', value: 12, tough: 20, color: 0xff8a3a },
  columbine: { name: 'columbines', value: 22, tough: 42, color: 0x9b8cf2 },
  blueberry: { name: 'blueberries', value: 36, tough: 80, color: 0x5a6fe8 },
  lavender: { name: 'lavender', value: 60, tough: 150, color: 0xb58cf0 },
  apple: { name: 'apples', value: 100, tough: 280, color: 0xe8504a },
  pumpkin: { name: 'pumpkins', value: 160, tough: 500, color: 0xff8a2a },
  mushroom: { name: 'mushrooms', value: 260, tough: 900, color: 0xe86a6a },
  melon: { name: 'melons', value: 420, tough: 1600, color: 0x5fbf4a },
  hibiscus: { name: 'hibiscus', value: 680, tough: 2900, color: 0xff5f8a },
  pineapple: { name: 'pineapples', value: 1100, tough: 5200, color: 0xf5c542 },
  cabbage: { name: 'snow cabbages', value: 1800, tough: 9500, color: 0xa8e0c0 },
  frostberry: { name: 'frostberries', value: 2900, tough: 17000, color: 0x7fd0ff },
  icelily: { name: 'ice lilies', value: 4700, tough: 31000, color: 0xd8f4ff },
  moonbloom: { name: 'moonblooms', value: 7600, tough: 56000, color: 0xc8a8ff },
  crystal: { name: 'crystal beets', value: 12000, tough: 100000, color: 0x6ff0e0 },
  dragonfruit: { name: 'dragonfruit', value: 20000, tough: 180000, color: 0xff4fa8 },
  starflower: { name: 'starflowers', value: 32000, tough: 330000, color: 0xfff08a },
};

/** Crop rows sit this far apart. */
export const CROP_SPACING = 1.25;

// ---------- Cutting rule (Craig: any crop from the start; tough crops cut slowly until the harvester is upgraded) ----------

/** While the cutter is in standing crops the tractor cannot drive faster than CUT_K * power / tough. */
export const CUT_K = 7;
export const MIN_CUT_SPEED = 0.35;
export const cutSpeed = (power: number, tough: number, top: number) => Math.min(top, Math.max(MIN_CUT_SPEED, (CUT_K * power) / tough));

// ---------- Upgrade tracks (carry over to every farm and vehicle) ----------

const nice = (x: number) => {
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1));
  return Math.round(x / p) * p;
};
export interface Track {
  name: string;
  help: string;
  max: number; // highest level; Infinity = no cap
  stat: (lv: number) => number;
  cost: (lv: number) => number; // price of level lv + 1
  show: (lv: number) => string;
}
export const TRACKS = {
  power: {
    name: 'Harvester', help: 'Stronger blades. Tough crops cut faster.', max: Infinity,
    stat: (l) => Math.pow(1.4, l), cost: (l) => nice(60 * Math.pow(1.32, l)), show: (l) => `Power ${l + 1}`,
  },
  speed: {
    name: 'Engine', help: 'Drive faster.', max: 12,
    stat: (l) => 6 + 0.75 * l, cost: (l) => nice(40 * Math.pow(2.6, l)), show: (l) => String(6 + 0.75 * l),
  },
  load: {
    name: 'Trailer', help: 'Carry more crops each trip.', max: Infinity,
    stat: (l) => Math.round((40 * Math.pow(1.22, l)) / 5) * 5, cost: (l) => nice(50 * Math.pow(1.62, l)), show: (l) => String(Math.round((40 * Math.pow(1.22, l)) / 5) * 5),
  },
  width: {
    name: 'Wide cut', help: 'Cut more rows at once.', max: 8,
    stat: (l) => 1 + 0.22 * l, cost: (l) => nice(90 * Math.pow(3.4, l)), show: (l) => `${(2 + 0.44 * l).toFixed(1)} m`,
  },
} satisfies Record<string, Track>;
export type TrackId = keyof typeof TRACKS;

// ---------- Vehicles (bought at the farm that brings them; owned for good) ----------

export type VehicleId = 'tractor' | 'truck' | 'wagon' | 'harvester' | 'combine' | 'snowcat' | 'dragon';
export interface Vehicle {
  name: string;
  blurb: string;
  farm: number; // farm index where it is sold
  cost: number; // times the base price of the farm that sells it
  speed: number; // multipliers on the upgrade tracks
  load: number;
  width: number;
  power: number;
}
export const VEHICLES: Record<VehicleId, Vehicle> = {
  tractor: { name: 'Little Red Tractor', blurb: 'The trusty first tractor.', farm: 0, cost: 0, speed: 1, load: 1, width: 1, power: 1 },
  truck: { name: 'Ranch Truck', blurb: 'Fast, with a big bed. Narrow cutter.', farm: 1, cost: 12, speed: 1.25, load: 1.8, width: 0.85, power: 1.3 },
  wagon: { name: 'Cat-Drawn Wagon', blurb: 'Two big cats pull it. Helper cats work twice as fast.', farm: 2, cost: 10, speed: 0.9, load: 2.2, width: 1.1, power: 1.6 },
  harvester: { name: 'Green Harvester', blurb: 'A wide, strong cutter. A little slow.', farm: 3, cost: 10, speed: 0.92, load: 2.6, width: 1.35, power: 2.6 },
  combine: { name: 'Sunny Combine', blurb: 'Huge cutter and a huge grain tank.', farm: 4, cost: 10, speed: 1, load: 3.6, width: 1.5, power: 4 },
  snowcat: { name: 'Snowcat Harvester', blurb: 'Tracks grip any hill. Quick and strong.', farm: 5, cost: 10, speed: 1.2, load: 4.6, width: 1.45, power: 6.5 },
  dragon: { name: 'Dragon Harvester', blurb: 'A friendly dragon that munches whole fields.', farm: 6, cost: 8, speed: 1.35, load: 6, width: 1.6, power: 10 },
};

// ---------- Helper cats (owned for good; each has a job she can change) ----------

export const HELPER_MAX = 6;
export const helperCost = (owned: number) => nice(300 * Math.pow(9, owned));
export const HELPER_SPEED = 3.4;
export type Job = 'picker' | 'hauler' | 'seller';
export const JOBS: Record<Job, { name: string; help: string }> = {
  picker: { name: 'Picker', help: 'Picks crops near your tractor.' },
  hauler: { name: 'Hauler', help: 'Carries a basket: +12% trailer room.' },
  seller: { name: 'Seller', help: 'Runs the stand: +5% coins on every sale.' },
};
export const HAULER_LOAD = 0.12;
export const SELLER_PRICE = 0.05;
/** A picker cat picks one crop every base + tough / power seconds, capped. */
export const pickSeconds = (power: number, tough: number) => Math.min(6, 0.5 + (0.4 * tough) / (CUT_K * power));

// ---------- Farm buildings (built per farm, three levels each) ----------

export type BuildId = 'silo' | 'market' | 'windmill' | 'greenhouse' | 'pen';
export const BUILDS: Record<BuildId, { name: string; help: string; per: number; mult: number }> = {
  silo: { name: 'Silo', help: '+25% trailer room on this farm per level.', per: 0.25, mult: 1 },
  market: { name: 'Market stand', help: '+12% coins for crops sold on this farm per level.', per: 0.12, mult: 1.6 },
  windmill: { name: 'Windmill', help: 'Helper cats on this farm work 40% faster per level.', per: 0.4, mult: 0.7 },
  greenhouse: { name: 'Greenhouse', help: 'Clean-sweep bonus for emptying a plot: +10% per level.', per: 0.1, mult: 1.2 },
  pen: { name: 'Animal pen', help: 'Room for 2 more animals per level.', per: 2, mult: 0.9 },
};
export const BUILD_LEVELS = 3;
export const buildCost = (farm: Farm, id: BuildId, lv: number) => nice(farm.base * 12 * BUILDS[id].mult * Math.pow(4, lv));

/** Emptying a whole plot pays this share of the plot's crop value as a bonus (plus the greenhouse). */
export const SWEEP_BONUS = 0.15;

// ---------- Animals (grow as she sells crops on their farm; adults add to every sale there) ----------

export type AnimalKind = 'chicken' | 'alpaca' | 'duck' | 'bunny' | 'turtle' | 'penguin' | 'dragonet';
export const ANIMAL_PRICE = 0.03; // each grown animal: +3% coins on this farm
export const animalCost = (farm: Farm, owned: number) => nice(farm.base * 6 * Math.pow(2.2, owned));
/** Crops sold on the farm to raise one animal from baby to grown. */
export const animalFeed = (farm: Farm, idx: number) => Math.round(farm.orderBase * 6 * (1 + idx * 0.5));

// ---------- Decorations (looks only; count toward the album) ----------

export type DecorKind = 'scarecrow' | 'flowers' | 'fountain' | 'catstatue' | 'lantern' | 'flag' | 'bench' | 'snowman' | 'sandcastle' | 'gem' | 'dragonstatue' | 'jack';
export const decorCost = (farm: Farm, idx: number) => nice(farm.base * 4 * Math.pow(2.4, idx));

// ---------- Farms ----------

export type Shape = 'rect' | 'round' | 'L' | 'ring' | 'blob' | 'diamond' | 'terrace';
export type Pattern = 'stripes' | 'patches' | 'rings' | 'checker';
export interface Plot {
  name: string;
  shape: Shape;
  x: number; z: number; w: number; d: number;
  crops: CropKind[]; // mixed by pattern
  pat: Pattern;
  cost: number; // times the farm's base price; 0 = hers from the start
  rocks: number; bales: number; trees: number;
  pond: number; // pond radius in the middle, 0 = none
  fences: number; // fence lines across the plot, each with one gate
}
const P = (name: string, shape: Shape, x: number, z: number, w: number, d: number, crops: CropKind[], pat: Pattern, cost: number, obs: Partial<Pick<Plot, 'rocks' | 'bales' | 'trees' | 'pond' | 'fences'>> = {}): Plot =>
  ({ name, shape, x, z, w, d, crops, pat, cost, rocks: 0, bales: 0, trees: 0, pond: 0, fences: 0, ...obs });

export type TreeKind = 'pine' | 'oak' | 'birch' | 'palm' | 'autumn' | 'snowpine' | 'shroom' | 'crystaltree';
export interface Farm {
  name: string;
  region: string;
  radius: number; // drivable land reaches this far from the barn
  hills: number; // hill height
  base: number; // price scale for land, buildings, animals, decorations
  cost: number; // moving here, paid once: times the base price
  orders: number; // orders to finish before the next farm opens
  orderBase: number; // crops in the first order
  animal: AnimalKind;
  animalName: string;
  decor: DecorKind[];
  trees: TreeKind[];
  /** Stream as a line of [x, z] points; bridges sit at these fractions along it. */
  stream?: { pts: [number, number][]; bridges: number[]; half: number };
  ponds: [number, number, number][]; // x, z, radius (lakes are big ponds)
  ocean?: number; // sea covers z greater than this
  barn: number; // barn wall colour
  look: { grassA: number; grassB: number; soilA: number; soilB: number; path: number; skyTop: number; skyLow: number; sun: number; water: number; rock: number; snowLine: number };
  plots: Plot[];
}

const GREEN = { grassA: 0x8fd16a, grassB: 0x7cc458, soilA: 0xb98a5a, soilB: 0xa2744a, path: 0xdcc090, skyTop: 0x4aa3f0, skyLow: 0xcfeaff, sun: 0xfff0d6, water: 0x4fb8e8, rock: 0x7f8fa8, snowLine: 0.62 };

export const FARMS: Farm[] = [
  {
    name: 'Sunny Plains Farm', region: 'Colorado plains', radius: 92, hills: 1.3, base: 60, cost: 0, orders: 8, orderBase: 45,
    animal: 'chicken', animalName: 'Chicken', decor: ['scarecrow', 'flowers', 'bench', 'flag', 'catstatue', 'fountain'], trees: ['oak', 'pine', 'birch'],
    ponds: [[-44, -34, 6]], barn: 0xd9443f, look: GREEN,
    plots: [
      P('Wheat Strip', 'rect', 0, -36, 22, 18, ['wheat'], 'stripes', 0, { bales: 2 }),
      P('Corn Corner', 'L', 36, -24, 26, 26, ['corn', 'wheat'], 'stripes', 0, { rocks: 3 }),
      P('Sunflower Round', 'round', 42, 24, 26, 26, ['sunflower', 'corn'], 'rings', 8.3, { trees: 1 }),
      P('Pond Field', 'ring', -44, -34, 38, 38, ['wheat', 'corn'], 'patches', 25, { pond: 6 }),
      P('Long Acre', 'rect', -44, 26, 18, 42, ['sunflower', 'wheat'], 'stripes', 75, { fences: 2, bales: 3 }),
      P('Big Sky Field', 'blob', 2, -72, 50, 26, ['corn', 'sunflower'], 'patches', 200, { rocks: 6, trees: 2 }),
    ],
  },
  {
    name: 'Columbine Valley Ranch', region: 'Rocky Mountain valley', radius: 112, hills: 3.4, base: 1100, cost: 20, orders: 10, orderBase: 110,
    animal: 'alpaca', animalName: 'Alpaca', decor: ['flowers', 'lantern', 'bench', 'catstatue', 'flag', 'fountain'], trees: ['pine', 'pine', 'birch'],
    stream: { pts: [[-150, -58], [-70, -50], [-20, -62], [30, -52], [80, -64], [150, -50]], bridges: [0.36, 0.62], half: 3.2 },
    ponds: [], barn: 0x9a5a3a, look: { ...GREEN, grassA: 0x86cc70, grassB: 0x6fb85e, skyTop: 0x3f95ea, rock: 0x76839c, snowLine: 0.5 },
    plots: [
      P('Valley Floor', 'rect', -32, -26, 28, 20, ['carrot', 'corn'], 'stripes', 0, { rocks: 2 }),
      P('Meadow Round', 'round', 34, -24, 26, 26, ['columbine', 'carrot'], 'rings', 0, { rocks: 3 }),
      P('Hillside Ell', 'L', 52, 26, 30, 30, ['carrot', 'sunflower'], 'checker', 13, { trees: 2, rocks: 2 }),
      P('Columbine Terrace', 'terrace', -50, 26, 32, 30, ['columbine'], 'stripes', 33, { bales: 2 }),
      P('North Bank', 'blob', -26, -88, 46, 26, ['columbine', 'sunflower'], 'patches', 73, { rocks: 6, trees: 2 }),
      P('High Pasture', 'diamond', 52, -92, 40, 40, ['columbine', 'carrot'], 'checker', 160, { rocks: 8, fences: 1 }),
    ],
  },
  {
    name: 'Lakeside Orchard', region: 'Mountain lake', radius: 124, hills: 2.4, base: 31_000, cost: 20, orders: 10, orderBase: 150,
    animal: 'duck', animalName: 'Duck', decor: ['bench', 'flowers', 'lantern', 'fountain', 'flag', 'catstatue'], trees: ['oak', 'birch', 'pine'],
    ponds: [[0, -78, 30], [70, 40, 7]], barn: 0xf4ede2, look: { ...GREEN, grassA: 0x9ad672, grassB: 0x84c860, water: 0x3fa8e0 },
    plots: [
      P('Berry Rows', 'terrace', -34, -24, 28, 22, ['blueberry'], 'stripes', 0),
      P('Lavender Curve', 'round', 36, -22, 26, 24, ['lavender', 'blueberry'], 'rings', 0, { rocks: 2 }),
      P('Apple Walk', 'rect', 70, 40, 34, 34, ['apple', 'blueberry'], 'checker', 14, { pond: 7, trees: 2 }),
      P('West Shore', 'blob', -62, -70, 30, 44, ['lavender', 'carrot'], 'patches', 32, { rocks: 4, trees: 2 }),
      P('East Shore', 'L', 62, -74, 34, 40, ['apple', 'lavender'], 'stripes', 68, { fences: 2 }),
      P('Sunset Slope', 'diamond', -58, 34, 44, 44, ['apple', 'blueberry', 'lavender'], 'patches', 145, { rocks: 5, bales: 3 }),
    ],
  },
  {
    name: 'Pumpkin Hollow', region: 'Autumn woods', radius: 128, hills: 3, base: 230_000, cost: 20, orders: 11, orderBase: 190,
    animal: 'bunny', animalName: 'Bunny', decor: ['jack', 'scarecrow', 'lantern', 'bench', 'catstatue', 'fountain'], trees: ['autumn', 'autumn', 'oak', 'pine'],
    stream: { pts: [[-150, 48], [-80, 56], [-30, 46], [40, 58], [90, 44], [150, 54]], bridges: [0.3, 0.68], half: 3 },
    ponds: [[-70, -60, 8]], barn: 0x7a4a8a,
    look: { ...GREEN, grassA: 0xc8c860, grassB: 0xb0a84a, soilA: 0x8a5a3a, soilB: 0x744a30, path: 0xd0a878, skyTop: 0xf0a060, skyLow: 0xffe6c0, sun: 0xffd9a0, rock: 0x8a7f90 },
    plots: [
      P('Pumpkin Patch', 'round', -34, -26, 28, 26, ['pumpkin', 'sunflower'], 'patches', 0, { bales: 3 }),
      P('Corn Maze', 'rect', 36, -26, 30, 26, ['corn', 'pumpkin'], 'checker', 0, { fences: 3 }),
      P('Mushroom Ring', 'ring', -70, -60, 42, 42, ['mushroom', 'pumpkin'], 'rings', 13, { pond: 8 }),
      P('Scarecrow Field', 'L', 68, -72, 40, 40, ['pumpkin', 'apple'], 'stripes', 30, { rocks: 4, trees: 3, bales: 3 }),
      P('Brook Bank', 'blob', -40, 88, 52, 28, ['mushroom', 'pumpkin'], 'patches', 67, { rocks: 6, trees: 2 }),
      P('Harvest Moon Acre', 'diamond', 56, 96, 46, 46, ['mushroom', 'sunflower', 'pumpkin'], 'checker', 147, { fences: 2, rocks: 5 }),
    ],
  },
  {
    name: 'Seashell Beach Farm', region: 'Sunny beach', radius: 134, hills: 1.6, base: 450_000, cost: 20, orders: 12, orderBase: 230,
    animal: 'turtle', animalName: 'Sea turtle', decor: ['sandcastle', 'flag', 'flowers', 'lantern', 'catstatue', 'fountain'], trees: ['palm', 'palm', 'oak'],
    ponds: [[-60, -20, 7], [50, -70, 9]], ocean: 62, barn: 0x4fc3d8,
    look: { ...GREEN, grassA: 0xf2deaa, grassB: 0xe8d096, soilA: 0xd8b878, soilB: 0xc8a465, path: 0xf8ecc8, skyTop: 0x2f9af0, skyLow: 0xd8f4ff, water: 0x38c0e8, rock: 0x6fae7a, snowLine: 2 },
    plots: [
      P('Melon Dunes', 'blob', -30, -30, 30, 24, ['melon'], 'stripes', 0, { rocks: 2 }),
      P('Hibiscus Garden', 'round', 34, -22, 26, 26, ['hibiscus', 'melon'], 'rings', 0, { trees: 1 }),
      P('Tide Pool Field', 'ring', 50, -70, 44, 44, ['melon', 'hibiscus'], 'patches', 12, { pond: 9 }),
      P('Pineapple Point', 'diamond', -72, 22, 40, 40, ['pineapple', 'melon'], 'checker', 30, { rocks: 5 }),
      P('Boardwalk Rows', 'terrace', 70, 26, 40, 36, ['pineapple', 'hibiscus'], 'stripes', 65, { fences: 2 }),
      P('Lagoon Reach', 'L', -40, -86, 50, 44, ['pineapple', 'hibiscus', 'melon'], 'patches', 140, { rocks: 6, trees: 3, bales: 2 }),
    ],
  },
  {
    name: 'Snowy Peak Farm', region: 'Ski mountain', radius: 138, hills: 5, base: 5_200_000, cost: 20, orders: 12, orderBase: 270,
    animal: 'penguin', animalName: 'Penguin', decor: ['snowman', 'lantern', 'flag', 'bench', 'catstatue', 'gem'], trees: ['snowpine', 'snowpine', 'pine'],
    stream: { pts: [[-150, -40], [-60, -52], [0, -44], [70, -58], [150, -46]], bridges: [0.32, 0.6], half: 2.8 },
    ponds: [[60, 44, 9]], barn: 0x4a6fd8,
    look: { grassA: 0xf4f8ff, grassB: 0xe2ecf8, soilA: 0xc8d8ea, soilB: 0xb0c4dc, path: 0xd8e4f2, skyTop: 0x5f9ff0, skyLow: 0xeaf4ff, sun: 0xfff4e6, water: 0x8fd8f4, rock: 0x8a98b8, snowLine: 0.25 },
    plots: [
      P('Cabbage Bowl', 'round', -34, -22, 28, 24, ['cabbage'], 'stripes', 0, { rocks: 2 }),
      P('Frostberry Run', 'rect', 36, -22, 20, 30, ['frostberry', 'cabbage'], 'stripes', 0, { trees: 2 }),
      P('Frozen Pond Field', 'ring', 60, 44, 44, 44, ['cabbage', 'frostberry'], 'rings', 12, { pond: 9 }),
      P('Slalom Slope', 'terrace', -62, 34, 36, 48, ['frostberry', 'icelily'], 'stripes', 30, { trees: 4, fences: 2 }),
      P('Summit Meadow', 'diamond', -46, -96, 48, 48, ['icelily', 'frostberry'], 'checker', 68, { rocks: 8 }),
      P('Powder Bowl', 'blob', 54, -98, 56, 34, ['icelily', 'cabbage', 'frostberry'], 'patches', 150, { rocks: 6, trees: 3 }),
    ],
  },
  {
    name: 'Dragon Meadow', region: 'Fantasy kingdom', radius: 144, hills: 3.6, base: 43_000_000, cost: 20, orders: 14, orderBase: 320,
    animal: 'dragonet', animalName: 'Baby dragon', decor: ['dragonstatue', 'gem', 'lantern', 'fountain', 'catstatue', 'flowers'], trees: ['shroom', 'crystaltree', 'oak', 'shroom'],
    stream: { pts: [[-150, 60], [-70, 50], [-10, 62], [50, 50], [150, 64]], bridges: [0.34, 0.6], half: 3 },
    ponds: [[-64, -56, 10], [20, -110, 12]], barn: 0xb06ae8,
    look: { grassA: 0x8fe0c0, grassB: 0x74d0c8, soilA: 0x7a5aa8, soilB: 0x684a96, path: 0xe8c8f0, skyTop: 0x7a5ae8, skyLow: 0xffd0ec, sun: 0xffe6f4, water: 0x6ae0f0, rock: 0x8a70c0, snowLine: 0.55 },
    plots: [
      P('Moonbloom Glade', 'round', -34, -24, 28, 26, ['moonbloom'], 'rings', 0, { rocks: 2 }),
      P('Crystal Rows', 'terrace', 38, -26, 30, 26, ['crystal', 'moonbloom'], 'stripes', 0),
      P('Wishing Pond Ring', 'ring', -64, -56, 46, 46, ['moonbloom', 'crystal'], 'patches', 11, { pond: 10 }),
      P('Dragonfruit Terraces', 'L', 72, 8, 40, 46, ['dragonfruit', 'crystal'], 'checker', 29, { rocks: 5, trees: 3 }),
      P('Starfall Field', 'diamond', -66, 6, 44, 44, ['starflower', 'moonbloom'], 'rings', 69, { fences: 2, rocks: 4 }),
      P('Rainbow Bank', 'blob', -30, 100, 60, 30, ['starflower', 'dragonfruit'], 'patches', 157, { rocks: 6, trees: 3 }),
      P('Castle Green', 'rect', 76, -84, 48, 48, ['starflower', 'dragonfruit', 'crystal', 'moonbloom'], 'checker', 343, { fences: 3, pond: 6, bales: 4 }),
    ],
  },
];

/** Real prices: every farm has one price level (`base`) that the balance simulator tunes. */
export const plotCost = (f: Farm, p: Plot) => nice(f.base * p.cost);
export const farmCost = (f: Farm) => nice(f.base * f.cost);
export const vehicleCost = (id: VehicleId) => nice(FARMS[VEHICLES[id].farm].base * VEHICLES[id].cost);

/** Crops grown on a farm, cheapest first. */
export const farmCrops = (f: Farm): CropKind[] =>
  [...new Set(f.plots.flatMap((p) => p.crops))].sort((a, b) => CROPS[a].value - CROPS[b].value);

// ---------- Orders (deliveries with goals; the first `farm.orders` of them open the next farm, then they go on for ever) ----------

export interface Order {
  needs: { crop: CropKind; count: number }[];
  reward: number;
}
export function orderFor(farmIdx: number, j: number, season = 0): Order {
  const f = FARMS[farmIdx];
  const crops = farmCrops(f).filter((c) => CROPS[c].value >= CROPS[farmCrops(f)[0]].value); // every crop on this farm
  const size = f.orderBase * (1 + 0.3 * j);
  const pick = (k: number) => {
    const idx = k % crops.length;
    return { crop: crops[idx], count: Math.max(10, Math.round(size / (1 + idx * 0.6) / 10) * 10) };
  };
  const needs = j % 3 === 2 ? [pick(j), pick(j + 1)] : [pick(j)];
  const m = seasonMult(season);
  return { needs, reward: nice(needs.reduce((s, n) => s + n.count * CROPS[n.crop].value, 0) * 0.6 * m) };
}

// ---------- Golden seasons (the replay layer after the last farm) ----------

/** Each golden season makes every crop this many times tougher and more valuable; orders start again. */
export const SEASON_STEP = 12;
export const seasonMult = (season: number) => Math.pow(SEASON_STEP, season);

// ---------- Album (collections) ----------

/** Crops harvested of one kind to earn each medal; the reward is this many crops' worth of coins. */
export const MEDALS = [300, 3000, 30_000];
export const MEDAL_NAMES = ['Bronze', 'Silver', 'Gold'];
export const MEDAL_REWARD = [40, 300, 2000];

// ---------- Bonuses earned with a school question ----------

export const TURBO_SECONDS = 60;
export const TURBO_MULT = 1.6;
export const TEMP_HELPER_SECONDS = 90;
export const SUPER_SECONDS = 60;
export const SUPER_POWER = 2.5;
/** Epic (pencil-and-paper) rewards. */
export const MEGA_SECONDS = 240;
export const MEGA_POWER = 8;
export const CHEST_MULT = 4; // treasure chest after a finished order: this many times the order reward

/** Hills slow the tractor going up and speed it going down, within these limits. */
export const SLOPE_FACTOR = 1.6;

// ---------- Getting un-stuck ----------

/** The Unstuck button lights up after she has tried to drive this many seconds while moving less than STUCK_MOVE metres. */
export const STUCK_SECONDS = 2;
export const STUCK_MOVE = 0.5;
/** The bump-out hop: how long it takes and how high it lifts the vehicle. */
export const HOP_SECONDS = 0.75;
export const HOP_HEIGHT = 2.6;
