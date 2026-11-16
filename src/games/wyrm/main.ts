import { startGame } from '../../core';
import { runWyrm } from './game';

const camalot = await startGame('wyrm');
const root = document.getElementById('app')!;
await runWyrm(root, camalot);
