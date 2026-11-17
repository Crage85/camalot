// The nine places: sky, terrain, water, border magic, props, hazards, and drifting air motes. All art is code.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, type Arena, type ZoneKind } from './data';
import type { Sim } from './sim';

// ---- geometry helpers ----
export type Part = [THREE.BufferGeometry, number, THREE.Matrix4?];
export const m4 = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** Merge simple shapes into one vertex-coloured geometry (one draw call per prop kind). */
export function merge(parts: Part[]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const geos = parts.map(([g, hex, m]) => {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    if (m) ng.applyMatrix4(m);
    ng.deleteAttribute('uv');
    const n = ng.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    c.setHex(hex);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return ng;
  });
  const out = mergeGeometries(geos);
  out.computeVertexNormals();
  return out;
}

/** The one cel-shading ramp every toon material shares: three hard steps. */
export const GRADIENT = new THREE.DataTexture(new Uint8Array([89, 179, 255]), 3, 1, THREE.RedFormat);
GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter;
GRADIENT.needsUpdate = true;

export const flatMat = (opts: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ gradientMap: GRADIENT, ...opts });

/** Cel-shaded material whose own colour (vertex or instance) also shines by `k`; above 1 it blooms. */
export function glowMat(k: number, opts: THREE.MeshToonMaterialParameters = {}) {
  const m = flatMat({ emissive: new THREE.Color(k, k, k), ...opts });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= diffuseColor.rgb;');
  };
  m.customProgramCacheKey = () => 'glow';
  return m;
}

/** Ink outline: the back faces of a hull pushed out along its normals, in a darkened version of the object's own colour.
 *  `thick` is in the object's own units; the line never gets thinner than about two screen pixels. */
export function inkMat(thick: number, opts: THREE.MeshBasicMaterialParameters = {}) {
  const m = new THREE.MeshBasicMaterial({ color: 0x5a4a6a, side: THREE.BackSide, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        mat4 inkM = modelViewMatrix * instanceMatrix; float inkS = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
      #else
        mat4 inkM = modelViewMatrix; float inkS = length(modelMatrix[0].xyz);
      #endif
      transformed += normalize(normal) * max(${thick.toFixed(4)}, -(inkM * vec4(position, 1.0)).z * 0.0026 / max(inkS, 0.0001));`);
  };
  m.customProgramCacheKey = () => `ink${thick}`;
  return m;
}
/** A copy of a hard-edged shape with smooth normals, so its ink hull does not split at the edges. */
export function hullGeo(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  g.deleteAttribute('normal');
  const out = mergeVertices(g, 1e-3);
  out.computeVertexNormals();
  return out;
}

export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, withColor: boolean) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (withColor) m.setColorAt(0, new THREE.Color(1, 1, 1));
  m.count = 0;
  return m;
}

/** Soft round dot texture, drawn in code. */
export function dotTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// ---- noise ----
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.1;
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

const R = T.arenaRadius;
const GROW = R / 100; // the places were first drawn for radius 100: props inside scale with area, the rim with length
const TILE = 90; // props are cut into tiles this wide so the ones out of view are not drawn
const VOID = new Set(['cloud', 'disco']); // floating platforms: the land outside drops away
const WATER_Y: Partial<Record<string, number>> = { beach: -0.9, forge: -1.6, valley: -2.2 };

/** Land height outside the flat play circle. */
function heightFn(arena: Arena): (x: number, z: number) => number {
  const id = arena.id;
  return (x, z) => {
    const r = Math.hypot(x, z);
    if (r <= R + 3) return 0;
    const e = smooth((r - R - 3) / 45), far = smooth((r - R - 50) / 140);
    const n = fbm(x * 0.018 + 7, z * 0.018 + 3), n2 = fbm(x * 0.05 + 31, z * 0.05 + 17);
    switch (id) {
      case 'peak': return e * (3 + n * 12) + far * (20 + Math.abs(n2 - 0.5) * 160 + n * 50);
      case 'beach': { const land = smooth(z / 60 + 0.4 + (n - 0.5)); return e * (land * (2 + n * 10) - (1 - land) * 4) + far * land * n * 30; }
      case 'canyon': { const h = e * n * 34 + far * n * 60; return Math.round(h / 9) * 9 * 0.8 + h * 0.2; }
      case 'forge': return e * (n * 22 - 5) + far * Math.abs(n2 - 0.5) * 140;
      case 'cloud': case 'disco': return -e * 60;
      case 'valley': { const lake = smooth(1 - Math.hypot(x + R + 38, z + 30) / 34); return e * (2 + n * 13) * (1 - lake) - lake * 5 + far * n * 55; }
      default: return e * (2 + n * 14) + far * n * 45;
    }
  };
}

function terrain(arena: Arena, h: (x: number, z: number) => number, low: boolean): THREE.Mesh {
  const rings: number[] = [];
  for (let r = 0; r < R; r += low ? 4.5 : 3) rings.push(r);
  for (let r = R, st = 1.5; r < R + 330; r += st, st *= 1.14) rings.push(r);
  const seg = low ? 160 : 256;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cg = new THREE.Color(arena.ground), ca = new THREE.Color(arena.groundAlt), co = new THREE.Color(arena.outside), cf = new THREE.Color(arena.far);
  const snow = new THREE.Color(0xffffff), c = new THREE.Color();
  for (const r of rings) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = h(x, z);
      pos.push(x, y, z);
      if (r <= R + 3) {
        // painted patches: hard-edged colour areas in three tones, like a cel background
        c.copy(cg).lerp(ca, smooth((fbm(x * 0.045, z * 0.045) - 0.47) * 16));
        c.multiplyScalar(0.84 + Math.round(smooth((fbm(x * 0.021 + 40, z * 0.021 + 9) - 0.3) * 3) * 2) * 0.11);
      } else {
        c.copy(co).lerp(cf, smooth(Math.abs(y) / 45));
        if (arena.id === 'peak' || arena.id === 'valley') c.lerp(snow, smooth((y - (arena.id === 'peak' ? 22 : 62)) / 14));
        if (arena.id === 'canyon') c.multiplyScalar(0.82 + (Math.round(y / 4.5) % 2 ? 0.18 : 0)); // rock layers
        if (arena.id === 'forge') c.lerp(new THREE.Color(0xff5a1f), smooth((1.5 - y) / 3) * 0.8);
        c.multiplyScalar(0.92 + noise(x * 0.3, z * 0.3) * 0.16);
      }
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s, b = i * seg + ((s + 1) % seg), d = a + seg, e = b + seg;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  const mesh = new THREE.Mesh(flat, flatMat({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---- shader bits ----
const FOG_V = 'varying float vFog; ';
const FOG_SET = 'vFog = smoothstep(uFog.x, uFog.y, length((modelViewMatrix * vec4(position, 1.0)).xyz));';
const fogU = (arena: Arena) => ({ uFog: { value: new THREE.Vector2(140, 460) }, uFogCol: { value: new THREE.Color(arena.sky) } });

function sky(arena: Arena, sunDir: THREE.Vector3): THREE.Mesh {
  const top = new THREE.Color(arena.skyTop), hor = new THREE.Color(arena.sky);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: top }, mid: { value: hor.clone().lerp(top, 0.55) }, hor: { value: hor }, sun: { value: new THREE.Color(arena.sun) }, aur: { value: new THREE.Color(arena.border) }, sunDir: { value: sunDir.clone().normalize() }, night: { value: arena.night ? 1 : 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top, mid, hor, sun, aur, sunDir; uniform float night, uTime; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float stars(vec3 d, float sc, float cut){
        vec2 g = d.xz / (abs(d.y) + 0.35) * sc; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        float r = h21(id);
        return step(cut, r) * smoothstep(0.18, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * 2.0 + r * 40.0));
      }
      void main(){
        vec3 d = normalize(vDir);
        // a strong three-colour sweep: horizon glow, a band of mixed colour, deep zenith
        vec3 c = mix(hor, mid, smoothstep(-0.02, 0.2, d.y));
        c = mix(c, top, smoothstep(0.14, 0.7, d.y));
        float s = max(dot(d, sunDir), 0.0);
        float flat1 = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
        c += sun * pow(flat1, 5.0) * smoothstep(0.45, 0.0, abs(d.y)) * 0.32; // the horizon burns toward the sun
        c += sun * (smoothstep(0.9990, 0.9994, s) * 3.0 + pow(s, 90.0) * 0.55 + pow(s, 8.0) * 0.2); // hard disc, soft halo
        if (night > 0.5) {
          c += vec3(stars(d, 26.0, 0.88) * 1.7 + stars(d.zyx, 61.0, 0.8) * 0.8) * smoothstep(0.0, 0.25, d.y);
          float x = atan(d.z, d.x);
          float curtain = sin(x * 5.0 + sin(x * 2.3 + uTime * 0.21) * 2.2 + uTime * 0.08);
          float rays = 0.55 + 0.45 * sin(x * 70.0 + sin(d.y * 9.0 + uTime * 0.6) * 1.5);
          float au = smoothstep(0.15, 0.95, curtain) * rays * smoothstep(0.04, 0.2, d.y) * smoothstep(0.7, 0.22, d.y);
          c += mix(aur, aur.gbr, smoothstep(0.15, 0.6, d.y)) * au * 0.75;
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

/** Slanted shafts of sunlight (or moonlight) that drift around the camera. High quality only. */
function shafts(arena: Arena, sunDir: THREE.Vector3): THREE.Mesh {
  const N = 16, H = 24, pos: number[] = [], uv: number[] = [], ctr: number[] = [], idx: number[] = [];
  const lean = new THREE.Vector3(sunDir.x, 0, sunDir.z).multiplyScalar(H / sunDir.y);
  const side = new THREE.Vector3(-sunDir.z, 0, sunDir.x).normalize();
  for (let i = 0; i < N; i++) {
    const w = 2 + hash(i, 3) * 5, cx = hash(i, 1), cz = hash(i, 2);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(side.x * (u - 0.5) * w + lean.x * v, H * v, side.z * (u - 0.5) * w + lean.z * v);
      uv.push(u, v); ctr.push(cx, cz);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('ctr', new THREE.Float32BufferAttribute(ctr, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, cam: { value: new THREE.Vector3() }, col: { value: new THREE.Color(arena.sun).multiplyScalar(arena.night ? 0.16 : 0.22) } },
    vertexShader: `
      attribute vec2 ctr; uniform vec3 cam; uniform float uTime; varying vec2 vUv; varying float vF;
      void main(){
        vUv = uv;
        vec2 c = mod(ctr * 120.0 + vec2(uTime * 0.6, 0.0) - cam.xz, 120.0) - 60.0;
        vF = smoothstep(60.0, 38.0, max(abs(c.x), abs(c.y))) * (0.6 + 0.4 * sin(uTime * 0.7 + ctr.x * 40.0));
        gl_Position = projectionMatrix * viewMatrix * vec4(position + vec3(c.x + cam.x, 0.0, c.y + cam.z), 1.0);
      }`,
    fragmentShader: 'uniform vec3 col; varying vec2 vUv; varying float vF; void main(){ float a = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * (1.0 - vUv.y); gl_FragColor = vec4(col * a * vF, 1.0); }',
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

/** Sea, lava, or the lake: a big animated sheet. */
function liquid(arena: Arena, y: number): THREE.Mesh {
  const lava = arena.id === 'forge';
  const mat = new THREE.ShaderMaterial({
    transparent: !lava,
    uniforms: { uTime: { value: 0 }, a: { value: new THREE.Color(lava ? 0xff3a0a : 0x2fb8d8) }, b: { value: new THREE.Color(lava ? 0xffd040 : 0x1a78c8) }, hdr: { value: lava ? 2.4 : 1 }, shore: { value: arena.id === 'beach' ? R + 12 : 1e5 }, ...fogU(arena) },
    vertexShader: `${FOG_V} uniform vec2 uFog; varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; ${FOG_SET} gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      ${FOG_V} uniform float uTime, hdr, shore; uniform vec3 a, b, uFogCol; varying vec3 vW;
      void main(){
        vec2 p = vW.xz * 0.09;
        float w = sin(p.x * 2.1 + uTime * 0.9) * sin(p.y * 1.7 - uTime * 0.7) + sin((p.x + p.y) * 3.3 + uTime * 1.3) * 0.5;
        vec3 c = mix(b, a, smoothstep(-1.0, 1.2, w)) * hdr;
        float glint = smoothstep(1.15, 1.4, w + sin(p.x * 9.0 - uTime * 2.0) * 0.25);
        c += glint * 0.5 * hdr;
        float d = length(vW.xz) - shore;
        float foam = smoothstep(0.75, 1.0, sin(d * 0.55 - uTime * 1.2 + sin(atan(vW.z, vW.x) * 9.0) * 0.8)) * smoothstep(34.0, 2.0, d) * step(-4.0, d);
        c = mix(c, vec3(1.0), foam * 0.8);
        gl_FragColor = vec4(mix(c, uFogCol, vFog), ${lava ? '1.0' : '0.86'});
      }`,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(R + 420, 48).rotateX(-Math.PI / 2), mat);
  m.position.y = y;
  return m;
}

/** The glowing wall of magic around the play circle. */
function barrier(arena: Arena): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, col: { value: new THREE.Color(arena.border) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime; uniform vec3 col; varying vec2 vUv;
      void main(){
        float u = vUv.x * ${(260 * GROW).toFixed(1)}, v = vUv.y;
        float dia = abs(fract(u + uTime * 0.25) - 0.5) + abs(fract(v * 2.0 - uTime * 0.3) - 0.5);
        float runes = smoothstep(0.32, 0.26, dia) * 0.5;
        float fade = pow(clamp(1.0 - v, 0.0, 1.0), 2.2);
        float a = fade * (0.55 + runes) + smoothstep(0.06, 0.0, v) * 1.5;
        gl_FragColor = vec4(col * (1.2 + runes * 2.0), 1.0) * a * (0.8 + 0.2 * sin(uTime * 2.0 + u));
      }`,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 7, 320, 1, true), mat);
  m.position.y = 3.5;
  m.renderOrder = 5;
  return m;
}

