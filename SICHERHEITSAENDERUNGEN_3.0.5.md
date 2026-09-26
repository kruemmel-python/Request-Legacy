# Request-Legacy 3.0.5 – technische Dokumentation der Sicherheitsänderungen

Stand: 26. September 2026

## 1. Ziel

`request-legacy` 3.0.5 ist ein Sicherheits- und Wartungsrelease des bestehenden Request-Kompatibilitätszweigs. Ziel war es, die öffentliche Request-API möglichst unverändert zu erhalten, bekannte oder veraltete Fremdkomponenten aus der Laufzeit- und Entwicklungskette zu entfernen, sicherheitsrelevantes Verhalten zu härten und eine reproduzierbare Release-Prüfung herzustellen.

Der aktuelle Repository-Stand ist nicht als dauerhaft „sicher“ zu verstehen. Die Bewertung „0 bekannte Schwachstellen“ beschreibt ausschließlich den geprüften Zeitpunkt. Abhängigkeiten, Node.js, npm und veröffentlichte Security-Advisories entwickeln sich weiter und müssen regelmäßig erneut geprüft werden.

## 2. Ausgangslage

Bei der erneuten Prüfung im September 2026 zeigten sich neue Warnungen und Advisories, obwohl der vorherige Veröffentlichungsstand zum damaligen Prüfzeitpunkt ohne bekannte npm-Schwachstellen war. Unter anderem betroffen waren aktuelle Versionen beziehungsweise Abhängigkeitsketten von `form-data`, `qs`, `har-validator`, `tunnel-agent`, Tape, `glob@7` und `inflight`.

Zusätzlich ergab die Prüfung des optionalen `request_testserver`, dass dessen eigene Entwicklungs- und Laufzeitabhängigkeiten sowie der Weg von HTTP-Eingaben bis zum Testprozess separat gehärtet werden mussten.

## 3. Entfernte Laufzeit- und Entwicklungsabhängigkeiten

Folgende Fremdpakete wurden vollständig aus den betroffenen Pfaden entfernt:

| Paket | Frühere Aufgabe | Ersatz |
|---|---|---|
| `har-validator` | HAR-Strukturprüfung | lokale, begrenzte Validierung |
| `tunnel-agent` | HTTP-CONNECT-Tunnel | lokale Implementierung in `lib/tunnel-agent.js` |
| `safe-buffer` | transitive Tunnel-Abhängigkeit | `node:buffer` |
| `tape` | Testregistrierung und Assertions | lokaler serieller Kompatibilitäts-Runner |
| `glob@7` | transitive Tape-Abhängigkeit | nicht mehr erforderlich |
| `inflight` | transitive `glob@7`-Abhängigkeit | nicht mehr erforderlich |
| mehrere Node-Kompatibilitätshilfen | historischer Node-Support | Node-18+-Kernfunktionen bzw. lokale Implementierungen |

Der produktive Abhängigkeitsbaum wurde dadurch verkleinert und die Angriffs- sowie Lieferkettenoberfläche reduziert.

## 4. Aktuelle direkte Produktionsabhängigkeiten

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

Die direkten Abhängigkeiten sind exakt versioniert. `package-lock.json` bildet den geprüften Baum ab.

## 5. Eigener HTTP-CONNECT-Agent

`tunnel-agent@0.6.0` und dessen transitive `safe-buffer`-Abhängigkeit wurden entfernt. `lib/tunnel-agent.js` verwendet ausschließlich Node-Kernmodule und unterstützt weiterhin:

- HTTP über HTTP-Proxy,
- HTTPS über HTTP-Proxy,
- HTTP über HTTPS-Proxy,
- HTTPS über HTTPS-Proxy.

Wesentliche Sicherheitsregeln:

