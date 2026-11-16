import './theme.css';
import type { StartGame } from './contract';
import { audio, setAudioPlayer, soundButton } from './audio';
import { earnBonus } from './bonus';
import { choosePlayer, currentPlayer, type StoredPlayer } from './players';
import { saveFor } from './store';
import { ICON } from './ui';

export const startGame: StartGame = async (game) => {
  const back = document.createElement('a');
  back.className = 'cm-btn cm-back';
  back.href = '../../index.html'; // games live at games/<id>/index.html
  back.setAttribute('aria-label', 'Back to Camalot');
  back.innerHTML = `${ICON.back}<span>Camalot</span>`;
  const sound = soundButton();
  sound.classList.add('cm-sound-game');
  document.body.append(back, sound);
  sound.style.left = `${back.offsetLeft + back.offsetWidth + 8}px`;
  sound.style.height = `${back.offsetHeight}px`;

  const p = currentPlayer() ?? ((await choosePlayer(false)) as StoredPlayer);
  const player = { id: p.id, name: p.name, grade: p.grade };
  setAudioPlayer(player.id);
  audio.music(game, 'menu'); // every game has music even before it asks; the game switches moods
  return {
    player,
    earnBonus: (req) => earnBonus(player, req),
    save: saveFor(player.id, game),
    audio,
  };
};
