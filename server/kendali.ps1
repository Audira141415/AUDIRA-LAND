# AUDIRA LAND - kendali server untuk Windows (dipanggil start.bat / stop.bat).
# Semua komponen (web, API, WebSocket Taman/Pantai/Pesta, cadangan DB harian) ada di satu proses: node server/server.mjs.
param([ValidateSet('start', 'stop', 'status')][string]$Aksi = 'status')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root 'server\data'
$pidFile = Join-Path $data 'server.pid'
$log = Join-Path $data 'server.log'
$errLog = Join-Path $data 'server.err.log'
New-Item -ItemType Directory -Force $data | Out-Null

# port dari server/.env (bawaan 5173)
$port = 5173
$envFile = Join-Path $root 'server\.env'
if (Test-Path $envFile) {
  foreach ($l in Get-Content $envFile) { if ($l -match '^\s*PORT\s*=\s*(\d+)') { $port = [int]$Matches[1] } }
}
$url = "http://localhost:$port"

# hanya proses node yang menjalankan server/server.mjs milik folder ini (bukan aplikasi lain di port yang sama)
function Get-AudiraProc {
  $self = [regex]::Escape((Join-Path $root 'server\server.mjs'))
  Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object {
    $cl = $_.CommandLine
    if (-not $cl -or $cl -notmatch 'server[\\/]server\.mjs') { return $false }
    if ($cl -match $self) { return $true }
    # dijalankan dengan path relatif: cocokkan folder kerja lewat berkas PID
    if ((Test-Path $pidFile) -and ((Get-Content $pidFile -ErrorAction SilentlyContinue) -eq "$($_.ProcessId)")) { return $true }
    return $false
  }
}

# PID yang sedang LISTEN di port ini (lewat netstat: Get-NetTCPConnection tidak andal di Windows PowerShell 5)
function Get-PortOwner {
  foreach ($l in (netstat -ano -p tcp)) {
    # soket LISTEN punya alamat lawan 0.0.0.0:0 / [::]:0 (teks status bisa diterjemahkan sesuai bahasa Windows)
    if ($l -match "^\s*TCP\s+\S+:$port\s+(0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)\s*$") { return [int]$Matches[2] }
  }
  return $null
}

# cadangan: coba sambung langsung ke port (berhasil = ada yang mendengarkan)
function Test-PortOpen {
  $c = New-Object System.Net.Sockets.TcpClient
  try { return $c.ConnectAsync('127.0.0.1', $port).Wait(400) -and $c.Connected } catch { return $false } finally { $c.Dispose() }
}

function Start-Audira {
  $jalan = @(Get-AudiraProc)
  if ($jalan.Count) { Write-Host "[i] AUDIRA LAND sudah jalan (PID $($jalan[0].ProcessId)) di $url"; return 0 }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host '[X] Node.js tidak ditemukan. Pasang Node.js 22.13 atau lebih baru: https://nodejs.org'; return 1 }
  $busy = Get-PortOwner
  if ($busy -or (Test-PortOpen)) {
    $o = if ($busy) { Get-CimInstance Win32_Process -Filter "ProcessId=$busy" }
    $siapa = if ($o) { "$($o.Name) (PID $($o.ProcessId))" } else { 'aplikasi lain' }
    Write-Host "[X] Port $port sudah dipakai $siapa, bukan AUDIRA LAND."
    Write-Host '    Tutup aplikasi itu, atau ganti PORT di server\.env, lalu jalankan start.bat lagi.'
    return 2
  }
  $p = Start-Process -FilePath (Get-Command node).Source -ArgumentList "`"$(Join-Path $root 'server\server.mjs')`"" `
    -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errLog -PassThru
  Set-Content -Path $pidFile -Value $p.Id
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if ($p.HasExited) { break }
    if ((Get-PortOwner) -or (Test-PortOpen)) { break }
  }
  if ($p.HasExited) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host '[X] Server gagal jalan. Isi log terakhir:'
    if (Test-Path $errLog) { Get-Content $errLog -Tail 15 | Out-Host }
    if (Test-Path $log) { Get-Content $log -Tail 5 | Out-Host }
    return 3
  }
  Write-Host "[OK] AUDIRA LAND jalan (PID $($p.Id))"
  Write-Host "     Peta : $url"
  Write-Host "     Admin: $url/admin"
  Write-Host '     Log  : server\data\server.log'
  if ($env:AUDIRA_NO_BROWSER -ne '1') { Start-Process $url }
  return 0
}

function Stop-Audira {
  $jalan = @(Get-AudiraProc)
  if (-not $jalan.Count) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host '[i] AUDIRA LAND tidak sedang jalan.'
    return 0
  }
  foreach ($p in $jalan) {
    # Windows tidak punya SIGTERM untuk proses tersembunyi; SQLite tetap aman (transaksi berjurnal)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] AUDIRA LAND dihentikan (PID $($p.ProcessId))."
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  return 0
}

switch ($Aksi) {
  'start' { exit (Start-Audira) }
  'stop' { exit (Stop-Audira) }
  'status' {
    $jalan = @(Get-AudiraProc)
    if ($jalan.Count) { Write-Host "[i] Jalan (PID $($jalan[0].ProcessId)) di $url" } else { Write-Host '[i] Tidak jalan.' }
  }
}
