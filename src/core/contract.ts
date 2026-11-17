// The contract between the Camalot platform (src/core) and the games (src/games/*).
// Types only. The platform implements these; games code against them. Change this file only through the orchestrator.

export type GameId = 'wyrm' | 'hole' | 'tractor' | 'match3' | 'runner' | 'trail';
export type Grade = 6 | 8;
export type Subject = 'math' | 'spelling' | 'grammar' | 'history';

export interface Player {
  id: string;
  name: string; // typed in on the device at player creation; never hard-coded in source
  grade: Grade;
}

// ---- Questions (built by the questions module, shown by the platform) ----

interface QuestionBase {
  subject: Subject;
  grade: Grade;
  prompt: string;
  explain: string; // shown after a miss, next to the correct answer
  standard: string; // Colorado Academic Standards code or short label the question checks
}

/** Pick one of several. Used for grammar, history, and normal-size math. */
export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice';
  choices: string[];
  answer: number; // index into choices
}

/** Type the answer. Used for spelling and epic-size (pencil-and-paper) math. */
export interface TypedQuestion extends QuestionBase {
  kind: 'typed';
  answers: string[]; // every accepted form, e.g. ["0.5", "1/2", ".5"]; compared trimmed and case-insensitive
  speak?: string; // spelling: text read aloud with the browser's speech synthesis
}

export type Question = ChoiceQuestion | TypedQuestion;

/**
 * Implemented in src/core/questions/index.ts. Returns a fresh question. Remembers what was served on this
 * device (across page loads) so repeats are rare. size 'epic' returns pencil-and-paper math when subject is math.
 */
export type NextQuestion = (grade: Grade, subject?: Subject, size?: BonusSize) => Question;

// ---- Services a game receives at start ----

/**
 * normal: quick questions she answers in her head (multiple-choice math, grammar, history; typed spelling).
 * epic: a big reward worth real work; math is a harder typed problem that needs pencil and paper.
 */
export type BonusSize = 'normal' | 'epic';

export interface BonusRequest {
  /** What she earns, in plain words, shown on the question card. Example: "Revive your wyrm". */
  reward: string;
  /** Default 'normal'. Use 'epic' only for the biggest rewards in a game. */
  size?: BonusSize;
}

export interface BonusResult {
  earned: boolean;
}

export interface Camalot {
  player: Player;

  /**
   * Shows the question card over the game. Up to 3 tries; each try is a new question.
   * A miss shows the right answer and its explanation, then the next try. Resolves when she earns it,
   * runs out of tries, or closes the card (earned: false). The game must pause itself while this is open.
   */
  earnBonus(req: BonusRequest): Promise<BonusResult>;

  /** Per-player, per-game save. Async so cloud sync can plug in later without changing games. */
  save: {
    load<T>(): Promise<T | null>;
    store<T>(data: T): Promise<void>;
  };

  /** Shared music and sound effects. Volumes and mute are player settings owned by the platform. */
  audio: AudioApi;
}

// ---- Audio (implemented in src/core/audio/, all sound made in code with WebAudio) ----

/** One music track per game plus the hub. Each track holds several songs that the module rotates. */
export type MusicTrack = 'hub' | GameId;
/** Each theme has these arrangements; switching crossfades on the beat. */
export type MusicMood = 'menu' | 'play' | 'intense' | 'win';

/** Shared sound effects. Every game uses these where they fit, so Camalot sounds like one place. */
export type SfxName =
  // menus and rewards
  | 'tap' | 'select' | 'back' | 'buy' | 'error' | 'unlock' | 'levelUp' | 'win' | 'lose' | 'star' | 'coin'
  // world
  | 'pop' | 'grow' | 'gulp' | 'whoosh' | 'boost' | 'sparkle' | 'splash' | 'thud' | 'crunch' | 'snip'
  | 'swap' | 'match' | 'cascade' | 'explode' | 'cheer' | 'kick' | 'meow' | 'purr';

/** Continuous sounds a game drives frame by frame. */
export type LoopName = 'engine' | 'ski' | 'wind' | 'waves' | 'crowd';

export interface SfxOptions {
  /** Playback rate multiplier, 1 = normal. Use small random spreads (0.9-1.1) so repeats do not sound robotic. */
  pitch?: number;
  /** 0..1, multiplied by the player's sfx volume. */
  volume?: number;
  /** -1 left .. 1 right. */
  pan?: number;
}

export interface LoopHandle {
  /** 0..1 loudness, smoothed. */
  setLevel(v: number): void;
  /** Rate multiplier, smoothed (engine revs, ski speed). */
  setPitch(r: number): void;
  stop(): void;
}

export interface AudioApi {
  /** Starts or crossfades to a track and mood. Safe to call every frame; repeats are ignored. */
  music(track: MusicTrack, mood?: MusicMood): void;
  stopMusic(): void;
  sfx(name: SfxName, opts?: SfxOptions): void;
  loop(name: LoopName): LoopHandle;
  /**
   * For a game's own special sounds: build WebAudio nodes on `context` and connect them to `sfxOut`
   * so the player's volume and mute apply. Null until the browser allows audio (first tap or key).
   */
  readonly context: AudioContext | null;
  readonly sfxOut: AudioNode | null;
}

/**
 * Implemented in src/core/index.ts. Shows player select if no player is chosen on this device,
 * mounts the shared "back to Camalot" button, then returns the services for this game.
 */
export type StartGame = (game: GameId) => Promise<Camalot>;
