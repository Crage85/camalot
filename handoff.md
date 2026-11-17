# Camalot handoff

<!-- UPKEEP (any model, any tool):
- Rewrite this whole file at the end of every session. Never append to it. 50 lines max.
- Before rewriting, move anything that will still matter next month into project.md. Drop the rest.
- Session history lives in transcripts, not here. -->

**Last session:** 2026-11-17

## Where we are

Live: https://crage85.github.io/camalot/ = `main` (v2 games plus play-test fixes). The anime fantasy restyle (D7), new names (D16), and music rework (D17) are finished on branch `restyle-anime`: all eight marker commits exist, `npm run build` passes, and `node shots/smoke.mjs` passes on all 7 pages. PR open, not merged, not published: https://github.com/Crage85/camalot/pull/3 (Auto-fix on; the repo has no CI checks).

## Last session

- Finished Wyrmrise, Skyfield Saga, Spellpaw, Frostclaim, and the 21-song music rework from the WIP commit.
- Fixed review follow-ups: all 32 Riftmaw Clawhaven/Sugarspire props rebuilt (same footprints, balance held), Moonpaw -> Eclipse, Juniper -> Jinrai, Sugarspire river teal; hub Spellpaw emblem is a mage crest; Frostclaim emblem no longer cropped; Neko Strike snow world rebuilt with depth.

## Next

1. Craig reviews PR #3 (see Waiting on Craig). Done when: approved or changes listed.
2. Make any changes Craig asks for on `restyle-anime`; re-run build and smoke.
3. Merge PR #3 and republish (project.md Process step 4). Done when: live site shows the new names and `node shots/smoke.mjs https://crage85.github.io/camalot/` passes.

## Waiting on Craig

- Listen to the music: `npm run dev`, then http://localhost:5173/audio-lab.html. Nobody has heard it. Four songs are in major keys (Starfall Keep, Velvet Hex, Breakaway, Golden Sprint); Golden Sprint is most likely to sound small. Neko Strike and Frostclaim intense moods reach about 190 bpm.
- Look at the restyled games and new names; approve PR #3.
- Play-test on the real laptop and tablets: frame rate on High and Low (all numbers so far are software rendering), touch, trackpad, spelling voice.
- Art and naming picks CC made (keep or change): Neko Strike snow track kerbs changed from blue to orange; Riftmaw rivals Bramble, Thistle, Nimbus, Willowisp kept; Sugarspire treasures keep sweet names (Toffee Crown, Caramel Key); Frostclaim bot names Maple, Clover, Fig, Juniper kept; Spellpaw citadel still has a snowman "Snow guardian" and pink cloud puffs.
- Rules CC picked earlier (keep or change): Wyrm arena radius 300 with 36 rivals; tractor Unstuck is free and unlimited, all vehicles share one collision size; Neko Strike star cats are "Aces".

## Parked

- The combined castle hub game (project.md D1).
- Empty stray file `SOURCES.md` at the repo root (untracked, 0 bytes, from an agent run).
- `.claude/resume-restyle.md` is finished; delete it after PR #3 merges.
- Wyrmrise hub emblem tail is round beads (slightly soft shape).
- Spellpaw negative star count with a forced save; Neko Strike arch can cross the camera near the goal; the volume card does not pause games.
