param(
  [string]$Source = "icon\ChatGPT Image May 19, 2026, 12_39_31 AM.png"
)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Resolve-Path "."
$sourcePath = Resolve-Path $Source
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$resRoot = Join-Path $root "android\app\src\main\res"

$densities = @(
  @{ Name = "mipmap-mdpi"; Legacy = 48; Foreground = 108 },
  @{ Name = "mipmap-hdpi"; Legacy = 72; Foreground = 162 },
  @{ Name = "mipmap-xhdpi"; Legacy = 96; Foreground = 216 },
  @{ Name = "mipmap-xxhdpi"; Legacy = 144; Foreground = 324 },
  @{ Name = "mipmap-xxxhdpi"; Legacy = 192; Foreground = 432 }
)

function New-IconBitmap {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [bool]$Round = $false,
    [double]$Inset = 0.0
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  if ($Round) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $Size, $Size)
    $graphics.SetClip($path)
  }

  $drawSize = [int][Math]::Round($Size * (1.0 - $Inset * 2.0))
  $offset = [int][Math]::Round(($Size - $drawSize) / 2.0)
  $graphics.DrawImage($Image, $offset, $offset, $drawSize, $drawSize)
  $graphics.Dispose()

  return $bitmap
}

try {
  foreach ($density in $densities) {
    $dir = Join-Path $resRoot $density.Name
    New-Item -ItemType Directory -Force $dir | Out-Null

    $legacy = New-IconBitmap -Image $sourceImage -Size $density.Legacy
    $legacy.Save((Join-Path $dir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $legacy.Dispose()

    $round = New-IconBitmap -Image $sourceImage -Size $density.Legacy -Round $true
    $round.Save((Join-Path $dir "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $round.Dispose()

    $foreground = New-IconBitmap -Image $sourceImage -Size $density.Foreground -Inset 0.04
    $foreground.Save((Join-Path $dir "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $foreground.Dispose()
  }

  Write-Host "Generated Android launcher icons from $Source"
} finally {
  $sourceImage.Dispose()
}
