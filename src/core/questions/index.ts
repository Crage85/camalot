// School question bank. Content and standards: see SOURCES.md. Self-check: node src/core/questions/selfcheck.mjs
import type { Grade, Subject, Question, ChoiceQuestion, TypedQuestion, NextQuestion } from '../contract';
import history6 from './data/history6.json' with { type: 'json' };
import history8 from './data/history8.json' with { type: 'json' };
import grammar6 from './data/grammar6.json' with { type: 'json' };
import grammar8 from './data/grammar8.json' with { type: 'json' };
import spelling6 from './data/spelling6.json' with { type: 'json' };
import spelling8 from './data/spelling8.json' with { type: 'json' };
import math6 from './data/math6.json' with { type: 'json' };
import math8 from './data/math8.json' with { type: 'json' };

// ---------- helpers ----------

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

function shuffle<T>(xs: readonly T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const commas = (n: number) => n.toLocaleString('en-US');
const NAMES = ['Maya', 'Ava', 'Lena', 'Zoe', 'Kai', 'Leo', 'Sofia', 'Emma', 'Nora', 'Eli'];

/** Adds a Unicode-minus copy of every answer that starts with a hyphen. */
const addMinus = (xs: string[]) => [...xs, ...xs.filter((s) => s.startsWith('-')).map((s) => '−' + s.slice(1))];

const intAnswers = (n: number) => addMinus(Math.abs(n) >= 1000 ? [String(n), commas(n)] : [String(n)]);

/** v / 10^k as a decimal string, trailing zeros removed. */
function scaled(v: number, k: number): string {
  const s = String(Math.abs(v)).padStart(k + 1, '0');
  const whole = s.slice(0, s.length - k);
  const frac = s.slice(s.length - k).replace(/0+$/, '');
  return (v < 0 ? '-' : '') + whole + (frac ? '.' + frac : '');
}

/** v / 10^k with exactly k decimal places. */
function fixed(v: number, k: number): string {
  if (k === 0) return String(v);
  const s = String(Math.abs(v)).padStart(k + 1, '0');
  return (v < 0 ? '-' : '') + s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
}

/** Accepted forms of the decimal v / 10^k: short, fixed places, and without the leading zero. */
function decAnswers(v: number, k: number): string[] {
  const forms = new Set([scaled(v, k), fixed(v, k)]);
  for (const f of [...forms]) if (/^-?0\./.test(f)) forms.add(f.replace('0.', '.'));
  return addMinus([...forms]);
}

/** Exact decimal for n/d if it terminates within 6 places. */
function exactDecimal(n: number, d: number): string | null {
  let p = 1;
  for (let k = 0; k <= 6; k++, p *= 10) if (p % d === 0) return scaled((n * p) / d, k);
  return null;
}

function reduce(n: number, d: number): [number, number] {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}

/** Simplest text for n/d: whole number, or reduced fraction. */
function fracText(n: number, d: number): string {
  const [a, b] = reduce(n, d);
  return b === 1 ? String(a) : `${a}/${b}`;
}

/** Accepted forms of n/d: whole number, or simplest fraction, mixed number, and exact decimal. */
function fracAnswers(n: number, d: number): string[] {
  const [a, b] = reduce(n, d);
  if (b === 1) return intAnswers(a);
  const out = [`${a}/${b}`];
  if (Math.abs(a) > b) out.push(`${a < 0 ? '-' : ''}${Math.floor(Math.abs(a) / b)} ${Math.abs(a) % b}/${b}`);
  const dec = exactDecimal(a, b);
  if (dec) {
    out.push(dec);
    if (/^-?0\./.test(dec)) out.push(dec.replace('0.', '.'));
  }
  return addMinus(out);
}

const money = (cents: number) => fixed(cents, 2);
function moneyAnswers(cents: number): string[] {
  const forms = [...new Set([money(cents), scaled(cents, 2)])];
  return forms.flatMap((s) => [s, '$' + s]);
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sup = (n: number) => [...String(n)].map((c) => SUP[c]).join('');

/** "3x", "x", "-x", "-3x" */
const term = (a: number, v: string) => (a === 1 ? v : a === -1 ? '-' + v : `${a}${v}`);
/** " + 3", " - 3", "" ; or with a variable: " + 2y", " - y" */
const plus = (b: number, v = '') => (b === 0 ? '' : b > 0 ? ` + ${term(b, v) || b}` : ` - ${term(-b, v) || -b}`);
const signed = (n: number) => String(n); // integers shown with a hyphen minus

/** Every accepted way to type m x 10^e. */
function sciAnswers(m: string, e: number): string[] {
  const out: string[] = [];
  const pows = [`10^${e}`, `10${sup(e)}`];
  if (e < 0) pows.push(`10^−${-e}`, `10^(${e})`);
  const mants = m.includes('.') ? [m] : [m, m + '.0'];
  for (const mm of mants) {
    for (const sep of ['×', 'x', '*', '·'])
      for (const sp of ['', ' '])
        for (const p of pows) out.push(`${mm}${sp}${sep}${sp}${p}`);
    out.push(`${mm}e${e}`);
  }
  return out;
}

/** Epic (pencil-and-paper) math: every typed math prompt opens with this. */
export const EPIC_LEAD = 'Grab paper and a pencil. ';

const typed = (grade: Grade, standard: string, prompt: string, answers: string[], explain: string): TypedQuestion => ({
  kind: 'typed',
  subject: 'math',
  grade,
  prompt: EPIC_LEAD + prompt,
  answers: [...new Set(answers)],
  explain,
  standard,
});

// ---------- grade 6 epic math (CAS Mathematics 2020, grade 6): typed, needs paper ----------

const g6: Record<string, () => TypedQuestion> = {
  unitPrice() {
    const unit = 25 * rnd(2, 20);
    const n = rnd(2, 8);
    const item = pick(['bags of cat treats', 'ski lift tickets', 'soccer balls', 'beach towels', 'dragon stickers', 'packs of trading cards']);
    return typed(6, '6.RP.A.3.b', `${pick(NAMES)} pays $${money(unit * n)} for ${n} ${item}. Each one costs the same. How many dollars does one cost?`,
      moneyAnswers(unit), `$${money(unit * n)} ÷ ${n} = $${money(unit)} for each one.`);
  },
  speed() {
    const r = 5 * rnd(2, 18);
    const h = rnd(2, 6);
    const who = pick(['A dragon flies', 'A train travels', 'A sailboat sails', 'A hawk flies']);
    return typed(6, '6.RP.A.3.b', `${who} ${r * h} miles in ${h} hours at a steady speed. How many miles does it go in 1 hour?`,
      intAnswers(r), `${r * h} ÷ ${h} = ${r} miles per hour.`);
  },
  percent() {
    const p = pick([5, 10, 20, 25, 30, 40, 50, 60, 75]);
    const step = 100 / gcd(p, 100);
    const whole = step * rnd(Math.ceil(20 / step), Math.floor(400 / step));
    const part = (p * whole) / 100;
    const prompt = Math.random() < 0.5
      ? `What is ${p}% of ${whole}?`
      : `There are ${whole} kids at ski camp. ${p}% of them ride snowboards. How many kids ride snowboards?`;
    return typed(6, '6.RP.A.3.c', prompt, intAnswers(part), `${p}% means ${p} out of every 100. ${whole} × ${p} ÷ 100 = ${part}.`);
  },
  ratio() {
    const a = rnd(2, 6);
    let b = rnd(2, 9);
    while (b === a) b = rnd(2, 9);
    const m = rnd(2, 8);
    const prompt = Math.random() < 0.5
      ? `A smoothie recipe uses ${a} cups of strawberries for every ${b} cups of yogurt. How many cups of yogurt go with ${a * m} cups of strawberries?`
      : `To make sea-green paint, mix ${a} cans of blue paint for every ${b} cans of yellow paint. How many cans of yellow paint go with ${a * m} cans of blue paint?`;
    return typed(6, '6.RP.A.3.a', prompt, intAnswers(b * m), `${a * m} is ${m} times ${a}, so multiply ${b} by ${m}: ${b * m}.`);
  },
  fractionDivide() {
    for (;;) {
      const b = rnd(2, 9), d = rnd(2, 9), a = rnd(1, b - 1), c = rnd(1, d - 1);
      if (gcd(a, b) !== 1 || gcd(c, d) !== 1) continue;
      const [rn, rd] = reduce(a * d, b * c);
      if (rd > 12 || rn > 40) continue;
      const ans = fracAnswers(rn, rd);
      return typed(6, '6.NS.A.1', `What is ${a}/${b} ÷ ${c}/${d}? Type a whole number, a fraction in simplest form, or a mixed number.`, ans,
        `Multiply by the flipped fraction: ${a}/${b} × ${d}/${c} = ${a * d}/${b * c}, which is ${ans.length > 1 && ans[1].includes(' ') ? `${ans[0]} or ${ans[1]}` : ans[0]}.`);
    }
  },
  fractionStory() {
    for (;;) {
      const d = pick([2, 3, 4, 6, 8, 10, 12]);
      const b = pick([2, 3, 4, 6, 8, 10, 12].filter((x) => d % x === 0));
      const a = rnd(1, b - 1);
      if (gcd(a, b) !== 1 || (a * d) / b < 2) continue;
      const n = (a * d) / b;
      return typed(6, '6.NS.A.1', `${pick(NAMES)} has ${a}/${b} of a pound of trail mix. Each bag holds 1/${d} of a pound. How many bags can be filled?`,
        intAnswers(n), `${a}/${b} ÷ 1/${d} = ${a}/${b} × ${d} = ${n}.`);
    }
  },
  decimals() {
    const op = pick(['+', '-', '×']);
    if (op === '×') {
      const x = rnd(11, 99), y = rnd(2, 9);
      return typed(6, '6.NS.B.3', `What is ${scaled(x, 1)} × ${y}?`, decAnswers(x * y, 1), `${scaled(x, 1)} × ${y} = ${scaled(x * y, 1)}.`);
    }
    let x = rnd(101, 9999), y = rnd(101, 9999);
    if (op === '-' && y > x) [x, y] = [y, x];
    const v = op === '+' ? x + y : x - y;
    return typed(6, '6.NS.B.3', `What is ${fixed(x, 2)} ${op} ${fixed(y, 2)}?`, decAnswers(v, 2), `Line up the decimal points: ${fixed(x, 2)} ${op} ${fixed(y, 2)} = ${fixed(v, 2)}.`);
  },
  longDivision() {
    const d = rnd(12, 48), q = rnd(15, 250);
    return typed(6, '6.NS.B.2', `What is ${commas(d * q)} ÷ ${d}?`, intAnswers(q), `${d} × ${q} = ${commas(d * q)}, so ${commas(d * q)} ÷ ${d} = ${q}.`);
  },
  gcf() {
    for (;;) {
      const g = rnd(2, 12), m = rnd(2, 9), n = rnd(2, 9);
      if (m === n || gcd(m, n) !== 1 || g * Math.max(m, n) > 100) continue;
      return typed(6, '6.NS.B.4', `What is the greatest common factor (GCF) of ${g * m} and ${g * n}?`, intAnswers(g),
        `${g * m} = ${g} × ${m} and ${g * n} = ${g} × ${n}. ${m} and ${n} share no other factor, so the GCF is ${g}.`);
    }
  },
  lcm() {
    const a = rnd(2, 12);
    let b = rnd(2, 12);
    while (b === a) b = rnd(2, 12);
    const l = (a * b) / gcd(a, b);
    const prompt = Math.random() < 0.5
      ? `What is the least common multiple (LCM) of ${a} and ${b}?`
      : `Hot dogs come in packs of ${a} and buns come in packs of ${b}. What is the smallest number of hot dogs you can buy to have exactly as many hot dogs as buns?`;
    return typed(6, '6.NS.B.4', prompt, intAnswers(l), `The smallest number that both ${a} and ${b} divide into evenly is ${l}.`);
  },
  exponents() {
    const b = rnd(2, 6), e = b <= 4 ? pick([2, 3]) : 2, p = b ** e, x = rnd(2, 9), y = rnd(2, 9);
    const form = rnd(1, 3);
    if (form === 1) return typed(6, '6.EE.A.1', `What is ${b}${sup(e)}?`, intAnswers(p), `${b}${sup(e)} means ${Array(e).fill(b).join(' × ')} = ${p}.`);
    if (form === 2) return typed(6, '6.EE.A.1', `What is ${b}${sup(e)} + ${x} × ${y}?`, intAnswers(p + x * y),
      `Exponents first, then multiply, then add: ${p} + ${x * y} = ${p + x * y}.`);
    const z = rnd(1, p - 1);
    return typed(6, '6.EE.A.1', `What is ${x} × (${b}${sup(e)} - ${z})?`, intAnswers(x * (p - z)),
      `Inside the parentheses first: ${p} - ${z} = ${p - z}. Then ${x} × ${p - z} = ${x * (p - z)}.`);
  },
  evaluate() {
    const a = rnd(2, 9);
    if (Math.random() < 0.5) {
      const c = rnd(1, 20), x = rnd(1, 10);
      return typed(6, '6.EE.A.2.c', `What is the value of ${a}x + ${c} when x = ${x}?`, intAnswers(a * x + c), `${a} × ${x} + ${c} = ${a * x} + ${c} = ${a * x + c}.`);
    }
    const c = rnd(1, 5), x = rnd(c + 1, 12);
    return typed(6, '6.EE.A.2.c', `What is the value of ${a}(x - ${c}) when x = ${x}?`, intAnswers(a * (x - c)), `${a} × (${x} - ${c}) = ${a} × ${x - c} = ${a * (x - c)}.`);
  },
  oneStepEquation() {
    const form = rnd(1, 3);
    if (form === 1) {
      const x = rnd(2, 60), p = rnd(3, 50);
      return typed(6, '6.EE.B.7', `Solve for x: x + ${p} = ${x + p}`, intAnswers(x), `Subtract ${p} from both sides: x = ${x + p} - ${p} = ${x}.`);
    }
    if (form === 2) {
      const x = rnd(2, 15), p = rnd(2, 12);
      return typed(6, '6.EE.B.7', `Solve for x: ${p}x = ${p * x}`, intAnswers(x), `Divide both sides by ${p}: x = ${p * x} ÷ ${p} = ${x}.`);
    }
    const x = rnd(5, 40), p = rnd(5, 30);
    return typed(6, '6.EE.B.7', `${pick(NAMES)} had some seashells. After finding ${p} more, there are ${x + p}. How many seashells were there at first?`,
      intAnswers(x), `x + ${p} = ${x + p}, so x = ${x + p} - ${p} = ${x}.`);
  },
  area() {
    const unit = pick(['feet', 'inches', 'meters']);
    if (Math.random() < 0.5) {
      let b = rnd(2, 20), h = rnd(2, 20);
      if ((b * h) % 2) b += 1;
      return typed(6, '6.G.A.1', `A triangle-shaped sail has a base of ${b} ${unit} and a height of ${h} ${unit}. What is its area in square ${unit}?`,
        intAnswers((b * h) / 2), `Triangle area = base × height ÷ 2 = ${b} × ${h} ÷ 2 = ${(b * h) / 2}.`);
    }
    const b = rnd(2, 20), h = rnd(2, 15);
    return typed(6, '6.G.A.1', `A parallelogram has a base of ${b} ${unit} and a height of ${h} ${unit}. What is its area in square ${unit}?`,
      intAnswers(b * h), `Parallelogram area = base × height = ${b} × ${h} = ${b * h}.`);
  },
  volume() {
    for (;;) {
      const l = rnd(2, 10), w = rnd(2, 8);
      if (Math.random() < 0.5) {
        const h = rnd(2, 6);
        return typed(6, '6.G.A.2', `A toy box is ${l} feet long, ${w} feet wide, and ${h} feet tall. What is its volume in cubic feet?`,
          intAnswers(l * w * h), `Volume = length × width × height = ${l} × ${w} × ${h} = ${l * w * h}.`);
      }
      if ((l * w) % 2) continue;
      const k = rnd(1, 4); // height k and a half
      const v = (l * w * (2 * k + 1)) / 2;
      return typed(6, '6.G.A.2', `A fish tank is ${l} feet long, ${w} feet wide, and ${k} 1/2 feet tall. What is its volume in cubic feet?`,
        intAnswers(v), `Volume = ${l} × ${w} × ${k} 1/2 = ${l * w} × ${k} 1/2 = ${v}.`);
    }
  },
  meanMedian() {
    for (;;) {
      const m = rnd(8, 30);
      const xs = [rnd(m - 7, m + 7), rnd(m - 7, m + 7), rnd(m - 7, m + 7), rnd(m - 7, m + 7)];
      const last = 5 * m - xs.reduce((s, x) => s + x, 0);
      if (last < 1 || last > 60) continue;
      xs.push(last);
      const list = xs.join(', ');
      if (Math.random() < 0.5)
        return typed(6, '6.SP.B.5.c', `${pick(NAMES)}'s ski runs took ${list} minutes. What is the mean (average) time in minutes?`, intAnswers(m),
          `Add them: ${5 * m}. Divide by 5: ${5 * m} ÷ 5 = ${m}.`);
      const sorted = xs.slice().sort((a, b) => a - b);
      return typed(6, '6.SP.B.5.c', `The soccer team scored these goals in five games: ${list}. What is the median?`, intAnswers(sorted[2]),
        `In order: ${sorted.join(', ')}. The middle number is ${sorted[2]}.`);
    }
  },
  changeDue() {
    for (;;) {
      const a = rnd(2, 4), b = rnd(2, 4), h = 25 * rnd(8, 60), g = 25 * rnd(12, 80);
      const cost = a * h + b * g, bill = cost < 5000 ? 5000 : 10000;
      if (cost >= bill) continue;
      return typed(6, '6.NS.B.3', `${pick(NAMES)} buys ${a} hats at $${money(h)} each and ${b} pairs of gloves at $${money(g)} each. She pays with a $${bill / 100} bill. How much change does she get, in dollars?`,
        moneyAnswers(bill - cost), `Hats: ${a} × $${money(h)} = $${money(a * h)}. Gloves: ${b} × $${money(g)} = $${money(b * g)}. Total $${money(cost)}. Change: $${money(bill)} - $${money(cost)} = $${money(bill - cost)}.`);
    }
  },
  compositeArea() {
    const L = rnd(10, 24), W = rnd(8, 18), l = rnd(2, L - 4), w = rnd(2, W - 4);
    return typed(6, '6.G.A.1', `An L-shaped patio is a ${L} by ${W} foot rectangle with a ${l} by ${w} foot rectangle cut out of one corner. What is its area in square feet?`,
      intAnswers(L * W - l * w), `Big rectangle: ${L} × ${W} = ${L * W}. Cut-out: ${l} × ${w} = ${l * w}. Patio: ${L * W} - ${l * w} = ${L * W - l * w}.`);
  },
};

// ---------- grade 8 epic math (CAS Mathematics 2020, grade 8): typed, needs paper ----------

const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
const triple = () => {
  const [a, b, c] = pick(TRIPLES);
  const k = rnd(1, Math.floor(60 / c));
  return [a * k, b * k, c * k];
};

const g8: Record<string, () => TypedQuestion> = {
  linearEquation() {
    for (;;) {
      const x = rnd(-10, 10), a = rnd(2, 9), c = rnd(1, 9), b = rnd(-20, 20);
      if (a === c || b === 0) continue;
      const d = (a - c) * x + b;
      return typed(8, '8.EE.C.7', `Solve for x: ${a}x${plus(b)} = ${term(c, 'x')}${plus(d)}`, intAnswers(x),
        `Subtract ${term(c, 'x')} from both sides: ${term(a - c, 'x')}${plus(b)} = ${d}. Then ${term(a - c, 'x')} = ${d - b}, so x = ${x}.`);
    }
  },
  distributiveEquation() {
    const x = rnd(-8, 12), p = rnd(1, 9), a = rnd(2, 9), q = a * (x + p);
    return typed(8, '8.EE.C.7', `Solve for x: ${a}(x + ${p}) = ${q}`, intAnswers(x),
      `Divide both sides by ${a}: x + ${p} = ${x + p}. Subtract ${p}: x = ${x}.`);
  },
  slope() {
    for (;;) {
      const x1 = rnd(-6, 6), y1 = rnd(-6, 6), run = rnd(-6, 6), rise = rnd(-9, 9);
      if (run === 0) continue;
      const x2 = x1 + run, y2 = y1 + rise;
      return typed(8, '8.EE.B.6', `What is the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2})? Type a whole number or a fraction in simplest form.`,
        fracAnswers(rise, run), `Slope = change in y ÷ change in x = (${y2} - ${signed(y1)}) ÷ (${x2} - ${signed(x1)}) = ${rise}/${run} = ${fracText(rise, run)}.`.replace(/- -/g, '+ '));
    }
  },
  rateOfChange() {
    const m = rnd(-5, 6) || 3, b = rnd(-10, 10), x0 = rnd(1, 3);
    const pts = [0, 1, 2].map((i) => `when x = ${x0 + i}, y = ${m * (x0 + i) + b}`).join('; ');
    return Math.random() < 0.5
      ? typed(8, '8.F.B.4', `A linear function has these values: ${pts}. What is its rate of change (slope)?`, intAnswers(m),
        `Each time x goes up by 1, y changes by ${m}.`)
      : typed(8, '8.F.B.4', `A linear function has these values: ${pts}. What is its initial value (the value of y when x = 0)?`, intAnswers(b),
        `y changes by ${m} each step. Work back from x = ${x0} to x = 0: ${m * x0 + b} - ${x0} × (${m}) = ${b}.`);
  },
  evaluateFunction() {
    const m = rnd(-6, 9) || 2, b = rnd(-12, 12), x = rnd(-6, 8);
    return typed(8, '8.F.A.1', `If f(x) = ${term(m, 'x')}${plus(b)}, what is f(${x})?`, intAnswers(m * x + b),
      `Replace x with ${x}: ${m} × (${x})${plus(b)} = ${m * x + b}.`);
  },
  exponentRules() {
    const a = rnd(2, 9), m = rnd(-4, 8), n = rnd(-4, 8);
    const form = rnd(1, 3);
    if (form === 1)
      return typed(8, '8.EE.A.1', `Write ${a}${sup(m)} × ${a}${sup(n)} as a single power of ${a}. What is the exponent?`, intAnswers(m + n),
        `When you multiply powers with the same base, add the exponents: ${m} + ${signed(n)} = ${m + n}.`.replace('+ -', '- '));
    if (form === 2)
      return typed(8, '8.EE.A.1', `Write ${a}${sup(m)} ÷ ${a}${sup(n)} as a single power of ${a}. What is the exponent?`, intAnswers(m - n),
        `When you divide powers with the same base, subtract the exponents: ${m} - (${n}) = ${m - n}.`);
    const p = rnd(2, 4);
    return typed(8, '8.EE.A.1', `Write (${a}${sup(m)})${sup(p)} as a single power of ${a}. What is the exponent?`, intAnswers(m * p),
      `A power of a power multiplies the exponents: ${m} × ${p} = ${m * p}.`);
  },
  sciToStandard() {
    const t = rnd(11, 99); // mantissa in tenths: 1.1 to 9.9
    const ms = scaled(t, 1);
    if (Math.random() < 0.6) {
      const e = rnd(3, 9);
      const v = t * 10 ** (e - 1);
      return typed(8, '8.EE.A.3', `Write ${ms} × 10${sup(e)} in standard form.`, intAnswers(v),
        `Move the decimal point ${e} places to the right: ${commas(v)}.`);
    }
    const e = -rnd(1, 6);
    const s = scaled(t, 1 - e);
    return typed(8, '8.EE.A.3', `Write ${ms} × 10${sup(e)} in standard form.`, [s, s.replace(/^0\./, '.')],
      `Move the decimal point ${-e} place${e === -1 ? '' : 's'} to the left: ${s}.`);
  },
  standardToSci() {
    const t = rnd(11, 99);
    const ms = scaled(t, 1);
    const e = Math.random() < 0.6 ? rnd(3, 9) : -rnd(1, 6);
    const shown = e > 0 ? commas(t * 10 ** (e - 1)) : scaled(t, 1 - e);
    return typed(8, '8.EE.A.3', `Write ${shown} in scientific notation. Type it like a x 10^b (use x for times and ^ for the power).`,
      sciAnswers(ms, e), `${shown} = ${ms} × 10${sup(e)}. The first number must be at least 1 and less than 10.`);
  },
  sciMultiply() {
    const [a, b] = pick([[2, 2], [2, 3], [2, 4], [3, 3], [2, 1.5], [4, 2], [1.5, 3], [1.2, 4], [2.5, 2], [3, 1.1]]);
    const m = rnd(2, 8), n = rnd(2, 8);
    const prod = scaled(Math.round(a * b * 100), 2);
    return typed(8, '8.EE.A.4', `Multiply (${a} × 10${sup(m)}) × (${b} × 10${sup(n)}). Write the answer in scientific notation, like a x 10^b.`,
      sciAnswers(prod, m + n), `Multiply the numbers: ${a} × ${b} = ${prod}. Add the exponents: ${m} + ${n} = ${m + n}. Answer: ${prod} × 10${sup(m + n)}.`);
  },
  roots() {
    if (Math.random() < 0.6) {
      const r = rnd(2, 15);
      return typed(8, '8.EE.A.2', `Solve x² = ${r * r}, where x is positive.`, intAnswers(r), `${r} × ${r} = ${r * r}, so x = ${r}.`);
    }
    const r = rnd(2, 10);
    return typed(8, '8.EE.A.2', `What is the cube root of ${commas(r ** 3)}?`, intAnswers(r), `${r} × ${r} × ${r} = ${commas(r ** 3)}.`);
  },
  pythagorean() {
    const [a, b, c] = triple();
    const form = rnd(1, 3);
    if (form === 1)
      return typed(8, '8.G.B.7', `A right triangle has legs of ${a} and ${b}. How long is the hypotenuse?`, intAnswers(c),
        `a² + b² = c²: ${a * a} + ${b * b} = ${c * c}, and the square root of ${c * c} is ${c}.`);
    if (form === 2)
      return typed(8, '8.G.B.7', `A ${c}-foot ladder leans against a wall. Its bottom is ${a} feet from the wall. How high up the wall does it reach, in feet?`,
        intAnswers(b), `${c}² - ${a}² = ${c * c} - ${a * a} = ${b * b}, and the square root of ${b * b} is ${b}.`);
    return typed(8, '8.G.B.7', `A kite string is ${c} meters long. The kite is directly above a spot ${b} meters away from the person holding the string. How high is the kite, in meters?`,
      intAnswers(a), `${c}² - ${b}² = ${c * c} - ${b * b} = ${a * a}, and the square root of ${a * a} is ${a}.`);
  },
  distance() {
    for (;;) {
      const [a, b, c] = pick(TRIPLES);
      if (c > 25) continue;
      const x1 = rnd(-8, 8), y1 = rnd(-8, 8);
      const x2 = x1 + a * pick([1, -1]), y2 = y1 + b * pick([1, -1]);
      return typed(8, '8.G.B.8', `What is the distance between the points (${x1}, ${y1}) and (${x2}, ${y2})?`, intAnswers(c),
        `The points are ${a} apart across and ${b} apart up and down. ${a}² + ${b}² = ${c * c}, and the square root of ${c * c} is ${c}.`);
    }
  },
  volumePi() {
    const piAnswers = (k: number) => [`${k}π`, `${k} π`, `${k}pi`, `${k} pi`, `${k}*π`, `${k}*pi`, `${k} * pi`, `${k} * π`];
    const tail = 'Give the answer in terms of π (type pi or π), like 10pi.';
    const form = rnd(1, 3);
    if (form === 1) {
      const r = rnd(1, 6), h = rnd(1, 10), k = r * r * h;
      return typed(8, '8.G.C.9', `A cylinder has radius ${r} and height ${h}. What is its volume? ${tail}`, piAnswers(k),
        `V = πr²h = π × ${r * r} × ${h} = ${k}π.`);
    }
    if (form === 2) {
      for (;;) {
        const r = rnd(1, 6), h = rnd(1, 12);
        if ((r * r * h) % 3) continue;
        const k = (r * r * h) / 3;
        return typed(8, '8.G.C.9', `A cone has radius ${r} and height ${h}. What is its volume? ${tail}`, piAnswers(k),
          `V = (1/3)πr²h = (1/3) × π × ${r * r} × ${h} = ${k}π.`);
      }
    }
    const r = pick([3, 6]), k = (4 * r ** 3) / 3;
    return typed(8, '8.G.C.9', `A sphere has radius ${r}. What is its volume? ${tail}`, piAnswers(k),
      `V = (4/3)πr³ = (4/3) × π × ${r ** 3} = ${k}π.`);
  },
  system() {
    const x = rnd(-5, 9), y = rnd(-5, 9);
    const a1 = rnd(1, 3), b1 = rnd(1, 3), a2 = rnd(1, 3), b2 = -rnd(1, 3); // determinant a1*b2 - a2*b1 is never 0
    const c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y;
    const eq = (a: number, b: number, c: number) => `${term(a, 'x')}${plus(b, 'y')} = ${c}`;
    const askX = Math.random() < 0.5;
    return typed(8, '8.EE.C.8', `Solve the system: ${eq(a1, b1, c1)} and ${eq(a2, b2, c2)}. What is ${askX ? 'x' : 'y'}?`,
      intAnswers(askX ? x : y), `The solution is x = ${x}, y = ${y}. Check: ${a1}(${x}) + ${b1}(${y}) = ${c1} and ${a2}(${x}) + (${b2})(${y}) = ${c2}.`);
  },
  angles() {
    const a = rnd(30, 80), b = rnd(30, 80);
    return Math.random() < 0.5
      ? typed(8, '8.G.A.5', `Two angles of a triangle measure ${a}° and ${b}°. What is the third angle, in degrees?`, intAnswers(180 - a - b),
        `The angles of a triangle add to 180°: 180 - ${a} - ${b} = ${180 - a - b}.`)
      : typed(8, '8.G.A.5', `A triangle has two inside angles of ${a}° and ${b}°. What is the exterior angle at the third corner, in degrees?`, intAnswers(a + b),
        `An exterior angle equals the sum of the two inside angles that are not next to it: ${a} + ${b} = ${a + b}.`);
  },
  repeatingDecimal() {
    if (Math.random() < 0.4) {
      const d = rnd(1, 8);
      return typed(8, '8.NS.A.1', `Write 0.${String(d).repeat(4)}... (the ${d} repeats forever) as a fraction in simplest form.`, [fracText(d, 9)],
        `A single repeating digit d equals d/9, so this is ${d}/9${fracText(d, 9) === `${d}/9` ? '' : `, which simplifies to ${fracText(d, 9)}`}.`);
    }
    for (;;) {
      const n = rnd(1, 98);
      if (n % 11 === 0) continue; // 0.aa... has a one-digit repeat
      const ab = String(n).padStart(2, '0');
      return typed(8, '8.NS.A.1', `Write 0.${ab.repeat(3)}... (the ${ab} repeats forever) as a fraction in simplest form.`, [fracText(n, 99)],
        `Two repeating digits ab equal ab/99, so this is ${n}/99${fracText(n, 99) === `${n}/99` ? '' : `, which simplifies to ${fracText(n, 99)}`}.`);
    }
  },
  ticketSystem() {
    const p = rnd(6, 12), k = rnd(3, p - 1), A = rnd(5, 40), K = rnd(5, 40), T = p * A + k * K;
    return typed(8, '8.EE.C.8.c', `Adult tickets to the school play cost $${p} and kid tickets cost $${k}. The school sold ${A + K} tickets for $${T} in all. How many adult tickets were sold?`,
      intAnswers(A), `Let a = adult tickets. Then ${p}a + ${k}(${A + K} - a) = ${T}, so ${p - k}a = ${T - k * (A + K)} and a = ${A}.`);
  },
};

// ---------- normal math: multiple choice, answered in her head ----------
// Each generator lists the right answer first; serve() shuffles. A choice may carry its value as [text, value]
// so a wrong choice that happens to equal the right value is dropped.

type Opt = string | number | [string, number];
const optText = (o: Opt) => (Array.isArray(o) ? o[0] : String(o));
const optValue = (o: Opt) => (Array.isArray(o) ? o[1] : typeof o === 'number' ? o : NaN);

/** Right answer plus the first 3 distinct wrong ones; null if there are not 3. */
function mc(grade: Grade, standard: string, prompt: string, right: Opt, wrongs: Opt[], explain: string): ChoiceQuestion | null {
  const r = optText(right), rv = optValue(right);
  const ws: string[] = [];
  for (const w of wrongs) {
    const t = optText(w), v = optValue(w);
    if (ws.length === 3 || t === r || ws.includes(t) || Math.abs(v - rv) <= 1e-9 * Math.max(1, Math.abs(rv))) continue;
    ws.push(t);
  }
  return ws.length === 3 ? { kind: 'choice', subject: 'math', grade, prompt, choices: [r, ...ws], answer: 0, explain, standard } : null;
}
const retry = (f: () => ChoiceQuestion | null): ChoiceQuestion => {
  for (;;) {
    const q = f();
    if (q) return q;
  }
};
const nz = (a: number, b: number) => {
  for (;;) {
    const v = rnd(a, b);
    if (v !== 0) return v;
  }
};
const deg = (n: number) => `${n}°`;
const pt = (x: number, y: number) => `(${x}, ${y})`;
const ITEMS = ['bags of cat treats', 'ski lift tickets', 'soccer balls', 'beach towels', 'dragon stickers', 'packs of trading cards'];
const UNITS = [
  ['foot', 'feet', 'inches', 12], ['yard', 'yards', 'feet', 3], ['hour', 'hours', 'minutes', 60],
  ['minute', 'minutes', 'seconds', 60], ['meter', 'meters', 'centimeters', 100], ['kilogram', 'kilograms', 'grams', 1000],
  ['gallon', 'gallons', 'quarts', 4], ['pound', 'pounds', 'ounces', 16],
] as const;

const c6: Record<string, () => ChoiceQuestion> = {
  unitRate: () => retry(() => {
    const n = rnd(2, 8), u = rnd(2, 12), t = n * u;
    if (Math.random() < 0.3)
      return mc(6, '6.RP.A.2', `A dragon flies ${t} miles in ${n} hours at a steady speed. How many miles does it fly in 1 hour?`, u,
        [t * n, t - n, t + n, u + 1], `Miles per hour = miles ÷ hours: ${t} ÷ ${n} = ${u}.`);
    const prompt = Math.random() < 0.5
      ? `${pick(NAMES)} pays $${t} for ${n} ${pick(ITEMS)}. Each one costs the same. How much does one cost?`
      : `${n} ${pick(ITEMS)} cost $${t} in all. What is the price of one?`;
    return mc(6, '6.RP.A.2', prompt, `$${u}`, [`$${t * n}`, `$${t - n}`, `$${t + n}`, `$${u + 1}`], `Price of one = total ÷ number bought: $${t} ÷ ${n} = $${u}.`);
  }),
  percentOf: () => retry(() => {
    const p = pick([10, 20, 25, 50, 75]), w = 20 * rnd(1, 10), part = (p * w) / 100;
    const prompt = pick([
      `What is ${p}% of ${w}?`,
      `There are ${w} kids at ski camp. ${p}% of them ride snowboards. How many kids ride snowboards?`,
      `A jacket costs $${w}. It is ${p}% off. How many dollars do you save?`,
    ]);
    return mc(6, '6.RP.A.3.c', prompt, part, [w - part, part * 10, p, w + p, w], `${p}% means ${p} out of every 100, so ${p}% of ${w} = ${w} × ${p} ÷ 100 = ${part}.`);
  }),
  ratioTable: () => retry(() => {
    const a = rnd(2, 5), b = rnd(2, 9), m = rnd(2, 5);
    if (a === b) return null;
    const prompt = pick([
      `A smoothie recipe uses ${a} cups of strawberries for every ${b} cups of yogurt. How many cups of yogurt go with ${a * m} cups of strawberries?`,
      `To make sea-green paint, mix ${a} cans of blue for every ${b} cans of yellow. How many cans of yellow go with ${a * m} cans of blue?`,
      `A cat clan shares ${b} fish for every ${a} cats. How many fish do ${a * m} cats get?`,
    ]);
    return mc(6, '6.RP.A.3.a', prompt, b * m, [b + a * m - a, a * m, b * m + b, a * m * b],
      `${a * m} is ${m} times ${a}, so multiply ${b} by ${m} too: ${b * m}. (Adding the same amount to both does not keep the ratio.)`);
  }),
  orderOps: () => retry(() => {
    const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9);
    const f = rnd(1, 3);
    if (f === 1)
      return mc(6, '6.EE.A.2.c', `What is ${a} + ${b} × ${c}?`, a + b * c, [(a + b) * c, a + b + c, a * b + c],
        `Multiply before you add: ${b} × ${c} = ${b * c}, then ${a} + ${b * c} = ${a + b * c}.`);
    if (f === 2) {
      if (a * b <= c || b <= c) return null;
      return mc(6, '6.EE.A.2.c', `What is ${a} × ${b} - ${c}?`, a * b - c, [a * (b - c), a * b + c, a + b - c],
        `Multiply first: ${a} × ${b} = ${a * b}, then subtract: ${a * b} - ${c} = ${a * b - c}.`);
    }
    return mc(6, '6.EE.A.1', `What is ${a}² + ${b}?`, a * a + b, [2 * a + b, (a + b) ** 2, a + 2 + b],
      `${a}² means ${a} × ${a} = ${a * a}. Exponents come first, then add: ${a * a} + ${b} = ${a * a + b}.`);
  }),
  distributive: () => retry(() => {
    const a = rnd(2, 9), b = rnd(2, 9), v = pick(['x', 'n', 'y']);
    if (a === b) return null;
    const f = rnd(1, 3);
    if (f === 1)
      return mc(6, '6.EE.A.3', `Which expression is equal to ${a}(${v} + ${b})?`, `${a}${v} + ${a * b}`,
        [`${a}${v} + ${b}`, `${v} + ${a * b}`, `${a * b}${v}`, `${a + b}${v}`], `Multiply ${a} by each term inside: ${a} × ${v} + ${a} × ${b} = ${a}${v} + ${a * b}.`);
    if (f === 2)
      return mc(6, '6.EE.A.3', `Which expression is equal to ${a}${v} + ${a * b}?`, `${a}(${v} + ${b})`,
        [`${a}(${v} + ${a * b})`, `${v}(${a} + ${b})`, `${a * b}(${v} + ${a})`], `Both terms share the factor ${a}: ${a} × ${v} + ${a} × ${b} = ${a}(${v} + ${b}).`);
    return mc(6, '6.EE.A.3', `Which expression is equal to ${a}${v} + ${b}${v}?`, `${a + b}${v}`,
      [`${a * b}${v}`, `${a + b}${v}²`, `${a * b}${v}²`, `${a + b}`], `${a}${v} and ${b}${v} are like terms, so add the numbers in front: ${a} + ${b} = ${a + b}, giving ${a + b}${v}.`);
  }),
  writeExpression: () => retry(() => {
    const k = rnd(2, 12), v = pick(['n', 'x', 't']);
    const forms: [string, string, string[], string][] = [
      [`${k} more than ${v}`, `${v} + ${k}`, [`${k}${v}`, `${v} - ${k}`, `${k} - ${v}`], `"More than" means add ${k} to ${v}.`],
      [`${k} less than ${v}`, `${v} - ${k}`, [`${k} - ${v}`, `${v} + ${k}`, `${k}${v}`], `"${k} less than ${v}" starts with ${v} and takes ${k} away, so ${v} - ${k}. The order flips from the words.`],
      [`the product of ${k} and ${v}`, `${k}${v}`, [`${k} + ${v}`, `${v} ÷ ${k}`, `${v} - ${k}`], `A product is the answer to a multiplication, and ${k}${v} means ${k} × ${v}.`],
      [`${v} divided by ${k}`, `${v} ÷ ${k}`, [`${k} ÷ ${v}`, `${k}${v}`, `${v} - ${k}`], `${v} is the number being split, so it comes first: ${v} ÷ ${k}.`],
    ];
    const [phrase, right, wrongs, why] = pick(forms);
    return mc(6, '6.EE.A.2.a', `Which expression means "${phrase}"?`, right, wrongs, why);
  }),
  evaluate: () => retry(() => {
    const a = rnd(2, 9), c = rnd(1, 12), x = rnd(2, 9);
    const wrongs = [Number(`${a}${x}`) + c, a * (x + c), a + x + c, a * x];
    if (Math.random() < 0.5)
      return mc(6, '6.EE.A.2.c', `What is the value of ${a}x + ${c} when x = ${x}?`, a * x + c, wrongs,
        `${a}x means ${a} × x. Replace x with ${x}: ${a} × ${x} + ${c} = ${a * x} + ${c} = ${a * x + c}.`);
    return mc(6, '6.EE.A.2.c', `Renting skis costs $${c} plus $${a} for each hour, so h hours cost ${a}h + ${c} dollars. How many dollars do ${x} hours cost?`, a * x + c, wrongs,
      `Replace h with ${x}: ${a} × ${x} + ${c} = ${a * x} + ${c} = ${a * x + c}.`);
  }),
  integers: () => retry(() => {
    const [A, B, C, D] = shuffle(Array.from({ length: 20 }, (_, i) => i + 1)).slice(0, 4).sort((p, q) => q - p);
    const f = rnd(1, 3);
    const ask = (q: string, right: number, wrongs: number[], std: string, why: string) =>
      mc(6, std, `${q} ${shuffle([right, ...wrongs]).join(', ')}?`, right, wrongs, why);
    if (f === 1) return ask('Which of these numbers is farthest from 0 on a number line:', -A, [B, -C, D], '6.NS.C.7.c',
      `Distance from 0 is the absolute value. |${-A}| = ${A} is the biggest, so ${-A} is farthest from 0.`);
    if (f === 2) return ask('Which of these numbers is the least:', -A, [-D, B, C], '6.NS.C.7.b',
      `Negative numbers are less than positive ones, and ${-A} is farther left on the number line than ${-D}.`);
    return ask('Which of these numbers is the greatest:', C, [-A, D, -B], '6.NS.C.7.b',
      `Any positive number is greater than a negative number, and ${C} is greater than ${D}.`);
  }),
  areaFormula: () => retry(() => {
    const b = rnd(3, 12), h = rnd(2, 10), u = pick(['feet', 'meters', 'inches']);
    const E = (s: string, v: number): [string, number] => [s, v];
    switch (rnd(1, 5)) {
      case 1:
        return mc(6, '6.G.A.1', `A triangle has a base of ${b} ${u} and a height of ${h} ${u}. Which expression finds its area?`, E(`${b} × ${h} ÷ 2`, (b * h) / 2),
          [E(`${b} × ${h}`, b * h), E(`${b} + ${h}`, b + h), E(`2 × (${b} + ${h})`, 2 * (b + h))], 'A triangle is half of a rectangle with the same base and height, so area = base × height ÷ 2.');
      case 2:
        return mc(6, '6.G.A.1', `A parallelogram has a base of ${b} ${u} and a height of ${h} ${u}. Which expression finds its area?`, E(`${b} × ${h}`, b * h),
          [E(`${b} × ${h} ÷ 2`, (b * h) / 2), E(`${b} + ${h}`, b + h), E(`2 × (${b} + ${h})`, 2 * (b + h))], 'Cut a triangle off one end of a parallelogram and move it to the other end: it makes a rectangle, so area = base × height.');
      case 3: {
        const b2 = rnd(2, 12);
        if (b2 === b) return null;
        return mc(6, '6.G.A.1', `A trapezoid has parallel sides of ${b} ${u} and ${b2} ${u} and a height of ${h} ${u}. Which expression finds its area?`, E(`(${b} + ${b2}) × ${h} ÷ 2`, ((b + b2) * h) / 2),
          [E(`(${b} + ${b2}) × ${h}`, (b + b2) * h), E(`${b} × ${b2} × ${h}`, b * b2 * h), E(`${b} + ${b2} + ${h}`, b + b2 + h)], 'Trapezoid area = the average of the two parallel sides × height = (side 1 + side 2) × height ÷ 2.');
      }
      case 4: {
        const w = rnd(2, 8);
        return mc(6, '6.G.A.2', `A box is ${b} ${u} long, ${w} ${u} wide, and ${h} ${u} tall. Which expression finds its volume?`, E(`${b} × ${w} × ${h}`, b * w * h),
          [E(`${b} + ${w} + ${h}`, b + w + h), E(`${b} × ${w}`, b * w), E(`2 × (${b} × ${w} + ${w} × ${h} + ${b} × ${h})`, 2 * (b * w + w * h + b * h))],
          'Volume = length × width × height. (Adding the areas of all six faces gives surface area, not volume.)');
      }
      default:
        return mc(6, '6.G.A.4', `A cube has edges that are ${b} ${u} long. Which expression finds its surface area?`, E(`6 × ${b} × ${b}`, 6 * b * b),
          [E(`${b} × ${b} × ${b}`, b ** 3), E(`4 × ${b} × ${b}`, 4 * b * b), E(`6 × ${b}`, 6 * b)], `A cube has 6 square faces, each ${b} × ${b}. Surface area = 6 × ${b} × ${b}.`);
    }
  }),
  meanMedian: () => retry(() => {
    const xs = Array.from({ length: 5 }, () => rnd(1, 20));
    const sum = xs.reduce((s, x) => s + x, 0);
    if (sum % 5) return null;
    const mean = sum / 5, sorted = xs.slice().sort((p, q) => p - q), med = sorted[2], range = sorted[4] - sorted[0];
    if (xs[2] === med) return null; // the "middle of the unsorted list" mistake must be a real choice
    const list = xs.join(', ');
    const lead = `${pick(NAMES)} scored ${list} points in five games.`;
    const f = rnd(1, 3);
    if (f === 1) return mc(6, '6.SP.B.5.c', `${lead} What is the median?`, med, [xs[2], mean, range, sum], `Put them in order: ${sorted.join(', ')}. The middle number is ${med}.`);
    if (f === 2) return mc(6, '6.SP.B.5.c', `${lead} What is the mean (average)?`, mean, [med, range, sum, xs[2]], `Add them: ${sum}. Divide by 5: ${sum} ÷ 5 = ${mean}.`);
    return mc(6, '6.SP.B.5.c', `${lead} What is the range?`, range, [sorted[4], med, mean, sum], `Range = greatest - least = ${sorted[4]} - ${sorted[0]} = ${range}.`);
  }),
  gcfLcm: () => retry(() => {
    const g = rnd(2, 4), m = rnd(2, 5), n = rnd(2, 5);
    if (m === n || gcd(m, n) !== 1) return null;
    const a = g * m, b = g * n, l = g * m * n;
    if (Math.random() < 0.5)
      return mc(6, '6.NS.B.4', `What is the greatest common factor (GCF) of ${a} and ${b}?`, g, [l, 2 * g, Math.min(a, b), a * b],
        `${a} = ${g} × ${m} and ${b} = ${g} × ${n}. ${m} and ${n} share no factor, so the GCF is ${g}.`);
    const prompt = Math.random() < 0.5
      ? `What is the least common multiple (LCM) of ${a} and ${b}?`
      : `Hot dogs come in packs of ${a} and buns come in packs of ${b}. What is the smallest number of hot dogs you can buy to have exactly as many hot dogs as buns?`;
    return mc(6, '6.NS.B.4', prompt, l, [a * b, g, a + b, 2 * l], `Count by ${a}s and by ${b}s. The first number on both lists is ${l}.`);
  }),
  convert: () => retry(() => {
    const [one, big, small, f] = pick(UNITS), v = rnd(2, 9);
    if (Math.random() < 0.5)
      return mc(6, '6.RP.A.3.d', `How many ${small} are in ${v} ${big}?`, v * f, [v * 10, v * 100, v + f, f], `1 ${one} = ${f} ${small}, so multiply: ${v} × ${f} = ${v * f}.`);
    return mc(6, '6.RP.A.3.d', `To change ${v} ${big} into ${small}, what do you do?`, `Multiply by ${f}`, [`Divide by ${f}`, `Add ${f}`, `Multiply by 10`, `Multiply by 100`],
      `1 ${one} = ${f} ${small}. Each ${one} becomes ${f} ${small}, so multiply by ${f}.`);
  }),
  fractionScoops: () => retry(() => {
    const n = rnd(2, 6), d = rnd(2, 4);
    return mc(6, '6.NS.A.1', `How many 1/${d}-cup scoops of flour are in ${n} cups?`, n * d, [n + d, [`${n}/${d}`, n / d], d, n * d + d],
      `${n} ÷ 1/${d} = ${n} × ${d} = ${n * d}. Each cup holds ${d} scoops.`);
  }),
};

const SIDE_LINES = [
  {
    setup: (m: number, b: number) => `A hose fills a pool. After t minutes the pool holds y = ${m}t + ${b} gallons.`,
    rate: (k: number) => `The water goes up ${k} gallons each minute`, start: (k: number) => `The pool had ${k} gallons at the start`,
    other: (k: number) => [`The pool is full after ${k} minutes`, `The pool holds ${k} gallons when full`],
  },
  {
    setup: (m: number, b: number) => `The cost of d days at a ski club is C = ${m}d + ${b} dollars.`,
    rate: (k: number) => `Each day of skiing costs $${k}`, start: (k: number) => `The sign-up fee is $${k}`,
    other: (k: number) => [`The club has ${k} members`, `The ski season lasts ${k} days`],
  },
  {
    setup: (m: number, b: number) => `A kitten's weight after w weeks is W = ${m}w + ${b} ounces.`,
    rate: (k: number) => `The kitten gains ${k} ounces each week`, start: (k: number) => `The kitten weighed ${k} ounces at the start`,
    other: (k: number) => [`The kitten is ${k} weeks old`, `The kitten will weigh ${k} ounces when grown`],
  },
];
const TRIPLES_SMALL = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20], [15, 20, 25]];

