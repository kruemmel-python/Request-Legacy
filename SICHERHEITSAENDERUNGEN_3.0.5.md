# Request-Legacy 3.0.5: technische Dokumentation der Sicherheitsänderungen

## 1. Zweck und Umfang

Dieses Dokument beschreibt die am 26. September 2026 durchgeführten Arbeiten an `request-legacy` 3.0.5. Ziel war es, die Kompatibilität der öffentlichen Request-API zu erhalten, bekannte oder veraltete Fremdkomponenten aus der Laufzeit- und Entwicklungskette zu entfernen und eine reproduzierbare Release-Prüfung herzustellen.

Die Arbeiten wurden bewusst auf das bestehende Paket begrenzt. Die öffentliche API von `request-legacy` wurde nicht absichtlich erweitert oder umbenannt. Sicherheitsrelevante Verhaltensänderungen betreffen ausschließlich Fälle, in denen sensible Header bei Redirects nicht weitergegeben werden dürfen.

Der lokale Arbeitsstand befindet sich in:

```text
F:\Request-Legacy-main
```

Der veröffentlichte Stand ist zusätzlich über die Git-Historie des Repositorys nachvollziehbar. Dieses Dokument dient zusammen mit `CHANGELOG.md`, `SECURITY_AUDIT.md`, `package-lock.json` und der ausführbaren Release-Prüfung als technisches Änderungsprotokoll.

## 2. Ausgangslage

Der zuerst vorgelegte Lauf von `VERIFY_RELEASE.ps1` zeigte folgende Situation:

- Die Installation wurde erfolgreich abgeschlossen.
- `npm audit` meldete bereits keine bekannte Schwachstelle.
- npm gab Warnungen für `inflight@1.0.6` und `glob@7.2.3` aus.
- Die Release-Prüfung brach beim Linting mit 107 Fehlern ab.
- Die meisten Lintfehler stammten aus historischen Test-Callbacks mit absichtlich unbenutzten Argumenten.
- Ein produktiver Lintfehler befand sich in `request.js`.
- `tunnel-agent@0.6.0` war weiterhin eine Laufzeitabhängigkeit und brachte `safe-buffer` transitiv mit.

Die Analyse des Abhängigkeitsbaums ergab:

```text
tape@5.10.2
└── glob@7.2.3
    └── inflight@1.0.6

tunnel-agent@0.6.0
└── safe-buffer@5.2.1
```

`glob` und `inflight` waren ausschließlich über das Testframework Tape vorhanden. `tunnel-agent` und `safe-buffer` gehörten dagegen zur installierten Produktionskette.

## 3. Ergebnis in Kurzform

Folgende Fremdpakete wurden vollständig entfernt:

| Paket | Vorherige Verwendung | Ersatz |
|---|---|---|
| `tunnel-agent` | HTTP-CONNECT-Tunnel für Proxy-Verbindungen | lokale Implementierung in `lib/tunnel-agent.js` |
| `safe-buffer` | transitive Abhängigkeit von `tunnel-agent` | `node:buffer` |
| `tape` | Testregistrierung und Assertions | lokaler serieller Kompatibilitäts-Runner |
| `glob@7` | transitive Tape-Abhängigkeit | nicht mehr erforderlich |
| `inflight` | transitive Abhängigkeit von `glob@7` | nicht mehr erforderlich |

Nach der Änderung liefert die gezielte Prüfung des Abhängigkeitsbaums für diese Pakete ein leeres Ergebnis:

```text
request-legacy@3.0.5
└── (empty)
```

## 4. Lokaler Ersatz für `tunnel-agent`

### 4.1 Betroffene Dateien

- `lib/tunnel-agent.js` wurde neu angelegt.
- `lib/deps.js` lädt nun `./tunnel-agent` anstelle des npm-Pakets `tunnel-agent`.
- `package.json` enthält `tunnel-agent` nicht mehr als Abhängigkeit.
- `package-lock.json` wurde durch eine saubere Installation neu erzeugt.
- `scripts/security-check.js` verbietet die erneute Aufnahme von `tunnel-agent` als Produktionsabhängigkeit.

