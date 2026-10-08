$ErrorActionPreference = "Stop"

$sourceUrl = if ($env:CLAREZA_SNAPSHOT_URL) { $env:CLAREZA_SNAPSHOT_URL } else { "https://itsites.com.br/clareza/api/data" }
$destination = Join-Path (Get-Location) "local-snapshot.json"

$response = Invoke-WebRequest -UseBasicParsing -Uri $sourceUrl
if ($response.StatusCode -ne 200) {
  throw "A API retornou HTTP $($response.StatusCode)."
}

$json = $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($destination, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Snapshot local criado em $destination"
Write-Host "O arquivo é ignorado pelo Git e não deve ser enviado ao servidor."
