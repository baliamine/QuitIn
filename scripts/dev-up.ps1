# ---------------------------------------------------------------------------
# QUITIN - start the full development environment
# Usage:
#   npm run dev:up            # dev mode (watch + hot reload)
#   npm run dev:up -- -Prod   # production-like mode (build + start)
# ---------------------------------------------------------------------------
param(
  [switch]$Prod
)

. "$PSScriptRoot\dev-lib.ps1"

$mode = 'dev'
if ($Prod -or $env:QUITIN_MODE -eq 'prod') { $mode = 'prod' }

function Stop-WithError([string]$Message, [string]$Fix = '') {
  Write-Fail $Message
  if ($Fix) { Write-Info "Fix: $Fix" }
  Write-Host ''
  Write-Host 'Environment was NOT started.' -ForegroundColor Red
  exit 1
}

Write-Banner "QUITIN - starting the environment ($mode mode)"

# ---------------------------------------------------------------------------
# 0. Create missing env files from the examples (never overwrites)
# ---------------------------------------------------------------------------
$backendEnvPath = Join-Path $BackendDir '.env'
$backendExamplePath = Join-Path $BackendDir '.env.example'
$frontendEnvPath = Join-Path $FrontendDir '.env.local'
$frontendExamplePath = Join-Path $FrontendDir '.env.local.example'

if (-not (Test-Path $backendEnvPath) -and (Test-Path $backendExamplePath)) {
  Copy-Item $backendExamplePath $backendEnvPath
  Write-Warn 'backend/.env did not exist - created it from backend/.env.example.'
  Write-Warn 'Review JWT_SECRET and DATABASE_URL in backend/.env before using this in production.'
}
if (-not (Test-Path $frontendEnvPath) -and (Test-Path $frontendExamplePath)) {
  Copy-Item $frontendExamplePath $frontendEnvPath
  Write-Info 'frontend/.env.local did not exist - created it from frontend/.env.local.example.'
}

# ---------------------------------------------------------------------------
# 1. Preflight
# ---------------------------------------------------------------------------
Write-Section '[1/7] Checking configuration'

$report = Get-PreflightReport
$blocking = @($report.Problems | Where-Object { $_ -notmatch 'Prisma Client is not generated' })

if ($blocking.Count -gt 0) {
  foreach ($problem in $blocking) { Write-Fail $problem }
  Stop-WithError 'Configuration is incomplete.' 'Fix the items above, then run: npm run dev:check'
}

$dbConfig = $report.DbConfig
if (-not $dbConfig) {
  Stop-WithError 'DATABASE_URL is missing or invalid in backend/.env.' 'Copy backend/.env.example and set DATABASE_URL.'
}

$passwordNote = 'no password'
if ($dbConfig.HasPassword) { $passwordNote = 'password hidden' }
Write-Ok "Database target: $($dbConfig.Host):$($dbConfig.Port)/$($dbConfig.Database) ($passwordNote)"

# ---------------------------------------------------------------------------
# 2. PostgreSQL
# ---------------------------------------------------------------------------
Write-Section '[2/7] PostgreSQL'

