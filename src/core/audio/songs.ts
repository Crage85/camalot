import type { MusicTrack } from '../contract';
import type { DrumName, InstName } from './synth';

// The seven themes. Each is 32 bars of 4/4 in the form A A B A (A and B are 8 bars each).
//
// Melody notation, one bar between each "|", 16 sixteenths per bar:
//   a number is a scale degree (1 = the key note); ' raises it an octave, , lowers it; - is a rest;
//   :n is the length in sixteenths (default 2, an eighth note).
// Chords are one scale degree per bar (the triad built on it); "2/5" splits the bar in half.
// compile() in music.ts checks that every bar adds up to 16.

export type CompStyle = 'arp' | 'off' | 'calypso' | 'pulse' | 'broken';
export type BassStyle = 'root5' | 'bounce' | 'eight' | 'long';
type Kit = Partial<Record<DrumName, string>>;

export interface Section {
  chords: string;
  mel: string;
}

export interface Theme {
  key: number; // MIDI note of degree 1
  scale: number[];
  bpm: number;
  swing: number; // 0 = straight, 0.67 = triplet shuffle
  trim: number; // loudness trim so all themes sit level
  lead: [InstName, InstName];
  comp: [InstName, CompStyle];
  pad: InstName;
  bass: [InstName, BassStyle];
  drums: { menu: Kit; play: Kit; intense: Kit };
  fill: DrumName;
  A: Section;
  B: Section;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

export const THEMES: Record<MusicTrack, Theme> = {
  // Castle court: D major, bells and flute over harp.
  hub: {
    key: 62, scale: MAJOR, bpm: 104, swing: 0, trim: 1,
    lead: ['bell', 'flute'], comp: ['harp', 'arp'], pad: 'pad', bass: ['bass', 'long'],
    drums: {
      menu: { tamb: '....o.......o...' },
      play: { soft: 'x.......x.o.....', tamb: '....x.o.....x.o.', shaker: 'o.o.o.o.o.o.o.o.' },
      intense: { soft: 'x..o..x.x..o..x.', tamb: '..o.x.o...o.x.o.', shaker: 'xoxoxoxoxoxoxoxo', rim: '....x.......x...' },
    },
    fill: 'tom',
    A: {
      chords: '1 5 6 4 1 5 4/5 1',
      mel: "1:4 3:4 5:4 3 5 | 6:4 5:4 2:8 | 6,:4 1:4 3:4 1 3 | 4:4 3:4 1:8 | 1:4 3:4 5:4 3 5 | 6:4 5:4 2':8 | 1':4 6:4 7:4 2':4 | 1':12 -:4",
    },
    B: {
      chords: '4 1 4 5 6 4 2/5 5',
      mel: "6 1' 6 4 6:4 4:4 | 5 1' 5 3 5:4 3:4 | 6 1' 6 4 6:4 1':4 | 2' 1' 7 5 7:8 | 3':4 1':4 6:4 1':4 | 1':4 6:4 4:4 6:4 | 4:4 2:4 5:4 7:4 | 2':8 5:4 -:4",
    },
  },
  // Gem Wyrm: C lydian (the raised 4th is the "magic" colour), bouncing bells and harp.
  wyrm: {
    key: 60, scale: LYDIAN, bpm: 124, swing: 0, trim: 1,
    lead: ['bell', 'flute'], comp: ['harp', 'arp'], pad: 'pad', bass: ['bass', 'bounce'],
    drums: {
      menu: { shaker: 'o.o.o.o.o.o.o.o.', wood: '......o.......o.' },
      play: { kick: 'x.....x...x.....', rim: '....x.......x...', shaker: 'x.o.x.o.x.o.x.o.', wood: '..........o..o..' },
      intense: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', shaker: 'xoxoxoxoxoxoxoxo', wood: '..o...o...o..o..' },
    },
    fill: 'tom',
    A: {
      chords: '1 2 1 2 6 3 2 1',
      mel: "5 5 3 5 - 1' - 5 | 6 6 4 6 - 2' - 6 | 5 5 3 5 - 1' 2' 3' | 2':4 6:4 4:8 | 3' 3' 1' 3' - 6 - 1' | 7 7 5 7 - 3 - 5 | 2' 1' 7 6 4:4 6:4 | 5:4 3:4 1:6 -:2",
    },
    B: {
      chords: '6 6 2 2 6 3 2 5',
      mel: "6:6 1':6 3':4 | 3':4 2' 1' 6:8 | 6:6 2':6 4':4 | 4':4 3' 2' 6:8 | 6:6 1':6 3':4 | 7:4 5:4 3:8 | 4 6 2' 6 4 6 2' 4' | 2':4 7:4 5:4 -:4",
    },
  },
  // Munch Hollow: F major calypso, steel drum for the beach, bells for the snow, rubbery bass.
  hole: {
    key: 65, scale: MAJOR, bpm: 112, swing: 0, trim: 1,
    lead: ['steel', 'bell'], comp: ['pluck', 'calypso'], pad: 'pad', bass: ['synbass', 'bounce'],
    drums: {
      menu: { shaker: 'o.o.o.o.o.o.o.o.', wood: '...o..o.....o...' },
      play: { kick: 'x.......x.....o.', rim: '....x.......x...', shaker: 'x.oox.oox.oox.oo', wood: '...o..o....o..o.' },
      intense: { kick: 'x..o..x.x..o..x.', clap: '....x.......x...', shaker: 'xoxoxoxoxoxoxoxo', wood: '...x..x....x..x.', hat: '..x...x...x...x.' },
    },
    fill: 'tom',
    A: {
      chords: '1 4 1 5 1 4 2/5 1',
      mel: "1:3 3:3 5 - 5 3:4 | 4:3 6:3 1' - 1' 6:4 | 5:3 3:3 1 - 3 5:4 | 2:3 5:3 7 - 2' 7:4 | 1:3 3:3 5 - 5 3:4 | 4:3 6:3 1' - 1' 6:4 | 6 4 2 4 7 5 7 2' | 1':6 - 1' -:6",
    },
    B: {
      chords: '4 1 4 1 2 6 4 5',
      mel: "6:4 1':4 6 4 6:4 | 5:4 1':4 5 3 5:4 | 6:4 1':4 6 4 6:4 | 5 3 1 3 5:8 | 2:4 4:4 6:4 4:4 | 3:4 6:4 1':4 6:4 | 4 6 1' 6 4 6 1' 2' | 2':4 7:4 5:6 -",
    },
  },
  // Kitty Harvest: G major shuffle, marimba and whistle over plucked strings and a boom-chick bass.
  tractor: {
    key: 67, scale: MAJOR, bpm: 108, swing: 0.67, trim: 1,
    lead: ['marimba', 'whistle'], comp: ['pluck', 'off'], pad: 'pad', bass: ['upright', 'root5'],
    drums: {
      menu: { brush: '....o.......o...', wood: '..o.......o.....' },
      play: { kick: 'x.......x.......', brush: '....x.o.....x.o.', shaker: 'o.o.o.o.o.o.o.o.', wood: '......o.......o.' },
      intense: { kick: 'x.....o.x.....o.', snare: '....x.......x...', brush: '..o...o...o...o.', shaker: 'x.o.x.o.x.o.x.o.', wood: '..x...x...x...x.' },
    },
    fill: 'snare',
    A: {
      chords: '1 1 4 1 1 6 2/5 1',
      mel: "5, 1 2 3 5:4 3:4 | 5 6 5 3 1:4 -:4 | 6 6 5 6 1':4 6:4 | 5 3 2 3 1:8 | 5, 1 2 3 5:4 3:4 | 6 5 3 5 6:4 1':4 | 6 4 2 4 5 7 2' 7 | 1':4 5:4 1:6 -",
    },
    B: {
      chords: '4 1 4 1 4 1 2 5',
      mel: "1':4 6:4 1' 6 4:4 | 5:4 3:4 5 3 1:4 | 1':4 6:4 1' 6 1':4 | 3' 2' 1' 6 5:8 | 4:4 6:4 1':4 6:4 | 3:4 5:4 1':4 5:4 | 6 1' 6 4 2:4 4:4 | 5:4 7:4 2':4 -:4",
    },
  },
  // Whisker Castle: A major, music box over harp and pizzicato strings.
  match3: {
    key: 57, scale: MAJOR, bpm: 100, swing: 0, trim: 1,
    lead: ['musicbox', 'flute'], comp: ['harp', 'arp'], pad: 'pad', bass: ['bass', 'long'],
    drums: {
      menu: { shaker: '....o.......o...' },
      play: { soft: 'x.........o.....', rim: '....x.......x...', shaker: 'o.o.o.o.o.o.o.o.', tamb: '............o...' },
      intense: { kick: 'x.....x.x.....x.', rim: '....x.......x..o', shaker: 'xoxoxoxoxoxoxoxo', tamb: '....x.......x...' },
    },
    fill: 'tom',
    A: {
      chords: '1 6 4 5 1 6 2/5 1',
      mel: "3:6 5 1':4 5:4 | 3:6 6 1':4 6:4 | 4:6 6 1':4 6:4 | 7:4 2':4 5:8 | 3:6 5 1':4 3':4 | 3':6 1' 6:4 1':4 | 4 6 2' 6 5 7 2' 7 | 1':12 -:4",
    },
    B: {
      chords: '4 5 3 6 4 5 1 5',
      mel: "6 1' 6 4 6:8 | 7 2' 7 5 7:8 | 5 7 5 3 5:8 | 6 1' 6 3 6:8 | 1':4 6:4 4:4 6:4 | 2':4 7:4 5:4 7:4 | 3':4 1':4 5:4 3:4 | 2:4 5:4 7:4 -:4",
    },
  },
  // Kitty Cup Run: Bb major stadium march, bright brass and claps.
  runner: {
    key: 58, scale: MAJOR, bpm: 138, swing: 0, trim: 1,
    lead: ['brass', 'synth'], comp: ['pluck', 'pulse'], pad: 'pad', bass: ['synbass', 'eight'],
    drums: {
      menu: { kick: 'x.......x.......', clap: '....o.......o...', hat: 'o.o.o.o.o.o.o.o.' },
      play: { kick: 'x.....x.x.......', snare: '....x.......x...', clap: '....x.......x.x.', hat: 'x.o.x.o.x.o.x.o.' },
      intense: { kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x..x....x.x.', hat: 'xoxoxoxoxoxoxoxo', open: '..x...x...x...x.' },
    },
    fill: 'snare',
    A: {
      chords: '1 5 6 4 1 5 4/5 1',
      mel: "1:3 1:1 3 5 - 5 1':4 | 2':3 2':1 7 5 - 5 7:4 | 1':3 1':1 6 3 - 3 6:4 | 4 6 1' 6 4:4 -:4 | 1:3 1:1 3 5 - 5 1':4 | 2':3 2':1 7 5 - 5 7:4 | 6 4 6 1' 2' 7 2' 5' | 3':3 3':1 1':4 - 1' -:4",
    },
    B: {
      chords: '4 1 4 5 6 4 2 5',
      mel: "6:4 6 4 6:4 1':4 | 5:4 5 3 5:4 1':4 | 6:4 6 4 6:4 1':4 | 2':4 1' 7 5:8 | 3':4 1':4 6:4 1':4 | 1':4 6:4 4:4 6:4 | 2 4 6 4 2 4 6 2' | 2' 2' 2' 2' 7 2' 5':4",
    },
  },
  // Powder Trails: E major, glassy bells and pads, sleigh bells keeping time.
  trail: {
    key: 64, scale: MAJOR, bpm: 132, swing: 0, trim: 1,
    lead: ['glass', 'whistle'], comp: ['pluck', 'arp'], pad: 'glasspad', bass: ['bass', 'root5'],
    drums: {
      menu: { sleigh: 'o...o...o...o...' },
      play: { kick: 'x.........x.....', rim: '....x.......x...', sleigh: 'x.o.x.o.x.o.x.o.' },
      intense: { kick: 'x.....x.x.....x.', snare: '....x.......x...', sleigh: 'x.oox.oox.oox.oo', hat: '..x...x...x...x.' },
    },
    fill: 'tom',
    A: {
      chords: '1 3 4 5 1 3 4/5 1',
      mel: "5:6 3 5:4 1':4 | 7:6 5 7:4 3':4 | 1':4 6 1' 6:4 4:4 | 5 7 2' 7 5:8 | 5:6 3 5:4 1':4 | 7:6 5 7:4 3':4 | 1' 6 4 6 5 7 2' 4' | 3':8 1':4 -:4",
    },
    B: {
      chords: '6 4 1 5 6 4 2 5',
      mel: "6 1' 3' 1' 6:4 3:4 | 6 1' 4' 1' 6:4 4:4 | 5 1' 3' 1' 5:4 3:4 | 5 7 2' 7 2':8 | 3':6 1' 6:8 | 1':6 6 4:8 | 2 4 6 2' 6 4 6 2' | 2':4 7:4 5:4 7:4",
    },
  },
};
