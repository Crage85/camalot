import type { MusicTrack } from '../contract';
import type { DrumName, InstName } from './synth';

// The songbook: three songs for the hub and for each game (D17: anime and JRPG soundtrack, lo-fi, EDM,
// epic orchestral-electronic). A game's songs share a sound world but differ in key, mode, tempo, groove,
// and tune. The player (music.ts) rotates through them.
// Each song is 32 bars of 4/4 in the form A A B A (A and B are 8 bars each); music.ts arranges the
// sections (breakdown, riser, impact) and the four moods.
//
// Melody, one bar between each "|", 16 sixteenths per bar:
//   a number is a scale degree (1 = the key note); ' raises it an octave, , lowers it; - is a rest;
//   :n is the length in sixteenths (default 2, an eighth note).
// Chords, one per bar ("5s/5" splits the bar): a scale degree, built in thirds from the song's mode, plus
//   7 (seventh), 9 (seventh and ninth), a (add9), s (sus4), u (sus2); "5+" raises the third (major V in minor).
// Rhythm patterns are 16 characters, one per sixteenth ("." = nothing, "_" = hold the note before):
//   comp chord/power: x loud, o soft.   comp line and arp: a digit picks a chord tone, counting upward.
//   bass: r root, R root an octave up, f fifth, S root sliding down from the octave (808 slide).
//   drums: x loud, o soft, r two-hit roll, R three-hit roll. A 32-character drum pattern spans two bars.
// music.ts checks that every bar adds up to 16; `checkSong` checks the tune against the chords.

/** chord = the full voicing; power = root, fifth, octave (distorted guitar); line = one chord tone at a time. */
export type CompMode = 'chord' | 'power' | 'line';
type Kit = Partial<Record<DrumName, string>>;

export interface Section {
  chords: string;
  mel: string;
}

