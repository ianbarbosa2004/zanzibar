$ErrorActionPreference = "Stop"

$remoteHost = if ($env:CLAREZA_SFTP_HOST) { $env:CLAREZA_SFTP_HOST } else { "itsites.com.br" }
$remoteUser = if ($env:CLAREZA_SFTP_USER) { $env:CLAREZA_SFTP_USER } else { "itsitescom" }
$remoteRoot = if ($env:CLAREZA_SFTP_ROOT) { $env:CLAREZA_SFTP_ROOT } else { "/home1/itsitescom/public_html/clareza" }
$sshKey = if ($env:CLAREZA_SSH_KEY) { $env:CLAREZA_SSH_KEY } else { Join-Path $HOME ".ssh\clareza_cpanel_deploy" }
$remoteTarget = "$remoteUser@$remoteHost"
$connectionOptions = @("-i", $sshKey, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
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
  if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw "curl.exe não encontrado." }
  if (-not (Test-Path -LiteralPath $sshKey -PathType Leaf)) { throw "Chave SSH não encontrada: $sshKey" }

  $sourceCommit = (git rev-parse HEAD).Trim()
  $mainCommit = (git rev-parse origin/main).Trim()
  if ($sourceCommit -ne $mainCommit) {
    throw "Deploy bloqueado: o workspace não está no mesmo commit de origin/main. Atual: $sourceCommit; origin/main: $mainCommit"
  }

  node --check app.js
  node --check server.js
  npm run build
  @{
    commit = $sourceCommit
    branch = (git branch --show-current).Trim()
  } | ConvertTo-Json -Compress | Set-Content -LiteralPath "dist/deploy-version.json" -Encoding ascii

  Invoke-Checked "ssh" @($connectionOptions + @($remoteTarget, "mkdir -p $remoteRoot/backups $remoteRoot/tmp $remoteRoot/src; cp $remoteRoot/data.json $remoteRoot/backups/data-$backupStamp.json 2>/dev/null || true; cp $remoteRoot/settings.json $remoteRoot/backups/settings-$backupStamp.json 2>/dev/null || true"))
  Invoke-Checked "ssh" @($connectionOptions + @($remoteTarget, "rm -rf $remoteRoot/dist && mkdir -p $remoteRoot/dist"))
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
  Invoke-Checked "sftp" @($connectionOptions + @("-b", $tempBatch, $remoteTarget))
  Invoke-Checked "ssh" @($connectionOptions + @($remoteTarget, "rm -f $remoteRoot/index.html $remoteRoot/app.js $remoteRoot/style.css"))
  Invoke-Checked "ssh" @($connectionOptions + @($remoteTarget, "cd $remoteRoot && /home1/itsitescom/nodevenv/public_html/clareza/22/bin/npm ci --omit=dev && touch tmp/restart.txt"))

  $page = Invoke-WebRequest -Uri "https://itsites.com.br/clareza/" -UseBasicParsing
  $api = Invoke-WebRequest -Uri "https://itsites.com.br/clareza/api/data" -UseBasicParsing
  if ($page.StatusCode -ne 200 -or $api.StatusCode -ne 200) { throw "Validação online retornou status inesperado." }
  $version = Invoke-WebRequest -Uri "https://itsites.com.br/clareza/deploy-version.json" -UseBasicParsing
  if ($version.StatusCode -ne 200) { throw "Não foi possível ler a versão publicada." }
  $publishedCommit = ($version.Content | ConvertFrom-Json).commit
  if ($publishedCommit -ne $sourceCommit) {
    throw "A versão publicada diverge do commit validado. Esperado: $sourceCommit; publicado: $publishedCommit"
  }
  Write-Output "CLAREZA_DEPLOY_COMMIT: $publishedCommit"
  $localAssets = [regex]::Matches((Get-Content -LiteralPath "dist/index.html" -Raw), "assets/[^""']+\.(js|css)") | ForEach-Object { $_.Value } | Sort-Object -Unique
  foreach ($asset in $localAssets) {
    if ($page.Content -notlike "*$asset*") { throw "A página online não referencia o asset esperado: $asset" }
    $localAssetPath = Join-Path "dist" $asset
    $onlineAssetPath = Join-Path $env:TEMP ("clareza-online-" + [guid]::NewGuid().ToString("N") + [IO.Path]::GetExtension($asset))
    $assetValidated = $false
    try {
      for ($attempt = 1; $attempt -le 3; $attempt++) {
        & curl.exe --fail --silent --show-error --location --output $onlineAssetPath "https://itsites.com.br/clareza/$asset"
        if ($LASTEXITCODE -ne 0) { throw "Não foi possível baixar o asset online: $asset" }
        $localHash = (Get-FileHash -LiteralPath $localAssetPath -Algorithm SHA256).Hash
        $onlineHash = (Get-FileHash -LiteralPath $onlineAssetPath -Algorithm SHA256).Hash
        if ($onlineHash -eq $localHash) {
          $assetValidated = $true
          break
        }
        if ($attempt -lt 3) { Start-Sleep -Seconds 5 }
      }
    }
    finally {
      Remove-Item -LiteralPath $onlineAssetPath -Force -ErrorAction SilentlyContinue
    }
    if (-not $assetValidated) {
      throw "O asset online diverge do build local após aguardar a propagação: $asset"
    }
    Write-Output "CLAREZA_ASSET_VALIDATED: $asset"
  }
  Write-Output "CLAREZA_DEPLOY_COMPLETED: Publicação concluída e endpoints online validados. A tarefa pode ser encerrada."
}
finally {
  Remove-Item -LiteralPath $tempBatch, $restartPath -Force -ErrorAction SilentlyContinue
}
