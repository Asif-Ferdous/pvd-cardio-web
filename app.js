import { predict } from './engine.js';

const form = document.getElementById('form');
const results = document.getElementById('results');
const FIELDS = ['age', 'height', 'weight', 'ap_hi', 'ap_lo'];
const COLORS = { Low: 'var(--low)', Moderate: 'var(--mod)', High: 'var(--high)' };
let params = null;
let hasResult = false;

const paramsReady = fetch('/models.json')
  .then((r) => r.json())
  .then((p) => (params = p))
  .catch(() => {
    results.innerHTML = '<div class="empty">The models could not be loaded. Please refresh the page.</div>';
  });

const level = (p) => (p < 30 ? 'Low' : p < 70 ? 'Moderate' : 'High');
const pct = (n) => `${n.toFixed(1)}%`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function meter(p, lvl) {
  const wrap = el('div');
  wrap.append(
    el('div', { class: 'meter', role: 'img', 'aria-label': `${pct(p)} risk` }, el('span', { style: `width:${Math.max(p, 1.5)}%;background:${COLORS[lvl]}` })),
    el('div', { class: 'scale' }, el('span', {}, 'Low'), el('span', {}, '30%'), el('span', {}, '70%'), el('span', {}, 'High')),
  );
  return wrap;
}

function readForm() {
  const fd = new FormData(form);
  const v = (k) => (fd.get(k) === '' || fd.get(k) === null ? NaN : Number(fd.get(k)));
  return {
    age: v('age'), gender: v('gender'), height: v('height'), weight: v('weight'), ap_hi: v('ap_hi'), ap_lo: v('ap_lo'),
    cholesterol: v('cholesterol'), gluc: v('gluc'), smoke: v('smoke'), alco: v('alco'), active: v('active'),
  };
}

function showErrors(errors) {
  for (const f of FIELDS) {
    const input = document.getElementById(f);
    const msg = errors[f] ? (f === 'ap_hi' && errors[f].startsWith('Systolic') ? errors[f] : `Must be between ${errors[f].replace('must be between ', '')}`) : '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    document.getElementById(`${f}-err`).textContent = msg;
  }
  const first = FIELDS.find((f) => errors[f]);
  if (first) document.getElementById(first).focus();
}

function render(res, modelLabel) {
  results.replaceChildren();

  const pvdLvl = res.pvd_risk_level;
  const pvd = el('div', { class: 'result' },
    el('h3', {}, 'Peripheral vascular disease (PVD)'),
    el('div', { class: 'big' }, el('strong', {}, pct(res.pvd_probability)), el('span', { class: `pill ${pvdLvl}` }, `${pvdLvl} risk`)),
    meter(res.pvd_probability, pvdLvl),
    el('p', { class: 'note' }, res.pvd_detected
      ? 'The model predicts PVD is likely, so the heart risk check below has been run.'
      : 'The model predicts PVD is unlikely. The heart risk check only runs when PVD is predicted, as in the original study design.'),
  );
  results.append(pvd);

  if (res.pvd_detected) {
    const cLvl = level(res.cardio_probability);
    results.append(el('div', { class: 'result' },
      el('h3', {}, 'Cardiovascular disease'),
      el('div', { class: 'big' }, el('strong', {}, pct(res.cardio_probability)), el('span', { class: `pill ${cLvl}` }, `${cLvl} risk`)),
      meter(res.cardio_probability, cLvl),
    ));

    const imp = res.impact;
    const bars = el('div', { class: 'bars' });
    for (const [label, val, color] of [['Without PVD', imp.without_pvd, 'var(--leaf)'], ['With PVD', imp.with_pvd, 'var(--high)']]) {
      bars.append(el('div', { class: 'bar' }, el('span', {}, label), el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${val}%;background:${color}` })), el('b', {}, pct(val))));
    }
    results.append(el('div', { class: 'result' },
      el('h3', {}, 'How much PVD adds to heart risk'),
      el('p', { class: 'note', style: 'margin:0 0 .4rem' }, `Across the study population, cardiovascular disease was ${pct(imp.impact_percentage)} more common in people with PVD (impact: ${imp.severity}).`),
      bars,
    ));

    const list = el('ul', { class: 'recs' });
    for (const r of res.recommendations) list.append(el('li', {}, r));
    results.append(el('div', { class: 'result' }, el('h3', {}, 'Suggested next steps'), list));
  }

  document.getElementById('results-sub').textContent = `Model: ${modelLabel}. Change the model to compare.`;
}

async function run(scroll) {
  await paramsReady;
  if (!params) return;
  const input = readForm();
  const model = form.model.value;
  const res = predict(params, input, model);
  if (res.errors) {
    showErrors(res.errors);
    return;
  }
  showErrors({});
  render(res, form.model.options[form.model.selectedIndex].text.replace(/ \(.*\)$/, ''));
  hasResult = true;
  if (scroll && window.matchMedia('(max-width: 959px)').matches) {
    document.getElementById('results-title').scrollIntoView({ block: 'start' });
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  run(true);
});
form.model.addEventListener('change', () => hasResult && run(false));

document.getElementById('example').addEventListener('click', () => {
  const ex = { age: 58, height: 168, weight: 92, ap_hi: 150, ap_lo: 95 };
  for (const [k, v] of Object.entries(ex)) form[k].value = v;
  form.cholesterol.value = '2';
  form.gluc.value = '1';
  form.querySelector('#s1').checked = true;
  form.querySelector('#p0').checked = true;
  run(true);
});
