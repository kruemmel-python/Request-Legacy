# Request-Legacy Testserver

Dieser Testserver dient als kontrollierte Test-Umgebung fuer `request-legacy`. Er startet die offizielle Test-Suite, erlaubt eigene Tests (inklusive Firmen-spezifischer Request-Profile) und erzeugt reproduzierbare Reports. Das Ziel ist, Legacy-Requests in Ihrer eigenen Struktur sicher und stabil am Leben zu halten, waehrend Sie Updates oder Anpassungen an `request-legacy` einspielen.

**Kurzfassung**
Der Server fuehrt `npm run test-ci` im installierten `request-legacy`-Paket aus, streamt TAP-Output live, erzeugt HTML/JSON/PDF/CSV/ZIP-Reports und kann regelmaessige Testlaeufe planen.

**Hauptfunktionen**
- Live-Streaming der TAP-Ausgabe (Server-Sent Events) fuer schnelle Rueckmeldung.
- Report-Archiv mit HTML, JSON, PDF, CSV und ZIP Export.
- Zeitgesteuerte Testlaeufe (Scheduler) fuer kontinuierliche Regression-Checks.
- UI zum Starten, Filtern und Beobachten der Tests.
- API-Zugriff fuer CI/CD oder eigene Tools.

**Architektur in einem Satz**
Express-Server + Test-Runner fuer `request-legacy` + Vite/React-UI mit Proxy auf `/api`.

**Voraussetzungen**
- Node.js `>= 18`
- npm

**Schnellstart (Entwicklung)**
```bash
npm install
npm run dev
```
- UI: `http://localhost:5173`
- API/Testserver: `http://localhost:3001`

**Schnellstart (Production/Single-Server)**
```bash
npm install
npm run build
npm run start
```
- UI + API: `http://localhost:3001`

**Wie der Testlauf funktioniert**
Der Server ermittelt den Installationspfad von `request-legacy` und startet dort:
```bash
npm run test-ci
```
Optional koennen einzelne Tests selektiert werden:
```bash
npm run test-ci -- tests/test-params.js tests/test-timeout.js
```
Die UI und das API bieten dafuer ein Filter-Feld bzw. den `tests`-Parameter.

**Eigene Tests schreiben (Unternehmens-Szenarien)**
Die Test-Suite liegt im Paketordner von `request-legacy` unter `tests/`. Dort koennen Sie neue Tests anlegen, die Ihre Legacy-Requests exakt nachbilden (Header, Auth, Proxy, TLS, Body-Formate, Zeitouts, usw.).

Empfohlener, stabiler Weg fuer Unternehmen:
- Verwenden Sie ein eigenes Fork oder eine lokale Kopie von `request-legacy`.
- Binden Sie diese Version in `package.json` ein (z.B. per `file:` oder `npm link`).
- Der Testserver verwendet automatisch diesen Pfad, sobald `request-legacy` so installiert ist.

Minimaler Testaufbau (Tape) als Vorlage:
```js
'use strict'
const helpers = require('./helpers')

const server = helpers.server
const request = helpers.request
const tape = helpers.tape

const s = server.createServer()

function runTest (name, test) {
  tape(name, function (t) {
    s.on('/' + name, test.resp)
    request(s.url + '/' + name, test, function (err, resp, body) {
      t.equal(err, null)
      t.equal(resp.statusCode, 200)
      t.end()
    })
  })
}

tape('setup', function (t) {
  s.listen(0, function () {
    t.end()
  })
})

runTest('company-legacy-get', {
  resp: server.createGetResponse('OK'),
  headers: { 'x-legacy-client': 'true' }
})

tape('cleanup', function (t) {
  s.close(function () {
    t.end()
  })
})
```

Wichtige Regeln:
- Dateinamen im Format `tests/test-*.js`.
- Der Runner laedt nur Tests aus `tests/` oder explizit angegebene Dateien.
- Nutzen Sie `tests/helpers` (Server, Request-Wrapper, Tape) fuer konsistentes Verhalten.

