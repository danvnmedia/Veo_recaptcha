# VEO Token Sync - Version Bump Script
# Usage: .\bump-version.ps1 [major|minor|patch]
# Default: patch (6.1 -> 6.2)

param (
    [ValidateSet("major", "minor", "patch")]
    [string]$type = "patch"
)

$manifestPath = Join-Path $PSScriptRoot "manifest.json"

if (-not (Test-Path $manifestPath)) {
    Write-Error "manifest.json not found!"
    exit 1
}

# Read manifest
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$currentVersion = $manifest.version

# Parse version (format: major.minor or major.minor.patch)
$parts = $currentVersion.Split('.')
$major = [int]$parts[0]
$minor = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
$patch = if ($parts.Length -gt 2) { [int]$parts[2] } else { 0 }

# Bump version
switch ($type) {
    "major" {
        $major++
        $minor = 0
        $patch = 0
    }
    "minor" {
        $minor++
        $patch = 0
    }
    "patch" {
        $patch++
    }
}

# Create new version string
$newVersion = "$major.$minor"
if ($patch -gt 0 -or $parts.Length -gt 2) {
    $newVersion = "$major.$minor.$patch"
}

# Update manifest
$manifest.version = $newVersion

# Write back (preserve formatting)
$json = $manifest | ConvertTo-Json -Depth 10
$json | Set-Content $manifestPath -Encoding UTF8

Write-Host "✅ Version bumped: $currentVersion -> $newVersion" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Reload extension at chrome://extensions"
Write-Host "  2. git add . && git commit -m 'Bump to v$newVersion'"
