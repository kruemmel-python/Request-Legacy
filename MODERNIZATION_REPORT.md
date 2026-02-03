# Modernization Report — request 3.0.0

Datum: 2026-02-03

Zweck: Nachweis, dass das Paket technisch und operativ modernisiert wurde (Security, Dependencies, Tooling, Tests), nicht nur kosmetisch.

**Identität**
- Name: request
- Version: 3.0.0
- engines.node: >= 18.0.0

**Security-Härtung (Redirects)**
- Hard Limit: explizites `E_TOO_MANY_REDIRECTS` mit Metadaten (`termination`, `maxRedirects`, `redirectsFollowed`).
- 307/308: Methode und Body bleiben erhalten.
- Cross-Host: `authorization`, `proxy-authorization`, `cookie` werden aktiv entfernt; `originalCookieHeader` wird zurückgesetzt.

Referenzen:
`lib/redirect.js`
`request.js`

**Dependencies (Prod)**
- tough-cookie ^4.1.3
- qs ^6.11.0
- form-data ^4.0.0
- mime-types ^2.1.35

Referenz:
`package.json`

**Dev-Tooling (2026-Ready)**
- Dev-Stack reduziert auf ESLint 9 + Tape.
- Flat Config via `eslint.config.cjs`.

Referenzen:
`package.json`
`eslint.config.cjs`

**Validierung (letzter Stand)**
Kommandos:

```powershell
npm audit
npm run lint
npm run test-ci
npm audit --json | node scripts/parse-audit.js
```

Beobachtetes Ergebnis:
- `npm audit`: 0 Vulnerabilities
- `npm run lint`: keine Findings
- `npm run test-ci`: 1485 Tests grün
- `scripts/parse-audit.js`: alle Vulnerability-Counts = 0

Referenz:
`scripts/parse-audit.js`
