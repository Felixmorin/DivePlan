param(
  [string]$DivePlanUrl = "https://dive-plan.vercel.app",
  [ValidateRange(5, 300)][int]$PollSeconds = 15
)

$ErrorActionPreference = "Stop"
$baseUrl = $DivePlanUrl.TrimEnd("/")
$root = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $root) { throw "Ouvre PowerShell à la racine du dépôt DivePlan." }
Set-Location $root

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  $codexExecutable = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\*\codex.exe") -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($codexExecutable) { $env:Path = "$($codexExecutable.DirectoryName);$env:Path" }
}
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw "Commande requise introuvable : codex" }
$loginStatus = (& codex login status 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $loginStatus -notmatch "Logged in using ChatGPT") { throw "Connecte Codex à ChatGPT avec : codex login" }

$tokenStorePath = Join-Path $env:LOCALAPPDATA "DivePlan\correction-runner-token.dpapi"
if (-not (Test-Path -LiteralPath $tokenStorePath)) { throw "Jeton local introuvable. Installe le runner avec scripts\setup-nextjs-analysis-runner.ps1." }
$secureToken = ConvertTo-SecureString (Get-Content -LiteralPath $tokenStorePath -Raw).Trim()
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try { $runnerToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secureToken.Dispose() }
$headers = @{ Authorization = "Bearer $runnerToken"; Accept = "application/json" }
$claimUrl = "$baseUrl/api/agent-code-analysis/queue/claim"
$analyzerPath = Join-Path $root "scripts\analyze-nextjs-code.ps1"
$reportDirectory = Join-Path $root "logs\nextjs-code-analysis"
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
$logPath = Join-Path $reportDirectory "runner.log"
$pwshPath = (Get-Process -Id $PID).Path

Write-Host "Runner d’analyse Next.js actif. Vérification toutes les $PollSeconds secondes. Arrêt : Ctrl+C."
Write-Host "Les rapports restent dans : $reportDirectory"
while ($true) {
  try {
    $response = Invoke-RestMethod -Method Post -Uri $claimUrl -Headers $headers -ContentType "application/json" -Body "{}" -TimeoutSec 30
    if ($response.task) {
      $task = $response.task
      $started = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      $runLogPath = Join-Path $reportDirectory "runner-$($task.id).log"
      Add-Content -LiteralPath $runLogPath -Value "$started Début de l’analyse $($task.id)"
      Write-Host "$started Analyse Next.js prise en charge : $($task.id)"
      & $pwshPath -NoProfile -ExecutionPolicy Bypass -File $analyzerPath -RunId ([guid]$task.id) -DivePlanUrl $baseUrl *>&1 | Tee-Object -FilePath $runLogPath -Append -Encoding utf8
      $exitCode = $LASTEXITCODE
      if ($exitCode -ne 0) {
        $failureBody = @{ status = "failed"; error = "L’analyse Codex locale a échoué. Consulte logs/nextjs-code-analysis/runner-$($task.id).log." } | ConvertTo-Json -Compress
        try { Invoke-RestMethod -Method Post -Uri "$baseUrl/api/agent-code-analysis/runs/$($task.id)/status" -Headers $headers -ContentType "application/json" -Body $failureBody -TimeoutSec 30 | Out-Null } catch {}
      }
      Add-Content -LiteralPath $runLogPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Fin (code $exitCode)"
    }
  } catch {
    $message = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Runner: $($_.Exception.Message)"
    Add-Content -LiteralPath $logPath -Value $message
    Write-Warning $message
  }
  Start-Sleep -Seconds $PollSeconds
}
