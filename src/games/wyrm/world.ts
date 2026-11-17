// Everything that moves, drawn in 3D: wyrms, gems, potions, effects, lights, camera, and the bloom pass.
// Dynamic things are instanced (one draw call per kind). The places themselves are built in scenery.ts.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T, POTIONS, radiusOf, type Arena, type Accessory } from './data';
import type { Sim, Wyrm } from './sim';
import { buildArena, merge, m4, flatMat, glowMat, inkMat, hullGeo, instanced, dotTexture, type Part, type Scenery } from './scenery';

const MAX_W = T.bots + 2; // player, bots, boss
const MAX_SEG = 300;
const MAX_PARTICLES = 1400;
const MAX_RINGS = 40;
const MAX_FX = 48; // flashes, radial bursts, slash arcs
const MAX_GLINTS = 200;
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

/** Cel-shaded skin with a hard rim light on the sunlit side. `dorsal` paints a dark saddle along the top. */
function skinMat(opts: THREE.MeshToonMaterialParameters = {}, rim = 0.5, dorsal = false) {
  const m = flatMat(opts);
  m.onBeforeCompile = (sh) => {
    if (dorsal) {
      sh.vertexShader = 'varying float vTop;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvTop = position.y;');
      sh.fragmentShader = 'varying float vTop;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tfloat spine = 0.0;\n\tdiffuseColor.rgb *= mix(1.0, 0.62, smoothstep(0.86, 0.875, vTop)) * (1.0 + spine * 1.6);');
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${dorsal ? '(0.06 + spine * 0.5)' : '0.06'};`)
      .replace('#include <opaque_fragment>', `float rimK = smoothstep(0.6, 0.68, 1.0 - saturate(dot(normal, normalize(vViewPosition))));
	#if NUM_DIR_LIGHTS > 0
	rimK *= step(0.0, dot(normal, directionalLights[0].direction));
	#endif
	outgoingLight += (diffuseColor.rgb * 0.5 + 0.12) * rimK * ${rim.toFixed(2)};
	#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `skin${rim}${dorsal}`;
  return m;
}

/** A small picture drawn in code, for the camera-facing effects. */
function fxTexture(draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.translate(128, 128);
  g.scale(2, 2);
  g.fillStyle = '#fff';
  draw(g);
  return new THREE.CanvasTexture(cv);
}
/** Radial impact lines: thin spikes of mixed length around a clear centre. */
const starTexture = () => fxTexture((g) => {
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * 6.283 + ((k * 7) % 5) * 0.05, len = 34 + ((k * 13) % 7) * 4.5, w = 0.06 + ((k * 5) % 3) * 0.035;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * 20, Math.sin(a - w) * 20); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.lineTo(Math.cos(a + w) * 20, Math.sin(a + w) * 20);
    g.fill();
  }
});
/** A crescent slash arc. */
const slashTexture = () => fxTexture((g) => {
  g.beginPath(); g.arc(0, 0, 58, Math.PI * 1.08, Math.PI * 1.92); g.arc(0, 12, 60, Math.PI * 1.86, Math.PI * 1.14, true); g.closePath(); g.fill();
});
/** A four-point glint. */
const glintTexture = () => fxTexture((g) => {
  for (const [a, b] of [[60, 6], [6, 60], [20, 20]]) { g.beginPath(); g.moveTo(-a, 0); g.quadraticCurveTo(0, 0, 0, -b); g.quadraticCurveTo(0, 0, a, 0); g.quadraticCurveTo(0, 0, 0, b); g.quadraticCurveTo(0, 0, -a, 0); g.fill(); }
});

interface HeadItem { p: [number, number, number]; s: [number, number, number]; r?: [number, number, number] }
interface HeadPart {
  mesh: THREE.InstancedMesh;
  items: HeadItem[];
  tint: 'head' | 'acc' | 'eye' | 'fixed';
  acc?: Accessory;
  evo?: number;
  dyn?: 'eye' | 'pupil' | 'mouth';
}
type V3 = [number, number, number];
/** A part and its mirror image on the other side of the head. */
const mir = (p: V3, s: V3, r: V3 = [0, 0, 0]): HeadItem[] => [{ p, s, r }, { p: [p[0], p[1], -p[2]], s, r: [-r[0], -r[1], r[2]] }];
interface Fx { kind: number; x: number; y: number; z: number; t: number; dur: number; size: number; col: number; rot: number }

