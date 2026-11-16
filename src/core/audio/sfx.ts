import type { LoopName, SfxName } from '../contract';
import { INST, blip, mtof, noise, noiseBuffer, tone } from './synth';

type Ctx = BaseAudioContext;
/** Builds one sound on `o` starting at `t`; `p` is the pitch multiplier. */
type Sfx = (c: Ctx, o: AudioNode, t: number, p: number) => void;

const bell = (c: Ctx, o: AudioNode, t: number, midi: number, p: number, vel = 1) => tone(c, o, INST.bell, t, mtof(midi - 12) * p, 0.2, vel);
const run = (notes: number[], gap: number, vel = 1): Sfx => (c, o, t, p) => notes.forEach((n, i) => bell(c, o, t + i * gap, n, p, vel));

export const SFX: Record<SfxName, Sfx> = {
  // ---- menus and rewards ----
  tap: (c, o, t, p) => blip(c, o, t, 'sine', 900 * p, 700 * p, 0.04, 0.3),
  select: (c, o, t, p) => {
    blip(c, o, t, 'triangle', 660 * p, 660 * p, 0.06, 0.28);
    blip(c, o, t + 0.07, 'triangle', 990 * p, 990 * p, 0.09, 0.28);
  },
  back: (c, o, t, p) => {
    blip(c, o, t, 'triangle', 660 * p, 660 * p, 0.06, 0.26);
    blip(c, o, t + 0.07, 'triangle', 440 * p, 440 * p, 0.09, 0.26);
  },
  buy: (c, o, t, p) => {
    blip(c, o, t, 'triangle', 1319 * p, 1319 * p, 0.05, 0.22);
    blip(c, o, t + 0.06, 'triangle', 1976 * p, 1976 * p, 0.25, 0.22);
    noise(c, o, t, 0.08, 0.1, 'highpass', 6000);
    bell(c, o, t + 0.12, 91, p, 0.6);
  },
  error: (c, o, t, p) => {
    blip(c, o, t, 'triangle', 233 * p, 220 * p, 0.1, 0.34, 0.01);
    blip(c, o, t + 0.13, 'triangle', 196 * p, 185 * p, 0.16, 0.34, 0.01);
  },
  unlock: run([72, 76, 79, 84], 0.07),
  levelUp: (c, o, t, p) => {
    run([67, 72, 76, 79, 84], 0.075)(c, o, t, p);
    for (const n of [72, 76, 79]) tone(c, o, INST.brass, t + 0.375, mtof(n) * p, 0.35, 0.55);
  },
  win: (c, o, t, p) => {
    [67, 72, 76].forEach((n, i) => tone(c, o, INST.brass, t + i * 0.11, mtof(n) * p, 0.09, 0.7));
    for (const n of [72, 76, 79, 84]) tone(c, o, INST.brass, t + 0.33, mtof(n) * p, 0.6, 0.6);
    run([84, 88, 91, 96], 0.08, 0.7)(c, o, t + 0.33, p);
    noise(c, o, t + 0.33, 0.8, 0.1, 'highpass', 5000);
  },
  lose: (c, o, t, p) => [76, 72, 69, 64].forEach((n, i) => tone(c, o, INST.flute, t + i * 0.16, mtof(n - 12) * p, i === 3 ? 0.4 : 0.13, 1.4)),
  star: run([88, 95], 0.06),
  coin: (c, o, t, p) => {
    blip(c, o, t, 'triangle', 988 * p, 988 * p, 0.05, 0.25);
    blip(c, o, t + 0.055, 'triangle', 1319 * p, 1319 * p, 0.22, 0.25);
  },
  // ---- world ----
  pop: (c, o, t, p) => blip(c, o, t, 'sine', 520 * p, 1100 * p, 0.05, 0.4),
  grow: (c, o, t, p) => {
    blip(c, o, t, 'sine', 300 * p, 620 * p, 0.2, 0.3, 0.02);
    bell(c, o, t + 0.12, 84, p, 0.5);
  },
  gulp: (c, o, t, p) => {
    blip(c, o, t, 'sine', 320 * p, 90 * p, 0.13, 0.45, 0.01);
    blip(c, o, t + 0.13, 'sine', 110 * p, 260 * p, 0.07, 0.3, 0.01);
  },
  whoosh: (c, o, t, p) => noise(c, o, t, 0.35, 0.55, 'bandpass', 500 * p, 3200 * p, 1.2, 0.12),
  boost: (c, o, t, p) => {
    noise(c, o, t, 0.5, 0.22, 'bandpass', 400 * p, 4000 * p, 1.5, 0.15);
    blip(c, o, t, 'triangle', 220 * p, 880 * p, 0.4, 0.22, 0.05);
  },
  sparkle: (c, o, t, p) => [96, 103, 100, 108, 105].forEach((n, i) => bell(c, o, t + i * 0.055, n - (i % 2) * 5, p, 0.55)),
  splash: (c, o, t, p) => {
    noise(c, o, t, 0.45, 0.32, 'lowpass', 5000 * p, 500 * p, 0.7, 0.01);
    blip(c, o, t + 0.1, 'sine', 500 * p, 1200 * p, 0.05, 0.12);
    blip(c, o, t + 0.19, 'sine', 700 * p, 1500 * p, 0.04, 0.09);
  },
  thud: (c, o, t, p) => {
    blip(c, o, t, 'sine', 130 * p, 48 * p, 0.16, 0.6, 0.002);
    noise(c, o, t, 0.05, 0.18, 'lowpass', 900 * p);
  },
  crunch: (c, o, t, p) => {
    for (const dt of [0, 0.045, 0.1]) noise(c, o, t + dt, 0.05, 0.6, 'bandpass', (1100 + dt * 4000) * p, 700 * p, 1.5);
  },
  snip: (c, o, t, p) => {
    noise(c, o, t, 0.025, 0.25, 'highpass', 4500 * p);
    noise(c, o, t + 0.06, 0.035, 0.3, 'highpass', 5500 * p);
    blip(c, o, t + 0.06, 'triangle', 2600 * p, 2400 * p, 0.04, 0.06, 0.001);
  },
  swap: (c, o, t, p) => {
    blip(c, o, t, 'sine', 420 * p, 700 * p, 0.07, 0.28, 0.01);
    blip(c, o, t + 0.06, 'sine', 700 * p, 470 * p, 0.08, 0.22, 0.01);
  },
  match: run([79, 84, 88], 0.045),
  cascade: run([79, 83, 86, 91], 0.04, 0.85),
  explode: (c, o, t, p) => {
    noise(c, o, t, 0.6, 0.45, 'lowpass', 2600 * p, 180 * p, 0.6, 0.005);
    blip(c, o, t, 'sine', 110 * p, 36 * p, 0.35, 0.55, 0.003);
  },
  cheer: (c, o, t, p) => {
    noise(c, o, t, 1.4, 0.26, 'bandpass', 900 * p, 1500 * p, 0.5, 0.25);
    noise(c, o, t + 0.05, 1.2, 0.14, 'bandpass', 2400 * p, 3000 * p, 0.8, 0.3);
    blip(c, o, t + 0.2, 'sine', 1900 * p, 2500 * p, 0.25, 0.05, 0.08);
    blip(c, o, t + 0.45, 'sine', 2300 * p, 1700 * p, 0.3, 0.04, 0.08);
  },
  kick: (c, o, t, p) => {
    blip(c, o, t, 'sine', 210 * p, 70 * p, 0.09, 0.55, 0.001);
    noise(c, o, t, 0.035, 0.25, 'bandpass', 1400 * p, 1400 * p, 0.8);
  },
  meow: (c, o, t, p) => {
    // A voice: a buzzy source through a vowel filter that opens ("e") and closes ("ow").
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520 * p, t);
    osc.frequency.linearRampToValueAtTime(760 * p, t + 0.1);
    osc.frequency.linearRampToValueAtTime(470 * p, t + 0.42);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3.5;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(2300, t + 0.12);
    f.frequency.linearRampToValueAtTime(800, t + 0.42);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.setTargetAtTime(0, t + 0.28, 0.06);
    osc.connect(f).connect(g).connect(o);
    osc.start(t);
    osc.stop(t + 0.7);
  },
  purr: (c, o, t, p) => {
    // A low rumble switched on and off about 25 times a second.
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52 * p;
    const lfo = c.createOscillator();
    lfo.frequency.value = 25 * p;
    const am = c.createGain();
    am.gain.value = 0.5;
    const depth = c.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.15);
    g.gain.setTargetAtTime(0, t + 0.75, 0.12);
    osc.connect(am).connect(f).connect(g).connect(o);
    for (const n of [osc, lfo]) {
      n.start(t);
      n.stop(t + 1.5);
    }
  },
};

