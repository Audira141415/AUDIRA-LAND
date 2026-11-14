@echo off
setlocal EnableExtensions
title AUDIRA-LAND: Start
rem =========================================================================
rem  AUDIRA-LAND - jalankan semua komponen web lokal
rem    1. Cek Python + Node.js
rem    2. npm install (bila web\node_modules belum ada)
rem    3. Build rilis (web\build + index.release.html) - lewati: start.bat nobuild
rem    4. Dev server (tools\dev_server.py) di jendela terpisah, port TETAP 8417
rem    5. Buka browser
rem  Port TETAP 8417 (tidak ikut env PORT). Ubah hanya di baris "set PORT=" bawah,
rem  lalu samakan di .claude\launch.json dan tools\dev_server.py.
rem  Supabase = cloud (web\src\api\config.js), tidak ada servis lokal.
rem  Hentikan semua dengan stop.bat
rem =========================================================================

cd /d "%~dp0"
set "ROOT=%~dp0"
rem Port tetap AUDIRA-LAND - jangan diambil dari env
set "PORT=8417"

echo =========================================================================
echo  AUDIRA-LAND : Start (port %PORT%)
echo =========================================================================

rem --- 1. Prasyarat --------------------------------------------------------
where python >nul 2>&1
if errorlevel 1 (
  echo [GAGAL] Python tidak ditemukan di PATH.
  pause
  exit /b 1
)
set "HAS_NODE=1"
where node >nul 2>&1
if errorlevel 1 (
  set "HAS_NODE=0"
  echo [INFO] Node.js tidak ada - langkah build dilewati, mode dev tetap jalan.
)

rem --- Sudah jalan? --------------------------------------------------------
curl -s -o nul --max-time 2 "http://localhost:%PORT%/" >nul 2>&1
if not errorlevel 1 (
  rem pastikan pemakai port memang dev_server.py AUDIRA-LAND, bukan aplikasi lain
  powershell -NoProfile -Command "$s='%ROOT%tools\dev_server.py'; if (Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($s) }) { exit 0 } else { exit 1 }"
  if errorlevel 1 (
    echo [GAGAL] Port %PORT% dipakai aplikasi lain, bukan AUDIRA-LAND.
    echo        Tutup aplikasi itu, lalu jalankan start.bat lagi.
    netstat -ano | findstr ":%PORT% " | findstr LISTENING
    pause
    exit /b 1
  )
  echo [INFO] AUDIRA-LAND sudah berjalan di port %PORT%.
  echo        Jalankan stop.bat dulu bila ingin restart.
  start "" "http://localhost:%PORT%"
  timeout /t 3 >nul 2>&1
  exit /b 0
)

rem --- 2 + 3. Dependensi dan build -----------------------------------------
if "%HAS_NODE%"=="1" (
  if not exist "%ROOT%web\node_modules" (
    echo [1/3] npm install ...
    pushd "%ROOT%web"
    call npm install --no-audit --no-fund
    popd
  )
  if /I not "%~1"=="nobuild" (
    echo [2/3] Build rilis ...
    pushd "%ROOT%web"
    call npm run build
    if errorlevel 1 echo [PERINGATAN] Build gagal - mode dev tetap dijalankan.
    popd
  ) else (
    echo [2/3] Build dilewati ^(nobuild^).
  )
)

rem --- 4. Dev server -------------------------------------------------------
echo [3/3] Menjalankan dev server ...
start "AUDIRA-LAND Server" /min cmd /c "python "%ROOT%tools\dev_server.py" %PORT%"

rem tunggu port terbuka (maks 15 dtk)
set /a WAITED=0
:waitport
ping -n 2 127.0.0.1 >nul
set /a WAITED+=1
curl -s -o nul --max-time 2 "http://localhost:%PORT%/" >nul 2>&1
if not errorlevel 1 goto ready
if %WAITED% GEQ 15 (
  echo [GAGAL] Server tidak membuka port %PORT% dalam 15 detik.
  echo        Lihat jendela "AUDIRA-LAND Server" untuk pesan error.
  pause
  exit /b 1
)
goto waitport

:ready

rem --- 5. Browser ----------------------------------------------------------
start "" "http://localhost:%PORT%"

echo.
echo  Server berjalan:
echo    Dev     : http://localhost:%PORT%/
echo    Rilis   : http://localhost:%PORT%/index.release.html
echo    HP/LAN  : lihat alamat di jendela "AUDIRA-LAND Server"
echo  Hentikan dengan stop.bat
echo.
timeout /t 5 >nul 2>&1
endlocal
exit /b 0
