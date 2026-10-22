param([ValidateSet('cpu', 'cuda12')][string]$Backend = 'cpu')
$ErrorActionPreference = 'Stop'
$LocalAiRoot = $PSScriptRoot
$ModelDir = Join-Path $LocalAiRoot 'models'
$RuntimeDir = Join-Path $LocalAiRoot (Join-Path 'runtime' $Backend)
$ModelPath = Join-Path $ModelDir 'Qwen3VL-2B-Instruct-Q4_K_M.gguf'
$ProjectorPath = Join-Path $ModelDir 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'
if (-not (Test-Path -LiteralPath $ModelPath) -or -not (Test-Path -LiteralPath $ProjectorPath)) {
  Write-Host 'Не найдены веса модели. Сначала выполните:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File .\local-ai\Install-Local-Model.ps1'
  exit 2
}
$Server = Get-ChildItem -Path $RuntimeDir -Filter 'llama-server.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Server) {
  Write-Host 'Не найден local-ai/runtime/**/llama-server.exe. Повторите установку runtime.' -ForegroundColor Yellow
  exit 2
}
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8081/health' -TimeoutSec 2 -ErrorAction Stop
  Write-Host 'Локальная модель уже отвечает на 127.0.0.1:8081.' -ForegroundColor Green
  exit 0
} catch { }
$env:GGML_CUDA_NO_VMM = '1'
Write-Host 'Запускаю локальную Qwen3-VL. Это окно должно оставаться открытым, пока работает анализ PNG.' -ForegroundColor Cyan
Write-Host 'Сетевые интерфейсы не открываются: сервер привязан только к 127.0.0.1.'
$gpuLayers = if ($Backend -eq 'cuda12') { '99' } else { '0' }
Push-Location -LiteralPath $Server.DirectoryName
try {
  & $Server.FullName `
    --model $ModelPath `
    --mmproj $ProjectorPath `
    --host 127.0.0.1 `
    --port 8081 `
    --ctx-size 8192 `
    --alias Qwen3VL-2B-Instruct-Q4_K_M `
    --n-gpu-layers $gpuLayers
  if ($LASTEXITCODE -ne 0) { throw "llama-server завершился с кодом $LASTEXITCODE." }
} finally { Pop-Location }
