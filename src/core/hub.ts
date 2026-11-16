import './theme.css';
import { audio, setAudioPlayer, soundButton } from './audio';
import { choosePlayer, currentPlayer, type StoredPlayer } from './players';
import { el } from './ui';

const slot = document.getElementById('player')!;

const sound = soundButton();
audio.music('hub', 'menu'); // starts on the first tap or key

function show(p: StoredPlayer) {
  setAudioPlayer(p.id);
  const dot = el('span', 'cm-dot');
  dot.style.setProperty('--sw', p.color);
  const swap = el('button', 'cm-btn', 'Switch player');
  swap.type = 'button';
  swap.addEventListener('click', async () => {
    const next = await choosePlayer(true);
    if (next) show(next);
  });
  slot.replaceChildren(dot, el('span', 'hub-name', p.name), el('span', 'hub-grade', `Grade ${p.grade}`), swap, sound);
}

// No top-level await: the build targets ES2020.
const p = currentPlayer();
if (p) show(p);
else void choosePlayer(false).then((n) => show(n as StoredPlayer));
