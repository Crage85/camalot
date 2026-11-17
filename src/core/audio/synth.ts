// Synth voices, drums, and the master mix. Everything works on any BaseAudioContext so the same
// code runs live and in an OfflineAudioContext (audio-lab.html and the render check).

type Ctx = BaseAudioContext;

/** A tonal instrument, described as data and played by `tone`. */
export interface Inst {
  /** Oscillators: [wave, frequency ratio, gain, detune cents]. */
  osc: [OscillatorType, number, number, number?][];
  /** FM on every oscillator: [modulator ratio, index (x frequency), index decay s]. Electric-piano and glass tones. */
  fm?: [number, number, number];
  a: number; // attack s
  d: number; // decay time constant s
  s: number; // sustain level 0..1; 0 = struck or plucked (rings out, ignores note length)
  r: number; // release time constant s
  /** Lowpass: [cutoff as a multiple of the note, extra opening at the attack (multiple), opening decay s]. */
  lp?: [number, number, number];
  /** Vibrato: [Hz, cents]. */
  vib?: [number, number];
  /** Pitch glide into the note: [start offset in semitones, seconds]. 808 drop, lead scoop. */
  glide?: [number, number];
  /** Filter wobble (needs lp): [cycle length in sixteenths, depth 0..1]. */
  wob?: [number, number];
  /** Effect shared by all notes of the instrument (built once per song by `fxBus`). */
  fx?: ['drive', number, number, number] | ['choir'];
  oct?: number; // octave shift
  gain: number;
  rev: number; // reverb send 0..1
  pan?: number;
}

