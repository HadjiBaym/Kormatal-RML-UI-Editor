param(
  [ValidateSet('cpu', 'cuda12')]
  [string]$Backend = 'cpu'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$LocalAiRoot = $PSScriptRoot
$ModelsDir = Join-Path $LocalAiRoot 'models'
$RuntimeDir = Join-Path $LocalAiRoot (Join-Path 'runtime' $Backend)
$TempDir = Join-Path $LocalAiRoot 'temp'
New-Item -ItemType Directory -Force -Path $ModelsDir, $RuntimeDir, $TempDir | Out-Null

function Download-FileVerified([string]$Url, [string]$Destination, [string]$Sha256, [string]$Label) {
  if (Test-Path -LiteralPath $Destination) {
    if ($Sha256) {
      $existing = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($existing -eq $Sha256.ToLowerInvariant()) {
        Write-Host "[OK] $Label уже загружен и проверен." -ForegroundColor Green
        return
      }
    } else {
      Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[INFO] Повреждённый/неполный файл $Label будет докачан или перезаписан." -ForegroundColor Yellow
  }
  if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'Не найден curl.exe. Используйте Windows 10/11 или установите curl.' }
  Write-Host "[DOWNLOAD] $Label" -ForegroundColor Cyan
  $curlArgs = @('--location','--fail','--retry','5','--retry-delay','3','--show-error','--output',$Destination)
  if (Test-Path -LiteralPath $Destination) { $curlArgs = @('--location','--fail','--retry','5','--retry-delay','3','--show-error','--continue-at','-','--output',$Destination) }
  $curlArgs += $Url
  & curl.exe @curlArgs
  if ($LASTEXITCODE -ne 0) { throw "Не удалось скачать $Label (curl exit $LASTEXITCODE). Файл можно докачать повторным запуском скрипта." }
  if ($Sha256) {
    $actual = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Sha256.ToLowerInvariant()) {
      Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
      throw "SHA-256 не совпадает для $Label. Файл удалён; повторите загрузку. Ожидалось $Sha256, получено $actual."
    }
    Write-Host "[OK] SHA-256 подтверждён: $Label" -ForegroundColor Green
  } else {
    Write-Host "[INFO] У источника нет опубликованной SHA-256 для $Label; используется официальный URL релиза." -ForegroundColor Yellow
  }
}

$files = @(
  @{
    Name = 'Qwen3VL-2B-Instruct-Q4_K_M.gguf'
    Url = 'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf'
    Sha256 = '089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae'
    Label = 'Языковая модель Qwen3-VL 2B (около 1,11 ГБ)'
  },
  @{
    Name = 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'
    Url = 'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'
    Sha256 = 'f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82'
    Label = 'Vision-проектор (около 445 МБ)'
  }
)
foreach ($file in $files) {
  Download-FileVerified $file.Url (Join-Path $ModelsDir $file.Name) $file.Sha256 $file.Label
}

# Pinned official release to avoid GitHub REST API calls during installation.
# Runtime download is a direct HTTPS release asset; inference itself never connects to GitHub.
$releaseTag = 'b11711'
$runtimeName = if ($Backend -eq 'cuda12') {
  "llama-$releaseTag-bin-win-cuda-12.4-x64.zip"
} else {
  "llama-$releaseTag-bin-win-cpu-x64.zip"
}
$runtimeUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$releaseTag/$runtimeName"
Write-Host "[INFO] Используется закреплённый официальный runtime llama.cpp $releaseTag ($Backend), без обращения к GitHub API." -ForegroundColor Cyan
$runtimeZip = Join-Path $TempDir $runtimeName
$serverAlreadyInstalled = Get-ChildItem -Path $RuntimeDir -Filter 'llama-server.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $serverAlreadyInstalled) {
  Download-FileVerified $runtimeUrl $runtimeZip '' 'Официальная сборка llama.cpp'
  Write-Host '[EXTRACT] Распаковываю llama.cpp.' -ForegroundColor Cyan
  Expand-Archive -LiteralPath $runtimeZip -DestinationPath $RuntimeDir -Force
  Remove-Item -LiteralPath $runtimeZip -Force -ErrorAction SilentlyContinue
} else {
  Write-Host '[OK] llama.cpp runtime уже установлен; повторная загрузка пропущена.' -ForegroundColor Green
}
if ($Backend -eq 'cuda12') {
  $cudaMarker = Join-Path $RuntimeDir '.cuda12-runtime-installed'
  if (-not (Test-Path -LiteralPath $cudaMarker)) {
    $cudaName = "cudart-llama-bin-win-cuda-12.4-x64.zip"
    $cudaUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$releaseTag/$cudaName"
    $cudaZip = Join-Path $TempDir $cudaName
    Download-FileVerified $cudaUrl $cudaZip '' 'Библиотеки CUDA 12.4 для llama.cpp'
    Expand-Archive -LiteralPath $cudaZip -DestinationPath $RuntimeDir -Force
    Remove-Item -LiteralPath $cudaZip -Force -ErrorAction SilentlyContinue
    Set-Content -LiteralPath $cudaMarker -Value "Installed from official llama.cpp $releaseTag release" -Encoding ASCII
  } else {
    Write-Host '[OK] Библиотеки CUDA 12.4 уже установлены; повторная загрузка пропущена.' -ForegroundColor Green
  }
}
$server = Get-ChildItem -Path $RuntimeDir -Filter 'llama-server.exe' -File -Recurse | Select-Object -First 1
if (-not $server) { throw 'После распаковки llama.cpp файл llama-server.exe не найден.' }
Write-Host "[INFO] Runtime получен с официального HTTPS-релиза llama.cpp $releaseTag. Для модели и vision-проектора SHA-256 проверены обязательно; конкретный релизный архив не публикует встроенную в этот скрипт контрольную сумму." -ForegroundColor Yellow
Write-Host ''
Write-Host 'Установка завершена.' -ForegroundColor Green
Write-Host "Модель: $ModelsDir"
Write-Host "Runtime: $($server.FullName)"
Write-Host 'Следующий шаг: powershell -ExecutionPolicy Bypass -File .\local-ai\Start-Local-AI.ps1'
Write-Host 'После установки модели можно работать без интернета; инференс доступен только на 127.0.0.1:8081.'
