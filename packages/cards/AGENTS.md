# Card package rules

- Card records are inert data. Never evaluate card-authored code.
- Add schema and evaluator tests whenever an effect operator changes.
- Every released identity is `(id, version)`; never mutate historical definitions.
- Every asset and adapted mechanic needs explicit origin and license metadata.
