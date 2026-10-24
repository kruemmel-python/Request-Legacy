#requires -Version 5.1
[CmdletBinding()]
param([switch]$SkipLinux)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$driveRoot=Split-Path -Qualifier $root
if($driveRoot -ne 'H:'){throw 'Security closure tests must run from drive H:'}
$scratchRoot='H:\Codex-Temp\Request-Legacy-3.0.9'
$cacheRoot='H:\Codex-Cache\Request-Legacy-3.0.9'
New-Item -ItemType Directory -Force -Path $scratchRoot,$cacheRoot|Out-Null
$env:TEMP=$scratchRoot
$env:TMP=$scratchRoot
$env:npm_config_cache=$cacheRoot
$out=Join-Path $root ('FINDINGS_CLOSURE_RESULTS\'+(Get-Date -Format yyyyMMdd_HHmmss))
New-Item -ItemType Directory -Force -Path $out|Out-Null
$results=[Collections.Generic.List[object]]::new()

function Invoke-Finding([string]$Id,[string[]]$CommandArgs,[string]$Expected,[string]$Platform='Windows') {
  $log=Join-Path $out "$Id.log"; $lines=@(); $code=127
  try { $oldEap=$ErrorActionPreference;$ErrorActionPreference='Continue';$lines=@(& node @CommandArgs 2>&1 | ForEach-Object {[string]$_}); $code=$LASTEXITCODE;$ErrorActionPreference=$oldEap } catch { $lines+=($_|Out-String) }
  $lines|Set-Content -LiteralPath $log -Encoding UTF8
  $text=$lines -join "`n"; $asserted=[regex]::IsMatch($text,$Expected) -and $text -notmatch '(?im)^not ok|\bSKIP(?:PED)?\b'
  $status=if($code -ne 0){'FAIL'}elseif(-not $asserted){'FAIL'}else{'PASS'}
  $results.Add([pscustomobject]@{finding_id=$Id;platform=$Platform;status=$status;exit_code=$code;assertions_verified=$asserted;expected=$Expected;log=(Split-Path $log -Leaf)})
}

$existing=@(
 @('SEC-01','tests/test-security-regressions.js','redirects cannot enter Unix-socket transport by default'),
 @('SEC-02','tests/test-security-boundaries.js','(?s)deferred credentials are not recreated.*AWS signing state is not reused'),
 @('SEC-03','tests/test-security-boundaries.js','decoded pipes do not forward compressed Content-Length'),
 @('SEC-06','tests/test-security-regressions.js','HAR file names do not authorize local reads'),
 @('SEC-07','tests/test-security-regressions.js','proxy configuration handles CGI and IPv6 NO_PROXY safely'),
 @('SEC-09','tests/test-security-regressions.js','proxy configuration handles CGI and IPv6 NO_PROXY safely'),
 @('SEC-10','tests/test-security-boundaries.js','advanced agent policies are not globally pooled'),
 @('SEC-11','tests/test-security-regressions.js','multipart rejects injected raw part headers')
)
Push-Location $root
try {
 foreach($item in $existing){Invoke-Finding $item[0] @('scripts/run-tests.js',$item[1]) $item[2]}
 foreach($id in @('04','05','08','12','14')){Invoke-Finding "SEC-$id" @("tests/security-closure/sec-$id-"+@{'04'='referer.js';'05'='proxy-policy.js';'08'='debug-redaction.js';'12'='testserver-auth.js';'14'='report-retention.js'}[$id]) "CLOSURE SEC-$id PASS assertions=[1-9][0-9]*"}
} finally {Pop-Location}

$linuxLog=Join-Path $out 'SEC-13-linux.log'
if($SkipLinux){$results.Add([pscustomobject]@{finding_id='SEC-13';platform='Linux';status='SKIPPED';exit_code=$null;assertions_verified=$false;expected='Unix socket and tunnel assertions';log=(Split-Path $linuxLog -Leaf)})}
else {
 $wsl=Get-Command wsl.exe -EA SilentlyContinue
 if(-not $wsl){$results.Add([pscustomobject]@{finding_id='SEC-13';platform='Linux';status='BLOCKED';exit_code=$null;assertions_verified=$false;expected='WSL unavailable';log=(Split-Path $linuxLog -Leaf)})}
 else {
  $drive=$root.Substring(0,1).ToLower(); $linuxSource='/mnt/'+$drive+$root.Substring(2).Replace('\','/')
  $linuxTemp='/mnt/h/Codex-Temp/Request-Legacy-3.0.9/wsl-'+[Guid]::NewGuid().ToString('N')
  $linuxCache='/mnt/h/Codex-Cache/Request-Legacy-3.0.9/npm-wsl'
  $linuxSocket='/dev/shm/request-legacy-'+[Guid]::NewGuid().ToString('N')+'.sock'
  $cmd="command -v node >/dev/null && command -v npm >/dev/null || exit 126; mkdir -p $linuxTemp/project $linuxTemp/home $linuxCache && tar --exclude=node_modules --exclude=FINDINGS_CLOSURE_RESULTS -cf - . | tar -xf - -C $linuxTemp/project && cd $linuxTemp/project && HOME=$linuxTemp/home TMPDIR=$linuxTemp npm_config_cache=$linuxCache npm ci --ignore-scripts --no-audit --no-fund && HOME=$linuxTemp/home TMPDIR=$linuxTemp npm_config_cache=$linuxCache npm run test:security && HOME=$linuxTemp/home TMPDIR=$linuxTemp npm_config_cache=$linuxCache npm run test:platform-security"
  $savedPath=$env:PATH; $savedWslEnv=$env:WSLENV
  try {$env:PATH=Join-Path $env:SystemRoot 'System32';$env:WSLENV='';$oldEap=$ErrorActionPreference;$ErrorActionPreference='Continue';$lines=@(& $wsl.Source -d Ubuntu --cd $linuxSource -- /usr/bin/env -i "HOME=$linuxTemp/home" "TMPDIR=$linuxTemp" "npm_config_cache=$linuxCache" "REQUEST_LEGACY_UNIX_SOCKET=$linuxSocket" 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' /bin/bash -lc $cmd 2>&1|ForEach-Object{[string]$_});$code=$LASTEXITCODE;$ErrorActionPreference=$oldEap} catch {$lines=@($_|Out-String);$code=127} finally {$env:PATH=$savedPath;$env:WSLENV=$savedWslEnv}
  $lines|Set-Content $linuxLog; $text=$lines-join "`n"; $ok=$code-eq 0-and$text-match'unix socket connection'-and$text-match'http over http, tunnel=true'-and$text-match'# fail 0'
  $results.Add([pscustomobject]@{finding_id='SEC-13';platform='Linux';status=$(if($ok){'PASS'}else{'FAIL'});exit_code=$code;assertions_verified=$ok;expected='Unix socket and HTTP/HTTPS tunnel assertions';log=(Split-Path $linuxLog -Leaf)})
 }
}
$results|ConvertTo-Json -Depth 5|Set-Content (Join-Path $out 'results.json') -Encoding UTF8
$md=@('# Finding closure execution','','| Finding | Platform | Status | Exit | Assertions | Log |','|---|---|---|---:|---|---|')
$md += $results|ForEach-Object{"| $($_.finding_id) | $($_.platform) | $($_.status) | $($_.exit_code) | $($_.assertions_verified) | $($_.log) |"}
$md|Set-Content (Join-Path $out 'REPORT.md') -Encoding UTF8
$incomplete=@($results|Where-Object{$_.status-ne'PASS'-or-not$_.assertions_verified})
Write-Host "Reports: $out"; Write-Host "Incomplete mandatory findings: $($incomplete.Count)"
if($incomplete.Count){exit 1}