interface WyrmFx { pulses: number[]; chomp: number; blink: number; trail: number; pop: number }

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.5, 1600);
  low = false;
  private composer: EffectComposer | null = null;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 0.6);
  private sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
  private scenery: Scenery | null = null;
  private arena: Arena | null = null;
  private simRef: Sim | null = null;
  private body: THREE.InstancedMesh;
  private bodyGeo: [THREE.BufferGeometry, THREE.BufferGeometry];
  private heads: HeadPart[] = [];
  private fins: THREE.InstancedMesh;
  private wings: THREE.InstancedMesh;
  private orbs: THREE.InstancedMesh; // tail gems and sprite gems
  private gems: THREE.InstancedMesh;
  private halos: THREE.InstancedMesh;
  private bottles: THREE.InstancedMesh;
  private corks: THREE.InstancedMesh;
  private beams: THREE.InstancedMesh;
  private bubbles: THREE.InstancedMesh;
  private crown: THREE.Mesh;
  private sparks: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private fxMesh: THREE.InstancedMesh[] = []; // 0 flash, 1 radial lines, 2 slash arc
  private fxList: Fx[] = [];
  private auras: number[] = []; // x, z, size, colour per ring, rebuilt every frame
  private glints: THREE.InstancedMesh;
  private speed: THREE.Mesh;
  private speedK = 0;
  private inks: { src: THREE.InstancedMesh; hull: THREE.InstancedMesh; always: boolean }[] = [];
  private bodyInk!: THREE.InstancedMesh;
  private p = { x: new Float32Array(MAX_PARTICLES), y: new Float32Array(MAX_PARTICLES), z: new Float32Array(MAX_PARTICLES), vx: new Float32Array(MAX_PARTICLES), vy: new Float32Array(MAX_PARTICLES), vz: new Float32Array(MAX_PARTICLES), st: new Float32Array(MAX_PARTICLES), life: new Float32Array(MAX_PARTICLES), size: new Float32Array(MAX_PARTICLES), g: new Float32Array(MAX_PARTICLES), col: new Uint32Array(MAX_PARTICLES), n: 0 };
  private ringList: { x: number; z: number; t: number; dur: number; size: number; col: number }[] = [];
  private fx = new Map<number, WyrmFx>();
  private palettes = new WeakMap<number[], THREE.Color[]>();
  private gemPalette: THREE.Color[] = [];
  private camTarget = new THREE.Vector3();
  private lead = new THREE.Vector3();
  private camH = 30;
  private trauma = 0;
  private fovKick = 0;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpC = new THREE.Color();
  private tmpC2 = new THREE.Color();
  private tmpM = new THREE.Matrix4();
  private tmpM2 = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpE2 = new THREE.Euler(0, 0, 0, 'YXZ');
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private time = 0;
  private haloK = 1;
  private size = new THREE.Vector2(1, 1);
  // what the camera can see this frame, around its target: half-width, distance north (-z), distance south (+z)
  private view = { x: 0, z: 0, w: 1e9, n: 1e9, s: 1e9 };

  constructor(canvas: HTMLCanvasElement, low: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 320;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    const skin = skinMat();
    this.bodyGeo = [new THREE.SphereGeometry(1, 14, 10), new THREE.SphereGeometry(1, 9, 6)];
    this.body = instanced(this.bodyGeo[0], skinMat({}, 0.5, true), MAX_W * MAX_SEG, true);
    this.body.receiveShadow = true;
    this.bodyInk = this.ink(this.body, 0.05, true);

    // a lean dragon head: wedge snout, hinged jaw, fangs, angry brow ridges, glowing slit-pupil eyes, a glowing
    // forehead gem and snout line, and swept horns, blade fins, a spear horn, or long antlers
    const sph = new THREE.SphereGeometry(1, 16, 12), lo = new THREE.IcosahedronGeometry(1, 1);
    const wedge = new THREE.ConeGeometry(1, 1, 8).rotateZ(-Math.PI / 2).translate(0.5, 0, 0); // base at the origin, tip forward
    const spike = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0); // base at the origin, tip up
    const blade = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
    const dark = flatMat({ color: 0x140c1c });
    const shine = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8) });
    const eyeGlow = glowMat(0.55), accGlow = glowMat(0.9);
    const bone = flatMat({ color: 0xf4efe6 });
    const defs: [THREE.BufferGeometry, THREE.Material, HeadPart['tint'], HeadItem[], Partial<Pick<HeadPart, 'acc' | 'evo' | 'dyn'>>?][] = [
      [sph, skin, 'head', [{ p: [0, 0, 0], s: [0.98, 0.68, 0.8] }]],
      [wedge, skin, 'head', [{ p: [0.2, -0.02, 0], s: [1.45, 0.46, 0.6] }]],
      [wedge, skin, 'head', [{ p: [0.15, -0.3, 0], s: [1.3, 0.2, 0.46] }], { dyn: 'mouth' }],
      [wedge, skin, 'acc', mir([0.05, 0.5, 0.3], [1.0, 0.14, 0.2], [0, 0.3, -0.14])],
      [sph, eyeGlow, 'eye', mir([0.55, 0.4, 0.52], [0.31, 0.1, 0.17], [0.5, 0.3, 0]), { dyn: 'eye' }],
      [sph, dark, 'fixed', mir([0.56, 0.45, 0.55], [0.06, 0.06, 0.16], [0.5, 0.3, 0]), { dyn: 'pupil' }],
      [lo, shine, 'fixed', mir([0.67, 0.49, 0.52], [0.045, 0.045, 0.045]), { dyn: 'pupil' }],
      [spike, bone, 'fixed', [...mir([1.15, -0.1, 0.19], [0.06, 0.28, 0.06], [Math.PI, 0, 0]), ...mir([0.85, -0.1, 0.3], [0.05, 0.2, 0.05], [Math.PI, 0, 0])]],
      [new THREE.OctahedronGeometry(1, 0), accGlow, 'acc', [{ p: [0.22, 0.68, 0], s: [0.2, 0.07, 0.11] }]],
      [wedge, accGlow, 'acc', [{ p: [0.92, 0.23, 0], s: [0.62, 0.05, 0.06], r: [0, 0, -0.3] }]],
      [spike, skin, 'acc', [{ p: [1.28, 0.1, 0], s: [0.08, 0.36, 0.08], r: [0, 0, 0.6] }, ...mir([-0.15, -0.05, 0.6], [0.13, 0.9, 0.13], [1.3, 0, 1.0])]],
      [spike, skin, 'acc', [...mir([-0.35, 0.42, 0.42], [0.21, 1.8, 0.21], [0.5, 0, 0.95]), ...mir([-0.55, 0.28, 0.55], [0.13, 0.9, 0.13], [0.95, 0, 1.1])], { acc: 'horns' }],
      [blade, skin, 'head', mir([-0.25, 0.4, 0.5], [0.34, 1.15, 0.12], [0.7, 0, 0.8]), { acc: 'ears' }],
      [blade, skin, 'acc', mir([-0.22, 0.45, 0.52], [0.19, 0.75, 0.13], [0.7, 0, 0.8]), { acc: 'ears' }],
      [spike, accGlow, 'acc', [{ p: [0.3, 0.6, 0], s: [0.14, 1.7, 0.14], r: [0, 0, -0.75] }], { acc: 'unicorn' }],
      [blade, skin, 'head', mir([-0.4, 0.35, 0.5], [0.25, 0.85, 0.1], [0.6, 0, 1.1]), { acc: 'unicorn' }],
      [spike, skin, 'acc', mir([-0.1, 0.5, 0.4], [0.09, 2.4, 0.09], [0.3, 0, 1.25]), { acc: 'bunny' }],
      [blade, skin, 'head', mir([-0.3, 0.4, 0.5], [0.28, 0.7, 0.1], [0.9, 0, 0.9]), { acc: 'bunny' }],
      [blade, skin, 'acc', [0, 1, 2].map((k): HeadItem => ({ p: [-0.25 - k * 0.3, 0.6 - k * 0.1, 0], s: [0.3, 0.8 - k * 0.12, 0.1], r: [0, 0, 0.9 + k * 0.2] })), { evo: 4 }],
    ];
    for (const [geo, mat, tint, items, extra] of defs) {
      const mesh = instanced(geo, mat, MAX_W * items.length, tint !== 'fixed');
      this.scene.add(mesh);
      this.heads.push({ mesh, items, tint, ...extra });
      if (mat === skin) this.ink(mesh, 0.05, true);
    }

    this.fins = instanced(new THREE.ConeGeometry(0.4, 1.4, 4).translate(0, 0.6, 0), skin, 900 + MAX_W, true);
    this.ink(this.fins, 0.05, true);
    // wing: a membrane with pointed fingers and a darker arm along the leading edge
    const poly = (pts: number[]) => { const sh = new THREE.Shape(); for (let k = 0; k < pts.length; k += 2) { if (k) sh.lineTo(pts[k], pts[k + 1]); else sh.moveTo(pts[k], pts[k + 1]); } sh.closePath(); return new THREE.ShapeGeometry(sh); };
    const wingGeo = merge([
      [poly([0.35, 0, 0.8, 0.95, 0.45, 2.5, 0.05, 1.55, -0.25, 2.05, -0.4, 1.15, -0.85, 1.5, -0.8, 0.55, -1.1, 0.6, -0.75, 0]), 0xffffff],
      [poly([0.35, 0, 0.8, 0.95, 0.45, 2.5, 0.36, 2.2, 0.6, 0.95, 0.15, 0]), 0x4a4458, m4(0, 0, -0.02)],
    ]).rotateX(Math.PI / 2);
    this.wings = instanced(wingGeo, skinMat({ side: THREE.DoubleSide, vertexColors: true }), MAX_W * 2 + T.spriteCount * 2, true);
    this.orbs = instanced(new THREE.OctahedronGeometry(1, 0), glowMat(1.8), MAX_W + T.spriteCount, true);

    const gemGeo = merge([[new THREE.CylinderGeometry(0.55, 1, 0.5, 6), 0xffffff, m4(0, 0.55)], [new THREE.ConeGeometry(1, 1.1, 6), 0xffffff, m4(0, -0.25, 0, 1, 1, 1, Math.PI)]]);
    gemGeo.deleteAttribute('color');
    this.gems = instanced(gemGeo, glowMat(0.9), T.maxGems, true);
    this.ink(this.gems, 0.07, false, hullGeo(gemGeo));
    const dot = dotTexture();
    this.halos = instanced(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dot, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), T.maxGems + T.potionCount + MAX_W + T.spriteCount, true);
    this.halos.renderOrder = 2;
    // potions: a cut-crystal flask
    const flask = merge([[new THREE.OctahedronGeometry(0.85, 0), 0xffffff, m4(0, 0, 0, 1, 1.05, 1)], [new THREE.CylinderGeometry(0.2, 0.3, 0.6, 6), 0xffffff, m4(0, 0.95)]]);
    this.bottles = instanced(flask, glowMat(1.1, { vertexColors: true }), T.potionCount, true);
    this.ink(this.bottles, 0.05, false, hullGeo(flask));
    this.corks = instanced(merge([[new THREE.CylinderGeometry(0.26, 0.2, 0.25, 6), 0x3a2d4d, m4(0, 1.35)], [new THREE.OctahedronGeometry(0.16), 0xffe9a0, m4(0, 1.62)]]), flatMat({ vertexColors: true }), T.potionCount, false);
    const grad = document.createElement('canvas');
    grad.width = 4; grad.height = 64;
    const g2 = grad.getContext('2d')!;
    const lg = g2.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, '#000'); lg.addColorStop(1, '#fff');
    g2.fillStyle = lg; g2.fillRect(0, 0, 4, 64);
    this.beams = instanced(new THREE.CylinderGeometry(1.1, 0.7, 10, 16, 1, true).translate(0, 5, 0), new THREE.MeshBasicMaterial({ alphaMap: new THREE.CanvasTexture(grad), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), T.potionCount, true);
    this.bubbles = instanced(new THREE.IcosahedronGeometry(1, 2), skinMat({ color: 0x9fe4ff, transparent: true, opacity: 0.22, depthWrite: false }, 2.6), MAX_W, false);
    const crownParts: Part[] = [[new THREE.CylinderGeometry(0.55, 0.5, 0.3, 10, 1, true), 0xffc23d, m4(0, 0.15)]];
    for (let k = 0; k < 5; k++) crownParts.push([new THREE.ConeGeometry(0.13, 0.62, 4), 0xffc23d, m4(Math.cos(k * 1.257) * 0.52, 0.55, Math.sin(k * 1.257) * 0.52)], [new THREE.OctahedronGeometry(0.1), 0xd8243a, m4(Math.cos(k * 1.257) * 0.55, 0.16, Math.sin(k * 1.257) * 0.55)]);
    this.crown = new THREE.Mesh(merge(crownParts), glowMat(0.7, { vertexColors: true, side: THREE.DoubleSide }));
    this.sparks = instanced(new THREE.OctahedronGeometry(1, 0), glowMat(2.2), MAX_PARTICLES, true);
    this.rings = instanced(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), MAX_RINGS, true);
    this.rings.renderOrder = 3;
    // camera-facing effects: white-hot flash, radial impact lines, slash arc, and gem glints
    const quad = new THREE.PlaneGeometry(2, 2);
    const fxMat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    for (const map of [dot, starTexture(), slashTexture()]) { const m = instanced(quad, fxMat(map), MAX_FX, true); m.renderOrder = 6; this.fxMesh.push(m); }
    this.glints = instanced(quad, fxMat(glintTexture()), MAX_GLINTS, true);
    this.glints.renderOrder = 6;
    // speed lines: drawn straight onto the screen while boosting
    this.speed = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { k: { value: 0 }, uTime: { value: 0 }, aspect: { value: 1 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform float k, uTime, aspect; varying vec2 vP;
        float h(float n){ return fract(sin(n * 91.345) * 47453.5); }
        void main(){
          vec2 p = vec2(vP.x * aspect, vP.y);
          float r = length(p), a = (atan(p.y, p.x) + 3.14159) * 30.0;
          float rnd = h(floor(a) + floor(uTime * 14.0) * 7.0);
          float line = smoothstep(0.5, 0.0, abs(fract(a) - 0.5) * (2.5 + rnd * 7.0)) * step(0.62, rnd);
          float start = 0.62 + rnd * 0.4;
          gl_FragColor = vec4(vec3(line * smoothstep(start, start + 0.45, r) * k * 0.6), 1.0);
        }`,
    }));
    this.speed.frustumCulled = false;
    this.speed.renderOrder = 999;
    this.scene.add(this.body, this.fins, this.wings, this.orbs, this.gems, this.halos, this.bottles, this.corks, this.beams, this.bubbles, this.crown, this.sparks, this.rings, ...this.fxMesh, this.glints, this.speed);
    for (const m of [this.body, this.fins, this.wings, this.crown, this.bottles, ...this.heads.filter((h) => h.tint !== 'fixed').map((h) => h.mesh)]) m.castShadow = true;
    this.setQuality(low);
  }

  /** Ink outline for an instanced mesh: a second mesh that shares its instance data and draws the pushed-out back faces.
   *  `always` outlines stay on Low (the wyrms); the rest are High only. */
  private ink(src: THREE.InstancedMesh, thick: number, always: boolean, geo = src.geometry) {
    const hull = new THREE.InstancedMesh(geo, inkMat(thick), 0);
    hull.instanceMatrix = src.instanceMatrix;
    hull.instanceColor = src.instanceColor;
    hull.frustumCulled = false;
    this.inks.push({ src, hull, always });
    this.scene.add(hull);
    return hull;
  }

  /** High: bloom, soft shadows, smooth edges, full detail. Low: none of those, and fewer pixels, for tablets. */
  setQuality(low: boolean) {
    this.low = low;
    this.renderer.setPixelRatio(Math.min(low ? 1.25 : 2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    this.sun.shadow.mapSize.setScalar(2048);
    this.body.geometry = this.bodyInk.geometry = this.bodyGeo[low ? 1 : 0];
    for (const k of this.inks) k.hull.visible = k.always || !low;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; });
    this.buildComposer();
    if (this.arena && this.simRef) this.setArena(this.arena, this.simRef);
  }

  private buildComposer() {
    this.composer?.dispose();
    this.composer = null;
    if (this.low) return;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(2, this.size.x * pr), Math.max(2, this.size.y * pr), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(this.size.x * pr, this.size.y * pr), this.arena?.night ? 0.5 : 0.36, 0.55, this.arena?.night ? 1.25 : 1.5));
    this.composer.addPass(new OutputPass());
  }

  /** Build a place. Call after sim.setup, which lays out its hazards. */
  setArena(arena: Arena, sim: Sim) {
    if (this.scenery) { this.scene.remove(this.scenery.group); this.scenery.dispose(); }
    this.arena = arena;
    this.simRef = sim;
    this.gemPalette = arena.gems.map((h) => new THREE.Color(h));
    this.scene.background = new THREE.Color(arena.sky);
    this.scene.fog = new THREE.Fog(arena.sky, 140, 460);
    this.scenery = buildArena(arena, sim, this.low);
    this.scene.add(this.scenery.group);
    const night = !!arena.night;
    this.hemi.color.set(arena.skyTop).lerp(new THREE.Color(0xffffff), night ? 0.25 : 0.6);
    this.hemi.groundColor.set(arena.ground).multiplyScalar(0.7);
    const lum = new THREE.Color(arena.ground).getHSL({ h: 0, s: 0, l: 0 }).l; // pale ground needs less light
    const k = night ? 1 : lum > 0.75 ? 0.9 : 1;
    this.hemi.intensity = (night ? 1.7 : 1.35) * k;
    this.sun.color.set(arena.sun);
    this.sun.intensity = (night ? 2.4 : 3.9) * k;
    (this.gems.material as THREE.MeshToonMaterial).emissive.setScalar(night ? 0.55 : 0.4);
    // at night gems light the ground; by day they cast a soft tinted shadow instead
    const hm = this.halos.material as THREE.MeshBasicMaterial;
    hm.blending = night ? THREE.AdditiveBlending : THREE.NormalBlending;
    hm.opacity = night ? 0.32 : 0.55;
    hm.needsUpdate = true;
    this.haloK = night ? 1 : 0.22;
    const bloom = this.composer?.passes[1] as UnrealBloomPass | undefined;
    if (bloom) { bloom.strength = night ? 0.5 : 0.36; bloom.threshold = night ? 1.25 : 1.5; }
  }

  resize(w: number, h: number) {
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.buildComposer();
  }

  /** Ground point under a screen pixel (for pointer steering). */
  groundAt(sx: number, sy: number, w: number, h: number): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), this.camera);
    return this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  /** Screen pixel of a world point, or null when behind the camera. */
  toScreen(x: number, y: number, z: number, w: number, h: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h };
  }

  // ---- effects ----
  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, col: number, grav = 14, streak = 0) {
    const p = this.p;
    if (p.n >= MAX_PARTICLES) return;
    const i = p.n++;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.size[i] = size; p.col[i] = col; p.g[i] = grav; p.st[i] = streak;
  }
  /** True when a point (with padding) is inside what the camera shows. */
  private seen(x: number, z: number, pad: number) {
    const v = this.view, dz = z - v.z;
    return Math.abs(x - v.x) < v.w + pad && dz > -v.n - pad && dz < v.s + pad;
  }
  burst(x: number, z: number, colors: number[], n: number, size: number) {
    if (!this.seen(x, z, 10)) return;
    if (this.low) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 7;
      this.spark(x, 0.6 + size, z, Math.cos(a) * sp, 4 + Math.random() * 7, Math.sin(a) * sp, 0.8 + Math.random() * 0.6, (0.12 + Math.random() * 0.22) * (0.8 + size * 0.5), k % 3 === 0 ? 0xffffff : colors[k % colors.length]);
    }
  }
  /** A fountain of gold and white sparks for big moments. */
  fanfare(x: number, z: number, n = 90) {
    if (!this.seen(x, z, 10)) return;
    const cols = [0xffd04a, 0xffffff, 0xffe9a0, this.arena?.border ?? 0xffffff];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 6;
      this.spark(x, 1.2, z, Math.cos(a) * sp, 9 + Math.random() * 9, Math.sin(a) * sp, 1.4 + Math.random() * 0.9, 0.14 + Math.random() * 0.18, cols[k % cols.length], 11, 2.5);
    }
  }
  private flare(kind: number, x: number, y: number, z: number, size: number, col: number, dur: number, rot = Math.random() * 6.28) {
    if (this.fxList.length < MAX_FX * 3) this.fxList.push({ kind, x, y, z, t: 0, dur, size, col, rot });
  }
  /** An anime hit: a white-hot flash, radial lines, a ground ring, and streaks flying out. */
  impact(x: number, z: number, col: number, size: number) {
    if (!this.seen(x, z, size)) return;
    this.flare(0, x, 1.2, z, size * 0.55, 0xffffff, 0.2);
    this.flare(1, x, 1.2, z, size, 0xffffff, 0.28);
    this.flare(1, x, 1.2, z, size * 0.7, col, 0.4);
    this.ring(x, z, col, size * 1.2, 0.4);
    const n = this.low ? 6 : 12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.28 + Math.random() * 0.4, sp = (9 + Math.random() * 9) * (0.6 + size * 0.12);
      this.spark(x, 1, z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 0.3 + Math.random() * 0.2, 0.2, k % 2 ? 0xffffff : col, 6, 5);
    }
  }
  /** A crescent slash arc across a spot. */
  slash(x: number, z: number, col: number, size: number) {
    if (!this.seen(x, z, size)) return;
    const rot = Math.random() * 6.28;
    this.flare(2, x, 1.5, z, size, 0xffffff, 0.2, rot);
    this.flare(2, x, 1.5, z, size * 0.85, col, 0.32, rot + 0.3);
  }
  /** A defeated wyrm breaks up: a flash at the head, then its whole body turns to rising sparkles. */
  dissolve(w: Wyrm) {
    if (!this.seen(w.cx, w.cz, w.br + 6)) return;
    const r = radiusOf(w.mass), s = w.segs, cols = w.look.colors, step = this.low ? 4 : 2;
    this.impact(s[0], s[1], cols[0], 3 + r * 3);
    for (let i = 0; i < w.n; i += step) {
      const x = s[i * 2], z = s[i * 2 + 1];
      this.spark(x, r * (0.6 + Math.random()), z, (Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 2.5, 0.6 + Math.random() * 0.9 + i * 0.004, r * (0.16 + Math.random() * 0.2), i % 3 ? cols[Math.floor(i / 4) % cols.length] : 0xffffff, -3);
      if (i % (step * 7) === 0) this.flare(3, x, r * 1.5, z, r * 2.2, 0xffffff, 0.35 + Math.random() * 0.5);
    }
  }
  /** An expanding ring on the ground. */
  ring(x: number, z: number, col: number, size: number, dur = 0.6) {
    if (this.ringList.length < MAX_RINGS && this.seen(x, z, size)) this.ringList.push({ x, z, t: 0, dur, size, col });
  }
  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  private fxOf(w: Wyrm): WyrmFx {
    let f = this.fx.get(w.id);
    if (!f) this.fx.set(w.id, f = { pulses: [], chomp: 0, blink: 2 + Math.random() * 3, trail: 0, pop: 0 });
    return f;
  }
  /** A bite: the head chomps and a bulge travels down the body. */
  gulp(w: Wyrm) {
    const f = this.fxOf(w);
    f.chomp = 1;
    if (f.pulses.length < 3 && (f.pulses.length === 0 || f.pulses[f.pulses.length - 1] > 5)) f.pulses.push(0);
  }
  /** A quick puff-up, for level-ups and potions. */
  puff(w: Wyrm) { this.fxOf(w).pop = 1; }
  bump(x: number, z: number) { this.scenery?.bump(x, z); this.ring(x, z, 0xffffff, 4, 0.4); }

  private palette(colors: number[]): THREE.Color[] {
    let p = this.palettes.get(colors);
    if (!p) this.palettes.set(colors, p = colors.map((h) => new THREE.Color(h)));
    return p;
  }

  render(sim: Sim, dt: number, follow: Wyrm, menu: boolean) {
    this.time += dt;
    const t = this.time;
    const c = this.tmpC, M = this.tmpM, M2 = this.tmpM2, Q = this.tmpQ, E = this.tmpE, V = this.tmpV, S = this.tmpS;

    // ---- what the camera sees (from last frame's camera, with margin): only that is drawn ----
    const vh = menu ? 110 : this.camH, vw = this.view;
    vw.x = this.camTarget.x; vw.z = this.camTarget.z;
    vw.w = menu ? vh : vh * 1.9 + 12; vw.n = menu ? vh : vh * 1.25 + 12; vw.s = menu ? vh : vh * 0.8 + 12;

    // ---- gems ----
    const gm = this.gems.instanceMatrix.array as Float32Array;
    const gc = this.gems.instanceColor!.array as Float32Array;
    const hm = this.halos.instanceMatrix.array as Float32Array;
    const hc = this.halos.instanceColor!.array as Float32Array;
    const n = sim.gemCount;
    const allHalos = !this.low, hk = this.haloK;
    let gi = 0, glintN = 0;
    for (let i = 0; i < n; i++) {
      const x = sim.gx[i], z = sim.gz[i];
      if (!this.seen(x, z, 2)) continue;
      const v = sim.gv[i];
      const ph = sim.gph[i];
      const tk = Math.max(0, Math.sin(t * 1.7 + ph * 7) - 0.94) / 0.06; // now and then a gem glints
      const tw = 1 + tk * 0.3;
      const sz = (0.36 + 0.14 * Math.sqrt(v)) * tw;
      const a = t * 1.5 + ph, ca = Math.cos(a) * sz, sa = Math.sin(a) * sz;
      const y = 0.5 + sz + Math.sin(t * 2.5 + ph) * 0.14;
      const o = gi * 16;
      gm[o] = ca; gm[o + 1] = 0; gm[o + 2] = -sa; gm[o + 3] = 0;
      gm[o + 4] = 0; gm[o + 5] = sz * 1.1; gm[o + 6] = 0; gm[o + 7] = 0;
      gm[o + 8] = sa; gm[o + 9] = 0; gm[o + 10] = ca; gm[o + 11] = 0;
      gm[o + 12] = x; gm[o + 13] = y; gm[o + 14] = z; gm[o + 15] = 1;
      const hs = allHalos || v >= 3 ? sz * (hk < 1 ? 1.7 : 2.6) : 0;
      hm[o] = hs; hm[o + 1] = 0; hm[o + 2] = 0; hm[o + 3] = 0;
      hm[o + 4] = 0; hm[o + 5] = 1; hm[o + 6] = 0; hm[o + 7] = 0;
      hm[o + 8] = 0; hm[o + 9] = 0; hm[o + 10] = hs; hm[o + 11] = 0;
      hm[o + 12] = x; hm[o + 13] = 0.06; hm[o + 14] = z; hm[o + 15] = 1;
      const col = sim.gc[i] === 255 ? c.setHex(sim.gcol[i]) : this.gemPalette[sim.gc[i]];
      const tb = tw * tw;
      const ci = gi * 3;
      gc[ci] = col.r * tb; gc[ci + 1] = col.g * tb; gc[ci + 2] = col.b * tb;
      if (tk > 0 && glintN < MAX_GLINTS - 8) this.glint(glintN++, x, y + sz, z, sz * (0.8 + tk * 1.5), ph + tk * 0.8, 1.1);
      hc[ci] = col.r * hk; hc[ci + 1] = col.g * hk; hc[ci + 2] = col.b * hk;
      gi++;
    }
    // ---- wyrms ----
    const bodyM = this.body.instanceMatrix.array as Float32Array;
    const bodyC = this.body.instanceColor!.array as Float32Array;
    let bi = 0, finN = 0, wingN = 0, orbN = 0, bubbleN = 0, haloN = gi;
    let leader: Wyrm | null = null;
    for (const w of sim.wyrms) if (w.alive && !w.isBoss && (!leader || w.mass > leader.mass)) leader = w;
    for (const h of this.heads) h.mesh.count = 0;
    for (const w of sim.wyrms) {
      if (!w.alive) continue;
      const f = this.fxOf(w);
      const r = radiusOf(w.mass) * (w.isBoss ? 1.25 : 1);
      const cols = this.palette(w.look.colors);
      const bright = (w.look.glow ? 1.12 : 1) + (w.boosting ? 0.22 + 0.12 * Math.sin(t * 20) : 0) + (w.zoom > 0 ? 0.25 : 0);
      const ice = w.frozen > 0 ? 0.6 : 0;
      for (let k = f.pulses.length - 1; k >= 0; k--) if ((f.pulses[k] += dt * 42) > w.n + 4) f.pulses.splice(k, 1);
      f.chomp = Math.max(0, f.chomp - dt * 5);
      f.pop = Math.max(0, f.pop - dt * 2.5);
      const puff = 1 + Math.sin(f.pop * Math.PI) * 0.25;
      const s = w.segs;
      if (!this.seen(w.cx, w.cz, w.br + r * 3)) { if (w === leader) leader = null; continue; }
      // tail first so the head end draws on top where they overlap
      for (let i = w.n - 1; i >= 1; i--) {
        const taper = i > w.n * 0.65 ? 1 - ((i - w.n * 0.65) / (w.n * 0.35)) * 0.78 : 1; // a long, thin tail
        let bulge = 1;
        for (const pu of f.pulses) { const d = (i - pu) / 3; bulge += 0.32 * Math.exp(-d * d); }
        const sc = r * taper * bulge * puff;
        // wiggle: a small sideways wave, across the direction of travel
        const dx = s[i * 2 - 2] - s[i * 2], dz = s[i * 2 - 1] - s[i * 2 + 1];
        const dl = Math.hypot(dx, dz) || 1;
        const wig = Math.sin(i * 0.42 - t * (w.boosting ? 14 : 7) + w.id) * r * 0.14 * Math.min(1, i / 6);
        const o = bi * 16;
        bodyM[o] = sc; bodyM[o + 1] = 0; bodyM[o + 2] = 0; bodyM[o + 3] = 0;
        bodyM[o + 4] = 0; bodyM[o + 5] = sc * 0.9; bodyM[o + 6] = 0; bodyM[o + 7] = 0;
        bodyM[o + 8] = 0; bodyM[o + 9] = 0; bodyM[o + 10] = sc; bodyM[o + 11] = 0;
        const px = s[i * 2] - (dz / dl) * wig, pz = s[i * 2 + 1] + (dx / dl) * wig;
        bodyM[o + 12] = px; bodyM[o + 13] = sc * 0.86 + Math.sin(i * 0.5 - t * 6) * 0.06; bodyM[o + 14] = pz; bodyM[o + 15] = 1;
        const col = cols[Math.floor(i / 4) % cols.length];
        const belly = 1;
        bodyC[bi * 3] = (col.r + (0.75 - col.r) * ice) * bright * belly; bodyC[bi * 3 + 1] = (col.g + (0.95 - col.g) * ice) * bright * belly; bodyC[bi * 3 + 2] = (col.b + (1 - col.b) * ice) * bright * belly;
        bi++;
        // back fins from the Whelp stage on
        if (w.evo >= 1 && i % 3 === 0 && i > 2 && i < w.n * 0.75 && finN < 900) {
          const fs = sc * (0.5 + Math.min(w.evo, 4) * 0.1);
          this.fins.setMatrixAt(finN, M.compose(V.set(px, sc * 1.35, pz), Q.setFromEuler(E.set(0, -Math.atan2(dz, dx), 1.0)), S.set(fs, fs * (1 + 0.15 * Math.sin(t * 5 + i)), fs * 0.3)));
          this.fins.setColorAt(finN++, c.setHex(w.look.accColor).multiplyScalar(bright));
        }
      }
      const tx = s[(w.n - 1) * 2], tz = s[(w.n - 1) * 2 + 1];
      // every wyrm ends in a tail blade
      if (w.n > 4) {
        const fs = r * 0.75;
        this.fins.setMatrixAt(finN, M.compose(V.set(tx, r * 0.35, tz), Q.setFromEuler(E.set(0, -Math.atan2(s[(w.n - 2) * 2 + 1] - tz, s[(w.n - 2) * 2] - tx), Math.PI / 2)), S.set(fs, fs * 1.5, fs * 0.25)));
        this.fins.setColorAt(finN++, c.setHex(w.look.accColor).multiplyScalar(bright));
      }
      // tail gem from the Elder stage on
      if (w.evo >= 4) {
        const ts = r * 0.55;
        this.orbs.setMatrixAt(orbN, M.makeRotationY(t * 3).scale(S.set(ts, ts * 1.5, ts)).setPosition(tx, r * 0.9 + Math.sin(t * 4) * 0.15, tz));
        this.orbs.setColorAt(orbN++, c.setHex(w.look.accColor));
      }
      // star trail at Mythic
      if (w.evo >= 6 && dt > 0 && (f.trail -= dt) <= 0) {
        f.trail = this.low ? 0.12 : 0.05;
        const k = Math.floor(Math.random() * w.n);
        this.spark(s[k * 2], r * 1.6, s[k * 2 + 1], (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.9, 0.14, k % 2 ? 0xffffff : w.look.accColor, 2);
      }
      // boost trail
      if (w.boosting && dt > 0 && Math.random() < (this.low ? 0.3 : 0.7)) {
        this.spark(tx, r, tz, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.13, w.zoom > 0 ? 0x7dff6a : 0xffffff, 4);
      }

      // head, with squash and stretch
      const HR = r * 1.5 * puff;
      const hx = s[0], hz = s[1];
      const stretch = 1 + (w.boosting ? 0.1 : 0) + f.chomp * 0.1 + Math.sin(t * 3 + w.id) * 0.015;
      const headM = M.compose(V.set(hx, HR * 0.84 + Math.sin(t * 6 + w.id) * 0.04, hz), Q.setFromEuler(E.set(0, -w.ang, Math.sin(t * 7 + w.id) * 0.03)), S.set(HR * stretch, HR * (1 - f.chomp * 0.08) / Math.sqrt(stretch), HR / Math.sqrt(stretch)));
      if ((f.blink -= dt) < -0.13) f.blink = 1.5 + Math.random() * 4;
      const lid = f.blink < 0 ? 0.1 : 1;
      const turn = Math.max(-1, Math.min(1, Math.atan2(Math.sin(w.targetAng - w.ang), Math.cos(w.targetAng - w.ang)) * 1.5));
      for (const h of this.heads) {
        if ((h.acc && h.acc !== w.look.acc) || (h.evo !== undefined && w.evo < h.evo)) continue;
        for (const it of h.items) {
          const k = h.mesh.count++;
          let px = it.p[0], sz = it.s[2], rz = it.r ? it.r[2] : 0;
          if (h.dyn === 'eye') sz *= lid;
          else if (h.dyn === 'pupil') { sz *= lid; px += turn * 0.04; }
          else if (h.dyn === 'mouth') rz = -0.07 - f.chomp * 0.55; // the jaw swings on its hinge
          Q.setFromEuler(it.r ? E.set(it.r[0], it.r[1], rz) : E.set(0, 0, rz));
          h.mesh.setMatrixAt(k, M2.compose(V.set(px, it.p[1], it.p[2]), Q, S.set(it.s[0], it.s[1], sz)).premultiply(headM));
          if (h.tint === 'eye') h.mesh.setColorAt(k, w.frozen > 0 ? c.setRGB(0.5, 0.95, 1.3) : w.isBoss ? c.setRGB(1.5, 0.22, 0.12) : c.setRGB(1.25, 0.95, 0.3));
          else if (h.tint !== 'fixed') {
            c.setHex(h.tint === 'head' ? w.look.head : w.look.accColor);
            h.mesh.setColorAt(k, c.multiplyScalar(w.look.glow ? 1.1 : 1));
          }
        }
      }
      // wings from the Drake stage on: set on the neck, flapping
      if (w.evo >= 2 && w.n > 6) {
        const k = Math.min(w.n - 2, 4);
        const wa = Math.atan2(s[k * 2 - 1] - s[k * 2 + 1], s[k * 2 - 2] - s[k * 2]);
        const wsz = r * (0.8 + (Math.min(w.evo, 6) - 2) * 0.28);
        const flap = 0.25 + 0.5 * Math.sin(t * (w.boosting ? 18 : 8) + w.id);
        c.copy(cols[cols.length - 1]).lerp(this.tmpC2.setHex(w.look.accColor), 0.15).multiplyScalar(0.6); // membrane: a deep shade of the body colour, never pastel
        for (const side of [1, -1]) {
          this.wings.setMatrixAt(wingN, M.compose(V.set(s[k * 2], r * 1.25, s[k * 2 + 1]), Q.setFromEuler(this.tmpE2.set(-flap * side, -wa, 0)), S.set(wsz, wsz, wsz * side)));
          this.wings.setColorAt(wingN++, c);
        }
      }
      // a boss smoulders: a slow red pulse on the ground under its head
      if (w.isBoss) this.auras.push(hx, hz, HR * (2.6 + Math.sin(t * 2) * 0.3), 0xff2a1a);
      // aura from the Ancient stage on
      if (w.evo >= 5) {
        this.auras.push(hx, hz, HR * (2.3 + Math.sin(t * 3) * 0.15), w.look.accColor, hx, hz, HR * (1.7 - Math.sin(t * 3) * 0.1), w.look.colors[0]);
      }
      if (w.bubble > 0 && (w.bubble > 2 || Math.sin(t * 25) > 0)) {
        const bs = HR * (1.85 + Math.sin(t * 5) * 0.05);
        this.bubbles.setMatrixAt(bubbleN++, M2.makeRotationY(t * 0.8).scale(S.set(bs, bs, bs)).setPosition(hx + Math.cos(w.ang) * HR * 0.4, HR * 0.84, hz + Math.sin(w.ang) * HR * 0.4));
      }
      if (w === leader) {
        this.crown.position.set(hx - Math.cos(w.ang) * HR * 0.1, HR * 1.75 + Math.sin(t * 3) * 0.08, hz - Math.sin(w.ang) * HR * 0.1);
        this.crown.scale.setScalar(HR * 0.8);
        this.crown.rotation.y = t;
        const gk = Math.max(0, Math.sin(t * 2.4)) ** 6; // the gold catches the light
        if (gk > 0.02) this.glint(glintN++, this.crown.position.x + HR * 0.35, this.crown.position.y + HR * 0.6, this.crown.position.z, HR * 1.6 * gk, t, 1.6);
      }
    }
    this.crown.visible = !!leader && sim.wyrms.length > 1;
    this.body.count = bi;
    this.fins.count = finN;

    // sprite gems: a golden gem with little wings that runs away
    for (const sp of sim.sprites) {
      if (!sp.alive || !this.seen(sp.x, sp.z, 3)) continue;
      const tired = sp.tired > 0;
      const y = (tired ? 0.9 : 1.5) + Math.sin(t * 6 + sp.x) * 0.2;
      this.orbs.setMatrixAt(orbN, M.makeRotationY(t * 4).scale(S.set(0.5, 0.7, 0.5)).setPosition(sp.x, y, sp.z));
      this.orbs.setColorAt(orbN++, c.setHex(tired ? 0xb8a060 : 0xffe066));
      const flap = 0.2 + 0.7 * Math.sin(t * (sp.fleeing ? 30 : 12) + sp.z);
      for (const side of [1, -1]) {
        this.wings.setMatrixAt(wingN, M.compose(V.set(sp.x, y + 0.1, sp.z), Q.setFromEuler(this.tmpE2.set(-flap * side, -sp.ang, 0)), S.set(0.7, 0.7, 0.7 * side)));
        this.wings.setColorAt(wingN++, c.setRGB(1.6, 1.6, 1.6));
      }
      this.halos.setMatrixAt(haloN, M2.makeScale(2.6, 1, 2.6).setPosition(sp.x, 0.07, sp.z));
      this.halos.setColorAt(haloN++, c.setHex(0xffe066));
      if (sp.fleeing && dt > 0 && Math.random() < 0.5) this.spark(sp.x, y, sp.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.5, 0.1, 0xfff0a0, 3);
    }
    let pn = 0;
    for (const p of sim.potions) {
      if (!p.alive || !this.seen(p.x, p.z, 4)) continue;
      const y = 1.3 + Math.sin(t * 2 + p.x) * 0.25;
      const m = M.compose(V.set(p.x, y, p.z), Q.setFromAxisAngle(V.set(0, 1, 0), t), S.set(1.15, 1.15, 1.15));
      this.bottles.setMatrixAt(pn, m);
      this.corks.setMatrixAt(pn, m);
      c.setHex(POTIONS[p.kind].color);
      this.bottles.setColorAt(pn, c);
      this.beams.setMatrixAt(pn, M2.makeScale(1, 1 + Math.sin(t * 3 + p.z) * 0.08, 1).setPosition(p.x, 0, p.z));
      this.beams.setColorAt(pn, c);
      pn++;
      this.halos.setMatrixAt(haloN, M2.makeScale(3.4, 1, 3.4).setPosition(p.x, 0.07, p.z));
      this.halos.setColorAt(haloN++, c);
    }
    this.bottles.count = this.corks.count = this.beams.count = pn;
    this.gems.count = gi;
    this.halos.count = haloN;
    this.wings.count = wingN;
    this.orbs.count = orbN;
    this.bubbles.count = bubbleN;

    // ---- sparkles ----
    const p = this.p;
    for (let i = 0; i < p.n; i++) {
      p.life[i] -= dt;
      if (p.life[i] <= 0 || p.y[i] < 0) {
        const l = --p.n;
        p.x[i] = p.x[l]; p.y[i] = p.y[l]; p.z[i] = p.z[l]; p.vx[i] = p.vx[l]; p.vy[i] = p.vy[l]; p.vz[i] = p.vz[l];
        p.life[i] = p.life[l]; p.size[i] = p.size[l]; p.col[i] = p.col[l]; p.g[i] = p.g[l]; p.st[i] = p.st[l];
        i--;
        continue;
      }
      p.vy[i] -= p.g[i] * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      p.vx[i] *= 0.97; p.vz[i] *= 0.97;
      const sz = p.size[i] * Math.min(1, p.life[i] * 2);
      if (p.st[i] > 0) this.sparks.setMatrixAt(i, M.compose(V.set(p.x[i], Math.max(0.1, p.y[i]), p.z[i]), Q.setFromUnitVectors(UP, this.tmpS.set(p.vx[i], p.vy[i], p.vz[i]).normalize()), S.set(sz * 0.35, sz * p.st[i], sz * 0.35)));
      else this.sparks.setMatrixAt(i, M.makeRotationY(t * 4 + i).scale(S.set(sz, sz * 1.4, sz)).setPosition(p.x[i], Math.max(0.1, p.y[i]), p.z[i]));
      this.sparks.setColorAt(i, c.setHex(p.col[i]));
    }
    this.sparks.count = p.n;
    let rn = 0;
    for (let i = this.ringList.length - 1; i >= 0; i--) {
      const rg = this.ringList[i];
      if ((rg.t += dt) >= rg.dur) { this.ringList.splice(i, 1); continue; }
      const k = rg.t / rg.dur, sz = rg.size * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
      this.rings.setMatrixAt(rn, M.makeScale(sz, 1, sz).setPosition(rg.x, 0.12, rg.z));
      this.rings.setColorAt(rn++, c.setHex(rg.col).multiplyScalar((1 - k) * 0.7));
    }
    for (let i = 0; i < this.auras.length && rn < MAX_RINGS; i += 4) {
      const a = this.auras;
      this.rings.setMatrixAt(rn, M.makeScale(a[i + 2], 1, a[i + 2]).setPosition(a[i], 0.1, a[i + 1]));
      this.rings.setColorAt(rn++, c.setHex(a[i + 3]).multiplyScalar(0.38));
    }
    this.auras.length = 0;
    this.rings.count = rn;
    // camera-facing effects
    const fxN = [0, 0, 0];
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const e = this.fxList[i];
      if ((e.t += dt) >= e.dur) { this.fxList.splice(i, 1); continue; }
      const k = e.t / e.dur, out = 1 - (1 - k) * (1 - k);
      if (e.kind === 3) { if (glintN < MAX_GLINTS) this.glint(glintN++, e.x, e.y + k * 1.5, e.z, e.size * Math.sin(k * Math.PI), e.rot + k, 1.8); continue; }
      if (fxN[e.kind] >= MAX_FX) continue;
      const sz = e.size * (e.kind === 0 ? 0.4 + 0.6 * k : e.kind === 1 ? 0.45 + 0.75 * out : 0.7 + 0.45 * out);
      const m = this.fxMesh[e.kind], j = fxN[e.kind]++;
      m.setMatrixAt(j, M.compose(V.set(e.x, e.y, e.z), Q.copy(this.camera.quaternion).multiply(this.tmpQ2.setFromAxisAngle(FWD, e.rot + (e.kind === 2 ? k * 0.5 : 0))), S.set(sz, sz, sz)));
      m.setColorAt(j, c.setHex(e.col).multiplyScalar((e.kind === 0 ? (1 - k) * (1 - k) * 2.2 : (1 - k) * 1.6)));
    }
    this.fxMesh.forEach((m, k) => { m.count = fxN[k]; });
    this.glints.count = glintN;
    for (const k of this.inks) k.hull.count = k.src.count;
    for (const m of [...this.fxMesh, this.glints, this.body, this.fins, this.wings, this.orbs, this.gems, this.halos, this.bottles, this.corks, this.beams, this.bubbles, this.sparks, this.rings, ...this.heads.map((h) => h.mesh)]) {
      // upload only the instances in use: the gem buffers hold 20000
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, m.count * 16);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, m.count * 3); m.instanceColor.needsUpdate = true; }
    }

    // ---- camera: north up, leads the wyrm a little, zooms out as it grows, shakes on big hits ----
    const fr = radiusOf(follow.mass);
    const wantH = menu ? 34 : 14 + fr * 14 + Math.min(18, follow.n * 0.05);
    this.camH += (wantH - this.camH) * Math.min(1, dt * 1.5);
    const ct = this.camTarget;
    if (follow.alive) {
      const la = menu ? 0 : 3 + fr * 3;
      this.lead.lerp(V.set(Math.cos(follow.ang) * la, 0, Math.sin(follow.ang) * la), Math.min(1, dt * 1.6));
      ct.lerp(V.set(follow.segs[0] + this.lead.x, 0, follow.segs[1] + this.lead.z), Math.min(1, dt * 5));
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const sh = this.trauma * this.trauma * 1.4;
    const sx = Math.sin(t * 53) * sh, sz2 = Math.sin(t * 67 + 1) * sh;
    this.fovKick += ((follow.boosting && !menu ? 5 : 0) - this.fovKick) * Math.min(1, dt * 4);
    this.camera.fov = 48 + this.fovKick;
    this.speedK += ((follow.boosting && follow.alive && !menu ? 1 : 0) - this.speedK) * Math.min(1, dt * 7);
    const su = (this.speed.material as THREE.ShaderMaterial).uniforms;
    su.k.value = this.speedK; su.uTime.value = t; su.aspect.value = this.camera.aspect;
    this.speed.visible = this.speedK > 0.02;
    this.camera.updateProjectionMatrix();
    if (menu) {
      // a slow, low orbit that shows off the place
      const a = t * 0.07 + 0.6;
      this.camera.position.set(ct.x + Math.sin(a) * 30, 13, ct.z + Math.cos(a) * 30);
      this.camera.lookAt(ct.x, 2.5, ct.z);
    } else {
      this.camera.position.set(ct.x + sx, this.camH, ct.z + this.camH * 0.7 + sz2);
      this.camera.lookAt(ct.x + sx, 0, ct.z - 2 + sz2);
    }
    if (this.scenery) {
      this.sun.position.copy(ct).addScaledVector(this.scenery.sunDir, 150);
      this.sun.target.position.copy(ct);
      this.scenery.update(t, ct, this.renderer.getPixelRatio() * this.size.y / 720);
    }
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  /** One camera-facing glint. */
  private glint(i: number, x: number, y: number, z: number, size: number, rot: number, bright: number) {
    this.glints.setMatrixAt(i, this.tmpM2.compose(this.tmpV.set(x, y, z), this.tmpQ.copy(this.camera.quaternion).multiply(this.tmpQ2.setFromAxisAngle(FWD, rot)), this.tmpS.set(size, size, size)));
    this.glints.setColorAt(i, this.tmpC.setRGB(bright, bright, bright));
  }

  snapCamera(w: Wyrm) {
    this.camTarget.set(w.segs[0], 0, w.segs[1]);
    this.lead.set(0, 0, 0);
  }
}