const c8: Record<string, () => ChoiceQuestion> = {
  slopeMeaning: () => retry(() => {
    const m = rnd(2, 9), b = rnd(5, 50), L = pick(SIDE_LINES);
    if (m === b) return null;
    return Math.random() < 0.5
      ? mc(8, '8.F.B.4', `${L.setup(m, b)} What does the ${m} tell you?`, L.rate(m), [L.start(m), ...L.other(m)], `${m} is the slope, the rate of change: how much the total goes up for each 1 step.`)
      : mc(8, '8.F.B.4', `${L.setup(m, b)} What does the ${b} tell you?`, L.start(b), [L.rate(b), ...L.other(b)], `${b} is the initial value: the total when the time is 0, before any steps.`);
  }),
  slopeIntercept: () => retry(() => {
    const m = nz(-9, 9), b = nz(-9, 9);
    if (Math.abs(m) === Math.abs(b)) return null;
    const eq = Math.random() < 0.4 ? `y = ${b}${plus(m, 'x')}` : `y = ${term(m, 'x')}${plus(b)}`;
    return Math.random() < 0.5
      ? mc(8, '8.EE.B.6', `What is the slope of the line ${eq}?`, m, [b, -m, m + b], `The slope is the number multiplied by x: ${m}.`)
      : mc(8, '8.EE.B.6', `What is the y-intercept of the line ${eq}?`, b, [m, -b, m + b], `The y-intercept is the value of y when x = 0, the number added on: ${b}.`);
  }),
  slopeCompute: () => retry(() => {
    const x1 = rnd(-5, 5), y1 = rnd(-5, 5), run = nz(-4, 4), m = nz(-4, 4);
    const rise = m * run, x2 = x1 + run, y2 = y1 + rise, P = pt(x1, y1), Q = pt(x2, y2);
    if (Math.random() < 0.5) {
      if (Math.abs(run) === 1) return null;
      return mc(8, '8.F.B.4', `What is the slope of the line through ${P} and ${Q}?`, m, [-m, rise, run, [fracText(1, m), 1 / m]],
        `Slope = change in y ÷ change in x = ${rise} ÷ ${run} = ${m}.`);
    }
    if (y1 === x1) return null;
    const f = (n: number) => (n < 0 ? `(${n})` : `${n}`);
    const ex = (a: number, b: number, c: number, d: number): [string, number] => [`(${a} - ${f(b)}) ÷ (${c} - ${f(d)})`, (a - b) / (c - d)];
    return mc(8, '8.F.B.4', `Which expression finds the slope of the line through ${P} and ${Q}?`, ex(y2, y1, x2, x1),
      [ex(x2, x1, y2, y1), ex(y2, y1, x1, x2), ex(y2, x2, y1, x1)], 'Slope = change in y ÷ change in x = (y₂ - y₁) ÷ (x₂ - x₁), with both differences taken in the same order.');
  }),
  exponentRule: () => retry(() => {
    const a = rnd(2, 9), m = rnd(2, 7), n = rnd(2, 7);
    if (m === n) return null;
    const P = (base: number, e: number): [string, number] => [`${base}${sup(e)}`, base ** e];
    switch (rnd(1, 4)) {
      case 1:
        return mc(8, '8.EE.A.1', `Which is equal to ${a}${sup(m)} × ${a}${sup(n)}?`, P(a, m + n), [P(a, m * n), P(a * a, m + n), P(a, Math.abs(m - n))],
          `Same base, multiplying: add the exponents. ${m} + ${n} = ${m + n}.`);
      case 2: {
        const [hi, lo] = m > n ? [m, n] : [n, m];
        return mc(8, '8.EE.A.1', `Which is equal to ${a}${sup(hi)} ÷ ${a}${sup(lo)}?`, P(a, hi - lo), [P(a, hi + lo), P(1, hi - lo), P(a, hi * lo)],
          `Same base, dividing: subtract the exponents. ${hi} - ${lo} = ${hi - lo}.`);
      }
      case 3: {
        const p = rnd(2, 4);
        return mc(8, '8.EE.A.1', `Which is equal to (${a}${sup(m)})${sup(p)}?`, P(a, m * p), [P(a, m + p), P(a * p, m), P(a * m, p)],
          `A power of a power: multiply the exponents. ${m} × ${p} = ${m * p}.`);
      }
      default: {
        const b = rnd(2, 5), e = rnd(2, 3);
        return mc(8, '8.EE.A.1', `Which is equal to ${b}${sup(-e)}?`, [`1/${b ** e}`, 1 / b ** e], [[`-${b ** e}`, -(b ** e)], [`${-b * e}`, -b * e], [`1/${b * e}`, 1 / (b * e)]],
          `A negative exponent means 1 over the power: ${b}${sup(-e)} = 1/${b}${sup(e)} = 1/${b ** e}.`);
      }
    }
  }),
  sciNotation: () => retry(() => {
    const S = (t: number, k: number): [string, number] => [`${scaled(t, 1)} × 10${sup(k)}`, t * 10 ** (k - 1)];
    const f = rnd(1, 3);
    if (f === 1) {
      const e = rnd(3, 8);
      const right = S(rnd(11, 39), e), wrongs = [S(rnd(81, 99), e - 1), S(rnd(50, 79), e - 1), S(rnd(11, 99), e - 2)];
      return mc(8, '8.EE.A.3', `Which of these is the greatest: ${shuffle([right, ...wrongs].map((x) => x[0])).join(', ')}?`, right, wrongs,
        `Compare the powers of 10 first. 10${sup(e)} is the biggest power here, so ${right[0]} is the greatest, even though its first number is small.`);
    }
    if (f === 2) {
      const t = rnd(11, 99), e = rnd(2, 5), N = (v: number): [string, number] => [commas(v), v];
      return mc(8, '8.EE.A.3', `Which number is equal to ${scaled(t, 1)} × 10${sup(e)}?`, N(t * 10 ** (e - 1)),
        [N(t * 10 ** (e - 2)), N(t * 10 ** e), [scaled(t, e + 1), t / 10 ** (e + 1)]], `× 10${sup(e)} moves the decimal point ${e} places to the right: ${commas(t * 10 ** (e - 1))}.`);
    }
    const m2 = rnd(1, 4), k = rnd(2, 4), m1 = m2 * k, e2 = rnd(2, 5), d = rnd(2, 5);
    if (m1 > 9) return null;
    const N = (v: number): [string, number] => [commas(v), v];
    return mc(8, '8.EE.A.4', `How many times as large is ${m1} × 10${sup(e2 + d)} as ${m2} × 10${sup(e2)}?`, N(k * 10 ** d),
      [N(k * 10 ** (d - 1)), N(k * 10 ** (d + 1)), N(m1 * 10 ** d), N(d)], `Divide the numbers and subtract the exponents: ${m1} ÷ ${m2} = ${k} and 10${sup(e2 + d)} ÷ 10${sup(e2)} = 10${sup(d)}, so ${commas(k * 10 ** d)} times.`);
  }),
  pythagorean: () => retry(() => {
    const [p, q, c] = pick(TRIPLES_SMALL);
    const [a, b] = Math.random() < 0.5 ? [p, q] : [q, p];
    switch (rnd(1, 4)) {
      case 1:
        return mc(8, '8.G.B.7', `A right triangle has legs of ${a} and ${b}. Which equation finds the hypotenuse c?`, `${a}² + ${b}² = c²`,
          [`${a} + ${b} = c`, `${a}² + c² = ${b}²`, `c = ${a} × ${b}`], 'In a right triangle, leg² + leg² = hypotenuse².');
      case 2:
        return mc(8, '8.G.B.7', `A right triangle has a hypotenuse of ${c} and one leg of ${a}. Which equation finds the other leg b?`, `${a}² + b² = ${c}²`,
          [`${a}² + ${c}² = b²`, `${a} + b = ${c}`, `b = ${c} - ${a}`], 'The hypotenuse is the longest side and goes alone: leg² + leg² = hypotenuse².');
      case 3:
        return mc(8, '8.G.B.7', `A right triangle has legs of ${a} and ${b}. How long is the hypotenuse?`, c, [a + b, a * a + b * b, b - a],
          `${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}, and √${c * c} = ${c}.`);
      default: {
        const right = Math.random() < 0.5, r = right ? c : c + 1;
        const yes = [`Yes, because ${a}² + ${b}² = ${r}²`, `Yes, because ${a} + ${b} > ${r}`, `Yes, because ${r} is the longest side`];
        const no = [`No, because ${a}² + ${b}² ≠ ${r}²`, `No, because ${a} + ${b} ≠ ${r}`, 'No, because the sides are not all the same length'];
        const prompt = `A triangle has sides ${a}, ${b}, and ${r}. Is it a right triangle?`;
        return right
          ? mc(8, '8.G.B.6', prompt, yes[0], no, `${a * a} + ${b * b} = ${r * r}, so it is a right triangle.`)
          : mc(8, '8.G.B.6', prompt, no[0], yes, `${a * a} + ${b * b} = ${a * a + b * b}, not ${r * r}, so it is not a right triangle.`);
      }
    }
  }),
  solveLinear: () => retry(() => {
    const x = rnd(1, 9), a = rnd(2, 6), k = rnd(1, 5), b = a * k, c = a * x + b;
    if (Math.random() < 0.5)
      return mc(8, '8.EE.C.7.b', `Solve ${a}x + ${b} = ${c}. What is x?`, x, [x + 2 * k, c - b, -x], `Subtract ${b}: ${a}x = ${c - b}. Divide by ${a}: x = ${x}.`);
    return mc(8, '8.EE.C.7.b', `To solve ${a}x + ${b} = ${c}, you subtract ${b} from both sides and get ${a}x = ${c - b}. What is the next step?`, `Divide both sides by ${a}`,
      [`Subtract ${a} from both sides`, `Multiply both sides by ${a}`, `Add ${b} to both sides`], `${a}x means ${a} times x. Undo multiplying by dividing both sides by ${a}: x = ${x}.`);
  }),
  solutionCount: () => retry(() => {
    const a = rnd(2, 7), b = rnd(1, 9), c = rnd(1, 9), d = rnd(2, 7), kind = rnd(0, 2);
    const labels = ['Exactly one', 'No solution', 'Infinitely many'];
    let prompt: string, why: string, std: string;
    if (Math.random() < 0.5) {
      std = '8.EE.C.7.a';
      let eq: string;
      if (kind === 0) {
        if (a === d) return null;
        eq = `${a}x + ${b} = ${d}x + ${c}`;
        why = `The x terms have different numbers in front (${a} and ${d}), so exactly one value of x works.`;
      } else if (kind === 1) {
        if (b === c) return null;
        eq = `${a}x + ${b} = ${a}x + ${c}`;
        why = `Take ${a}x away from both sides: ${b} = ${c}, which is never true, so no x works.`;
      } else {
        eq = `${a}(x + ${b}) = ${a}x + ${a * b}`;
        why = `${a}(x + ${b}) = ${a}x + ${a * b}, exactly the right side, so every x works.`;
      }
      prompt = `How many solutions does the equation ${eq} have?`;
    } else {
      std = '8.EE.C.8.b';
      let e2: string;
      if (kind === 0) {
        if (a === d) return null;
        e2 = `y = ${d}x + ${c}`;
        why = `The slopes are different (${a} and ${d}), so the lines cross at exactly one point.`;
      } else if (kind === 1) {
        if (b === c) return null;
        e2 = `y = ${a}x + ${c}`;
        why = `Same slope (${a}) but different y-intercepts: the lines are parallel and never meet.`;
      } else {
        e2 = `2y = ${2 * a}x + ${2 * b}`;
        why = `Divide 2y = ${2 * a}x + ${2 * b} by 2 and you get y = ${a}x + ${b}: the same line, so every point on it works.`;
      }
      prompt = `How many solutions does this system have: y = ${a}x + ${b} and ${e2}?`;
    }
    return mc(8, std, prompt, labels[kind], [...labels.filter((_, i) => i !== kind), 'Exactly two'], why);
  }),
  angles: () => retry(() => {
    const a = 5 * rnd(4, 16), b = 5 * rnd(4, 16);
    const D = (n: number): [string, number] => [deg(n), n];
    switch (rnd(1, 5)) {
      case 1:
        return mc(8, '8.G.A.5', `Two angles of a triangle measure ${deg(a)} and ${deg(b)}. What is the third angle?`, D(180 - a - b), [D(360 - a - b), D(a + b), D(180 - a)],
          `The angles of a triangle add to 180°: 180 - ${a} - ${b} = ${180 - a - b}.`);
      case 2:
        return mc(8, '8.G.A.5', `Two angles sit side by side on a straight line. One is ${deg(a)}. What is the other?`, D(180 - a), [D(90 - a), D(360 - a), D(a)],
          `Angles on a straight line add to 180°: 180 - ${a} = ${180 - a}.`);
      case 3:
        return mc(8, '8.G.A.5', `Two straight lines cross. One of the angles they make is ${deg(a)}. What is the angle directly across from it?`, D(a), [D(180 - a), D(90 - a), D(360 - a)],
          'Angles directly across from each other (vertical angles) are equal.');
      case 4:
        return mc(8, '8.G.A.5', `Two parallel lines are crossed by a third line. One angle at the first parallel line is ${deg(a)}. What is the corresponding angle at the second parallel line?`, D(a),
          [D(180 - a), D(90 - a), D(360 - a)], 'Corresponding angles along parallel lines are equal.');
      default:
        return mc(8, '8.G.A.5', `Two parallel lines are crossed by a third line. One same-side interior angle is ${deg(a)}. What is the other same-side interior angle?`, D(180 - a),
          [D(a), D(90 - a), D(360 - a)], `Same-side interior angles between parallel lines add to 180°: 180 - ${a} = ${180 - a}.`);
    }
  }),
  volumeFormula: () => retry(() => {
    const r = rnd(2, 9), h = rnd(2, 12), P = Math.PI;
    const V = (s: string, v: number): [string, number] => [s, v];
    const cyl = V(`π × ${r}² × ${h}`, P * r * r * h), cone = V(`(1/3) × π × ${r}² × ${h}`, (P * r * r * h) / 3), sph = V(`(4/3) × π × ${r}³`, (4 / 3) * P * r ** 3);
    switch (rnd(1, 3)) {
      case 1:
        return mc(8, '8.G.C.9', `A can of soup is a cylinder with radius ${r} cm and height ${h} cm. Which expression finds its volume?`, cyl,
          [cone, V(`2 × π × ${r} × ${h}`, 2 * P * r * h), V(`π × ${r} × ${h}`, P * r * h), sph], 'Cylinder volume = area of the circle base × height = π × r² × h.');
      case 2:
        return mc(8, '8.G.C.9', `A party hat is a cone with radius ${r} cm and height ${h} cm. Which expression finds its volume?`, cone,
          [cyl, V(`(1/3) × π × ${r} × ${h}`, (P * r * h) / 3), sph], 'A cone holds one third of the cylinder with the same base and height: (1/3) × π × r² × h.');
      default:
        return mc(8, '8.G.C.9', `A ball is a sphere with radius ${r} cm. Which expression finds its volume?`, sph,
          [V(`4 × π × ${r}²`, 4 * P * r * r), V(`(4/3) × π × ${r}²`, (4 / 3) * P * r * r), V(`π × ${r}² × ${h}`, P * r * r * h)], 'Sphere volume = (4/3) × π × r³.');
    }
  }),
  transformation: () => retry(() => {
    const x = nz(-9, 9), y = nz(-9, 9);
    if (Math.abs(x) === Math.abs(y)) return null;
    const P0 = pt(x, y);
    switch (rnd(1, 5)) {
      case 1:
        return mc(8, '8.G.A.3', `The point ${P0} is reflected over the x-axis. Where does it land?`, pt(x, -y), [pt(-x, y), pt(-x, -y), pt(y, x)],
          'Reflecting over the x-axis keeps x the same and flips the sign of y.');
      case 2:
        return mc(8, '8.G.A.3', `The point ${P0} is reflected over the y-axis. Where does it land?`, pt(-x, y), [pt(x, -y), pt(-x, -y), pt(y, x)],
          'Reflecting over the y-axis keeps y the same and flips the sign of x.');
      case 3:
        return mc(8, '8.G.A.3', `The point ${P0} is rotated 180° around the origin. Where does it land?`, pt(-x, -y), [pt(x, -y), pt(-x, y), pt(y, x)],
          'A 180° turn around the origin flips the signs of both x and y.');
      case 4: {
        const dx = nz(-6, 6), dy = nz(-6, 6);
        return mc(8, '8.G.A.3', `The point ${P0} is moved ${Math.abs(dx)} units ${dx > 0 ? 'right' : 'left'} and ${Math.abs(dy)} units ${dy > 0 ? 'up' : 'down'}. Where does it land?`,
          pt(x + dx, y + dy), [pt(x - dx, y + dy), pt(x + dx, y - dy), pt(x + dy, y + dx)], 'Right and left change x; up and down change y. Right and up add, left and down subtract.');
      }
      default: {
        const k = rnd(2, 3);
        return mc(8, '8.G.A.3', `The point ${P0} is dilated by a scale factor of ${k} with the center at the origin. Where does it land?`, pt(k * x, k * y),
          [pt(x + k, y + k), pt(k * x, y), pt(x, k * y)], `A dilation from the origin multiplies both coordinates by the scale factor ${k}.`);
      }
    }
  }),
  sqrtEstimate: () => retry(() => {
    const n = rnd(5, 150), a = Math.floor(Math.sqrt(n));
    if (a * a === n) return null;
    if (Math.random() < 0.6) {
      const h = Math.floor(n / 2);
      return mc(8, '8.NS.A.2', `√${n} is between which two whole numbers?`, `${a} and ${a + 1}`, [`${a - 1} and ${a}`, `${a + 1} and ${a + 2}`, `${h} and ${h + 1}`],
        `${a}² = ${a * a} and ${a + 1}² = ${(a + 1) ** 2}. ${n} is between them, so √${n} is between ${a} and ${a + 1}.`);
    }
    const s = rnd(2, 12), p = rnd(1, 8), q = rnd(9, 13), dg = rnd(1, 8);
    const right = `√${n}`, wrongs = [`√${s * s}`, `${p}/${q}`, `0.${String(dg).repeat(3)}...`];
    return mc(8, '8.NS.A.1', `Which of these numbers is irrational: ${shuffle([right, ...wrongs]).join(', ')}? (The "..." means the digit repeats forever.)`, right, wrongs,
      `${n} is not a perfect square, so √${n} never ends or repeats. √${s * s} = ${s}, a fraction is rational, and a repeating decimal is rational.`);
  }),
};