const SAW = 'sawtooth';
const defs = {
  // ---- sound effects only (sfx.ts) ----
  bell: { osc: [['sine', 1, 1], ['sine', 2, 0.25]], fm: [3.5, 1.6, 0.25], a: 0.002, d: 0.45, s: 0, r: 0.3, oct: 1, gain: 0.2, rev: 0.4, pan: 0.15 },
  flute: { osc: [['sine', 1, 1], ['triangle', 2, 0.12]], a: 0.05, d: 0.15, s: 0.8, r: 0.08, vib: [5, 9], oct: 1, gain: 0.16, rev: 0.4, pan: -0.15 },
  brass: { osc: [[SAW, 1, 1], [SAW, 1, 1, 9]], a: 0.03, d: 0.12, s: 0.75, r: 0.07, lp: [3, 2.5, 0.12], gain: 0.075, rev: 0.25 },
  // ---- leads ----
  /** Anime synth lead: two detuned saws that scoop up into each note. */
  saw: { osc: [[SAW, 1, 1, -7], [SAW, 1, 1, 7]], a: 0.012, d: 0.2, s: 0.75, r: 0.09, lp: [5, 2.5, 0.15], vib: [5.5, 9], glide: [-2, 0.025], gain: 0.07, rev: 0.3, pan: 0.1 },
  /** Supersaw: five detuned saws. */
  super: { osc: [[SAW, 1, 1, -21], [SAW, 1, 1, -9], [SAW, 1, 1], [SAW, 1, 1, 10], [SAW, 1, 1, 22]], a: 0.01, d: 0.25, s: 0.8, r: 0.12, lp: [6, 1.5, 0.2], gain: 0.034, rev: 0.35 },
  /** Synth brass / horn section: the filter opens on the attack. */
  horn: { osc: [[SAW, 1, 1], [SAW, 1, 1, 9]], a: 0.04, d: 0.15, s: 0.8, r: 0.1, lp: [2.5, 2.5, 0.14], gain: 0.085, rev: 0.4, pan: -0.1 },
  violin: { osc: [[SAW, 1, 1], [SAW, 1, 0.7, 8]], a: 0.07, d: 0.2, s: 0.85, r: 0.14, lp: [4, 0, 0], vib: [5.8, 13], gain: 0.07, rev: 0.45, pan: -0.15 },
  /** Mellow lo-fi lead. */
  soft: { osc: [['triangle', 1, 1], ['sine', 2, 0.2], ['sine', 1, 0.6, 6]], a: 0.02, d: 0.2, s: 0.7, r: 0.1, vib: [5, 7], glide: [-1, 0.03], gain: 0.15, rev: 0.35, pan: 0.1 },
  // ---- keys and plucks ----
  /** Electric piano (FM tine). */
  ep: { osc: [['sine', 1, 1], ['sine', 1, 0.5, 5]], fm: [1, 1.4, 0.35], a: 0.004, d: 0.7, s: 0, r: 0.25, gain: 0.17, rev: 0.3, pan: -0.12 },
  piano: { osc: [['triangle', 1, 1], [SAW, 1, 0.3, 3], ['sine', 2, 0.2, -3]], a: 0.003, d: 0.6, s: 0, r: 0.25, lp: [3, 5, 0.1], gain: 0.19, rev: 0.3, pan: -0.1 },
  /** Nylon-guitar-like pluck. */
  nylon: { osc: [['triangle', 1, 1], [SAW, 1, 0.35]], a: 0.003, d: 0.3, s: 0, r: 0.2, lp: [2.5, 5, 0.06], gain: 0.2, rev: 0.3, pan: 0.2 },
  /** Crystalline pluck for arps (never a lead). */
  crystal: { osc: [['sine', 1, 1], ['sine', 2, 0.3, 5]], fm: [3, 0.9, 0.12], a: 0.003, d: 0.22, s: 0, r: 0.2, oct: 1, gain: 0.1, rev: 0.55, pan: 0.25 },
  pluck: { osc: [[SAW, 1, 1], ['triangle', 1, 1, 5]], a: 0.002, d: 0.16, s: 0, r: 0.1, lp: [2.5, 5, 0.05], gain: 0.12, rev: 0.2, pan: 0.3 },
  /** Short supersaw chord stab. */
  stab: { osc: [[SAW, 1, 1, -12], [SAW, 1, 1, 12], [SAW, 2, 0.4]], a: 0.004, d: 0.14, s: 0.15, r: 0.08, lp: [4, 4, 0.08], gain: 0.06, rev: 0.3 },
  // ---- strings, choir, guitars ----
  /** Staccato strings for ostinatos; `cello` is the same an octave down. */
  stacc: { osc: [[SAW, 1, 1, -6], [SAW, 1, 1, 6]], a: 0.01, d: 0.1, s: 0.25, r: 0.06, lp: [3.5, 2, 0.06], gain: 0.1, rev: 0.35, pan: -0.2 },
  cello: { osc: [[SAW, 1, 1, -6], [SAW, 1, 1, 6]], a: 0.012, d: 0.11, s: 0.3, r: 0.06, lp: [4, 2, 0.06], oct: -1, gain: 0.13, rev: 0.35, pan: 0.2 },
  /** Distorted power chord: the notes of the chord share one waveshaper. */
  power: { osc: [[SAW, 1, 1, -8], [SAW, 1, 1, 8]], a: 0.005, d: 0.3, s: 0.8, r: 0.04, lp: [6, 0, 0], gain: 0.1, rev: 0.12, fx: ['drive', 7, 3800, 0.085] },
  strings: { osc: [[SAW, 1, 1, -9], [SAW, 1, 1, 9], [SAW, 2, 0.25]], a: 0.15, d: 0.4, s: 0.85, r: 0.3, lp: [2.5, 0, 0], gain: 0.04, rev: 0.45 },
  /** Choir pad: saws through "ah" formant filters. */
  choir: { osc: [[SAW, 1, 1, -10], [SAW, 1, 1, 10]], a: 0.2, d: 0.4, s: 0.9, r: 0.35, vib: [4.6, 10], gain: 0.11, rev: 0.55, fx: ['choir'] },
  sawpad: { osc: [[SAW, 1, 1, -14], [SAW, 1, 1, 14]], a: 0.06, d: 0.4, s: 0.85, r: 0.2, lp: [3, 0, 0], gain: 0.045, rev: 0.3 },
  warm: { osc: [['triangle', 1, 1, -7], ['triangle', 1, 1, 7]], a: 0.25, d: 0.4, s: 0.8, r: 0.3, gain: 0.075, rev: 0.4 },
  air: { osc: [['sine', 1, 1, -5], ['sine', 2, 0.35, 6]], a: 0.3, d: 0.5, s: 0.85, r: 0.35, gain: 0.085, rev: 0.6 },
  // ---- bass ----
  sub: { osc: [['sine', 1, 1], ['triangle', 1, 0.3]], a: 0.006, d: 0.3, s: 0.8, r: 0.06, oct: -2, gain: 0.34, rev: 0 },
  /** 808: a sine that drops into the note, lightly driven so small speakers still carry it. */
  b808: { osc: [['sine', 1, 1], ['triangle', 2, 0.1]], a: 0.003, d: 0.4, s: 0.5, r: 0.08, glide: [12, 0.018], oct: -2, gain: 0.5, rev: 0, fx: ['drive', 2.2, 1500, 0.42] },
  /** Reese: detuned saws that beat against each other; `wobble` adds a tempo-locked filter wobble. */
  reese: { osc: [[SAW, 1, 1, -16], [SAW, 1, 1, 16], ['sine', 1, 1.2]], a: 0.01, d: 0.2, s: 0.85, r: 0.06, lp: [5, 0, 0], oct: -2, gain: 0.13, rev: 0 },
  wobble: { osc: [[SAW, 1, 1, -16], [SAW, 1, 1, 16], ['sine', 1, 1.2]], a: 0.01, d: 0.2, s: 0.85, r: 0.06, lp: [7, 0, 0], wob: [4, 0.8], oct: -2, gain: 0.13, rev: 0 },
  synbass: { osc: [[SAW, 1, 0.6], ['sine', 1, 0.8]], a: 0.004, d: 0.14, s: 0.4, r: 0.04, lp: [3, 5, 0.07], oct: -2, gain: 0.3, rev: 0 },
  fing: { osc: [['triangle', 1, 1], ['sine', 0.5, 0.5]], a: 0.005, d: 0.25, s: 0.5, r: 0.05, oct: -2, gain: 0.34, rev: 0 },
  upright: { osc: [['triangle', 1, 1], ['sine', 1, 0.6]], a: 0.004, d: 0.22, s: 0, r: 0.1, oct: -2, gain: 0.44, rev: 0.05 },
} satisfies Record<string, Inst>;

