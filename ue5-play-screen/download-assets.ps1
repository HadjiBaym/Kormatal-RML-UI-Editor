$ErrorActionPreference = 'Stop'

$packageDir = $PSScriptRoot
$assetDir = Join-Path $packageDir 'assets'
$fontDir = Join-Path $packageDir 'fonts'
New-Item -ItemType Directory -Force -Path $assetDir, $fontDir | Out-Null

$assets = @(
    @{ Name = 'map-thumbnail.png'; Url = 'https://www.figma.com/api/mcp/asset/8782c25b-af5a-44c5-883d-4233b84a9e72/bd613.png' },
    @{ Name = 'logo-mark-back.png'; Url = 'https://www.figma.com/api/mcp/asset/3752b0b5-de9a-4ed4-b200-41c0511abde8.png' },
    @{ Name = 'logo-mark-front.png'; Url = 'https://www.figma.com/api/mcp/asset/e7413b86-9ca9-4b64-9980-1b885029e7dc.png' },
    @{ Name = 'bottom-actions.png'; Url = 'https://www.figma.com/api/mcp/asset/1cbeae07-593d-46c1-ac13-6e67ead78f92.png' },
    @{ Name = 'profile-avatar.png'; Url = 'https://www.figma.com/api/mcp/asset/0948a267-4108-4194-86a2-c7a56a66691f.png' },
    @{ Name = 'Inter-OFL.txt'; Url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt' }
)

foreach ($asset in $assets) {
    $destination = if ($asset.Name.EndsWith('.ttf') -or $asset.Name.EndsWith('.txt')) {
        Join-Path $fontDir $asset.Name
    } else {
        Join-Path $assetDir $asset.Name
    }
    & curl.exe -L --fail --silent --show-error --output $destination $asset.Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $($asset.Name)" }
}

& (Join-Path $packageDir 'prepare-map-thumbnail.ps1')

# Preserve the current Figma node's individual source layers for accurate asset comparison.
$figmaSourceDir = Join-Path $assetDir 'figma-source-457-8'
New-Item -ItemType Directory -Force -Path $figmaSourceDir | Out-Null
$figmaAssets = @(
    @{ Name = 'game-mode-background-source.png'; Url = 'https://www.figma.com/api/mcp/asset/9d12ef15-70c2-4b93-b0a3-41bf32b03040/d410d.png' },
    @{ Name = 'player-level.png'; Url = 'https://www.figma.com/api/mcp/asset/21811dc2-d431-43e8-84b8-594de0fcff21/043ef.png' },
    @{ Name = 'logo-mark-back.svg'; Url = 'https://www.figma.com/api/mcp/asset/21811dc2-d431-43e8-84b8-594de0fcff21/a379b.svg' },
    @{ Name = 'logo-mark-front.svg'; Url = 'https://www.figma.com/api/mcp/asset/21811dc2-d431-43e8-84b8-594de0fcff21/0afbc.svg' },
    @{ Name = 'header-divider.svg'; Url = 'https://www.figma.com/api/mcp/asset/21811dc2-d431-43e8-84b8-594de0fcff21/82ff5.svg' },
    @{ Name = 'game-mode-card-overlay.svg'; Url = 'https://www.figma.com/api/mcp/asset/9d12ef15-70c2-4b93-b0a3-41bf32b03040/5d9d4.svg' },
    @{ Name = 'player-count-icon.svg'; Url = 'https://www.figma.com/api/mcp/asset/9d12ef15-70c2-4b93-b0a3-41bf32b03040/54b69.svg' },
    @{ Name = 'match-duration-icon.svg'; Url = 'https://www.figma.com/api/mcp/asset/9d12ef15-70c2-4b93-b0a3-41bf32b03040/f51af.svg' },
    @{ Name = 'change-gamemode-icon.svg'; Url = 'https://www.figma.com/api/mcp/asset/9d12ef15-70c2-4b93-b0a3-41bf32b03040/01867.svg' },
    @{ Name = 'game-mode-separator.svg'; Url = 'https://www.figma.com/api/mcp/asset/9d12ef15-70c2-4b93-b0a3-41bf32b03040/64bd9.svg' },
    @{ Name = 'stats-vertical-divider.svg'; Url = 'https://www.figma.com/api/mcp/asset/9d12ef15-70c2-4b93-b0a3-41bf32b03040/a7ee9.svg' },
    @{ Name = 'game-mode-play-button.svg'; Url = 'https://www.figma.com/api/mcp/asset/4c050c2c-4624-4d18-97f9-d2188e51de88/ca78a.svg' },
    @{ Name = 'game-mode-play-hover-effect.svg'; Url = 'https://www.figma.com/api/mcp/asset/4c050c2c-4624-4d18-97f9-d2188e51de88/b961f.svg' },
    @{ Name = 'bottom-actions.svg'; Url = 'https://www.figma.com/api/mcp/asset/21811dc2-d431-43e8-84b8-594de0fcff21/9b423.svg' }
)
foreach ($asset in $figmaAssets) {
    $destination = Join-Path $figmaSourceDir $asset.Name
    & curl.exe -L --fail --silent --show-error --output $destination $asset.Url
    if ($LASTEXITCODE -ne 0) { throw "Figma source asset download failed: $($asset.Name)" }
}

# VaCuus uses static font faces; variable axes are not selected by its RmlUi runtime.
$interArchive = Join-Path $fontDir 'Inter-4.1.zip'
& curl.exe -L --fail --silent --show-error --output $interArchive 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip'
if ($LASTEXITCODE -ne 0) { throw 'Download failed: Inter 4.1 release archive' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($interArchive)
try {
    $regularFace = $archive.GetEntry('extras/ttf/Inter-Regular.ttf')
    $license = $archive.GetEntry('LICENSE.txt')
    if ($null -eq $regularFace -or $null -eq $license) { throw 'Inter archive did not contain the expected static face and license.' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($regularFace, (Join-Path $fontDir 'Inter-Regular.ttf'), $true)
    [IO.Compression.ZipFileExtensions]::ExtractToFile($license, (Join-Path $fontDir 'Inter-OFL.txt'), $true)
}
finally {
    $archive.Dispose()
    Remove-Item -LiteralPath $interArchive -Force
}

$converterFontDir = Join-Path (Split-Path $packageDir -Parent) 'public\fonts'
foreach ($fontName in @('Onest-Regular.ttf', 'Onest-Medium.ttf', 'Onest-Bold.ttf', 'LICENSE-Onest-OFL.txt')) {
    Copy-Item -LiteralPath (Join-Path $converterFontDir $fontName) -Destination (Join-Path $fontDir $fontName) -Force
}

Write-Output "Downloaded $($assets.Count) Figma/font assets, $($figmaAssets.Count) current-node assets, static Inter, and Onest in $packageDir"
