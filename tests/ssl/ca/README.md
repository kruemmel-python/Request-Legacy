# TLS-Testzertifikate erzeugen

Die Zertifikate in diesem Ordner werden ausschließlich von den lokalen TLS- und Tunneltests verwendet. Sie sind keine Produktionszertifikate.

Vom Repository-Stamm aus neu erzeugen:

```powershell
node scripts/generate-test-cert.js
```

Der plattformunabhängige Node.js-Generator erzeugt nur die Dateien, die von der Testsuite tatsächlich gelesen werden. Nach einer Erneuerung muss die vollständige Suite auf Windows und über GitHub Actions zusätzlich auf Linux ausgeführt werden.
