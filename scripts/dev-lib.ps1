# ---------------------------------------------------------------------------
# QUITIN development manager - shared helpers
# Dot-sourced by dev-check.ps1, dev-up.ps1, dev-down.ps1, dev-status.ps1,
# dev-logs.ps1. Windows PowerShell 5.1 compatible. ASCII output only.
# ---------------------------------------------------------------------------

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot 'backend'
$FrontendDir = Join-Path $ProjectRoot 'frontend'
$RunDir = Join-Path $ProjectRoot '.run'
$LogDir = Join-Path $ProjectRoot '.logs'

$BackendPort = 4000
$FrontendPort = 3000
$DefaultDbPort = 5432

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
function Write-Banner([string]$Text) {
  Write-Host ''
  Write-Host ('=' * 66) -ForegroundColor DarkCyan
  Write-Host "  $Text" -ForegroundColor Cyan
  Write-Host ('=' * 66) -ForegroundColor DarkCyan
}

function Write-Section([string]$Text) {
  Write-Host ''
  Write-Host $Text -ForegroundColor Cyan
}

function Write-Ok([string]$Text) { Write-Host "  [OK]    $Text" -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host "  [INFO]  $Text" -ForegroundColor Gray }
function Write-Warn([string]$Text) { Write-Host "  [WARN]  $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "  [FAIL]  $Text" -ForegroundColor Red }
function Write-Step([string]$Text) { Write-Host "  -> $Text" -ForegroundColor White }

# ---------------------------------------------------------------------------
# Files / folders
# ---------------------------------------------------------------------------
function Initialize-QuitinDirs {
  foreach ($dir in @($RunDir, $LogDir)) {
    if (-not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
  }
}

function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path $Path)) { return $values }

  foreach ($line in (Get-Content -Path $Path -ErrorAction SilentlyContinue)) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0) { continue }
    if ($trimmed.StartsWith('#')) { continue }

    $index = $trimmed.IndexOf('=')
    if ($index -lt 1) { continue }

    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim()

    if ($value.Length -ge 2) {
      $first = $value.Substring(0, 1)
      $last = $value.Substring($value.Length - 1, 1)
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $values[$key] = $value
  }
  return $values
}

function Get-DatabaseConfig([string]$DatabaseUrl) {
  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { return $null }

  try {
    $uri = New-Object System.Uri($DatabaseUrl)
    $database = $uri.AbsolutePath.Trim('/')
    if ($database.Contains('/')) { $database = $database.Split('/')[0] }

    $user = ''
    $hasPassword = $false
    if ($uri.UserInfo) {
      $parts = $uri.UserInfo.Split(':')
      $user = $parts[0]
      if ($parts.Length -gt 1 -and $parts[1].Length -gt 0) { $hasPassword = $true }
    }

    $port = $DefaultDbPort
    if ($uri.Port -gt 0) { $port = $uri.Port }

    return [pscustomobject]@{
      Host        = $uri.Host
      Port        = $port
      Database    = $database
      User        = $user
      HasPassword = $hasPassword
      Password    = $(if ($hasPassword) { $uri.UserInfo.Substring($user.Length + 1) } else { '' })
    }
  } catch {
    return $null
  }
}

# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------
function Test-TcpPort([int]$Port, [int]$TimeoutMs = 800) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    if ($task.Wait($TimeoutMs)) { return $client.Connected }
    return $false
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch { }
  }
}

function Get-PortOwner([int]$Port) {
  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
  } catch { }
  return $null
}

function Get-ProcessCommandLine([int]$ProcessId) {
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    if ($process) { return [string]$process.CommandLine }
  } catch { }
  return ''
}

function Get-ProcessNameSafe([int]$ProcessId) {
  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    return $process.ProcessName
  } catch {
    return ''
  }
}

