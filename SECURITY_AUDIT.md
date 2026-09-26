# Request-Legacy 3.0.5 Security Audit Notes

## Hardening pass — 2026-09-26

This release is a security-focused maintenance release. It is intentionally conservative about the public Request API while reducing the production dependency surface, closing newly disclosed dependency issues, adding runtime guards, and adding release gates so the package cannot be published accidentally without tests and a production audit.

## Production dependency changes

| Component | Previous | 3.0.5 | Action |
|---|---:|---:|---|
| form-data | ^4.0.0 | 4.0.6 | CRLF-injection fix floor pinned |
| qs | ^6.11.0 | 6.16.0 | current DoS fixes pinned |
| tough-cookie | ^4.1.3 | 6.0.2 | current maintained major |
| mime-types | ^2.1.35 | 3.0.2 | current maintained major |
| http-signature | ~1.2.0 | 1.4.0 | current release |
| aws4 | ^1.8.0 | 1.13.2 | current release |
| har-validator | ~5.1.3 | removed | deprecated/unmaintained; internal validator used |
| tunnel-agent | ~0.6.0 | removed | replaced by an internal HTTP CONNECT agent using Node core APIs |
| forever-agent | ~0.6.1 | removed | obsolete on Node 18+; native keep-alive agent used |
| performance-now | ^2.1.0 | removed | replaced by node:perf_hooks |
| safe-buffer | ^5.1.2 | removed | replaced by node:buffer |
| isstream | ~0.1.2 | removed | replaced by small internal stream predicate |
| json-stringify-safe | ~5.0.1 | removed | replaced by internal cycle-safe stringify fallback |
| extend | ~3.0.2 | removed | replaced by internal merge that blocks prototype-pollution keys |

The remaining compatibility dependencies are pinned exactly in 3.0.5 so a published release resolves deterministically unless the consumer intentionally overrides them.

## Runtime hardening

- HAR validation is local and no longer relies on the abandoned `har-validator` package.
- HAR/query merge paths ignore inherited properties.
- The internal object merge rejects `__proto__`, `prototype`, and `constructor` keys.
- Redirect-sensitive headers (`Authorization`, `Proxy-Authorization`, `Cookie`) are stripped whenever the origin changes by scheme, host, or port.
- HTTPS-to-HTTP redirects do not emit a `Referer` header.
- Redirect Referer values are sanitized so URL credentials and fragments are never forwarded.
- `maxRedirects` must be a safe integer from 0 through 100. `NaN`/Infinity can no longer disable loop protection.
- Callback response buffering now has a default 64 MiB `maxResponseSize` limit. This is checked on decompressed data as it is received, mitigating memory-exhaustion and decompression-bomb scenarios. Set `maxResponseSize: 0` only when the caller deliberately accepts unbounded callback buffering.
- Global Node warning suppression was removed. Deprecation/runtime warnings are no longer hidden.
- The old test-only OpenSSL `SECLEVEL=0` configuration was removed.

## Development/release hardening

- ESLint 10.11.0, @eslint/js 10.0.1, globals 17.12.0.
- Tape was replaced by an internal serial compatibility runner. This removes the deprecated `glob@7` and `inflight` development dependency chain while preserving the legacy suite's dynamic test registration semantics.
- The complete suite contains 517 passing tests on Windows; platform-specific tunnel and Unix-socket cases remain explicit skips.
- `eslint --max-warnings=0`: warnings fail CI.
- `prepublishOnly` runs the complete release verification gate.
- `npm audit --omit=dev --audit-level=moderate` is mandatory for release verification.
- GitHub Actions tests supported development Node versions and runs a scheduled weekly security job.
- GitHub dependency review fails pull requests on moderate-or-higher dependency findings.
- Dependabot is enabled for npm and GitHub Actions.
- The published npm tarball is reduced to runtime code and documentation; tests, CI helpers, data inventories, and local scripts are excluded from the consumer package.

## Clean verification

Run from the repository root in PowerShell:

```powershell
.\VERIFY_RELEASE.ps1
```

Or manually:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
npm run lint
npm run test-ci
npm run security-check
npm run audit:prod
npm pack --dry-run
```

A release is considered verified only when every command exits successfully and `npm audit --omit=dev` reports zero known vulnerabilities at the time of the check.
