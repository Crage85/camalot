import type { AudioApi, LoopHandle, LoopName, MusicMood, MusicTrack } from '../contract';
import { readLocal, writeLocal } from '../store';
import { ICON, el, openDialog } from '../ui';
import { MusicPlayer } from './music';
import { DUCK, SFX, buildLoop, type LoopVoice } from './sfx';
import { createMixer, type Mixer } from './synth';

// The shared audio service. Browsers only allow sound after a tap or key press, so the AudioContext
// is made on the first one; until then music requests are remembered and sound effects are dropped.

interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1
  mute: boolean;
}
const DEFAULTS: Settings = { music: 0.7, sfx: 0.8, mute: false };
const LOOP_GAIN = 0.3;

let ctx: AudioContext | null = null;
let mix: Mixer | null = null;
let player: MusicPlayer | null = null;
let settings: Settings = { ...DEFAULTS };
let settingsKey = '';
let resuming = false; // a resume() is in flight; sounds scheduled now play when it lands
let wanted: [MusicTrack, MusicMood] | null = null; // the last music() call
const pendingLoops: (() => void)[] = [];

function applyVolume(): void {
  if (!ctx || !mix) return;
  const t = ctx.currentTime;
  // Squared so the slider feels even to the ear.
  mix.music.gain.setTargetAtTime(settings.mute ? 0 : settings.music ** 2, t, 0.03);
  mix.sfx.gain.setTargetAtTime(settings.mute ? 0 : settings.sfx ** 2, t, 0.03);
}

function unlock(): void {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    mix = createMixer(ctx);
    player = new MusicPlayer(ctx, mix);
    applyVolume();
    for (const build of pendingLoops.splice(0)) build();
  }
  // Also runs on later taps: iPad Safari can drop the context back to "interrupted".
  if (ctx.state !== 'running' && !document.hidden) {
    resuming = true;
    void ctx.resume().then(() => {
      resuming = false;
      startWanted();
    });
  } else startWanted();
}

function startWanted(): void {
  if (wanted && ctx?.state === 'running') player?.play(wanted[0], wanted[1]);
}

for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume().then(startWanted);
});

export const audio: AudioApi = {
  music(track, mood = 'play') {
    if (wanted && wanted[0] === track && wanted[1] === mood) return;
    wanted = [track, mood];
    startWanted();
  },
  stopMusic() {
    wanted = null;
    player?.stop();
  },
  sfx(name, opts) {
    if (!ctx || !mix || (ctx.state !== 'running' && !resuming) || settings.mute) return;
    const t = ctx.currentTime + 0.005;
    let out: AudioNode = mix.sfx;
    if (opts?.volume !== undefined || opts?.pan) {
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1, opts.volume ?? 1));
      if (opts.pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        g.connect(p).connect(mix.sfx);
      } else g.connect(mix.sfx);
      out = g;
      setTimeout(() => g.disconnect(), 4000);
    }
    // A little random pitch so repeats do not sound robotic.
    SFX[name](ctx, out, t, (opts?.pitch ?? 1) * (0.97 + Math.random() * 0.06));
    const duck = DUCK[name];
    if (duck) mix.duck(t, duck * (opts?.volume ?? 1));
  },
  loop(name: LoopName): LoopHandle {
    let voice: LoopVoice | null = null;
    let level = 0;
    let pitch = 1;
    let stopped = false;
    const build = () => {
      if (stopped || !ctx || !mix) return;
      voice = buildLoop(ctx, mix.sfx, name);
      voice.level.setTargetAtTime(level * LOOP_GAIN, ctx.currentTime, 0.08);
      voice.pitch(pitch, ctx.currentTime);
    };
    if (ctx) build();
    else pendingLoops.push(build);
    return {
      setLevel(v) {
        level = Math.max(0, Math.min(1, v));
        if (voice && ctx) voice.level.setTargetAtTime(level * LOOP_GAIN, ctx.currentTime, 0.08);
      },
      setPitch(r) {
        pitch = Math.max(0.25, Math.min(4, r));
        if (voice && ctx) voice.pitch(pitch, ctx.currentTime);
      },
      stop() {
        stopped = true;
        if (voice && ctx) voice.stop(ctx.currentTime);
        voice = null;
      },
    };
  },
  get context() {
    return ctx;
  },
  get sfxOut() {
    return mix?.sfx ?? null;
  },
};

/** Loads this player's volumes. Called when the player is known or changes. */
export function setAudioPlayer(playerId: string): void {
  settingsKey = `camalot.audio.${playerId}`;
  settings = { ...DEFAULTS, ...readLocal<Partial<Settings>>(settingsKey) };
  applyVolume();
  syncButtons();
}

function saveSettings(): void {
  if (settingsKey) writeLocal(settingsKey, settings);
  applyVolume();
  syncButtons();
}

// ---- the speaker button and its volume card ----

const buttons = new Set<HTMLButtonElement>();
function syncButtons(): void {
  for (const b of buttons) b.innerHTML = settings.mute ? ICON.mute : ICON.sound;
}

/** A speaker button that opens the volume card. The caller places it. */
export function soundButton(): HTMLButtonElement {
  const b = el('button', 'cm-btn cm-sound');
  b.type = 'button';
  b.setAttribute('aria-label', 'Sound');
  b.addEventListener('click', openVolume);
  buttons.add(b);
  syncButtons();
  return b;
}

function openVolume(): void {
  const d = openDialog('Sound');
  const close = () => {
    d.close();
    d.remove();
  };
  d.addEventListener('close', () => d.remove());
  const panel = el('div', 'cm-panel cm-volume');
  panel.append(el('h2', 'cm-title', 'Sound'));
  const slider = (label: string, key: 'music' | 'sfx') => {
    const row = el('label', 'cm-field');
    const input = el('input', 'cm-range');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(Math.round(settings[key] * 100));
    input.addEventListener('input', () => {
      settings[key] = Number(input.value) / 100;
      saveSettings();
    });
    // Let her hear the new level.
    if (key === 'sfx') input.addEventListener('change', () => audio.sfx('coin'));
    row.append(el('span', 'cm-label', label), input);
    return row;
  };
  const mute = el('button', 'cm-btn');
  mute.type = 'button';
  const paint = () => {
    mute.innerHTML = `${settings.mute ? ICON.mute : ICON.sound}<span>${settings.mute ? 'Sound is off' : 'Sound is on'}</span>`;
    mute.setAttribute('aria-pressed', String(settings.mute));
  };
  paint();
  mute.addEventListener('click', () => {
    settings.mute = !settings.mute;
    saveSettings();
    paint();
  });
  const done = el('button', 'cm-btn main', 'Done');
  done.type = 'button';
  done.addEventListener('click', close);
  const actions = el('div', 'cm-actions');
  actions.append(mute, done);
  panel.append(slider('Music', 'music'), slider('Sound effects', 'sfx'), actions);
  d.append(panel);
  done.focus();
}

// Every platform button (hub, cards, dialogs) taps; the back link plays "back".
document.addEventListener('click', (e) => {
  const b = e.target instanceof Element ? e.target.closest('.cm-dialog .cm-btn, .hub .cm-btn, .cm-back, .cm-sound') : null;
  if (b) audio.sfx(b.matches('.cm-back') ? 'back' : 'tap');
});
