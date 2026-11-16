// Self-check for the question bank. Run: node src/core/questions/selfcheck.mjs  (Node 24 strips the .ts types)
import assert from 'node:assert/strict';

// Shared fake localStorage, installed before the module loads. Each fresh import of index.ts is a new "page load".
const store = new Map();
let storageBroken = false;
const fakeStorage = {
  getItem: (k) => { if (storageBroken) throw new Error('blocked'); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { if (storageBroken) throw new Error('blocked'); store.set(k, String(v)); },
};
Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true, writable: true });
let loads = 0;
const pageLoad = () => import(`./index.ts?load=${++loads}`);

const { bank, mathGenerators, choiceGenerators, nextQuestion, EPIC_LEAD } = await pageLoad();

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const unsup = (s) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map((c) => SUP[c]).join(''));

/** Numeric value of a typed answer, or NaN. */
function parseNum(raw) {
  let s = unsup(raw.trim().toLowerCase()).replace(/−/g, '-').replace(/\$/g, '').replace(/,/g, '');
  let m;
  if ((m = s.match(/^(-?[\d.]+)\s*\*?\s*(π|pi)$/))) return Number(m[1]) * Math.PI;
  if ((m = s.match(/^(-?[\d.]+)\s*[×x*·]\s*10\^\(?(-?\d+)\)?$/))) return Number(m[1]) * 10 ** Number(m[2]);
  if ((m = s.match(/^(-?[\d.]+)e(-?\d+)$/))) return Number(m[1]) * 10 ** Number(m[2]);
  if ((m = s.match(/^(-?)(\d+) (\d+)\/(\d+)$/))) return (m[1] ? -1 : 1) * (Number(m[2]) + Number(m[3]) / Number(m[4]));
  if ((m = s.match(/^(-?\d+)\/(\d+)$/))) return Number(m[1]) / Number(m[2]);
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
  return NaN;
}
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const nums = (s) => (unsup(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

/** Evaluates a plain arithmetic expression: 3/4 ÷ 1/8, 2³ + 4 × 5, (1/3) × π × 3² × 5, 3.2 × 10⁴ */
function evalExpr(expr) {
  const js = unsup(expr).replace(/,/g, '').replace(/(\d+)\/(\d+)/g, '($1/$2)').replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/π/g, 'P');
  assert.match(js, /^[\d\s.+\-*/()P]+$/, `unsafe expression: ${js}`);
  return Function('P', `return (${js})`)(Math.PI);
}
/** Value of a multiple-choice option: "$12", "45°", "3,200", "π × 3² × 5" */
const cval = (s) => evalExpr(s.replace(/[$°]/g, ''));
/** Substitutes a value for a variable letter in "3x + 4", "5(n + 3)", "7t²", "x ÷ 4" and evaluates. */
function evalVar(expr, v, val) {
  const js = unsup(expr).replace(/÷/g, '/').replace(/×/g, '*').replace(/\^/g, '**')
    .replace(/(\d)\(/g, '$1*(').replace(new RegExp(`(\\d)${v}`, 'g'), `$1*${v}`).replace(new RegExp(`${v}\\(`, 'g'), `${v}*(`)
    .replace(new RegExp(v, 'g'), `(${val})`);
  assert.match(js, /^[\d\s.+\-*/()]+$/, `unsafe expression: ${js}`);
  return Function(`return (${js})`)();
}
const evalWithX = (expr, x) => evalVar(expr, 'x', x);
const sameExpr = (a, b, v) => [101, 203, 307].every((t) => close(evalVar(a, v, t), evalVar(b, v, t)));
/** Is the equation true when `v` = val? "3² + b² = 5²" */
const holds = (eq, v, val) => { const [l, r] = eq.split('='); return close(evalVar(l, v, val), evalVar(r, v, val)); };
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

// ---------- independent re-solve of each EPIC generator (typed) ----------
const solveTyped = {
  unitPrice: (p) => { const [t, n] = nums(p); return t / n; },
  speed: (p) => { const [d, h] = nums(p); return d / h; },
  percent: (p) => { const [a, b] = p.includes('What is') ? nums(p) : [nums(p)[1], nums(p)[0]]; return (a * b) / 100; },
  ratio: (p) => { const [a, b, c] = nums(p); return (b * c) / a; },
  fractionDivide: (p) => evalExpr(p.match(/What is (.+)\? Type/)[1]),
  fractionStory: (p) => { const [a, b, , d] = nums(p); return (a / b) / (1 / d); },
  decimals: (p) => evalExpr(p.match(/What is (.+)\?/)[1]),
  longDivision: (p) => evalExpr(p.match(/What is (.+)\?/)[1]),
  gcf: (p) => { const [a, b] = nums(p); return gcd(a, b); },
  lcm: (p) => { const [a, b] = nums(p); return (a * b) / gcd(a, b); },
  exponents: (p) => evalExpr(p.match(/What is (.+)\?/)[1]),
  evaluate: (p) => { const [, e, x] = p.match(/value of (.+) when x = (-?\d+)/); return evalWithX(e, x); },
  oneStepEquation: (p) => {
    if (p.includes('Solve for x')) { const [, l, r] = p.match(/Solve for x: (.+) = (.+)/); for (let x = -100; x <= 200; x++) if (evalWithX(l, x) === Number(r)) return x; }
    const [add, total] = nums(p); return total - add;
  },
  area: (p) => { const [b, h] = nums(p); return p.includes('triangle') ? (b * h) / 2 : b * h; },
  volume: (p) => { const n = nums(p); return n.length === 3 ? n[0] * n[1] * n[2] : n[0] * n[1] * (n[2] + n[3] / n[4]); },
  meanMedian: (p) => { const xs = nums(p).slice(-5); if (p.includes('mean')) return xs.reduce((s, x) => s + x, 0) / 5; return xs.sort((a, b) => a - b)[2]; },
  changeDue: (p) => { const [a, h, b, g, bill] = nums(p); return bill - a * h - b * g; },
  compositeArea: (p) => { const [L, W, l, w] = nums(p); return L * W - l * w; },

  linearEquation: (p) => { const [, l, r] = p.match(/Solve for x: (.+) = (.+)/); for (let x = -50; x <= 50; x++) if (evalWithX(l, x) === evalWithX(r, x)) return x; },
  distributiveEquation: (p) => { const [, l, r] = p.match(/Solve for x: (.+) = (.+)/); for (let x = -50; x <= 50; x++) if (evalWithX(l, x) === Number(r)) return x; },
  slope: (p) => { const [a, b, c, d] = nums(p); return (d - b) / (c - a); },
  rateOfChange: (p) => {
    const [x0, y0, x1, y1] = nums(p); const m = (y1 - y0) / (x1 - x0);
    return p.includes('rate of change') ? m : y0 - m * x0;
  },
  evaluateFunction: (p) => { const [, e, x] = p.match(/f\(x\) = (.+), what is f\((-?\d+)\)/); return evalWithX(e, x); },
  exponentRules: (p) => {
    const n = nums(p);
    if (p.includes('×')) return n[1] + n[3];
    if (p.includes('÷')) return n[1] - n[3];
    return n[1] * n[2];
  },
  sciToStandard: (p) => { const [m, , e] = nums(p); return m * 10 ** e; },
  standardToSci: (p) => Number(p.match(/Write ([\d,.]+) in/)[1].replace(/,/g, '')),
  sciMultiply: (p) => { const [a, , m, b, , n] = nums(p); return a * 10 ** m * b * 10 ** n; },
  roots: (p) => { const [v] = nums(p.replace('x²', '')); return p.includes('cube') ? Math.round(Math.cbrt(v)) : Math.sqrt(v); },
  pythagorean: (p) => { const [a, b] = nums(p); return p.includes('legs') ? Math.hypot(a, b) : Math.sqrt(a * a - b * b); },
  distance: (p) => { const [a, b, c, d] = nums(p); return Math.hypot(c - a, d - b); },
  volumePi: (p) => { const n = nums(p); if (p.includes('cylinder')) return Math.PI * n[0] ** 2 * n[1]; if (p.includes('cone')) return (Math.PI * n[0] ** 2 * n[1]) / 3; return (4 / 3) * Math.PI * n[0] ** 3; },
  system: (p) => {
    const [, e1, c1, e2, c2, v] = p.match(/system: (.+) = (-?\d+) and (.+) = (-?\d+)\. What is (\w)/);
    const f = (e, x, y) => Function(`return ${e.replace(/(\d)([xy])/g, '$1*$2').replace(/x/g, `(${x})`).replace(/y/g, `(${y})`)}`)();
    for (let x = -20; x <= 20; x++) for (let y = -20; y <= 20; y++) if (f(e1, x, y) === Number(c1) && f(e2, x, y) === Number(c2)) return v === 'x' ? x : y;
  },
  angles: (p) => { const [a, b] = nums(p); return p.includes('exterior') ? a + b : 180 - a - b; },
  repeatingDecimal: (p) => { const [, rep] = p.match(/the (\d+) repeats/); return Number(rep) / (10 ** rep.length - 1); },
  ticketSystem: (p) => { const [pa, pk, n, T] = nums(p); for (let a = 0; a <= n; a++) if (pa * a + pk * (n - a) === T) return a; },
};

// ---------- independent re-solve of each NORMAL (multiple-choice) generator ----------
// Returns { value } (exactly one choice evaluates to it), { text } (exactly one choice is it), or { pick: i } (index into raw choices).
const FACT = { feet: { inches: 12 }, yards: { feet: 3 }, hours: { minutes: 60 }, minutes: { seconds: 60 }, meters: { centimeters: 100 }, kilograms: { grams: 1000 }, gallons: { quarts: 4 }, pounds: { ounces: 16 } };
const exprIn = (p) => p.match(/equal to (.+)\?$/)[1];
const solveChoice = {
  unitRate: (p) => {
    if (!p.includes('$')) { const [t, n] = nums(p); return { value: t / n }; }
    const t = Number(p.match(/\$(\d+)/)[1]); const n = nums(p).find((x) => x !== t) ?? t; return { value: t / n };
  },
  percentOf: (p) => { const pc = Number(p.match(/(\d+)%/)[1]); const ns = nums(p); ns.splice(ns.indexOf(pc), 1); return { value: (pc * ns[0]) / 100 }; },
  ratioTable: (p) => { const n = nums(p); return { value: p.includes('fish') ? (n[0] * n[2]) / n[1] : (n[1] * n[2]) / n[0] }; },
  orderOps: (p) => ({ value: evalExpr(p.match(/What is (.+)\?/)[1]) }),
  distributive: (p, q) => { const v = p.match(/[xny]/g).pop(); return { pick: q.choices.findIndex((c) => sameExpr(c, exprIn(p), v)), unique: (c) => sameExpr(c, exprIn(p), v) }; },
  writeExpression: (p, q) => {
    const [, phrase] = p.match(/"(.+)"/); let m, f, v;
    if ((m = phrase.match(/^(\d+) more than (\w)$/))) { v = m[2]; f = (t) => t + Number(m[1]); }
    else if ((m = phrase.match(/^(\d+) less than (\w)$/))) { v = m[2]; f = (t) => t - Number(m[1]); }
    else if ((m = phrase.match(/^the product of (\d+) and (\w)$/))) { v = m[2]; f = (t) => t * Number(m[1]); }
    else if ((m = phrase.match(/^(\w) divided by (\d+)$/))) { v = m[1]; f = (t) => t / Number(m[2]); }
    const ok = (c) => [101, 203].every((t) => close(evalVar(c, v, t), f(t)));
    return { pick: q.choices.findIndex(ok), unique: ok };
  },
  evaluate: (p) => {
    let m;
    if ((m = p.match(/value of (\d+)x \+ (\d+) when x = (\d+)/))) return { value: m[1] * m[3] + Number(m[2]) };
    m = p.match(/(\d+)h \+ (\d+) dollars\. How many dollars do (\d+) hours/); return { value: m[1] * m[3] + Number(m[2]) };
  },
  integers: (p) => {
    const xs = p.split(':')[1].replace('?', '').split(',').map(Number);
    if (p.includes('farthest')) return { value: xs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) };
    return { value: p.includes('least') ? Math.min(...xs) : Math.max(...xs) };
  },
  areaFormula: (p) => {
    const n = nums(p);
    if (p.includes('triangle')) return { value: (n[0] * n[1]) / 2 };
    if (p.includes('parallelogram')) return { value: n[0] * n[1] };
    if (p.includes('trapezoid')) return { value: ((n[0] + n[1]) * n[2]) / 2 };
    if (p.includes('box')) return { value: n[0] * n[1] * n[2] };
    return { value: 6 * n[0] * n[0] };
  },
  meanMedian: (p) => {
    const xs = nums(p).sort((a, b) => a - b);
    assert.equal(xs.length, 5, p);
    if (p.includes('median')) return { value: xs[2] };
    if (p.includes('mean')) return { value: xs.reduce((s, x) => s + x, 0) / 5 };
    return { value: xs[4] - xs[0] };
  },
  gcfLcm: (p) => { const [a, b] = nums(p); return { value: p.includes('greatest common') ? gcd(a, b) : (a * b) / gcd(a, b) }; },
  convert: (p) => {
    let m;
    if ((m = p.match(/How many (\w+) are in (\d+) (\w+)\?/))) return { value: Number(m[2]) * FACT[m[3]][m[1]] };
    m = p.match(/To change \d+ (\w+) into (\w+)/); return { text: `Multiply by ${FACT[m[1]][m[2]]}` };
  },
  fractionScoops: (p) => { const [, d, n] = nums(p); return { value: n * d }; },

  slopeMeaning: (p, q) => {
    const [, m, b] = p.match(/= (\d+)[tdw] \+ (\d+)/).map(Number);
    const asked = Number(p.match(/What does the (\d+) tell/)[1]);
    const cat = asked === m ? /each (minute|day|week)|Each day/ : /at the start|sign-up fee/;
    assert.ok(asked === m || asked === b, p);
    const ok = (c) => cat.test(c) && nums(c).includes(asked);
    return { pick: q.choices.findIndex(ok), unique: ok };
  },
  slopeIntercept: (p) => { const e = p.match(/line y = (.+)\?/)[1]; const b = evalWithX(e, 0); return { value: p.includes('slope') ? evalWithX(e, 1) - b : b }; },
  slopeCompute: (p) => { const [a, b, c, d] = nums(p); return { value: (d - b) / (c - a) }; },
  exponentRule: (p) => ({ value: evalExpr(exprIn(p)) }),
  sciNotation: (p) => {
    if (p.includes('greatest')) return { value: Math.max(...p.split(': ')[1].replace('?', '').split(', ').map(cval)) };
    if (p.includes('equal to')) return { value: evalExpr(p.match(/equal to (.+)\?/)[1]) };
    const [, big, small] = p.match(/large is (.+) as (.+)\?/); return { value: evalExpr(big) / evalExpr(small) };
  },
  pythagorean: (p, q) => {
    const n = nums(p);
    if (p.includes('Which equation finds the hypotenuse')) { const ok = (c) => holds(c, 'c', Math.hypot(n[0], n[1])); return { pick: q.choices.findIndex(ok), unique: ok }; }
    if (p.includes('Which equation finds the other leg')) { const ok = (c) => holds(c, 'b', Math.sqrt(n[0] ** 2 - n[1] ** 2)); return { pick: q.choices.findIndex(ok), unique: ok }; }
    if (p.includes('How long')) return { value: Math.hypot(n[0], n[1]) };
    const [a, b, c] = n; const right = a * a + b * b === c * c;
    const ok = (ch) => ch.startsWith(right ? 'Yes' : 'No');
    return { pick: q.choices.findIndex(ok), unique: ok };
  },
  solveLinear: (p) => {
    const [a, b, c] = nums(p);
    if (p.includes('next step')) return { text: `Divide both sides by ${a}` };
    for (let x = -50; x <= 50; x++) if (a * x + b === c) return { value: x };
  },
  solutionCount: (p) => {
    let m;
    if ((m = p.match(/equation (.+) = (.+) have/))) {
      const d0 = evalWithX(m[1], 0) - evalWithX(m[2], 0), d1 = evalWithX(m[1], 1) - evalWithX(m[2], 1);
      return { text: d1 !== d0 ? 'Exactly one' : d0 !== 0 ? 'No solution' : 'Infinitely many' };
    }
    const lines = p.match(/have: (.+) and (.+)\?/).slice(1).map((e) => {
      const [, k, rhs] = e.match(/^(\d*)y = (.+)$/); const div = Number(k || 1);
      const b = evalWithX(rhs, 0) / div; return [evalWithX(rhs, 1) / div - b, b];
    });
    const [[m1, b1], [m2, b2]] = lines;
    return { text: m1 !== m2 ? 'Exactly one' : b1 !== b2 ? 'No solution' : 'Infinitely many' };
  },
  angles: (p) => {
    const n = nums(p.replace(/180°/g, ''));
    if (p.includes('triangle')) return { value: 180 - n[0] - n[1] };
    if (p.includes('side by side on a straight line') || p.includes('same-side')) return { value: 180 - n[0] };
    return { value: n[0] };
  },
  volumeFormula: (p) => {
    const [r, h] = nums(p);
    if (p.includes('cylinder')) return { value: Math.PI * r * r * h };
    if (p.includes('cone')) return { value: (Math.PI * r * r * h) / 3 };
    return { value: (4 / 3) * Math.PI * r ** 3 };
  },
  transformation: (p) => {
    const [x, y] = nums(p);
    const pt = (a, b) => `(${a}, ${b})`;
    if (p.includes('x-axis')) return { text: pt(x, -y) };
    if (p.includes('y-axis')) return { text: pt(-x, y) };
    if (p.includes('180°')) return { text: pt(-x, -y) };
    if (p.includes('dilated')) { const k = nums(p)[2]; return { text: pt(k * x, k * y) }; }
    const m = p.match(/moved (\d+) units (right|left) and (\d+) units (up|down)/);
    return { text: pt(x + (m[2] === 'right' ? 1 : -1) * m[1], y + (m[4] === 'up' ? 1 : -1) * m[3]) };
  },
  sqrtEstimate: (p, q) => {
    if (p.includes('between')) { const n = nums(p)[0]; let a = 0; while ((a + 1) * (a + 1) <= n) a++; return { text: `${a} and ${a + 1}` }; }
    const ok = (c) => { const m = c.match(/^√(\d+)$/); return !!m && !Number.isInteger(Math.sqrt(Number(m[1]))); };
    return { pick: q.choices.findIndex(ok), unique: ok };
  },
};

const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object/;
let checked = 0;

function checkQuestion(q, grade, subject) {
  assert.equal(q.grade, grade);
  assert.equal(q.subject, subject);
  for (const k of ['prompt', 'explain', 'standard']) assert.ok(typeof q[k] === 'string' && q[k].trim().length > 0, `${k} empty: ${q.prompt}`);
  assert.doesNotMatch(q.prompt + q.explain, BAD, q.prompt);
  if (q.kind === 'choice') {
    assert.ok(subject !== 'spelling', q.prompt);
    assert.ok(Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 4, q.prompt);
    if (subject === 'math') assert.equal(q.choices.length, 4, `math needs 4 choices: ${q.prompt}`);
    assert.equal(new Set(q.choices).size, q.choices.length, `duplicate choice: ${q.prompt}`);
    for (const c of q.choices) assert.ok(typeof c === 'string' && c.trim().length > 0 && !BAD.test(c), `bad choice "${c}": ${q.prompt}`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `answer out of range: ${q.prompt}`);
  } else {
    assert.equal(q.kind, 'typed');
    assert.ok(subject === 'math' || subject === 'spelling');
    assert.ok(q.answers.length > 0, q.prompt);
    for (const a of q.answers) assert.ok(typeof a === 'string' && a.trim() === a && a.length > 0 && !BAD.test(a), `bad answer "${a}": ${q.prompt}`);
  }
  checked++;
}

// ---------- pools ----------
const MIN = { math: 120, history: 150, grammar: 150, spelling: 250 };
for (const grade of [6, 8]) {
  const prompts = new Set();
  for (const subject of ['math', 'history', 'grammar', 'spelling']) {
    const pool = bank[grade][subject];
    assert.ok(pool.length >= MIN[subject], `${grade} ${subject} has only ${pool.length}`);
    for (const q of pool) {
      checkQuestion(q, grade, subject);
      assert.ok(!prompts.has(q.prompt), `duplicate prompt: ${q.prompt}`);
      prompts.add(q.prompt);
      if (subject === 'math') assert.equal(q.kind, 'choice', q.prompt);
      if (subject === 'spelling') {
        assert.ok(q.prompt.includes('_____'), `word not found in its sentence: ${q.answers[0]}`);
        assert.ok(!q.prompt.toLowerCase().includes(q.answers[0].toLowerCase()), `prompt gives the word away: ${q.answers[0]}`);
        assert.ok(q.speak.startsWith(q.answers[0]), q.answers[0]);
        assert.match(q.answers[0], /^[a-z]+$/, q.answers[0]);
      }
    }
  }
  const words = bank[grade].spelling.map((q) => q.answers[0]);
  assert.equal(new Set(words).size, words.length, `duplicate spelling word in grade ${grade}`);
  console.log(`grade ${grade}: hand-written math ${bank[grade].math.length}, history ${bank[grade].history.length}, grammar ${bank[grade].grammar.length}, spelling ${bank[grade].spelling.length}`);
}

// ---------- epic math: 1000 runs each, every answer form parses to the independently solved value ----------
for (const grade of [6, 8]) {
  for (const [name, gen] of Object.entries(mathGenerators[grade])) {
    assert.ok(solveTyped[name], `no solver for ${name}`);
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const q = gen();
      checkQuestion(q, grade, 'math');
      assert.equal(q.kind, 'typed');
      assert.ok(q.prompt.startsWith(EPIC_LEAD), q.prompt);
      seen.add(q.prompt);
      const want = solveTyped[name](q.prompt);
      assert.ok(typeof want === 'number' && Number.isFinite(want), `${name}: solver failed on: ${q.prompt}`);
      for (const a of q.answers) {
        const v = parseNum(a);
        assert.ok(close(v, want), `${name}: answer "${a}" (=${v}) but solver says ${want}: ${q.prompt}`);
        const dec = a.match(/\.(\d+)/);
        assert.ok(!dec || dec[1].length <= 7, `${name}: messy decimal ${a}`);
      }
      assert.ok(name.startsWith('sci') || Math.abs(want) < 1e10, `${name}: huge answer ${want}`);
    }
    console.log(`grade ${grade} epic ${name}: 1000 runs ok, ${seen.size} distinct prompts`);
  }
}

