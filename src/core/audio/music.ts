import type { MusicMood, MusicTrack } from '../contract';
import { readLocal, writeLocal } from '../store';
import { SONGS, type Section, type Theme } from './songs';
import { DRUM, INST, fxBus, mtof, tone, type DrumName, type InstName, type Mixer } from './synth';

// The music engine. A song is compiled once per mood into a grid of events (32 bars x 16 steps);
// a lookahead scheduler then hands each step to WebAudio with an exact start time.

type Ctx = BaseAudioContext;
type LoopMood = Exclude<MusicMood, 'win'>;
type Ev =
  | { inst: InstName; midi: number; len: number; vel: number; slide?: boolean }
  | { drum: DrumName; vel: number; roll?: number; len?: number };
type Grid = Ev[][]; // [bar * 16 + step] -> events

export const STEPS = 16;
export const FORM_BARS = 32;
const TEMPO: Record<LoopMood, number> = { menu: 0.92, play: 1, intense: 1.1 };
const MOOD_INDEX: Record<MusicMood, number> = { menu: 0, play: 1, intense: 2, win: 3 };

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

/** A chord as MIDI notes: `bass` is the root in the bass octave, the rest are voiced around the key note. */
interface Chord {
  bass: number;
  fifth: number; // semitones from the root to the chord's fifth
  pad: number[]; // what the pad and chord instruments play
  line: number[]; // the chord tones in rising order, for arps and ostinatos
  pcs: number[]; // pitch classes, for the melody check
}

/** Chord token: degree, "+" (raise the third: a major V in a minor key), then 7, 9, a (add9), s (sus4) or u (sus2). */
function parseChord(th: Theme, tok: string): Chord {
  const m = /^([1-7])(\+?)([79asu]?)$/.exec(tok);
  if (!m) throw new Error(`Bad chord "${tok}"`);
  const root = Number(m[1]) - 1;
  const base = th.key + th.scale[root];
  const semi = (k: number) => note(th, root + k) - note(th, root);
  const tri = [0, m[3] === 's' ? semi(3) : m[3] === 'u' ? semi(1) : semi(2) + (m[2] ? 1 : 0), semi(4)];
  const sev = m[3] === '7' || m[3] === '9' ? semi(6) : null;
  const nin = m[3] === '9' || m[3] === 'a' ? semi(8) : null;
  const fold = (n: number, lo: number) => lo + ((((n - lo) % 12) + 12) % 12);
  const lo = th.key - 5;
  const up = (a: number, b: number) => a - b;
  // Seventh chords leave the root to the bass (so a major 7th never rubs against it); the 9th sits on top.
  const pad = (sev === null ? tri : [tri[1], tri[2], sev]).map((s) => fold(base + s, lo)).sort(up);
  if (nin !== null) pad.push(fold(base + nin, th.key + 7));
  const line = (sev === null ? tri : [...tri, sev]).map((s) => fold(base + s, lo)).sort(up);
  const all = [...tri, ...(sev === null ? [] : [sev]), ...(nin === null ? [] : [nin])];
  return { bass: base > 67 ? base - 12 : base, fifth: tri[2], pad, line, pcs: all.map((s) => (base + s) % 12) };
}

interface Bar {
  chord: [Chord, Chord]; // one for each half of the bar
  mel: [number, number, number][];
}

function parseSection(th: Theme, s: Section): Bar[] {
  const chords = s.chords.trim().split(/\s+/);
  const mel = s.mel.split('|');
  if (chords.length !== 8 || mel.length !== 8) throw new Error('A section is 8 bars');
  return chords.map((c, i) => {
    const [a, b = a] = c.split('/').map((x) => parseChord(th, x));
    return { chord: [a, b], mel: parseBar(mel[i]) };
  });
}

/**
 * Checks a melody against its chords. A "strong" note starts on a beat or lasts a beat or more.
 * `hit`: strong notes that are chord notes. `clash`: strong notes a semitone above a chord note (the ear hears a wrong note).
 */
export function checkSong(th: Theme): { strong: number; hit: number; clash: number } {
  let strong = 0, hit = 0, clash = 0;
  for (const m of ['menu', 'play', 'intense'] as const) compile(th, m); // throws on a bad pattern
  compileSting(th);
  for (const sec of [th.A, th.B])
    for (const bar of parseSection(th, sec))
      for (const [step, idx, len] of bar.mel) {
        if (step % 4 && len < 4) continue;
        strong++;
        const pc = note(th, idx) % 12;
        const pcs = bar.chord[step < 8 ? 0 : 1].pcs;
        if (pcs.includes(pc)) hit++;
        else if (pcs.some((p) => (pc - p + 12) % 12 === 1)) clash++;
      }
  return { strong, hit, clash };
}

