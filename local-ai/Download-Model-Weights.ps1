$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ModelsDir = Join-Path $PSScriptRoot 'models'
New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null
$files = @(
  @{ Name='Qwen3VL-2B-Instruct-Q4_K_M.gguf'; Url='https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf'; Sha256='089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae'; Label='Qwen3-VL 2B weights (~1.11 GB)' },
  @{ Name='mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'; Url='https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'; Sha256='f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82'; Label='Vision projector (~445 MB)' }
)
foreach ($file in $files) {
  $destination = Join-Path $ModelsDir $file.Name
  if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $file.Sha256) {
    Write-Host "[OK] $($file.Name) уже скачан и проверен." -ForegroundColor Green
    continue
  }
  if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'curl.exe не найден. Используйте современную Windows или установите curl.' }
  Write-Host "[DOWNLOAD] $($file.Label)" -ForegroundColor Cyan
  $curlArgs = @('--location','--fail','--retry','5','--retry-delay','3','--show-error')
  if (Test-Path -LiteralPath $destination) { $curlArgs += @('--continue-at','-') }
  $curlArgs += @('--output',$destination,$file.Url)
  & curl.exe @curlArgs
  if ($LASTEXITCODE -ne 0) { throw "Загрузка $($file.Name) не завершилась. Повторный запуск продолжит загрузку." }
  $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $file.Sha256) {
    Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
    throw "Контрольная сумма не совпала для $($file.Name). Повреждённый файл удалён. Попробуйте повторить загрузку."
  }
  Write-Host "[OK] SHA-256 подтверждён: $($file.Name)" -ForegroundColor Green
}
Write-Host 'Оба файла модели установлены и проверены. Теперь можно отключить интернет для локального анализа.' -ForegroundColor Green