// ---------- normal math generators: 2000 runs each; the key is the one and only right choice ----------
for (const grade of [6, 8]) {
  let distinct = 0;
  for (const [name, gen] of Object.entries(choiceGenerators[grade])) {
    assert.ok(solveChoice[name], `no solver for ${name}`);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const q = gen();
      checkQuestion(q, grade, 'math');
      assert.equal(q.kind, 'choice');
      assert.equal(q.answer, 0, `${name}: generators list the key first`);
      assert.ok(!q.prompt.startsWith(EPIC_LEAD), q.prompt);
      seen.add(q.prompt);
      const want = solveChoice[name](q.prompt, q);
      assert.ok(want, `${name}: solver failed on: ${q.prompt}`);
      let hits;
      if ('value' in want) {
        assert.ok(Number.isFinite(want.value), `${name}: solver failed on: ${q.prompt}`);
        hits = q.choices.map((c, j) => (close(cval(c), want.value) ? j : -1)).filter((j) => j >= 0);
      } else if ('text' in want) {
        hits = q.choices.map((c, j) => (c === want.text ? j : -1)).filter((j) => j >= 0);
      } else {
        hits = q.choices.map((c, j) => (want.unique(c) ? j : -1)).filter((j) => j >= 0);
      }
      assert.deepEqual(hits, [q.answer], `${name}: right choices ${JSON.stringify(hits)} for: ${q.prompt} ${JSON.stringify(q.choices)}`);
    }
    distinct += seen.size;
    console.log(`grade ${grade} normal ${name}: 2000 runs ok, ${seen.size} distinct prompts`);
  }
  console.log(`grade ${grade}: ${distinct} distinct generated normal math prompts seen + ${bank[grade].math.length} hand-written`);
}