const VEL: Record<string, number> = { x: 1, o: 0.55, r: 0.75, R: 0.75 };
const ROLL: Record<string, number> = { r: 2, R: 3 };
/** Length of the note at `step`: itself plus the "_" ties after it. */
const held = (p: string, step: number) => {
  let n = 1;
  while (p[step + n] === '_') n++;
  return n;
};
/** The n-th chord tone, counting up through the octaves. */
const lineNote = (ch: Chord, n: number) => ch.line[n % ch.line.length] + 12 * Math.floor(n / ch.line.length);

/**
 * Arrangement of the 32 bars (A A B A):
 * - menu: pad, soft chords or arp, long bass, the light kit, the tune on the second lead;
 * - play: A1 the band; A2 adds the arp and a second lead; B opens with a 4-bar breakdown (no beat, long bass),
 *   builds back with a reverse cymbal and a riser; the last A lands on an impact with everything in;
 * - intense: everything, all the time, the busier patterns, and a riser into every section.
 */
function compile(th: Theme, mood: LoopMood): Grid {
  const A = parseSection(th, th.A);
  const B = parseSection(th, th.B);
  const form = [A, A, B, A];
  const grid: Grid = Array.from({ length: FORM_BARS * STEPS }, () => []);
  const [lead1, lead2] = th.lead;
  const [compInst, compMode, compPlay, compHot] = th.comp;
  const [bassInst, bassPlay, bassHot] = th.bass;
  const soft = mood === 'menu';
  const hot = mood === 'intense';
  const compPat = hot ? compHot ?? compPlay : compPlay;
  const bassPat = hot ? bassHot ?? bassPlay : bassPlay;
  for (const p of [compPat, bassPat, th.arp?.[1] ?? compPat]) if (p.length !== STEPS) throw new Error(`${th.title}: pattern "${p}" is not 16 long`);
  for (const p of Object.values(th.drums[mood])) if (p.length % STEPS || p.length > 2 * STEPS) throw new Error(`${th.title}: drum pattern "${p}" is not 16 or 32 long`);

  for (let b = 0; b < FORM_BARS; b++) {
    const sec = b >> 3;
    const k = b & 7;
    const bar = form[sec][k];
    const brk = mood === 'play' && sec === 2 && k < 4; // the breakdown
    const at = (step: number) => grid[b * STEPS + step];

    for (const [step, idx, len] of bar.mel) {
      const midi = note(th, idx);
      const one = (inst: InstName, vel: number) => at(step).push({ inst, midi, len, vel: vel * (step % 4 === 0 ? 1 : 0.88) });
      if (soft) one(lead2, 0.7);
      else if (hot) (one(lead1, 0.95), one(lead2, 0.55));
      else if (sec === 2) one(lead2, 1);
      else {
        one(lead1, 1);
        if (sec) one(lead2, sec === 3 ? 0.5 : 0.4);
      }
    }

    const split = bar.chord[1] !== bar.chord[0];
    const kit = th.drums[soft || brk ? 'menu' : mood];
    for (let step = 0; step < STEPS; step++) {
      const ch = bar.chord[step < 8 ? 0 : 1];
      const newChord = step === 0 || (step === 8 && split);
      const chordLen = split ? 8 : 16;

      // Pad: the chord held under everything.
      if (newChord) for (const m of ch.pad) at(step).push({ inst: th.pad, midi: m, len: chordLen, vel: soft || brk ? 1 : 0.8 });

      // Comp: the rhythm instrument. chord = the voicing, power = root-fifth-octave, line = single chord tones.
      const c = compPat[step];
      if (compMode === 'line') {
        if (c >= '0' && c <= '9') at(step).push({ inst: compInst, midi: lineNote(ch, Number(c)), len: held(compPat, step), vel: (soft ? 0.55 : 0.8) * (step % 4 ? 0.8 : 1) });
      } else if (soft) {
        if (compMode === 'chord' && newChord) for (const m of ch.pad) at(step).push({ inst: compInst, midi: m, len: 6, vel: 0.5 });
      } else if (VEL[c] && !(brk && compMode === 'power')) {
        const notes = compMode === 'power' ? [ch.bass - 12, ch.bass - 12 + ch.fifth, ch.bass] : ch.pad;
        for (const m of notes) at(step).push({ inst: compInst, midi: m, len: held(compPat, step), vel: VEL[c] * (compMode === 'power' ? 0.8 : 0.7) });
      }

      // Arp: a quiet second line an octave up.
      const a = th.arp?.[1][step];
      if (th.arp && a && a >= '0' && a <= '9' && (soft || hot || sec > 0))
        at(step).push({ inst: th.arp[0], midi: lineNote(ch, Number(a)) + 12, len: 2, vel: (hot ? 0.6 : 0.5) * (step % 4 ? 0.8 : 1) });

      // Bass. Pattern: r root, R root an octave up, f fifth, S root sliding down from the octave (808 slide), _ tie.
      if (soft || brk) {
        if (newChord) at(step).push({ inst: bassInst, midi: ch.bass, len: chordLen - 1, vel: 0.8 });
      } else {
        const p = bassPat[step];
        const off = p === 'r' || p === 'S' ? 0 : p === 'R' ? 12 : p === 'f' ? ch.fifth : -1;
        if (off >= 0) at(step).push({ inst: bassInst, midi: ch.bass + off, len: held(bassPat, step), vel: step % 4 ? 0.85 : 1, slide: p === 'S' });
      }

      // Drums: x loud, o soft, r and R are 2- and 3-hit rolls. A 32-step pattern spans two bars.
      for (const d in kit) {
        const p = kit[d as DrumName]!;
        const ch2 = p[p.length === 2 * STEPS ? (b & 1) * STEPS + step : step];
        if (VEL[ch2]) at(step).push({ drum: d as DrumName, vel: VEL[ch2], roll: ROLL[ch2] });
      }
      if (!soft) {
        // A fill and a riser lead into the next section; a crash (and an impact) open it.
        if (k === 7 && step >= 10 && step !== 11) at(step).push({ drum: th.fill, vel: 0.5 + (step - 10) * 0.08 });
        if (step === 0 && k === 7 && (hot || sec === 2)) at(0).push({ drum: 'riser', vel: 1, len: STEPS });
        if (step === 8 && k === 3 && brk) at(8).push({ drum: 'rev', vel: 1, len: 8 });
        if (step === 0 && k === 0) {
          at(0).push({ drum: 'crash', vel: hot ? 0.7 : 0.45 });
          if (hot || sec === 3) at(0).push({ drum: 'impact', vel: hot ? 0.8 : 1 });
        }
      }
    }
  }
  return grid;
}

