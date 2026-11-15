# ---------------------------------------------------------------------------
# QUITIN - stop the development processes started by the manager
# Usage:
#   npm run dev:down                     # stops backend + frontend only
#   npm run dev:down -- -WithPostgres    # also stops the PostgreSQL service
#
# Safety rules:
#   - only processes that are verified as QUITIN are stopped
#   - PostgreSQL is never stopped unless -WithPostgres is passed
#   - unrelated applications are reported, never killed
# ---------------------------------------------------------------------------
param(
  [switch]$WithPostgres
)

. "$PSScriptRoot\dev-lib.ps1"

Write-Banner 'QUITIN - stopping the environment'

$stopped = 0

# ---------------------------------------------------------------------------
# 1. Processes recorded by the manager (.run/*.json)
# ---------------------------------------------------------------------------
foreach ($role in @('frontend', 'backend')) {
  $state = Read-ServiceState $role
  if (-not $state) { continue }

  $processId = [int]$state.pid
  $processName = Get-ProcessNameSafe $processId

  if (-not $processName) {
    Write-Info "$role was already stopped (recorded PID $processId is gone)."
    Remove-ServiceState $role
    continue
  }

  $port = $FrontendPort
  if ($role -eq 'backend') { $port = $BackendPort }
  $owner = Get-PortOwner $port

  $verified = (Test-QuitinProcess $processId) -or ($owner -eq $processId) -or ($state.mode -eq 'reused' -and $owner -eq $processId)
  if (-not $verified) {
    Write-Warn "Recorded $role PID $processId no longer looks like QUITIN - leaving it alone."
    Remove-ServiceState $role
    continue
  }

  $result = @(Stop-QuitinProcessTree -ProcessId $processId -Role $role)
  if ($result.Count -gt 0) { $stopped++ }
  Remove-ServiceState $role
}

# ---------------------------------------------------------------------------
# 2. QUITIN node processes found by project path (e.g. next dev / next start)
# ---------------------------------------------------------------------------
$projectProcesses = @(Get-QuitinProjectProcesses)
foreach ($process in $projectProcesses) {
  $processName = Get-ProcessNameSafe $process.ProcessId
  if (-not $processName) { continue }
  Write-Info "Stopping extra QUITIN process PID $($process.ProcessId)"
  $result = @(Stop-QuitinProcessTree -ProcessId $process.ProcessId -Role 'extra QUITIN')
  if ($result.Count -gt 0) { $stopped++ }
}

# ---------------------------------------------------------------------------
# 3. Leftover backend/frontend servers started outside the manager
#    (verified through the HTTP identity of the app, never guessed)
# ---------------------------------------------------------------------------
foreach ($port in @($BackendPort, $FrontendPort)) {
  $owner = Get-PortOwner $port
  if (-not $owner) { continue }

  if (Test-QuitinProcess $owner) { continue }

  $isQuitin = $false
  if ($port -eq $BackendPort) { $isQuitin = Test-QuitinBackendIdentity }
  if ($port -eq $FrontendPort) { $isQuitin = Test-QuitinFrontendIdentity }

  if ($isQuitin) {
    $processName = Get-ProcessNameSafe $owner
    Write-Info "Verified QUITIN service on port $port ($processName, PID $owner) - stopping it."
    $result = @(Stop-QuitinProcessTree -ProcessId $owner -Role "QUITIN on port $port")
    if ($result.Count -gt 0) { $stopped++ }
  } else {
    $processName = Get-ProcessNameSafe $owner
    Write-Warn "Port $port is held by PID $owner ($processName) which is not verified as QUITIN - leaving it alone."
    Write-Info "If you are sure, stop it manually: Stop-Process -Id $owner"
  }
}

# ---------------------------------------------------------------------------
# 4. PostgreSQL (only with explicit permission)
# ---------------------------------------------------------------------------
if ($WithPostgres) {
  Write-Section 'PostgreSQL'
  $service = Get-PostgresService
  if ($service -and $service.Status -eq 'Running') {
    try {
      Stop-Service -Name $service.Name -ErrorAction Stop
      Write-Ok "Stopped Windows service '$($service.Name)'"
    } catch {
      Write-Fail "Could not stop '$($service.Name)': $($_.Exception.Message)"
      Write-Info "Run PowerShell as Administrator and retry: Stop-Service $($service.Name)"
    }
  } else {
    $dockerContainer = $null
    try {
      $dockerContainer = & docker ps --filter 'name=quitin-postgres' --format '{{.ID}}' 2>$null
    } catch { }
    if ($dockerContainer) {
      & docker compose down 2>&1 | ForEach-Object { Write-Info ([string]$_) }
      Write-Ok 'Stopped the Docker PostgreSQL container'
    } else {
      Write-Info 'PostgreSQL is not running (or was not started by QUITIN).'
    }
  }
} else {
  Write-Info 'PostgreSQL was left running. Use "npm run dev:down -- -WithPostgres" to stop it too.'
}

# ---------------------------------------------------------------------------
# 5. Verify ports are free
# ---------------------------------------------------------------------------
Start-Sleep -Milliseconds 800

$stillBusy = @()
foreach ($port in @($BackendPort, $FrontendPort)) {
  if (Test-TcpPort $port 500) { $stillBusy += $port }
}

Write-Host ''
if ($stillBusy.Count -eq 0) {
  Write-Ok "Backend ($BackendPort) and frontend ($FrontendPort) ports are free."
} else {
  Write-Warn "Port(s) still in use: $($stillBusy -join ', '). Run: npm run dev:status"
}

if ($stopped -eq 0 -and $stillBusy.Count -eq 0) {
  Write-Info 'Nothing was running.'
}

Write-Host ''
Write-Host '  Restart with: npm run dev:up' -ForegroundColor Gray
Write-Host ''
