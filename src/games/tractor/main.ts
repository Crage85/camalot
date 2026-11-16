import { startGame } from '../../core';
import { runGame } from './game';

const camalot = await startGame('tractor');
await runGame(camalot, document.body);
