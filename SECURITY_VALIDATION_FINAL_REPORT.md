# Security Validation Final Report

## Decision

Closure is **complete**. All fourteen historical findings are dynamically verified as fixed. The strict closure runner returned exit code 0 with no incomplete mandatory finding.

No productive source file was modified. No commit, push, tag or release was created.

## Scope and provenance

- Frozen baseline: `a98331f8c2e22e6266b7e292b93b7fb2c019e525`
- Historical scan: `926db1e9-c724-4468-9da0-32226b9aa272` (short ID `73632f34`)
- Validated source revision before the evidence-only baseline commit: Request-Legacy 3.0.9 / `68ba812f2db6d9a68d60706250215ba354241994`
- Execution date: 2026-10-24
- Final evidence: `FINDINGS_CLOSURE_RESULTS/20261024_164925`
- Machine-readable result: `SECURITY_FINDINGS_CLOSURE_MATRIX.json`

All new dynamic checks use loopback-only servers, synthetic credentials and temporary directories on drive H. SEC-14 starts the testserver from an isolated copy with its own `reports` directory. Existing reports are neither read nor changed. The WSL project, npm cache, HOME and TMPDIR are also on H; the Unix-domain socket itself uses Linux RAM at `/dev/shm`, because NTFS cannot host Unix sockets.

## Implemented dynamic regressions

- SEC-04: eight Referer assertions across same origin, cross-port, different host, HTTP-to-HTTPS and HTTPS-to-HTTP redirects, including query and fragment leakage.
- SEC-05: nine assertions covering direct-to-proxy and proxy-to-direct environment-policy changes plus an explicit proxy across both redirect hops.
- SEC-08: nine emitted-debug-log assertions covering Authorization, bearer token, cookies, AWS secret, URL credentials, query token, nested data and circular values.
- SEC-12: seven live testserver assertions for token and browser-boundary enforcement plus an authorized control request.
- SEC-14: six live assertions for startup expiry, denied access, concurrent listing/download cleanup and restart cleanup in an isolated server copy.

## SEC-05 correction

The first SEC-05 test revision incorrectly treated Windows environment-variable names as case-sensitive. On Windows, assigning `http_proxy` and subsequently deleting `HTTP_PROXY` deletes the same variable. The earlier failing execution therefore ran without the intended proxy and did not demonstrate a product defect.

The corrected test first clears all proxy spellings, then sets the intended environment consistently. It validates both environment-policy transitions and a genuinely explicit two-hop proxy flow. Result: **9/9 assertions PASS**. No product patch was necessary, and the temporary diagnostic source edit was fully reverted before validation.

## Executed validation

| Validation | Result |
|---|---|
| Strict fourteen-finding closure runner | PASS, exit 0, incomplete findings 0 |
| Finding-specific evidence | 14/14 PASS; each has exit code, assertion decision and log |
| Full Windows suite | 527/527 PASS |
| Lint and source security checks | PASS |
| Real WSL/Linux Unix-socket and tunnel suite | 36/36 PASS |
| Production dependency audit | 0 known vulnerabilities at moderate threshold |
| Complete dependency audit | 0 known vulnerabilities at moderate threshold |
| Isolated testserver install, build and security regression | PASS |
| Isolated testserver dependency audit | 0 known vulnerabilities at moderate threshold |

The fourteen finding executions use eight distinct executable targets. Repeated executions of shared regression files are retained as separate per-finding logs but are not misreported as fourteen distinct test programs.

## Closure status

The authoritative fourteen-point outcome is in `SECURITY_FINDINGS_CLOSURE_MATRIX.md` and `SECURITY_FINDINGS_CLOSURE_MATRIX.json`: **14 VERIFIED_FIXED, 0 open, 0 partial, 0 blocked, 0 skipped and 0 not tested**.
