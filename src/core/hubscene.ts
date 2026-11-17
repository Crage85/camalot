// The hub's art, drawn in code (D7): a live header scene (the castle isle of Camalot) and one still emblem per
// game card. Cel shading on the shared 3-step ramp, inverted-hull ink outlines. Kept light for tablets: about
// 120 small meshes, pixel ratio capped at 1.5, emblems rendered once to images.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

/** The shared cel ramp: 0.35 / 0.7 / 1.0, hard steps. */
const RAMP = new THREE.DataTexture(new Uint8Array([89, 179, 255]), 3, 1, THREE.RedFormat);
RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter;
RAMP.needsUpdate = true;

const C = {
  ink: 0x0a0d20, teal: 0x2fd0c0, tealDeep: 0x16808f, gold: 0xf2c46b, ivory: 0xf5efe0, stone: 0xd8cfc0,
  violet: 0x7a4be0, rock: 0x4d4182, navy: 0x27337a, ruby: 0xe5484d, grass: 0x3fb37c, ice: 0x79b4f0,
  wheat: 0xe9b949, earth: 0x74502f, night: 0x07040f, cloud: 0xffe6ee, pine: 0x1d6d62,
};

/** Hull geometry: the same triangles with smoothed normals, so pushed-out faces stay joined at hard edges. */
const hulls = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function hullOf(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let h = hulls.get(g);
  if (!h) {
    const bare = g.clone();
    bare.deleteAttribute('normal');
    bare.deleteAttribute('uv');
    h = mergeVertices(bare);
    h.computeVertexNormals();
    hulls.set(g, h);
  }
  return h;
}