/**
 * The win sting, two bars: a rising three-note call, then bVI - bVII - I with the last chord major and held
 * (the "victory" cadence of game soundtracks; it lands bright from any mode).
 */
function compileSting(th: Theme): Grid {
  const g: Grid = Array.from({ length: 2 * STEPS }, () => []);
  const [lead1, lead2] = th.lead;
  const k = th.key;
  [[0, 7, 3], [3, 12, 3], [6, 14, 2]].forEach(([step, semi, len]) => g[step].push({ inst: lead1, midi: k + semi, len, vel: 0.9 }, { inst: lead2, midi: k + semi, len, vel: 0.6 }));
  for (let s = 0; s < 8; s++) g[s].push({ drum: 'snare', vel: 0.25 + s * 0.07 });
  const hit = (step: number, root: number, top: number, len: number) => {
    const ch = [0, 4, 7].map((s) => k - 5 + ((root + s + 5) % 12));
    for (const m of ch) g[step].push({ inst: th.pad, midi: m, len, vel: 1 });
    if (th.comp[1] !== 'power') for (const m of ch) g[step].push({ inst: th.comp[0], midi: m, len, vel: 0.8 });
    let bass = k + root;
    if (bass > 67) bass -= 12;
    if (th.comp[1] === 'power') for (const m of [bass - 12, bass - 5, bass]) g[step].push({ inst: th.comp[0], midi: m, len, vel: 0.8 });
    g[step].push({ inst: lead1, midi: k + top, len, vel: 1 }, { inst: lead2, midi: k + top - 12, len, vel: 0.7 });
    g[step].push({ inst: th.bass[0], midi: bass, len, vel: 1 }, { drum: 'kick', vel: 1 });
  };
  hit(8, 8, 15, 3);
  hit(12, 10, 17, 3);
  hit(16, 0, 19, 14);
  g[16].push({ drum: 'crash', vel: 0.9 }, { drum: 'impact', vel: 0.8 });
  [4, 7, 12, 14].forEach((semi, i) => g[18 + i * 2].push({ inst: th.arp?.[0] ?? 'crystal', midi: k + 12 + semi, len: 2, vel: 0.45 }));
  return g;
}

