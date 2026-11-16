import { startGame } from '../../core';
import { RunnerGame } from './game';

const camalot = await startGame('runner');
const root = document.createElement('div');
document.body.prepend(root);
const game = new RunnerGame(root, camalot);
// Dev server only: lets the screenshot script stage moments. Stripped from the build.
if (import.meta.env.DEV) (window as unknown as { __runner: RunnerGame }).__runner = game;
void game.start();
