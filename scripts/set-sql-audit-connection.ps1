$ErrorActionPreference = "Stop"
$storePath = Join-Path $env:LOCALAPPDATA "DivePlan\sql-audit-connection.dpapi"
$storeDirectory = Split-Path -Parent $storePath
New-Item -ItemType Directory -Path $storeDirectory -Force | Out-Null

Write-Host "Colle une chaîne PostgreSQL dédiée à un rôle en lecture seule. Elle sera chiffrée avec DPAPI pour ce compte Windows."
$secureConnection = Read-Host "DIVEPLAN_AUDIT_DATABASE_URL" -AsSecureString
if ($secureConnection.Length -lt 20) {
  $secureConnection.Dispose()
  throw "La chaîne semble trop courte."
}

try {
  ConvertFrom-SecureString $secureConnection | Set-Content -LiteralPath $storePath -NoNewline -Encoding ascii
} finally {
  $secureConnection.Dispose()
}
Write-Host "Connexion d’audit enregistrée de façon chiffrée pour ce compte Windows."
