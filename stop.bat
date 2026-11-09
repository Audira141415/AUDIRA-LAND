@echo off
rem AUDIRA LAND - hentikan server yang dijalankan start.bat (hanya proses milik folder ini).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\kendali.ps1" stop
set rc=%errorlevel%
if not "%rc%"=="0" pause
exit /b %rc%