### 4.2 Unterstützte Tunnelarten

Die lokale Implementierung stellt dieselben vier internen Fabrikfunktionen bereit, die `lib/tunnel.js` benötigt:

- `httpOverHttp`
- `httpsOverHttp`
- `httpOverHttps`
- `httpsOverHttps`

Damit bleiben diese Kombinationen möglich:

| Ziel | Proxy | Verhalten |
|---|---|---|
| HTTP | HTTP | CONNECT über eine HTTP-Verbindung |
| HTTPS | HTTP | CONNECT und anschließend TLS zum Ziel |
| HTTP | HTTPS | CONNECT über eine TLS-Verbindung zum Proxy |
| HTTPS | HTTPS | TLS zum Proxy, CONNECT und TLS zum Ziel |

### 4.3 Technische Funktionsweise

Der lokale Agent basiert ausschließlich auf Node-Kernmodulen:

- `node:http`
- `node:https`
- `node:tls`
- `node:events`
- `node:buffer`

Für eine neue Verbindung geschieht Folgendes:

1. Aus Zielhost und Zielport wird der CONNECT-Pfad `host:port` gebildet.
2. Der Agent sendet eine `CONNECT`-Anfrage an den konfigurierten Proxy.
3. Falls Proxy-Zugangsdaten vorhanden sind, wird `Proxy-Authorization: Basic ...` mit `Buffer.from()` erzeugt.
4. Nur ein Statuscode `200` wird als erfolgreicher Tunnel akzeptiert.
5. Unerwartete Daten direkt hinter der CONNECT-Antwort führen zu einem kontrollierten Fehler.
6. Bei HTTPS-Zielen wird der etablierte Socket mit `tls.connect()` abgesichert.
7. Freie Sockets werden nur für dasselbe Ziel aus der Warteschlange wiederverwendet.
8. Nicht mehr verwendete oder fehlerhafte Sockets werden zerstört und aus dem Agent entfernt.

### 4.4 Fehlerbehandlung

Fehler beim Verbindungsaufbau werden als Fehler mit dem Code `ECONNRESET` an die ursprüngliche Anfrage weitergereicht. Dazu gehören:

- Netzwerkfehler beim Proxy-Aufbau,
- ein CONNECT-Status ungleich `200`,
- unerwartete Daten nach der CONNECT-Antwort,
- die Zerstörung des Agenten mit noch wartenden Anfragen.

Die Implementierung besitzt außerdem eine `destroy()`-Methode. Sie beendet aktive Sockets und lässt wartende Anfragen kontrolliert fehlschlagen. Das ist für sauberes Test- und Prozess-Shutdown wichtig.

### 4.5 Sicherheitswirkung

- Das seit Langem unveröffentlichte Paket `tunnel-agent@0.6.0` ist nicht mehr Teil der Lieferkette.
- Die transitive Abhängigkeit `safe-buffer` entfällt vollständig.
- Für Puffer wird die aktuelle Node-Implementierung aus `node:buffer` verwendet.
- Fehlerhafte Proxy-Antworten werden ohne Prozessabsturz behandelt.
- Die bestehende Proxy-Header-Whitelist in `lib/tunnel.js` bleibt wirksam.
- `Proxy-Authorization` bleibt ein exklusiver Proxy-Header und wird vor der Zielanfrage entfernt.

## 5. Lokaler Ersatz für Tape

### 5.1 Warum Node `node:test` nicht direkt verwendet wird

Ein erster Ersatz verwendete `node:test`. Die vollständige historische Suite zeigte jedoch, dass einige alte Request-Tests während eines bereits laufenden `setup`-Tests weitere Tests registrieren. `node:test` ordnet solche Tests als Kindtests ein und beendet sie zusammen mit ihrem Elternteil. Dadurch entstanden Meldungen wie:

