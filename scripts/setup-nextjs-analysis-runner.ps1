param([string]$DivePlanUrl = "https://dive-plan.vercel.app")

$ErrorActionPreference = "Stop"
$taskName = "DivePlan Next.js Code Analyst"
$root = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $root) { throw "Ouvre PowerShell à la racine du dépôt DivePlan." }
$watchScript = Join-Path $root "scripts\watch-nextjs-analysis.ps1"
if (-not (Test-Path -LiteralPath $watchScript)) { throw "Script du runner introuvable : $watchScript" }

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  $codexExecutable = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\*\codex.exe") -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($codexExecutable) { $env:Path = "$($codexExecutable.DirectoryName);$env:Path" }
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw "Installe Codex CLI avant le runner." }
$loginStatus = (& codex login status 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $loginStatus -notmatch "Logged in using ChatGPT") { throw "Connecte Codex à ChatGPT avec : codex login" }

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

$pwshPath = (Get-Process -Id $PID).Path
$escapedScript = '"' + $watchScript + '"'
$escapedUrl = '"' + $DivePlanUrl + '"'
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $escapedScript -DivePlanUrl $escapedUrl"
$action = New-ScheduledTaskAction -Execute $pwshPath -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Surveille les demandes d’analyse de code Next.js dans DivePlan et lance Codex localement en lecture seule." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Runner d’analyse installé et démarré. Il redémarrera à chaque ouverture de session Windows."
Write-Host "Pour le désinstaller, retire la tâche planifiée '$taskName' dans le Planificateur de tâches Windows."
