# Security Findings Closure Matrix

Execution date: 2026-10-24

Validated source revision before the evidence-only baseline commit: Request-Legacy 3.0.9, `68ba812f2db6d9a68d60706250215ba354241994`.
Evidence directory: `FINDINGS_CLOSURE_RESULTS/20261024_164925`

A finding is `VERIFIED_FIXED` only when its command exited with 0 and its named assertions were observed. `BLOCKED`, `SKIPPED`, `NOT_TESTED` and a missing assertion can never be PASS. The closure runner returned exit code **0** with all mandatory validations complete.

| Finding | Original ID | CWE | Executed regression | Platform | Exit | Assertions | Status | Closure |
|---|---|---|---|---|---:|---|---|---|
| SEC-01 | csf_5cb25714a0820ada552822a2 | CWE-918 | Redirect cannot enter Unix-socket transport | Windows | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-02 | csf_c4fa0eb72811522873dfd95a | CWE-522 / CWE-200 | Deferred credentials and AWS signing state removed on cross-origin redirect | Windows + Linux | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-03 | csf_f9dd847c940ed602cbdfcb16 | CWE-444 | Decoded pipe removes stale Content-Length | Windows + Linux | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-04 | csf_174f2dde19b982931f909ec8 | CWE-200 | Same-origin, cross-port, different-host, upgrade/downgrade Referer behavior | Windows | 0 | 8 | PASS | VERIFIED_FIXED |
| SEC-05 | csf_0f2071078e8610f62d0828c3 | CWE-693 | Re-evaluate environment proxy after redirect | Windows | 0 | 9 | PASS | VERIFIED_FIXED |
| SEC-06 | csf_8c0469a5209de6ab04461469 | CWE-73 | HAR file name cannot authorize local read | Windows | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-07 | csf_60617f0ffb44092a914af4b3 | CWE-441 | CGI uppercase HTTP_PROXY policy | Windows | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-08 | csf_c64c2649ef3f2f6398057cdb | CWE-532 | Emitted debug diagnostics redact credentials and secrets | Windows | 0 | 9 | PASS | VERIFIED_FIXED |
| SEC-09 | csf_1b720bd70da8e58e77c2244a | CWE-693 | IPv6 literal NO_PROXY parsing | Windows | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-10 | csf_201773c24f2a0e8c51fc0fd5 | CWE-295 | Advanced TLS agents are not globally pooled | Windows + Linux | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-11 | csf_6c8ef1d2f64e0dab874905c8 | CWE-93 | Multipart rejects CR/LF raw headers | Windows | 0 | verified | PASS | VERIFIED_FIXED |
| SEC-12 | csf_12b3ca913e48f0e35e1d838a | CWE-352 | Testserver token/browser-boundary denials and authorized request | Windows | 0 | 7 | PASS | VERIFIED_FIXED |
| SEC-13 | csf_92f6a98c1f4ca99451f8b12d | CWE-441 | Real WSL Unix-socket and HTTP/HTTPS tunnel tests | Linux/WSL | 0 | 36/36 | PASS | VERIFIED_FIXED |
| SEC-14 | csf_1373fda31a7dbda6a844ce61 | CWE-459 | Isolated report expiry, access denial, concurrency and restart cleanup | Windows | 0 | 6 | PASS | VERIFIED_FIXED |

## Totals

- Findings: 14
- Verified fixed: 14
- Open: 0
- Partial, blocked, skipped or not tested: 0
- Finding-specific executions/logs: 14, all PASS
- Distinct executable targets: 8 (two existing regression files, five dedicated closure files, one Linux composite target)
- Full Windows suite: 527/527 PASS
- Real Linux/WSL platform suite: 36/36 PASS
- Production and complete dependency audits: 0 known vulnerabilities at the configured moderate threshold
- Testserver build/security verification: PASS; audit: 0 known vulnerabilities

## SEC-05 clarification and closure

The first SEC-05 test revision incorrectly assumed that Windows environment-variable names were case-sensitive. Setting `http_proxy` and then deleting `HTTP_PROXY` removed the same Windows variable, so the purported failing run had no proxy configured. This was a regression-test defect, not a product failure.

The corrected dynamic test safely clears both spellings before setting the intended variable and now executes nine assertions: direct-to-proxy, proxy-to-direct, and explicit-proxy persistence across both redirect hops. All nine pass. No product source change was required.