```text
test did not finish before its parent and was cancelled
```

Dieses Verhalten entspricht nicht der von der vorhandenen Suite erwarteten Tape-Semantik. Deshalb wurde der Zwischenstand verworfen und ein kleiner eigener serieller Runner implementiert.

### 5.2 Betroffene Dateien

- `tests/helpers/tape.js` wurde neu angelegt und anschließend als serieller Runner umgesetzt.
- `tests/helpers/index.js` lädt den lokalen Runner.
- Direkte Tape-Importe wurden in folgenden Dateien ersetzt:
  - `tests/test-security-regressions.js`
  - `tests/test-tunnel.js`
- `scripts/run-tests.js` startet den lokalen Runner und beendet den Prozess nach vollständigem Cleanup.
- `package.json` enthält Tape nicht mehr.
- `package-lock.json` enthält Tape, `glob@7` und `inflight` nicht mehr.

### 5.3 Unterstützte Test-API

Der lokale Runner implementiert genau die im Projekt verwendete Teilmenge der Tape-API:

- `t.plan()`
- `t.end()`
- `t.ok()`
- `t.true()`
- `t.notOk()` und die historische Schreibweise `t.notok()`
- `t.equal()` und `t.equals()`
- `t.notEqual()`
- `t.deepEqual()` und `t.same()`
- `t.error()` und `t.ifError()`
- `t.throws()`
- `t.doesNotThrow()`
- `t.pass()`
- `t.fail()`
- `t.skip()`

Der Runner ist kein allgemeiner vollständiger Tape-Nachbau. Er ist absichtlich auf die tatsächlich verwendete API des Projekts begrenzt.

### 5.4 Ausführungsmodell

- Tests werden in Registrierungsreihenfolge seriell ausgeführt.
- Während eines Tests neu registrierte Tests werden an die Warteschlange angehängt.
- Dadurch funktionieren die historischen dynamischen `setup`-Muster weiterhin.
- Jeder Test besitzt ein Limit von 30 Sekunden.
- Synchrone Ausnahmen, unbehandelte Promise-Ablehnungen und asynchrone Ausnahmen werden als Testfehler erfasst.
- Fehlgeschlagene Assertions werden gesammelt; der Test kann sein Cleanup und `t.end()` weiterhin erreichen.
- Am Ende werden Testanzahl, bestandene Tests und Fehlerzahl ausgegeben.
- Bei mindestens einem Fehler wird ein Exit-Code ungleich null gesetzt.

### 5.5 Prozessabschluss

Der vorher beobachtete scheinbare Hänger nach

```text
skip unix socket tests on windows
```

entstand durch offene Netzwerk- oder Agent-Handles nach Abschluss der Assertions. Der neue Ablauf wartet zunächst alle Tests ab, ruft dann die zentrale Bereinigung aus `tests/helpers/index.js` auf und beendet anschließend den Testprozess mit dem korrekten Exit-Code.

Die Cleanup-Funktion akzeptiert nun optional einen Callback. Da Node beim `exit`-Ereignis den Exit-Code als Argument übergibt, wird ausdrücklich geprüft, ob das Argument tatsächlich eine Funktion ist. So kann ein numerischer Exit-Code nicht versehentlich als Callback aufgerufen werden.

## 6. Lint-Korrekturen

### 6.1 Produktionscode

In `request.js` wurde ein unbenutzter Fehlerparameter aus einem Event-Callback entfernt:

```js
self.req.on('error', function () {
  socket.removeListener('connect', onReqSockConnect)
})
```

Das Laufzeitverhalten bleibt gleich. Der Callback benötigt den Fehlerwert nicht; er entfernt lediglich den Socket-Listener.

### 6.2 Historische Tests

