# Enterprise Positionierung — Request-Legacy 3.0.5

**Zielgruppe**
Behorden, Institutionen, Enterprise-Teams mit Legacy-Abhangigkeiten, die Stabilitat und kontrollierte Modernisierung brauchen.

**Executive Summary**
`request-legacy` 3.0.5 ist ein sicherheitsgeharteter, auditierbarer Drop-in-Nachfolger der verbreiteten Legacy-Versionen. Die API bleibt kompatibel, wahrend der Unterbau auf moderne Abhangigkeiten und Node.js >= 18 angehoben wurde. Ergebnis: weniger Security-Risiko, bessere Wartbarkeit, klarer Upgrade-Pfad.

**Problem**
Viele Systeme nutzen weiterhin `request` <= 2.88.x. Diese Versionen sind sicherheitsseitig bekannt verwundbar und werden von Scannern als kritisch bewertet. Das erzeugt Compliance-Risiken, Audit Findings und unnötige Betriebsaufwande.

**Lösung**
`request-legacy` 3.0.5 liefert:
- Drop-in-Kompatibilitat zur etablierten API.
- Security-Hartung in den kritischen Redirect- und Header-Pfaden.
- Modernisierte Kern-Abhangigkeiten.
- Dev-Stack-Entschlackung fur schnellere Security-Clears.
- Klaren Versionssprung fur eindeutige Security-Metadaten.

**Business Value**
- Audit- und Compliance-Bereinigung ohne Re-Write.
- Reduzierte Angriffsflache durch aktualisierte Kern-Dependencies.
- Kosteneinsparung durch minimale Migrationskosten.
- Langfristige Wartbarkeit durch Node.js LTS-Baseline.

**Differenzierung**
- Echte Sicherheitslogik statt kosmetischer Fixes (siehe `SICHERHEITSAENDERUNGEN_3.0.5.md`).
- Eine gepflegte Legacy-API mit klar dokumentierter Node.js-LTS-Baseline.
- Strikte Redirect-Controls und Header-Schutz bei Cross-Host Hop.

**Adoption**
Zielbild: `request` ersetzen ohne Code-Refactor in Applikationen. Wechsel erfolgt uber Version/Package-Update mit bestehender API.

**Evidenz**
Siehe:
`SICHERHEITSAENDERUNGEN_3.0.5.md`
`SECURITY_AUDIT.md`
`CHANGELOG.md`
`package.json`
