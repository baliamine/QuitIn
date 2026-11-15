# ---------------------------------------------------------------------------
# QUITIN - development environment check (read-only)
# Usage: npm run dev:check
# ---------------------------------------------------------------------------
param(
  [switch]$Quiet
)

. "$PSScriptRoot\dev-lib.ps1"

$problems = 0
$warnings = 0

function Add-Problem([string]$Text) {
  Write-Fail $Text
  $script:problems++
}

function Add-Warning([string]$Text) {
  Write-Warn $Text
  $script:warnings++
}

Write-Banner 'QUITIN - development environment check'

$report = Get-PreflightReport

# --- 1. Tooling -----------------------------------------------------------
Write-Section '[1/7] Tooling'
if ($report.Node) { Write-Ok "Node.js $($report.Node)" } else { Add-Problem 'Node.js not found on PATH (install Node.js 20+).' }
if ($report.Npm) { Write-Ok "npm $($report.Npm)" } else { Add-Problem 'npm not found on PATH.' }

# --- 2. Dependencies ------------------------------------------------------
Write-Section '[2/7] Dependencies'
if (Test-Path (Join-Path $BackendDir 'node_modules')) {
  Write-Ok 'backend/node_modules present'
} else {
  Add-Problem 'backend dependencies missing. Run: npm run install:all'
}
if (Test-Path (Join-Path $FrontendDir 'node_modules')) {
  Write-Ok 'frontend/node_modules present'
} else {
  Add-Problem 'frontend dependencies missing. Run: npm run install:all'
}

# --- 3. Environment files -------------------------------------------------
Write-Section '[3/7] Environment configuration'

$backendEnvPath = Join-Path $BackendDir '.env'
$frontendEnvPath = Join-Path $FrontendDir '.env.local'

if (Test-Path $backendEnvPath) {
  Write-Ok 'backend/.env found'
} else {
  Add-Problem 'backend/.env is missing. Copy backend/.env.example to backend/.env.'
}

if (Test-Path $frontendEnvPath) {
  Write-Ok 'frontend/.env.local found'
} else {
  Add-Warning 'frontend/.env.local is missing (defaults still work, but copy frontend/.env.local.example).'
}

$envValues = $report.BackendEnv
$dbConfig = $report.DbConfig

if ($envValues) {
  if ($envValues['DATABASE_URL']) {
    if ($dbConfig) {
      $passwordNote = 'no password'
      if ($dbConfig.HasPassword) { $passwordNote = 'password set (hidden)' }
      Write-Ok "DATABASE_URL -> $($dbConfig.Host):$($dbConfig.Port)/$($dbConfig.Database) (user: $($dbConfig.User), $passwordNote)"
      if ($dbConfig.Port -ne $DefaultDbPort) {
        Add-Warning "DATABASE_URL uses port $($dbConfig.Port) instead of the expected $DefaultDbPort. Keep one PostgreSQL instance to avoid confusion."
      }
    } else {
      Add-Problem 'DATABASE_URL is not a valid PostgreSQL URL.'
    }
  } else {
    Add-Problem 'DATABASE_URL is missing from backend/.env.'
  }

  if ($envValues['JWT_SECRET']) {
    if ($envValues['JWT_SECRET'].Length -ge 16) {
      Write-Ok "JWT_SECRET set ($($envValues['JWT_SECRET'].Length) characters, value hidden)"
    } else {
      Add-Problem 'JWT_SECRET is too short (minimum 16 characters).'
    }
  } else {
    Add-Problem 'JWT_SECRET is missing from backend/.env.'
  }

  Write-Info "PORT=$($envValues['PORT'])  NODE_ENV=$($envValues['NODE_ENV'])  FRONTEND_URL=$($envValues['FRONTEND_URL'])"

  if (-not $envValues['AI_API_KEY']) {
    Add-Warning 'AI_API_KEY is empty - AI assistant replies with a setup message instead of live answers.'
  }
  if (-not $envValues['SMTP_HOST'] -and -not $envValues['RESEND_API_KEY']) {
    Write-Info 'No email provider configured - verification/reset emails are logged to the console (development mode).'
  }
  if ($envValues['GOOGLE_CLIENT_ID'] -and $envValues['GOOGLE_CLIENT_SECRET']) {
    Write-Ok 'Google OAuth configured'
  } else {
    Write-Info 'Google OAuth not configured (optional) - the login button will explain what is missing.'
  }
  if ($envValues['FACEBOOK_APP_ID'] -and $envValues['FACEBOOK_APP_SECRET']) {
    Write-Ok 'Facebook OAuth configured'
  } else {
    Write-Info 'Facebook OAuth not configured (optional).'
  }
}

