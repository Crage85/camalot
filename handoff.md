# Camalot handoff

<!-- UPKEEP (any model, any tool):
- Rewrite this whole file at the end of every session. Never append to it. 50 lines max.
- Before rewriting, move anything that will still matter next month into project.md. Drop the rest.
- Session history lives in transcripts, not here. -->

**Last session:** 2026-11-16

## Where we are

All six games are at v2 (new graphics, late game, balance, music and sound) on `main`. Question bank reworked (per-device memory, multiple-choice normal math, epic pencil math, ~155 grammar/history and 259 spelling per grade; all keys re-checked). `npm run build` passes; every page loads with no console errors (`node shots/smoke.mjs` against `npx vite preview`). Play: `Play Camalot.bat`. Listen: `npm run dev`, then `http://localhost:5173/audio-lab.html`. Published 2026-11-16: https://crage85.github.io/camalot/ (repo `Crage85/camalot`, public; history squashed to one clean commit, old local history kept on branch `pre-publish-backup`, never push it). Live smoke test passed. Tested only in headless Chromium. `main` now has a remote: future changes go on a branch and a PR.

## Next

1. Real-device check on the laptop and tablets: frame rate on Low, touch, trackpad, spelling voice, music.
2. Polish: Munch Hollow camera too close when the hole is huge and the combo counter runs to 1000+; Whisker Castle can show a negative star count with a forced save; Kitty Cup Run arch can cross the camera near the goal; volume card does not pause games.

## Waiting on Craig

- Listen to the music in the audio lab: keep or change each theme.
- Play-test feel and difficulty. All balance numbers come from computer players, not kids.
- Rules CC picked (keep or change):
  - Wyrm: 9 places, 72 goals, 9 bosses; evolution to level 30+; arena radius 100; epic = Dragon start, Royal hoard.
  - Hole: 180 levels in 9 places; stars at 100/82/62% of the clock; Clear Map 2:30; epic = Triple coins, Giant start.
  - Harvest: 7 farms; tough crops cut slowly until the harvester is upgraded; Golden Seasons after farm 7; epic = Mega harvest, Treasure chest.
  - Match: 240 levels in 12 worlds, no lives; crowns for fewer-move replays; epic = Treasure chest, legendary cat rescue.
  - Runner: 640 matches in 4 leagues + Endless Cup; 8 star cats; epic = Golden coin pile, Galaxy jersey.
  - Trail: 20 mountains x 7 runs; goals 13-24% of land; last 4 track cells never trip you; epic = Golden Dragon skin, Champion's purse.

## Parked

- The combined castle hub game (project.md D1).
- Empty stray file `SOURCES.md` at the repo root (untracked, 0 bytes, from an agent run).