/** Ground marks for ice, tide pools, and speed strips; also lava pools and sky holes. */
function decalMat(kind: ZoneKind | 'lava' | 'hole', arena: Arena): THREE.ShaderMaterial {
  const k = { slick: 0, slow: 1, fast: 2, lava: 3, hole: 4 }[kind];
  const cols: Record<string, [number, number]> = {
    slick: [0xbfeaff, 0xffffff], slow: [0x3fb8d8, 0xbff4ff], fast: [arena.id === 'cat' ? 0x4dffb0 : arena.id === 'disco' ? 0x4dff88 : arena.id === 'cloud' ? 0x7ad0ff : 0xffe9b0, 0xffffff],
    lava: [0xff3a0a, 0xffd040], hole: [0x3a5ad8, 0x9ad0ff],
  };
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uTime: { value: 0 }, a: { value: new THREE.Color(cols[kind][0]) }, b: { value: new THREE.Color(cols[kind][1]) }, kind: { value: k } },
    vertexShader: 'varying vec2 vP; varying vec3 vW; void main(){ vP = position.xz; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime, kind; uniform vec3 a, b; varying vec2 vP; varying vec3 vW;
      void main(){
        float r = length(vP); float ang = atan(vP.y, vP.x);
        float edge = 1.0 - 0.09 * sin(ang * 5.0 + vW.x) - 0.05 * sin(ang * 11.0);
        float inside = smoothstep(edge, edge - 0.12, r);
        vec3 c; float al = inside;
        if (kind < 0.5) { float st = smoothstep(0.9, 1.0, sin((vW.x + vW.z) * 1.3) * sin((vW.x - vW.z) * 0.37 + 1.0)); c = mix(a, b, st + r * 0.3); al *= 0.8; }
        else if (kind < 1.5) { float rp = smoothstep(0.8, 1.0, sin(r * 14.0 - uTime * 2.5)); c = mix(a, b, rp * 0.6 + smoothstep(0.75, 1.0, r) * 0.7); al *= 0.78; }
        else if (kind < 2.5) { float ch = fract((abs(vW.x * 0.35 - floor(vW.x * 0.35 + 0.5)) * 1.6 + vW.z * 0.3) + uTime * 1.6); c = mix(a, b, smoothstep(0.55, 0.9, ch)) * 1.25; al *= 0.35 + 0.5 * smoothstep(0.4, 0.9, ch); }
        else if (kind < 3.5) { float w = sin(vW.x * 1.3 + uTime) * sin(vW.z * 1.1 - uTime * 0.8) + sin((vW.x + vW.z) * 2.3 + uTime * 1.6) * 0.4; c = mix(a, b, smoothstep(-0.6, 1.2, w)) * 2.6; c = mix(c, vec3(0.12, 0.05, 0.05), smoothstep(0.78, 0.98, r)); }
        else { float sw = sin(ang * 3.0 + r * 6.0 - uTime * 1.5); c = mix(a, b, smoothstep(0.3, 1.0, r) + sw * 0.12); c = mix(c, vec3(1.0), smoothstep(0.82, 1.0, r)); }
        gl_FragColor = vec4(c, al);
      }`,
  });
}

// ---- props ----
interface Prop {
  lit?: Part[]; glow?: Part[]; n: number;
  where: 'in' | 'out' | 'rim';
  s: [number, number];
  cluster?: number; // props per clump
  sway?: number;
  shadow?: boolean;
  far?: boolean; // only in the distance
  y?: [number, number]; // floating height (void places)
}
const cone = (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg);
const cyl = (r1: number, r2: number, h: number, seg = 6) => new THREE.CylinderGeometry(r1, r2, h, seg);
const ball = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const dome = (r: number, seg = 8) => new THREE.SphereGeometry(r, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2);
const ringOf = (n: number, f: (a: number, k: number) => Part): Part[] => Array.from({ length: n }, (_, k) => f((k / n) * Math.PI * 2, k));

const tree = (trunk: number, a: number, b: number): Part[] => [[cyl(0.3, 0.45, 2), trunk, m4(0, 1)], [ball(1.6), a, m4(0, 3, 0, 1, 0.9, 1)], [ball(1.1), b, m4(0.7, 3.9, 0.3)], [ball(0.9), a, m4(-0.8, 3.5, -0.4)]];
const pine = (snow: boolean): Part[] => [[cyl(0.25, 0.3, 1), 0x8a5a3a, m4(0, 0.5)], [cone(1.6, 2.2), 0x2f8f6a, m4(0, 1.8)], [cone(1.25, 1.9), 0x3aa57a, m4(0, 2.9)], [cone(0.8, 1.5), 0x48b888, m4(0, 3.9)], ...(snow ? [[cone(0.55, 0.7), 0xffffff, m4(0, 4.5)] as Part, [cone(1.3, 0.5), 0xffffff, m4(0, 3.3)] as Part] : [])];
const flower = (petal: number, mid: number): Part[] => [[cyl(0.04, 0.04, 0.5, 4), 0x4f9f3f, m4(0, 0.25)], [ball(0.14, 0), mid, m4(0, 0.55)], ...ringOf(5, (a): Part => [ball(0.15, 0), petal, m4(Math.cos(a) * 0.2, 0.53, Math.sin(a) * 0.2, 1, 0.5, 1)])];
const tuft = (c: number): Part[] => ringOf(5, (a, k): Part => [cone(0.07, 0.5 + (k % 3) * 0.14, 3), c, m4(Math.cos(a) * 0.14, 0.26, Math.sin(a) * 0.14, 1, 1, 1, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)]);
const rock = (c: number, c2: number): Part[] => [[ball(0.6, 0), c, m4(0, 0.25, 0, 1, 0.7, 1)], [ball(0.35, 0), c2, m4(0.5, 0.15, 0.2)]];
const shroom = (stalk: number): Part[] => [[cyl(0.18, 0.24, 0.6), stalk, m4(0, 0.3)]];
const cap = (c: number, dots = 0xffffff): Part[] => [[dome(0.55), c, m4(0, 0.55)], [ball(0.09, 0), dots, m4(0.25, 0.92, 0.1)], [ball(0.07, 0), dots, m4(-0.2, 0.9, -0.2)], [ball(0.07, 0), dots, m4(-0.05, 1.0, 0.25)]];
const crystal = (c: number): Part[] => [[new THREE.OctahedronGeometry(0.4), c, m4(0, 0.6, 0, 1, 1.8, 1)], [new THREE.OctahedronGeometry(0.25), c, m4(0.35, 0.35, 0.1, 1, 1.5, 1, 0, 0, -0.4)]];
/** A seated stone guardian cat with lit eyes. */
const cat = (c: number, c2: number): Part[] => [
  [box(2.6, 0.5, 2.4), c2, m4(0, 0.25)],
  [cone(1.15, 2.6, 6), c, m4(0, 1.8, -0.1)], [ball(0.8, 1), c, m4(0, 3.2, 0.2, 1, 0.9, 1)],
  [cone(0.28, 0.9, 4), c, m4(-0.5, 4.05, 0.1, 1, 1, 0.5)], [cone(0.28, 0.9, 4), c, m4(0.5, 4.05, 0.1, 1, 1, 0.5)],
  [cone(0.3, 0.5, 4), c, m4(0, 3.0, 0.95, 1, 1, 1, Math.PI / 2)],
  [new THREE.TorusGeometry(0.9, 0.16, 4, 10, Math.PI * 1.2), c, m4(1.0, 0.9, -0.5, 1, 1, 1, Math.PI / 2, 0, 0.3)],
];
const catEyes = (c: number): Part[] => [[box(0.3, 0.1, 0.06), c, m4(-0.33, 3.35, 0.9, 1, 1, 1, 0, 0, -0.35)], [box(0.3, 0.1, 0.06), c, m4(0.33, 3.35, 0.9, 1, 1, 1, 0, 0, 0.35)]];

function propsFor(arena: Arena): Prop[] {
  switch (arena.id) {
    case 'valley': return [
      { lit: tree(0x6a4630, 0x2f8a4a, 0x57b04a), n: 150, where: 'out', s: [0.9, 1.9], cluster: 5, sway: 1, shadow: true },
      { lit: tree(0x5a3a34, 0xe8558a, 0xff8fb0), n: 50, where: 'out', s: [0.8, 1.4], cluster: 3, sway: 1, shadow: true },
      { lit: [[box(6, 4, 6), 0xf4efe6, m4(0, 2)], [cyl(1.4, 1.4, 7, 8), 0xf4efe6, m4(-3, 3.5, -3)], [cone(1.9, 4.2, 8), 0x3a4a8a, m4(-3, 9.1, -3)], [cyl(1.4, 1.4, 7, 8), 0xf4efe6, m4(3, 3.5, 3)], [cone(1.9, 4.2, 8), 0xa8324a, m4(3, 9.1, 3)], [cyl(1.1, 1.1, 10, 8), 0xf4efe6, m4(3, 5, -3)], [cone(1.5, 5, 8), 0x2a6a8a, m4(3, 12.5, -3)], [box(1.4, 2.2, 0.3), 0x9a6a44, m4(0, 1.1, 3.05)]], n: 3, where: 'out', s: [1.6, 2.2], far: true, shadow: true },
      { lit: [[box(2.4, 1.6, 2), 0xfff4e0, m4(0, 0.8)], [cone(2.1, 1.5, 4), 0xd4623a, m4(0, 2.3, 0, 1, 1, 1, 0, Math.PI / 4)], [box(0.5, 0.9, 0.1), 0x9a6a44, m4(0, 0.45, 1.02)], [box(0.4, 0.8, 0.4), 0xb0a090, m4(0.6, 2.6, 0)]], n: 10, where: 'out', s: [1, 1.4], shadow: true },
      { lit: [...shroom(0xfff4e0), ...cap(0xff6b7a)], n: 70, where: 'in', s: [0.7, 1.4], cluster: 4 },
      { lit: flower(0xe8457a, 0xffd23d), n: 220, where: 'in', s: [0.8, 1.5], cluster: 8, sway: 2 },
      { lit: flower(0xffffff, 0xffb84d), n: 160, where: 'in', s: [0.8, 1.4], cluster: 7, sway: 2 },
      { lit: flower(0x9b8cff, 0xfff0a0), n: 120, where: 'in', s: [0.8, 1.4], cluster: 6, sway: 2 },
      { lit: tuft(0x2f7a3a), n: 500, where: 'in', s: [0.8, 1.6], cluster: 6, sway: 3 },
      { lit: rock(0xb8b4c0, 0x9c98a8), n: 50, where: 'in', s: [0.5, 1.1], cluster: 2 },
      { lit: [[cyl(0.08, 0.1, 2.2, 5), 0x7a5a44, m4(0, 1.1)]], glow: [[ball(0.3, 1), 0xffe9a0, m4(0, 2.35)]], n: 28, where: 'rim', s: [1, 1.2] },
    ];
    case 'peak': return [
      { lit: pine(true), n: 190, where: 'out', s: [0.9, 2], cluster: 6, sway: 0.5, shadow: true },
      { lit: [[ball(1.6, 0), 0x8d9bb5, m4(0, 0.7, 0, 1, 0.8, 1)], [ball(1.3, 0), 0xffffff, m4(0, 1.3, 0, 1, 0.5, 1)]], n: 40, where: 'out', s: [0.8, 2.4], shadow: true },
      { lit: [[box(3, 1.8, 2.4), 0x9a6a44, m4(0, 0.9)], [box(3.5, 0.3, 1.9), 0xffffff, m4(0, 2.4, 0.75, 1, 1, 1, 0.6)], [box(3.5, 0.3, 1.9), 0xffffff, m4(0, 2.4, -0.75, 1, 1, 1, -0.6)], [box(0.5, 1, 0.5), 0x8a7a70, m4(0.9, 3, 0)]], glow: [[box(0.6, 0.6, 0.05), 0xffd880, m4(-0.6, 1, 1.22)]], n: 8, where: 'out', s: [1, 1.4], shadow: true },
      { lit: [[cyl(0.2, 0.26, 8, 5), 0x6a7280, m4(0, 4)], [box(3.4, 0.25, 0.25), 0x6a7280, m4(0, 8)], [box(1.1, 0.9, 0.9), 0xff6b6b, m4(1.3, 6.9, 0)], [box(1.1, 0.9, 0.9), 0x5cc8ff, m4(-1.3, 6.9, 0)]], n: 10, where: 'out', s: [1, 1.2], shadow: true },
      { lit: [[box(0.9, 0.3, 0.9), 0x6a7890, m4(0, 0.15)], [cyl(0.2, 0.26, 1.1, 6), 0x7a88a0, m4(0, 0.85)], [box(0.8, 0.14, 0.8), 0x6a7890, m4(0, 1.45)], [cone(0.85, 0.55, 4), 0x4a5670, m4(0, 2.3, 0, 1, 1, 1, 0, Math.PI / 4)], [cone(0.5, 0.2, 4), 0xffffff, m4(0, 2.55, 0, 1, 1, 1, 0, Math.PI / 4)]], glow: [[box(0.5, 0.5, 0.5), 0xffc860, m4(0, 1.78)]], n: 16, where: 'in', s: [0.8, 1.2] },
      { lit: [[ball(1, 1), 0xffffff, m4(0, 0, 0, 1, 0.4, 1)], [ball(0.6, 1), 0xe6eeff, m4(0.7, 0, 0.4, 1, 0.45, 1)]], n: 150, where: 'in', s: [0.6, 1.6], cluster: 3 },
      { lit: [[cyl(0.04, 0.04, 1.4, 4), 0x2a2a35, m4(0, 0.7)], [box(0.5, 0.35, 0.03), 0xff5a5a, m4(0.27, 1.2)]], n: 40, where: 'in', s: [1, 1.2], cluster: 2 },
      { lit: [[cyl(0.04, 0.04, 1.4, 4), 0x2a2a35, m4(0, 0.7)], [box(0.5, 0.35, 0.03), 0x4a8aff, m4(0.27, 1.2)]], n: 40, where: 'in', s: [1, 1.2], cluster: 2 },
      { glow: crystal(0x9fe8ff), n: 60, where: 'in', s: [0.5, 1], cluster: 3 },
      { lit: pine(true), n: 30, where: 'in', s: [0.35, 0.55], cluster: 3 },
    ];
    case 'beach': return [
      { lit: [[cyl(0.22, 0.34, 4.6, 6), 0xb98a5a, m4(0.3, 2.3, 0, 1, 1, 1, 0, 0, -0.12)], ...ringOf(6, (a): Part => [box(2.8, 0.08, 0.75), 0x4fbf6a, m4(Math.cos(a) * 1.25 + 0.6, 4.45, Math.sin(a) * 1.25, 1, 1, 1, 0, -a, -0.38)]), [ball(0.25, 0), 0x7a5230, m4(0.6, 4.2, 0.25)], [ball(0.25, 0), 0x7a5230, m4(0.35, 4.15, -0.2)]], n: 110, where: 'out', s: [0.9, 1.6], cluster: 4, sway: 0.7, shadow: true },
      { lit: [[cyl(0.06, 0.06, 2.6, 4), 0xffffff, m4(0, 1.3)], ...ringOf(8, (a, k): Part => [new THREE.ConeGeometry(1.7, 0.7, 8, 1, true, a, Math.PI / 4), k % 2 ? 0xd8323a : 0xffffff, m4(0, 2.7)]), [box(1.2, 0.1, 2.2), 0x5cc8ff, m4(1.3, 0.05, 0)]], n: 22, where: 'out', s: [1, 1.2], shadow: true },
      { lit: [[cyl(0.9, 1.1, 0.8, 8), 0xe8c880, m4(0, 0.4)], [cyl(0.5, 0.6, 0.7, 8), 0xe8c880, m4(0, 1.1)], [cone(0.5, 0.5, 8), 0xe0b868, m4(0, 1.7)], [cyl(0.02, 0.02, 0.6, 3), 0x8a6a4a, m4(0, 2.1)], [box(0.3, 0.2, 0.02), 0xff6b9a, m4(0.16, 2.3)]], n: 14, where: 'in', s: [0.6, 1] },
      { lit: [[dome(0.35, 6), 0xffc2d6, m4(0, 0, 0, 1, 0.6, 1)]], n: 150, where: 'in', s: [0.6, 1.3], cluster: 4 },
      { lit: ringOf(5, (a): Part => [box(0.5, 0.1, 0.16), 0xff9d5c, m4(Math.cos(a) * 0.25, 0.05, Math.sin(a) * 0.25, 1, 1, 1, 0, -a)]), n: 90, where: 'in', s: [0.8, 1.4], cluster: 2 },
      { lit: [[ball(0.5, 2), 0xffffff, m4(0, 0.5)], ...ringOf(5, (a): Part => [ball(0.17, 0), 0x2a2a35, m4(Math.cos(a) * 0.36, 0.62, Math.sin(a) * 0.36)]), [ball(0.17, 0), 0x2a2a35, m4(0, 0.95)]], n: 8, where: 'in', s: [0.8, 1] },
      { lit: rock(0xc8b8a0, 0xb0a088), n: 60, where: 'in', s: [0.4, 0.9], cluster: 3 },
      { lit: tuft(0x9fbf6a), n: 120, where: 'in', s: [0.8, 1.3], cluster: 5, sway: 3 },
      { lit: [[box(0.5, 2.6, 0.12), 0xff8a5c, m4(0, 1.3, 0, 1, 1, 1, 0, 0, 0.15)], [box(0.12, 2.5, 0.13), 0xffffff, m4(0, 1.3, 0, 1, 1, 1, 0, 0, 0.15)]], n: 12, where: 'out', s: [1, 1.3] },
    ];
    case 'grove': return [
      { lit: [[cyl(0.5, 0.8, 5, 7), 0xd8d0e8, m4(0, 2.5)]], glow: [[dome(2.4, 10), 0x4dffd9, m4(0, 4.6, 0, 1, 0.7, 1)], [ball(0.25, 0), 0xffffff, m4(1, 5.8, 0.4)], [ball(0.2, 0), 0xffffff, m4(-0.8, 5.9, -0.6)]], n: 90, where: 'out', s: [0.8, 2.6], cluster: 4, shadow: true },
      { lit: [[cyl(0.4, 0.6, 4, 7), 0xd0c8e0, m4(0, 2)]], glow: [[dome(1.9, 10), 0xff7ad9, m4(0, 3.7, 0, 1, 0.8, 1)]], n: 60, where: 'out', s: [0.8, 2], cluster: 3, shadow: true },
      { lit: tree(0x3a3050, 0x24506a, 0x2c6a7a), n: 110, where: 'out', s: [1.2, 2.4], cluster: 5, sway: 1, shadow: true },
      { lit: shroom(0xe8e0f8), glow: cap(0x4dffd9, 0xffffff), n: 150, where: 'in', s: [0.5, 1.1], cluster: 6 },
      { lit: shroom(0xe8e0f8), glow: cap(0xff7ad9, 0xffffff), n: 110, where: 'in', s: [0.5, 1], cluster: 5 },
      { lit: tuft(0x2f7a78), n: 380, where: 'in', s: [0.8, 1.8], cluster: 6, sway: 3 },
      { glow: crystal(0x7a9dff), n: 50, where: 'in', s: [0.5, 1.1], cluster: 2 },
      { lit: [[cyl(0.03, 0.03, 0.9, 4), 0x2f7a78, m4(0, 0.45)]], glow: [[ball(0.14, 0), 0xffe066, m4(0, 0.95)]], n: 160, where: 'in', s: [0.8, 1.5], cluster: 7, sway: 3 },
      { lit: rock(0x4a5a7a, 0x3a4a6a), n: 50, where: 'in', s: [0.5, 1.2], cluster: 2 },
    ];
    case 'canyon': return [
      { lit: [[cyl(1.1, 1.5, 4, 6), 0xc8683a, m4(0, 2)], [cyl(0.8, 1.1, 3, 6), 0xd8824a, m4(0, 5.5)], [ball(1.3, 0), 0xb85a30, m4(0, 7.6, 0, 1, 0.7, 1)]], n: 60, where: 'out', s: [0.8, 2.4], cluster: 3, shadow: true },
      { lit: [[cyl(0.22, 0.3, 3.4, 6), 0xf4efe6, m4(0, 1.7)], [ball(1.3), 0xffc83d, m4(0, 3.8, 0, 1, 1.15, 1)], [ball(0.9), 0xffe066, m4(0.5, 4.6, 0.2)], [ball(0.8), 0xffaa2a, m4(-0.6, 4.2, -0.3)]], n: 150, where: 'out', s: [0.8, 1.6], cluster: 7, sway: 1.2, shadow: true },
      { lit: [[cyl(0.3, 0.34, 2.2, 7), 0x4f9f5a, m4(0, 1.1)], [ball(0.31, 1), 0x4f9f5a, m4(0, 2.2)], [cyl(0.16, 0.16, 0.9, 6), 0x4f9f5a, m4(0.55, 1.5)], [cyl(0.16, 0.16, 0.5, 6), 0x4f9f5a, m4(0.38, 1.1, 0, 1, 1, 1, 0, 0, Math.PI / 2)], [cyl(0.16, 0.16, 0.7, 6), 0x4f9f5a, m4(-0.5, 1.2)], [ball(0.1, 0), 0xff8fc8, m4(0, 2.55)]], n: 40, where: 'in', s: [0.5, 0.9], cluster: 2 },
      { lit: [[ball(0.5, 0), 0x9aa86a, m4(0, 0.25, 0, 1, 0.6, 1)], [ball(0.3, 0), 0xb8c080, m4(0.4, 0.2, 0.1)]], n: 220, where: 'in', s: [0.6, 1.3], cluster: 4 },
      { lit: rock(0xc8683a, 0xa85028), n: 160, where: 'in', s: [0.4, 1.1], cluster: 4 },
      { lit: tuft(0xd8b85a), n: 260, where: 'in', s: [0.8, 1.5], cluster: 6, sway: 3 },
      { lit: flower(0xffe066, 0xff8a3c), n: 90, where: 'in', s: [0.8, 1.2], cluster: 5, sway: 2 },
    ];
    case 'cat': return [
      { lit: cat(0x7a8296, 0x565c70), glow: catEyes(0xffd04a), n: 5, where: 'out', s: [2.2, 3.4], shadow: true },
      { lit: cat(0x3a3a4a, 0x2a2a38), glow: catEyes(0x4dffd9), n: 5, where: 'out', s: [2, 3], shadow: true },
      { lit: cat(0x4a8a7a, 0x3a6a62), glow: catEyes(0xff7ad9), n: 4, where: 'out', s: [2, 3.2], shadow: true },
      { lit: tree(0x4a2e34, 0xe8558a, 0xff8fb0), n: 140, where: 'out', s: [0.9, 1.8], cluster: 6, sway: 1, shadow: true },
      { lit: [[cyl(0.28, 0.34, 5, 8), 0xc8322a, m4(-1.8, 2.5)], [cyl(0.28, 0.34, 5, 8), 0xc8322a, m4(1.8, 2.5)], [box(5.4, 0.4, 0.6), 0x2a2030, m4(0, 5.2)], [box(4.8, 0.3, 0.4), 0xc8322a, m4(0, 4.2)], [box(0.5, 0.8, 0.3), 0x2a2030, m4(0, 4.75)]], n: 12, where: 'out', s: [1, 1.5], shadow: true },
      { lit: ringOf(5, (a, k): Part => [cyl(0.16, 0.16, 0.03, 5), k % 2 ? 0xff8fb0 : 0xffc0d4, m4(Math.cos(a * 1.7) * (0.3 + k * 0.13), 0.02, Math.sin(a * 1.7) * (0.3 + k * 0.13), 1.5, 1, 0.8, 0, a * 2.3)]), n: 130, where: 'in', s: [0.7, 1.2], cluster: 4 },
      { lit: [[cyl(0.5, 0.36, 0.25, 10), 0x8fd8ff, m4(0, 0.13)], [cyl(0.42, 0.42, 0.04, 10), 0xffffff, m4(0, 0.25)]], n: 16, where: 'in', s: [0.8, 1.1] },
      { lit: flower(0xe8558a, 0xffffff), n: 240, where: 'in', s: [0.8, 1.5], cluster: 8, sway: 2 },
      { lit: flower(0x7a5ae8, 0xffd23d), n: 160, where: 'in', s: [0.8, 1.4], cluster: 7, sway: 2 },
      { lit: tuft(0x2f7a4a), n: 420, where: 'in', s: [0.8, 1.5], cluster: 6, sway: 3 },
      { lit: [[box(0.5, 0.2, 0.14), 0x8fc8e8, m4(0, 0.12)], [cone(0.16, 0.26, 3), 0x8fc8e8, m4(-0.34, 0.12, 0, 1, 1, 0.4, 0, 0, -Math.PI / 2)]], n: 60, where: 'in', s: [0.8, 1.3], cluster: 3 },
    ];
    case 'disco': return [
      { lit: [[box(3, 4.4, 2.4), 0x2a2040, m4(0, 2.2)]], glow: [[cyl(0.9, 0.9, 0.1, 12), 0xff4dd2, m4(0, 3, 1.22, 1, 1, 1, Math.PI / 2)], [cyl(0.55, 0.55, 0.1, 12), 0x4dd2ff, m4(0, 1.1, 1.22, 1, 1, 1, Math.PI / 2)]], n: 18, where: 'rim', s: [1.2, 1.8] },
      { lit: [[cyl(0.15, 0.25, 9, 6), 0x3a3060, m4(0, 4.5)]], glow: [[ball(0.6, 1), 0xffe04d, m4(0, 9.3)]], n: 26, where: 'rim', s: [1, 1.3] },
      { glow: [[box(5, 0.3, 5), 0x4dff88, m4(0, 0)]], n: 40, where: 'out', s: [0.8, 2], y: [-16, 6] },
      { glow: [[box(5, 0.3, 5), 0xff4dd2, m4(0, 0)]], n: 40, where: 'out', s: [0.8, 2], y: [-16, 6] },
      { glow: [[box(5, 0.3, 5), 0x4dd2ff, m4(0, 0)]], n: 40, where: 'out', s: [0.8, 2], y: [-16, 6] },
      { glow: [[new THREE.OctahedronGeometry(1), 0xffffff, m4(0, 0, 0, 1, 1.6, 1)]], n: 70, where: 'out', s: [0.5, 1.6], y: [4, 50] },
      { glow: ringOf(5, (a): Part => [cone(0.12, 0.45, 3), 0xffe04d, m4(Math.cos(a) * 0.22, 0.05, Math.sin(a) * 0.22, 1, 1, 1, Math.PI / 2, 0, a - Math.PI / 2)]), n: 150, where: 'in', s: [0.8, 1.6], cluster: 3 },
    ];
    case 'forge': return [
      { lit: [[cone(1.6, 7, 5), 0x3a3038, m4(0, 3.5)], [cone(0.9, 4, 5), 0x4a3c44, m4(1.2, 2, 0.4, 1, 1, 1, 0, 0, -0.3)]], n: 150, where: 'out', s: [0.8, 3], cluster: 5, shadow: true },
      { lit: [[cyl(0.3, 0.45, 3, 5), 0x2a2024, m4(0, 1.5)], [cyl(0.12, 0.2, 2, 4), 0x2a2024, m4(0.6, 3.2, 0, 1, 1, 1, 0, 0, -0.7)], [cyl(0.1, 0.18, 1.6, 4), 0x2a2024, m4(-0.5, 3, 0, 1, 1, 1, 0, 0, 0.8)]], n: 50, where: 'out', s: [0.9, 1.6], shadow: true },
      { lit: [[box(2.4, 1.2, 1.4), 0x4a4048, m4(0, 0.6)], [box(3.2, 0.5, 1.6), 0x5a5058, m4(0, 1.45)], [cyl(1.6, 2, 3, 6), 0x3a3038, m4(4, 1.5)]], glow: [[cyl(1.2, 1.2, 0.1, 6), 0xff7a1f, m4(4, 3.05)], [box(0.3, 0.3, 1.2), 0xffb81f, m4(0, 1.85, 0)]], n: 5, where: 'out', s: [1.2, 1.8], shadow: true },
      { glow: crystal(0xff7a1f), n: 90, where: 'in', s: [0.5, 1.1], cluster: 3 },
      { glow: [[box(1.8, 0.04, 0.09), 0xff5a1f, m4(0, 0.03)], [box(0.9, 0.04, 0.07), 0xffb81f, m4(0.6, 0.03, 0.35, 1, 1, 1, 0, 0.8)], [box(0.7, 0.04, 0.06), 0xff5a1f, m4(-0.5, 0.03, -0.3, 1, 1, 1, 0, -0.6)]], n: 240, where: 'in', s: [0.8, 2.2], cluster: 2 },
      { lit: rock(0x3a3038, 0x4a3c44), n: 220, where: 'in', s: [0.5, 1.4], cluster: 4 },
      { lit: [[ball(0.5, 0), 0x5a5058, m4(0, 0.2, 0, 1, 0.5, 1)]], glow: [[ball(0.2, 0), 0xffb81f, m4(0.1, 0.42, 0.1)]], n: 100, where: 'in', s: [0.6, 1.2], cluster: 3 },
    ];
    default: return [ // cloud
      { lit: [[ball(3, 2), 0xffffff, m4(0, 0, 0, 1, 0.55, 1)], [ball(2.2, 2), 0xffffff, m4(2.6, 0.3, 0.5, 1, 0.6, 1)], [ball(2, 2), 0xf4ecff, m4(-2.4, 0.1, -0.4, 1, 0.55, 1)], [ball(1.6, 2), 0xffffff, m4(0.6, 0.9, -1.4, 1, 0.6, 1)]], n: 160, where: 'out', s: [1.5, 6], y: [-34, 2] },
      { lit: [[cyl(0.5, 0.6, 6, 8), 0xfff4e0, m4(0, 3)], [box(1.6, 0.4, 1.6), 0xfff4e0, m4(0, 6.2)], [box(1.6, 0.4, 1.6), 0xfff4e0, m4(0, 0.2)]], glow: [[ball(0.5, 1), 0xffe066, m4(0, 7)]], n: 24, where: 'rim', s: [1, 1.3] },
      { glow: ringOf(18, (a, k): Part => [box(2.2, 0.9, 0.9), [0xff6b6b, 0xffb84d, 0xffe066, 0x7ee081, 0x5cc8ff, 0xb18cff][k % 6], m4(Math.cos(a / 2) * 12, Math.sin(a / 2) * 12, 0, 1, 1, 1, 0, 0, a / 2 + Math.PI / 2)]), n: 5, where: 'out', s: [2.5, 5], far: true, y: [-6, 2] },
      { lit: [[ball(0.9, 1), 0xffffff, m4(0, 0.1, 0, 1, 0.35, 1)], [ball(0.6, 1), 0xf4ecff, m4(0.7, 0.1, 0.3, 1, 0.4, 1)]], n: 320, where: 'in', s: [0.6, 1.8], cluster: 4 },
      { glow: ringOf(5, (a): Part => [cone(0.12, 0.45, 3), 0xffe066, m4(Math.cos(a) * 0.22, 0.4, Math.sin(a) * 0.22, 1, 1, 1, Math.PI / 2, 0, a - Math.PI / 2)]), n: 120, where: 'in', s: [0.8, 1.6], cluster: 3 },
      { lit: [[cone(3.5, 5, 6), 0xb8a8d8, m4(0, -2.5, 0, 1, 1, 1, Math.PI)], [cyl(3.5, 3.5, 0.6, 6), 0xc8f0a8, m4(0, 0.3)], [cyl(0.3, 0.3, 2.4, 6), 0xfff4e0, m4(-1.2, 1.8, 0)], [cyl(0.3, 0.3, 2.4, 6), 0xfff4e0, m4(1.2, 1.8, 0)], [box(3.4, 0.4, 1), 0xfff4e0, m4(0, 3.2)]], n: 12, where: 'out', s: [1, 2.4], y: [-10, 18] },
    ];
  }
}

const AIR: Record<string, { col: number; size: number; vel: [number, number, number]; hdr: number; n: number }> = {
  valley: { col: 0xfff4c0, size: 5, vel: [0.6, 0.15, 0.3], hdr: 1.4, n: 260 },
  peak: { col: 0xffffff, size: 6, vel: [1.2, -3, 0.5], hdr: 1, n: 520 },
  beach: { col: 0xffffff, size: 4, vel: [1.5, 0.1, 0.2], hdr: 1.2, n: 140 },
  grove: { col: 0xb8ff7a, size: 7, vel: [0.3, 0.25, -0.3], hdr: 3, n: 340 },
  canyon: { col: 0xffd8a0, size: 4, vel: [3, 0.1, 0.6], hdr: 1, n: 240 },
  cat: { col: 0xffc2e2, size: 7, vel: [0.7, -0.5, 0.3], hdr: 1.1, n: 300 },
  disco: { col: 0xff8ff0, size: 6, vel: [0, 1.2, 0], hdr: 3, n: 380 },
  forge: { col: 0xff9a3a, size: 6, vel: [0.4, 2.2, 0.2], hdr: 3.2, n: 420 },
  cloud: { col: 0xfff0b0, size: 6, vel: [0.8, 0.3, 0.2], hdr: 1.8, n: 300 },
};

/** Drifting motes around the camera: pollen, snow, fireflies, embers. */
function air(arena: Arena, low: boolean): THREE.Points {
  const a = AIR[arena.id], n = Math.round(a.n * (low ? 0.35 : 1));
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: arena.night ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, cam: { value: new THREE.Vector3() }, col: { value: new THREE.Color(a.col).multiplyScalar(a.hdr) }, vel: { value: new THREE.Vector3(...a.vel) }, size: { value: a.size }, px: { value: 1 } },
    vertexShader: `
      uniform float uTime, size, px; uniform vec3 cam, vel; varying float vA;
      void main(){
        vec3 box = vec3(70.0, 22.0, 70.0);
        vec3 p = position * box + vel * uTime;
        p.x += sin(uTime * 0.7 + position.y * 40.0) * 1.2; p.z += cos(uTime * 0.6 + position.x * 40.0) * 1.2;
        p = mod(p - cam, box) - box * 0.5 + cam; p.y = mod(position.y * box.y + vel.y * uTime, box.y) + 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = 0.55 + 0.45 * sin(uTime * 2.0 + position.z * 60.0);
        gl_PointSize = size * px * (40.0 / -mv.z) * (0.6 + position.x * 0.8);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'uniform vec3 col; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(col, smoothstep(0.5, 0.1, d) * vA * 0.9); }',
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  return p;
}

