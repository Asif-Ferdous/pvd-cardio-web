"""Generate reference.json by calling the ORIGINAL Flask app's /predict endpoint.

    cd /path/to/pvd-cardio-prediction && python /path/to/tools/make_reference.py reference.json
"""
import json, random, sys, logging
import pandas as pd
logging.disable(logging.CRITICAL)
import app as A

cached = A.load_models()
A.load_models = lambda: cached
client = A.app.test_client()
random.seed(42)
cols = ["age", "gender", "height", "weight", "ap_hi", "ap_lo", "cholesterol", "gluc", "smoke", "alco", "active"]
rows = pd.read_csv("converted_cardio_train_with_PVD_years.csv").sample(4000, random_state=1)[cols].to_dict("records")
for _ in range(4000):
    lo = random.randint(40, 139)
    rows.append({"age": random.randint(18, 100), "gender": random.randint(1, 2),
                 "height": random.choice([random.randint(140, 220), round(random.uniform(140, 220), 1)]),
                 "weight": random.choice([random.randint(40, 200), round(random.uniform(40, 200), 1)]),
                 "ap_hi": random.randint(max(80, lo + 1), 220), "ap_lo": lo, "cholesterol": random.randint(1, 3),
                 "gluc": random.randint(1, 3), "smoke": random.randint(0, 1), "alco": random.randint(0, 1),
                 "active": random.randint(0, 1)})
cases = []
for r in rows:
    r = {k: (float(v) if k in ("height", "weight") else int(v)) for k, v in r.items()}
    for m in ["DecisionTree", "RandomForest", "SGD", "XGBoost"]:
        resp = client.post("/predict", json={**r, "model": m})
        cases.append({"input": r, "model": m, "status": resp.status_code, "out": resp.get_json()})
json.dump(cases, open(sys.argv[1], "w"))
print(len(cases), "cases")
