[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Keystore,
    [Parameter(Mandatory = $true)] [string] $Alias,
    [string] $Apk = (Join-Path $PSScriptRoot "Orbit-Escape-1.3.0-unsigned.apk"),
    [string] $Output = (Join-Path $PSScriptRoot "Orbit-Escape-1.3.0-release.apk"),
    [string] $BuildTools
)

$ErrorActionPreference = "Stop"
$expected = "e667e50cc622082aed87a11ed0bc344287d730c8f231f87e44d23486a5e467b4"

if (!$BuildTools) {
    $sdk = $env:ANDROID_SDK_ROOT
    if (!$sdk) { $sdk = $env:ANDROID_HOME }
    if (!$sdk -and $env:LOCALAPPDATA) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    if (!$sdk) { throw "Pass -BuildTools with the Android SDK Build Tools directory." }
    $toolsDir = Get-ChildItem -Path (Join-Path $sdk "build-tools") -Directory |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    if (!$toolsDir) { throw "Install Android SDK Build Tools 36 in Android Studio SDK Manager." }
    $BuildTools = $toolsDir.FullName
}

$signer = Join-Path $BuildTools "apksigner.bat"
if (!(Test-Path -LiteralPath $signer -PathType Leaf)) { throw "apksigner.bat is missing from -BuildTools." }
if (!(Get-Command java.exe -ErrorAction SilentlyContinue) -and !$env:JAVA_HOME) {
    $studio = Join-Path $env:ProgramFiles "Android\Android Studio\jbr"
    if (Test-Path -LiteralPath (Join-Path $studio "bin\java.exe")) { $env:JAVA_HOME = $studio }
}
$inputApk = (Resolve-Path -LiteralPath $Apk).Path
$sourceKey = (Resolve-Path -LiteralPath $Keystore).Path
$outFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
if (Test-Path -LiteralPath $outFile) { throw "Output already exists. Choose a different -Output or move it first." }
$temp = "$outFile.$([guid]::NewGuid().ToString('N')).tmp"
try {
    & $signer sign --ks $sourceKey --ks-key-alias $Alias --v4-signing-enabled false --out $temp $inputApk
    if ($LASTEXITCODE -ne 0) { throw "Signing failed. Check the keystore, alias and local passwords." }
    $certs = & $signer verify --verbose --print-certs $temp
    if ($LASTEXITCODE -ne 0) { throw "The APK signature did not verify." }
    $matchesPublicKey = $certs | Where-Object { $_.Trim() -eq "Signer #1 certificate SHA-256 digest: $expected" }
    if (!$matchesPublicKey) { throw "The signer differs from the APK already distributed by RuStore. Check the keystore and alias." }
    [System.IO.File]::Move($temp, $outFile)
    Write-Output "Verified update: $outFile"
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
}