function Test-QuitinProcess([int]$ProcessId) {
  $commandLine = Get-ProcessCommandLine $ProcessId
  if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
  $normalizedCommand = $commandLine.ToLowerInvariant().Replace('\', '/')
  $normalizedRoot = $ProjectRoot.ToLowerInvariant().Replace('\', '/')
  return $normalizedCommand.Contains($normalizedRoot)
}

function Invoke-HttpStatus([string]$Url, [int]$TimeoutSec = 5) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec -ErrorAction Stop
    return [pscustomobject]@{
      Ok     = $true
      Status = [int]$response.StatusCode
      Body   = [string]$response.Content
      Error  = ''
    }
  } catch {
    $status = 0
    try { $status = [int]$_.Exception.Response.StatusCode } catch { }
    $body = ''
    try { $body = [string]$_.ErrorDetails.Message } catch { }
    return [pscustomobject]@{
      Ok     = $false
      Status = $status
      Body   = $body
      Error  = [string]$_.Exception.Message
    }
  }
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds = 60, [int]$IntervalMs = 1000) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $last = $null

  while ((Get-Date) -lt $deadline) {
    $last = Invoke-HttpStatus $Url 3
    if ($last.Status -eq 200) { return $last }
    Start-Sleep -Milliseconds $IntervalMs
  }
  return $last
}

function Test-QuitinBackendIdentity {
  $health = Invoke-HttpStatus "http://127.0.0.1:$BackendPort/api/health" 3
  if ($health.Status -eq 200 -and $health.Body -match '"backend"') { return $true }
  $me = Invoke-HttpStatus "http://127.0.0.1:$BackendPort/api/auth/me" 3
  if ($me.Status -eq 401) { return $true }
  return $false
}

function Test-QuitinFrontendIdentity {
  $page = Invoke-HttpStatus "http://127.0.0.1:$FrontendPort/" 5
  if ($page.Status -eq 200 -and $page.Body -match 'QUITIN') { return $true }
  return $false
}

# Returns: free | quitin | unknown (only meaningful for the app ports)
function Resolve-PortRole([int]$Port) {
  if ($Port -ne $BackendPort -and $Port -ne $FrontendPort) { return 'unknown' }

  $owner = Get-PortOwner $Port
  if (-not $owner) { return 'free' }

  if (Test-QuitinProcess $owner) { return 'quitin' }

  $roleName = 'frontend'
  if ($Port -eq $BackendPort) { $roleName = 'backend' }
  $state = Read-ServiceState $roleName
  if ($state -and [int]$state.pid -eq $owner) { return 'quitin' }

  if ($Port -eq $BackendPort -and (Test-QuitinBackendIdentity)) { return 'quitin' }
  if ($Port -eq $FrontendPort -and (Test-QuitinFrontendIdentity)) { return 'quitin' }

  return 'unknown'
}

# ---------------------------------------------------------------------------
# Process tree helpers
# ---------------------------------------------------------------------------
function Get-ChildProcessIds([int]$ParentProcessId) {
  $children = @()
  try {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentProcessId" -ErrorAction SilentlyContinue
  } catch { }

  foreach ($child in $children) {
    $childId = [int]$child.ProcessId
    $childId
    Get-ChildProcessIds -ParentProcessId $childId
  }
}

function Stop-QuitinProcessTree([int]$ProcessId, [string]$Role) {
  $stopped = @()
  $childIds = @(Get-ChildProcessIds -ParentProcessId $ProcessId)

  foreach ($childId in $childIds) {
    try {
      Stop-Process -Id $childId -Force -ErrorAction Stop
      $stopped += $childId
    } catch { }
  }

  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    $stopped += $ProcessId
  } catch { }

  if ($stopped.Count -gt 0) {
    Write-Ok "Stopped $Role process tree (PIDs: $($stopped -join ', '))"
  } else {
    Write-Info "$Role was not running (PID $ProcessId not found)."
  }
  return $stopped
}

function Get-QuitinProjectProcesses {
  $found = @()
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
  } catch {
    $processes = @()
  }

  foreach ($process in $processes) {
    $commandLine = [string]$process.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) { continue }
    $normalizedCommand = $commandLine.ToLowerInvariant().Replace('\', '/')
    $normalizedRoot = $ProjectRoot.ToLowerInvariant().Replace('\', '/')
    if ($normalizedCommand.Contains($normalizedRoot)) {
      $found += [pscustomobject]@{
        ProcessId   = [int]$process.ProcessId
        CommandLine = $commandLine
      }
    }
  }
  return $found
}

# ---------------------------------------------------------------------------
# State files (.run/backend.json, .run/frontend.json)
# ---------------------------------------------------------------------------
function Save-ServiceState([string]$Role, $State) {
  Initialize-QuitinDirs
  $path = Join-Path $RunDir "$Role.json"
  $State | ConvertTo-Json | Set-Content -Path $path -Encoding UTF8
}

