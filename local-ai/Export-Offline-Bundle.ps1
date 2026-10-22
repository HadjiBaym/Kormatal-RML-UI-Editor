$ErrorActionPreference = 'Stop'
$LocalAiRoot = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $LocalAiRoot
$ModelFiles = @(
  (Join-Path $LocalAiRoot 'models\Qwen3VL-2B-Instruct-Q4_K_M.gguf'),
  (Join-Path $LocalAiRoot 'models\mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf')
)
foreach ($file in $ModelFiles) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Не найден файл модели: $file. Сначала выполните Install-Local-Model.ps1." }
}
$Runtime = Get-ChildItem -Path (Join-Path $LocalAiRoot 'runtime') -Filter 'llama-server.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Runtime) { throw 'llama-server.exe не найден. Сначала выполните Install-Local-Model.ps1.' }
$Bundle = Join-Path $ProjectRoot 'Kormatal-LocalAI-Offline-Bundle.zip'
$Staging = Join-Path $env:TEMP ("Kormatal-LocalAI-" + [guid]::NewGuid().ToString('N'))
$StagedLocalAi = Join-Path $Staging 'local-ai'
New-Item -ItemType Directory -Force -Path $StagedLocalAi | Out-Null
try {
  Remove-Item -LiteralPath $Bundle -Force -ErrorAction SilentlyContinue
  Write-Host 'Копирую локальные веса и runtime во временный каталог...' -ForegroundColor Cyan
  Copy-Item -Path (Join-Path $LocalAiRoot '*') -Destination $StagedLocalAi -Recurse -Force
  Write-Host 'Создаю переносимый архив локальной модели (примерно 1,6 ГБ плюс runtime)...' -ForegroundColor Cyan
  Compress-Archive -Path $StagedLocalAi -DestinationPath $Bundle -CompressionLevel NoCompression
  Write-Host "Готово: $Bundle" -ForegroundColor Green
  Write-Host 'Архив содержит local-ai/; распакуйте его в корень проекта на офлайн-компьютере.'
} finally {
  Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction SilentlyContinue
}