**Tests starten und filtern**
In der UI koennen Sie einzelne Tests auswaehlen:
- Beispiel: `tests/test-params.js, tests/test-timeout.js`

Per API (SSE):
```bash
curl -N "http://localhost:3001/api/test-ci?tests=tests/test-params.js,tests/test-timeout.js"
```

**Reports**
Jeder Testlauf erzeugt einen Report unter `reports/`:
- HTML-Report (vollstaendig)
- JSON-Metadaten
- PDF/CSV/ZIP via API

Standard-Retention:
- Max. 50 Reports
- Max. 30 Tage

**API Uebersicht**
- `GET /api/meta`  -> Paketname, Version, Zielpfad, Limits
- `GET /api/test-ci?tests=...` -> Startet Tests (SSE-Stream)
- `GET /api/report/latest` -> Letzter Report
- `GET /api/report/list?limit=20` -> Liste der Reports
- `GET /api/report/latest/download` -> HTML herunterladen
- `GET /api/report/latest/pdf` -> PDF herunterladen
- `GET /api/report/latest/csv` -> CSV herunterladen
- `GET /api/report/latest/zip` -> ZIP herunterladen
- `GET /api/report/download/:filename` -> HTML per Dateiname
- `GET /api/report/pdf/:filename` -> PDF per Dateiname
- `GET /api/report/csv/:filename` -> CSV per Dateiname
- `GET /api/report/zip/:filename` -> ZIP per Dateiname
- `GET /api/schedule` -> Scheduler-Status
- `POST /api/schedule/start` -> Scheduler starten
- `POST /api/schedule/stop` -> Scheduler stoppen
- `GET /api/zen` -> Beispielrequest via `request-legacy`

**Scheduler (regelmaessige Testlaeufe)**
Start per API:
```bash
curl -X POST http://localhost:3001/api/schedule/start \
  -H "Content-Type: application/json" \
  -d '{"intervalMinutes":60,"tests":"tests/test-params.js"}'
```
Stop:
```bash
curl -X POST http://localhost:3001/api/schedule/stop
```

**Konfiguration (Environment-Variablen)**
- `PORT` (Default: `3001`)
- `REPORT_MAX` (Default: `50`)
- `REPORT_MAX_DAYS` (Default: `30`)
- `SCHEDULE_INTERVAL_MINUTES` (Default: `60`)
- `TEST_FINISH_GRACE_MS` (Default: `1500`)
- `TEST_IDLE_AFTER_SUMMARY_MS` (Default: `3000`)
- `TEST_MAX_RUNTIME_MS` (Default: `1200000` = 20 Minuten)

**Empfohlene Unternehmens-Nutzung**
- Legen Sie Tests an, die Ihre produktiven Request-Strukturen abbilden (Header, Auth, Proxy, Body, Redirects, TLS).
- Versionieren Sie diese Tests im gleichen Repo wie Ihr fork von `request-legacy`.
- Automatisieren Sie Testlaeufe per Scheduler oder CI.
- Nutzen Sie die Reports, um Regressionen in Legacy-Pfaden schnell sichtbar zu machen.

**Sicherheit und Betrieb**
- Der Server hat keine Authentifizierung. Betreiben Sie ihn nur im internen Netz oder hinter einem Reverse-Proxy mit Auth.
- Testcode laeuft lokal im Prozess des Servers. Behandeln Sie den Host als vertrauenswuerdig.

**Troubleshooting**
- "A test run is already in progress": Es laeuft bereits ein Test. Es gibt nur einen Runner zur selben Zeit.
- "Test file not found": Pfad pruefen. Tests muessen unter `tests/` liegen oder als absoluter Pfad angegeben sein.
- Lange Haenger: `TEST_MAX_RUNTIME_MS` begrenzt die Laufzeit und bricht notfalls ab.

**Lizenz**
Siehe Lizenzdateien in `request-legacy` und im Projekt.
