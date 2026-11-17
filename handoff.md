# Camalot handoff

<!-- UPKEEP (any model, any tool):
- Rewrite this whole file at the end of every session. Never append to it. 50 lines max.
- Before rewriting, move anything that will still matter next month into project.md. Drop the rest.
- Session history lives in transcripts, not here. -->

**Last session:** 2026-11-16

## Where we are

Live: https://crage85.github.io/camalot/ = `main` (v2 games plus play-test fixes: quieter sfx, 3 songs per game, Wyrm arena 3x wider, per-item scores in the hole game, tractor Unstuck). Anime fantasy restyle (D7, D16, D17) is in progress on branch `restyle-anime`, not merged or published. Done there with marker commits: shared UI and hub (`Restyle: hub`), Neko Strike (`Restyle: runner`), Riftmaw (`Restyle: hole`). Cut off partway, saved in commit "WIP (not done)": Wyrmrise, Skyfield Saga, Spellpaw, Frostclaim, and the music rework. The branch may not build until those finish.

## Last session

- Built all six games, platform, question bank; v2 upgrade (graphics, late game, balance, audio); question rework (multiple-choice normal math, epic pencil math, per-device memory); published to GitHub Pages.
- Merged PR #1 (docs) and PR #2 (play-test fixes) and republished.
- Craig picked anime fantasy style (Q15 C) and asked CC to name the games (D16); asked for non-childish music (D17).

## Next

1. Finish the restyle: follow `.claude/resume-restyle.md` (shared style spec, per-piece notes, Fable 5.2 medium builders, marker commits). Launch builders for wyrm, tractor, match3, trail, and music in parallel; each continues from the WIP files. Done when: all eight markers exist on `restyle-anime`.
2. Restyle follow-ups: Riftmaw's Clawhaven and Sugarspire props still read young (yarn balls, cupcakes; rebuild in props2.ts) and two rival names (Moonpaw, Juniper) are left; hub Spellpaw emblem still a round cat face; Neko Strike snow world looks flat. Done when: fixed and re-screenshotted.
3. `npm run build`, `node shots/smoke.mjs` against `npx vite preview`, open PR to `main`. Done when: PR open with screenshots, not merged.
4. Craig reviews, then merge and republish (project.md Process step 4).

## Waiting on Craig

- Listen to the reworked music once it lands (`npm run dev`, then http://localhost:5173/audio-lab.html) before it is published.
- Look at the restyled games and the new names; approve the restyle PR.
- Play-test on the real laptop and tablets: speed on Low, touch, trackpad, spelling voice. All balance numbers come from computer players.
- Rules CC picked (keep or change): Wyrm arena radius 300 with 36 rivals; tractor Unstuck is free and unlimited, all vehicles share one collision size; Riftmaw and Neko Strike renamed every cutesy string (lists in the restyle commits); Neko Strike star cats are now "Aces".

## Parked

- The combined castle hub game (project.md D1).
- Empty stray file `SOURCES.md` at the repo root (untracked, 0 bytes, from an agent run).
- Whisker Castle/Spellpaw negative star count with a forced save; Neko Strike arch can cross the camera near the goal; the volume card does not pause games.
