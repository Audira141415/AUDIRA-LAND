# AUDIRA-LAND: Web 3D Local Server Launcher
$WebDir = Join-Path $PSScriptRoot "..\web"
Set-Location $WebDir

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " AUDIRA-LAND: Web 3D Local Server (Tahap 02 - Peta Deterministik 3D)" -ForegroundColor Yellow
Write-Host " Arsitektur Zero-Server-Cost (Pola Republik Netizenia v2)" -ForegroundColor White
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Membuka browser di: http://localhost:8417..." -ForegroundColor Green
Start-Process "http://localhost:8417"
Write-Host "Menjalankan HTTP Server di port 8417 (Ctrl+C untuk keluar)..." -ForegroundColor Yellow
python -m http.server 8417