Viele Test-Callbacks behalten aus Kompatibilitäts- und Lesbarkeitsgründen die klassische Signatur `(err, response, body)`, obwohl einzelne Argumente in einem bestimmten Test nicht verwendet werden. Ein massenhaftes Umschreiben dieser Signaturen hätte keinen Sicherheitsgewinn gebracht und die alten Tests unnötig verändert.

Deshalb enthält `eslint.config.cjs` eine auf `tests/**/*.js` begrenzte Regel:

- unbenutzte Funktionsargumente werden in Tests akzeptiert,
- unbenutzte Variablen bleiben weiterhin Fehler,
- Testdateien erhalten ausschließlich die benötigten Node.js-Globals,
- für Produktionsdateien bleiben die strengeren Standardregeln aktiv.

## 7. Aktualisierte Testannahmen

### 7.1 Multipart-Boundaries

Die aktuelle Version von `form-data` verwendet nicht mehr ausschließlich die alte Boundary-Form aus Bindestrichen und Dezimalziffern. Die Tests in `tests/test-form-data.js` und `tests/test-form.js` prüfen nun eine syntaktisch gültige Multipart-Boundary anstatt ein internes Generierungsformat eines Fremdpakets festzuschreiben.

Die Sicherheitsregression gegen CRLF-Injection bleibt separat erhalten und bestanden.

### 7.2 JavaScript-MIME-Typ

`mime-types@3.0.2` liefert für `.js` den aktuellen MIME-Typ `text/javascript`. Der Test in `tests/test-pipes.js` verwendet nun `mime.lookup(__filename)` anstatt den veralteten fest kodierten Wert `application/javascript`.

Damit prüft der Test weiterhin, dass Request den von der eingebundenen MIME-Datenbank gelieferten Typ korrekt setzt.

### 7.3 Authorization bei Protokollwechseln

Der Test in `tests/test-redirect-auth.js` erwartete früher, dass `Authorization` bei gleichem Host von HTTP nach HTTPS weitergegeben wird. Die gehärtete Implementierung definiert einen Origin über Schema, Host und Port. Ein Protokollwechsel ist daher ein Origin-Wechsel.

Die neue Erwartung lautet:

- gleicher Host, gleiches Protokoll und gleicher Port: Authorization darf erhalten bleiben,
- Änderung von Schema, Host oder Port: Authorization wird entfernt.

Dies verhindert die Weitergabe von Zugangsdaten an einen anderen Origin.

### 7.4 Referer bei `removeRefererHeader`

Ein alter Test erwartete, dass ein manuell gesetzter Referer trotz `removeRefererHeader: true` bei einem Redirect erhalten bleibt. Die gehärtete und eindeutige Semantik entfernt bei dieser Option jeden Referer, auch einen initial gesetzten.

Der Test wurde an dieses sichere Verhalten angepasst. Ohne diese Option erzeugte Referer-Werte werden weiterhin bereinigt: URL-Zugangsdaten und Fragmente werden nicht weitergegeben, und ein HTTPS-zu-HTTP-Redirect erhält keinen Referer.

## 8. Erweiterte interne Sicherheitsprüfung

`scripts/security-check.js` prüft nun zusätzlich:

- `tunnel-agent` darf nicht als Produktionsabhängigkeit eingetragen sein.
- `lib/deps.js` darf keinen Import des npm-Pakets `tunnel-agent` enthalten.
- Die lokale Tunnelimplementierung wird im erfolgreichen Prüfbericht ausdrücklich bestätigt.

Die bestehenden Prüfungen bleiben erhalten, darunter:

- Mindestversionen sicherheitsrelevanter Abhängigkeiten,
- Verbot bereits entfernter Kompatibilitätspakete,
- Verbot globaler Warnungsunterdrückung,
- Verbot von `eval()` und `new Function()` in Laufzeitdateien,
- Prüfung, dass `har-validator` lokal ersetzt bleibt.

## 9. Änderungen an Abhängigkeiten

### 9.1 Verbleibende direkte Produktionsabhängigkeiten