export interface Theme {
  title: string;
  /** For the audio lab: the style in a few words. */
  style: string;
  key: number; // MIDI note of degree 1
  scale: number[];
  bpm: number;
  swing?: number; // delays the off-beat eighths; 0.67 = triplet shuffle
  shuffle?: number; // delays every second sixteenth (lo-fi lilt), in sixteenths
  /** Loudness trims for menu, play, intense, win, so all songs sit level (set by shots/audio/calibrate.mjs). */
  trim: [number, number, number, number];
  lowpass?: number; // lo-fi: cutoff in Hz for the whole song
  pump?: number; // sidechain depth 0..1: the kick dips the pad, comp, and bass
  lead: [InstName, InstName];
  /** Instrument, mode, pattern for play, pattern for intense (default: the play pattern). */
  comp: [InstName, CompMode, string, string?];
  arp?: [InstName, string];
  pad: InstName;
  /** Instrument, pattern for play, pattern for intense. */
  bass: [InstName, string, string?];
  drums: { menu: Kit; play: Kit; intense: Kit };
  fill: DrumName;
  A: Section;
  B: Section;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

export const SONGS: Record<MusicTrack, Theme[]> = {
  // ---- Camalot (hub): JRPG title screen, orchestral-electronic ----
  hub: [
    {
      title: 'Crownfire', style: 'JRPG title theme: horn and violin over a cello ostinato, taiko and kit',
      key: 62, scale: AEOLIAN, bpm: 112, trim: [1, 1, 1, 1],
      lead: ['horn', 'violin'], comp: ['cello', 'line', '0.2.3.2.0.2.3.2.', '0.223.2.0.223.24'], arp: ['crystal', '..3...4...5...4.'],
      pad: 'strings', bass: ['sub', 'r_____..r___R_..', 'r_r_r_r_r_r_R_r_'],
      drums: {
        menu: { taiko: 'x.........o.....' },
        play: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.', taiko: '..............o.' },
        intense: { kick: 'x..x..x.x..x..x.', snare: '....x.......x.o.', hat: 'xoxoxoxoxoxoxoxo', taiko: 'x.....x...x.....' },
      },
      fill: 'taikoHi',
      A: {
        chords: '1a 67 3 7 1a 67 7s/7 1',
        mel: "5:6 7:2 1':8 | 3':6 2':2 1':4 6:4 | 7:6 1':2 2':4 7:4 | 2':8 -:2 5:2 7:2 1':2 | 3':6 2':2 1':4 5:4 | 6:6 1':2 3':8 | 4':6 3':2 2':4 7:4 | 1':12 -:4",
      },
      B: {
        chords: '4 1 6 7 4 1 67 7',
        mel: "-:2 4 6 1' 6:2 1':2 4':4 | 3':6 1':2 5:8 | -:2 6 1' 3' 1':2 3':2 6':4 | 4':6 2':2 7:8 | 1':3 1':3 6:2 4:4 6:4 | 5:3 5:3 3:2 1:4 3:4 | 6:3 1':3 3':2 5':8 | 4':4 2':4 7:4 2':4",
      },
    },
    {
      title: 'Oathbound', style: 'half-time dorian hymn: violin lead, piano chords, choir pad, glass arp',
      key: 64, scale: DORIAN, bpm: 100, trim: [1, 1, 1, 1],
      lead: ['violin', 'saw'], comp: ['piano', 'chord', 'x__..x__..x_....', 'x__x__x_.x__x_x_'], arp: ['crystal', '0.2.4.2.3.2.4.2.'],
      pad: 'choir', bass: ['synbass', 'r_____...r__f_..', 'r_.r_.r_r_.r_.f_'],
      drums: {
        menu: { rim: '........o.......', hat: 'o...o...o...o...' },
        play: { kick: 'x.........x..o..', snare: '........x.......', hat: 'x.o.x.o.x.o.x.r.' },
        intense: { kick: 'x..x......x..x..', snare: '....x.......x...', clap: '....x.......x...', hat: 'xoxoxoxoxoxoxorR' },
      },
      fill: 'tom',
      A: {
        chords: '17 4 7 3 17 4 7 1s',
        mel: "-:4 5:2 7:2 1':3 7:3 5:2 | 6:6 4:2 6:4 1':4 | -:4 7:2 2':2 4':3 2':3 7:2 | 5':6 3':2 7:8 | -:4 5:2 7:2 1':3 3':3 5':2 | 6':6 4':2 1':8 | 2':3 4':3 2':2 7:4 2':4 | 1':10 -:6",
      },
      B: {
        chords: '3 7 4 17 3 7 4 5',
        mel: "3':3 5':3 3':2 7:4 5:4 | 2':3 4':3 2':2 7:8 | 1':3 4':3 1':2 6:4 4:4 | 5:6 7:2 1':8 | 3':3 5':3 7':2 5':4 3':4 | 4':3 2':3 7:2 2':8 | 1':2 6:2 4:2 6:2 1':2 4':2 6':4 | 5':8 2':4 7:4",
      },
    },
    {
      title: 'Starfall Keep', style: 'royal-road progression: supersaw lead, pumping pad, four-on-the-floor',
      key: 65, scale: MAJOR, bpm: 124, trim: [1, 1, 1, 1], pump: 0.5,
      lead: ['super', 'horn'], comp: ['stab', 'chord', '..x..x....x..x..', 'x..x..x...x..x.x'], arp: ['pluck', '0.2.4.2.5.4.2.4.'],
      pad: 'sawpad', bass: ['synbass', '..r...r...r...r.', 'r.r.r.R.r.r.r.R.'],
      drums: {
        menu: { hat: '..o...o...o...o.', rim: '....o.......o...' },
        play: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.' },
        intense: { kick: 'x...x...x...x...', clap: '....x.......x...', snare: '....x.......x..o', hat: 'o.x.o.x.o.x.o.xo', open: '..o...o...o...o.' },
      },
      fill: 'snare',
      A: {
        chords: '47 57 37 6 27 57 1a 1',
        mel: "3':3 3':3 1':2 6:4 1':4 | 2':3 2':3 7:2 5:4 7:4 | -:2 5 7 2':2 5':4 3':4 | 3':6 1':2 6:8 | -:2 2 4 6:2 1':4 4':4 | 2':3 4':3 2':2 7:4 5:4 | 5:2 1':2 2':2 3':2 5':8 | 3':6 1':2 -:8",
      },
      B: {
        chords: '6 4 1 5 6 4 5s 5',
        mel: "6:3 1':3 3':2 6':8 | 6':3 4':3 1':2 4':8 | 5':3 3':3 1':2 5:8 | 7:2 2':2 5':4 2':8 | 6:3 1':3 3':2 6':4 3':4 | 4':3 6':3 4':2 1':8 | 1':4 2':4 5':8 | 7':4 5':4 2':4 5:4",
      },
    },
  ],
  // ---- Wyrmrise: epic dragon battle ----
  wyrm: [
    {
      title: 'Dragonfall', style: 'battle march: galloping cello ostinato, taiko, choir, horn theme',
      key: 60, scale: AEOLIAN, bpm: 140, trim: [1, 1, 1, 1],
      lead: ['horn', 'violin'], comp: ['cello', 'line', '0.000.000.000.20', '0.000.002.000.23'],
      pad: 'choir', bass: ['sub', 'r_______r_____r_', 'r_.r_.r_r_.r_.r_'],
      drums: {
        menu: { taiko: 'x.......o.......' },
        play: { taiko: 'x..x..x...x.x...', taikoHi: '....o.......o.o.', hat: '..o...o...o...o.' },
        intense: { taiko: 'x..x..x.x..x..x.', taikoHi: '....x..o....x.oo', kick: 'x.......x.......', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' },
      },
      fill: 'taikoHi',
      A: {
        chords: '1 1 6 7 1 1 6 5+',
        mel: "5:4 1':6 2':2 3':4 | 3':3 2':3 1':2 5:8 | 6:4 3':6 1':2 6:4 | 7:3 2':3 4':2 2':8 | 5:4 1':6 2':2 3':4 | 5':6 3':2 1':8 | 6':6 5':2 3':4 1':4 | 2':12 -:4",
      },
      B: {
        chords: '4 4 1 1 6 6 5s 5+',
        mel: "4':6 6':2 4':4 1':4 | -:2 1' 4' 6':2 4':8 | 3':6 5':2 3':4 1':4 | -:2 5 1' 3':2 1':8 | 1':3 3':3 6':2 3':4 1':4 | 6:3 1':3 3':2 6':8 | 5':8 1':4 2':4 | 2':8 5:4 -:4",
      },
    },
    {
      title: 'Ember Crown', style: 'full battle theme: distorted power chords, string ostinato, taiko, saw lead',
      key: 57, scale: AEOLIAN, bpm: 152, trim: [1, 1, 1, 1],
      lead: ['saw', 'horn'], comp: ['power', 'power', 'x_.x_.x_.x_.x_x_', 'x_x_x_x_x_x_x_x_'], arp: ['stacc', '0.2.3.2.0.2.3.2.'],
      pad: 'choir', bass: ['synbass', 'r.r.r.r.r.r.r.r.'],
      drums: {
        menu: { taiko: 'x.....o...x.....' },
        play: { kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', taiko: '..........o.....' },
        intense: { kick: 'x.x...x.x.x...x.', snare: '....x.......x..o', hat: 'xoxoxoxoxoxoxoxo', taiko: 'x.....x...x.....' },
      },
      fill: 'taikoHi',
      A: {
        chords: '1 7 6 7 1 7 6 5+',
        mel: "1':3 1':3 3':2 5':4 3':4 | 2':3 2':3 4':2 2':4 7:4 | 1':3 1':3 3':2 6':4 3':4 | 4':6 2':2 7:4 2':4 | 1':3 1':3 3':2 5':4 1'':4 | 7':6 5':2 4':4 2':4 | 3':6 1':2 6:4 1':4 | 2':8 5:8",
      },
      B: {
        chords: '6 7 1 1 6 7 5s 5+',
        mel: "6:2 1':2 3':2 6':6 3':4 | 7:2 2':2 4':2 7':6 4':4 | 1'':6 7':2 5':8 | -:2 3' 5' 3':2 1':8 | 6:2 1':2 3':2 6':6 3':4 | 7:2 2':2 4':2 7':6 2'':4 | 1'':8 5':8 | 2'':6 5':2 2':8",
      },
    },
    {
      title: 'Ashen Sky', style: 'half-time dorian dirge: taiko, trap hats, 808 slides, choir, violin',
      key: 67, scale: DORIAN, bpm: 96, trim: [1, 1, 1, 1],
      lead: ['violin', 'horn'], comp: ['cello', 'line', '0..0..0.2..0..3.', '0.00.00.2.00.03.'],
      pad: 'choir', bass: ['b808', 'r_____....S___..', 'r__.r_....S__r_.'],
      drums: {
        menu: { taiko: 'x...............', hat: '....o.......o...' },
        play: { taiko: 'x.........x.....', taikoHi: '......o.......o.', snare: '........x.......', hat: 'x.x.x.r.x.x.x.R.' },
        intense: { taiko: 'x..x......x..x..', taikoHi: '....o.o.....o.oo', snare: '........x.....o.', clap: '........x.......', hat: 'xxxrxxxRxxrxxRxr' },
      },
      fill: 'taikoHi',
      A: {
        chords: '17 17 3 4 17 17 7 4',
        mel: "1:6 3:2 5:8 | -:4 5:2 7:2 5:3 3:3 1:2 | 3:6 5:2 7:8 | 6:3 4:3 1:2 4:8 | 1':6 7:2 5:8 | -:4 5:2 7:2 1':3 3':3 1':2 | 2':6 7:2 4:4 7:4 | 6:4 4:8 -:4",
      },
      B: {
        chords: '4 4 17 17 2 4 5 5',
        mel: "4:3 6:3 1':2 4':8 | -:2 4' 1' 6:2 4:4 6:4 | 5:3 7:3 1':2 3':8 | -:2 3' 1' 7:2 5:8 | 2:3 4:3 6:2 2':8 | 1':3 6:3 4:2 1':4 4':4 | 5':6 2':2 7:8 | 5:4 7:4 2':4 5':4",
      },
    },
  ],
  // ---- Riftmaw: dark arcane electronic ----
  hole: [
    {
      title: 'Null Sigil', style: 'phrygian dark techno: wobble bass, glitch arp, saw lead, pumping pad',
      key: 64, scale: PHRYGIAN, bpm: 126, trim: [1, 1, 1, 1], pump: 0.5,
      lead: ['saw', 'soft'], comp: ['stab', 'chord', '..x..x....x.....', '..x..x..x.x..x..'], arp: ['crystal', '0.42.1.4.03.2.4.'],
      pad: 'air', bass: ['wobble', 'r___r___r___r_r_', 'r___r_r_r___r_R_'],
      drums: {
        menu: { rim: '....o.......o...', hat: '..o...o...o...o.' },
        play: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x..rx.' },
        intense: { kick: 'x...x...x...x..x', clap: '....x.......x...', hat: 'o.xoo.xoo.xoorxr', open: '..o...o...o...o.' },
      },
      fill: 'snare',
      A: {
        chords: '1 2 1 7 1 2 6 7',
        mel: "5:3 5:3 3:2 1:4 -:2 5:2 | 6:3 6:3 4:2 2:6 -:2 | 5:3 5:3 7:2 1':4 5:4 | 4:6 2:2 7,:8 | 5:3 5:3 3:2 1:4 -:2 5:2 | 6:3 6:3 1':2 2':6 -:2 | 3':3 1':3 6:2 3:8 | 4:3 2:3 4:2 7:6 -:2",
      },
      B: {
        chords: '4 6 2 1 4 6 2 7',
        mel: "-:2 1' 6 4:2 6:4 1':4 | 3':8 1':4 6:4 | -:2 2' 6 4:2 6:4 2':4 | 1':8 5:4 3:4 | 4':3 1':3 6:2 4:8 | 3':3 1':3 6:2 3':8 | 2':3 4':3 2':2 6:8 | 7:4 2':4 4':6 -:2",
      },
    },
    {
      title: 'Hollow Star', style: 'harmonic-minor half-time trap: 808 slides, hat rolls, electric piano, glitch arp',
      key: 60, scale: HARMONIC, bpm: 100, trim: [1, 1, 1, 1],
      lead: ['saw', 'ep'], comp: ['ep', 'chord', 'x_____....x___..'], arp: ['crystal', '..4..3..4..2..3.'],
      pad: 'air', bass: ['b808', 'r_____..S___..r_', 'r__r__..S__.r_r_'],
      drums: {
        menu: { hat: 'o...o...o...o...', rim: '........o.......' },
        play: { kick: 'x.........x..x..', snare: '........x.......', clap: '........o.......', hat: 'x.x.x.x.x.xrx.R.' },
        intense: { kick: 'x..x......x..x..', snare: '........x.......', clap: '........x.......', hat: 'xxxxxxrxxxxRxxrR', open: '....o.......o...' },
      },
      fill: 'snare',
      A: {
        chords: '1 1 6 5 1 1 4 5',
        mel: "1':6 7:2 1':4 3':4 | 5:3 3':3 2':2 1':8 | 6:6 1':2 3':4 1':4 | 7:6 2':2 5:8 | 1':6 7:2 1':4 5':4 | 3':3 5':3 3':2 1':8 | 6:3 1':3 4':2 6':4 4':4 | 5':6 2':2 7:6 -:2",
      },
      B: {
        chords: '4 4 1 1 6 6 5s 5',
        mel: "4:2 6:2 1':4 6:2 1':2 4':4 | 4':6 1':2 6:8 | 3:2 5:2 1':4 5:2 1':2 3':4 | 3':6 1':2 5:8 | 6:2 1':2 3':4 1':2 3':2 6':4 | 6':6 3':2 1':8 | 1':8 2':8 | 7:8 5:4 -:4",
      },
    },
    {
      title: 'Umbral Tide', style: 'phrygian breakbeat: reese bass, two-bar break, glitch arp, saw lead',
      key: 62, scale: PHRYGIAN, bpm: 140, trim: [1, 1, 1, 1],
      lead: ['saw', 'violin'], comp: ['stab', 'chord', 'x..x....x..x..x.'], arp: ['crystal', '0.3.4.3.02.34.3.'],
      pad: 'air', bass: ['reese', 'r_____r___r_____', 'r__r__r_r__r__R_'],
      drums: {
        menu: { hat: 'x.o.x.o.x.o.x.o.', rim: '....o.......o...' },
        play: { kick: 'x.........x.....x..x......x.....', snare: '....x.......x.......x..o....x...', hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.r.' },
        intense: { kick: 'x..x......x.....x..x....x.x.....', snare: '....x..o.o..x.......x..o.o..x.oo', hat: 'xoxoxoxoxoxoxoxo', open: '..o...o...o...o.' },
      },
      fill: 'snare',
      A: {
        chords: '1 6 2 1 1 6 2 7',
        mel: "-:2 5 5 3:2 5:4 1':4 | 6:6 5:2 3:8 | -:2 6 6 4:2 6:4 2':4 | 1':6 7:2 5:8 | -:2 5 5 3:2 5:4 1':4 | 3':6 1':2 6:8 | -:2 2' 2' 6:2 4:4 6:4 | 7:6 4:2 2:8",
      },
      B: {
        chords: '4 3 2 1 4 3 2 7',
        mel: "4':3 4':3 1':2 6:4 1':4 | 3':3 3':3 7:2 5:4 7:4 | 2':3 2':3 6:2 4:4 6:4 | 1':3 1':3 5:2 3:6 -:2 | 4':3 4':3 6':2 4':4 1':4 | 3':3 3':3 5':2 3':4 7:4 | 2':6 4':2 6':8 | 4':4 2':4 7:6 -:2",
      },
    },
  ],
  // ---- Skyfield Saga: warm, grown-up pastoral ----
  tractor: [
    {
      title: 'Windward Fields', style: 'lydian lo-fi: piano lead, electric piano chords, nylon arp, warm strings',
      key: 65, scale: LYDIAN, bpm: 88, shuffle: 0.22, trim: [1, 1, 1, 1], lowpass: 6500,
      lead: ['piano', 'nylon'], comp: ['ep', 'chord', 'x___..x__.x_....'], arp: ['nylon', '0.2.4.3.2.4.3.2.'],
      pad: 'strings', bass: ['fing', 'r__...r.r_...f..'],
      drums: {
        menu: { rim: '....o.......o...' },
        play: { dkick: 'x.....x...x.....', dsnare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
        intense: { dkick: 'x..x..x...x..x..', dsnare: '....x.......x..o', hat: 'xoxoxoxoxoxoxoxo', rim: '..o......o......' },
      },
      fill: 'tom',
      A: {
        chords: '17 2 67 57 17 2 37 67',
        mel: "-:2 5:2 7:3 5:3 3:6 | -:2 6:2 4:3 2:3 6:6 | -:2 1':2 3':3 1':3 5:6 | 7:6 2':4 5:6 | -:2 5:2 7:3 1':3 3':6 | -:2 4':2 2':3 6:3 4:6 | 5:3 7:3 2':2 3':8 | 1':6 6:6 -:4",
      },
      B: {
        chords: '67 2 57 17 67 2 3 2',
        mel: "6:3 1':3 3':2 5':8 | 4':3 2':3 6:2 4':8 | 2':3 7:3 5:2 2':8 | 3':3 1':3 7:2 5:8 | 6:3 1':3 3':2 6':4 5':4 | 4':6 6':2 2':8 | 7:3 3':3 5':2 7':4 5':4 | 6':6 4':2 2':6 -:2",
      },
    },
    {
      title: 'Lantern Road', style: 'mixolydian acoustic-electronic: nylon guitar lead, piano comp, easy backbeat',
      key: 62, scale: MIXO, bpm: 96, trim: [1, 1, 1, 1],
      lead: ['nylon', 'violin'], comp: ['piano', 'chord', 'x__.x_.x__.x_.x_'], arp: ['nylon', '0.2.3.4.3.2.3.2.'],
      pad: 'warm', bass: ['fing', 'r_____r_..f_r_..'],
      drums: {
        menu: { rim: '....o.......o...', hat: 'o...o...o...o...' },
        play: { kick: 'x......x..x.....', rim: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
        intense: { kick: 'x..x...x..x..x..', snare: '....x.......x...', hat: 'x.xox.xox.xox.xo', rim: '..o.......o.....' },
      },
      fill: 'tom',
      A: {
        chords: '1a 7 4 1a 6 7 4 1',
        mel: "5:3 3:3 5:2 1':6 -:2 | 4:3 2:3 4:2 7:6 -:2 | 6:3 4:3 6:2 1':4 4':4 | 3':6 2':2 1':4 5:4 | 6:3 1':3 3':2 6':6 -:2 | 7:3 2':3 4':2 2':6 -:2 | 1':3 6:3 4:2 6:4 1':4 | 5:6 3:2 1:6 -:2",
      },
      B: {
        chords: '4 1 7 4 6 4 7 7',
        mel: "-:2 4' 4' 1':2 6:4 1':4 | 3':6 1':2 5:8 | -:2 4' 4' 2':2 7:4 2':4 | 1':6 6:2 4:8 | -:2 3' 3' 1':2 6:4 1':4 | 4':6 1':2 6:8 | 2':3 4':3 2':2 7:4 2':4 | 4':8 2':4 -:4",
      },
    },
    {
      title: 'Amber Hour', style: 'slow lydian lo-fi: electric piano lead, nylon picking, upright bass, dusty kit',
      key: 60, scale: LYDIAN, bpm: 78, shuffle: 0.25, trim: [1, 1, 1, 1], lowpass: 6000,
      lead: ['ep', 'soft'], comp: ['nylon', 'line', '0.2.3.4.3.2.4.2.'],
      pad: 'strings', bass: ['upright', 'r__..f..r__.....'],
      drums: {
        menu: { hat: '....o.......o...' },
        play: { dkick: 'x......x..x.....', dsnare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo' },
        intense: { dkick: 'x..x...x..x...x.', dsnare: '....x..o....x...', hat: 'xoxoxoxoxoxoxoxo', rim: '......o.......o.' },
      },
      fill: 'rim',
      A: {
        chords: '17 37 67 2 17 37 2 2s',
        mel: "3':4 -:2 7:2 5:6 3:2 | 5:4 -:2 7:2 2':6 7:2 | 1':4 -:2 3':2 5':6 3':2 | 4':6 2':2 6:8 | 3':4 -:2 7:2 5:6 7:2 | 2':4 -:2 7:2 5:6 3:2 | 4:3 6:3 2':2 4':8 | 2':6 6:6 -:4",
      },
      B: {
        chords: '67 57 17 2 67 57 2 2',
        mel: "6:3 1':3 3':2 5':8 | 4':3 2':3 7:2 5:8 | 3':3 1':3 7:2 5:4 3:4 | 4:6 6:2 2':8 | 6:3 1':3 3':2 6':8 | 7':3 5':3 2':2 7:8 | 6:2 2':2 4':4 6':8 | 4':6 2':2 6:6 -:2",
      },
    },
  ],
  // ---- Spellpaw: mystical lo-fi chillhop ----
  match3: [
    {
      title: 'Moonlit Grimoire', style: 'dorian chillhop: 9th chords on electric piano, swung dusty drums, glass arp',
      key: 62, scale: DORIAN, bpm: 84, shuffle: 0.25, trim: [1, 1, 1, 1], lowpass: 5500,
      lead: ['soft', 'ep'], comp: ['ep', 'chord', 'x_____..x_.x__..'], arp: ['crystal', '..3...4...2...4.'],
      pad: 'warm', bass: ['upright', 'r__...r.f_...r..'],
      drums: {
        menu: { hat: '....o.......o...', rim: '........o.......' },
        play: { dkick: 'x......x.x......', dsnare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
        intense: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', clap: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' },
      },
      fill: 'dsnare',
      A: {
        chords: '19 47 19 47 37 47 29 57',
        mel: "-:2 5:2 7:2 2':4 1':3 5:3 | 6:6 4:2 3:8 | -:2 5:2 7:2 2':4 3':3 1':3 | 6:4 1':6 6:6 | 5:3 7:3 2':2 3':8 | 1':3 6:3 4:2 3:8 | -:2 4:2 6:2 1':4 3':6 | 2':6 7:4 5:6",
      },
      B: {
        chords: '37 77 19 19 37 77 29 57',
        mel: "3':3 2':3 7:2 5:8 | 2':3 7:3 6:2 4:8 | -:2 1:2 3:2 5:2 7:4 2':4 | 1':8 -:2 5:2 7:2 1':2 | 3':3 5':3 3':2 2':4 7:4 | 2':3 4':3 2':2 6:8 | 4:2 6:2 1':4 3':8 | 2':4 7:4 4:6 -:2",
      },
    },
    {
      title: 'Velvet Hex', style: 'royal-road chillhop: piano 7th chords, electric piano lead, swung beat',
      key: 63, scale: MAJOR, bpm: 90, shuffle: 0.22, trim: [1, 1, 1, 1], lowpass: 6000,
      lead: ['ep', 'soft'], comp: ['piano', 'chord', '..x__.x_..x__.x_'], arp: ['crystal', '0...3...4...2...'],
      pad: 'warm', bass: ['fing', 'r__..r..r_..f_r.'],
      drums: {
        menu: { rim: '....o.......o...' },
        play: { dkick: 'x.....x...x..x..', dsnare: '....x.......x...', hat: 'x.xox.x.x.xox.x.' },
        intense: { kick: 'x...x...x...x...', clap: '....x.......x...', dsnare: '.......o.......o', hat: 'o.x.o.x.o.x.o.xo' },
      },
      fill: 'dsnare',
      A: {
        chords: '47 57 37 67 47 57 19 19',
        mel: "3':6 1':2 6:4 1':4 | 2':6 7:2 5:4 4:4 | -:2 3:2 5:2 7:2 2':8 | 1':6 6:2 5:8 | 3':6 1':2 6:4 3':4 | 4':6 2':2 7:8 | -:2 5:2 7:2 2':2 3':4 5':4 | 2':6 7:4 5:6",
      },
      B: {
        chords: '27 57 37 67 27 57 19 1a',
        mel: "-:2 2:2 4:2 6:2 1':4 6:4 | 7:3 2':3 4':2 2':8 | -:2 3:2 5:2 7:2 2':4 7:4 | 1':3 3':3 5':2 3':8 | 6':3 4':3 2':2 1':4 6:4 | 5:3 7:3 2':2 4':8 | 3':3 2':3 7:2 5:8 | 2':4 3':4 1':6 -:2",
      },
    },
    {
      title: 'Runeglass', style: 'minor lo-fi, half-time: piano lead over maj7 and 9th chords, sub bass',
      key: 59, scale: AEOLIAN, bpm: 80, shuffle: 0.25, trim: [1, 1, 1, 1], lowpass: 5500,
      lead: ['piano', 'soft'], comp: ['ep', 'chord', 'x____.x__.x___..'], arp: ['crystal', '0.2.4.2.3.2.4.2.'],
      pad: 'air', bass: ['sub', 'r_____..r_..r_..'],
      drums: {
        menu: { hat: 'o...o...o...o...' },
        play: { dkick: 'x.........x.x...', dsnare: '........x.......', hat: 'x.x.x.xrx.x.x.x.' },
        intense: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxorx' },
      },
      fill: 'dsnare',
      A: {
        chords: '19 67 37 7 19 67 47 57',
        mel: "5:4 -:2 3':2 2':4 1':4 | 5:4 -:2 3':2 1':8 | 7:4 -:2 5':2 3':4 2':4 | 4':6 2':2 7:8 | 5:4 -:2 3':2 2':4 5':4 | 6':6 5':2 3':8 | 1':3 3':3 4':2 6':8 | 5':6 4':4 2':6",
      },
      B: {
        chords: '67 7 19 19 67 7 37 5+7',
        mel: "-:2 6:2 1':2 3':2 5':8 | 4':3 2':3 7:2 2':8 | -:2 5:2 7:2 2':2 3':8 | 1':6 7:2 5:8 | -:2 1':2 3':2 5':2 6':4 5':4 | 7':3 4':3 2':2 4':8 | 3':3 5':3 3':2 2':4 7:4 | 2':6 5:2 4:6 -:2",
      },
    },
  ],
  // ---- Neko Strike: anime sports opening ----
  runner: [
    {
      title: 'Breakaway', style: 'anime opening: power chords, supersaw hook, driving rock kit',
      key: 57, scale: MAJOR, bpm: 160, trim: [1, 1, 1, 1],
      lead: ['super', 'saw'], comp: ['power', 'power', 'x_o_o_x_o_o_x_o_', 'x_x_x_x_x_x_x_x_'], arp: ['pluck', '0.2.4.2.0.2.4.2.'],
      pad: 'sawpad', bass: ['synbass', 'r.r.r.r.r.r.r.r.'],
      drums: {
        menu: { hat: 'x.o.x.o.x.o.x.o.', rim: '....o.......o...' },
        play: { kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
        intense: { kick: 'x.x...x.x.x...x.', snare: '....x.......x..o', hat: 'x.x.x.x.x.x.x.x.', open: '..o...o...o...o.' },
      },
      fill: 'snare',
      A: {
        chords: '4 5 3 6 4 5 1 1',
        mel: "6:3 6:3 1':2 1':4 6:2 1':2 | 2':3 2':3 7:2 5:6 -:2 | 5:3 5:3 7:2 3':4 7:4 | 1':3 3':3 1':2 6:8 | 6:3 6:3 1':2 4':4 1':4 | 2':3 2':3 5':2 7':6 -:2 | 1'':6 5':2 3':4 5':4 | 1':10 -:6",
      },
      B: {
        chords: '6 4 1 5 6 4 5s 5',
        mel: "-:2 6 6 1':2 6:2 3':4 1':2 | 4':6 1':2 6:8 | -:2 5 5 1':2 5:2 3':4 1':2 | 2':6 7:2 5:8 | -:2 6 6 1':2 3':2 6':4 3':2 | 4':6 6':2 4':4 1':4 | 2':4 2':4 1':4 2':4 | 5':6 7':2 2'':8",
      },
    },
    {
      title: 'Overdrive Heart', style: 'minor-key EDM-rock: saw lead, power chords, four-on-the-floor, string ostinato',
      key: 64, scale: AEOLIAN, bpm: 172, trim: [1, 1, 1, 1], pump: 0.4,
      lead: ['saw', 'super'], comp: ['power', 'power', 'x_.x_.x_x_.x_.x_'], arp: ['stacc', '0.2.3.2.4.2.3.2.'],
      pad: 'strings', bass: ['synbass', 'r.r.r.r.r.r.r.R.'],
      drums: {
        menu: { hat: 'o...o...o...o...', rim: '....o.......o...' },
        play: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
        intense: { kick: 'x...x...x...x...', snare: '....x.......x.oo', clap: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.', open: '..o...o...o...o.' },
      },
      fill: 'tom',
      A: {
        chords: '1 6 3 7 1 6 7 1',
        mel: "5:2 1':2 3':4 3':3 2':3 1':2 | 6:2 1':2 3':4 3':3 1':3 6:2 | 7:2 3':2 5':4 5':3 3':3 7:2 | 4':6 2':2 7:8 | 5:2 1':2 3':4 5':3 3':3 1':2 | 6':6 5':2 3':8 | 2':3 4':3 2':2 7:4 2':4 | 1':10 -:6",
      },
      B: {
        chords: '6 7 1 1 6 7 5s 5+',
        mel: "1':3 1':3 3':2 6:8 | 2':3 2':3 4':2 7:8 | 3':3 3':3 5':2 1':4 5:4 | -:2 5 1' 3':2 1':8 | 1':3 1':3 3':2 6':8 | 2':3 2':3 4':2 7':8 | 1'':8 5':8 | 2'':6 5':2 2':8",
      },
    },
    {
      title: 'Golden Sprint', style: 'major-key pop-punk: supersaw and horn hook, power chords, galloping kick',
      key: 62, scale: MAJOR, bpm: 152, trim: [1, 1, 1, 1],
      lead: ['super', 'horn'], comp: ['power', 'power', 'x_x_.x_x_.x_x_x_'], arp: ['pluck', '0.4.2.4.0.4.2.4.'],
      pad: 'sawpad', bass: ['synbass', 'r.r.r.r.r.r.r.f.'],
      drums: {
        menu: { hat: 'x.o.x.o.x.o.x.o.', rim: '....o.......o...' },
        play: { kick: 'x..x..x...x.x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
        intense: { kick: 'x..x..x.x..x..x.', snare: '....x..o....x.o.', hat: 'xoxoxoxoxoxoxoxo' },
      },
      fill: 'snare',
      A: {
        chords: '1 5 6 4 1 5 4 4/5',
        mel: "3':3 3':3 2':2 1':3 5:5 | 2':3 2':3 1':2 7:3 5:5 | 1':3 1':3 7:2 6:3 3':5 | 4':6 3':2 1':6 -:2 | 3':3 3':3 2':2 1':3 5':5 | 5':3 5':3 4':2 2':3 7:5 | 6:2 1':2 4':4 6':8 | 6':4 4':4 5':4 2':4",
      },
      B: {
        chords: '4 5 3 6 4 5 6 5s',
        mel: "-:2 4 6 1':2 6:2 1':4 4':2 | 2':6 7:2 5:8 | -:2 3 5 7:2 5:2 7:4 3':2 | 1':6 6:2 3:8 | -:2 4 6 1':2 4':2 6':4 4':2 | 5':6 7':2 5':8 | 6':3 3':3 1':2 6:8 | 1':4 2':4 5':8",
      },
    },
  ],
  // ---- Frostclaim: icy drum-and-bass and chill EDM ----
  trail: [
    {
      title: 'Glacier Line', style: 'liquid drum-and-bass: airy pad, glass arp, sub bass, floating lead',
      key: 65, scale: AEOLIAN, bpm: 168, trim: [1, 1, 1, 1], pump: 0.35,
      lead: ['soft', 'violin'], comp: ['pluck', 'chord', '..x...x..x....x.'], arp: ['crystal', '0.2.4.2.5.2.4.2.'],
      pad: 'air', bass: ['sub', 'r_____....r___..', 'r_____r_..r___r_'],
      drums: {
        menu: { hat: 'x...o...x...o...', rim: '....o.......o...' },
        play: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.', rim: '.......o.o......' },
        intense: { kick: 'x.....x...x.....', snare: '....x..o.o..x...', hat: 'xoxoxoxoxoxoxoxo', ride: 'x...x...x...x...' },
      },
      fill: 'snare',
      A: {
        chords: '17 17 67 67 37 37 7 7',
        mel: "5:6 7:6 1':4 | 3':10 1':2 7:4 | 5:6 1':6 3':4 | 5':10 3':2 1':4 | 7:6 2':6 5':4 | 3':10 2':2 7:4 | 4':6 2':6 7:4 | 2':8 -:2 7:2 2':2 4':2",
      },
      B: {
        chords: '47 47 19 19 67 67 7s 7',
        mel: "6:3 1':3 4':2 3':8 | -:2 1':2 4':2 6':2 4':8 | 5':3 3':3 2':2 1':8 | -:2 7:2 1':2 2':2 3':8 | 6:3 1':3 3':2 5':8 | -:2 3':2 5':2 6':2 5':8 | 4':8 3':8 | 2':8 7:4 2':4",
      },
    },
    {
      title: 'Aurora Drift', style: 'half-time future bass: pumping supersaw stabs, 808 slides, hat rolls',
      key: 59, scale: AEOLIAN, bpm: 150, trim: [1, 1, 1, 1], pump: 0.6,
      lead: ['saw', 'soft'], comp: ['stab', 'chord', 'x__x__x_..x_x_..'], arp: ['crystal', '..4...3...5...3.'],
      pad: 'sawpad', bass: ['b808', 'r_____....S_r_..'],
      drums: {
        menu: { hat: 'o...o...o...o...' },
        play: { kick: 'x.....x...x.....', snare: '........x.......', clap: '........o.......', hat: 'x.x.x.x.x.x.xrx.' },
        intense: { kick: 'x..x..x...x..x..', snare: '........x.......', clap: '........x.......', hat: 'xxxxxxrxxxxxxRxr', open: '....o.......o...' },
      },
      fill: 'snare',
      A: {
        chords: '1a 6a 3 7 1a 6a 3a 7s',
        mel: "-:4 5:4 2':6 1':2 | 3':8 -:2 1':2 7:4 | -:4 5:4 7:6 5:2 | 2':8 -:2 7:2 4:4 | -:4 5:4 2':6 3':2 | 3':8 -:2 1':2 6:4 | 7:4 3':4 4':6 3':2 | 4':6 3':6 -:4",
      },
      B: {
        chords: '4 6 1 7 4 6 7 7',
        mel: "6:3 1':3 4':2 6':8 | 3':3 1':3 6:2 3':8 | 5':3 3':3 1':2 5:8 | 7:3 2':3 4':2 2':8 | 6':3 4':3 1':2 6:8 | 1':3 3':3 6':2 3':8 | 2':6 4':2 7':8 | 4':4 2':4 7:6 -:2",
      },
    },
    {
      title: 'Whiteout Run', style: 'dorian drum-and-bass: reese bass, two-bar break, plucks, saw lead',
      key: 57, scale: DORIAN, bpm: 174, trim: [1, 1, 1, 1], pump: 0.4,
      lead: ['saw', 'violin'], comp: ['pluck', 'chord', 'x..x..x...x..x..'], arp: ['crystal', '0.3.4.3.0.3.4.3.'],
      pad: 'air', bass: ['reese', 'r_________r_____', 'r_____r___r___R_'],
      drums: {
        menu: { hat: 'x...o...x...o...' },
        play: { kick: 'x.........x.....x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
        intense: { kick: 'x.....x...x.....x..x......x..x..', snare: '....x.......x.......x..o.o..x...', hat: 'xoxoxoxoxoxoxoxo', ride: 'x...x...x...x...' },
      },
      fill: 'tom',
      A: {
        chords: '17 17 4 4 17 17 3 4',
        mel: "-:2 5:2 7:2 1':4 7:2 5:4 | 3':6 1':2 7:8 | -:2 6:2 1':2 4':4 1':2 6:4 | 6':6 4':2 1':8 | -:2 5:2 7:2 1':4 3':2 5':4 | 7':6 5':2 3':8 | 5':3 3':3 7:2 5:8 | 6:3 1':3 4':2 6':6 -:2",
      },
      B: {
        chords: '3 3 4 4 2 2 4 5',
        mel: "3':6 5':6 7':4 | 5':10 3':2 7:4 | 4':6 6':6 1'':4 | 6':10 4':2 1':4 | 2':6 4':6 6':4 | 4':10 2':2 6:4 | 1':3 4':3 6':2 4':4 1':4 | 2':6 7:2 5:8",
      },
    },
  ],
};
