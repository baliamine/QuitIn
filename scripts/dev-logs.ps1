# ---------------------------------------------------------------------------
# QUITIN - inspect the manager logs
# Usage:
#   npm run dev:logs
#   npm run dev:logs -- -Service backend -Tail 120
#   npm run dev:logs -- -Service backend -Follow
# ---------------------------------------------------------------------------
param(
  [ValidateSet('all', 'backend', 'frontend')]
  [string]$Service = 'all',
  [int]$Tail = 80,
  [switch]$Follow
)

. "$PSScriptRoot\dev-lib.ps1"

Write-Banner 'QUITIN - logs'

$files = @()
if ($Service -eq 'all' -or $Service -eq 'backend') {
  $files += (Join-Path $LogDir 'backend.out.log')
  $files += (Join-Path $LogDir 'backend.err.log')
}
if ($Service -eq 'all' -or $Service -eq 'frontend') {
  $files += (Join-Path $LogDir 'frontend.out.log')
  $files += (Join-Path $LogDir 'frontend.err.log')
}

$existing = @($files | Where-Object { Test-Path $_ })
if ($existing.Count -eq 0) {
  Write-Warn 'No log files yet. Start the environment first: npm run dev:up'
  Write-Host ''
  Write-Host "  Log folder: $LogDir" -ForegroundColor Gray
  exit 0
}

Write-Host "  Log folder: $LogDir" -ForegroundColor Gray
foreach ($file in $existing) {
  $info = Get-LogFileInfo $file
  Write-Host "  $([System.IO.Path]::GetFileName($file)) : $($info.SizeKb) KB, updated $($info.Modified.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor DarkGray
}

if ($Follow) {
  Write-Host ''
  Write-Host '  Following logs - press Ctrl+C to stop.' -ForegroundColor Yellow
  Write-Host ''
  Get-Content -Path $existing -Tail $Tail -Wait
} else {
  foreach ($file in $existing) {
    Write-Host ''
    Write-Host ('-' * 66) -ForegroundColor DarkGray
    Write-Host "  $file" -ForegroundColor Cyan
    Write-Host ('-' * 66) -ForegroundColor DarkGray
    Get-Content -Path $file -Tail $Tail -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Host "  $_"
    }
  }
  Write-Host ''
  Write-Host "  Live follow: npm run dev:logs -- -Service $Service -Follow" -ForegroundColor Gray
  Write-Host ''
}
