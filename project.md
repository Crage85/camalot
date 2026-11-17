# Camalot

<!-- UPKEEP (any model, any tool):
- Current truth only. Edit sections in place. Never add session notes, dated logs, or history; that goes in handoff.md and then gets dropped.
- A decision that is replaced gets deleted. Numbers are never reused; bump "Next number".
- Describe folders, not files. The files, code, and workbooks are the reference; do not explain them here.
- No other doc in this folder may restate status, decisions, or next steps. Aim under ~150 lines. -->

**Status:** active

## What and why

Craig's daughters (6th and 8th grade) play free web games full of inappropriate ads and buy-now prompts. Camalot is our own ad-free versions of those games, for family use. Each game is built on its own first; later they join into one hub game. Where real games sell bonuses or gate them behind ads or daily logins, Camalot gives them for answering school questions (math, history, grammar, spelling).

Games in scope (genres the kids play): snake .io (Slither.io), crowd runner with x2/+N gates, hole that swallows a city, tractor harvest-and-upgrade, territory trail (draw a loop to claim land), match-3 (Fishdom).

## Hard rules

- Family use only. The site is a public GitHub Pages link that is not advertised. No personal information (the girls' names, ages, email addresses) in the site or the repo; player names are typed on each device and never stored in source.
- No ads, no purchases, no come-back-daily pressure.
- Copy how a game plays (rules, loops, upgrade systems). Never copy art, characters, names, levels, text, or code. Camalot games get their own look and names.

## Process

1. Research a genre: feature list with each feature tagged CORE / COMMON / EXTRA, plus every ad, purchase, and retention hook marked as a school-question swap point.
2. One builder per game works in its own `src/games/<id>/` folder; the platform and question bank have their own builders. Shared files (`package.json`, `vite.config.ts`, `contract.ts`) change only through the orchestrator.
3. The orchestrator reviews each builder's screenshots and report, then commits on a branch and opens a PR to `main`.
4. Publish: `npm run build`, then push the contents of `dist/` (with an empty `.nojekyll`) as the single commit of branch `gh-pages`, using the repo's noreply identity. Then run `node shots/smoke.mjs https://crage85.github.io/camalot/`.

## Decisions

Next number: D18

**D1.** Name is Camalot: a family pun on Camelot. The hub game is a castle; each game is a room.
**D2.** Retries, power-ups, revives, boosts, and currency come from answering school questions, never from money, ads, or streaks.
**D3.** Model routing (Craig ruling 2026-11-16, overrides the global roster for this project): orchestrator Opus 5.5 on high; sub-agents Opus 5.5 on medium; Fable 5.2 on medium for graphics, game design, and balance work (Craig 2026-11-16: "use some Fable 5.2 agents to make better looking games").
**D4.** Genre research is a quick pass per genre, not the full /research process. Wrong features are cheap to fix later.
**D5.** All six games are built at the same time, each standalone, on one shared platform (player select, saves, question card). Games code against `src/core/contract.ts`.
**D6.** Devices: a laptop with trackpad and keyboard (no mouse) and tablets. Every game plays fully with keyboard alone, with the trackpad, and with touch.
**D7.** All six games are 3D in an anime fantasy style aimed at 8th-9th graders (Craig 2026-11-16, Q15 C: the old cute look read as "for 5 to 7 year olds"). Cel shading with ink outlines, teen proportions (no chibi heads, no blush marks), rich colors and dramatic skies, anime effects (speed lines, impact bursts, glints), sleek fantasy UI, confident wording instead of cutesy puns. Every game uses three.js MeshToonMaterial with the same 3-step gradient and inverted-hull ink outlines; shared UI styling lives in `src/core/theme.css`. CC draws all art in code; no downloaded art, fonts, or sounds. Stack: TypeScript + three.js + Vite, exact versions pinned, same as Vardheim.
**D8.** Questions: one player is in 6th grade, one in 8th, matched to the Colorado Academic Standards. Subjects: math, spelling, grammar, history. Normal bonuses use quick questions answered in her head: multiple-choice math about ideas and strategy (which equation, what a slope means), multiple-choice grammar and history, typed spelling. Epic bonuses (a game's biggest rewards only) use typed pencil-and-paper math. Each bonus allows 3 tries, each a new question. A miss shows the right answer and why; there is no other penalty. Served questions are remembered per device so repeats are rare.
**D9.** Themes: Wyrm = a fantasy wyrm eats glowing gems. Hole = a magic hole swallows a fantasy kingdom, ski village, and beach town. Tractor = a cat farmer on Colorado fields, meadows, and beaches. Match = cat and fantasy pieces, stars decorate a cat castle. Runner = a cat soccer team runs through number gates to score at the goal. Trail = skiers carve tracks to claim a mountain. Feel of fantasy cat-clan books is welcome; no names or characters from any book.
**D11.** Staying power: each game carries at least 15-20 hours of content (later worlds and levels, more unlocks, new mechanics over time) plus a replayable layer. It comes from content and goals, never pressure. Graphics aim for a polished commercial casual 3D look, with a High/Low quality setting so tablets run smoothly.
**D12.** Skyfield Saga (`tractor`): no crop is locked behind a cutter type. Every crop can be cut from the start; tougher crops cut slowly until the harvester is upgraded, so she can trade speed for value. Finishing a farm moves her to a bigger, different farm, and plots differ in shape, terrain, and obstacles, not only crop.
**D13.** Every game has music and sound effects, made in code through the shared audio module (`camalot.audio`), with music and sound volume per player.
**D14.** Saves stay on each device (Craig 2026-11-16, Q13 B). No cloud sync; progress on the tablet and the laptop is separate.
**D15.** Hosting: public GitHub repo `Crage85/camalot`, site on GitHub Pages from the `gh-pages` branch (Craig 2026-11-16, Q14 A). Commits use the GitHub noreply address, never a personal email.
**D16.** Game names (CC's pick, Craig 2026-11-16, Q16): Wyrmrise (`wyrm`), Riftmaw (`hole`), Skyfield Saga (`tractor`), Spellpaw (`match3`), Neko Strike (`runner`), Frostclaim (`trail`). Game ids and saves are unchanged.
**D17.** Music matches the anime fantasy look and the 8th-9th grade target (Craig 2026-11-16: the first tracks sounded "very small childish... like nursery rhymes"). Think anime and JRPG soundtracks, anime openings, lo-fi, EDM, epic orchestral: minor keys and modes, extended chords, syncopation, real drum grooves, synth bass, pads and leads. No music box, toy bells, whistle tunes, or sing-song melodies.
**D10.** Small per-game rules (collision rules, costs, win conditions) are CC's call. Each one is listed in handoff.md for Craig to keep or change.

## Where things live

- `research/`: one feature list per genre, plus `summary.md`.
- `src/core/`: shared platform (player select, saves, question card). `contract.ts` is the rule book between platform and games.
- `src/core/questions/`: question bank and math generators.
- `src/games/<id>/`: one folder per game (wyrm, hole, tractor, match3, runner, trail). Pages are `games/<id>/index.html`; the hub is `index.html`.
- Run locally: `npm run dev`. Check: `npm run build`.