// ---------- serving: shuffled choices still point at the key; persistence across page loads ----------
const keyByPrompt = new Map();
for (const grade of [6, 8]) for (const subject of ['math', 'history', 'grammar']) for (const q of bank[grade][subject]) keyByPrompt.set(grade + q.prompt, q.choices[q.answer]);

const answerSpots = new Set();
let mod = await pageLoad();
for (const grade of [6, 8]) {
  for (const subject of ['history', 'grammar', 'spelling']) {
    const pool = bank[grade][subject];
    const limit = Math.floor(pool.length * 0.8);
    const got = new Set();
    for (let i = 0; i < limit; i++) {
      if (i % 7 === 0) mod = await pageLoad(); // a new page every few questions
      const q = mod.nextQuestion(grade, subject);
      checkQuestion(q, grade, subject);
      assert.ok(!got.has(q.prompt), `${grade} ${subject}: repeat after ${i} of ${pool.length}: ${q.prompt}`);
      got.add(q.prompt);
      if (q.kind === 'choice') { assert.equal(q.choices[q.answer], keyByPrompt.get(grade + q.prompt), q.prompt); answerSpots.add(q.answer); }
    }
    for (let i = 0; i < pool.length * 2; i++) mod.nextQuestion(grade, subject); // keeps working once a pool cycles
  }
  // normal math across page loads: no repeated prompt in 120 questions, every one multiple choice
  const mathGot = new Set();
  for (let i = 0; i < 120; i++) {
    if (i % 5 === 0) mod = await pageLoad();
    const q = mod.nextQuestion(grade, 'math');
    checkQuestion(q, grade, 'math');
    assert.equal(q.kind, 'choice', q.prompt);
    assert.ok(!mathGot.has(q.prompt), `math repeat: ${q.prompt}`);
    mathGot.add(q.prompt);
    if (keyByPrompt.has(grade + q.prompt)) assert.equal(q.choices[q.answer], keyByPrompt.get(grade + q.prompt), q.prompt);
    answerSpots.add(q.answer);
  }
  const epicGot = new Set();
  for (let i = 0; i < 120; i++) {
    if (i % 5 === 0) mod = await pageLoad();
    const q = mod.nextQuestion(grade, 'math', 'epic');
    checkQuestion(q, grade, 'math');
    assert.equal(q.kind, 'typed');
    assert.ok(q.prompt.startsWith(EPIC_LEAD), q.prompt);
    assert.ok(!epicGot.has(q.prompt), `epic repeat: ${q.prompt}`);
    epicGot.add(q.prompt);
  }
  for (const s of ['history', 'grammar', 'spelling']) assert.equal(mod.nextQuestion(grade, s, 'epic').subject, s); // epic non-math = normal question
  for (let i = 0; i < 200; i++) { const q = mod.nextQuestion(grade); checkQuestion(q, grade, q.subject); }
}
assert.equal(answerSpots.size, 4, 'choices are not being shuffled');
for (const v of store.values()) assert.ok(JSON.parse(v).length <= 400, 'stored list not capped');

// storage that throws (private mode): still serves, no crash
storageBroken = true;
mod = await pageLoad();
for (const s of ['math', 'history', 'grammar', 'spelling']) checkQuestion(mod.nextQuestion(6, s), 6, s);
checkQuestion(mod.nextQuestion(8, 'math', 'epic'), 8, 'math');

console.log(`SELF-CHECK PASSED: ${checked} question checks, ${loads} simulated page loads, ${store.size} stored lists`);
