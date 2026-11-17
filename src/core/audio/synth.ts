// Synth voices, drums, and the master mix. Everything works on any BaseAudioContext so the same
// code runs live and in an OfflineAudioContext (audio-lab.html and the render check).

type Ctx = BaseAudioContext;

/** A tonal instrument, described as data and played by `tone`. */
export interface Inst {
  /** Oscillators: [wave, frequency ratio, gain, detune cents]. */
  osc: [OscillatorType, number, number, number?][];
  /** FM on every oscillator: [modulator ratio, index (x frequency), index decay s]. Makes bell and steel tones. */
  fm?: [number, number, number];
  a: number; // attack s
  d: number; // decay time constant s
  s: number; // sustain level 0..1; 0 = struck or plucked (rings out, ignores note length)
  r: number; // release time constant s
  /** Lowpass: [cutoff as a multiple of the note, extra opening at the attack (multiple), opening decay s]. */
  lp?: [number, number, number];
  /** Vibrato: [Hz, cents]. */
  vib?: [number, number];
  oct?: number; // octave shift
  gain: number;
  rev: number; // reverb send 0..1
  pan?: number;
}

export const INST = {
  bell: { osc: [['sine', 1, 1], ['sine', 2, 0.25]], fm: [3.5, 1.6, 0.25], a: 0.002, d: 0.45, s: 0, r: 0.3, oct: 1, gain: 0.2, rev: 0.4, pan: 0.15 },
  glass: { osc: [['sine', 1, 1], ['sine', 1, 1, 7]], fm: [2, 0.7, 0.5], a: 0.004, d: 0.6, s: 0, r: 0.4, oct: 1, gain: 0.14, rev: 0.5, pan: 0.1 },
  musicbox: { osc: [['sine', 1, 1], ['sine', 4, 0.2]], fm: [5, 0.6, 0.08], a: 0.002, d: 0.35, s: 0, r: 0.3, oct: 1, gain: 0.24, rev: 0.35, pan: -0.1 },
  harp: { osc: [['triangle', 1, 1], ['sine', 2, 0.3]], a: 0.003, d: 0.38, s: 0, r: 0.3, lp: [3, 4, 0.08], gain: 0.2, rev: 0.35, pan: -0.25 },
  pluck: { osc: [['sawtooth', 1, 1], ['triangle', 1, 1, 5]], a: 0.002, d: 0.16, s: 0, r: 0.1, lp: [2.5, 5, 0.05], gain: 0.12, rev: 0.15, pan: 0.3 },
  pizz: { osc: [['sawtooth', 1, 0.5], ['triangle', 1, 0.7]], a: 0.004, d: 0.11, s: 0, r: 0.1, lp: [2, 3, 0.04], gain: 0.24, rev: 0.3, pan: 0.25 },
  marimba: { osc: [['sine', 1, 1], ['sine', 4, 0.3]], a: 0.002, d: 0.2, s: 0, r: 0.15, gain: 0.32, rev: 0.2, pan: 0.1 },
  steel: { osc: [['sine', 1, 1], ['sine', 2, 0.35, 4]], fm: [2, 1.1, 0.12], a: 0.003, d: 0.3, s: 0, r: 0.2, gain: 0.26, rev: 0.3, pan: -0.1 },
  flute: { osc: [['sine', 1, 1], ['triangle', 2, 0.12]], a: 0.05, d: 0.15, s: 0.8, r: 0.08, vib: [5, 9], oct: 1, gain: 0.16, rev: 0.4, pan: -0.15 },
  whistle: { osc: [['sine', 1, 1]], a: 0.035, d: 0.1, s: 0.85, r: 0.06, vib: [5.5, 12], oct: 1, gain: 0.14, rev: 0.3, pan: 0.15 },
  brass: { osc: [['sawtooth', 1, 1], ['sawtooth', 1, 1, 9]], a: 0.03, d: 0.12, s: 0.75, r: 0.07, lp: [3, 2.5, 0.12], gain: 0.075, rev: 0.25 },
  synth: { osc: [['square', 1, 0.3], ['triangle', 1, 0.7, -6]], a: 0.01, d: 0.1, s: 0.6, r: 0.06, lp: [4, 2, 0.1], gain: 0.15, rev: 0.2, pan: 0.2 },
  pad: { osc: [['triangle', 1, 1, -7], ['triangle', 1, 1, 7]], a: 0.25, d: 0.4, s: 0.8, r: 0.3, gain: 0.075, rev: 0.4 },
  glasspad: { osc: [['sine', 1, 1, -5], ['sine', 2, 0.35, 6]], a: 0.3, d: 0.5, s: 0.85, r: 0.35, gain: 0.085, rev: 0.6 },
  bass: { osc: [['triangle', 1, 1], ['sine', 0.5, 0.5]], a: 0.005, d: 0.25, s: 0.5, r: 0.05, oct: -2, gain: 0.34, rev: 0 },
  upright: { osc: [['triangle', 1, 1], ['sine', 1, 0.6]], a: 0.004, d: 0.22, s: 0, r: 0.1, oct: -2, gain: 0.44, rev: 0.05 },
  synbass: { osc: [['sawtooth', 1, 0.6], ['sine', 1, 0.8]], a: 0.004, d: 0.14, s: 0.4, r: 0.04, lp: [3, 5, 0.07], oct: -2, gain: 0.3, rev: 0 },
} satisfies Record<string, Inst>;

