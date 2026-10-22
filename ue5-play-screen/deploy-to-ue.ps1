$ErrorActionPreference = 'Stop'

$packageDir = $PSScriptRoot
$projectDevUi = 'F:\HadjiFiles\UnrealEngineProject\VaCuus_Test\Content\DevUI'
$destination = Join-Path $projectDevUi 'Play'

if (-not (Test-Path -LiteralPath $projectDevUi -PathType Container)) {
    throw "Project DevUI root is missing: $projectDevUi"
}
if (Test-Path -LiteralPath $destination) {
    throw "Refusing to overwrite an existing Play folder: $destination"
}

New-Item -ItemType Directory -Path $destination | Out-Null
Copy-Item -LiteralPath (Join-Path $packageDir 'assets') -Destination $destination -Recurse
Copy-Item -LiteralPath (Join-Path $packageDir 'fonts') -Destination $destination -Recurse
Copy-Item -LiteralPath (Join-Path $packageDir 'play_menu.rml'),
    (Join-Path $packageDir 'play_menu.rcss'),
    (Join-Path $packageDir 'play_menu.js'),
    (Join-Path $packageDir 'vacuus-base.rcss'),
    (Join-Path $packageDir 'README.md') -Destination $destination

Write-Output "Installed Play menu to $destination"
