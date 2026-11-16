import type { MusicMood, MusicTrack } from '../contract';
import { THEMES, type Section, type Theme } from './songs';
import { DRUM, INST, mtof, tone, type DrumName, type InstName, type Mixer } from './synth';

// The music engine. A theme is compiled once per mood into a grid of events (32 bars x 16 steps);
// a lookahead scheduler then hands each step to WebAudio with an exact start time.

type Ctx = BaseAudioContext;
type LoopMood = Exclude<MusicMood, 'win'>;
type Ev =
  | { inst: InstName; midi: number; len: number; vel: number }
  | { drum: DrumName; vel: number };
type Grid = Ev[][]; // [bar * 16 + step] -> events

export const STEPS = 16;
export const FORM_BARS = 32;
const TEMPO: Record<LoopMood, number> = { menu: 0.92, play: 1, intense: 1.1 };

/** MIDI note for a 0-based scale index (7 = one octave up). */
function note(th: Theme, idx: number): number {
  const o = Math.floor(idx / 7);
  return th.key + th.scale[idx - o * 7] + 12 * o;
}

/** Parses one bar of melody into [step, scale index, length]. Throws when the bar is not 16 sixteenths. */
function parseBar(src: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  let step = 0;
  for (const tok of src.trim().split(/\s+/)) {
    const m = /^(-|[1-7])([',]*)(?::(\d+))?$/.exec(tok);
    if (!m) throw new Error(`Bad melody token "${tok}"`);
    const len = m[3] ? Number(m[3]) : 2;
    if (m[1] !== '-') {
      let idx = Number(m[1]) - 1;
      for (const c of m[2]) idx += c === "'" ? 7 : -7;
      out.push([step, idx, len]);
    }
    step += len;
  }
  if (step !== STEPS) throw new Error(`Melody bar "${src}" is ${step} sixteenths, not 16`);
  return out;
}

interface Bar {
  chord: [number, number]; // chord root (0-based degree) for each half of the bar
  mel: [number, number, number][];
}

export function parseSection(s: Section): Bar[] {
  const chords = s.chords.trim().split(/\s+/);
  const mel = s.mel.split('|');
  if (chords.length !== 8 || mel.length !== 8) throw new Error('A section is 8 bars');
  return chords.map((c, i) => {
    const [a, b = a] = c.split('/').map((x) => Number(x) - 1);
    return { chord: [a, b], mel: parseBar(mel[i]) };
  });
}

const pat = (s: string | undefined, step: number) => (s?.[step] === 'x' ? 1 : s?.[step] === 'o' ? 0.55 : 0);

function compile(th: Theme, mood: LoopMood): Grid {
  const A = parseSection(th.A);
  const B = parseSection(th.B);
  const form = [A, A, B, A];
  const grid: Grid = Array.from({ length: FORM_BARS * STEPS }, () => []);
  const [lead1, lead2] = th.lead;
  const [compInst, compStyle] = th.comp;
  const [bassInst, bassStyle] = th.bass;
  const kit = th.drums[mood];
  const soft = mood === 'menu';
  const hot = mood === 'intense';

  for (let b = 0; b < FORM_BARS; b++) {
    const sec = b >> 3;
    const bar = form[sec][b & 7];
    const at = (step: number) => grid[b * STEPS + step];

    // Melody. The lead instrument changes each section so the tune comes back in a new colour.
    for (const [step, idx, len] of bar.mel) {
      const accent = step % 4 === 0 ? 1 : 0.85;
      const midi = note(th, idx);
      const one = (inst: InstName, vel: number, up = 0) => at(step).push({ inst, midi: note(th, idx + up), len, vel: vel * accent });
      if (hot) {
        one(lead1, 0.9);
        one(lead2, 0.6);
      } else if (sec === 0) one(lead1, soft ? 0.75 : 1);
      else if (sec === 1) one(lead2, soft ? 0.8 : 1);
      else if (sec === 2) {
        one(soft ? lead2 : lead1, 0.85);
        if (!soft) one(lead2, 0.55);
      } else one(lead1, soft ? 0.75 : 0.95);
      // Last A: the second lead sings a third above, quietly.
      if (sec === 3 && !soft && midi < th.key + 14) one(lead2, 0.4, 2);
    }

    for (let step = 0; step < STEPS; step++) {
      const root = bar.chord[step < 8 ? 0 : 1];
      const newChord = step === 0 || (step === 8 && bar.chord[1] !== bar.chord[0]);
      // Triad folded into one middle octave so chords move smoothly.
      const tri = [0, 2, 4].map((k) => {
        let m = note(th, root + k);
        while (m >= th.key + 7) m -= 12;
        return m;
      }).sort((x, y) => x - y);
      let bassNote = th.key + th.scale[root];
      if (bassNote > 67) bassNote -= 12;

      // Pad: the chord held under everything.
      if (newChord) {
        const len = bar.chord[1] !== bar.chord[0] ? 8 : 16;
        for (const m of tri) at(step).push({ inst: th.pad, midi: m, len, vel: soft ? 1 : 0.8 });
      }

      // Comp: the rhythm instrument.
      const cv = soft ? 0.6 : 0.8;
      const style = soft && compStyle !== 'broken' ? 'arp' : compStyle;
      if (style === 'arp' && step % 2 === 0) {
        const seq = [tri[0], tri[1], tri[2], tri[0] + 12, tri[2], tri[1], tri[2], tri[1]];
        at(step).push({ inst: compInst, midi: seq[step / 2], len: 2, vel: cv * (step % 8 === 0 ? 1 : 0.75) });
      } else if (style === 'off' && step % 4 === 2) {
        for (const m of tri) at(step).push({ inst: compInst, midi: m + 12, len: 1, vel: cv * 0.6 });
      } else if (style === 'calypso' && [3, 6, 11, 14].includes(step)) {
        for (const m of tri) at(step).push({ inst: compInst, midi: m + 12, len: 2, vel: cv * 0.6 });
      } else if (style === 'pulse' && step % 2 === 0) {
        at(step).push({ inst: compInst, midi: tri[step % 4 ? 2 : 0], len: 1, vel: cv * 0.7 }, { inst: compInst, midi: tri[1] + 12, len: 1, vel: cv * 0.45 });
      } else if (style === 'broken' && step % 4 === 0) {
        at(step).push({ inst: compInst, midi: [tri[0], tri[2], tri[1], tri[2]][step / 4], len: 3, vel: cv });
      }
      // Intense adds a fast sparkle line on top.
      if (hot) at(step).push({ inst: compInst, midi: tri[[0, 1, 2, 1][step % 4]] + 12, len: 1, vel: 0.35 });

      // Bass.
      const bs = soft ? 'long' : hot ? 'eight' : bassStyle;
      const bass = (midi: number, len: number, vel = 1) => at(step).push({ inst: bassInst, midi, len, vel });
      if (bs === 'long') {
        if (step === 0 || step === 8) bass(bassNote, 7, soft ? 0.8 : 1);
        else if (step === 14 && !soft) bass(bassNote + 7, 2, 0.7);
      } else if (bs === 'root5') {
        if (step === 0) bass(bassNote, 5);
        else if (step === 8) bass(bassNote - 5, 5, 0.9);
        else if (step === 14 && b % 2) bass(bassNote - 5, 2, 0.7);
      } else if (bs === 'bounce') {
        const k = [0, 3, 6, 8, 11, 14].indexOf(step);
        if (k >= 0) bass(bassNote + [0, 0, 7, 0, 12, 7][k], 2, k === 0 || k === 3 ? 1 : 0.8);
      } else if (step % 2 === 0) bass(bassNote + (step % 4 ? 12 : 0), 2, step % 4 ? 0.7 : 1);

      // Drums, with a fill in the last bar of each section and a crash on the next downbeat.
      for (const d in kit) {
        const v = pat(kit[d as DrumName], step);
        if (v) at(step).push({ drum: d as DrumName, vel: v });
      }
      if (!soft) {
        if ((b & 7) === 7 && step >= 10 && step !== 11) at(step).push({ drum: th.fill, vel: 0.5 + (step - 10) * 0.08 });
        if ((b & 7) === 0 && step === 0) at(step).push({ drum: 'crash', vel: hot ? 0.7 : 0.45 });
      }
    }
  }
  return grid;
}

/** The win sting: a run up the key chord, then ii - V - I with a long last chord. Two bars. */
function compileSting(th: Theme): Grid {
  const g: Grid = Array.from({ length: 2 * STEPS }, () => []);
  const [lead1, lead2] = th.lead;
  [4, 7, 9, 11].forEach((idx, i) => g[i * 2].push({ inst: lead1, midi: note(th, idx), len: 2, vel: 0.9 }, { inst: lead2, midi: note(th, idx), len: 2, vel: 0.6 }));
  for (let s = 0; s < 8; s++) g[s].push({ drum: 'snare', vel: 0.3 + s * 0.07 });
  const hit = (step: number, root: number, top: number, len: number) => {
    for (const k of [0, 2, 4]) g[step].push({ inst: th.comp[0], midi: note(th, root + k), len, vel: 0.9 }, { inst: th.pad, midi: note(th, root + k), len, vel: 1 });
    g[step].push({ inst: lead1, midi: note(th, top), len, vel: 1 }, { inst: lead2, midi: note(th, top - 7), len, vel: 0.7 });
    let bass = th.key + th.scale[root];
    if (bass > 67) bass -= 12;
    g[step].push({ inst: th.bass[0], midi: bass, len, vel: 1 }, { drum: 'kick', vel: 1 });
  };
  hit(8, 1, 10, 3);
  hit(12, 4, 11, 3);
  hit(16, 0, 14, 14);
  g[16].push({ drum: 'crash', vel: 0.9 });
  [18, 20, 22, 24].forEach((s, i) => g[s].push({ inst: 'bell', midi: note(th, [7, 9, 11, 14][i]), len: 2, vel: 0.5 }));
  return g;
}

/** One theme wired to a mixer: owns its bus and plays single steps at exact times. */
export class Track {
  readonly theme: Theme;
  readonly bus: GainNode;
  private grids = new Map<string, Grid>();
  private buses = new Map<string, AudioNode>();

  constructor(private ctx: Ctx, private mix: Mixer, readonly name: MusicTrack) {
    this.theme = THEMES[name];
    this.bus = ctx.createGain();
    this.bus.gain.value = this.theme.trim;
    this.bus.connect(mix.music);
  }

  stepDur(mood: LoopMood): number {
    return 60 / (this.theme.bpm * TEMPO[mood]) / 4;
  }

  /** Schedules one step of the loop (or of the sting) at time t. */
  step(mood: MusicMood, index: number, t: number): void {
    let grid = this.grids.get(mood);
    if (!grid) this.grids.set(mood, (grid = mood === 'win' ? compileSting(this.theme) : compile(this.theme, mood)));
    const sd = this.stepDur(mood === 'win' ? 'play' : mood);
    const p = index % 4;
    const when = t + (p === 2 ? this.theme.swing : p ? this.theme.swing / 2 : 0) * sd;
    for (const e of grid[index]) {
      if ('drum' in e) DRUM[e.drum](this.ctx, this.out('drums', 0.12, 0), when, e.vel);
      else {
        const i = INST[e.inst];
        tone(this.ctx, this.out(e.inst, i.rev, 'pan' in i ? i.pan : 0), i, when, mtof(e.midi), e.len * sd * 0.92, e.vel);
      }
    }
  }

  /** One bus per instrument: its place in the stereo field and its share of reverb. */
  private out(key: string, rev: number, pan: number): AudioNode {
    let n = this.buses.get(key);
    if (!n) {
      const g = this.ctx.createGain();
      if (pan) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p).connect(this.bus);
      } else g.connect(this.bus);
      if (rev) {
        const send = this.ctx.createGain();
        send.gain.value = rev;
        g.connect(send).connect(this.mix.reverb);
      }
      this.buses.set(key, (n = g));
    }
    return n;
  }

  /** Fades out and disconnects. */
  release(t: number): void {
    this.bus.gain.setTargetAtTime(0, t, 0.12);
    setTimeout(() => this.bus.disconnect(), 1500);
  }
}