- CONNECT wird nur bei Status `200` akzeptiert.
- Proxy-Zugangsdaten bleiben Proxy-spezifisch.
- `Proxy-Authorization` wird nicht an den Zielserver weitergegeben.
- Unerwartete Daten nach der CONNECT-Antwort führen zu einem kontrollierten Fehler.
- fehlerhafte und nicht mehr benötigte Sockets werden zerstört.
- der Agent besitzt einen definierten Cleanup-/Destroy-Pfad.

## 6. Redirect- und Credential-Härtung

Redirects werden nicht nur nach Hostnamen, sondern nach vollständiger Origin-Grenze behandelt: Schema, Host und Port.

Bei einem Origin-Wechsel werden sensible Header entfernt, darunter insbesondere:

- `Authorization`,
- `Proxy-Authorization`,
- `Cookie`.

Weitere Regeln:

- HTTPS→HTTP-Redirects senden keinen Referer.
- URL-Credentials und Fragmente werden nicht in Referer übernommen.
- `removeRefererHeader: true` entfernt auch initial gesetzte Referer bei Redirects.
- `maxRedirects` muss eine endliche Ganzzahl im erlaubten Bereich sein; `NaN`, `Infinity`, negative oder überhöhte Werte werden abgewiesen.

## 7. Schutz vor Speicher- und Dekompressions-DoS

Callback-basierte Antworten besitzen ein konfigurierbares `maxResponseSize`-Limit. Der Standardwert beträgt 64 MiB.

Das Limit wird auf die tatsächlich empfangenen beziehungsweise dekomprimierten Daten angewandt. Dadurch schützt es auch vor kleinen komprimierten Antworten, die nach dem Entpacken extrem groß werden.

Eine Überschreitung erzeugt einen kontrollierten Fehler mit `E_RESPONSE_TOO_LARGE`. Eine unbegrenzte Pufferung muss ausdrücklich mit `maxResponseSize: 0` gewählt werden.

## 8. Prototype-Pollution- und Objektgrenzen

Historische Merge- und Objektpfade wurden gehärtet. Kritische Schlüssel wie

```text
__proto__
prototype
constructor
```

werden in der internen Merge-Logik verworfen. Query-, HAR- und ähnliche Objektpfade übernehmen nur eigene Properties und verwenden an sicherheitsrelevanten Stellen Null-Prototyp-Objekte.

Die Regressionstests prüfen unter anderem geerbte Query-Eigenschaften und attacker-controlled `constructor.isBuffer`-Strukturen.

## 9. HAR-Validierung

Die nicht mehr gepflegte Fremdabhängigkeit `har-validator` wurde entfernt. Stattdessen verwendet `request-legacy` eine lokale, auf den tatsächlich benötigten Request-HAR-Pfad begrenzte Strukturvalidierung.

Malformed HAR-Strukturen werden kontrolliert abgewiesen. Multipart-Pfade behandeln fehlende oder ungewöhnliche Parameterstrukturen defensiv.

## 10. Lokaler Test-Runner statt Tape

Tape und damit die alte `glob@7`/`inflight`-Kette wurden entfernt. Die historische Suite benötigt dynamische Testregistrierung, die mit `node:test` nicht dieselbe Semantik besitzt. Deshalb wurde ein kleiner serieller Kompatibilitäts-Runner in `tests/helpers/tape.js` implementiert.

Der Runner implementiert nur die tatsächlich benötigte Teilmenge der Tape-API und führt Tests in Registrierungsreihenfolge aus. Er besitzt Timeout-, Fehler- und Cleanup-Behandlung und setzt bei Fehlern einen Exit-Code ungleich null.

Die Testauswahl wird zentral durch `scripts/resolve-test-files.js` begrenzt. Erlaubt sind ausschließlich reale, unmittelbare Dateien aus dem kanonischen Verzeichnis `tests`, deren Name `test-*.js` entspricht. Pfadwechsel, absolute Fremdpfade, Unterverzeichnisse und Symlink-Fluchten werden abgewiesen.

## 11. Lint- und Warnungspolitik

Warnungsunterdrückung wurde entfernt. Insbesondere werden weder globale Node-Warnungen versteckt noch OpenSSL-Sicherheitslevel für die Tests pauschal abgesenkt.

