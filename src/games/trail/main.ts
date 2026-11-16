import { startGame } from '../../core';
import { runTrail } from './game';

// No top-level await: the build targets ES2020.
startGame('trail').then(runTrail);