/** Seconds the music dips under each big sound. */
export const DUCK: Partial<Record<SfxName, number>> = { win: 1.2, lose: 0.8, levelUp: 0.7, unlock: 0.4, explode: 0.5, cheer: 1 };

// ---- loops ----

export interface LoopVoice {
  level: AudioParam;
  pitch(r: number, t: number): void;
  stop(t: number): void;
}

/** [filter type, centre Hz, Q, gain, swell Hz, swell depth 0..1] for the noise loops. */
const NOISE_LOOP: Record<Exclude<LoopName, 'engine'>, [BiquadFilterType, number, number, number, number, number]> = {
  ski: ['bandpass', 2600, 0.7, 0.5, 0.9, 0.25],
  wind: ['bandpass', 520, 1.4, 0.7, 0.17, 0.45],
  waves: ['lowpass', 1100, 0.5, 0.5, 0.11, 0.8],
  crowd: ['bandpass', 1000, 0.5, 0.6, 0.6, 0.2],
};

export function buildLoop(c: Ctx, out: AudioNode, name: LoopName): LoopVoice {
  const level = c.createGain();
  level.gain.value = 0;
  level.connect(out);
  const flt = c.createBiquadFilter();
  const swell = c.createGain(); // gain is 1 - depth, the LFO adds up to depth
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.connect(depth).connect(swell.gain);
  flt.connect(swell).connect(level);
  const nodes: AudioScheduledSourceNode[] = [lfo];
  let pitch: (r: number, t: number) => void;

  if (name === 'engine') {
    // Two low oscillators chopped by a fast LFO: the chug of a small tractor.
    const a = c.createOscillator();
    const b = c.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    a.frequency.value = 62;
    b.frequency.value = 31;
    const mix = c.createGain();
    mix.gain.value = 0.3;
    a.connect(mix);
    b.connect(mix);
    mix.connect(flt);
    flt.type = 'lowpass';
    flt.frequency.value = 520;
    lfo.type = 'sawtooth';
    lfo.frequency.value = 11;
    swell.gain.value = 0.6;
    depth.gain.value = 0.4;
    nodes.push(a, b);
    pitch = (r, t) => {
      a.frequency.setTargetAtTime(62 * r, t, 0.1);
      b.frequency.setTargetAtTime(31 * r, t, 0.1);
      lfo.frequency.setTargetAtTime(11 * r, t, 0.1);
      flt.frequency.setTargetAtTime(520 * r, t, 0.1);
    };
  } else {
    const [type, hz, q, gain, rate, d] = NOISE_LOOP[name];
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(flt);
    flt.type = type;
    flt.frequency.value = hz;
    flt.Q.value = q;
    lfo.frequency.value = rate;
    swell.gain.value = 1 - d;
    depth.gain.value = d;
    nodes.push(src);
    pitch = (r, t) => {
      flt.frequency.setTargetAtTime(hz * r, t, 0.1);
      lfo.frequency.setTargetAtTime(rate * r, t, 0.1);
    };
  }
  const t0 = c.currentTime;
  for (const n of nodes) n.start(t0);
  return {
    level: level.gain,
    pitch,
    stop(t) {
      level.gain.setTargetAtTime(0, t, 0.05);
      for (const n of nodes) n.stop(t + 0.4);
    },
  };
}
