param(
  [string]$DivePlanUrl = "https://dive-plan.vercel.app",
  [ValidateRange(5, 300)][int]$PollSeconds = 15
)

$ErrorActionPreference = "Stop"
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
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
$logsRoot = Join-Path $root "logs"
$reportDirectory = Join-Path $logsRoot "nextjs-code-analysis"
$sqlReportDirectory = Join-Path $logsRoot "sql-supabase-analysis"
New-Item -ItemType Directory -Path $reportDirectory, $sqlReportDirectory -Force | Out-Null
$logPath = Join-Path $logsRoot "codex-analysis-runner.log"
$pwshPath = (Get-Process -Id $PID).Path

Write-Host "Runner d’analyse Codex DivePlan actif. Vérification toutes les $PollSeconds secondes. Arrêt : Ctrl+C."
Write-Host "Les rapports restent dans logs\nextjs-code-analysis et logs\sql-supabase-analysis."
while ($true) {
  try {
    $response = Invoke-RestMethod -Method Post -Uri $claimUrl -Headers $headers -ContentType "application/json" -Body "{}" -TimeoutSec 30
    if ($response.task) {
      $task = $response.task
      $started = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      $analysisDirectory = if ($task.agentId -eq "diveplan-observability") { "observability" } elseif ($task.agentId -eq "sql-supabase-analyst") { "sql-supabase-analysis" } else { "nextjs-code-analysis" }
      $taskLogDirectory = Join-Path $logsRoot $analysisDirectory
      New-Item -ItemType Directory -Path $taskLogDirectory -Force | Out-Null
      $runLogPath = Join-Path $taskLogDirectory "runner-$($task.id).log"
      Add-Content -LiteralPath $runLogPath -Value "$started Début de l’analyse $($task.id)"
      Write-Host "$started Analyse Codex prise en charge : $($task.agentId) / $($task.id)"
      if ($task.agentId -eq "diveplan-observability") {
        $taskPath = Join-Path $taskLogDirectory "task-$($task.id).json"
        $task | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskPath -Encoding utf8
        & $pwshPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\analyze-observability.ps1") -TaskPath $taskPath -DivePlanUrl $baseUrl *>&1 | Tee-Object -FilePath $runLogPath -Append -Encoding utf8
        Remove-Item -LiteralPath $taskPath -Force -ErrorAction SilentlyContinue
      } else {
        & $pwshPath -NoProfile -ExecutionPolicy Bypass -File $analyzerPath -AgentId $task.agentId -RunId ([guid]$task.id) -DivePlanUrl $baseUrl *>&1 | Tee-Object -FilePath $runLogPath -Append -Encoding utf8
      }
      $exitCode = $LASTEXITCODE
      if ($exitCode -ne 0) {
        $failureBody = @{ status = "failed"; agentId = $task.agentId; error = "L’analyse Codex locale a échoué. Consulte logs/$analysisDirectory/runner-$($task.id).log." } | ConvertTo-Json -Compress
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
