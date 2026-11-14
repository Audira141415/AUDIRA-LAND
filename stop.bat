@echo off
setlocal EnableExtensions
title AUDIRA-LAND: Stop
rem =========================================================================
rem  AUDIRA-LAND - hentikan semua komponen yang dijalankan start.bat
rem  Menghentikan setiap proses tools\dev_server.py milik folder ini
rem  (port berapa pun) beserta jendela "AUDIRA-LAND Server".
rem =========================================================================

cd /d "%~dp0"
set "SERVER=%~dp0tools\dev_server.py"

echo =========================================================================
echo  AUDIRA-LAND : Stop
echo =========================================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = $env:SERVER;" ^
  "$p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($s) };" ^
  "if (-not $p) { Write-Host '[INFO] Tidak ada server AUDIRA-LAND yang berjalan.'; exit 0 }" ^
  "foreach ($x in $p) { Write-Host ('Menghentikan PID ' + $x.ProcessId + ' (' + $x.Name + ')'); Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }" ^
  "Write-Host '[OK] AUDIRA-LAND dihentikan.'"

timeout /t 3 >nul 2>&1
endlocal
exit /b 0
