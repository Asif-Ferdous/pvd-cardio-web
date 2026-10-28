// Browser port of the PVD + cardiovascular risk models from github.com/Asif-Ferdous/pvd-cardio-prediction.
// It reproduces app.py's /predict logic exactly, using the parameters exported from the trained .pkl files.
// No data leaves the device: everything below runs locally.

const f32 = Math.fround;

// scikit-learn trees compare float32 features against float64 thresholds: x <= t goes left.
function treeProba1(t, x) {
  let n = 0;
  while (t.left[n] !== -1) {
    n = f32(x[t.feature[n]]) <= t.threshold[n] ? t.left[n] : t.right[n];
  }
  return t.proba1[n];
}

// XGBoost works in float32 throughout: x < split goes left, leaf values are summed in float32.
function xgbMargin(m, x) {
  // The prediction starts from the base margin, then each tree's leaf value is added in order.
  let sum = f32(Math.log(m.base_score / (1 - m.base_score)));
  for (const t of m.trees) {
    let n = 0;
    while (t.left[n] !== -1) {
      // Split values are stored as float32; compare against the exact float32 value.
      n = f32(x[t.feature[n]]) < f32(t.cond[n]) ? t.left[n] : t.right[n];
    }
    sum = f32(sum + f32(t.cond[n]));
  }
  return sum;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Returns [predicted class, probability of class 1], matching predict() and predict_proba()[0][1].
function run(model, x) {
  switch (model.type) {
    case 'tree': {
      const p = treeProba1(model, x);
      return [p > 0.5 ? 1 : 0, p];
    }
    case 'forest': {
      let s = 0;
      for (const t of model.trees) s += treeProba1(t, x);
      const p = s / model.trees.length;
      return [p > 0.5 ? 1 : 0, p];
    }
    case 'linear': {
      let d = model.intercept;
      for (let i = 0; i < x.length; i++) d += model.coef[i] * x[i];
      const p = model.loss === 'modified_huber' ? (Math.min(1, Math.max(-1, d)) + 1) / 2 : sigmoid(d);
      return [d > 0 ? 1 : 0, p];
    }
    case 'xgb': {
      const p = f32(sigmoid(xgbMargin(model, x)));
      return [p > 0.5 ? 1 : 0, p];
    }
  }
  throw new Error('Unknown model type');
}

export const RANGES = {
  age: [18, 100], height: [140, 220], weight: [40, 200], ap_hi: [80, 220], ap_lo: [40, 140],
  cholesterol: [1, 3], gluc: [1, 3], smoke: [0, 1], alco: [0, 1], active: [0, 1], gender: [1, 2],
};

export function validate(input) {
  const errors = {};
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    const v = input[k];
    if (v === undefined || v === null || Number.isNaN(v) || v < lo || v > hi) errors[k] = `must be between ${lo} and ${hi}`;
  }
  if ((input.ap_hi ?? 0) <= (input.ap_lo ?? 0)) errors.ap_hi = 'Systolic pressure must be greater than diastolic pressure';
  return errors;
}

function preprocess(P, input) {
  const scaled = { ...input };
  P.scaler.features.forEach((f, i) => {
    let v = input[f] * P.scaler.scale[i] + P.scaler.min[i];
    scaled[f] = v;
  });
  return P.features.map((f) => scaled[f] ?? 0);
}

export function predict(P, raw, modelName) {
  const input = {
    age: Math.trunc(raw.age), gender: Math.trunc(raw.gender), height: Number(raw.height), weight: Number(raw.weight),
    ap_hi: Math.trunc(raw.ap_hi), ap_lo: Math.trunc(raw.ap_lo), cholesterol: Math.trunc(raw.cholesterol),
    gluc: Math.trunc(raw.gluc), smoke: Math.trunc(raw.smoke), alco: Math.trunc(raw.alco), active: Math.trunc(raw.active),
  };
  const errors = validate(input);
  if (Object.keys(errors).length) return { errors };
  if (!P.models.pvd[modelName]) return { error: 'Invalid model selection' };

  const x = preprocess(P, input);
  const [pvd, pvdP] = run(P.models.pvd[modelName], x);
  const pvdProbability = pvdP * 100;
  const res = {
    pvd_detected: pvd === 1,
    pvd_probability: pvdProbability,
    pvd_risk_level: pvdProbability < 30 ? 'Low' : pvdProbability < 70 ? 'Moderate' : 'High',
  };

  if (pvd === 1) {
    const [cardio, cardioP] = run(P.models.cardio[modelName], x);
    const cp = P.cardio_probabilities;
    const impactPct = ((cp.with_pvd - cp.without_pvd) / cp.without_pvd) * 100;
    const severity = impactPct > 100 ? 'Very High' : impactPct > 50 ? 'High' : impactPct > 25 ? 'Moderate' : 'Low';
    res.cardio_detected = cardio === 1;
    res.cardio_probability = cardioP * 100;
    res.impact = { without_pvd: cp.without_pvd * 100, with_pvd: cp.with_pvd * 100, impact_percentage: impactPct, severity };

    const rec = [];
    if (severity === 'High' || severity === 'Very High') {
      rec.push('Urgent cardiovascular specialist consultation recommended', 'Comprehensive cardiovascular assessment needed', 'Frequent monitoring of cardiovascular health');
    } else {
      rec.push('Regular cardiovascular health monitoring', 'Scheduled follow-ups with healthcare provider');
    }
    if (input.smoke === 1) rec.push('Smoking cessation is crucial - PVD significantly increases this risk');
    if (input.alco === 1) rec.push('Reduce alcohol consumption');
    if (input.active === 0) rec.push('Start a supervised exercise program');
    if (input.cholesterol > 1) rec.push('Strict cholesterol management needed');
    rec.push('Maintain healthy blood pressure', 'Follow heart-healthy diet');
    res.recommendations = rec;
  }
  return res;
}