/** One song wired to a mixer: owns its bus and plays single steps at exact times. */
export class Track {
  readonly theme: Theme;
  readonly bus: GainNode;
  private send: GainNode; // the song's reverb send; follows the bus gain
  private pump: GainNode | null = null; // sidechain: the kick dips everything routed through here
  private grids = new Map<string, Grid>();
  private buses = new Map<string, AudioNode>();
  private mood: MusicMood | null = null;

  constructor(private ctx: Ctx, private mix: Mixer, readonly name: MusicTrack, readonly song = 0) {
    const th = (this.theme = SONGS[name][song]);
    this.bus = ctx.createGain();
    this.send = ctx.createGain();
    this.send.connect(mix.reverb);
    if (th.lowpass) {
      // Lo-fi: the whole song through a gentle lowpass.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = th.lowpass;
      lp.Q.value = 0.5;
      this.bus.connect(lp).connect(mix.music);
    } else this.bus.connect(mix.music);
    if (th.pump) {
      this.pump = ctx.createGain();
      this.pump.connect(this.bus);
    }
  }

  stepDur(mood: LoopMood): number {
    return 60 / (this.theme.bpm * TEMPO[mood]) / 4;
  }

  /** Schedules one step of the loop (or of the sting) at time t. */
  step(mood: MusicMood, index: number, t: number): void {
    const th = this.theme;
    let grid = this.grids.get(mood);
    if (!grid) this.grids.set(mood, (grid = mood === 'win' ? compileSting(th) : compile(th, mood)));
    if (mood !== this.mood) {
      // Each mood has its own loudness trim.
      const trim = th.trim[MOOD_INDEX[mood]];
      for (const g of [this.bus, this.send]) this.mood ? g.gain.setTargetAtTime(trim, t, 0.03) : g.gain.setValueAtTime(trim, 0);
      this.mood = mood;
    }
    const sd = this.stepDur(mood === 'win' ? 'play' : mood);
    // Swing: `swing` delays the off-beat eighths (shuffle), `shuffle` delays every second sixteenth (lo-fi lilt).
    const p = index % 4;
    const when = t + ((p === 2 ? th.swing ?? 0 : p ? (th.swing ?? 0) / 2 : 0) + (p % 2 ? th.shuffle ?? 0 : 0)) * sd;
    for (const e of grid[index]) {
      if ('drum' in e) {
        const out = this.out('drums', 0.12, 0, false);
        const n = e.roll ?? 1;
        for (let j = 0; j < n; j++) DRUM[e.drum](this.ctx, out, when + (j * sd) / n, e.vel, (e.len ?? 0) * sd);
        if (this.pump && (e.drum === 'kick' || e.drum === 'dkick')) {
          this.pump.gain.setTargetAtTime(1 - th.pump! * e.vel, when, 0.004);
          this.pump.gain.setTargetAtTime(1, when + 0.04, 0.08);
        }
      } else {
        const i = INST[e.inst];
        const ducked = e.inst === th.pad || e.inst === th.comp[0] || e.inst === th.bass[0];
        tone(this.ctx, this.out(e.inst, i.rev, i.pan ?? 0, ducked, i.fx), i, when, mtof(e.midi), e.len * sd * 0.92, e.vel, { sd, slide: e.slide ? [12, sd * 1.5] : undefined });
      }
    }
  }

  /** One bus per instrument: its effect, its place in the stereo field, and its share of reverb. */
  private out(key: string, rev: number, pan: number, ducked: boolean, fx?: (typeof INST)[InstName]['fx']): AudioNode {
    let n = this.buses.get(key);
    if (!n) {
      const g = this.ctx.createGain();
      let tail: AudioNode = g;
      if (fx) {
        const [a, b] = fxBus(this.ctx, fx);
        g.connect(a);
        tail = b;
      }
      const dest = (ducked && this.pump) || this.bus;
      if (pan) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        tail.connect(p).connect(dest);
      } else tail.connect(dest);
      if (rev) {
        const send = this.ctx.createGain();
        send.gain.value = rev;
        tail.connect(send).connect(this.send);
      }
      this.buses.set(key, (n = g));
    }
    return n;
  }

  /** Fades out and disconnects. With `ring`, the notes already playing ring out instead (a song change on the bar line). */
  release(t: number, ring = false): void {
    if (!ring) for (const g of [this.bus, this.send]) g.gain.setTargetAtTime(0, t, 0.12);
    setTimeout(() => (this.bus.disconnect(), this.send.disconnect()), ring ? 5000 : 1500);
  }
}

