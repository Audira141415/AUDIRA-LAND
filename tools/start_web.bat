@echo off
title AUDIRA-LAND: Web 3D Local Server
cd /d "%~dp0\..\web"
echo =========================================================================
echo  AUDIRA-LAND: Web 3D Local Server (Tahap 02 - Peta Deterministik 3D)
echo  Arsitektur Zero-Server-Cost (Pola Republik Netizenia v2)
echo =========================================================================
echo.
echo Membuka browser di: http://localhost:8417
start http://localhost:8417
echo Menjalankan HTTP Server di port 8417... Tekan Ctrl+C untuk berhenti.
echo.
python "%~dp0dev_server.py" 8417
pause