export type InstName = keyof typeof defs;
export const INST: Record<InstName, Inst> = defs;

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export interface ToneOpts {
  sd?: number; // length of a sixteenth in seconds (sets the wobble rate)
  slide?: [number, number]; // overrides the instrument's glide for this note
}

/** Plays one note. `dur` is the held length in seconds; struck instruments ring out on their own. */
export function tone(ctx: Ctx, out: AudioNode, i: Inst, t: number, freq: number, dur: number, vel: number, opt?: ToneOpts): void {
  const f = freq * 2 ** (i.oct ?? 0);
  const env = ctx.createGain();
  const peak = i.gain * vel;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + i.a);
  let end: number;
  if (i.s === 0) {
    // Higher notes die sooner, like a real string or bar.
    const d = i.d * Math.min(1.6, Math.max(0.5, 520 / f) ** 0.5);
    env.gain.setTargetAtTime(0, t + i.a, d);
    end = t + i.a + d * 5;
  } else {
    env.gain.setTargetAtTime(peak * i.s, t + i.a, i.d);
    env.gain.setTargetAtTime(0, t + dur, i.r);
    end = t + dur + i.r * 6;
  }
  let head: AudioNode = env;
  const lfo = (hz: number, depth: number, fadeIn: number): GainNode => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = hz;
    g.gain.setValueAtTime(fadeIn ? 0 : depth, t);
    if (fadeIn) g.gain.linearRampToValueAtTime(depth, t + fadeIn);
    o.connect(g);
    o.start(t);
    o.stop(end);
    return g;
  };
  if (i.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const base = Math.min(16000, f * i.lp[0]);
    if (i.wob) {
      // The cutoff swings around 0.55 x base, once per `wob[0]` sixteenths.
      lp.Q.value = 4;
      lp.frequency.value = base * 0.55;
      lfo(1 / (i.wob[0] * (opt?.sd ?? 0.12)), base * 0.5 * i.wob[1], 0).connect(lp.frequency);
    } else {
      lp.Q.value = 0.8;
      if (i.lp[1]) {
        // k-rate: the filter is recomputed once per block instead of once per sample. Much cheaper.
        lp.frequency.automationRate = 'k-rate';
        lp.frequency.setValueAtTime(Math.min(16000, base * (1 + i.lp[1])), t);
        lp.frequency.setTargetAtTime(base, t, i.lp[2]);
      } else lp.frequency.value = base;
    }
    lp.connect(env);
    head = lp;
  }
  const mods: AudioNode[] = [];
  if (i.fm) {
    const m = ctx.createOscillator();
    const mg = ctx.createGain();
    m.frequency.value = f * i.fm[0];
    mg.gain.setValueAtTime(f * i.fm[1] * (0.5 + vel * 0.5), t);
    mg.gain.setTargetAtTime(f * i.fm[1] * 0.08, t, i.fm[2]);
    m.connect(mg);
    m.start(t);
    m.stop(end);
    mods.push(mg);
  }
  // Vibrato comes in after the attack, as a player would add it.
  if (i.vib) mods.push(lfo(i.vib[0], f * (2 ** (i.vib[1] / 1200) - 1), 0.25));
  const glide = opt?.slide ?? i.glide;
  for (const [type, ratio, g, det] of i.osc) {
    const o = ctx.createOscillator();
    o.type = type;
    if (glide) {
      o.frequency.setValueAtTime(f * ratio * 2 ** (glide[0] / 12), t);
      o.frequency.exponentialRampToValueAtTime(f * ratio, t + glide[1]);
    } else o.frequency.value = f * ratio;
    if (det) o.detune.value = det;
    for (const m of mods) m.connect(o.frequency);
    if (g === 1) o.connect(head);
    else {
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(head);
    }
    o.start(t);
    o.stop(end);
  }
  env.connect(out);
}