ESLint läuft mit `--max-warnings=0`. Historische Test-Callbacks dürfen unbenutzte Funktionsargumente behalten; unbenutzte Variablen und Produktionsfehler bleiben Fehler.

## 12. Reproduzierbare Release-Prüfung

Die zentrale Prüfung lautet:

```powershell
.\VERIFY_RELEASE.ps1
```

Der Ablauf umfasst:

1. reproduzierbare Installation aus `package-lock.json`,
2. Prüfung des Abhängigkeitsbaums,
3. Linting,
4. vollständige Node-Test-Suite,
5. interne Security-Checks,
6. `npm audit --omit=dev --audit-level=moderate`,
7. `npm pack --dry-run`.

Der finale Windows-Lauf wurde mit Node.js `v22.13.0` und npm `11.13.0` ausgeführt und ergab:

```text
518 Tests
518 bestanden
0 fehlgeschlagen
0 bekannte npm-Schwachstellen
Lint bestanden
interner Security-Check bestanden
Pack-Trockenlauf bestanden
```

Abschlussmeldung:

```text
VERIFIED: lint/tests/security-check/audit/pack all passed
```

Zu den 518 Tests gehört die Regression:

```text
security: test runner confines input to tests/test-*.js
```

## 13. GitHub-Sicherheitsautomatisierung

Das Repository enthält GitHub Actions und Dependabot. Die CI prüft unterstützte Node-Versionen, Test-Suite, Audit und Paketierung. Dependency-Änderungen sollen damit früh sichtbar werden, statt erst beim nächsten manuellen Wartungslauf aufzufallen.

Plattformspezifische Unix-Socket- und Tunnel-TLS-Fälle werden auf Windows übersprungen und müssen zusätzlich unter Linux/macOS beziehungsweise in CI abgedeckt bleiben.

## 14. Bereinigung des Testservers

`request_testserver` besitzt einen eigenen Abhängigkeitsbaum. Dieser wurde separat aktualisiert und auditiert. Der Testserver bindet `request-legacy` über `file:..` ein und prüft damit den übergeordneten Repository-Stand.

Verifiziert wurden unter anderem:

```text
npm audit:             0 bekannte Schwachstellen
Vite-Build:            erfolgreich, 27 Module
Runtime-Start:         http://127.0.0.1:3001
Live-TAP:              erfolgreich
Report-/Exportpfad:    erfolgreich
```

Der Testserver gehört nicht zur `files`-Liste des npm-Laufzeitpakets und vergrößert daher nicht dessen Runtime-Lieferumfang.

## 15. Härtung des Testserver-Prozesspfads

Der Testserver startet Tests nicht mehr über eine Shell. Stattdessen werden `process.execPath`, der Runner-Pfad, eine getrennte Argumentliste und `shell: false` verwendet.

Damit existiert kein HTTP→Shell-Befehlspfad mehr.

Die Testauswahl verwendet dieselbe zentrale `tests/test-*.js`-Grenze wie der Kommandozeilen-Runner. Ungültige Testpfade werden vor dem Prozessstart verworfen.

## 16. Netzwerk- und Browsergrenzen des Testservers

Standardmäßig bindet der Testserver nur an:

```text
127.0.0.1
```

Eine absichtliche Nicht-Loopback-Bindung verlangt `TESTSERVER_API_TOKEN`; ohne Token verweigert der Server den Start.

Offenes CORS wurde entfernt. Fremde Origins, unzulässige Host-Header und `Sec-Fetch-Site: cross-site` werden im lokalen Betrieb abgewiesen. JSON-Request-Bodies sind auf 16 KiB begrenzt.

`/api/meta` und Reportdaten geben keine absoluten lokalen Arbeitsverzeichnispfade mehr aus.

## 17. Finaler Token-Transport des Testservers

Der API-Token wird **nicht** mehr aus Query-Parametern gelesen. `?token=...` ist ausdrücklich kein gültiger Authentifizierungsweg.

