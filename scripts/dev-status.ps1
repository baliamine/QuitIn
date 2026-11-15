# ---------------------------------------------------------------------------
# QUITIN - environment status report (read-only)
# Usage: npm run dev:status
# ---------------------------------------------------------------------------
. "$PSScriptRoot\dev-lib.ps1"

Write-Banner 'QUITIN - environment status'

$report = Get-PreflightReport
$dbConfig = $report.DbConfig

# ---------------------------------------------------------------------------
# PostgreSQL + database
# ---------------------------------------------------------------------------
Write-Section 'PostgreSQL'

if ($report.PgService) {
  $service = $report.PgService
  $color = 'Red'
  if ($service.Status -eq 'Running') { $color = 'Green' }
  Write-Host "  Service : $($service.Name) - $($service.Status)" -ForegroundColor $color
} else {
  Write-Host '  Service : no Windows PostgreSQL service detected' -ForegroundColor Yellow
}

if ($dbConfig) {
  $portOpen = Test-TcpPort $dbConfig.Port 800
  if ($portOpen) {
    Write-Host "  Port    : $($dbConfig.Port) open" -ForegroundColor Green
  } else {
    Write-Host "  Port    : $($dbConfig.Port) closed" -ForegroundColor Red
  }
  Write-Host "  Target  : $($dbConfig.Host):$($dbConfig.Port)/$($dbConfig.Database) (user $($dbConfig.User))" -ForegroundColor Gray

  if ($portOpen) {
    $reachable = Test-DatabaseReachable -BinDir $report.PgBin -DbConfig $dbConfig
    if ($reachable.Ok) {
      Write-Host '  Connect : OK' -ForegroundColor Green
      $dbExists = Test-DatabaseExists -BinDir $report.PgBin -DbConfig $dbConfig
      if ($dbExists.Exists -eq $true) {
        $tableCount = Get-PublicTableCount -BinDir $report.PgBin -DbConfig $dbConfig
        if ($null -ne $tableCount) {
          Write-Host "  Tables  : $tableCount in schema public" -ForegroundColor Green
        }
      } elseif ($dbExists.Exists -eq $false) {
        Write-Host "  Tables  : database '$($dbConfig.Database)' does not exist" -ForegroundColor Red
      }

      if (Test-PrismaClientGenerated) {
        $drift = Get-SchemaDrift -DbConfig $dbConfig
        if ($drift.Ok) {
          if ($drift.InSync) {
            Write-Host '  Schema  : in sync with prisma/schema.prisma' -ForegroundColor Green
          } else {
            Write-Host '  Schema  : differs from prisma/schema.prisma (run: npm --prefix backend run prisma:push)' -ForegroundColor Yellow
          }
        }
      }
    } else {
      Write-Host "  Connect : FAILED - $($reachable.Message)" -ForegroundColor Red
    }
  }
} else {
  Write-Host '  Target  : DATABASE_URL missing or invalid in backend/.env' -ForegroundColor Red
}

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------
Write-Section 'Backend (NestJS)'

$backendOwner = Get-PortOwner $BackendPort
if ($backendOwner) {
  $processName = Get-ProcessNameSafe $backendOwner
  Write-Host "  Port    : $BackendPort (PID $backendOwner, $processName)" -ForegroundColor Green

  $health = Get-BackendHealth
  if ($health) {
    $healthColor = 'Green'
    if ($health.status -ne 'ok') { $healthColor = 'Red' }
    Write-Host "  Health  : $($health.status) - database $($health.database.status)" -ForegroundColor $healthColor
    Write-Host "  Version : $($health.backend.version) ($($health.backend.environment))" -ForegroundColor Gray
    Write-Host "  Uptime  : $($health.uptimeSeconds)s" -ForegroundColor Gray
    if ($health.database.responseTimeMs -ne $null) {
      Write-Host "  DB time : $($health.database.responseTimeMs) ms" -ForegroundColor Gray
    }
  } else {
    Write-Host '  Health  : no valid answer from /api/health' -ForegroundColor Red
    Write-Host "  Hint    : the process on port $BackendPort may be an old build - run: npm run dev:down, then npm run dev:up" -ForegroundColor Gray
  }
} else {
  Write-Host "  Port    : $BackendPort is free (backend stopped)" -ForegroundColor Yellow
}

$backendState = Read-ServiceState 'backend'
if ($backendState) {
  Write-Host "  Manager : mode $($backendState.mode), started $($backendState.startedAt)" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------
Write-Section 'Frontend (Next.js)'

$frontendOwner = Get-PortOwner $FrontendPort
if ($frontendOwner) {
  $processName = Get-ProcessNameSafe $frontendOwner
  Write-Host "  Port    : $FrontendPort (PID $frontendOwner, $processName)" -ForegroundColor Green

  $page = Invoke-HttpStatus "http://127.0.0.1:$FrontendPort/" 5
  if ($page.Status -eq 200) {
    Write-Host '  HTTP    : 200 OK' -ForegroundColor Green
  } else {
    Write-Host "  HTTP    : $($page.Status)" -ForegroundColor Red
  }

  $proxy = Invoke-HttpStatus "http://127.0.0.1:$FrontendPort/api/health" 5
  if ($proxy.Status -eq 200) {
    Write-Host '  Proxy   : /api -> backend OK' -ForegroundColor Green
  } else {
    Write-Host "  Proxy   : /api -> backend returned $($proxy.Status)" -ForegroundColor Yellow
  }
} else {
  Write-Host "  Port    : $FrontendPort is free (frontend stopped)" -ForegroundColor Yellow
}

$frontendState = Read-ServiceState 'frontend'
if ($frontendState) {
  Write-Host "  Manager : mode $($frontendState.mode), started $($frontendState.startedAt)" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# Process hygiene
# ---------------------------------------------------------------------------
Write-Section 'Processes'

$projectProcesses = @(Get-QuitinProjectProcesses)
if ($projectProcesses.Count -eq 0) {
  Write-Host '  No QUITIN node process found by path (backend may run as "node dist/main.js").' -ForegroundColor Gray
} else {
  foreach ($process in $projectProcesses) {
    $commandLine = $process.CommandLine
    if ($commandLine.Length -gt 100) { $commandLine = $commandLine.Substring(0, 100) + '...' }
    Write-Host "  PID $($process.ProcessId): $commandLine" -ForegroundColor Gray
  }
  if ($projectProcesses.Count -gt 2) {
    Write-Host "  WARNING: $($projectProcesses.Count) QUITIN node processes - possible duplicates. Run: npm run dev:down" -ForegroundColor Yellow
  }
}

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------
Write-Section 'Logs'

foreach ($name in @('backend.out.log', 'backend.err.log', 'frontend.out.log', 'frontend.err.log')) {
  $path = Join-Path $LogDir $name
  $info = Get-LogFileInfo $path
  if ($info.Exists) {
    Write-Host "  $name : $($info.SizeKb) KB, updated $($info.Modified.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
  } else {
    Write-Host "  $name : (not created yet)" -ForegroundColor DarkGray
  }
}

Write-Host ''
Write-Host '  Open logs: npm run dev:logs' -ForegroundColor Gray
Write-Host '  Start:     npm run dev:up' -ForegroundColor Gray
Write-Host '  Stop:      npm run dev:down' -ForegroundColor Gray
Write-Host ''