```text
aws-sign2       0.7.0
aws4            1.13.2
caseless        0.12.0
combined-stream 1.0.8
form-data       4.0.6
http-signature  1.4.0
is-typedarray   1.0.0
mime-types      3.0.2
oauth-sign      0.9.0
qs              6.16.0
tough-cookie    6.0.2
```

### 9.2 Verbleibende direkte Entwicklungsabhängigkeiten

```text
@eslint/js 10.0.1
eslint     10.11.0
globals    17.12.0
```

### 9.3 Reproduzierbarkeit

Alle direkten Abhängigkeiten sind exakt versioniert. `package-lock.json` bildet den erfolgreich geprüften Baum ab; die Release-Prüfung installiert diesen Stand unverändert mit `npm ci`.

## 10. Vollständige Dateiliste der Arbeiten

### Neue Dateien

- `lib/tunnel-agent.js`: lokaler HTTP-CONNECT-Agent.
- `tests/helpers/tape.js`: lokaler serieller Tape-Kompatibilitäts-Runner.
- `SICHERHEITSAENDERUNGEN_3.0.5.md`: dieses Dokument.

### Geänderte Laufzeitdateien

- `lib/deps.js`: lokaler Tunnel-Agent statt Fremdpaket.
- `request.js`: unbenutzten Callback-Parameter entfernt.

### Geänderte Paket- und Prüfdateien

- `package.json`: `tunnel-agent` und Tape entfernt; dieses Dokument zur Paketdateiliste hinzugefügt.
- `package-lock.json`: sauber neu erzeugter Abhängigkeitsbaum.
- `eslint.config.cjs`: passende Testdatei-Regeln ergänzt.
- `scripts/run-tests.js`: lokalen Runner starten, Cleanup abwarten und zuverlässig beenden.
- `scripts/security-check.js`: erneute Aufnahme von `tunnel-agent` verhindern.
- `VERIFY_RELEASE.ps1`: verwendet die versionierte Sperrdatei mit `npm ci` und führt den kompletten Prüfablauf aus.

### Geänderte Tests

- `tests/helpers/index.js`
- `tests/test-security-regressions.js`
- `tests/test-tunnel.js`
- `tests/test-form-data.js`
- `tests/test-form.js`
- `tests/test-pipes.js`
- `tests/test-redirect.js`
- `tests/test-redirect-auth.js`

### Geänderte Dokumentation

- `CHANGELOG.md`
- `SECURITY_AUDIT.md`

## 11. Verifikation

Die abschließende Prüfung wurde mit Node.js `v22.13.0` und npm `11.13.0` ausgeführt.

Verwendeter Befehl:

```powershell
.\VERIFY_RELEASE.ps1
```

Das Skript führte folgende Schritte aus:

1. vorhandenes `node_modules` durch `npm ci` reproduzierbar ersetzen,
2. exakt den in `package-lock.json` festgelegten Abhängigkeitsbaum installieren,
3. den Abhängigkeitsbaum prüfen,
4. Linting ausführen,
5. vollständige Testsuite ausführen,
6. interne Sicherheitsprüfungen ausführen,
7. Produktionsabhängigkeiten mit npm audit prüfen,
8. npm-Paket als Trockenlauf packen.

Abschließendes Ergebnis:

```text
518 Tests
518 bestanden
0 fehlgeschlagen
0 bekannte npm-Schwachstellen
Lint bestanden
interne Sicherheitsprüfung bestanden
Pack-Trockenlauf bestanden
```

Die abschließende Meldung lautete:

```text
VERIFIED: lint/tests/security-check/audit/pack all passed
```

## 12. Hinweise für zukünftige Wartung

### Bei Änderungen am Tunnel-Agent