function Read-ServiceState([string]$Role) {
  $path = Join-Path $RunDir "$Role.json"
  if (-not (Test-Path $path)) { return $null }
  try {
    return Get-Content -Path $path -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Remove-ServiceState([string]$Role) {
  $path = Join-Path $RunDir "$Role.json"
  if (Test-Path $path) { Remove-Item -Path $path -Force -ErrorAction SilentlyContinue }
}

# ---------------------------------------------------------------------------
# PostgreSQL helpers
# ---------------------------------------------------------------------------
function Find-PostgresBin {
  $candidates = @()
  if ($env:PG_BIN) { $candidates += $env:PG_BIN }

  $roots = @()
  if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'PostgreSQL') }
  if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'PostgreSQL') }

  foreach ($root in $roots) {
    if ($root -and (Test-Path $root)) {
      $versions = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending
      foreach ($version in $versions) {
        $candidates += (Join-Path $version.FullName 'bin')
      }
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-Path (Join-Path $candidate 'psql.exe')) { return $candidate }
  }
  return $null
}

function Get-PostgresService {
  $services = @()
  try {
    $services = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'postgresql*' }
  } catch { }

  if ($services.Count -eq 0) { return $null }

  $running = $services | Where-Object { $_.Status -eq 'Running' } | Select-Object -First 1
  if ($running) { return $running }
  return $services | Select-Object -First 1
}

