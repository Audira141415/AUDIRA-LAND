@echo off
rem AUDIRA LAND - jalankan semua komponen (web, API, WebSocket, cadangan DB) di latar belakang.
rem Log: server\data\server.log   Hentikan: stop.bat
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\kendali.ps1" start
set rc=%errorlevel%
if not "%rc%"=="0" pause
exit /b %rc%