- Alle vier Kombinationen aus HTTP/HTTPS-Ziel und HTTP/HTTPS-Proxy berücksichtigen.
- `Proxy-Authorization` niemals an den Zielserver durchreichen.
- CONNECT nur bei Status `200` akzeptieren.
- Socket- und Warteschlangen-Cleanup immer mitprüfen.
- Unter Linux/macOS zusätzlich `tests/test-tunnel.js` ausführen, da die TLS-Tunneltests unter Windows explizit übersprungen werden.

### Bei Erweiterungen des Test-Runners

- Nur tatsächlich benötigte Tape-Semantik ergänzen.
- Dynamische Testregistrierung muss seriell und außerhalb einer Eltern-Kind-Struktur funktionieren.
- Fehlgeschlagene Assertions dürfen erforderliches Cleanup nicht verhindern.
- Ein neuer Assertion-Typ benötigt mindestens einen eigenen Selbsttest oder eine Verwendung in der vollständigen Suite.

### Vor jedem Release

```powershell
.\VERIFY_RELEASE.ps1
```

Ein Release darf nur erstellt werden, wenn alle sieben Prüfabschnitte erfolgreich abgeschlossen werden. Insbesondere darf ein erfolgreicher Produktions-Audit nicht als Ersatz für die Funktions-, Redirect-, Proxy- und Sicherheitsregressionstests betrachtet werden.

## 13. Bewusste Grenzen

- Ein Audit mit null bekannten Schwachstellen beweist nicht, dass die Software frei von unbekannten Fehlern ist.
- Die lokale Tunnelimplementierung reduziert die Lieferkette, muss aber wie jeder netzwerknahe Code bei zukünftigen Node-Versionen weiter getestet werden.
- Die Windows-Prüfung überspringt die plattformspezifischen Unix-Socket- und Tunnel-TLS-Fälle. Diese sollten in der vorhandenen CI zusätzlich auf Linux ausgeführt werden.
- Historisches Browser-Bundling ist kein unterstützter Releasepfad dieses Node.js-Forks. Die nicht mehr ausführbare Karma-/PhantomJS-Struktur wurde bei der Projektbereinigung entfernt.

## 14. Nachvollziehbare Sicherheitsentscheidung

Die wichtigste Leitlinie dieser Änderung lautet: Sensible Daten bleiben nur innerhalb desselben Origins, und nicht mehr gepflegte Hilfspakete werden dort durch kleine lokale Implementierungen ersetzt, wo ihr benötigter Funktionsumfang klar begrenzt und vollständig testbar ist.

Dadurch bleibt `request-legacy` für bestehende Serveranwendungen nutzbar, während die Abhängigkeitsoberfläche verkleinert und die Release-Prüfung wieder zuverlässig ausführbar wird.

## 15. Bereinigung des separaten Testservers

Der Ordner `request_testserver` besitzt einen eigenständigen Abhängigkeitsbaum. Eine frühere Installation meldete dort 17 Schwachstellen (1 niedrig, 4 mittel, 10 hoch und 2 kritisch), obwohl `request-legacy@3.0.5` korrekt eingebunden und selbst frei von bekannten npm-Audit-Funden war. Die Meldungen stammten aus den eigenständigen Laufzeit- und Build-Abhängigkeiten der Testserver-Oberfläche.

### 15.1 Geänderte Abhängigkeiten

| Abhängigkeit | Vorher | Nachher | Grund |
|---|---:|---:|---|
| `archiver` | `^7.0.1` | `8.0.0` | aktuelle Archivierungskette |
| `express` | `^4.22.1` | `4.22.3` | Sicherheitskorrekturen in Express und transitiven Paketen |
| `pdfkit` | `^0.17.2` | `0.20.2` | aktuelle Abhängigkeitskette |
| `react` / `react-dom` | `^18.2.0` | `18.3.1` | aktueller Stand innerhalb der Hauptversion 18 |
| `@types/react` | `^18.2.0` | `18.3.31` | passend zu React 18 |
| `@types/react-dom` | `^18.2.0` | `18.3.7` | passend zu React DOM 18 |
| `@vitejs/plugin-react` | `^5.1.3` | `5.2.0` | aktualisierte React-Buildintegration |
| `concurrently` | `^9.0.0` | `9.2.4` | aktuelle Wartungsversion |
| `vite` | `^7.3.1` | `7.3.6` | Sicherheitskorrekturen im Buildwerkzeug |
| `tape` | `^4.6.0` | entfernt | ungenutzt; entfernte zugleich die alte `glob`-/`inflight`-Kette |