function Invoke-PsqlScalar {
  param(
    [string]$BinDir,
    [string]$DbHost,
    [int]$Port,
    [string]$User,
    [string]$Database,
    [string]$Sql,
    [string]$Password = ''
  )

  $psql = Join-Path $BinDir 'psql.exe'
  if (-not (Test-Path $psql)) {
    return [pscustomobject]@{ Ok = $false; Output = 'psql.exe not found' }
  }

  $previousPassword = $env:PGPASSWORD
  $previousTimeout = $env:PGCONNECT_TIMEOUT
  $env:PGCONNECT_TIMEOUT = '5'
  if ($Password) { $env:PGPASSWORD = $Password }

  try {
    $output = & $psql -h $DbHost -p $Port -U $User -d $Database -w -t -A -c $Sql 2>&1
    $exitCode = $LASTEXITCODE
    $text = (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
    return [pscustomobject]@{ Ok = ($exitCode -eq 0); Output = $text }
  } catch {
    return [pscustomobject]@{ Ok = $false; Output = [string]$_.Exception.Message }
  } finally {
    $env:PGPASSWORD = $previousPassword
    $env:PGCONNECT_TIMEOUT = $previousTimeout
  }
}

function Test-DatabaseReachable {
  param(
    [string]$BinDir,
    $DbConfig
  )

  if (-not $DbConfig) {
    return [pscustomobject]@{ Ok = $false; Message = 'DATABASE_URL is missing or invalid.' }
  }

  if (-not (Test-TcpPort $DbConfig.Port 1000)) {
    return [pscustomobject]@{
      Ok      = $false
      Message = "Nothing is listening on $($DbConfig.Host):$($DbConfig.Port). PostgreSQL is probably stopped."
    }
  }

  if (-not $BinDir) {
    return [pscustomobject]@{
      Ok      = $true
      Message = "Port $($DbConfig.Port) accepts TCP connections (psql not found, full check skipped)."
    }
  }

  $result = Invoke-PsqlScalar -BinDir $BinDir -DbHost $DbConfig.Host -Port $DbConfig.Port `
    -User $DbConfig.User -Database $DbConfig.Database -Sql 'select 1' -Password $DbConfig.Password

  if ($result.Ok) {
    return [pscustomobject]@{ Ok = $true; Message = "Connected to database '$($DbConfig.Database)' on port $($DbConfig.Port)." }
  }

  $hint = $result.Output
  if ($hint -match 'password authentication failed|no password supplied') {
    $hint = 'PostgreSQL rejected the credentials. Check the user/password in DATABASE_URL.'
  } elseif ($hint -match 'does not exist') {
    $hint = "Database '$($DbConfig.Database)' does not exist."
  }
  return [pscustomobject]@{ Ok = $false; Message = $hint }
}

function Test-DatabaseExists {
  param(
    [string]$BinDir,
    $DbConfig
  )

  if (-not $BinDir -or -not $DbConfig) {
    return [pscustomobject]@{ Ok = $false; Exists = $null; Message = 'psql not available.' }
  }

  $safeName = $DbConfig.Database.Replace("'", "''")
  $result = Invoke-PsqlScalar -BinDir $BinDir -DbHost $DbConfig.Host -Port $DbConfig.Port `
    -User $DbConfig.User -Database 'postgres' `
    -Sql "select 1 from pg_database where datname = '$safeName'" -Password $DbConfig.Password

  if (-not $result.Ok) {
    return [pscustomobject]@{ Ok = $false; Exists = $null; Message = $result.Output }
  }
  return [pscustomobject]@{ Ok = $true; Exists = ($result.Output -eq '1'); Message = '' }
}

function Get-PublicTableCount {
  param(
    [string]$BinDir,
    $DbConfig
  )

  if (-not $BinDir -or -not $DbConfig) { return $null }

  $result = Invoke-PsqlScalar -BinDir $BinDir -DbHost $DbConfig.Host -Port $DbConfig.Port `
    -User $DbConfig.User -Database $DbConfig.Database `
    -Sql "select count(*) from information_schema.tables where table_schema = 'public'" -Password $DbConfig.Password

  if ($result.Ok -and $result.Output -match '^\d+$') { return [int]$result.Output }
  return $null
}

# ---------------------------------------------------------------------------
# Prisma helpers
# ---------------------------------------------------------------------------
function Get-PrismaCmd {
  $candidate = Join-Path $BackendDir 'node_modules\.bin\prisma.cmd'
  if (Test-Path $candidate) { return $candidate }
  return $null
}

function Test-PrismaClientGenerated {
  return (Test-Path (Join-Path $BackendDir 'node_modules\.prisma\client\index.js'))
}

function Invoke-Prisma {
  param(
    [string[]]$Arguments
  )

  $prisma = Get-PrismaCmd
  if (-not $prisma) {
    return [pscustomobject]@{ Ok = $false; Output = 'Prisma CLI not installed (backend/node_modules/.bin/prisma.cmd missing). Run: npm run install:all' }
  }

  Push-Location $BackendDir
  $previousHideUpdate = $env:PRISMA_HIDE_UPDATE_MESSAGE
  $previousCheckpoint = $env:CHECKPOINT_DISABLE
  $env:PRISMA_HIDE_UPDATE_MESSAGE = '1'
  $env:CHECKPOINT_DISABLE = '1'
  try {
    $output = & $prisma @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
    return [pscustomobject]@{ Ok = ($exitCode -eq 0); Output = $text }
  } catch {
    return [pscustomobject]@{ Ok = $false; Output = [string]$_.Exception.Message }
  } finally {
    $env:PRISMA_HIDE_UPDATE_MESSAGE = $previousHideUpdate
    $env:CHECKPOINT_DISABLE = $previousCheckpoint
    Pop-Location
  }
}

function Get-SchemaDrift {
  param($DbConfig)

  if (-not $DbConfig) {
    return [pscustomobject]@{ Ok = $false; InSync = $null; Output = 'DATABASE_URL missing.' }
  }

  $user = [uri]::EscapeDataString($DbConfig.User)
  $password = [uri]::EscapeDataString($DbConfig.Password)
  $database = [uri]::EscapeDataString($DbConfig.Database)

  $url = "postgresql://$user"
  if ($DbConfig.HasPassword) { $url += ":$password" }
  $url += "@$($DbConfig.Host):$($DbConfig.Port)/${database}?schema=public"

  $result = Invoke-Prisma -Arguments @(
    'migrate', 'diff',
    '--from-url', $url,
    '--to-schema-datamodel', 'prisma/schema.prisma',
    '--script'
  )

  if (-not $result.Ok) {
    return [pscustomobject]@{ Ok = $false; InSync = $null; Output = $result.Output }
  }

  $trimmed = $result.Output.Trim()
  $statements = @(
    $trimmed -split "`n" |
      Where-Object { $_ -match '^\s*(ALTER|CREATE|DROP|COMMENT|GRANT|REVOKE|UPDATE|INSERT|DELETE)\b' }
  )
  $inSync = ($statements.Count -eq 0)
  return [pscustomobject]@{ Ok = $true; InSync = $inSync; Output = $trimmed }
}

