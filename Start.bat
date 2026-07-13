@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "APP_PORT=4217"
set "APP_HOST=127.0.0.1"
set "APP_URL=http://%APP_HOST%:%APP_PORT%"
set "PID_FILE=%CD%\api-pressure-lab.pid"
set "LOG_FILE=%CD%\api-pressure-lab.server.log"
set "ERR_LOG_FILE=%CD%\api-pressure-lab.server.err.log"

if /i "%~1"=="stop" goto stop

echo ============================================
echo   API Pressure Lab Launcher
echo ============================================
echo.

echo [1/5] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found. Please install Node.js 20 or newer.
  echo.
  pause
  exit /b 1
)
node --version

echo.
echo [2/5] Checking dependencies...
if not exist "node_modules" (
  echo node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 goto failed
) else (
  echo node_modules found. Skipping npm install.
)

echo.
echo [3/5] Building WebUI...
call npm run build
if errorlevel 1 goto failed

echo.
echo [4/5] Starting server...
call :stop_impl

if exist "%LOG_FILE%" del /f /q "%LOG_FILE%" >nul 2>nul
if exist "%ERR_LOG_FILE%" del /f /q "%ERR_LOG_FILE%" >nul 2>nul
start "" /b node scripts\start-detached-server.cjs
if errorlevel 1 goto failed

echo.
echo [5/5] Waiting for WebUI...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = '%APP_URL%/api/health'; $ok = $false; for ($i = 0; $i -lt 80; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1 | Out-Null; $ok = $true; break } catch { Start-Sleep -Milliseconds 500 } }; if (-not $ok) { Write-Error 'WebUI did not become ready in time. Check api-pressure-lab.server.log and api-pressure-lab.server.err.log.'; exit 1 }"
if errorlevel 1 goto failed

if not "%API_PRESSURE_NO_OPEN%"=="1" start "" "%APP_URL%"
echo.
echo WebUI opened: %APP_URL%
echo Server log: %LOG_FILE%
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C in this window to stop the server and exit.
echo.
if "%API_PRESSURE_NO_WATCH%"=="1" exit /b 0
set "THIS_SCRIPT=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$script = $env:THIS_SCRIPT; Write-Host 'Watching. Press Ctrl+C to stop API Pressure Lab.'; try { [Console]::TreatControlCAsInput = $true; while ($true) { if ([Console]::KeyAvailable) { $key = [Console]::ReadKey($true); if (($key.Key -eq 'C') -and (($key.Modifiers -band [ConsoleModifiers]::Control) -ne 0)) { break } }; Start-Sleep -Milliseconds 150 } } finally { try { [Console]::TreatControlCAsInput = $false } catch {}; if (Test-Path -LiteralPath $script) { $env:API_PRESSURE_NO_PAUSE = '1'; & $script stop } }"
exit /b 0

:failed
echo.
echo Startup failed. Check the messages above.
if exist "%LOG_FILE%" (
  echo.
  echo Last server log lines:
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%LOG_FILE%' -Tail 40 -ErrorAction SilentlyContinue"
)
if exist "%ERR_LOG_FILE%" (
  echo.
  echo Last server error log lines:
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%ERR_LOG_FILE%' -Tail 40 -ErrorAction SilentlyContinue"
)
echo.
pause
exit /b 1

:stop
echo Stopping API Pressure Lab server...
call :stop_impl
if errorlevel 1 (
  echo Failed to stop server.
  if "%API_PRESSURE_NO_PAUSE%"=="1" exit /b 1
  pause
  exit /b 1
)
echo Done.
if "%API_PRESSURE_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0

:stop_impl
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\stop-server.ps1" -Root "%CD%" -Port %APP_PORT%
exit /b %ERRORLEVEL%