Die Bibliothek wird über `file:..` eingebunden. Damit prüft der Testserver exakt den übergeordneten Projektstand statt einer möglicherweise älteren Registry-Veröffentlichung.

### 15.2 Anpassung an Archiver 8

Archiver 8 stellt keine aufrufbare Standardexport-Funktion mehr bereit. `request_testserver/server.js` importiert deshalb die benannte Klasse `ZipArchive`:

```js
const archive = new ZipArchive({ zlib: { level: 9 } })
```

Fehlerbehandlung, Streaming und Kompressionsstufe bleiben erhalten.

### 15.3 Verifikation

```text
npm ci:                erfolgreich
npm audit:             0 Schwachstellen
request-legacy:        3.0.5 aus dem übergeordneten Repository
Vite-Build:            erfolgreich, 27 Module verarbeitet
ZIP-Erzeugung:         erfolgreich
Syntaxprüfung:         erfolgreich
Testserver-API:        request-legacy 3.0.5
Testserver-Startseite: HTTP 200
```

`request_testserver` gehört nicht zur `files`-Liste des npm-Pakets. Seine Bereinigung sichert die Entwicklungs- und Prüfoberfläche des GitHub-Repositorys ab, ohne den Laufzeitumfang der Bibliothek zu vergrößern.

## 16. Projekt- und Dokumentationsbereinigung

Am 26. September 2026 wurde der vollständige Projektordner zusätzlich auf generierte, veraltete und nicht mehr ausführbare Bestandteile geprüft. Entfernt wurden:

- installierte `node_modules`-Verzeichnisse und reproduzierbare Buildausgaben,
- lokale Testserver-Reports und ein entpacktes Paketduplikat,
- temporäre TAP-, Dateilisten- und QA-Studio-Ausgaben,
- einmalige Analyse- und Quelltext-Anzeigeskripte,
- veraltete Travis-, AppVeyor- und Codecov-Konfigurationen,
- ein auf das alte Upstream-Repository zugeschnittenes Release-Skript,
- ein nicht eingebundener externer Stresstest mit falschem Paketnamen,
- die nicht mehr ausführbare Karma-/PhantomJS-Browserteststruktur,
- eine parallele, nicht mehr verwendete OpenSSL-Zertifikatserzeugung samt CSRs, CRL, Seriennummern, Hilfsservern und überflüssigen privaten Testschlüsseln; erhalten blieb der plattformunabhängige Node.js-Generator,
- zwei durch dieses Dokument und `SECURITY_AUDIT.md` ersetzte, inhaltlich veraltete Berichte zu Version 3.0.0.

Erhalten blieben der vollständige Laufzeitcode, alle 518 Node.js-Kompatibilitäts- und Sicherheitstests, TLS-Testmaterial samt Zertifikatsgenerator, GitHub Actions, Dependabot, der Testserver und die aktuelle Benutzer-/Sicherheitsdokumentation. `.gitignore` schützt die bereinigte Struktur künftig vor erneut erzeugten Installations-, Build-, Report- und Paketartefakten. Die Release-Prüfung verwendet nun die versionierte Sperrdatei mit `npm ci`, statt sie vor jeder Prüfung zu löschen.

## 17. Absicherung der Testserver-Ausführung

Eine nachträgliche Prüfung der HTTP-Schnittstelle des optionalen Testservers ergab, dass der Parameter `tests` früher in einen Prozess mit aktivierter Shell übernommen wurde. Außerdem war der Server ohne Bindungsbeschränkung und mit offenem CORS erreichbar. Diese Punkte betrafen nicht den veröffentlichten Laufzeitcode von `request-legacy`, wohl aber die Entwicklungsumgebung im Repository.