# ---------------------------------------------------------------------------
# Environment / preflight
# ---------------------------------------------------------------------------
function Get-BackendEnv {
  return Read-DotEnv (Join-Path $BackendDir '.env')
}

function Get-FrontendEnv {
  return Read-DotEnv (Join-Path $FrontendDir '.env.local')
}

function Get-PreflightReport {
  $report = [pscustomobject]@{
    Problems = New-Object System.Collections.ArrayList
    Warnings = New-Object System.Collections.ArrayList
    Notes    = New-Object System.Collections.ArrayList
    Node     = ''
    Npm      = ''
    BackendEnv = $null
    FrontendEnv = $null
    DbConfig = $null
    PgBin    = $null
    PgService = $null
  }

  # Tooling
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    try {
      $report.Node = [string](& node --version 2>$null)
      $report.Node = $report.Node.Trim()
    } catch {
      $report.Node = ''
    }
  }
  if (-not $report.Node) {
    [void]$report.Problems.Add('Node.js is not installed or not on PATH. Install Node.js 20+ from https://nodejs.org')
  }

  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCommand) {
    try {
      $report.Npm = [string](& npm --version 2>$null)
      $report.Npm = $report.Npm.Trim()
    } catch {
      $report.Npm = ''
    }
  }
  if (-not $report.Npm) {
    [void]$report.Problems.Add('npm is not available on PATH.')
  }

  if ($report.Node -match '^v(\d+)') {
    $major = [int]$Matches[1]
    if ($major -lt 18) {
      [void]$report.Problems.Add("Node.js $($report.Node) is too old. QUITIN requires Node.js 18+ (20 recommended).")
    }
  }

  # Dependencies
  if (-not (Test-Path (Join-Path $BackendDir 'node_modules'))) {
    [void]$report.Problems.Add('Backend dependencies are missing. Run: npm run install:all')
  }
  if (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
    [void]$report.Problems.Add('Frontend dependencies are missing. Run: npm run install:all')
  }

  # Environment files
  $backendEnvPath = Join-Path $BackendDir '.env'
  $frontendEnvPath = Join-Path $FrontendDir '.env.local'

  if (-not (Test-Path $backendEnvPath)) {
    [void]$report.Problems.Add('backend/.env is missing. Copy backend/.env.example to backend/.env and adjust the values.')
  } else {
    $report.BackendEnv = Read-DotEnv $backendEnvPath
  }

  if (-not (Test-Path $frontendEnvPath)) {
    [void]$report.Warnings.Add('frontend/.env.local is missing. Copy frontend/.env.local.example to frontend/.env.local (defaults point to localhost).')
    $report.FrontendEnv = @{}
  } else {
    $report.FrontendEnv = Read-DotEnv $frontendEnvPath
  }

  if ($report.BackendEnv) {
    $envValues = $report.BackendEnv

    if (-not $envValues['DATABASE_URL']) {
      [void]$report.Problems.Add('backend/.env has no DATABASE_URL.')
    } else {
      $report.DbConfig = Get-DatabaseConfig $envValues['DATABASE_URL']
      if (-not $report.DbConfig) {
        [void]$report.Problems.Add('DATABASE_URL in backend/.env is not a valid PostgreSQL URL.')
      }
    }

    if (-not $envValues['JWT_SECRET']) {
      [void]$report.Problems.Add('backend/.env has no JWT_SECRET.')
    } elseif ($envValues['JWT_SECRET'].Length -lt 16) {
      [void]$report.Problems.Add('JWT_SECRET must be at least 16 characters long.')
    }

    $portValue = $envValues['PORT']
    if ($portValue -and $portValue -ne "$BackendPort") {
      [void]$report.Warnings.Add("backend/.env PORT=$portValue but the manager expects $BackendPort. Update the scripts or the env value so they match.")
    }

    $frontendUrl = $envValues['FRONTEND_URL']
    if ($frontendUrl -and $frontendUrl -notmatch "localhost:$FrontendPort|127\.0\.0\.1:$FrontendPort") {
      [void]$report.Warnings.Add("backend/.env FRONTEND_URL=$frontendUrl does not point at the local frontend (http://localhost:$FrontendPort). CORS or OAuth redirects may fail.")
    }

    if (-not $envValues['AI_API_KEY']) {
      [void]$report.Warnings.Add('AI_API_KEY is empty. The AI assistant will show a setup message instead of live answers.')
    }
  }

  # Frontend wiring
  if ($report.FrontendEnv) {
    $backendUrl = $report.FrontendEnv['BACKEND_URL']
    if ($backendUrl -and $backendUrl -notmatch "localhost:$BackendPort|127\.0\.0\.1:$BackendPort") {
      [void]$report.Warnings.Add("frontend/.env.local BACKEND_URL=$backendUrl does not match the backend port $BackendPort.")
    }
    $socketUrl = $report.FrontendEnv['NEXT_PUBLIC_SOCKET_URL']
    if ($socketUrl -and $socketUrl -notmatch "localhost:$BackendPort|127\.0\.0\.1:$BackendPort") {
      [void]$report.Warnings.Add("frontend/.env.local NEXT_PUBLIC_SOCKET_URL=$socketUrl does not match the backend port $BackendPort.")
    }
  }

  # PostgreSQL tooling / service
  $report.PgBin = Find-PostgresBin
  if (-not $report.PgBin) {
    [void]$report.Warnings.Add('psql.exe was not found. Database checks fall back to a TCP check. Set PG_BIN to your PostgreSQL bin folder for full diagnostics.')
  }

  $report.PgService = Get-PostgresService
  if (-not $report.PgService) {
    [void]$report.Notes.Add('No Windows PostgreSQL service found. The manager will try Docker (docker-compose.yml) if the database port is closed.')
  }

  # Prisma
  if (-not (Test-PrismaClientGenerated)) {
    [void]$report.Problems.Add('Prisma Client is not generated. The manager will run: npm run prisma:generate')
  }
  if (-not (Test-Path (Join-Path $BackendDir 'prisma\schema.prisma'))) {
    [void]$report.Problems.Add('backend/prisma/schema.prisma is missing.')
  }

  return $report
}

