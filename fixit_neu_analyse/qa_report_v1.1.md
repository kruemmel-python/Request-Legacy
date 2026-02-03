# Certificate of Health — SubQG Matrix v1.1

Issued: 2026-02-03
Run-ID: hotspot-20260203044608

## Validation Summary
- Test Suite: npm run test-ci
- Status: green (no "not ok" in final TAP log)
- Platform: Windows (test-tunnel, test-unix skipped as expected)
- Runtime Harmonization: Node.js v22.13.0

## Risk Trend (Hotspot Reduction)
- 2026-02-03T00:55:29Z: avg_score 0.967, hotspots 83
- 2026-02-03T01:04:26Z: avg_score 0.965, hotspots 83
- 2026-02-03T04:46:09Z: avg_score 0.954, hotspots 8

## Top Findings (QA-Studio)
- index.js – Near-Duplicate (Risk 1.00)
- request.js – Near-Duplicate (Risk 1.00)
- lib\auth.js – Near-Duplicate (Risk 1.00)
- lib\har.js – Near-Duplicate (Risk 1.00)
- lib\redirect.js – Near-Duplicate (Risk 1.00)

## Artifacts
- TAP log: fixit_neu_analyse\tap-final.log
- QA summary: fixit_neu_analyse\dashboard_summary.md
- Hotspots: fixit_neu_analyse\hotspot_findings.csv
- Trend: fixit_neu_analyse\trend_history.json
- Reports: fixit_neu_analyse\hotspot_report.json, fixit_neu_analyse\hotspot_heatmap.json

## Declaration
Die Reduktion der Hotspots (83 → 8) und die erfolgreiche Harmonisierung mit Node.js v22.13.0 bestätigen die funktionale Integrität von Request v1.1 unter der SubQG Matrix.
