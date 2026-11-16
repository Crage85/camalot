import type { Grade, Player } from './contract';
import { readLocal, writeLocal } from './store';
import { el, openDialog } from './ui';

// Players live on this device only. Names are typed in on the device, never in source.
export interface StoredPlayer extends Player {
  color: string;
}

const PLAYERS = 'camalot.players';
const LAST = 'camalot.lastPlayer';

// Player colours: the voxel look's tier colours t3 to t8 (design-os styles/voxel).
export const COLORS = [
  { name: 'Green', hex: '#5fd35f' },
  { name: 'Blue', hex: '#4a9cff' },
  { name: 'Purple', hex: '#b36bff' },
  { name: 'Orange', hex: '#ffa530' },
  { name: 'Red', hex: '#ff4a4a' },
  { name: 'Sky', hex: '#8fe8ff' },
];

export function listPlayers(): StoredPlayer[] {
  const list = readLocal<StoredPlayer[]>(PLAYERS);
  return Array.isArray(list) ? list : [];
}

/** The last player chosen on this device, or null. Also paints her colour into --cm-player. */
export function currentPlayer(): StoredPlayer | null {
  const id = readLocal<string>(LAST);
  const p = listPlayers().find((x) => x.id === id) ?? null;
  if (p) document.documentElement.style.setProperty('--cm-player', p.color);
  return p;
}

function setCurrent(p: StoredPlayer) {
  writeLocal(LAST, p.id);
  document.documentElement.style.setProperty('--cm-player', p.color);
}

function newId(): string {
  // crypto.randomUUID needs https; tablets may load the site over plain http on the home network.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Player select. Shows the player list, or the create form when the device has no players yet.
 * canCancel false: she must pick or create one (a game is waiting for a player).
 */
export function choosePlayer(canCancel: boolean): Promise<StoredPlayer | null> {
  const d = openDialog('Choose player');
  return new Promise((resolve) => {
    let settled = false;
    const done = (p: StoredPlayer | null) => {
      if (settled) return;
      settled = true;
      if (p) setCurrent(p);
      d.close();
      d.remove();
      resolve(p);
    };
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (canCancel) done(null);
    });
    // The browser may force-close a modal on a repeated Esc; reopen it when a player is still needed.
    d.addEventListener('close', () => {
      if (settled) return;
      if (canCancel) done(null);
      else d.showModal();
    });

    const showList = () => {
      const players = listPlayers();
      const panel = el('div', 'cm-panel cm-pick');
      panel.tabIndex = -1;
      panel.append(el('h2', 'cm-title', 'Who is playing?'));
      const list = el('div', 'cm-pick-list');
      for (const p of players) {
        const b = el('button', 'cm-btn cm-pick-player');
        b.type = 'button';
        const dot = el('span', 'cm-dot');
        dot.style.setProperty('--sw', p.color);
        b.append(dot, el('span', 'cm-pick-name', p.name), el('span', 'cm-pick-grade', `Grade ${p.grade}`));
        b.addEventListener('click', () => done(p));
        list.append(b);
      }
      const actions = el('div', 'cm-actions');
      if (canCancel) {
        const close = el('button', 'cm-btn', 'Close');
        close.type = 'button';
        close.addEventListener('click', () => done(null));
        actions.append(close);
      }
      const add = el('button', 'cm-btn', 'New player');
      add.type = 'button';
      add.addEventListener('click', showCreate);
      actions.append(add);
      panel.append(list, actions);
      d.replaceChildren(panel);
      panel.focus();
    };

    const showCreate = () => {
      const players = listPlayers();
      const free = COLORS.find((c) => !players.some((p) => p.color === c.hex)) ?? COLORS[0];
      const form = el('form', 'cm-panel cm-pick');
      form.innerHTML = `
        <h2 class="cm-title">New player</h2>
        <label class="cm-field"><span class="cm-label">Name</span>
          <input class="cm-input" name="name" maxlength="20" autocomplete="off" autocapitalize="words" spellcheck="false" required></label>
        <fieldset class="cm-field"><legend class="cm-label">Grade</legend>
          <div class="cm-pick-row">
            <label class="cm-btn cm-opt"><input type="radio" name="grade" value="6" required>Grade 6</label>
            <label class="cm-btn cm-opt"><input type="radio" name="grade" value="8">Grade 8</label>
          </div></fieldset>
        <fieldset class="cm-field"><legend class="cm-label">Color</legend>
          <div class="cm-pick-row">${COLORS.map(
            (c) =>
              `<label class="cm-btn cm-opt cm-swatch"><input type="radio" name="color" value="${c.hex}" aria-label="${c.name}"${
                c === free ? ' checked' : ''
              }><span class="cm-dot" style="--sw:${c.hex}"></span></label>`,
          ).join('')}</div></fieldset>
        <div class="cm-actions"></div>`;
      const actions = form.querySelector('.cm-actions')!;
      if (players.length || canCancel) {
        const back = el('button', 'cm-btn', 'Back');
        back.type = 'button';
        back.addEventListener('click', () => (players.length ? showList() : done(null)));
        actions.append(back);
      }
      const start = el('button', 'cm-btn main');
      start.type = 'submit';
      start.innerHTML = 'Start <span class="cm-key">Enter</span>';
      actions.append(start);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const name = String(data.get('name') ?? '').trim();
        if (!name) {
          form.querySelector<HTMLInputElement>('input[name=name]')!.focus();
          return;
        }
        const p: StoredPlayer = {
          id: newId(),
          name,
          grade: Number(data.get('grade')) as Grade,
          color: String(data.get('color')),
        };
        writeLocal(PLAYERS, [...players, p]);
        done(p);
      });
      d.replaceChildren(form);
      form.querySelector<HTMLInputElement>('input[name=name]')!.focus();
    };

    if (listPlayers().length) showList();
    else showCreate();
  });
}
