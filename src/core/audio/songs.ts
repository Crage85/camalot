import type { MusicTrack } from '../contract';
import type { DrumName, InstName } from './synth';

// The songbook: three songs for the hub and for each game. A game's songs share its instruments and
// feel but differ in key, tempo, groove, and tune. The player (music.ts) rotates through them.
// Each song is 32 bars of 4/4 in the form A A B A (A and B are 8 bars each).
//
// Melody notation, one bar between each "|", 16 sixteenths per bar:
//   a number is a scale degree (1 = the key note); ' raises it an octave, , lowers it; - is a rest;
//   :n is the length in sixteenths (default 2, an eighth note).
// Chords are one scale degree per bar (the triad built on it); "2/5" splits the bar in half.
// compile() in music.ts checks that every bar adds up to 16.

export type CompStyle = 'arp' | 'off' | 'calypso' | 'pulse' | 'broken' | 'chord';
export type BassStyle = 'root5' | 'bounce' | 'eight' | 'long' | 'walk';
type Kit = Partial<Record<DrumName, string>>;

export interface Section {
  chords: string;
  mel: string;
}

export interface Theme {
  title: string;
  key: number; // MIDI note of degree 1
  scale: number[];
  bpm: number;
  swing: number; // 0 = straight, 0.67 = triplet shuffle
  trim: number; // loudness trim so all songs sit level (set from shots/audio/report.txt)
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
const MIXO = [0, 2, 4, 5, 7, 9, 10];

export const SONGS: Record<MusicTrack, Theme[]> = {
  hub: [
    // Castle court: D major, bells and flute over harp.
    {
      title: 'Castle Court', key: 62, scale: MAJOR, bpm: 104, swing: 0, trim: 1.04,
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
    // Banner Day: G major court march, flute and bells over plucked strings.
    {
      title: 'Banner Day', key: 55, scale: MAJOR, bpm: 116, swing: 0, trim: 1.26,
      lead: ['flute', 'bell'], comp: ['pizz', 'chord'], pad: 'pad', bass: ['bass', 'root5'],
      drums: {
        menu: { tamb: '....o.......o...', soft: 'x.......o.......' },
        play: { soft: 'x.......x.......', rim: '....x.......x.x.', tamb: 'o.o.o.o.o.o.o.o.' },
        intense: { kick: 'x.......x.....o.', snare: '....x..o....x.oo', tamb: 'xoxoxoxoxoxoxoxo', rim: '..x...x...x...x.' },
      },
      fill: 'snare',
      A: {
        chords: '1 1 4 5 1 6 2/5 1',
        mel: "5:3 5:1 1':4 5:4 3:4 | 5:3 5:1 3':4 1':8 | 6:3 6:1 1':4 6:4 4:4 | 5 7 2' 7 5:8 | 5:3 5:1 1':4 5:4 3:4 | 6:3 6:1 3':4 1':4 6:4 | 4':4 2':4 7:4 2':4 | 1':12 -:4",
      },
      B: {
        chords: '4 1 5 1 4 1 2 5',
        mel: "6 1' 4' 1' 6:4 1':4 | 5 1' 3' 1' 5:4 3:4 | 7 2' 5' 2' 7:4 5:4 | 3':4 1' 2' 1':8 | 4':4 1':4 6:4 1':4 | 3':4 1':4 5:4 1':4 | 2' 4' 2' 6 4:4 6:4 | 7:4 2':4 5:4 -:4",
      },
    },
    // Minstrel's Jig: Bb major shuffle, a harp tune with a skipping bass.
    {
      title: "Minstrel's Jig", key: 58, scale: MAJOR, bpm: 96, swing: 0.67, trim: 1.13,
      lead: ['harp', 'flute'], comp: ['pizz', 'off'], pad: 'pad', bass: ['bass', 'bounce'],
      drums: {
        menu: { tamb: 'o...o...o...o...' },
        play: { soft: 'x.....x.x.......', tamb: '....x.o.....x.o.', wood: '..o...o...o...o.' },
        intense: { soft: 'x.....x.x.....x.', rim: '....x.......x...', tamb: 'x.o.x.o.x.o.x.o.', wood: '..x...x...x...x.', shaker: 'o.o.o.o.o.o.o.o.' },
      },
      fill: 'tom',
      A: {
        chords: '1 4 1 5 6 4 5 1',
        mel: "1' 5 3 5 1':4 3':4 | 4' 1' 6 1' 4':4 1':4 | 3' 1' 5 1' 3' 5' 3':4 | 2':4 7 5 2:8 | 1' 6 3 6 1':4 3':4 | 4' 1' 6 1' 4' 6' 4':4 | 2' 7 5 7 2' 4' 7:4 | 1':6 5 1:4 -:4",
      },
      B: {
        chords: '6 3 4 1 6 3 2 5',
        mel: "6:6 1' 3':8 | 5:6 7 3':8 | 4:6 6 1':8 | 3' 1' 5 1' 3:8 | 6:6 1' 3':4 1':4 | 7:6 5 3:4 5:4 | 2 4 6 2' 6 4 6 2' | 2':4 7:4 5:4 -:4",
      },
    },
  ],
  wyrm: [
    // Gem Wyrm: C lydian (the raised 4th is the "magic" colour), bouncing bells and harp.
    {
      title: 'Gem Wyrm', key: 60, scale: LYDIAN, bpm: 124, swing: 0, trim: 0.98,
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
    // Gem Chase: D mixolydian (the flat 7th is the "adventure" colour), a driving pulse with the kick on every beat.
    {
      title: 'Gem Chase', key: 62, scale: MIXO, bpm: 132, swing: 0, trim: 0.86,
      lead: ['flute', 'bell'], comp: ['harp', 'pulse'], pad: 'pad', bass: ['bass', 'eight'],
      drums: {
        menu: { shaker: 'o.o.o.o.o.o.o.o.', rim: '....o.......o...' },
        play: { kick: 'x...x...x...x...', shaker: '..x...x...x...x.', wood: '...o..o....o..o.', rim: '....x.......x...' },
        intense: { kick: 'x...x...x...x...', snare: '....x.......x...', shaker: 'xoxoxoxoxoxoxoxo', wood: '..o..o....o..o..', hat: '..x...x...x...x.' },
      },
      fill: 'tom',
      A: {
        chords: '1 7 4 1 1 7 4 1',
        mel: "1:3 3:3 5 1':4 5:4 | 7:3 2':3 4' 2':4 7:4 | 6:3 1':3 4' 1':4 6:4 | 5 3 5 1' 5:8 | 1:3 3:3 5 1':4 3':4 | 4':3 2':3 7 2':4 4':4 | 4' 1' 6 1' 4' 1' 6 4 | 3:4 5:4 1':6 -:2",
      },
      B: {
        chords: '4 1 7 1 4 1 7 5',
        mel: "6:4 1':4 4':8 | 5:4 1':4 3':8 | 4':4 2':4 7:8 | 1' 3' 1' 5 3:8 | 6 1' 4' 1' 6 1' 4' 6' | 5 1' 3' 1' 5 1' 3' 5' | 4':6 2':6 7:4 | 2':4 7:4 5:4 -:4",
      },
    },
    // Treasure Dance: A major, an off-beat tune over a latin harp and rim-click groove.
    {
      title: 'Treasure Dance', key: 57, scale: MAJOR, bpm: 116, swing: 0, trim: 1.1,
      lead: ['bell', 'flute'], comp: ['harp', 'calypso'], pad: 'pad', bass: ['synbass', 'root5'],
      drums: {
        menu: { wood: '...o..o.....o...', shaker: '....o.......o...' },
        play: { kick: 'x.......x.x.....', rim: '...x..x....x..x.', shaker: 'o.o.o.o.o.o.o.o.', tamb: '....x.......x...' },
        intense: { kick: 'x..x..x.x..x..x.', clap: '....x.......x...', shaker: 'xoxoxoxoxoxoxoxo', rim: '...x..x....x..x.', tamb: '..o...o...o...o.' },
      },
      fill: 'tom',
      A: {
        chords: '1 6 2 5 1 6 2/5 1',
        mel: "- 3 5 1' 3':4 1':4 | - 3 6 1' 3':4 1':4 | - 4 6 2' 4':4 2':4 | 2' 7 5 7 2':8 | - 3 5 1' 3':4 5':4 | - 3' 1' 6 3':4 1':4 | 4' 2' 6 2' 7 2' 5 7 | 1':4 3':4 1':6 -:2",
      },
      B: {
        chords: '4 4 1 1 2 2 5 5',
        mel: "6:6 4:2 1':8 | 1' 6 4 6 1':4 4':4 | 5:6 3:2 1':8 | 1' 5 3 5 1':4 3':4 | 6:6 4:2 2':8 | 2' 6 4 6 2':4 4':4 | 7:4 2':4 5':4 2':4 | 7 2' 7 5 7:4 -:4",
      },
    },
  ],
  hole: [
    // Munch Hollow: F major calypso, steel drum for the beach, bells for the snow, rubbery bass.
    {
      title: 'Munch Hollow', key: 65, scale: MAJOR, bpm: 112, swing: 0, trim: 1.04,
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
    // Snow Scoop: C major, bells up front, off-beat plucks, the kick on every beat.
    {
      title: 'Snow Scoop', key: 60, scale: MAJOR, bpm: 126, swing: 0, trim: 1.08,
      lead: ['bell', 'steel'], comp: ['pluck', 'off'], pad: 'pad', bass: ['synbass', 'root5'],
      drums: {
        menu: { shaker: 'o.o.o.o.o.o.o.o.', rim: '....o.......o...' },
        play: { kick: 'x...x...x...x...', hat: '..x...x...x...x.', rim: '....x.......x...', wood: '.......o.......o' },
        intense: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.', shaker: 'xoxoxoxoxoxoxoxo', wood: '...x...o...x...o' },
      },
      fill: 'tom',
      A: {
        chords: '1 1 4 5 1 1 4/5 1',
        mel: "3 3 - 3 5:4 1':4 | 1' 1' - 1' 5:4 3:4 | 4 4 - 4 6:4 1':4 | 2' 2' - 2' 7:4 5:4 | 3 3 - 3 5:4 1':4 | 3' 3' - 3' 1':4 5:4 | 6 1' 4' 1' 7 2' 5' 2' | 3':4 1':4 1:4 -:4",
      },
      B: {
        chords: '6 6 4 4 2 2 5 5',
        mel: "6:4 1':4 3':4 1':4 | 3' 1' 6 1' 3':8 | 4:4 6:4 1':4 6:4 | 1' 6 4 6 1':8 | 2:4 4:4 6:4 4:4 | 6 4 2 4 6:4 2':4 | 7 2' 5' 2' 7 2' 5' 2' | 5':4 2':4 7:4 -:4",
      },
    },
    // Big Gulp Boogie: G major shuffle, a steel drum riff over a walking rubber bass.
    {
      title: 'Big Gulp Boogie', key: 67, scale: MAJOR, bpm: 104, swing: 0.67, trim: 1.23,
      lead: ['steel', 'marimba'], comp: ['pluck', 'chord'], pad: 'pad', bass: ['synbass', 'walk'],
      drums: {
        menu: { brush: '....o.......o...', wood: '..o.......o.....' },
        play: { kick: 'x.......x.......', clap: '....x.......x...', shaker: 'o.o.o.o.o.o.o.o.', wood: '......o.......o.' },
        intense: { kick: 'x.....o.x.....o.', clap: '....x.......x...', snare: '....o.......o.o.', shaker: 'x.o.x.o.x.o.x.o.', wood: '..x...x...x...x.' },
      },
      fill: 'snare',
      A: {
        chords: '1 1 4 4 1 1 5 1',
        mel: "1 3 5 6 5:4 3:4 | 1 3 5 6 1':4 5:4 | 4 6 1' 2' 1':4 6:4 | 4 6 1' 2' 4':4 1':4 | 1 3 5 6 5:4 3:4 | 3' 1' 5 3 1':8 | 2' 7 5 7 2':4 5:4 | 1' - 1' - 1':4 -:4",
      },
      B: {
        chords: '4 1 4 1 2 2 5 5',
        mel: "6:6 6:2 4:4 6:4 | 5:6 5:2 3:4 5:4 | 1':6 1':2 6:4 1':4 | 3':6 3':2 1':8 | 2 4 6 4 2':4 6:4 | 4' 2' 6 2' 4:8 | 5 7 2' 7 5 7 2' 5' | 2':4 2':4 2':4 -:4",
      },
    },
  ],
  tractor: [
    // Kitty Harvest: G major shuffle, marimba and whistle over plucked strings and a boom-chick bass.
    {
      title: 'Kitty Harvest', key: 67, scale: MAJOR, bpm: 108, swing: 0.67, trim: 0.94,
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
    // Hayride Hoedown: D major, a fast straight fiddle-style tune on whistle with a two-beat bass.
    {
      title: 'Hayride Hoedown', key: 62, scale: MAJOR, bpm: 126, swing: 0, trim: 0.8,
      lead: ['whistle', 'marimba'], comp: ['pluck', 'pulse'], pad: 'pad', bass: ['upright', 'root5'],
      drums: {
        menu: { brush: '....o.......o...', shaker: 'o.o.o.o.o.o.o.o.' },
        play: { kick: 'x.......x.......', brush: '....x..o....x..o', shaker: 'o.o.o.o.o.o.o.o.', wood: '..o...o...o...o.' },
        intense: { kick: 'x.......x.....o.', snare: '....x.......x...', brush: '..o.x.o...o.x.o.', shaker: 'xoxoxoxoxoxoxoxo', wood: '..x...x...x...x.' },
      },
      fill: 'snare',
      A: {
        chords: '1 1 4 1 1 1 5 1',
        mel: "5 3 1 3 5 3 1' 5 | 3':4 1':4 5 3 5:4 | 6 4 1 4 6 4 1' 6 | 5:4 3:4 1:8 | 5 3 1 3 5 3 1' 5 | 3' 1' 5 1' 3' 5 1':4 | 2' 7 5 7 2' 7 5 2 | 1:4 3:4 1:6 -",
      },
      B: {
        chords: '4 1 5 1 4 1 2/5 5',
        mel: "1':4 1' 6 4:4 6:4 | 5:4 5 3 1:4 3:4 | 2':4 2' 7 5:4 7:4 | 1' 5 3 5 1':8 | 6 1' 6 4 6 1' 4':4 | 5 1' 5 3 5 1' 3':4 | 2 4 6 4 5 7 2' 7 | 2':4 7:4 5:4 -:4",
      },
    },
    // Sunny Rows: C major, a slow easy tune with long notes over a walking bass.
    {
      title: 'Sunny Rows', key: 60, scale: MAJOR, bpm: 92, swing: 0, trim: 0.75,
      lead: ['marimba', 'whistle'], comp: ['pizz', 'calypso'], pad: 'pad', bass: ['upright', 'walk'],
      drums: {
        menu: { shaker: 'o.o.o.o.o.o.o.o.' },
        play: { kick: 'x.........x.....', rim: '....x.......x...', shaker: 'x.oox.oox.oox.oo', wood: '...o..o....o....' },
        intense: { kick: 'x..o..x.x..o..x.', snare: '....x.......x...', shaker: 'xoxoxoxoxoxoxoxo', wood: '...x..x....x..x.', brush: '..o...o...o...o.' },
      },
      fill: 'tom',
      A: {
        chords: '1 6 4 5 1 6 4/5 1',
        mel: "1':6 5:2 3:8 | 6:6 3:2 1:8 | 4:6 6:2 1':4 6:4 | 7:4 5:4 2:8 | 1':6 5:2 3:8 | 6 1' 3' 1' 6:8 | 4 6 1' 6 7 5 2' 7 | 1':10 -:6",
      },
      B: {
        chords: '2 5 1 6 2 5 1 5',
        mel: "2 4 6 4 2':4 6:4 | 7 5 2 5 7:8 | 1 3 5 3 1':4 5:4 | 3' 1' 6 3 6:8 | 4:4 6:4 2':4 4':4 | 2':4 7:4 5:4 7:4 | 3' 1' 5 1' 3' 1' 5 3 | 2:4 5:4 7:4 -:4",
      },
    },
  ],
  match3: [
    // Whisker Castle: A major, music box over harp and pizzicato strings.
    {
      title: 'Whisker Castle', key: 57, scale: MAJOR, bpm: 100, swing: 0, trim: 1.02,
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
    // Paw Parade: G major, a skipping music-box tune over plucked strings and a bouncing bass.
    {
      title: 'Paw Parade', key: 55, scale: MAJOR, bpm: 116, swing: 0, trim: 1.08,
      lead: ['musicbox', 'flute'], comp: ['pizz', 'off'], pad: 'pad', bass: ['bass', 'bounce'],
      drums: {
        menu: { shaker: 'o...o...o...o...' },
        play: { soft: 'x.......x.......', rim: '....x.......x.o.', shaker: 'o.o.o.o.o.o.o.o.', tamb: '..o...o...o...o.' },
        intense: { kick: 'x.....x.x.....x.', clap: '....x.......x...', shaker: 'xoxoxoxoxoxoxoxo', tamb: '..x...x...x...x.', rim: '.......o.......o' },
      },
      fill: 'tom',
      A: {
        chords: '1 4 1 5 1 4 5 1',
        mel: "5:3 5:1 1' 5 3':4 1':4 | 6:3 6:1 1' 6 4':4 1':4 | 5:3 5:1 1' 3' 5':4 3':4 | 2':4 7:4 5:8 | 5:3 5:1 1' 5 3':4 1':4 | 4':3 4':1 1' 6 4:4 6:4 | 7 2' 5' 2' 7:4 2':4 | 1':4 5:4 1':4 -:4",
      },
      B: {
        chords: '6 2 5 1 6 2 4 5',
        mel: "3':4 1':4 6:8 | 4':4 2':4 6:8 | 5 7 2' 7 5:8 | 3 5 1' 5 3':8 | 6 1' 3' 1' 6 1' 3':4 | 2' 4' 2' 6 4:8 | 4:4 6:4 1':4 4':4 | 2':6 7:2 5:4 -:4",
      },
    },
    // Starlight Tower: D major, a slow swaying lullaby, flute over a falling harp line.
    {
      title: 'Starlight Tower', key: 62, scale: MAJOR, bpm: 88, swing: 0.67, trim: 1.08,
      lead: ['flute', 'musicbox'], comp: ['harp', 'broken'], pad: 'pad', bass: ['bass', 'long'],
      drums: {
        menu: { shaker: '....o.......o...' },
        play: { soft: 'x.........o.....', shaker: 'o.o.o.o.o.o.o.o.', tamb: '....o.......o...' },
        intense: { soft: 'x.....o.x.....o.', rim: '....x.......x...', shaker: 'x.o.x.o.x.o.x.o.', tamb: '..o...o...o...o.' },
      },
      fill: 'tom',
      A: {
        chords: '1 5 6 3 4 1 4/5 1',
        mel: "3':6 2':2 1':8 | 2':6 1':2 7:8 | 1':6 7:2 6:8 | 7:6 6:2 5:8 | 6 1' 4 6 1':4 6:4 | 5 1' 3 5 1':4 3':4 | 4':4 1':4 2':4 7:4 | 1':12 -:4",
      },
      B: {
        chords: '4 5 6 6 4 5 1 5',
        mel: "6 4 6 1' 4':8 | 7 5 7 2' 7:8 | 1' 6 1' 3' 1':8 | 3':4 1':4 6:8 | 6 4 6 1' 4':8 | 2' 7 5 7 2':8 | 3':4 1':4 5:4 3:4 | 5:4 7:4 2':4 -:4",
      },
    },
  ],
  runner: [
    // Kitty Cup Run: Bb major stadium march, bright brass and claps.
    {
      title: 'Kitty Cup Run', key: 58, scale: MAJOR, bpm: 138, swing: 0, trim: 0.84,
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
    // Golden Goal: C major dance anthem, synth lead, off-beat plucks, the kick on every beat.
    {
      title: 'Golden Goal', key: 60, scale: MAJOR, bpm: 128, swing: 0, trim: 0.98,
      lead: ['synth', 'brass'], comp: ['pluck', 'off'], pad: 'pad', bass: ['synbass', 'bounce'],
      drums: {
        menu: { kick: 'x.......x.......', hat: '..o...o...o...o.', clap: '............o...' },
        play: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'o.o.o.o.o.o.o.o.' },
        intense: { kick: 'x...x...x...x...', snare: '....x.......x..o', clap: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.', open: '..............x.' },
      },
      fill: 'snare',
      A: {
        chords: '4 5 1 6 4 5 1 1',
        mel: "6:3 6:3 1' 4':3 1':3 6 | 7:3 7:3 2' 5':3 2':3 7 | 1':3 1':3 3' 5':3 3':3 1' | 3':4 1':4 6:8 | 6:3 6:3 1' 4':3 1':3 6 | 7:3 7:3 2' 5':3 2':3 7 | 3' 1' 5 1' 3' 5' 3' 1' | 1':4 - 1' 1':4 -:4",
      },
      B: {
        chords: '6 6 4 4 1 1 5 5',
        mel: "6:4 6 1' 3':4 1':4 | 6:4 6 1' 3':8 | 4:4 4 6 1':4 6:4 | 4:4 4 6 1':8 | 5:4 5 1' 3':4 1':4 | 5:4 5 1' 5':8 | 2' 2' 7 7 5 5 7 7 | 2' 2' 2' 2' 5':4 -:4",
      },
    },
    // Kickoff Stomp: F major shuffle, a stomp-stomp-clap beat under a brass chant.
    {
      title: 'Kickoff Stomp', key: 65, scale: MAJOR, bpm: 118, swing: 0.67, trim: 1.15,
      lead: ['brass', 'synth'], comp: ['pluck', 'chord'], pad: 'pad', bass: ['synbass', 'root5'],
      drums: {
        menu: { kick: 'x.x.....x.x.....', clap: '....o.......o...' },
        play: { kick: 'x.x.....x.x.....', clap: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', tom: '..............o.' },
        intense: { kick: 'x.x.....x.x.....', clap: '....x.......x...', snare: '....x.......x.o.', hat: 'x.o.x.o.x.o.x.o.', open: '......x.......x.' },
      },
      fill: 'tom',
      A: {
        chords: '1 4 1 5 1 4 5 1',
        mel: "1:4 3 5 1':4 5:4 | 6:4 6 1' 4':4 1':4 | 5:4 3' 1' 5:4 3:4 | 2:4 5 7 2':8 | 1:4 3 5 1':4 3':4 | 4':4 1' 6 4:4 6:4 | 5 7 2' 7 5':4 2':4 | 1':6 1':2 1':4 -:4",
      },
      B: {
        chords: '6 4 1 5 6 4 2 5',
        mel: "3' 3' 1' 6 3':8 | 1' 1' 6 4 1':8 | 5 5 3 1 5:8 | 7 7 5 7 2':8 | 3' 3' 1' 6 3':4 6:4 | 1' 1' 6 4 1':4 4':4 | 2' 6 4 6 2' 6 4' 2' | 5':4 2':4 7:4 5:4",
      },
    },
  ],
  trail: [
    // Powder Trails: E major, glassy bells and pads, sleigh bells keeping time.
    {
      title: 'Powder Trails', key: 64, scale: MAJOR, bpm: 132, swing: 0, trim: 1.18,
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
    // Fresh Powder: A major, a gliding whistle tune with long notes, slower and wide open.
    {
      title: 'Fresh Powder', key: 57, scale: MAJOR, bpm: 116, swing: 0, trim: 1.02,
      lead: ['whistle', 'glass'], comp: ['harp', 'broken'], pad: 'glasspad', bass: ['bass', 'bounce'],
      drums: {
        menu: { sleigh: 'o.......o.......' },
        play: { kick: 'x.......x.......', rim: '....x.......x...', sleigh: 'o.o.o.o.o.o.o.o.' },
        intense: { kick: 'x.....x.x.....x.', snare: '....x.......x...', sleigh: 'x.o.x.o.x.o.x.o.', hat: '..o...o...o...o.' },
      },
      fill: 'tom',
      A: {
        chords: '1 4 6 5 1 4 5 1',
        mel: "1':6 5:2 3':8 | 1':6 6:2 4':8 | 3':6 1':2 6:4 1':4 | 7 2' 7 5 2':8 | 1':6 5:2 3':8 | 4' 1' 6 1' 4':4 6:4 | 5 7 2' 5' 2':4 7:4 | 1':12 -:4",
      },
      B: {
        chords: '2 5 1 6 2 5 4 5',
        mel: "4:4 6:4 2':4 6:4 | 5:4 7:4 2':4 7:4 | 3:4 5:4 1':4 5:4 | 6 1' 3' 1' 6:8 | 4' 2' 6 2' 4':4 2':4 | 2' 7 5 7 2':4 7:4 | 1' 6 4 6 1' 6 4' 1' | 2':8 7:4 -:4",
      },
    },
    // Downhill Dash: G major, the fastest one, running glass bells over a racing bass.
    {
      title: 'Downhill Dash', key: 55, scale: MAJOR, bpm: 144, swing: 0, trim: 0.9,
      lead: ['glass', 'bell'], comp: ['pluck', 'pulse'], pad: 'glasspad', bass: ['synbass', 'eight'],
      drums: {
        menu: { sleigh: 'o...o...o...o...', rim: '........o.......' },
        play: { kick: 'x...x...x...x...', rim: '....x.......x...', sleigh: 'x.oox.oox.oox.oo' },
        intense: { kick: 'x...x...x...x...', snare: '....x.......x...', sleigh: 'xoxoxoxoxoxoxoxo', hat: '..x...x...x...x.', open: '..............o.' },
      },
      fill: 'snare',
      A: {
        chords: '1 5 4 1 1 5 4/5 1',
        mel: "1' 5 3' 5 1' 5 3' 5 | 2' 5 7 5 2' 5 5':4 | 1' 4 6 4 1' 6 4':4 | 3':4 1':4 5:8 | 1' 5 3' 5 1' 5 3' 5 | 2' 5 7 5 2' 7 5':4 | 4' 1' 6 1' 5' 2' 7 2' | 1':4 3':4 1':4 -:4",
      },
      B: {
        chords: '6 4 1 5 6 4 5 5',
        mel: "6:8 3':8 | 4:8 1':8 | 5:8 3':8 | 2':4 7 5 7:8 | 6 1' 3' 1' 6 1' 3' 1' | 6 1' 4' 1' 6 1' 4' 1' | 7 2' 5' 2' 7 2' 5' 2' | 5':4 2':4 7:4 5:4",
      },
    },
  ],
};