/** Builds an instrument's shared effect. Returns [input, output]. */
export function fxBus(ctx: Ctx, fx: NonNullable<Inst['fx']>): [AudioNode, AudioNode] {
  const out = ctx.createGain();
  if (fx[0] === 'drive') {
    // Distortion: tanh waveshaper, then a lowpass to take the fizz off.
    const pre = ctx.createGain();
    pre.gain.value = fx[1];
    const sh = ctx.createWaveShaper();
    const n = 1025;
    const curve = new Float32Array(n);
    for (let k = 0; k < n; k++) curve[k] = Math.tanh((k / (n - 1)) * 6 - 3); // inputs -1..1 map to tanh(3x)
    sh.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = fx[2];
    out.gain.value = fx[3];
    pre.connect(sh).connect(lp).connect(out);
    return [pre, out];
  }
  // Choir: three bandpass filters at the formants of a sung "ah".
  const inp = ctx.createGain();
  out.gain.value = 2.6;
  for (const [hz, q, g] of [[750, 5, 1], [1150, 7, 0.6], [2800, 9, 0.3]]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz;
    bp.Q.value = q;
    const bg = ctx.createGain();
    bg.gain.value = g;
    inp.connect(bp).connect(bg).connect(out);
  }
  return [inp, out];
}

// ---- noise and drums ----

const noiseBufs = new WeakMap<Ctx, AudioBuffer>();
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let b = noiseBufs.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(ctx, b);
  }
  return b;
}

/** A burst of filtered noise with an exponential decay. f1 sweeps the filter. */
export function noise(
  ctx: Ctx, out: AudioNode, t: number, dur: number, gain: number,
  type: BiquadFilterType, f0: number, f1 = f0, q = 0.8, attack = 0.002,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setTargetAtTime(0, t + attack, dur / 4);
  src.connect(flt).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + attack + dur * 1.6);
}

/** Noise that swells for `dur` seconds, then stops: risers and reverse cymbals. */
function swell(ctx: Ctx, out: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1: number, q: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * 0.02, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur);
  g.gain.setTargetAtTime(0, t + dur, 0.012);
  src.connect(flt).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.1);
}

/** A plain oscillator blip with a pitch glide and an exponential decay. */
export function blip(
  ctx: Ctx, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, attack = 0.003,
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setTargetAtTime(0, t + attack, dur / 3.5);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur * 2);
}

