// Whisker Castle entry: the only file that touches the Camalot platform.
// (.then instead of top-level await: the build targets ES2020, which has no top-level await.)
import { startGame } from '../../core';
import { runGame } from './game';

startGame('match3').then(runGame);
