import { audio } from './audio';
import type { BonusRequest, BonusResult, Player, Question, Subject } from './contract';
import { nextQuestion } from './questions';
import { readLocal, writeLocal } from './store';
import { ICON, el, openDialog } from './ui';

const SUBJECTS: Subject[] = ['math', 'spelling', 'grammar', 'history'];
const SUBJECT_NAME: Record<Subject, string> = { math: 'Math', spelling: 'Spelling', grammar: 'Grammar', history: 'History' };
const TRIES = 3;
const CELEBRATE_MS = 1400;

/** Each question takes the next subject in turn; the turn is kept per player across visits. */
function nextSubject(playerId: string): Subject {
  const key = `camalot.turn.${playerId}`;
  const turn = readLocal<number>(key) ?? 0;
  writeLocal(key, turn + 1);
  return SUBJECTS[((turn % SUBJECTS.length) + SUBJECTS.length) % SUBJECTS.length];
}

function speak(text: string) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

let open: Promise<BonusResult> | null = null;

/** The question card. A second call while the card is open gets the same answer. */
export function earnBonus(player: Player, req: BonusRequest): Promise<BonusResult> {
  open ??= runCard(player, req).finally(() => (open = null));
  return open;
}

function runCard(player: Player, req: BonusRequest): Promise<BonusResult> {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const d = openDialog('Bonus question');
  return new Promise((resolve) => {
    const size = req.size ?? 'normal';
    const epic = size === 'epic';
    let settled = false;
    let onKey: ((e: KeyboardEvent) => void) | null = null;

    const finish = (earned: boolean) => {
      if (settled) return;
      settled = true;
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      d.close();
      d.remove();
      returnFocus?.focus();
      resolve({ earned });
    };
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    d.addEventListener('close', () => finish(false));
    d.addEventListener('keydown', (e) => onKey?.(e));

    /** Card frame: reward, subject, try count, prompt, then the body. Close sits last in tab order. */
    const frame = (q: Question | null, tryNo: number, title?: string) => {
      const panel = el('div', epic ? 'cm-panel cm-card cm-card-epic' : 'cm-panel cm-card');
      panel.tabIndex = -1;
      panel.append(el('p', 'cm-label', epic ? 'Big bonus' : 'Bonus'), el('h2', 'cm-card-reward', title ?? req.reward));
      const body = el('div', 'cm-card-body');
      if (q) {
        const meta = el('p', 'cm-card-meta');
        meta.append(el('span', 'cm-card-chip', SUBJECT_NAME[q.subject]), ` Try ${tryNo} of ${TRIES}`);
        if (epic) panel.append(el('p', 'cm-card-epic-note', 'Big bonus: grab paper and a pencil.'));
        panel.append(meta, el('p', 'cm-card-prompt', q.prompt));
      }
      const close = el('button', 'cm-btn cm-card-close');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close');
      close.innerHTML = `${ICON.close}<span class="cm-key">Esc</span>`;
      close.addEventListener('click', () => finish(false));
      panel.append(body, close);
      d.replaceChildren(panel);
      return { panel, body };
    };

    const win = () => {
      audio.sfx('levelUp');
      const { panel, body } = frame(null, 0, 'You got it!');
      panel.classList.add('cm-card-win');
      panel.querySelector('.cm-card-close')!.remove(); // any key or tap already returns to the game
      body.append(el('p', 'cm-card-earned', req.reward));
      const burst = el('div', 'cm-burst');
      for (let i = 0; i < 18; i++) {
        const c = el('i');
        const a = (i / 18) * Math.PI * 2;
        const r = 110 + (i % 3) * 40;
        c.style.cssText = `--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r)}px;--r:${(i * 47) % 360}deg;--c:${
          ['var(--cm-gold)', 'var(--cm-player)', 'var(--cm-mana)', 'var(--cm-good)'][i % 4]
        }`;
        burst.append(c);
      }
      panel.append(burst);
      panel.focus();
      // Any key or tap skips the celebration and goes straight back to the game.
      const timer = setTimeout(() => finish(true), CELEBRATE_MS);
      const skip = () => {
        clearTimeout(timer);
        finish(true);
      };
      onKey = (e) => {
        if (!e.repeat) skip();
      };
      panel.addEventListener('pointerdown', skip);
    };

    const miss = (body: HTMLElement, q: Question, right: string, tryNo: number) => {
      onKey = null;
      audio.sfx('error');
      const box = el('div', 'cm-card-miss');
      const ans = el('p', 'cm-card-answer', 'The answer is ');
      ans.append(el('strong', '', right));
      box.append(el('p', 'cm-card-missed', 'Not quite.'), ans, el('p', 'cm-card-explain', q.explain));
      const next = el('button', 'cm-btn main');
      next.type = 'button';
      if (tryNo < TRIES) {
        next.innerHTML = 'Next try <span class="cm-key">Enter</span>';
        next.addEventListener('click', () => ask(tryNo + 1));
      } else {
        box.append(el('p', 'cm-card-kind', 'Good try. The bonus waits for next time.'));
        next.innerHTML = 'Back to game <span class="cm-key">Enter</span>';
        next.addEventListener('click', () => finish(false));
      }
      box.append(next);
      body.append(box);
      next.focus();
    };

    const ask = (tryNo: number) => {
      const q = nextQuestion(player.grade, nextSubject(player.id), size);
      const { panel, body } = frame(q, tryNo);

      if (q.kind === 'choice') {
        const grid = el('div', 'cm-card-choices');
        const buttons = q.choices.map((c, i) => {
          const b = el('button', 'cm-btn cm-card-choice');
          b.type = 'button';
          b.innerHTML = `<span class="cm-key">${i + 1}</span>`;
          b.append(el('span', '', c));
          b.addEventListener('click', () => pick(i));
          grid.append(b);
          return b;
        });
        const pick = (i: number) => {
          onKey = null;
          buttons.forEach((b) => (b.disabled = true));
          buttons[q.answer].classList.add('good');
          if (i === q.answer) return win();
          buttons[i].classList.add('bad');
          miss(body, q, q.choices[q.answer], tryNo);
        };
        onKey = (e) => {
          const n = Number(e.key);
          if (!e.repeat && Number.isInteger(n) && n >= 1 && n <= q.choices.length) {
            e.preventDefault();
            pick(n - 1);
          }
        };
        body.append(grid);
        panel.focus(); // nothing lit, so no choice looks suggested; keys 1-4 or Tab
        return;
      }

      const form = el('form', 'cm-card-typed');
      const label = el('label', 'cm-label', q.subject === 'spelling' ? 'Spell the word' : 'Your answer');
      label.htmlFor = 'cm-answer';
      const input = el('input', 'cm-input');
      input.id = 'cm-answer';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('autocorrect', 'off');
      // Number pad when an accepted answer is a plain number; the full keyboard when it needs "-" or "/".
      input.inputMode = q.answers.some((a) => /^[0-9.]+$/.test(a.trim())) ? 'decimal' : 'text';
      input.enterKeyHint = 'done';
      const row = el('div', 'cm-card-row');
      row.append(input);
      const check = el('button', 'cm-btn main');
      check.type = 'submit';
      check.innerHTML = 'Check <span class="cm-key">Enter</span>';
      row.append(check);
      form.append(label, row);

      const say = q.speak;
      if (say && 'speechSynthesis' in window) {
        const hear = el('button', 'cm-btn cm-card-hear');
        hear.type = 'button';
        hear.innerHTML = `${ICON.speak}<span>Hear it</span>`;
        hear.addEventListener('click', () => {
          speak(say);
          input.focus();
        });
        form.prepend(hear);
        speak(say);
      }

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const typed = input.value.trim().toLowerCase();
        if (!typed) return input.focus();
        input.disabled = true;
        check.disabled = true;
        if (q.answers.some((a) => a.trim().toLowerCase() === typed)) return win();
        input.classList.add('bad');
        miss(body, q, q.answers[0], tryNo);
      });
      body.append(form);
      input.focus();
    };

    ask(1);
  });
}
