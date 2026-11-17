// Menus for Neko Strike: home, season map, team, clubhouse, pause, lost, goal. Plain DOM on the shared Camalot theme.
import {
  BONUS_CATS, COIN_MULT, CUPS, EPIC_PILE, GOALS, incomeCost, incomeMult, INCOME_MAX, JERSEYS, LAST_LEVEL, LEAGUES, matchTitle, MATCHES,
  REVIVE_MIN, STADIUM_MAX, stadiumCost, stadiumMult, STAR_MAX, starCost, STARS, startCats, starsOf, teamCost, TEAM_MAX, totalStars, where, WORLDS,
  type Jersey,
} from './data';
import { FEATURES } from './levels';
import type { RunnerGame } from './game';

const coin = (n: number | string) => `<span class="rn-num"><i class="rn-coin"></i>${n}</span>`;
const Q = '<span class="rn-qmark">?</span>';
const stars3 = (n: number) => `<span class="rn-stars">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;
const trophy = (a: string, b: string, won: boolean) =>
  `<svg class="rn-trophy${won ? ' won' : ''}" viewBox="0 0 48 56" aria-hidden="true"><path d="M12 6h24v12c0 9-5 15-12 15S12 27 12 18z" fill="${won ? '#ffcf3a' : '#3a4050'}"/><path d="M12 9H5c0 9 3 13 9 14M36 9h7c0 9-3 13-9 14" fill="none" stroke="${won ? '#e0a020' : '#3a4050'}" stroke-width="3.5"/><rect x="21" y="32" width="6" height="9" fill="${won ? '#e0a020' : '#2c3140'}"/><rect x="13" y="41" width="22" height="9" rx="2" fill="${won ? a : '#2c3140'}"/><circle cx="24" cy="17" r="5.5" fill="${won ? b : '#2c3140'}"/>${won ? '<path d="M16 9c0 6 1 10 4 13" stroke="#fff6c0" stroke-width="2.5" fill="none" stroke-linecap="round"/>' : ''}</svg>`;

export class Screens {
  private esc: (() => void) | null = null;
  constructor(private g: RunnerGame, private el: HTMLDivElement) {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.g.sfx('tap', 1, 0.6);
    });
  }
  get open() {
    return this.el.classList.contains('on');
  }
  busy(b: boolean) {
    if (b) this.el.dataset.busy = '1';
    else delete this.el.dataset.busy;
  }
  close() {
    this.el.classList.remove('on');
    this.el.innerHTML = '';
    this.esc = null;
  }

  key(e: KeyboardEvent) {
    if (this.el.dataset.busy) return;
    const btns = [...this.el.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      btns[(i + dir + btns.length) % btns.length]?.focus();
    } else if (e.key === 'Escape' && this.esc) {
      e.preventDefault();
      this.g.sfx('back');
      this.esc();
    } else {
      const hot = btns.find((b) => b.dataset.key && b.dataset.key.toLowerCase() === e.key.toLowerCase());
      if (hot) {
        e.preventDefault();
        hot.click();
      }
    }
  }

  private panel(html: string, esc: (() => void) | null, cls = '') {
    const g = this.g;
    this.el.className = `rn-screen on ${cls} ${g.state === 'menu' ? 'rn-menu' : ''}`;
    this.el.innerHTML = `<div class="cm-panel rn-panel">${html}<p class="cm-help rn-help"></p></div>`;
    g.hint.classList.remove('on');
    g.hud.classList.toggle('on', g.state !== 'menu');
    this.esc = esc;
    const help = this.el.querySelector<HTMLElement>('.rn-help')!;
    this.el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.addEventListener('focus', () => (help.textContent = b.dataset.help ?? ''));
      b.addEventListener('pointerenter', () => (help.textContent = b.dataset.help ?? ''));
    });
    (this.el.querySelector<HTMLButtonElement>('.rn-main') ?? this.el.querySelector('button'))?.focus();
  }
  private on(sel: string, fn: (b: HTMLButtonElement) => void) {
    this.el.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
  }
  /** Redraw a screen after a purchase and put the focus back where it was. */
  private redraw(draw: () => void, sel: string) {
    const top = this.el.querySelector('.rn-panel')?.scrollTop ?? 0;
    this.g.persist();
    draw();
    this.el.querySelector('.rn-panel')!.scrollTop = top;
    this.el.querySelector<HTMLButtonElement>(sel)?.focus();
  }
  private pay(cost: number): boolean {
    const s = this.g.save;
    if (s.coins < cost) {
      this.g.sfx('error');
      return false;
    }
    s.coins -= cost;
    this.g.sfx('buy');
    return true;
  }
  private back = `<button class="cm-btn" data-act="home" data-key="Escape" data-help="Back to the start screen.">Back <span class="cm-key">Esc</span></button>`;

  // ---------------- Home ----------------
  home(n?: number) {
    const g = this.g;
    g.toMenu(n);
    const s = g.save;
    const wh = where(g.cur);
    const cap = STARS.find((c) => c.id === s.captain);
    const feat = wh.league === 0 && wh.match < 3 ? FEATURES.find((f) => f.cup === wh.cup) : undefined;
    const claim = GOALS.filter((q) => (s.claimed[q.id] ?? 0) < q.tiers.length && (s.stats[q.id] ?? 0) >= q.tiers[s.claimed[q.id] ?? 0]).length;
    this.panel(
      `<h1 class="cm-title rn-logo">Neko Strike</h1>
      <div class="rn-card" style="--a:${wh.world.swatch[0]};--b:${wh.world.swatch[1]}">
        <b>${matchTitle(g.cur)}</b><span>${wh.endless ? 'Endless Cup' : LEAGUES[wh.league]} · ${wh.world.name}</span>
        <span>${wh.final ? `Final: beat keeper ${wh.world.keeper}` : wh.derby ? `Derby: Captain ${wh.world.captain} of the ${wh.world.rivals}` : `vs ${wh.world.rivals}`} ${g.cur < s.level ? stars3(starsOf(s, g.cur)) : ''}</span>
        ${feat ? `<span class="rn-new">New: ${feat.name}. ${feat.text}</span>` : ''}
      </div>
      <div class="rn-stat">${coin(s.coins)} <span class="rn-stars">★ ${totalStars(s)}</span></div>
      <button class="cm-btn main rn-main" data-act="play" data-help="Run the gates. Break the keeper. Score.">Play <span class="cm-key">Enter</span></button>
      <button class="cm-btn rn-q" data-act="bonus" ${g.bonusCats ? 'disabled' : ''} data-help="Answer a question. Start this run with ${BONUS_CATS} extra players.">${g.bonusCats ? `+${BONUS_CATS} players ready` : `Reinforcements +${BONUS_CATS}`} ${Q}</button>
      <div class="rn-row3">
        <button class="cm-btn" data-act="season" data-key="s" data-help="All cups and matches. Replay any match for more stars.">Season <span class="cm-key">S</span></button>
        <button class="cm-btn" data-act="team" data-key="t" data-help="Upgrades and aces. Captain: ${cap ? cap.name : 'none yet'}.">Team <span class="cm-key">T</span></button>
        <button class="cm-btn" data-act="club" data-key="c" data-help="Trophy room, jerseys, and goals.">Clubhouse${claim ? ` <span class="rn-dot">${claim}</span>` : ''} <span class="cm-key">C</span></button>
      </div>`,
      null,
    );
    this.on('[data-act=play]', () => g.play());
    this.on('[data-act=season]', () => this.season());
    this.on('[data-act=team]', () => this.team());
    this.on('[data-act=club]', () => this.club());
    this.on('[data-act=bonus]', async () => {
      if (!(await g.bonus(`Start with ${BONUS_CATS} extra players`))) return;
      g.bonusCats = BONUS_CATS;
      this.home(g.cur);
      this.el.querySelector<HTMLButtonElement>('[data-act=play]')?.focus();
    });
  }

  // ---------------- Season map ----------------
  season() {
    const s = this.g.save;
    const cupsWon = Math.floor((s.level - 1) / MATCHES);
    const rows = LEAGUES.map((name, l) => {
      const cards = WORLDS.map((w, i) => {
        const c = l * WORLDS.length + i;
        const open = c <= cupsWon;
        const got = s.stars.slice(c * MATCHES, (c + 1) * MATCHES).split('').reduce((a, x) => a + Number(x), 0);
        return `<button class="cm-btn rn-cup${open ? '' : ' locked'}${c === Math.min(cupsWon, CUPS - 1) ? ' now' : ''}" data-cup="${c}" ${open ? '' : 'disabled'} style="--a:${w.swatch[0]};--b:${w.swatch[1]}"
          data-help="${w.cup}, ${name}. ${w.name}. Rivals: ${w.rivals}.">${trophy(w.swatch[1], w.rivalJersey, c < cupsWon)}<b>${w.cup}</b><span>${open ? `★ ${got}/${MATCHES * 3}` : 'Locked'}</span></button>`;
      }).join('');
      return `<h2 class="cm-label">${name}</h2><div class="rn-cups">${cards}</div>`;
    }).join('');
    const endless = s.level > LAST_LEVEL;
    this.panel(
      `<h1 class="cm-title">Season</h1><p class="rn-sub">${cupsWon} of ${CUPS} cups won · ★ ${totalStars(s)}</p>${rows}
      <button class="cm-btn${endless ? '' : ' locked'}" data-act="endless" ${endless ? '' : 'disabled'} data-help="Win all ${CUPS} cups to open it. It never ends and keeps getting harder.">Endless Cup${endless ? ` · best match ${s.level - LAST_LEVEL - 1}` : ' · locked'}</button>${this.back}`,
      () => this.home(), 'rn-wide',
    );
    this.on('[data-cup]', (b) => this.cup(Number(b.dataset.cup)));
    this.on('[data-act=endless]', () => this.home(s.level));
    this.on('[data-act=home]', () => this.home());
    this.el.querySelector<HTMLButtonElement>('.rn-cup.now')?.focus();
  }

  private cup(c: number) {
    const s = this.g.save;
    const w = WORLDS[c % WORLDS.length];
    const nodes = Array.from({ length: MATCHES }, (_v, m) => {
      const n = c * MATCHES + m + 1;
      const wh = where(n);
      const open = n <= s.level;
      return `<button class="cm-btn rn-node${wh.final ? ' final' : wh.derby ? ' derby' : ''}${n === s.level ? ' now' : ''}" data-n="${n}" ${open ? '' : 'disabled'}
        data-help="${wh.final ? `Cup final against keeper ${w.keeper}.` : wh.derby ? `Derby against Captain ${w.captain}.` : `Match ${m + 1}.`}${STARS.some((x) => x.at === n) && !s.cats[STARS.find((x) => x.at === n)!.id] ? ' An ace joins if you win.' : ''}">
        <b>${wh.final ? 'Final' : m + 1}</b>${n < s.level ? stars3(starsOf(s, n)) : `<span>${open ? 'Play' : '·'}</span>`}</button>`;
    }).join('');
    this.panel(
      `<h1 class="cm-title">${w.cup}</h1><p class="rn-sub">${LEAGUES[Math.floor(c / WORLDS.length)]} · ${w.name} · vs ${w.rivals}</p>
      <div class="rn-nodes">${nodes}</div>
      <button class="cm-btn" data-act="season" data-key="Escape" data-help="Back to all cups.">Back <span class="cm-key">Esc</span></button>`,
      () => this.season(), 'rn-wide',
    );
    this.on('[data-n]', (b) => this.home(Number(b.dataset.n)));
    this.on('[data-act=season]', () => this.season());
    (this.el.querySelector<HTMLButtonElement>('.rn-node.now') ?? this.el.querySelector<HTMLButtonElement>('.rn-node'))?.focus();
  }

  // ---------------- Team: upgrades and star cats ----------------
  team() {
    const g = this.g;
    const s = g.save;
    const up = (act: string, name: string, lvl: number, max: number, cost: number, help: string) =>
      `<button class="cm-btn" data-up="${act}" ${lvl >= max ? 'disabled' : s.coins < cost ? 'aria-disabled="true"' : ''} data-help="${help}">${name} <small>Lv ${lvl}${lvl >= max ? ' · max' : ''}</small>${lvl >= max ? '' : coin(cost)}</button>`;
    const cats = STARS.map((c) => {
      const lvl = s.cats[c.id] ?? 0;
      if (!lvl) return `<div class="rn-cat locked"><i class="rn-face" style="--fur:#3a4050"></i><div><b>???</b><span>Joins when you win match ${((c.at - 1) % MATCHES) + 1} of the ${where(c.at).world.cup}.</span></div></div>`;
      const cost = starCost(lvl);
      return `<div class="rn-cat${s.captain === c.id ? ' on' : ''}"><i class="rn-face" style="--fur:${c.fur}"></i><div><b>${c.name} <small>${'◆'.repeat(lvl)}${'◇'.repeat(STAR_MAX - lvl)}</small></b><span>${c.what(lvl)}</span></div>
        <button class="cm-btn" data-cap="${c.id}" ${s.captain === c.id ? 'disabled' : ''} data-help="Make ${c.name} the captain. Only the captain's skill works in a run.">${s.captain === c.id ? 'Captain' : 'Pick'}</button>
        <button class="cm-btn" data-train="${c.id}" ${lvl >= STAR_MAX ? 'disabled' : s.coins < cost ? 'aria-disabled="true"' : ''} data-help="${lvl >= STAR_MAX ? 'Fully trained.' : `Train: ${c.what(lvl + 1)}`}">${lvl >= STAR_MAX ? 'Max' : coin(cost)}</button></div>`;
    }).join('');
    this.panel(
      `<h1 class="cm-title">Team</h1><div class="rn-stat">${coin(s.coins)}</div>
      <div class="rn-row3">
        ${up('team', 'Squad size', s.teamLvl, TEAM_MAX, teamCost(s.teamLvl), `Start with ${startCats(s.teamLvl)} players. Next: ${startCats(s.teamLvl + 1)}.`)}
        ${up('income', 'Coin boost', s.incomeLvl, INCOME_MAX, incomeCost(s.incomeLvl), `Goal coins x${incomeMult(s.incomeLvl).toFixed(2)}. Next: x${incomeMult(s.incomeLvl + 1).toFixed(2)}.`)}
        ${up('stadium', 'Stadium', s.stadiumLvl, STADIUM_MAX, stadiumCost(s.stadiumLvl), `Bigger home stands with more fans. Goal coins x${stadiumMult(s.stadiumLvl).toFixed(2)}. Next: x${stadiumMult(s.stadiumLvl + 1).toFixed(2)}.`)}
      </div>
      <h2 class="cm-label">Aces</h2><div class="rn-cats">${cats}</div>${this.back}`,
      () => this.home(), 'rn-wide',
    );
    this.on('[data-up]', (b) => {
      const k = b.dataset.up!;
      const cost = k === 'team' ? teamCost(s.teamLvl) : k === 'income' ? incomeCost(s.incomeLvl) : stadiumCost(s.stadiumLvl);
      if (!this.pay(cost)) return;
      if (k === 'team') s.teamLvl++;
      else if (k === 'income') s.incomeLvl++;
      else s.stadiumLvl++;
      g.toMenu(g.cur);
      this.redraw(() => this.team(), `[data-up=${k}]`);
    });
    this.on('[data-cap]', (b) => {
      s.captain = b.dataset.cap!;
      g.sfx('select');
      g.toMenu(g.cur);
      this.redraw(() => this.team(), `[data-train=${s.captain}]`);
    });
    this.on('[data-train]', (b) => {
      const id = b.dataset.train!;
      if (!this.pay(starCost(s.cats[id]))) return;
      s.cats[id]++;
      g.sfx('levelUp');
      g.toMenu(g.cur);
      this.redraw(() => this.team(), `[data-train=${id}]`);
    });
    this.on('[data-act=home]', () => this.home(g.cur));
  }

  // ---------------- Clubhouse: trophy room, jerseys, goals ----------------
  club() {
    const g = this.g;
    const s = g.save;
    const cupsWon = Math.floor((s.level - 1) / MATCHES);
    const shelf = LEAGUES.map((name, l) => `<div class="rn-shelf"><span>${name}</span>${WORLDS.map((w, i) => `<div title="${w.cup}">${trophy(w.swatch[1], w.rivalJersey, l * WORLDS.length + i < cupsWon)}<small>${w.cup.replace(' Cup', '')}</small></div>`).join('')}</div>`).join('');
    const how = (j: Jersey) => j.cup !== undefined ? `Win the ${WORLDS[j.cup % WORLDS.length].cup} in the ${LEAGUES[Math.floor(j.cup / WORLDS.length)]}.` : j.stars ? `Earn ${j.stars} stars.` : j.epic ? 'Answer one big pencil-and-paper question.' : `Buy for ${j.cost} coins.`;
    const jerseys = JERSEYS.map((j) => {
      const owned = s.jerseys.includes(j.id);
      const worn = s.jersey === j.id;
      const buy = !owned && j.cost !== undefined;
      return `<button class="cm-btn rn-swatch${worn ? ' worn' : ''}" data-j="${j.id}" style="--sw:${j.color};--tr:${j.trim}" ${owned || buy || j.epic ? '' : 'disabled'} ${buy && s.coins < j.cost! ? 'aria-disabled="true"' : ''}
        data-help="${j.name}. ${worn ? 'Wearing it.' : owned ? 'Wear this jersey.' : how(j)}"><span class="rn-sw"></span><span class="rn-num">${owned ? (worn ? 'On' : 'Wear') : buy ? j.cost : j.epic ? `Epic ${Q}` : j.stars ? `★ ${j.stars}` : 'Cup'}</span></button>`;
    }).join('');
    const goals = GOALS.map((q) => {
      const have = s.stats[q.id] ?? 0;
      const t = s.claimed[q.id] ?? 0;
      if (t >= q.tiers.length) return `<div class="rn-goal done"><div><b>${q.name}</b><span>All done · ${have}</span></div></div>`;
      const need = q.tiers[t];
      return `<div class="rn-goal"><div><b>${q.name} ${'●'.repeat(t)}${'○'.repeat(q.tiers.length - t)}</b><span>${q.text(need)} · ${Math.min(have, need)}/${need}</span><i style="--p:${Math.min(100, (have / need) * 100)}%"></i></div>
        <button class="cm-btn${have >= need ? ' main' : ''}" data-goal="${q.id}" ${have >= need ? '' : 'disabled'} data-help="Collect ${q.reward[t]} coins.">${coin(q.reward[t])}</button></div>`;
    }).join('');
    this.panel(
      `<h1 class="cm-title">Clubhouse</h1><div class="rn-stat">${coin(s.coins)} <span class="rn-stars">★ ${totalStars(s)}</span></div>
      <h2 class="cm-label">Trophy room · ${cupsWon}/${CUPS}</h2><div class="rn-shelves">${shelf}</div>
      <h2 class="cm-label">Jerseys · ${s.jerseys.length}/${JERSEYS.length}</h2><div class="rn-swatches">${jerseys}</div>
      <h2 class="cm-label">Goals</h2><div class="rn-goals">${goals}</div>${this.back}`,
      () => this.home(), 'rn-wide',
    );
    this.on('[data-j]', async (b) => {
      const j = JERSEYS.find((x) => x.id === b.dataset.j)!;
      if (!s.jerseys.includes(j.id)) {
        if (j.epic) {
          if (!(await g.bonus(`The rare ${j.name} jersey`, true))) return;
          g.sfx('unlock');
        } else if (!this.pay(j.cost!)) return;
        s.jerseys.push(j.id);
      }
      s.jersey = j.id;
      g.toMenu(g.cur);
      this.redraw(() => this.club(), `[data-j=${j.id}]`);
    });
    this.on('[data-goal]', (b) => {
      const q = GOALS.find((x) => x.id === b.dataset.goal)!;
      const t = s.claimed[q.id] ?? 0;
      s.coins += q.reward[t];
      s.claimed[q.id] = t + 1;
      g.sfx('coin');
      g.sfx('star');
      this.redraw(() => this.club(), `[data-goal=${q.id}]`);
    });
    this.on('[data-act=home]', () => this.home(g.cur));
  }

  // ---------------- In-run screens ----------------
  pause() {
    const g = this.g;
    if ((g.state !== 'run' && g.state !== 'fight' && g.state !== 'boss') || g.paused) return;
    g.paused = true;
    g.clearKeys();
    const resume = () => {
      this.close();
      g.paused = false;
    };
    const draw = () => {
      const q = g.save.quality;
      this.panel(
        `<h1 class="cm-title">Paused</h1><p class="rn-sub">${matchTitle(g.cur)}</p>
        <button class="cm-btn main rn-main" data-act="resume" data-key="Escape" data-help="Back to the match.">Resume <span class="cm-key">Esc</span></button>
        <button class="cm-btn" data-act="restart" data-key="r" data-help="Start this match again.">Restart <span class="cm-key">R</span></button>
        <button class="cm-btn" data-act="quality" data-key="g" data-help="High: ink outlines, shadows, and glow. Low: smoother on tablets. Auto picks for this device.">Graphics: ${q === 'auto' ? `Auto (${g.low ? 'Low' : 'High'})` : q === 'high' ? 'High' : 'Low'} <span class="cm-key">G</span></button>
        <button class="cm-btn" data-act="menu" data-key="m" data-help="Back to the start screen.">Menu <span class="cm-key">M</span></button>`,
        resume,
      );
      this.on('[data-act=resume]', resume);
      this.on('[data-act=restart]', () => g.play());
      this.on('[data-act=menu]', () => this.home(g.cur));
      this.on('[data-act=quality]', () => {
        g.save.quality = q === 'auto' ? 'high' : q === 'high' ? 'low' : 'auto';
        g.applyQuality();
        g.persist();
        draw();
        this.el.querySelector<HTMLButtonElement>('[data-act=quality]')?.focus();
      });
    };
    draw();
  }

  lost(opp: number, revived: boolean) {
    const g = this.g;
    g.paused = true;
    g.clearKeys();
    const back = Math.max(REVIVE_MIN, startCats(g.save.teamLvl), opp + 5);
    this.panel(
      `<h1 class="cm-title">Team down</h1><p class="rn-sub">${matchTitle(g.cur)}</p>
      <button class="cm-btn main rn-main rn-q" data-act="revive" ${revived ? 'disabled' : ''} data-help="Answer a question. ${back} players return right here.">Revive team ${Q}</button>
      <button class="cm-btn" data-act="again" data-key="r" data-help="Start this match again.">Try again <span class="cm-key">R</span></button>
      <button class="cm-btn" data-act="menu" data-key="m" data-help="Upgrades, aces, and the season map.">Menu <span class="cm-key">M</span></button>`,
      () => this.home(g.cur),
    );
    this.on('[data-act=revive]', async () => {
      if (!(await g.bonus(`Bring back ${back} players`))) return;
      this.close();
      g.revive(back);
    });
    this.on('[data-act=again]', () => g.play());
    this.on('[data-act=menu]', () => this.home(g.cur));
  }

  end(reward: number, stars: number, news: string[], cupFinal: boolean) {
    const g = this.g;
    g.refreshHud();
    let tripled = false;
    let pile = false;
    const next = g.cur + 1;
    const draw = (focus?: string) => {
      const total = reward * (tripled ? COIN_MULT : 1) + (pile ? reward * EPIC_PILE : 0);
      this.panel(
        `<h1 class="cm-title rn-logo">Goal</h1><p class="rn-sub">${matchTitle(g.cur)}</p>
        <div class="rn-bigstars">${stars3(stars)}</div>
        <p class="rn-sub">${stars === 3 ? 'Flawless.' : `${stars === 1 ? g.level.star2 : g.level.star3} players left after the goal earns ${stars + 1} stars. You had ${g.count}.`}</p>
        <div class="rn-stat big">${coin('+' + total)}</div>
        ${news.map((x) => `<p class="rn-news">${x}</p>`).join('')}
        <button class="cm-btn main rn-main" data-act="next" data-help="${matchTitle(next)}.">Next match <span class="cm-key">Enter</span></button>
        <button class="cm-btn rn-q" data-act="triple" ${tripled ? 'disabled' : ''} data-help="Answer a question. Get ${reward * COIN_MULT} coins instead of ${reward}.">${tripled ? 'Tripled' : 'Triple coins'} ${Q}</button>
        ${cupFinal ? `<button class="cm-btn rn-q rn-epic" data-act="pile" ${pile ? 'disabled' : ''} data-help="One big pencil-and-paper question. Win a gold vault of ${reward * EPIC_PILE} coins.">${pile ? 'Gold vault won' : `Gold vault +${reward * EPIC_PILE}`} ${Q}</button>` : ''}
        <button class="cm-btn" data-act="menu" data-key="m" data-help="Upgrades, aces, and the season map.">Menu <span class="cm-key">M</span></button>`,
        () => this.home(next), 'rn-end',
      );
      this.on('[data-act=next]', () => g.play(next));
      this.on('[data-act=menu]', () => this.home(next));
      this.on('[data-act=triple]', async () => {
        if (tripled || !(await g.bonus(`Triple your ${reward} goal coins`))) return;
        tripled = true;
        g.save.coins += reward * (COIN_MULT - 1);
        g.persist();
        g.refreshHud();
        draw('[data-act=next]');
      });
      this.on('[data-act=pile]', async () => {
        if (pile || !(await g.bonus(`A gold vault of ${reward * EPIC_PILE} coins`, true))) return;
        pile = true;
        g.save.coins += reward * EPIC_PILE;
        g.persist();
        g.refreshHud();
        g.sfx('unlock');
        draw('[data-act=next]');
      });
      if (focus) this.el.querySelector<HTMLButtonElement>(focus)?.focus();
    };
    draw();
  }
}
