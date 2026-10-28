# PVD and heart risk check (browser version)

Live: **https://cardio.asifferdous.dev**

A browser-only version of [pvd-cardio-prediction](https://github.com/Asif-Ferdous/pvd-cardio-prediction).
The original project trains and serves the models with Python and Flask. This version runs the same trained
models directly in the browser, so it needs no server, loads instantly, and the health details a visitor
enters never leave their device.

The original repository is unchanged and remains the source of the training code and the models.

## How it works

1. `tools/export_models.py` reads the trained `.pkl` files from the original project and writes their exact
   parameters to `models.json`: tree structures and thresholds for the Decision Tree and Random Forest models,
   weights for the SGD models, trees and leaf values for the XGBoost models, plus the input scaler.
2. `engine.js` evaluates those parameters with the same rules the Python libraries use (including float32
   handling for tree splits), and reproduces the logic of the original `/predict` endpoint: validation,
   scaling, the two-stage PVD then cardiovascular prediction, the PVD impact analysis and the recommendations.
3. `index.html` and `app.js` are the page. There is no build step and no third-party code.

## Verified against the original

`tools/make_reference.py` calls the original Flask app's `/predict` endpoint, and `tools/verify.mjs` compares
every answer with this version. On 32,040 requests (8,010 inputs, each run on all 4 models: 4,000 records from
the dataset, 4,000 random inputs, plus boundary and invalid cases):

| Model | Same decisions | Largest probability difference |
|---|---|---|
| Decision Tree | 8,010 / 8,010 | 0 |
| Random Forest | 8,010 / 8,010 | 0 |
| SGD | 8,010 / 8,010 | < 1e-13 % |
| XGBoost | 8,010 / 8,010 | < 0.00001 % |

To repeat it (scikit-learn 1.6.1, xgboost 1.7.5, Flask 2.3.3):

```bash
cd /path/to/pvd-cardio-prediction
python /path/to/pvd-cardio-web/tools/make_reference.py /tmp/reference.json
node /path/to/pvd-cardio-web/tools/verify.mjs /tmp/reference.json
```

## Run locally

Any static server works, for example `python -m http.server` in this folder, then open http://localhost:8000.

## Medical disclaimer

This is a research prototype for education and screening research only. It must not be used for diagnosis or
treatment decisions. Always consult a qualified healthcare provider.

## Author

M M Asif Ferdous · [asifferdous.dev](https://asifferdous.dev)
