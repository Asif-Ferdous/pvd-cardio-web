"""Export the trained models from the original Python project to models.json.

Run from a checkout of github.com/Asif-Ferdous/pvd-cardio-prediction, using the versions
the models were trained with (scikit-learn 1.6.1, xgboost 1.7.5):

    python export_models.py /path/to/pvd-cardio-prediction models.json
"""
import json, sys
import joblib
import pandas as pd

src, dest = sys.argv[1], sys.argv[2]
M = lambda f: f"{src}/models/{f}"

def tree_json(t):
    v = t.value[:, 0, :]
    v = v / v.sum(axis=1, keepdims=True)
    return {"left": t.children_left.tolist(), "right": t.children_right.tolist(),
            "feature": t.feature.tolist(), "threshold": t.threshold.tolist(), "proba1": v[:, 1].tolist()}

def xgb_json(m):
    b = m.get_booster()
    j = json.loads(b.save_raw("json").decode())
    cfg = json.loads(b.save_config())
    trees = [{"left": t["left_children"], "right": t["right_children"], "feature": t["split_indices"],
              "cond": t["split_conditions"], "default_left": t["default_left"]}
             for t in j["learner"]["gradient_booster"]["model"]["trees"]]
    return {"base_score": float(cfg["learner"]["learner_model_param"]["base_score"]),
            "objective": cfg["learner"]["objective"]["name"], "trees": trees}

feat = pd.read_csv(M("feature_names.csv"))["Feature Names"].tolist()
sc = joblib.load(M("feature_scaler.pkl"))
out = {"features": feat,
       "scaler": {"features": list(sc.feature_names_in_), "scale": sc.scale_.tolist(), "min": sc.min_.tolist()},
       "cardio_probabilities": {k: float(v) for k, v in joblib.load(M("cardio_probabilities.pkl")).items()},
       "models": {}}
for target in ["pvd", "cardio"]:
    out["models"][target] = {}
    for name in ["DecisionTree", "RandomForest", "SGD", "XGBoost"]:
        m = joblib.load(M(f"{name}_model_{target}.pkl"))
        assert list(m.feature_names_in_) == feat
        if name == "DecisionTree":
            e = {"type": "tree", **tree_json(m.tree_)}
        elif name == "RandomForest":
            e = {"type": "forest", "trees": [tree_json(t.tree_) for t in m.estimators_]}
        elif name == "SGD":
            e = {"type": "linear", "loss": m.loss, "coef": m.coef_[0].tolist(), "intercept": float(m.intercept_[0])}
        else:
            e = {"type": "xgb", **xgb_json(m)}
        out["models"][target][name] = e
open(dest, "w").write(json.dumps(out, separators=(",", ":")))
print("wrote", dest)