/** `dur` (seconds) is only used by the swells. */
type Drum = (c: Ctx, o: AudioNode, t: number, v: number, dur?: number) => void;
export const DRUM = {
  kick: (c, o, t, v) => {
    blip(c, o, t, 'sine', 165, 45, 0.2, 0.8 * v, 0.001);
    noise(c, o, t, 0.02, 0.14 * v, 'lowpass', 2200);
  },
  /** Dusty lo-fi kick and snare. */
  dkick: (c, o, t, v) => blip(c, o, t, 'sine', 120, 50, 0.22, 0.62 * v, 0.003),
  dsnare: (c, o, t, v) => {
    noise(c, o, t, 0.12, 0.24 * v, 'bandpass', 1500, 1500, 0.7, 0.004);
    blip(c, o, t, 'triangle', 185, 140, 0.08, 0.16 * v, 0.002);
  },
  snare: (c, o, t, v) => {
    noise(c, o, t, 0.15, 0.3 * v, 'bandpass', 2300, 2300, 0.6);
    noise(c, o, t, 0.07, 0.07 * v, 'highpass', 6500);
    blip(c, o, t, 'triangle', 215, 160, 0.09, 0.22 * v, 0.001);
  },
  rim: (c, o, t, v) => blip(c, o, t, 'triangle', 1100, 900, 0.04, 0.22 * v, 0.001),
  clap: (c, o, t, v) => {
    for (const dt of [0, 0.011, 0.023]) noise(c, o, t + dt, dt > 0.02 ? 0.14 : 0.02, 0.24 * v, 'bandpass', 1500, 1500, 0.9);
  },
  hat: (c, o, t, v) => noise(c, o, t, 0.04, 0.1 * v, 'highpass', 7800),
  open: (c, o, t, v) => noise(c, o, t, 0.2, 0.09 * v, 'highpass', 7000),
  ride: (c, o, t, v) => noise(c, o, t, 0.3, 0.05 * v, 'bandpass', 9000, 9000, 2),
  /** Taiko: a deep drum with a stick slap; taikoHi is the smaller drum. */
  taiko: (c, o, t, v) => {
    blip(c, o, t, 'sine', 98, 52, 0.36, 0.8 * v, 0.002);
    noise(c, o, t, 0.06, 0.22 * v, 'lowpass', 900);
  },
  taikoHi: (c, o, t, v) => {
    blip(c, o, t, 'sine', 160, 96, 0.22, 0.55 * v, 0.002);
    noise(c, o, t, 0.04, 0.18 * v, 'bandpass', 1400, 1400, 1);
  },
  tom: (c, o, t, v) => blip(c, o, t, 'sine', 200, 110, 0.2, 0.5 * v, 0.002),
  crash: (c, o, t, v) => noise(c, o, t, 1.1, 0.16 * v, 'highpass', 5000),
  /** Low boom plus a burst of dark noise, for the start of a section. */
  impact: (c, o, t, v) => {
    blip(c, o, t, 'sine', 72, 30, 0.8, 0.6 * v, 0.003);
    noise(c, o, t, 0.6, 0.26 * v, 'lowpass', 1400, 180);
  },
  riser: (c, o, t, v, dur = 1) => swell(c, o, t, dur, 0.2 * v, 'bandpass', 350, 7000, 1.5),
  /** Reverse cymbal. */
  rev: (c, o, t, v, dur = 1) => swell(c, o, t, dur, 0.14 * v, 'highpass', 4000, 6000, 0.7),
} satisfies Record<string, Drum>;
export type DrumName = keyof typeof DRUM;

// ---- master mix ----

export interface Mixer {
  music: GainNode; // music bus; its gain is the player's music volume
  sfx: GainNode; // sfx bus; its gain is the player's sfx volume
  reverb: AudioNode; // send input
  /** Dips the music for `dur` seconds under a big sound effect. */
  duck(t: number, dur: number): void;
}

/** Never louder than this (about -1.4 dBFS): the last stage is a soft clipper with this ceiling. */
const CEILING = 0.85;
/** Everything on the sfx bus (sound effects, loops, a game's own sounds) sits this far under the music. */
const SFX_BUS = 0.4;
/** How far the music dips under a big sound effect. */
const DUCK_TO = 0.6;

export function createMixer(ctx: Ctx): Mixer {
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  const duck = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  // Limiter: tanh soft clip. Linear for normal levels, and the output can never pass CEILING.
  const limit = ctx.createWaveShaper();
  const n = 2049;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = CEILING * Math.tanh(((i / (n - 1)) * 2 - 1) / CEILING);
  limit.curve = curve;

  const reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.6);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      // Decaying noise, darker as it fades, like a small hall.
      const k = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.45 * k);
      d[i] = lp * Math.exp(-5.5 * k) * (i < 200 ? i / 200 : 1);
    }
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  reverb.connect(wet).connect(music);

  const sfxTrim = ctx.createGain();
  sfxTrim.gain.value = SFX_BUS;
  music.connect(duck).connect(comp);
  sfx.connect(sfxTrim).connect(comp);
  comp.connect(limit).connect(ctx.destination);
  return {
    music,
    sfx,
    reverb,
    duck(t, dur) {
      duck.gain.cancelScheduledValues(t);
      duck.gain.setTargetAtTime(DUCK_TO, t, 0.03);
      duck.gain.setTargetAtTime(1, t + dur, 0.25);
    },
  };
}