export interface Scenery {
  group: THREE.Group;
  sunDir: THREE.Vector3;
  update(t: number, cam: THREE.Vector3, px: number): void;
  bump(x: number, z: number): void;
  dispose(): void;
}

export function buildArena(arena: Arena, sim: Sim, low: boolean): Scenery {
  const group = new THREE.Group();
  const timed: { value: number }[] = [];
  const track = <M extends THREE.ShaderMaterial>(m: M) => { timed.push(m.uniforms.uTime); return m; };
  const sunDir = new THREE.Vector3(-0.6, arena.night ? 0.75 : 0.62, 0.5).normalize();
  const h = heightFn(arena);
  const isVoid = VOID.has(arena.id);

  const skyDome = sky(arena, new THREE.Vector3(-0.5, arena.night ? 0.5 : 0.32, -0.8));
  track(skyDome.material as THREE.ShaderMaterial);
  group.add(skyDome, terrain(arena, h, low));
  const wy = WATER_Y[arena.id];
  if (wy !== undefined) { const l = liquid(arena, wy); track(l.material as THREE.ShaderMaterial); group.add(l); }
  const wall = barrier(arena);
  track(wall.material as THREE.ShaderMaterial);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R + 0.3, 384).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(arena.border).multiplyScalar(2.2) }));
  ring.position.y = 0.05;
  group.add(wall, ring);
  const nC = Math.round((low ? 100 : 210) * GROW);
  const crystals = instanced(new THREE.OctahedronGeometry(1, 0), glowMat(0.9, { color: arena.border }), nC, false);
  for (let i = 0; i < nC; i++) {
    const a = (i / nC) * Math.PI * 2, ch = 1 + ((i * 7) % 5) * 0.3;
    crystals.setMatrixAt(i, m4(Math.cos(a) * (R + 1), ch * 0.8, Math.sin(a) * (R + 1), 0.55, ch, 0.55, 0, -a, 0));
  }
  crystals.count = nC;
  group.add(crystals);

  // dance floor: glowing tiles that pulse
  if (arena.id === 'disco') {
    const m = track(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec2 g = vW.xz / 5.0; vec2 id = floor(g); vec2 f = abs(fract(g) - 0.5);
          float r = h21(id); float beat = 0.5 + 0.5 * sin(uTime * 4.2 + r * 6.283);
          vec3 pal = 0.5 + 0.5 * cos(6.283 * (r + vec3(0.0, 0.33, 0.67)) + uTime * 0.3);
          float line = smoothstep(0.465, 0.5, max(f.x, f.y));
          vec3 c = mix(vec3(0.03, 0.02, 0.09) + pal * (0.03 + 0.26 * beat * step(0.6, r)), mix(vec3(1.0, 0.25, 0.85), vec3(0.2, 0.85, 1.0), 0.5 + 0.5 * sin(vW.x * 0.03 + vW.z * 0.02 + uTime * 0.4)) * 1.4, line);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 160).rotateX(-Math.PI / 2), m);
    floor.position.y = 0.02;
    group.add(floor);
    const ballGeo = new THREE.IcosahedronGeometry(7, 1);
    const disco = new THREE.Mesh(ballGeo, flatMat({ color: 0xffffff, emissive: 0x8a6aff, emissiveIntensity: 0.9 }));
    disco.position.set(0, 46, -R - 30);
    disco.userData.spin = 0.4;
    group.add(disco);
  }

  // props
    const swayMat = <M extends THREE.Material>(base: M, amount: number): M => {
    const prev = base.onBeforeCompile, prevKey = base.customProgramCacheKey();
    base.onBeforeCompile = (sh, r) => {
      prev?.call(base, sh, r);
      sh.uniforms.uTime = base.userData.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swP = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27;
          float swA = ${amount.toFixed(2)} * 0.035 * transformed.y * transformed.y / (1.0 + transformed.y * 0.5);
          transformed.x += sin(uTime * 1.6 + swP) * swA; transformed.z += cos(uTime * 1.3 + swP * 1.3) * swA;
        #endif`);
    };
    base.userData.uTime = { value: 0 };
    base.customProgramCacheKey = () => `sway${amount}${prevKey}`;
    timed.push(base.userData.uTime);
    return base;
  };
  let seed = arena.id.charCodeAt(0) * 7 + arena.id.length;
  const rnd = () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };
  const blocked = (x: number, z: number, pad: number) => sim.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad) || sim.zones.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * 0.9);
  for (const pr of propsFor(arena)) {
    const n = Math.round(pr.n * (pr.where === 'in' ? GROW * GROW : GROW) * (low && pr.n > 30 ? 0.45 : 1));
    const mats: THREE.Matrix4[] = [];
    let cx = 0, cz = 0, left = 0;
    for (let tries = 0; mats.length < n && tries < n * 8; tries++) {
      let x: number, z: number;
      if (left <= 0) {
        const a = rnd() * Math.PI * 2;
        const r = pr.where === 'in' ? Math.sqrt(rnd()) * (R - 3) : pr.where === 'rim' ? R + 3.2 : pr.far ? R + 70 + rnd() * 120 : R + 6 + rnd() * rnd() * 150;
        cx = Math.cos(a) * r; cz = Math.sin(a) * r;
        left = pr.cluster ?? 1;
        if (pr.where === 'rim') { const k = mats.length / n * Math.PI * 2 + 0.1; cx = Math.cos(k) * r; cz = Math.sin(k) * r; }
        x = cx; z = cz;
      } else {
        const spread = pr.where === 'in' ? 1.2 + Math.sqrt(pr.cluster ?? 1) * 0.9 : 3 + (pr.cluster ?? 1) * 1.2;
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread;
        x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d;
      }
      left--;
      const rr = Math.hypot(x, z);
      if (pr.where === 'in' ? rr > R - 2 || blocked(x, z, 1) : rr < R + 3) continue;
      let y = pr.where === 'in' ? 0 : h(x, z);
      if (pr.y) y = pr.y[0] + rnd() * (pr.y[1] - pr.y[0]);
      else if (pr.where === 'out' && (isVoid || (wy !== undefined && y < wy + 0.3))) continue;
      const s = pr.s[0] + rnd() * (pr.s[1] - pr.s[0]);
      mats.push(m4(x, y, z, s, s, s, 0, pr.where === 'rim' ? -Math.atan2(z, x) - Math.PI / 2 : rnd() * 6.28, 0));
    }
    // one instanced mesh per tile, culled by the camera (and the shadow camera) when out of view
    const tiles = new Map<number, THREE.Matrix4[]>();
    for (const m of mats) {
      const k = Math.floor(m.elements[12] / TILE) * 1000 + Math.floor(m.elements[14] / TILE);
      let list = tiles.get(k);
      if (!list) tiles.set(k, list = []);
      list.push(m);
    }
    const add = (parts: Part[] | undefined, mat: THREE.Material | null) => {
      const ink = !mat;
      if (!parts) return;
      let geo = merge(parts);
      if (ink) { geo.computeBoundingSphere(); mat = inkMat(geo.boundingSphere!.radius * 0.016, { vertexColors: true }); geo = hullGeo(geo); }
      const mt = pr.sway ? swayMat(mat!, pr.sway) : mat!;
      for (const list of tiles.values()) {
        const mesh = instanced(geo, mt, list.length, false);
        list.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.count = list.length;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.computeBoundingSphere();
        mesh.boundingSphere!.radius += 2; // room for the sway
        mesh.frustumCulled = true;
        mesh.castShadow = !!pr.shadow && !low && !ink;
        mesh.receiveShadow = pr.where !== 'in' && !ink;
        group.add(mesh);
      }
    };
    add(pr.lit, flatMat({ vertexColors: true }));
    add(pr.glow, glowMat(arena.night ? 0.95 : 1.1, { vertexColors: true }));
    // ink outlines on the big props only (the ones that cast shadows), and only on High
    if (pr.shadow && !low) { add(pr.lit, null); add(pr.glow, null); }
  }

  // puffy clouds high in the sky
  if (!arena.night) {
    const puff = merge([[ball(6, 2), 0xffffff, m4(0, 0, 0, 1, 0.5, 1)], [ball(4.5, 2), 0xffffff, m4(6, 0.5, 1, 1, 0.55, 1)], [ball(4, 2), 0xffffff, m4(-5.5, 0, -1, 1, 0.5, 1)], [ball(3.4, 2), 0xffffff, m4(1, 1.8, -3, 1, 0.55, 1)]]);
    const nCloud = Math.round(46 * GROW);
    const clouds = instanced(puff, flatMat({ vertexColors: true, emissive: new THREE.Color(arena.sky).multiplyScalar(0.45), fog: false }), nCloud, false);
    for (let i = 0; i < nCloud; i++) { const a = rnd() * 6.28, r = 40 + Math.sqrt(rnd()) * (R + 380), s = 1.5 + rnd() * 3.5; clouds.setMatrixAt(i, m4(Math.cos(a) * r, 55 + rnd() * 70, Math.sin(a) * r, s, s, s, 0, rnd() * 6.28)); }
    clouds.count = nCloud;
    clouds.userData.spin = 0.004;
    group.add(clouds);
  }

  // hazards: bumpers, rocks, pools, zones
  const bumpers: { mesh: THREE.Object3D; x: number; z: number; s: number; t: number }[] = [];
  const poolMat = sim.obstacles.some((o) => o.kind === 'pool') ? track(decalMat(arena.id === 'forge' ? 'lava' : 'hole', arena)) : null;
  const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  // many hazards share a few looks: one geometry per look, one material per kind of surface
  const geoCache = new Map<string, THREE.BufferGeometry>();
  const geoOf = (key: string, parts: Part[]) => { let g = geoCache.get(key); if (!g) geoCache.set(key, g = merge(parts)); return g; };
  const hazLit = flatMat({ vertexColors: true }), hazGlow = glowMat(1.5, { vertexColors: true }), hazInk = inkMat(0.035, { vertexColors: true });
  for (const o of sim.obstacles) {
    if (o.kind === 'pool') {
      const m = new THREE.Mesh(disc, poolMat!);
      m.position.set(o.x, 0.03, o.z);
      m.scale.setScalar(o.r * 1.06);
      group.add(m);
      continue;
    }
    let lit: Part[], glow: Part[] = [];
    if (o.kind === 'rock') {
      lit = arena.id === 'forge'
        ? [[cone(1, 3.2, 5), 0x2a2228, m4(0, 1.6)], [cone(0.6, 2, 5), 0x3a3038, m4(0.5, 1, 0.3, 1, 1, 1, 0, 0, -0.4)], [cone(0.5, 1.6, 5), 0x3a3038, m4(-0.5, 0.8, -0.3, 1, 1, 1, 0, 0, 0.45)]]
        : [[cyl(0.8, 1, 1.3, 7), 0xc8683a, m4(0, 0.65)], [cyl(0.6, 0.8, 1.2, 7), 0xe0905a, m4(0.05, 1.9)], [cyl(0.75, 0.6, 0.5, 7), 0xb85a30, m4(0, 2.75)], [ball(0.5, 0), 0xa85028, m4(0.8, 0.3, 0.5)]];
      if (arena.id === 'forge') glow = [[new THREE.TorusGeometry(0.98, 0.06, 4, 16), 0xff5a1f, m4(0, 0.08, 0, 1, 1, 1, Math.PI / 2)]];
    } else if (arena.id === 'cat') {
      const c = [0xd8324a, 0x2a6ad8, 0xe8a82a, 0x7a3ad8][bumpers.length % 4];
      lit = [[ball(1, 2), c, m4(0, 0.95)], ...ringOf(5, (a): Part => [new THREE.TorusGeometry(1.01, 0.05, 4, 20), 0xffd88a, m4(0, 0.95, 0, 1, 1, 1, a * 0.5, a, 0)])];
    } else if (arena.id === 'cloud') {
      lit = [[ball(1, 2), 0xffffff, m4(0, 0.7, 0, 1, 0.75, 1)], [ball(0.6, 2), 0xffe8f4, m4(0.6, 0.5, 0.3)], [ball(0.6, 2), 0xe8f0ff, m4(-0.55, 0.5, -0.3)]];
    } else {
      lit = [[cyl(0.4, 0.55, 1.1, 8), 0xe8e0f8, m4(0, 0.55)]];
      glow = [[dome(1.05, 12), bumpers.length % 2 ? 0xff7ad9 : 0x4dffd9, m4(0, 1, 0, 1, 0.8, 1)], [ball(0.14, 0), 0xffffff, m4(0.5, 1.6, 0.2)], [ball(0.12, 0), 0xffffff, m4(-0.4, 1.65, -0.3)], [ball(0.12, 0), 0xffffff, m4(0, 1.75, 0.5)]];
    }
    const look = `${o.kind}${o.kind === 'bumper' ? bumpers.length % (arena.id === 'cat' ? 4 : 2) : ''}`;
    const g = new THREE.Group();
    const lm = new THREE.Mesh(geoOf(look, lit), hazLit);
    lm.castShadow = !low;
    g.add(lm);
    if (glow.length) g.add(new THREE.Mesh(geoOf(look + 'g', glow), hazGlow));
    if (!low) g.add(new THREE.Mesh(geoCache.get(look + 'i') ?? geoCache.set(look + 'i', hullGeo(merge([...lit, ...glow]))).get(look + 'i')!, hazInk));
    g.position.set(o.x, 0, o.z);
    g.scale.setScalar(o.r);
    g.rotation.y = rnd() * 6.28;
    group.add(g);
    if (o.kind === 'bumper') bumpers.push({ mesh: g, x: o.x, z: o.z, s: o.r, t: 9 });
  }
  const zoneMats: Partial<Record<ZoneKind, THREE.ShaderMaterial>> = {};
  for (const z of sim.zones) {
    const m = new THREE.Mesh(disc, zoneMats[z.kind] ??= track(decalMat(z.kind, arena)));
    m.position.set(z.x, 0.025, z.z);
    m.scale.setScalar(z.r * 1.08);
    group.add(m);
  }

  const rays = low ? null : shafts(arena, sunDir);
  if (rays) { track(rays.material as THREE.ShaderMaterial); group.add(rays); }
  const motes = air(arena, low);
  track(motes.material as THREE.ShaderMaterial);
  group.add(motes);
  const spinners = group.children.filter((c) => c.userData.spin);
  let last = 0;

  return {
    group, sunDir,
    update(t, cam, px) {
      const dt = Math.min(0.1, t - last);
      last = t;
      for (const u of timed) u.value = t;
      skyDome.position.set(cam.x, 0, cam.z);
      const mu = (motes.material as THREE.ShaderMaterial).uniforms;
      (mu.cam.value as THREE.Vector3).copy(cam);
      mu.px.value = px;
      if (rays) ((rays.material as THREE.ShaderMaterial).uniforms.cam.value as THREE.Vector3).copy(cam);
      for (const s of spinners) s.rotation.y += s.userData.spin * dt;
      for (const b of bumpers) {
        if (b.t > 1.2) continue;
        b.t += dt;
        const k = Math.exp(-b.t * 4) * Math.sin(b.t * 22) * 0.35;
        b.mesh.scale.set(b.s * (1 + k), b.s * (1 - k), b.s * (1 + k));
      }
    },
    bump(x, z) { for (const b of bumpers) if (Math.abs(b.x - x) < 0.1 && Math.abs(b.z - z) < 0.1) b.t = 0; },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
    },
  };
}
