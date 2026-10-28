import fs from 'node:fs';
import { predict } from '../engine.js';
const P = JSON.parse(fs.readFileSync(new URL('../models.json', import.meta.url),'utf8'));
const cases = JSON.parse(fs.readFileSync(process.argv[2] ?? 'reference.json','utf8'));
const stats = {};
let worst = {pvd:0, cardio:0}, fails = [];
for (const c of cases) {
  const k = c.model; stats[k] ??= {n:0, classMismatch:0, maxPvdDiff:0, maxCardioDiff:0, other:0};
  const s = stats[k]; s.n++;
  const js = predict(P, c.input, c.model);
  const py = c.out;
  if (c.status !== 200) { if (!js.errors || JSON.stringify(Object.keys(js.errors).sort()) !== JSON.stringify(Object.keys(py.errors||{}).sort())) { s.other++; fails.push(['validation', c]); } continue; }
  if (js.pvd_detected !== py.pvd_detected || js.cardio_detected !== py.cardio_detected || js.pvd_risk_level !== py.pvd_risk_level) { s.classMismatch++; fails.push(['class', c, js]); }
  s.maxPvdDiff = Math.max(s.maxPvdDiff, Math.abs(js.pvd_probability - py.pvd_probability));
  if (py.pvd_detected && js.pvd_detected) {
    s.maxCardioDiff = Math.max(s.maxCardioDiff, Math.abs(js.cardio_probability - py.cardio_probability));
    if (JSON.stringify(js.recommendations) !== JSON.stringify(py.recommendations) || Math.abs(js.impact.impact_percentage - py.impact.impact_percentage) > 1e-9 || js.impact.severity !== py.impact.severity) { s.other++; fails.push(['rec/impact', c]); }
  }
}
console.log(JSON.stringify(stats, null, 1));
console.log('failures:', fails.length);
for (const f of fails.slice(0,5)) console.log(JSON.stringify(f).slice(0,600));