// ---------- pooled content ----------

type ChoiceRow = { prompt: string; choices: string[]; answer: number; explain: string; standard: string };
type ShortRow = { s: string; p: string; c: string[]; e: string };

const history = (grade: Grade, rows: ChoiceRow[]): ChoiceQuestion[] =>
  rows.map((r) => ({ kind: 'choice', subject: 'history', grade, prompt: r.prompt, choices: r.choices, answer: r.answer, explain: r.explain, standard: r.standard }));

// Grammar and hand-written math data list the correct choice first; choices are shuffled when served.
const short = (subject: Subject, grade: Grade, rows: ShortRow[]): ChoiceQuestion[] =>
  rows.map((r) => ({ kind: 'choice', subject, grade, prompt: r.p, choices: r.c, answer: 0, explain: r.e, standard: r.s }));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spelling = (grade: Grade, standard: string, rows: string[][]): TypedQuestion[] =>
  rows.map(([word, sentence, ...alts]) => ({
    kind: 'typed',
    subject: 'spelling',
    grade,
    prompt: `Type the word you hear. Hint: "${sentence.replace(new RegExp(`\\b${escapeRe(word)}\\b`, 'i'), '_____')}"`,
    answers: [word, ...alts],
    speak: `${word}. ${sentence} ${word}.`,
    explain: `"${word}," as in: ${sentence}`,
    standard,
  }));