if (Test-TcpPort $dbConfig.Port 1000) {
  Write-Ok "PostgreSQL is already listening on port $($dbConfig.Port)"
} else {
  $service = $report.PgService
  if ($service) {
    Write-Step "Starting Windows service '$($service.Name)'..."
    try {
      Start-Service -Name $service.Name -ErrorAction Stop
    } catch {
      Stop-WithError "Could not start service '$($service.Name)': $($_.Exception.Message)" `
        "Open PowerShell as Administrator and run: Start-Service $($service.Name)"
    }
  } else {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
      Write-Step 'No PostgreSQL service found - trying Docker (docker compose up -d postgres)...'
      try {
        & docker compose up -d postgres 2>&1 | ForEach-Object { Write-Info ([string]$_) }
      } catch {
        Stop-WithError "Docker could not start PostgreSQL: $($_.Exception.Message)" 'Install PostgreSQL 16 or start Docker Desktop, then retry.'
      }
    } else {
      Stop-WithError 'PostgreSQL is not running and no Windows service or Docker was found.' `
        'Install PostgreSQL 16, or start Docker Desktop and run: npm run db:up'
    }
  }

  $deadline = (Get-Date).AddSeconds(40)
  while ((Get-Date) -lt $deadline -and -not (Test-TcpPort $dbConfig.Port 1000)) {
    Start-Sleep -Milliseconds 750
  }
  if (-not (Test-TcpPort $dbConfig.Port 1000)) {
    Stop-WithError "PostgreSQL did not open port $($dbConfig.Port) within 40 seconds." `
      'Check the PostgreSQL service logs, or run: npm run dev:status'
  }
  Write-Ok "PostgreSQL is listening on port $($dbConfig.Port)"
}

# ---------------------------------------------------------------------------
# 3. Database + schema
# ---------------------------------------------------------------------------
Write-Section '[3/7] Database'

$dbReachable = Test-DatabaseReachable -BinDir $report.PgBin -DbConfig $dbConfig
if (-not $dbReachable.Ok) {
  Stop-WithError $dbReachable.Message 'Verify DATABASE_URL in backend/.env and that PostgreSQL is running.'
}
Write-Ok $dbReachable.Message

$dbExists = Test-DatabaseExists -BinDir $report.PgBin -DbConfig $dbConfig
if ($dbExists.Exists -eq $false) {
  if (-not $report.PgBin) {
    Stop-WithError "Database '$($dbConfig.Database)' does not exist and psql is unavailable to create it." `
      "Create it manually: createdb -h $($dbConfig.Host) -p $($dbConfig.Port) -U $($dbConfig.User) $($dbConfig.Database)"
  }
  Write-Step "Database '$($dbConfig.Database)' does not exist - creating it (existing data is never touched)..."
  $create = Invoke-PsqlScalar -BinDir $report.PgBin -DbHost $dbConfig.Host -Port $dbConfig.Port `
    -User $dbConfig.User -Database 'postgres' `
    -Sql "CREATE DATABASE `"$($dbConfig.Database)`"" -Password $dbConfig.Password
  if (-not $create.Ok) {
    Stop-WithError "Could not create database '$($dbConfig.Database)': $($create.Output)" 'Create it manually with pgAdmin or psql.'
  }
  $dbExists = [pscustomobject]@{ Exists = $true; Ok = $true; Message = '' }
  Write-Ok "Created database '$($dbConfig.Database)'"
}

$tableCount = Get-PublicTableCount -BinDir $report.PgBin -DbConfig $dbConfig
if ($null -ne $tableCount -and $tableCount -eq 0) {
  Write-Step 'Database is empty - applying prisma/schema.prisma (additive, no data loss)...'
  $push = Invoke-Prisma -Arguments @('db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate')
  if (-not $push.Ok) {
    Stop-WithError "Could not create the database schema: $($push.Output)" 'Run manually: npm --prefix backend run prisma:push'
  }
  Write-Ok 'Schema applied'
} elseif ($null -ne $tableCount) {
  Write-Ok "$tableCount tables found in schema public"
}

# ---------------------------------------------------------------------------
# 4. Prisma Client
# ---------------------------------------------------------------------------
Write-Section '[4/7] Prisma'

$schemaPath = Join-Path $BackendDir 'prisma\schema.prisma'
$clientIndex = Join-Path $BackendDir 'node_modules\.prisma\client\index.js'
$needGenerate = -not (Test-Path $clientIndex)
if (-not $needGenerate -and (Test-Path $schemaPath)) {
  if ((Get-Item $schemaPath).LastWriteTime -gt (Get-Item $clientIndex).LastWriteTime) {
    $needGenerate = $true
  }
}

if ($needGenerate) {
  Write-Step 'Generating Prisma Client...'
  $generate = Invoke-Prisma -Arguments @('generate', '--schema', 'prisma/schema.prisma')
  if (-not $generate.Ok) {
    Stop-WithError "Prisma Client generation failed: $($generate.Output)" 'Run manually: npm run prisma:generate'
  }
  Write-Ok 'Prisma Client generated'
} else {
  Write-Ok 'Prisma Client is up to date'
}

$drift = Get-SchemaDrift -DbConfig $dbConfig
if ($drift.Ok -and -not $drift.InSync) {
  Write-Warn 'Database schema differs from prisma/schema.prisma.'
  Write-Info 'Review with: npm --prefix backend run prisma:push (the manager never changes your schema automatically).'
}

# ---------------------------------------------------------------------------
# 5. Ports
# ---------------------------------------------------------------------------
Write-Section '[5/7] Ports'

$reuseBackend = $false
$reuseFrontend = $false

$backendRole = Resolve-PortRole $BackendPort
$backendOwner = Get-PortOwner $BackendPort
if ($backendRole -eq 'unknown') {
  $processName = Get-ProcessNameSafe $backendOwner
  $commandLine = Get-ProcessCommandLine $backendOwner
  Write-Fail "Port $BackendPort is used by another application ($processName, PID $backendOwner)."
  Write-Info "Command: $commandLine"
  Stop-WithError 'Refusing to kill an unrelated process.' `
    "Stop PID $backendOwner yourself, or change the backend port in backend/.env and the manager scripts."
} elseif ($backendRole -eq 'quitin') {
  $reuseBackend = $true
  Write-Ok "Backend already running on port $BackendPort (PID $backendOwner) - reusing it"
  Save-ServiceState 'backend' ([pscustomobject]@{
    role      = 'backend'
    pid       = $backendOwner
    port      = $BackendPort
    mode      = 'reused'
    startedAt = (Get-Date).ToString('o')
    command   = 'reused existing QUITIN backend'
    stdout    = (Join-Path $LogDir 'backend.out.log')
    stderr    = (Join-Path $LogDir 'backend.err.log')
  })
} else {
  Write-Ok "Port $BackendPort is free"
}

