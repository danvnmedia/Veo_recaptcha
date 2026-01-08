# VEO Batch Processor - Auto Version Build Script
# Run this before reloading extension to auto-increment version

param(
    [switch]$Major,    # Increment major version (X.0)
    [switch]$Minor,    # Increment minor version (x.X) - default
    [switch]$Patch     # Increment patch version (x.x.X)
)

$manifestPath = Join-Path $PSScriptRoot "manifest.json"

# Read manifest
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

# Parse current version
$currentVersion = $manifest.version
$versionParts = $currentVersion -split '\.'

# Handle different version formats
$majorV = [int]$versionParts[0]
$minorV = if ($versionParts.Count -gt 1) { [int]$versionParts[1] } else { 0 }
$patchV = if ($versionParts.Count -gt 2) { [int]$versionParts[2] } else { 0 }

# Increment version
if ($Major) {
    $majorV++
    $minorV = 0
    $patchV = 0
} elseif ($Patch) {
    $patchV++
} else {
    # Default: Minor increment
    $minorV++
    $patchV = 0
}

# Build new version string
$newVersion = "$majorV.$minorV"
if ($patchV -gt 0 -or $Patch) {
    $newVersion = "$majorV.$minorV.$patchV"
}

# Update manifest
$manifest.version = $newVersion
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8

# Update interceptor.js version comment
$interceptorPath = Join-Path $PSScriptRoot "interceptor.js"
$interceptorContent = Get-Content $interceptorPath -Raw
$interceptorContent = $interceptorContent -replace "v\d+\.\d+(\.\d+)?", "v$newVersion"
$interceptorContent | Set-Content $interceptorPath -Encoding UTF8

# Update labs_content.js version
$labsContentPath = Join-Path $PSScriptRoot "labs_content.js"
$labsContent = Get-Content $labsContentPath -Raw
$labsContent = $labsContent -replace "v\d+\.\d+(\.\d+)?", "v$newVersion"
$labsContent | Set-Content $labsContentPath -Encoding UTF8

# Output
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " VEO Batch Processor" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Version: $currentVersion -> $newVersion" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to chrome://extensions" -ForegroundColor White
Write-Host "2. Click Reload on 'VEO Batch Processor'" -ForegroundColor White
Write-Host "3. Refresh labs.google page" -ForegroundColor White
Write-Host ""

# Return new version
return $newVersion
