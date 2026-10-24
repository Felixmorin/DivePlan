param(
  [string]$DivePlanUrl = "https://dive-plan.vercel.app",
  [ValidateRange(5, 300)][int]$PollSeconds = 15
)

$ErrorActionPreference = "Stop"
$baseUrl = $DivePlanUrl.TrimEnd('/')
$root = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $root) { throw "Ouvre PowerShell à la racine du dépôt DivePlan." }
Set-Location $root

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  $codexExecutable = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\*\codex.exe") -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($codexExecutable) { $env:Path = "$($codexExecutable.DirectoryName);$env:Path" }
}

$originUrl = (& git remote get-url origin 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $originUrl -notmatch 'github\.com[:/]Felixmorin/DivePlan(?:\.git)?$') {
  throw "Le dépôt local origin doit pointer vers github.com/Felixmorin/DivePlan."
}

$codexLogin = (& codex login status 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $codexLogin -notmatch "Logged in using ChatGPT") { throw "Connecte Codex à ChatGPT avec : codex login" }
& gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) { throw "Connecte GitHub CLI avec : gh auth login" }

$tokenStorePath = Join-Path $env:LOCALAPPDATA "DivePlan\correction-runner-token.dpapi"
$tokenDirectory = Split-Path -Parent $tokenStorePath
New-Item -ItemType Directory -Path $tokenDirectory -Force | Out-Null
$runnerToken = $null
if (Test-Path -LiteralPath $tokenStorePath) {
  try {
    $secureToken = ConvertTo-SecureString (Get-Content -LiteralPath $tokenStorePath -Raw).Trim()
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try { $runnerToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secureToken.Dispose() }
  } catch { $runnerToken = $null }
}
if (-not $runnerToken) {
  $secureToken = Read-Host "Jeton CORRECTION_RUNNER_TOKEN de DivePlan" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try { $runnerToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ([string]::IsNullOrWhiteSpace($runnerToken)) { throw "Jeton DivePlan manquant." }
  ConvertFrom-SecureString $secureToken | Set-Content -LiteralPath $tokenStorePath -NoNewline -Encoding ascii
  $secureToken.Dispose()
  Write-Host "Jeton mémorisé chiffré pour ce compte Windows."
}
$headers = @{ Authorization = "Bearer $runnerToken"; Accept = "application/json" }
$claimUrl = "$baseUrl/api/agent-correction/queue/claim"
$workerPath = Join-Path $root "scripts\run-approved-correction.ps1"
$logDirectory = Join-Path $root "logs"
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory "correction-runner.log"

Write-Host "Runner DivePlan actif. Vérification toutes les $PollSeconds secondes. Arrêt : Ctrl+C."
Write-Host "Les tâches approuvées seront lancées dans : $root"
$dirtyNoticeShown = $false
while ($true) {
  try {
    $workingChanges = @(& git status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "Impossible de vérifier l’état Git." }
    if ($workingChanges) {
      if (-not $dirtyNoticeShown) { Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Dépôt modifié; aucune tâche ne sera prise en charge."; $dirtyNoticeShown = $true }
      Start-Sleep -Seconds $PollSeconds
      continue
    }
    $dirtyNoticeShown = $false
    $response = Invoke-RestMethod -Method Post -Uri $claimUrl -Headers $headers -ContentType "application/json" -Body "{}" -TimeoutSec 30
    if ($response.task) {
      $task = $response.task
      $started = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      $runLogPath = Join-Path $logDirectory "correction-runner-$($task.executionId).log"
      Add-Content -LiteralPath $runLogPath -Value "$started Début $($task.proposalId) / $($task.executionId)"
      Write-Host "$started Correction prise en charge : $($task.proposalId)"
      $pwshPath = (Get-Process -Id $PID).Path
      & $pwshPath -NoProfile -ExecutionPolicy Bypass -File $workerPath -ProposalId $task.proposalId -ExecutionId $task.executionId -DivePlanUrl $baseUrl *>&1 | Tee-Object -FilePath $runLogPath -Append
      $exitCode = $LASTEXITCODE
      $finished = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      Add-Content -LiteralPath $runLogPath -Value "$finished Fin $($task.proposalId) (code $exitCode)"
    }
  } catch {
    $message = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Runner: $($_.Exception.Message)"
    Add-Content -LiteralPath $logPath -Value $message
    Write-Warning $message
  }
  Start-Sleep -Seconds $PollSeconds
}