$frontendRole = Resolve-PortRole $FrontendPort
$frontendOwner = Get-PortOwner $FrontendPort
if ($frontendRole -eq 'unknown') {
  $processName = Get-ProcessNameSafe $frontendOwner
  $commandLine = Get-ProcessCommandLine $frontendOwner
  Write-Fail "Port $FrontendPort is used by another application ($processName, PID $frontendOwner)."
  Write-Info "Command: $commandLine"
  Stop-WithError 'Refusing to kill an unrelated process.' `
    "Stop PID $frontendOwner yourself, or free port $FrontendPort."
} elseif ($frontendRole -eq 'quitin') {
  $reuseFrontend = $true
  Write-Ok "Frontend already running on port $FrontendPort (PID $frontendOwner) - reusing it"
  Save-ServiceState 'frontend' ([pscustomobject]@{
    role      = 'frontend'
    pid       = $frontendOwner
    port      = $FrontendPort
    mode      = 'reused'
    startedAt = (Get-Date).ToString('o')
    command   = 'reused existing QUITIN frontend'
    stdout    = (Join-Path $LogDir 'frontend.out.log')
    stderr    = (Join-Path $LogDir 'frontend.err.log')
  })
} else {
  Write-Ok "Port $FrontendPort is free"
}

# Stop duplicate QUITIN node processes that are not serving a port (e.g. a
# forgotten `next dev` next to a `next start`). Verified by project path.
$portOwners = @($backendOwner, $frontendOwner) | Where-Object { $_ }
$duplicates = @(Get-QuitinProjectProcesses | Where-Object { $portOwners -notcontains $_.ProcessId })
if ($duplicates.Count -gt 0) {
  Write-Warn "Found $($duplicates.Count) extra QUITIN process(es) not serving a port - cleaning them up."
  foreach ($duplicate in $duplicates) {
    Stop-QuitinProcessTree -ProcessId $duplicate.ProcessId -Role 'duplicate'
  }
}

# ---------------------------------------------------------------------------
# 6. Start backend
# ---------------------------------------------------------------------------
Write-Section '[6/7] Backend'

if ($reuseBackend) {
  $health = Get-BackendHealth
  if (-not $health) {
    Stop-WithError 'A process is on port 4000 but the health endpoint does not answer.' 'Run: npm run dev:down, then: npm run dev:up'
  }
  Write-Ok "Backend health: $($health.status) (database: $($health.database.status), version: $($health.backend.version))"
} else {
  if ($mode -eq 'prod') {
    $mainJs = Join-Path $BackendDir 'dist\main.js'
    $needBuild = -not (Test-Path $mainJs)
    if (-not $needBuild) {
      $newestSource = Get-ChildItem -Path (Join-Path $BackendDir 'src') -Recurse -File -Filter *.ts |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($newestSource -and $newestSource.LastWriteTime -gt (Get-Item $mainJs).LastWriteTime) {
        $needBuild = $true
      }
    }
    if ($needBuild) {
      Write-Step 'Building the backend (production mode)...'
      Push-Location $ProjectRoot
      try {
        & npm --prefix backend run build 2>&1 | ForEach-Object { Write-Info ([string]$_) }
        if ($LASTEXITCODE -ne 0) { Stop-WithError 'Backend build failed.' 'Run: npm run build:backend' }
      } finally {
        Pop-Location
      }
    }
    $null = Start-QuitinService -Role 'backend' -NpmArguments @('--prefix', 'backend', 'run', 'start:prod') -WorkingDirectory $ProjectRoot -Mode $mode
  } else {
    $null = Start-QuitinService -Role 'backend' -NpmArguments @('--prefix', 'backend', 'run', 'start:dev') -WorkingDirectory $ProjectRoot -Mode $mode
  }

  Write-Step 'Waiting for the backend health endpoint...'
  $healthResponse = Wait-HttpOk "http://127.0.0.1:$BackendPort/api/health" 150

  if (-not $healthResponse -or $healthResponse.Status -ne 200) {
    Show-LogTail (Join-Path $LogDir 'backend.out.log') 25
    Show-LogTail (Join-Path $LogDir 'backend.err.log') 25
    Stop-WithError 'The backend did not become healthy within 150 seconds.' 'Check the log above, then run: npm run dev:logs -- -Service backend'
  }

  $health = Get-BackendHealth
  if (-not $health) {
    Show-LogTail (Join-Path $LogDir 'backend.out.log') 25
    Stop-WithError 'Backend answered but returned an unreadable health response.' 'Run: npm run dev:logs -- -Service backend'
  }
  Write-Ok "Backend health: $($health.status) (database: $($health.database.status), version: $($health.backend.version))"
  if ($health.database.status -ne 'up') {
    Stop-WithError 'Backend is running but the database is unreachable.' 'Run: npm run dev:status'
  }
}

# ---------------------------------------------------------------------------
# 7. Start frontend
# ---------------------------------------------------------------------------
Write-Section '[7/7] Frontend'

if ($reuseFrontend) {
  Write-Ok "Frontend already served on port $FrontendPort"
} else {
  if ($mode -eq 'prod') {
    $buildId = Join-Path $FrontendDir '.next\BUILD_ID'
    if (-not (Test-Path $buildId)) {
      Write-Step 'Building the frontend (production mode, this can take 1-2 minutes)...'
      Push-Location $ProjectRoot
      try {
        & npm --prefix frontend run build 2>&1 | ForEach-Object { Write-Info ([string]$_) }
        if ($LASTEXITCODE -ne 0) { Stop-WithError 'Frontend build failed.' 'Run: npm run build:frontend' }
      } finally {
        Pop-Location
      }
    }
    $null = Start-QuitinService -Role 'frontend' -NpmArguments @('--prefix', 'frontend', 'run', 'start') -WorkingDirectory $ProjectRoot -Mode $mode
  } else {
    $null = Start-QuitinService -Role 'frontend' -NpmArguments @('--prefix', 'frontend', 'run', 'dev') -WorkingDirectory $ProjectRoot -Mode $mode
  }

  Write-Step 'Waiting for the frontend...'
  $frontendResponse = Wait-HttpOk "http://127.0.0.1:$FrontendPort/" 180

  if (-not $frontendResponse -or $frontendResponse.Status -ne 200) {
    Show-LogTail (Join-Path $LogDir 'frontend.out.log') 25
    Show-LogTail (Join-Path $LogDir 'frontend.err.log') 25
    Stop-WithError 'The frontend did not become ready within 180 seconds.' 'Check the log above, then run: npm run dev:logs -- -Service frontend'
  }
  Write-Ok "Frontend is ready on http://localhost:$FrontendPort"
}

# Proxy check: the frontend must be able to reach the backend API.
$proxy = Invoke-HttpStatus "http://127.0.0.1:$FrontendPort/api/health" 10
if ($proxy.Status -eq 200) {
  Write-Ok "Frontend -> backend proxy works (/api/health -> 200)"
} else {
  Write-Warn "Frontend proxy check returned HTTP $($proxy.Status). The API may still work in the browser; check frontend/.env.local BACKEND_URL."
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Banner 'QUITIN is ready'

$backendPid = Get-PortOwner $BackendPort
$frontendPid = Get-PortOwner $FrontendPort

Write-Host "  Frontend : http://localhost:$FrontendPort   (PID $frontendPid, mode $mode)" -ForegroundColor Green
Write-Host "  API      : http://localhost:$BackendPort/api   (PID $backendPid)" -ForegroundColor Green
Write-Host "  Health   : http://localhost:$BackendPort/api/health" -ForegroundColor Green
Write-Host "  Database : $($dbConfig.Host):$($dbConfig.Port)/$($dbConfig.Database)" -ForegroundColor Green
Write-Host ''
Write-Host "  Logs     : npm run dev:logs" -ForegroundColor Gray
Write-Host "  Status   : npm run dev:status" -ForegroundColor Gray
Write-Host "  Stop     : npm run dev:down" -ForegroundColor Gray
Write-Host ''
Write-Host '  Demo login: ada@quitin.dev / Password123!' -ForegroundColor Gray
Write-Host ''