Akzeptiert werden ausschließlich:

```text
X-API-Token: <token>
```

oder:

```text
Authorization: Bearer <token>
```

Die Browseroberfläche hält den Token ausschließlich im Arbeitsspeicher der aktuellen Seite. Es gibt keine Ablage in URL, `localStorage` oder `sessionStorage`; ein Reload verwirft den Token.

Die Live-TAP-Ausgabe verwendet keinen nativen `EventSource`-Authentifizierungsworkaround mehr. Stattdessen wird der SSE-Datenstrom über `fetch()` mit Authentifizierungsheader gelesen und im Browser verarbeitet.

HTML-, ZIP-, PDF- und CSV-Reports werden im Token-Modus ebenfalls authentifiziert per `fetch()` geladen und anschließend über temporäre `blob:`-URLs geöffnet beziehungsweise gespeichert. Dadurch erscheint der Token nicht in Report-URLs.

Der dedizierte Test lautet:

```powershell
cd .\request_testserver
npm run test:security
```

Verifiziertes Ergebnis:

```text
Testserver security regressions PASSED
- query-string API tokens: rejected
- X-API-Token: accepted
- Authorization Bearer: accepted
- native EventSource token workaround: absent
- browser token persistence: absent
```

Zusätzlich wurden unter anderem folgende Fälle geprüft:

```text
lokale Metadatenanfrage:      HTTP 200
fremder Origin:               HTTP 403
fremder Host:                 HTTP 403
Cross-Site-Browseranfrage:    HTTP 403
unerlaubter Testpfad:         HTTP 400
Nicht-Loopback ohne Token:    Start verweigert
Netzwerkzugriff ohne Token:   HTTP 401
X-API-Token:                  HTTP 200
Bearer-Token:                 HTTP 200
Query-String-Token:           HTTP 401
Pfadwechsel trotz Token:      HTTP 400
```

## 18. Finaler Repository-Stand

Die abschließende Härtung des Testserver-Token-Transports wurde auf `main` mit folgendem Commit dokumentiert:

```text
3be46d079d7d1371577f5d881eac384a13fedcb7
Harden test server token transport
```

Der final verifizierte Stand umfasst damit sowohl die gehärtete Request-Library als auch die abgesicherte Repository-interne Testoberfläche.

## 19. Bewusste Grenzen

- `0 vulnerabilities` bedeutet nur: zum Prüfzeitpunkt keine bekannten npm-Audit-Funde im geprüften Baum.
- Eigener netzwerknaher Code wie der CONNECT-Agent muss bei zukünftigen Node-Versionen weiter getestet werden.
- Ein lokaler Testserver ist kein Ersatz für TLS und Netzwerkhärtung bei bewusstem LAN-/Remote-Betrieb.
- Historisches Karma-/PhantomJS-Browser-Bundling ist kein unterstützter Releasepfad dieses Node.js-Forks.
- Plattformabhängige Tests müssen weiterhin auf den jeweils passenden Betriebssystemen ausgeführt werden.

## 20. Wartungsprinzip

`request-legacy` soll regelmäßig erneut geprüft werden. Ein früher sauberer Audit ist kein Grund, spätere Prüfungen auszulassen.

Empfohlener Wartungslauf:

1. `npm ci`,
2. `npm audit --omit=dev`,
3. `npm outdated`,
4. `.\VERIFY_RELEASE.ps1`,
5. im `request_testserver`: `npm ci`, `npm run build`, `npm run test:security`,
6. GitHub Dependabot- und Security-Hinweise prüfen,
7. `npm pack --dry-run`,
8. nach einer Veröffentlichung eine frische Consumer-Installation aus der npm-Registry testen.

Die Leitlinie bleibt: Kompatibilität erhalten, unnötige Lieferketten reduzieren, sensible Daten strikt an Vertrauensgrenzen binden und jede Sicherheitsannahme durch reproduzierbare Tests absichern.