# ---------------------------------------------------------------------------
# Start / health
# ---------------------------------------------------------------------------
function Start-QuitinService {
  param(
    [string]$Role,
    [string[]]$NpmArguments,
    [string]$WorkingDirectory,
    [string]$Mode
  )

  Initialize-QuitinDirs
  $stdout = Join-Path $LogDir "$Role.out.log"
  $stderr = Join-Path $LogDir "$Role.err.log"

  $commandText = "npm $($NpmArguments -join ' ')"
  Write-Info "Starting ${Role}: $commandText"

  $process = Start-Process -FilePath $env:ComSpec `
    -ArgumentList (@('/c', 'npm') + $NpmArguments) `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  $state = [pscustomobject]@{
    role      = $Role
    pid       = $process.Id
    port      = $(if ($Role -eq 'backend') { $BackendPort } else { $FrontendPort })
    mode      = $Mode
    startedAt = (Get-Date).ToString('o')
    command   = $commandText
    stdout    = $stdout
    stderr    = $stderr
  }
  Save-ServiceState $Role $state

  return $process
}

function Show-LogTail([string]$Path, [int]$Lines = 20) {
  if (-not (Test-Path $Path)) { return }
  Write-Host ''
  Write-Host "  --- last $Lines lines of $Path ---" -ForegroundColor DarkGray
  Get-Content -Path $Path -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  $_" -ForegroundColor DarkGray
  }
}

function Test-ServiceProcessAlive([string]$Role) {
  $state = Read-ServiceState $Role
  if (-not $state) { return $false }
  try {
    $null = Get-Process -Id ([int]$state.pid) -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Get-BackendHealth {
  $response = Invoke-HttpStatus "http://127.0.0.1:$BackendPort/api/health" 5
  if ($response.Status -ne 200) { return $null }
  try {
    return ($response.Body | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-LogFileInfo([string]$Path) {
  if (-not (Test-Path $Path)) {
    return [pscustomobject]@{ Exists = $false; SizeKb = 0; Modified = $null }
  }
  $item = Get-Item $Path
  return [pscustomobject]@{
    Exists   = $true
    SizeKb   = [math]::Round($item.Length / 1KB, 1)
    Modified = $item.LastWriteTime
  }
}