$frontendEnv = $report.FrontendEnv
if ($frontendEnv) {
  $backendUrl = $frontendEnv['BACKEND_URL']
  if ($backendUrl) {
    if ($backendUrl -match "localhost:$BackendPort|127\.0\.0\.1:$BackendPort") {
      Write-Ok "frontend BACKEND_URL=$backendUrl"
    } else {
      Add-Warning "frontend BACKEND_URL=$backendUrl does not point at the backend port $BackendPort."
    }
  } else {
    Write-Info "BACKEND_URL not set - the Next.js proxy defaults to http://localhost:$BackendPort"
  }

  $socketUrl = $frontendEnv['NEXT_PUBLIC_SOCKET_URL']
  if ($socketUrl -and $socketUrl -notmatch "localhost:$BackendPort|127\.0\.0\.1:$BackendPort") {
    Add-Warning "frontend NEXT_PUBLIC_SOCKET_URL=$socketUrl does not point at the backend port $BackendPort."
  }
}

# --- 4. PostgreSQL --------------------------------------------------------
Write-Section '[4/7] PostgreSQL'

if ($report.PgService) {
  $service = $report.PgService
  if ($service.Status -eq 'Running') {
    Write-Ok "Windows service '$($service.Name)' is $($service.Status)"
  } else {
    Add-Problem "Windows service '$($service.Name)' is $($service.Status). Start it with: npm run dev:up (or Start-Service $($service.Name) as Administrator)."
  }
} else {
  Write-Info 'No Windows PostgreSQL service detected - Docker will be used if needed.'
}

if ($report.PgBin) {
  Write-Info "PostgreSQL client tools: $($report.PgBin)"
} else {
  Add-Warning 'psql.exe not found. Set PG_BIN to your PostgreSQL bin folder for full database diagnostics.'
}

$dbReachable = $null
$dbExists = $null
$tableCount = $null

if ($dbConfig) {
  $dbPortOpen = Test-TcpPort $dbConfig.Port 1000
  if ($dbPortOpen) {
    Write-Ok "Port $($dbConfig.Port) is open (PostgreSQL reachable)"
  } else {
    Add-Problem "Nothing is listening on port $($dbConfig.Port). PostgreSQL is not running."
  }

  if ($dbPortOpen) {
    $dbReachable = Test-DatabaseReachable -BinDir $report.PgBin -DbConfig $dbConfig
    if ($dbReachable.Ok) {
      Write-Ok $dbReachable.Message
    } else {
      Add-Problem $dbReachable.Message
    }
  }

  if ($dbReachable -and $dbReachable.Ok) {
    $dbExists = Test-DatabaseExists -BinDir $report.PgBin -DbConfig $dbConfig
    if ($dbExists.Exists -eq $true) {
      Write-Ok "Database '$($dbConfig.Database)' exists"
      $tableCount = Get-PublicTableCount -BinDir $report.PgBin -DbConfig $dbConfig
      if ($null -ne $tableCount) {
        if ($tableCount -gt 0) {
          Write-Ok "$tableCount tables in schema public"
        } else {
          Add-Warning "Database '$($dbConfig.Database)' has no tables. Run: npm run prisma:push"
        }
      }
    } elseif ($dbExists.Exists -eq $false) {
      Add-Problem "Database '$($dbConfig.Database)' does not exist. npm run dev:up can create it (it never deletes data)."
    } else {
      Add-Warning "Could not verify database existence: $($dbExists.Message)"
    }
  }
}

# --- 5. Prisma ------------------------------------------------------------
Write-Section '[5/7] Prisma'