/** The next song of a track's rotation. Kept per device, so a new page carries on where the last one stopped. */
const lastSong: Partial<Record<MusicTrack, number>> = {}; // also in memory: storage can be off (private browsing)
function nextSong(name: MusicTrack): number {
  const key = `camalot.audio.song.${name}`;
  const prev = lastSong[name] ?? readLocal<number>(key);
  const song = typeof prev === 'number' && Number.isInteger(prev) && prev >= 0 ? (prev + 1) % SONGS[name].length : 0;
  writeLocal(key, (lastSong[name] = song));
  return song;
}

const LOOKAHEAD = 0.25; // seconds of music kept scheduled ahead of the clock
const TICK_MS = 50;
/** Leaving the menu after this many seconds of play on the current song counts as a new run, not a pause. */
const FRESH_S = 15;

/**
 * Live playback: keeps the next quarter second scheduled; mood changes land on bar lines.
 *
 * Song rotation (each track has several songs, played in order, so the same one never comes twice in a row):
 * - a song that reaches the end of its loop hands over to the next one;
 * - a new run or level (play or intense begins from the menu) starts the next song, unless the current
 *   song has had under FRESH_S seconds of play (a pause or a question card, then it carries on);
 * - any other mood change keeps the current song.
 */
export class MusicPlayer {
  private track: Track | null = null;
  private mood: LoopMood = 'menu';
  private want: MusicMood = 'menu';
  private sting = -1; // step inside the win sting, or -1
  private pos = 0; // step inside the 32-bar loop
  private next = 0; // context time of the next step
  private timer = 0;
  private played = 0; // seconds the current song has spent in play or intense
  private fresh = true; // the next start from the menu is a new run: nothing played yet, or a level was just won
  private held = false; // audio lab: stay on one song

  constructor(private ctx: AudioContext, private mix: Mixer) {}

  /** `song` is for the audio lab: it plays that song and stops the rotation. */
  play(name: MusicTrack, mood: MusicMood, song?: number): void {
    if (this.track?.name !== name || (song !== undefined && this.track.song !== song)) {
      this.track?.release(this.ctx.currentTime);
      this.track = new Track(this.ctx, this.mix, name, song ?? nextSong(name));
      this.pos = this.played = 0;
      this.fresh = true;
      this.sting = -1;
      this.next = this.ctx.currentTime + 0.08;
      if (mood !== 'win') this.mood = mood;
    }
    this.held = song !== undefined;
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

  /** The next song takes over on this step; the old one's last notes ring out. */
  private rotate(): void {
    if (this.held || !this.track) return;
    this.track.release(this.ctx.currentTime, true);
    this.track = new Track(this.ctx, this.mix, this.track.name, nextSong(this.track.name));
    this.pos = this.played = 0;
  }

  private setMood(mood: LoopMood): void {
    if (this.mood === 'menu' && mood !== 'menu' && (this.fresh || this.played > FRESH_S)) this.rotate();
    this.fresh = false;
    this.mood = mood;
  }

  private tick(): void {
    if (!this.track || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.next < now) this.next = now + 0.05; // the page was frozen; pick up from here
    while (this.next < now + LOOKAHEAD) {
      if (this.sting < 0) {
        // The sting may start on any beat; other moods wait for the bar line.
        if (this.want === 'win' && this.pos % 4 === 0) {
          this.sting = 0;
          this.want = 'menu';
        } else if (this.want !== 'win' && this.want !== this.mood && this.pos % STEPS === 0) this.setMood(this.want);
      }
      const tr = this.track;
      if (this.sting >= 0) {
        tr.step('win', this.sting, this.next);
        this.next += tr.stepDur('play');
        if (++this.sting === 2 * STEPS) {
          // After a win the song starts over in the menu mood, and the next run gets a new song.
          this.sting = -1;
          this.pos = 0;
          this.mood = 'menu';
          this.fresh = true;
        }
      } else {
        const sd = tr.stepDur(this.mood);
        tr.step(this.mood, this.pos, this.next);
        this.next += sd;
        if (this.mood !== 'menu') this.played += sd;
        if (++this.pos === FORM_BARS * STEPS) {
          this.pos = 0;
          this.rotate();
        }
      }
    }
  }
}