/** Everything the self-check validates. `math` is the hand-written multiple-choice pool. */
export const bank = {
  6: {
    math: short('math', 6, math6),
    history: history(6, history6),
    grammar: short('grammar', 6, grammar6),
    spelling: spelling(6, 'RW.6.3.4 (L.6.2b)', spelling6),
  },
  8: {
    math: short('math', 8, math8),
    history: history(8, history8),
    grammar: short('grammar', 8, grammar8),
    spelling: spelling(8, 'RW.8.3.4 (L.8.2c)', spelling8),
  },
};
/** Epic math: typed, pencil and paper. */
export const mathGenerators: Record<Grade, Record<string, () => TypedQuestion>> = { 6: g6, 8: g8 };
/** Normal math: multiple choice, in her head. */
export const choiceGenerators: Record<Grade, Record<string, () => ChoiceQuestion>> = { 6: c6, 8: c8 };

// ---------- serving ----------
// What was served is kept in localStorage per grade, so it survives page loads and game switches.
// A pool item comes back only after REMEMBER of its pool has been served since; a generated problem
// (template + numbers) only after GEN_MEMORY other generated problems.

const SUBJECTS: Subject[] = ['math', 'spelling', 'grammar', 'history'];
const KEY = 'camalot.questions.';
const REMEMBER = 0.85;
const GEN_MEMORY = 400;
const memory = new Map<string, string[]>();

