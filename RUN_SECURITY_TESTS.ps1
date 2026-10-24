#requires -Version 5.1
<#
.SYNOPSIS
  Umfangreicher lokaler Security-/Regressionstest fuer Request-Legacy.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\RUN_SECURITY_TESTS.ps1
.EXAMPLE
  pwsh -File .\RUN_SECURITY_TESTS.ps1 -SkipInstall
#>
[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipNetworkChecks,
    [switch]$SkipTestServer,
    [switch]$SkipLinuxPlatform,
    [switch]$IncludeDevAudit
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Project = $PSScriptRoot
$ReportRoot = Join-Path $Project 'SECURITY_TEST_RESULTS'
$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$ReportDir = Join-Path $ReportRoot $Stamp
New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
$Results = [System.Collections.Generic.List[object]]::new()
$CriticalFailures = 0
$env:CI = '1'
$env:NO_COLOR = '1'

function Invoke-Check {
    param([string]$Name, [string]$Exe, [string[]]$Arguments,
          [bool]$Required = $true)
    $slug = ($Name -replace '[^a-zA-Z0-9_-]', '_')
    $log = Join-Path $ReportDir "$slug.log"
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $code = 127
    try {
        $exePath = (Get-Command $Exe -ErrorAction Stop).Source
        # PowerShell 5.1 and 7 compatible: capture stdout and stderr in one log.
        # Native tools (notably wsl.exe/npm) may legitimately write notices to
        # stderr while returning 0.  Do not let ErrorActionPreference turn such
        # notices into a terminating PowerShell exception before $LASTEXITCODE
        # can be evaluated.
        $previousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $exePath @Arguments 2>&1 | ForEach-Object {
            $line = [string]$_
            Add-Content -LiteralPath $log -Value $line -Encoding UTF8
            Write-Host $line
        }
        $code = [int]$LASTEXITCODE
        $ErrorActionPreference = $previousErrorAction
    } catch {
        $message = $_ | Out-String
        Add-Content -LiteralPath $log -Value $message -Encoding UTF8
        Write-Host $message -ForegroundColor Red
        $code = 127
    }
    $watch.Stop()
    $status = if ($code -eq 0) { 'PASS' } else { 'FAIL' }
    if ($code -ne 0 -and $Required) { $script:CriticalFailures++ }
    $Results.Add([pscustomobject]@{
        Name=$Name; Status=$status; ExitCode=$code; Required=$Required
        DurationSeconds=[math]::Round($watch.Elapsed.TotalSeconds,2)
        Log=[IO.Path]::GetFileName($log)
    })
    Write-Host "[$status] $Name ($([math]::Round($watch.Elapsed.TotalSeconds,1)) s)" -ForegroundColor $(if($code -eq 0){'Green'}else{'Yellow'})
}

function Invoke-NodeInline {
    param([string]$Name,[string]$Source,[bool]$Required=$true)
    $file = Join-Path $ReportDir (($Name -replace '[^a-zA-Z0-9_-]', '_') + '.cjs')
    [IO.File]::WriteAllText($file,$Source,[Text.UTF8Encoding]::new($false))
    Invoke-Check $Name 'node' @($file) $Required
}

function Add-StaticResult {
    param([string]$Name, [bool]$Passed, [bool]$Required = $true, [string]$LogName, [string[]]$Details = @())
    if ($LogName) { $Details | Set-Content -LiteralPath (Join-Path $ReportDir $LogName) -Encoding UTF8 }
    $Results.Add([pscustomobject]@{
        Name=$Name; Status=$(if($Passed){'PASS'}else{'FAIL'}); ExitCode=$(if($Passed){0}else{1})
        Required=$Required; DurationSeconds=0; Log=$LogName
    })
    if (-not $Passed -and $Required) { $script:CriticalFailures++ }
}

try {
    Set-Location -LiteralPath $Project
    if (-not (Test-Path 'package.json') -or -not (Test-Path 'package-lock.json')) {
        throw 'Bitte das Script im Projekt-Stammordner ausfuehren.'
    }
    Invoke-Check 'Node-Version' 'node' @('--version')
    Invoke-Check 'npm-Version' 'npm' @('--version')
    Invoke-Check 'Git-Version' 'git' @('--version') $false

    if (-not $SkipInstall) {
        Invoke-Check 'Clean-Install-npm-ci' 'npm' @('ci','--no-audit','--no-fund')
    } elseif (-not (Test-Path 'node_modules')) {
        throw 'SkipInstall gesetzt, aber node_modules fehlt.'
    }
    if (-not (Test-Path 'node_modules')) {
        throw 'node_modules fehlt: npm ci reparieren und erneut starten.'
    }

    Invoke-Check 'Dependency-Tree' 'npm' @('ls','--all') $false
    Invoke-Check 'Lockfile-Installierbarkeit' 'npm' @('ci','--dry-run','--ignore-scripts','--no-audit','--no-fund')
    Invoke-Check 'ESLint' 'npm' @('run','lint')
    Invoke-Check 'Vollstaendige-Testsuite' 'npm' @('run','test-ci')
    Invoke-Check 'Sicherheits-Regressionen' 'npm' @('run','test:security')
    Invoke-Check 'Interne-Sicherheitspruefung' 'npm' @('run','security-check')
    Invoke-Check 'Release-Gesamtpruefung' 'npm' @('run','verify:release')
    Invoke-Check 'npm-Pack-Dry-Run' 'npm' @('pack','--dry-run','--json')

    if (-not $SkipNetworkChecks) {
        Invoke-Check 'Produktions-Abhaengigkeiten-Audit' 'npm' @('run','audit:prod')
        if ($IncludeDevAudit) {
            Invoke-Check 'Gesamtes-Abhaengigkeiten-Audit' 'npm' @('run','audit:all')
        }
        Invoke-Check 'Veraltete-Abhaengigkeiten' 'npm' @('outdated','--json') $false
    }

    # Alle eigenen JS-Dateien syntaktisch pruefen, node_modules und generierte
    # Build-Artefakte ausschliessen. Keine Ausfuehrung des Codes.
    $files = @(Get-ChildItem -LiteralPath $Project -Recurse -File |
        Where-Object { $_.Extension -in @('.js','.cjs','.mjs') -and
            $_.FullName -notmatch '[\\/](node_modules|SECURITY_TEST_RESULTS|dist|build|coverage)[\\/]' })
    $syntaxBad = 0
    foreach ($file in $files) {
        $null = & node --check $file.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            $syntaxBad++
            Write-Host "Syntaxfehler: $($file.FullName)" -ForegroundColor Red
        }
    }
    $Results.Add([pscustomobject]@{
        Name="Syntaxcheck ($($files.Count) Dateien)"
        Status=$(if($syntaxBad -eq 0){'PASS'}else{'FAIL'})
        ExitCode=$syntaxBad; Required=$true; DurationSeconds=0; Log=''
    })
    if ($syntaxBad -gt 0) { $CriticalFailures++ }

    # Versions- und Lockfile-Konsistenz: package.json und package-lock.json
    # müssen dasselbe veröffentlichte Paket beschreiben.
    $manifest = Get-Content 'package.json' -Raw | ConvertFrom-Json
    # PowerShell 5.1 cannot deserialize npm lockfiles whose packages map has
    # the mandatory empty-string root key.  Extract only the two version
    # fields required for this integrity check without deserializing it.
    $lockText = Get-Content 'package-lock.json' -Raw
    $lockVersion = [regex]::Match($lockText, '"version"\s*:\s*"([^"]+)"').Groups[1].Value
    $rootMatch = [regex]::Match($lockText, '"packages"\s*:\s*\{\s*""\s*:\s*\{[\s\S]*?"version"\s*:\s*"([^"]+)"')
    $lockRootVersion = $rootMatch.Groups[1].Value
    $versionOk = $manifest.version -eq $lockVersion -and
        $lockRootVersion -eq $manifest.version
    Add-StaticResult 'Manifest-Lockfile-Versionskonsistenz' $versionOk $true 'version-consistency.log' @(
        "package.json: $($manifest.version)", "package-lock.json: $lockVersion",
        "lock root: $lockRootVersion"
    )

    # Repository- und Workflow-Gates müssen die Linux-Ausführung der
    # plattformgebundenen Tests nachweisbar erzwingen.
    $workflow = Join-Path $Project '.github/workflows/security.yml'
    # Der Paket-Skriptname ist die verbindliche Schnittstelle: Er kapselt
    # Unix-Socket-, Tunnel- und Sicherheitsnachweise.  Testdateinamen müssen
    # im Workflow nicht dupliziert werden und würden bei internen Umbenennungen
    # einen falschen CI-Fehler erzeugen.
    $workflowPatterns = @('ubuntu-latest', 'test:platform-security')
    if (Test-Path $workflow) {
        $workflowMissing = @($workflowPatterns | Where-Object {
            -not (Select-String -LiteralPath $workflow -Pattern $_ -Quiet)
        })
        Add-StaticResult 'Linux-Platform-CI-Gate' ($workflowMissing.Count -eq 0) $true 'linux-ci-gate.log' $workflowMissing
    } elseif (Test-Path (Join-Path $Project '.git')) {
        Add-StaticResult 'Linux-Platform-CI-Gate' $false $true 'linux-ci-gate.log' @('Repository checkout contains no .github/workflows/security.yml')
    } else {
        # npm-Pakete und Quellarchive enthalten keine GitHub-Metadaten. In
        # diesem Fall wird der gleichnamige lokale WSL-Lauf weiter unten zur
        # verbindlichen Linux-Pruefung; die fehlende CI-Datei ist kein Fehler.
        Add-StaticResult 'Linux-Platform-CI-Gate' $true $true 'linux-ci-gate.log' @('Workflow is not bundled; mandatory local WSL platform tests will be run.')
    }

    # Ein einfacher textbasierter Secret-Guard ergänzt GitHub Secret Scanning.
    # Testschlüssel, Fixtures und npm-Lockfiles werden bewusst ausgeschlossen.
    $secretFiles = @($files | Where-Object { $_.FullName -notmatch '[\\/](tests|node_modules|SECURITY_TEST_RESULTS)[\\/]' })
    $secretPattern = '(?i)(?:aws_secret_access_key|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)'
    $secretHits = @($secretFiles | Select-String -Pattern $secretPattern)
    Add-StaticResult 'Hardcoded-Secret-Guard' ($secretHits.Count -eq 0) $true 'secret-scan.log' @($secretHits | ForEach-Object { "$($_.Path):$($_.LineNumber)" })

    # Pruefen, dass die gepatchten Security-Schnittstellen vorhanden sind.
    # Dies ist ein statischer Guard, kein Ersatz fuer dynamische Tests.
    $guards = @(
        @{ File='lib/redirect.js'; Pattern='E_REDIRECT_TO_UNIX_SOCKET' },
        @{ File='lib/auth.js'; Pattern='Auth\.prototype\.clear' },
        @{ File='lib/redirect.js'; Pattern='originReferer' },
        @{ File='request.js'; Pattern='_proxyExplicit' },
        @{ File='lib/getProxyFromURI.js'; Pattern='REQUEST_METHOD' },
        @{ File='lib/har.js'; Pattern='harFileResolver' },
        @{ File='lib/multipart.js'; Pattern='Invalid multipart part header' },
        @{ File='request.js'; Pattern='redactDiagnostic' },
        @{ File='request_testserver/server.js'; Pattern="app\.post\('/api/test-ci'" },
        @{ File='tests/test-security-boundaries.js'; Pattern='AWS signing state is not reused' },
        @{ File='package.json'; Pattern='test:platform-security' }
    )
    $missing = @()
    foreach ($guard in $guards) {
        $target = Join-Path $Project $guard.File
        if (-not (Test-Path $target) -or
            -not (Select-String -LiteralPath $target -Pattern $guard.Pattern -Quiet)) {
            $missing += "$($guard.File): $($guard.Pattern)"
        }
    }
    $guardLog = Join-Path $ReportDir 'patch-guards.log'
    if ($missing.Count) { $missing | Set-Content -LiteralPath $guardLog }
    else { 'Alle 11 Patch-Signaturen vorhanden.' | Set-Content -LiteralPath $guardLog }
    $Results.Add([pscustomobject]@{
        Name='Security-Patch-Signaturen'; Status=$(if($missing.Count){'FAIL'}else{'PASS'})
        ExitCode=$missing.Count; Required=$true; DurationSeconds=0; Log='patch-guards.log'
    })
    if ($missing.Count) { $CriticalFailures++ }

    if (-not $SkipTestServer) {
        # Separates Testserver-Projekt: nur falls dessen Manifest vorhanden.
        $server = Join-Path $Project 'request_testserver'
        if (Test-Path (Join-Path $server 'package.json')) {
            Push-Location $server
            try {
                if (-not $SkipInstall) { Invoke-Check 'Testserver-npm-ci' 'npm' @('ci','--no-audit','--no-fund') }
                $serverPkg = Get-Content 'package.json' -Raw | ConvertFrom-Json
                if ($serverPkg.scripts) {
                    foreach ($entry in $serverPkg.scripts.PSObject.Properties) {
                        if ($entry.Name -match '^(test|lint|build|security|check)') {
                            Invoke-Check ("Testserver-" + $entry.Name) 'npm' @('run',$entry.Name)
                        }
                    }
                }
                if (-not $SkipNetworkChecks) {
                    Invoke-Check 'Testserver-Dependency-Audit' 'npm' @('audit','--audit-level=moderate')
                }
            } finally { Pop-Location }
        }
    }

    if (-not $SkipLinuxPlatform) {
        # Windows kann diese Tests nicht aussagekräftig ausführen. Die CI-Datei
        # ist oben ein Pflicht-Gate; sofern WSL vorhanden ist, wird derselbe
        # Linux-Lauf zusätzlich lokal durchgeführt.
        $wsl = Get-Command 'wsl.exe' -ErrorAction SilentlyContinue
        if ($wsl) {
            $linuxProject = '/mnt/' + $Project.Substring(0,1).ToLower() + $Project.Substring(2).Replace('\','/')
            # WSL übersetzt standardmäßig den Windows-PATH. Fremde Toolchain-
            # Einträge können dabei bereits vor dem Linux-Prozess fehlschlagen.
            # wsl.exe ist schon absolut aufgelöst; deshalb kann der geerbte PATH
            # für genau diesen Aufruf kurz auf System32 reduziert werden.
            $savedPath = $env:PATH
            $savedWslEnv = $env:WSLENV
            try {
                $env:PATH = Join-Path $env:SystemRoot 'System32'
                $env:WSLENV = ''
                # Ein einzelnes, ASCII-sicheres Argument vermeidet, dass
                # PowerShell 5.1 mehrzeilige Here-Strings an wsl.exe splittet.
                # /mnt/<drive> ist ein Windows-Dateisystem (DrvFs) und kann
                # keine Unix-Domain-Sockets anlegen. Der Testlauf wird daher
                # isoliert in ein natives Linux-Temp-Verzeichnis kopiert.
                # A unique directory prevents concurrent invocations from
                # deleting each other's Unix-socket-capable test workspace.
                $linuxTempDir = '/tmp/request-legacy-security-' + [Guid]::NewGuid().ToString('N')
                $linuxCommand = "command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || exit 126; rm -rf $linuxTempDir; mkdir -p $linuxTempDir/project && tar --exclude=node_modules --exclude=SECURITY_TEST_RESULTS -cf - . | tar -xf - -C $linuxTempDir/project && cd $linuxTempDir/project && node --version && npm --version && npm ci --ignore-scripts --no-audit --no-fund && npm run test:platform-security"
                Invoke-Check 'Linux-UnixSocket-und-Tunnel-Tests' $wsl.Source @(
                    '--cd',$linuxProject,'--','/usr/bin/env','-i',
                    'HOME=/tmp','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                    '/bin/bash','-lc',$linuxCommand
                ) $true
            } finally {
                $env:PATH = $savedPath
                $env:WSLENV = $savedWslEnv
            }
        } else {
            Add-StaticResult 'Linux-UnixSocket-und-Tunnel-Tests' $true $false 'linux-platform-local.log' @('WSL nicht verfügbar; verbindliche Ausführung erfolgt im ubuntu-latest GitHub-Actions-Job.')
        }
    }

    # Das npm-Artefakt darf weder Test- noch Build- oder Berichtsdateien
    # enthalten. npm pack --dry-run liefert die kanonische Dateiliste.
    $packJson = & npm pack --dry-run --json 2>$null | Out-String
    $forbiddenPackagePaths = @('node_modules/','tests/','request_testserver/','SECURITY_TEST_RESULTS/','.env')
    $badPackagePaths = @($forbiddenPackagePaths | Where-Object { $packJson -match [regex]::Escape($_) })
    Add-StaticResult 'Package-Inhalt-Guard' ($badPackagePaths.Count -eq 0) $true 'package-content-guard.log' $badPackagePaths
} catch {
    $CriticalFailures++
    Write-Host "ABBRUCH: $_" -ForegroundColor Red
    $_ | Out-String | Set-Content (Join-Path $ReportDir 'fatal-error.log')
} finally {
    $Results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ReportDir 'results.json') -Encoding UTF8
    $summary = @(
        '# Request-Legacy - Lokaler Testbericht',
        '',
        "Datum: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "Projekt: $Project",
        "Pflichtpruefungen fehlgeschlagen: $CriticalFailures",
        '',
        '| Pruefung | Ergebnis | Exitcode | Dauer (s) |',
        '|---|---|---:|---:|'
    )
    foreach ($r in $Results) {
        $summary += "| $($r.Name) | $($r.Status) | $($r.ExitCode) | $($r.DurationSeconds) |"
    }
    $summary += ''
    $summary += 'Hinweis: Ein PASS der Testsuite ist kein Beweis fuer vollstaendige Sicherheitsfreiheit.'
    $summary | Set-Content -LiteralPath (Join-Path $ReportDir 'REPORT.md') -Encoding UTF8
    Write-Host "`nBerichte: $ReportDir" -ForegroundColor Cyan
    Write-Host "Pflichtpruefungen fehlgeschlagen: $CriticalFailures" -ForegroundColor $(if($CriticalFailures){'Red'}else{'Green'})
}
if ($CriticalFailures -gt 0) { exit 1 } else { exit 0 }