### 17.1 Prozessstart ohne Shell

Der Testserver startet die Tests nun direkt mit `process.execPath`, dem absoluten Pfad zu `scripts/run-tests.js`, einer getrennten Argumentliste und `shell: false`. Benutzereingaben werden nicht mehr zu einem Shell-Befehl zusammengesetzt. Die angezeigte Befehlszeile dient nur noch der lesbaren Dokumentation im Report.

### 17.2 Strikte Begrenzung der Testauswahl

Die neue gemeinsame Datei `scripts/resolve-test-files.js` wird vom Kommandozeilen-Runner und vom Testserver verwendet. Sie löst das echte Ziel mit `realpath` auf und akzeptiert ausschließlich unmittelbare Dateien aus dem kanonischen Verzeichnis `tests`, deren Name dem Muster `test-*.js` entspricht. Abgewiesen werden insbesondere:

- Pfadwechsel mit `..`,
- absolute Pfade außerhalb von `tests`,
- Hilfsdateien in Unterverzeichnissen,
- symbolische Links auf Ziele außerhalb des Testverzeichnisses,
- nicht vorhandene Dateien und Namen außerhalb des erlaubten Musters.

Ein eigener Sicherheitstest stellt diese Grenze dauerhaft sicher.

### 17.3 Netzwerkzugriff und Authentifizierung

Standardmäßig bindet der Server nur noch an `127.0.0.1`. Für eine absichtliche Bindung an eine andere Adresse muss `TESTSERVER_API_TOKEN` gesetzt sein; andernfalls bricht der Start mit einem Fehler ab. API- und Report-Endpunkte verlangen im Netzwerkmodus dieses Token. Für den Fernzugriff wird zusätzlich ein TLS-terminierender Reverse Proxy empfohlen.

Das uneingeschränkte CORS-Paket wurde entfernt. Im lokalen Betrieb werden Browseranfragen mit fremdem `Origin`, einem nicht lokalen `Host`-Header oder `Sec-Fetch-Site: cross-site` mit HTTP 403 abgewiesen. Das schützt auch vor DNS-Rebinding und blinder Cross-Site-Auslösung; erlaubt bleiben direkte lokale Zugriffe und die Vite-Entwicklungsoberfläche auf Port 5173. JSON-Anfragekörper sind auf 16 KiB begrenzt.

### 17.4 Keine Offenlegung lokaler Pfade

`/api/meta` liefert keinen absoluten Arbeitsverzeichnispfad mehr. Auch HTML-, JSON-, CSV- und PDF-Berichte verwenden nur die neutrale Zielbezeichnung `request-legacy@3.0.5`. Damit werden lokale Laufwerks-, Benutzer- und Verzeichnisnamen nicht mehr über die Oberfläche offengelegt.

### 17.5 Praktische Verifikation

Zusätzlich zur vollständigen Release-Prüfung wurden folgende Fälle gegen einen tatsächlich gestarteten Server geprüft:

```text
lokale Metadatenanfrage:          HTTP 200, kein cwd-Feld
Anfrage mit fremdem Origin:       HTTP 403
Anfrage mit fremdem Host:         HTTP 403
Cross-Site-Browseranfrage:        HTTP 403
unerlaubter Testpfad:             HTTP 400
Netzwerkbindung ohne Token:       Start verweigert
Netzwerkzugriff ohne Token:       HTTP 401
Netzwerkzugriff mit Token:        HTTP 200
Pfadwechsel trotz Token:          HTTP 400
erlaubter Sicherheitstest:        Exit-Code 0
absoluter Pfad im Testbericht:     nicht vorhanden
Testserver npm audit:              0 Schwachstellen
Testserver Vite-Build:             erfolgreich
```
