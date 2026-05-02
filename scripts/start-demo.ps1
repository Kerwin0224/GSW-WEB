[CmdletBinding()]
param(
  [int]$FrontendPort = 3000
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$FrontendRoot = Join-Path $RepoRoot 'web'
$FrontendOutLog = Join-Path $RepoRoot 'web-dev-out.log'
$FrontendErrLog = Join-Path $RepoRoot 'web-dev-err.log'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Reset-Log([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  try { Remove-Item $Path -Force } catch { Clear-Content $Path -Force -ErrorAction SilentlyContinue }
}

function Stop-PortListeners([int]$Port, [string]$Label) {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) { return }

  $ids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  Write-Step "Stopping $Label listener on port ${Port}: $($ids -join ', ')"
  foreach ($id in $ids) {
    if ($id -gt 0) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  }
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch {
      Start-Sleep -Milliseconds 800
      continue
    }
    Start-Sleep -Milliseconds 800
  }
  throw "Timed out waiting for $Url"
}

if (-not (Test-Path (Join-Path $FrontendRoot 'package.json'))) {
  throw "Missing web/package.json. Run this script from the repository checkout."
}

Write-Step 'Cleaning stale frontend process'
Stop-PortListeners -Port $FrontendPort -Label 'web'

Reset-Log $FrontendOutLog
Reset-Log $FrontendErrLog

Write-Step 'Starting web'
$frontendProcess = Start-Process -FilePath 'npm.cmd' `
  -ArgumentList @('run', 'dev', '--', '--port', "$FrontendPort") `
  -WorkingDirectory $FrontendRoot `
  -RedirectStandardOutput $FrontendOutLog `
  -RedirectStandardError $FrontendErrLog `
  -PassThru

Wait-HttpOk -Url "http://127.0.0.1:$FrontendPort" -TimeoutSeconds 60

Write-Host ''
Write-Host 'Frontend product is ready.' -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:$FrontendPort (PID $($frontendProcess.Id))"
Write-Host ''
Write-Host 'Logs:'
Write-Host "  $FrontendOutLog"
Write-Host "  $FrontendErrLog"
