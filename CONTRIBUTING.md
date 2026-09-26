# Contributing to Request-Legacy

Danke für Beiträge zu `request-legacy`. Das Projekt erhält die verbreitete Request-API für bestehende Node.js-Anwendungen und behandelt Sicherheits- und Kompatibilitätsänderungen bewusst konservativ.

## Fehler melden

Ein hilfreicher Fehlerbericht enthält:

- die verwendete Version von `request-legacy`, Node.js, npm und Betriebssystem,
- ein möglichst kleines, eigenständig ausführbares Beispiel,
- erwartetes und tatsächliches Verhalten,
- relevante Proxy-, TLS- oder Redirect-Konfiguration ohne Geheimnisse,
- bei Sicherheitsproblemen ausschließlich eine private Meldung gemäß `SECURITY.md`.

## Änderungen einreichen

1. Erstelle einen eigenen Branch vom aktuellen `main`.
2. Ergänze oder aktualisiere Tests für jede Verhaltensänderung.
3. Führe lokal `npm test` aus.
4. Führe bei sicherheitsrelevanten Änderungen zusätzlich `npm run audit:prod` aus.
5. Aktualisiere `CHANGELOG.md` und die betroffene Dokumentation.
6. Reiche die Änderung als Pull Request ein und warte auf die GitHub-Actions-Prüfung.

Die vollständige Release-Prüfung unter Windows kann mit folgendem Befehl ausgeführt werden:

```powershell
.\VERIFY_RELEASE.ps1
```

Einzelne Testdateien lassen sich über den lokalen seriellen Test-Runner starten:

```powershell
npm run test-ci -- tests/test-redirect.js
```

## Regeln

- Die öffentliche Request-API bleibt kompatibel, sofern keine ausdrücklich dokumentierte Sicherheitskorrektur eine Änderung erfordert.
- Neue Laufzeitabhängigkeiten benötigen eine nachvollziehbare Begründung und eine Sicherheitsprüfung.
- Sensible Header dürfen bei Origin-Wechseln nicht weitergegeben werden.
- Tests dürfen Warnungen und Fehler nicht global unterdrücken.
- Keine erzwungenen Änderungen der veröffentlichten Git-Historie.
- Releases werden vom Projektmaintainer erstellt.
