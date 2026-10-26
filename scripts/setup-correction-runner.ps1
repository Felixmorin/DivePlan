param([string]$DivePlanUrl = "https://dive-plan.vercel.app")

$ErrorActionPreference = "Stop"
$taskName = "DivePlan Correction Runner"
$root = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $root) { throw "Ouvre PowerShell à la racine du dépôt DivePlan." }
$watchScript = Join-Path $root "scripts\watch-approved-corrections.ps1"
if (-not (Test-Path -LiteralPath $watchScript)) { throw "Script du runner introuvable : $watchScript" }
$pwshPath = (Get-Process -Id $PID).Path
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  $codexExecutable = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\*\codex.exe") -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($codexExecutable) { $env:Path = "$($codexExecutable.DirectoryName);$env:Path" }
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue) -or -not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "Installe Codex CLI et GitHub CLI avant le runner."
}
$codexLogin = (& codex login status 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $codexLogin -notmatch "Logged in using ChatGPT") { throw "Connecte Codex à ChatGPT avec : codex login" }
& gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) { throw "Connecte GitHub CLI avec : gh auth login" }
$tokenStorePath = Join-Path $env:LOCALAPPDATA "DivePlan\correction-runner-token.dpapi"
$tokenDirectory = Split-Path -Parent $tokenStorePath
New-Item -ItemType Directory -Path $tokenDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $tokenStorePath)) {
  $secureToken = Read-Host "Jeton CORRECTION_RUNNER_TOKEN configuré dans DivePlan" -AsSecureString
  if ($secureToken.Length -lt 32) { $secureToken.Dispose(); throw "Le jeton semble trop court; vérifie sa valeur." }
  ConvertFrom-SecureString $secureToken | Set-Content -LiteralPath $tokenStorePath -NoNewline -Encoding ascii
  $secureToken.Dispose()
  Write-Host "Jeton mémorisé chiffré avec DPAPI pour ce compte Windows."
} else {
  Write-Host "Le jeton DPAPI de ce compte est déjà configuré."
}

$escapedScript = '"' + $watchScript + '"'
$escapedUrl = '"' + $DivePlanUrl + '"'
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $escapedScript -DivePlanUrl $escapedUrl"
$action = New-ScheduledTaskAction -Execute $pwshPath -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Surveille les corrections explicitement préparées dans DivePlan et lance Codex localement." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Runner installé et démarré. Il redémarrera à chaque ouverture de session Windows."
Write-Host "Journaux classés automatiquement dans : $(Join-Path $root 'logs\avec-pr') et $(Join-Path $root 'logs\sans-pr')"
Write-Host "Pour le retirer : Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