/** A part maker for one scene: toon mesh plus its ink hull, `t` thick. */
function kit(t: number) {
  const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
  inkMat.customProgramCacheKey = () => 'ink' + t;
  inkMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${t.toFixed(3)};`);
  };
  const mats = new Map<string, THREE.MeshToonMaterial>();
  return (parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, p: V3, r: V3 = [0, 0, 0], glow = 0, scale = 1): THREE.Mesh => {
    const key = `${color}:${glow}`;
    let m = mats.get(key);
    if (!m) mats.set(key, (m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP, emissive: color, emissiveIntensity: glow })));
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...p);
    mesh.rotation.set(...r);
    mesh.scale.setScalar(scale);
    mesh.add(new THREE.Mesh(hullOf(geo), inkMat));
    parent.add(mesh);
    return mesh;
  };
}
type Part = ReturnType<typeof kit>;

function lights(scene: THREE.Scene): void {
  const sun = new THREE.DirectionalLight(0xfff1d6, 3);
  sun.position.set(-6, 5, 3);
  scene.add(sun, new THREE.HemisphereLight(0xaab8ff, 0x6a3a6a, 1.4));
}

// Shared shapes.
const ball = new THREE.SphereGeometry(1, 14, 10);
const facet = new THREE.IcosahedronGeometry(1, 1);
const gem = new THREE.OctahedronGeometry(1);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const cyl = (a: number, b: number, h: number, seg = 8) => new THREE.CylinderGeometry(a, b, h, seg);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

/** A wyrm's head, about 1 unit long, snout toward +z: swept gold horns, slit eyes, fin under the jaw. */
function wyrmHead(part: Part, parent: THREE.Object3D, scale: number): THREE.Group {
  const h = new THREE.Group();
  h.scale.setScalar(scale);
  part(h, facet, C.teal, [0, 0, 0], [0, 0, 0], 0, 0.42);
  part(h, cone(0.3, 0.9, 6), C.teal, [0, -0.06, 0.55], [Math.PI / 2, 0, 0]);
  part(h, cone(0.2, 0.5, 5), C.tealDeep, [0, -0.3, 0.2], [Math.PI * 0.8, 0, 0]);
  for (const x of [-1, 1]) {
    part(h, cone(0.11, 0.95, 5), C.gold, [x * 0.26, 0.38, -0.42], [-1.05, 0, -x * 0.25]);
    part(h, gem, C.gold, [x * 0.27, 0.12, 0.3], [0.2, x * 0.5, x * 0.6], 1, 0.1).scale.set(0.16, 0.07, 0.1);
  }
  parent.add(h);
  return h;
}

// ---------- one emblem per game (each fits a sphere of radius 1.4) ----------

const EMBLEM: Record<string, (part: Part, g: THREE.Group) => void> = {
  // A wyrm coiled upward around a gold gem.
  wyrm(part, g) {
    const at = (i: number): V3 => [Math.cos(i * 0.27) * (1 - i * 0.014), -1.25 + i * 0.058, Math.sin(i * 0.27) * (1 - i * 0.014)];
    for (let i = 0; i < 30; i++) {
      const seg = part(g, ball, i % 4 < 2 ? C.teal : C.tealDeep, at(i), [0, 0, 0], 0, 0.12 + i * 0.006);
      if (i % 3 === 1 && i > 4) part(seg, cone(0.3, 1.3, 4), C.gold, [0, 1.1, 0]);
    }
    const head = wyrmHead(part, g, 0.95);
    head.position.set(...at(31));
    head.position.y += 0.1;
    head.lookAt(-3, 0.4, 5);
    part(g, gem, C.gold, [0, -0.35, 0], [0, 0.5, 0], 0.4, 0.4);
    g.scale.setScalar(0.92);
  },
  // A toothed rift in the ground with a tower falling in.
  hole(part, g) {
    const maw = new THREE.Group();
    maw.rotation.x = 0.5;
    g.add(maw);
    part(maw, new THREE.TorusGeometry(1, 0.2, 8, 20), C.rock, [0, 0, 0], [Math.PI / 2, 0, 0]);
    part(maw, new THREE.TorusGeometry(0.8, 0.07, 6, 20), C.violet, [0, 0.02, 0], [Math.PI / 2, 0, 0], 0.9);
    part(maw, cyl(0.82, 0.5, 0.3, 20), C.night, [0, -0.12, 0]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      part(maw, cone(0.13, 0.5, 5), C.ivory, [Math.cos(a) * 0.86, 0.18, Math.sin(a) * 0.86], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]);
    }
    const tower = part(maw, cyl(0.2, 0.24, 0.8), C.stone, [0.15, 0.75, -0.1], [0.3, 0, -0.5]);
    part(tower, cone(0.3, 0.7, 6), C.teal, [0, 0.75, 0]);
    part(maw, gem, C.violet, [-0.45, 0.9, 0.2], [0.4, 0.3, 0], 0.8, 0.14);
  },
  // A floating field with a barn and a windmill.
  tractor(part, g) {
    part(g, cone(1.1, 1.1, 7), C.rock, [0, -0.95, 0], [Math.PI, 0, 0]);
    part(g, cyl(1.2, 1.1, 0.3, 7), C.earth, [0, -0.3, 0]);
    part(g, cyl(1.22, 1.22, 0.12, 7), C.wheat, [0, -0.1, 0]);
    part(g, box(0.62, 0.5, 0.55), C.ruby, [-0.42, 0.2, 0.1]);
    part(g, cone(0.56, 0.4, 4), C.navy, [-0.42, 0.65, 0.1], [0, Math.PI / 4, 0]);
    part(g, cyl(0.12, 0.17, 1.1, 6), C.stone, [0.5, 0.5, -0.2]);
    const hubMesh = part(g, ball, C.gold, [0.5, 1.02, -0.02], [0, 0, 0.4], 0, 0.09);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      part(hubMesh, box(1.4, 6.2, 0.3), C.ivory, [Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0], [0, 0, a - Math.PI / 2]);
    }
    for (let i = 0; i < 5; i++) part(g, cone(0.07, 0.42, 5), C.grass, [-0.2 + i * 0.22, 0.14, 0.72 - Math.abs(i - 2) * 0.12]);
  },
  // A cat familiar's mask with a spell gem and three orbiting runestones.
  match3(part, g) {
    const head = part(g, facet, C.violet, [0, -0.15, 0], [0, 0, 0], 0, 0.9);
    part(head, cone(0.38, 0.85, 4), C.violet, [-0.62, 0.95, 0], [0, 0, 0.35]);
    part(head, cone(0.38, 0.85, 4), C.violet, [0.62, 0.95, 0], [0, 0, -0.35]);
    part(head, gem, C.teal, [-0.4, 0.1, 0.84], [0, 0, 0.45], 1, 0.2).scale.set(0.3, 0.13, 0.12);
    part(head, gem, C.teal, [0.4, 0.1, 0.84], [0, 0, -0.45], 1, 0.2).scale.set(0.3, 0.13, 0.12);
    part(head, gem, C.gold, [0, 0.58, 0.8], [0, 0, 0], 0.5, 0.2);
    part(head, cone(0.1, 0.16, 3), C.ruby, [0, -0.22, 1.0], [Math.PI, 0, 0]);
    const stones = [C.ruby, C.gold, C.violet];
    stones.forEach((c, i) => {
      const a = 0.6 + (i / 3) * Math.PI * 2;
      part(g, gem, c, [Math.cos(a) * 1.25, 0.2 + Math.sin(a * 2) * 0.5, Math.sin(a) * 0.5 + 0.5], [0.3, a, 0.2], 0.5, 0.24);
    });
  },
  // A struck ball with speed trails and an impact burst.
  runner(part, g) {
    const b = part(g, facet, C.ivory, [0.3, 0, 0], [0.3, 0.4, 0], 0, 0.62);
    part(b, cyl(0.42, 0.42, 0.1, 5), C.navy, [0, 0.2, 0.93], [Math.PI / 2 - 0.2, 0, 0]);
    part(b, cyl(0.36, 0.36, 0.1, 5), C.navy, [-0.8, -0.45, 0.4], [Math.PI / 2, 0, 1]);
    part(b, cyl(0.36, 0.36, 0.1, 5), C.navy, [0.75, -0.5, 0.45], [Math.PI / 2, 0, -1]);
    [C.gold, C.teal, C.gold].forEach((c, i) => part(g, box(1.1 - i * 0.2, 0.09, 0.09), c, [-0.9 + i * 0.1, 0.35 - i * 0.35, 0], [0, 0, 0.12], 0.4));
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      part(g, cone(0.07, 0.42, 4), i % 2 ? C.teal : C.gold, [0.3 + Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0], [0, 0, a - Math.PI / 2], 0.6);
    }
  },
  // A claimed peak: snow cap, gold banner, pines.
  trail(part, g) {
    part(g, cone(0.75, 1.1, 5), C.navy, [-0.7, -0.55, -0.4]);
    part(g, cone(1.05, 1.9, 5), C.ice, [0.1, -0.15, 0]);
    part(g, cone(0.44, 0.8, 5), C.ivory, [0.1, 0.41, 0]);
    part(g, cyl(0.03, 0.03, 0.7, 5), C.ivory, [0.1, 1.05, 0]);
    part(g, box(0.5, 0.28, 0.04), C.gold, [0.36, 1.24, 0], [0, 0, 0], 0.3);
    part(g, cone(0.2, 0.55, 6), C.pine, [0.95, -0.85, 0.45]);
    part(g, cone(0.16, 0.45, 6), C.pine, [-0.3, -0.9, 0.7]);
    part(g, box(0.07, 0.03, 1.0), C.teal, [0.5, -0.45, 0.62], [0.95, 0.5, 0], 0.6);
  },
};

/** Renders each game's emblem once and hands it to the card images (img[data-art="<game id>"]). */
function drawEmblems(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  lights(scene);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  cam.position.set(0, 1.2, 5.7);
  cam.lookAt(0, 0, 0);
  const part = kit(0.035);
  for (const img of document.querySelectorAll<HTMLImageElement>('img[data-art]')) {
    const g = new THREE.Group();
    g.rotation.y = -0.45;
    EMBLEM[img.dataset.art!](part, g);
    scene.add(g);
    renderer.render(scene, cam);
    img.src = renderer.domElement.toDataURL(); // same task as the render, so the drawing buffer is still there
    scene.remove(g);
  }
  renderer.dispose();
  renderer.forceContextLoss();
}

// ---------- the live header: Camalot, a castle on a floating isle ----------

function buildHero(part: Part, scene: THREE.Scene) {
  const isle = new THREE.Group();
  scene.add(isle);
  part(isle, cone(2.7, 3.0, 7), C.rock, [0, -1.85, 0], [Math.PI, 0, 0]);
  part(isle, cyl(2.85, 2.7, 0.4, 7), C.grass, [0, -0.2, 0]);
  part(isle, cone(0.5, 1.0, 5), C.rock, [1.2, -2.6, 0.6], [Math.PI, 0, 0]);

  const castle = new THREE.Group();
  castle.scale.setScalar(0.78);
  isle.add(castle);
  part(castle, box(1.9, 1.8, 1.4), C.stone, [0, 0.9, 0]);
  part(castle, cone(1.5, 1.2, 4), C.tealDeep, [0, 2.4, 0], [0, Math.PI / 4, 0]);
  part(castle, box(0.5, 0.75, 0.1), C.ink, [0, 0.38, 0.7]);
  for (const x of [-0.55, 0.55]) part(castle, box(0.18, 0.36, 0.06), C.gold, [x, 1.2, 0.72], [0, 0, 0], 1);
  part(castle, cyl(0.3, 0.36, 3.0), C.stone, [0, 3.3, 0]);
  part(castle, cone(0.5, 1.7), C.teal, [0, 5.65, 0]);
  part(castle, box(0.14, 0.3, 0.06), C.gold, [0, 4.2, 0.32], [0, 0, 0], 1);
  const flags: THREE.Mesh[] = [];
  const towers: V3[] = [[-1.35, 0, 0.75], [1.35, 0, 0.75], [-1.2, 0, -0.75], [1.2, 0, -0.75]];
  towers.forEach(([x, , z], i) => {
    const h = i < 2 ? 2.7 : 3.7;
    part(castle, cyl(0.34, 0.4, h), C.stone, [x, h / 2, z]);
    part(castle, cyl(0.44, 0.34, 0.25), C.stone, [x, h, z]);
    part(castle, cone(0.56, 1.5), C.teal, [x, h + 0.85, z]);
    part(castle, cyl(0.025, 0.025, 0.6, 4), C.ivory, [x, h + 1.85, z]);
    flags.push(part(castle, box(0.5, 0.26, 0.03), C.gold, [x + 0.27, h + 2.0, z], [0, 0, 0], 0.3));
  });
  part(isle, cone(0.3, 0.9, 6), C.pine, [-2.0, 0.45, 0.6]);
  part(isle, cone(0.25, 0.7, 6), C.pine, [2.1, 0.35, 0.3]);
  part(isle, cone(0.22, 0.6, 6), C.pine, [1.7, 0.3, 1.3]);

  // Small rocks that carry teal crystals.
  const rocks = ([[-5.6, 0.2, -1], [5.2, 1.3, -1.5], [8.6, -0.6, 0], [-9.2, 1.2, -0.5]] as V3[]).map((p, i) => {
    const r = new THREE.Group();
    r.position.set(...p);
    r.scale.setScalar(0.55 + (i % 2) * 0.25);
    part(r, cone(0.9, 1.3, 6), C.rock, [0, -0.65, 0], [Math.PI, 0, 0]);
    part(r, cyl(0.95, 0.9, 0.16, 6), C.grass, [0, 0.06, 0]);
    const crystal = part(r, gem, C.teal, [0, 0.75, 0], [0, 0, 0], 0.8, 0.42);
    crystal.scale.y = 0.75;
    scene.add(r);
    return { r, crystal, y: p[1] };
  });

  const clouds = ([[-11, 2.4, -4, 1.5], [-4.5, -1.9, -3, 1.1], [7, 2.7, -5, 1.6], [12, -1.4, -3, 1.2], [1, 3.4, -7, 1.2]] as number[][]).map(([x, y, z, s]) => {
    const c = new THREE.Group();
    c.position.set(x, y, z);
    c.scale.set(s, s * 0.5, s * 0.7);
    [[-1.3, 0, 0, 0.8], [0, 0.25, 0, 1.15], [1.3, -0.05, 0, 0.85], [0.5, -0.2, 0.5, 0.8]].forEach(([cx, cy, cz, cs]) => part(c, ball, C.cloud, [cx, cy, cz], [0, 0, 0], 0.15, cs));
    scene.add(c);
    return c;
  });

  // A wyrm that circles the isle.
  const body = Array.from({ length: 30 }, (_, i) => {
    const seg = part(scene, ball, i % 4 < 2 ? C.teal : C.tealDeep, [0, 0, 0], [0, 0, 0], 0, 0.34 - i * 0.009);
    if (i % 3 === 1) part(seg, cone(0.3, 1.4, 4), C.gold, [0, 1.1, 0]);
    return seg;
  });
  const head = wyrmHead(part, scene, 1.25);
  const path = (a: number, v: THREE.Vector3) => v.set(Math.cos(a) * 7.4, 1.9 + Math.sin(a * 2.3) * 0.9, Math.sin(a) * 3.4);
  const ahead = new THREE.Vector3();

  return (t: number) => {
    isle.position.y = Math.sin(t * 0.6) * 0.12;
    isle.rotation.y = Math.sin(t * 0.17) * 0.22;
    flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 3 + i) * 0.5));
    rocks.forEach(({ r, crystal, y }, i) => {
      r.position.y = y + Math.sin(t * 0.8 + i * 2) * 0.2;
      crystal.rotation.y = t * 0.9 + i;
    });
    clouds.forEach((c, i) => {
      c.position.x += 0.004 + i * 0.001;
      if (c.position.x > 17) c.position.x = -17;
    });
    const a0 = t * 0.3;
    path(a0, head.position);
    head.lookAt(path(a0 + 0.1, ahead));
    body.forEach((seg, i) => path(a0 - 0.05 - i * 0.03, seg.position));
  };
}

/** Starts the hub art: card emblems first, then the live header in `canvas`. */
export function startHubArt(canvas: HTMLCanvasElement): void {
  drawEmblems();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  lights(scene);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const tick = buildHero(kit(0.045), scene);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const draw = (ms: number) => {
    tick(ms / 1000);
    renderer.render(scene, cam);
  };
  new ResizeObserver(() => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // A narrow header (tablet upright, phone) pulls the camera back so the whole castle stays in view.
    cam.position.set(0, 1.6, Math.max(15.5, 32 / cam.aspect));
    cam.lookAt(0, 1.3, 0);
    cam.updateProjectionMatrix();
    if (still) draw(0);
  }).observe(canvas);
  if (!still) renderer.setAnimationLoop(draw);
}
