$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "create-local-snapshot.ps1"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível atualizar o snapshot local."
}

$env:CLAREZA_LOCAL_SNAPSHOT = "1"
Write-Host "Modo snapshot local ativado. As gravações estão bloqueadas."
& npm.cmd run dev
exit $LASTEXITCODE
