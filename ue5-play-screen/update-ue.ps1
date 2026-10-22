$ErrorActionPreference = 'Stop'

$packageDir = $PSScriptRoot
$projectPlay = 'F:\HadjiFiles\UnrealEngineProject\VaCuus_Test\Content\DevUI\Play'
$projectFonts = Join-Path $projectPlay 'fonts'
$projectAssets = Join-Path $projectPlay 'assets'

if (-not (Test-Path -LiteralPath $projectPlay -PathType Container)) {
    throw "The installed Play UI folder is missing: $projectPlay. Run deploy-to-ue.ps1 first."
}
if (-not (Test-Path -LiteralPath $projectFonts -PathType Container)) {
    throw "The installed Play font folder is missing: $projectFonts"
}
if (-not (Test-Path -LiteralPath $projectAssets -PathType Container)) {
    throw "The installed Play asset folder is missing: $projectAssets"
}

foreach ($name in @('play_menu.rml', 'play_menu.rcss', 'play_menu.js', 'vacuus-base.rcss', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $packageDir $name) -Destination (Join-Path $projectPlay $name) -Force
}
Copy-Item -LiteralPath (Join-Path $packageDir 'fonts\Inter-Regular.ttf') -Destination (Join-Path $projectFonts 'Inter-Regular.ttf') -Force
Copy-Item -LiteralPath (Join-Path $packageDir 'fonts\Inter-OFL.txt') -Destination (Join-Path $projectFonts 'Inter-OFL.txt') -Force
Copy-Item -LiteralPath (Join-Path $packageDir 'assets\LamguardLogo.svg') -Destination (Join-Path $projectAssets 'LamguardLogo.svg') -Force
Copy-Item -LiteralPath (Join-Path $packageDir 'assets\LamguardLogo.png') -Destination (Join-Path $projectAssets 'LamguardLogo.png') -Force
Copy-Item -LiteralPath (Join-Path $packageDir 'assets\player_rang.png') -Destination (Join-Path $projectAssets 'player_rang.png') -Force
foreach ($name in @(
    'game-mode-background.png',
    'game-mode-card.png',
    'game-mode-play-button.png',
    'game-mode-play-hover-effect.png',
    'game-mode-separator.png',
    'player-count-icon.png',
    'match-duration-icon.png',
    'change-gamemode-icon.png',
    'map-thumbnail.png',
    'map-thumbnail-card.png'
)) {
    Copy-Item -LiteralPath (Join-Path $packageDir "assets\$name") -Destination (Join-Path $projectAssets $name) -Force
}

# Remove the superseded, fixed-card artwork and composite labels from earlier iterations.
foreach ($name in @('d17-background.png', 'card-scrim.png', 'players-label.png', 'time-label.png', 'chevron.png', 'play-button.png', 'card-dividers.png')) {
    $legacyAsset = Join-Path $projectAssets $name
    if (Test-Path -LiteralPath $legacyAsset -PathType Leaf) {
        Remove-Item -LiteralPath $legacyAsset -Force
    }
}

Write-Output "Updated Play RML/RCSS/JS, header assets, GameMode card/button assets, and static Inter in $projectPlay"