if (Test-PrismaClientGenerated) {
  Write-Ok 'Prisma Client generated'
} else {
  Add-Problem 'Prisma Client missing. Run: npm run prisma:generate (dev:up does this automatically).'
}

$validation = Invoke-Prisma -Arguments @('validate', '--schema', 'prisma/schema.prisma')
if ($validation.Ok) {
  Write-Ok 'prisma/schema.prisma is valid'
} else {
  Add-Problem "Prisma schema validation failed: $($validation.Output)"
}

if (Test-Path (Join-Path $BackendDir 'prisma\migrations')) {
  $migrationStatus = Invoke-Prisma -Arguments @('migrate', 'status')
  if ($migrationStatus.Ok) {
    Write-Ok 'Prisma migrations are applied'
  } else {
    Add-Warning "Migration status: $($migrationStatus.Output)"
  }
} else {
  Write-Info 'No prisma/migrations folder - this project manages its schema with "prisma db push" (not migrations).'
}

if ($dbReachable -and $dbReachable.Ok -and (Test-PrismaClientGenerated)) {
  $drift = Get-SchemaDrift -DbConfig $dbConfig
  if ($drift.Ok) {
    if ($drift.InSync) {
      Write-Ok 'Database schema matches prisma/schema.prisma'
    } else {
      Add-Warning 'Database schema differs from prisma/schema.prisma. Review with: npm --prefix backend run prisma:push'
    }
  } else {
    Write-Warn "Could not compare database schema: $($drift.Output)"
  }
}

# --- 6. Ports -------------------------------------------------------------
Write-Section '[6/7] Ports'

$portTable = @(
  @{ Name = 'PostgreSQL'; Port = $DefaultDbPort },
  @{ Name = 'Backend (NestJS)'; Port = $BackendPort },
  @{ Name = 'Frontend (Next.js)'; Port = $FrontendPort }
)

foreach ($entry in $portTable) {
  $owner = Get-PortOwner $entry.Port

  if ($entry.Port -eq $DefaultDbPort) {
    if ($owner) {
      Write-Ok "$($entry.Name) port $($entry.Port) is listening (PID $owner)"
    } else {
      Add-Problem "$($entry.Name) port $($entry.Port) is not listening. Run: npm run dev:up"
    }
    continue
  }

  $role = Resolve-PortRole $entry.Port

  if ($role -eq 'free') {
    Write-Ok "$($entry.Name) port $($entry.Port) is free"
  } elseif ($role -eq 'quitin') {
    $processName = Get-ProcessNameSafe $owner
    Write-Ok "$($entry.Name) port $($entry.Port) is used by QUITIN ($processName, PID $owner) - will be reused"
  } else {
    $processName = Get-ProcessNameSafe $owner
    $commandLine = Get-ProcessCommandLine $owner
    if ($commandLine.Length -gt 110) { $commandLine = $commandLine.Substring(0, 110) + '...' }
    Add-Problem "Port $($entry.Port) is used by another application ($processName, PID $owner). QUITIN will not kill it."
    Write-Info "Command: $commandLine"
    Write-Info "Fix: stop that application, or change QUITIN's port (backend PORT in backend/.env, frontend --port)."
  }
}

$projectProcesses = @(Get-QuitinProjectProcesses)
if ($projectProcesses.Count -gt 1) {
  Add-Warning "$($projectProcesses.Count) QUITIN node processes are running (possible duplicates). Run: npm run dev:down"
  foreach ($process in $projectProcesses) {
    $commandLine = $process.CommandLine
    if ($commandLine.Length -gt 110) { $commandLine = $commandLine.Substring(0, 110) + '...' }
    Write-Info "PID $($process.ProcessId): $commandLine"
  }
}

# --- 7. Summary -----------------------------------------------------------
Write-Section '[7/7] Summary'

if ($problems -eq 0 -and $warnings -eq 0) {
  Write-Ok 'Everything checks out. Start the environment with: npm run dev:up'
} elseif ($problems -eq 0) {
  Write-Ok "No blocking problems ($warnings warning(s)). You can run: npm run dev:up"
} else {
  Write-Fail "$problems problem(s) must be fixed before the environment can start ($warnings warning(s))."
}

Write-Host ''
if ($problems -gt 0) { exit 1 }
exit 0