export type InstName = keyof typeof INST;

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Plays one note. `dur` is the held length in seconds; struck instruments ring out on their own. */
export function tone(ctx: Ctx, out: AudioNode, i: Inst, t: number, freq: number, dur: number, vel: number): void {
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
  if (i.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    if (i.lp[1]) {
      // k-rate: the filter is recomputed once per block instead of once per sample. Much cheaper.
      lp.frequency.automationRate = 'k-rate';
      lp.frequency.setValueAtTime(Math.min(16000, f * i.lp[0] * (1 + i.lp[1])), t);
      lp.frequency.setTargetAtTime(Math.min(16000, f * i.lp[0]), t, i.lp[2]);
    } else lp.frequency.value = Math.min(16000, f * i.lp[0]);
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
  if (i.vib) {
    const v = ctx.createOscillator();
    const vg = ctx.createGain();
    v.frequency.value = i.vib[0];
    // Vibrato comes in after the attack, as a player would add it.
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * (2 ** (i.vib[1] / 1200) - 1), t + 0.25);
    v.connect(vg);
    v.start(t);
    v.stop(end);
    mods.push(vg);
  }
  for (const [type, ratio, g, det] of i.osc) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * ratio;
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

export const DRUM = {
  kick: (c: Ctx, o: AudioNode, t: number, v: number) => {
    blip(c, o, t, 'sine', 150, 46, 0.22, 0.75 * v, 0.001);
    noise(c, o, t, 0.02, 0.12 * v, 'lowpass', 1800);
  },
  soft: (c: Ctx, o: AudioNode, t: number, v: number) => blip(c, o, t, 'sine', 110, 55, 0.25, 0.5 * v, 0.004), // frame drum
  snare: (c: Ctx, o: AudioNode, t: number, v: number) => {
    noise(c, o, t, 0.16, 0.3 * v, 'bandpass', 2400, 2400, 0.6);
    blip(c, o, t, 'triangle', 220, 160, 0.09, 0.2 * v, 0.001);
  },
  brush: (c: Ctx, o: AudioNode, t: number, v: number) => noise(c, o, t, 0.14, 0.2 * v, 'bandpass', 3200, 2200, 0.5, 0.012),
  rim: (c: Ctx, o: AudioNode, t: number, v: number) => blip(c, o, t, 'triangle', 1100, 900, 0.04, 0.22 * v, 0.001),
  clap: (c: Ctx, o: AudioNode, t: number, v: number) => {
    for (const dt of [0, 0.011, 0.023]) noise(c, o, t + dt, dt > 0.02 ? 0.14 : 0.02, 0.24 * v, 'bandpass', 1500, 1500, 0.9);
  },
  hat: (c: Ctx, o: AudioNode, t: number, v: number) => noise(c, o, t, 0.045, 0.11 * v, 'highpass', 7500),
  open: (c: Ctx, o: AudioNode, t: number, v: number) => noise(c, o, t, 0.22, 0.1 * v, 'highpass', 7000),
  shaker: (c: Ctx, o: AudioNode, t: number, v: number) => noise(c, o, t, 0.06, 0.1 * v, 'bandpass', 5500, 5500, 1.2, 0.012),
  tamb: (c: Ctx, o: AudioNode, t: number, v: number) => {
    noise(c, o, t, 0.1, 0.1 * v, 'highpass', 6000);
    blip(c, o, t, 'square', 8400, 8400, 0.07, 0.012 * v, 0.001);
  },
  sleigh: (c: Ctx, o: AudioNode, t: number, v: number) => {
    // Several tiny bells shaken together: bright noise grains plus two ringing partials.
    for (const dt of [0, 0.013, 0.031]) noise(c, o, t + dt, 0.05, 0.07 * v, 'bandpass', 8200, 8200, 3);
    blip(c, o, t, 'sine', 6300, 6300, 0.12, 0.022 * v, 0.001);
    blip(c, o, t + 0.013, 'sine', 7900, 7900, 0.1, 0.016 * v, 0.001);
  },
  wood: (c: Ctx, o: AudioNode, t: number, v: number) => blip(c, o, t, 'sine', 820, 780, 0.05, 0.3 * v, 0.001),
  tom: (c: Ctx, o: AudioNode, t: number, v: number) => blip(c, o, t, 'sine', 200, 110, 0.2, 0.5 * v, 0.002),
  crash: (c: Ctx, o: AudioNode, t: number, v: number) => noise(c, o, t, 1.1, 0.16 * v, 'highpass', 5000),
};
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