function recall(key: string): string[] {
  let list = memory.get(key);
  if (!list) {
    list = [];
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(KEY + key) ?? '[]');
      if (Array.isArray(saved)) list = saved.filter((x): x is string => typeof x === 'string');
    } catch {
      // storage blocked or corrupt: start this page with an empty memory
    }
    memory.set(key, list);
  }
  return list;
}

function remember(key: string, id: string, cap: number) {
  const list = recall(key).filter((x) => x !== id);
  list.push(id);
  list.splice(0, Math.max(0, list.length - cap));
  memory.set(key, list);
  try {
    localStorage.setItem(KEY + key, JSON.stringify(list));
  } catch {
    // storage blocked or full: memory still holds for this page
  }
}

/** Short stable id for a prompt (djb2). */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function fromPool<T extends Question>(key: string, pool: T[]): T {
  const seen = new Set(recall(key));
  const fresh = pool.filter((q) => !seen.has(hash(q.prompt)));
  const q = pick(fresh.length ? fresh : pool);
  remember(key, hash(q.prompt), Math.max(1, Math.floor(pool.length * REMEMBER)));
  return q;
}

function fromGenerators<T extends Question>(key: string, gens: Record<string, () => T>): T {
  const seen = new Set(recall(key));
  const names = Object.keys(gens);
  let q!: T, id = '';
  for (let i = 0; i < 30; i++) {
    const name = pick(names);
    q = gens[name]();
    id = `${name}:${(q.prompt.match(/\d+/g) ?? []).join(',')}`;
    if (!seen.has(id)) break;
  }
  remember(key, id, GEN_MEMORY);
  return q;
}

/** Shuffles choices on every serve. */
function serve(q: Question): Question {
  if (q.kind === 'typed') return q;
  const right = q.choices[q.answer];
  const choices = shuffle(q.choices);
  return { ...q, choices, answer: choices.indexOf(right) };
}

export const nextQuestion: NextQuestion = (grade, subject, size = 'normal') => {
  const s = subject ?? pick(SUBJECTS);
  if (s === 'math') {
    if (size === 'epic') return fromGenerators(`${grade}.epic`, mathGenerators[grade]);
    return serve(Math.random() < 0.5 ? fromPool(`${grade}.math`, bank[grade].math) : fromGenerators(`${grade}.mathgen`, choiceGenerators[grade]));
  }
  return serve(fromPool<Question>(`${grade}.${s}`, bank[grade][s]));
};
