$ErrorActionPreference = 'Stop'

$assetDir = Join-Path $PSScriptRoot 'assets'
$sourcePath = Join-Path $assetDir 'map-thumbnail.png'
$outputPath = Join-Path $assetDir 'map-thumbnail-card.png'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Figma map thumbnail is missing: $sourcePath"
}

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($sourcePath)
$bitmap = [System.Drawing.Bitmap]::new(718, 366)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    # Exact Figma image geometry: 512x288 at (-35,-4) within a 359x183 card.
    # Pre-crop the same visible region so RmlUi never draws outside the card bounds.
    $sourceRect = [System.Drawing.Rectangle]::new(131, 15, 1346, 686)
    $destinationRect = [System.Drawing.Rectangle]::new(0, 0, 718, 366)
    $graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
}

Write-Output "Prepared 2x card-sized Figma map thumbnail: $outputPath"
