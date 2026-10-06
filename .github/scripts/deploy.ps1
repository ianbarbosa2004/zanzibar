$ErrorActionPreference = "Stop"

$remoteHost = "itsites.com.br"
$remoteUser = "itsitescom"
$remoteRoot = "/home1/itsitescom/public_html/clareza"
$remoteTarget = "$remoteUser@$remoteHost"
$tempBatch = Join-Path $env:TEMP ("clareza-sftp-" + [guid]::NewGuid().ToString("N") + ".txt")
$restartPath = Join-Path $env:TEMP ("clareza-restart-" + [guid]::NewGuid().ToString("N") + ".txt")
$backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Comando falhou: $Command (exit code $LASTEXITCODE)" }
}

try {
  if (-not (Test-Path -LiteralPath "package.json")) { throw "package.json não encontrado." }
  if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) { throw "ssh não encontrado." }
  if (-not (Get-Command sftp -ErrorAction SilentlyContinue)) { throw "sftp não encontrado." }

  node --check app.js
  node --check server.js
  npm run build

  Invoke-Checked "ssh" @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", $remoteTarget, "mkdir -p $remoteRoot/backups $remoteRoot/tmp $remoteRoot/src; cp $remoteRoot/data.json $remoteRoot/backups/data-$backupStamp.json 2>/dev/null || true; cp $remoteRoot/settings.json $remoteRoot/backups/settings-$backupStamp.json 2>/dev/null || true")
  Invoke-Checked "ssh" @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", $remoteTarget, "rm -rf $remoteRoot/dist && mkdir -p $remoteRoot/dist")
  New-Item -ItemType File -Path $restartPath -Force | Out-Null
  @"
cd $remoteRoot
put -r dist
put server.js
put -r src
put package.json
put package-lock.json
put $restartPath tmp/restart.txt
bye
"@ | Set-Content -LiteralPath $tempBatch -Encoding ascii
  Invoke-Checked "sftp" @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-b", $tempBatch, $remoteTarget)
  Invoke-Checked "ssh" @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", $remoteTarget, "rm -f $remoteRoot/index.html $remoteRoot/app.js $remoteRoot/style.css")
  Invoke-Checked "ssh" @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", $remoteTarget, "cd $remoteRoot && /home1/itsitescom/nodevenv/public_html/clareza/22/bin/npm ci --omit=dev && touch tmp/restart.txt")

  $page = Invoke-WebRequest -Uri "https://itsites.com.br/clareza/" -UseBasicParsing
  $api = Invoke-WebRequest -Uri "https://itsites.com.br/clareza/api/data" -UseBasicParsing
  if ($page.StatusCode -ne 200 -or $api.StatusCode -ne 200) { throw "Validação online retornou status inesperado." }
  $localAssets = [regex]::Matches((Get-Content -LiteralPath "dist/index.html" -Raw), "assets/[^""']+\.(js|css)") | ForEach-Object { $_.Value } | Sort-Object -Unique
  foreach ($asset in $localAssets) {
    if ($page.Content -notlike "*$asset*") { throw "A página online não referencia o asset esperado: $asset" }
    $localAsset = Get-Content -LiteralPath (Join-Path "dist" $asset) -Raw
    $assetValidated = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      $onlineAsset = (Invoke-WebRequest -Uri "https://itsites.com.br/clareza/$asset" -UseBasicParsing).Content
      if ($onlineAsset -eq $localAsset) {
        $assetValidated = $true
        break
      }
      if ($attempt -lt 3) { Start-Sleep -Seconds 5 }
    }
    if (-not $assetValidated) { throw "O asset online diverge do build local após aguardar a propagação: $asset" }
    Write-Output "CLAREZA_ASSET_VALIDATED: $asset"
  }
  Write-Output "CLAREZA_DEPLOY_COMPLETED: Publicação concluída e endpoints online validados. A tarefa pode ser encerrada."
}
finally {
  Remove-Item -LiteralPath $tempBatch, $restartPath -Force -ErrorAction SilentlyContinue
}
