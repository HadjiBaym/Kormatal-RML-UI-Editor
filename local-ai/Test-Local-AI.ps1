$ErrorActionPreference = 'Stop'
$ModelDir = Join-Path $PSScriptRoot 'models'
$checks = @(
  @{ Name='Qwen3VL-2B-Instruct-Q4_K_M.gguf'; Hash='089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae' },
  @{ Name='mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'; Hash='f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82' }
)
foreach ($item in $checks) {
  $path = Join-Path $ModelDir $item.Name
  if (-not (Test-Path $path)) { Write-Host "ОТСУТСТВУЕТ: $($item.Name)" -ForegroundColor Yellow; continue }
  $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -eq $item.Hash) { Write-Host "OK: $($item.Name)" -ForegroundColor Green } else { Write-Host "ОШИБКА SHA-256: $($item.Name)" -ForegroundColor Red }
}
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8081/health' -TimeoutSec 3
  Write-Host 'СЕРВЕР: доступен на 127.0.0.1:8081' -ForegroundColor Green
} catch { Write-Host 'СЕРВЕР: не отвечает. Запустите local-ai/Start-Local-AI.ps1.' -ForegroundColor Yellow }
