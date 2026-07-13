param(
  [string]$Root = (Get-Location).Path,
  [int]$Port = 4217
)

$rootPath = (Resolve-Path -LiteralPath $Root).Path
$pidFile = Join-Path $rootPath 'api-pressure-lab.pid'
$server = Join-Path $rootPath 'server\index.js'
$targetIds = New-Object 'System.Collections.Generic.List[int]'
$trustedTargets = New-Object 'System.Collections.Generic.List[int]'

function Add-TargetId {
  param(
    [object]$Value,
    [switch]$Trusted
  )

  if ($null -eq $Value) {
    return
  }

  $text = [string]$Value
  if ($text -match '^\d+$') {
    if ($Trusted) {
      [void]$script:trustedTargets.Add([int]$text)
    } else {
      [void]$script:targetIds.Add([int]$text)
    }
  }
}

function Test-ProjectServerProcess {
  param([object]$Process)

  if (-not $Process -or $Process.Name -ne 'node.exe') {
    return $false
  }

  $commandLine = [string]$Process.CommandLine
  return $commandLine -like ('*' + $server + '*')
}

if (Test-Path -LiteralPath $pidFile) {
  $raw = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  Add-TargetId $raw -Trusted
}

if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    Add-TargetId $connection.OwningProcess
  }
} else {
  $lines = netstat -ano
  foreach ($line in $lines) {
    $parts = ($line -split '\s+') | Where-Object { $_ }
    if ($parts.Count -ge 5 -and $parts[1] -like "*:$Port" -and $parts[3] -eq 'LISTENING') {
      Add-TargetId $parts[-1]
    }
  }
}

$matches = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { Test-ProjectServerProcess $_ }
foreach ($match in $matches) {
  Add-TargetId $match.ProcessId
}

$safeTargets = @()
foreach ($id in ($trustedTargets | Select-Object -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $id) -ErrorAction SilentlyContinue
  if (Test-ProjectServerProcess $process) {
    $safeTargets += [int]$id
  }
}

foreach ($id in ($targetIds | Select-Object -Unique)) {
  $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $id) -ErrorAction SilentlyContinue
  if (Test-ProjectServerProcess $process) {
    $safeTargets += [int]$id
  }
}

$safeTargets = $safeTargets | Select-Object -Unique
foreach ($id in $safeTargets) {
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  Write-Output ('Stopped PID: ' + $id)
}

if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

if ($safeTargets.Count -eq 0) {
  Write-Output 'No running project server found.'
}
