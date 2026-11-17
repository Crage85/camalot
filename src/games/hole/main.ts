// Riftmaw entry: the only file that touches the Camalot platform.
import { startGame } from '../../core';
import { run } from './game';

startGame('hole').then(run);