const LOOKAHEAD = 0.25; // seconds of music kept scheduled ahead of the clock
const TICK_MS = 50;

/** Live playback: keeps the next quarter second scheduled; mood changes land on bar lines. */
export class MusicPlayer {
  private track: Track | null = null;
  private mood: LoopMood = 'menu';
  private want: MusicMood = 'menu';
  private sting = -1; // step inside the win sting, or -1
  private pos = 0; // step inside the 32-bar loop
  private next = 0; // context time of the next step
  private timer = 0;

  constructor(private ctx: AudioContext, private mix: Mixer) {}

  play(name: MusicTrack, mood: MusicMood): void {
    if (this.track?.name !== name) {
      this.track?.release(this.ctx.currentTime);
      this.track = new Track(this.ctx, this.mix, name);
      this.pos = 0;
      this.sting = -1;
      this.next = this.ctx.currentTime + 0.08;
      if (mood !== 'win') this.mood = mood;
    }
    this.want = mood;
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    this.track?.release(this.ctx.currentTime);
    this.track = null;
    clearInterval(this.timer);
    this.timer = 0;
  }

  private tick(): void {
    const tr = this.track;
    if (!tr || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.next < now) this.next = now + 0.05; // the page was frozen; pick up from here
    while (this.next < now + LOOKAHEAD) {
      if (this.sting < 0) {
        // The sting may start on any beat; other moods wait for the bar line.
        if (this.want === 'win' && this.pos % 4 === 0) {
          this.sting = 0;
          this.want = 'menu';
        } else if (this.want !== 'win' && this.want !== this.mood && this.pos % STEPS === 0) this.mood = this.want;
      }
      if (this.sting >= 0) {
        tr.step('win', this.sting, this.next);
        this.next += tr.stepDur('play');
        if (++this.sting === 2 * STEPS) {
          this.sting = -1;
          this.pos = 0;
          this.mood = this.want === 'win' ? 'menu' : this.want;
        }
      } else {
        tr.step(this.mood, this.pos, this.next);
        this.next += tr.stepDur(this.mood);
        this.pos = (this.pos + 1) % (FORM_BARS * STEPS);
      }
    }
  }
}
