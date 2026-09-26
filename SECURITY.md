# Security Policy

## Supported Versions

We provide security fixes for the latest `3.x` release line of `request-legacy`.

## Reporting a Vulnerability

Please report security issues privately.

Email: ralf.kruemmel-python@outlook.de

Include:
- A clear description of the issue
- Steps to reproduce
- Affected version(s)
- Any proof-of-concept or logs that help validate the report

## Coordinated Disclosure

We follow a coordinated disclosure process. We will acknowledge reports, provide a timeline where possible, and publish fixes in a new release.


## 2026-09 dependency hardening

The production dependency floor is intentionally explicit for security-sensitive packages:

- `form-data ^4.0.6`
- `qs ^6.16.0`
- no runtime dependency on deprecated `har-validator`

Before publishing a release, run:

```bash
npm install
npm run lint
npm run test-ci
npm run security-check
npm run audit:prod
```

`npm audit` is contextual: execute the package audit in a clean checkout. Running it from an unrelated application directory can report findings that are not dependencies of `request-legacy`.
