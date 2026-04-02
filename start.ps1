#Requires -Version 5.1
<#
.SYNOPSIS
  Adaptive Dashboard — Universal Launcher (Windows / PowerShell)
  Mirrors start.sh: NVIDIA / AMD / CPU, model download, llama-server, search, Vite UI.
#>
$ErrorActionPreference = 'Stop'

# ── Colors ────────────────────────────────────────────────────
function Write-LogDash { param([string]$Message) Write-Host "[dashboard] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[✓] $Message" -ForegroundColor Green }
function Write-WarnDash { param([string]$Message) Write-Host "[!] $Message" -ForegroundColor Yellow }
function Write-ErrDash { param([string]$Message) Write-Host "[✗] $Message" -ForegroundColor Red; exit 1 }
function Write-Banner {
  Write-Host ""
  Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor Blue
  Write-Host "  ║      🧠  Adaptive Dashboard           ║" -ForegroundColor Blue
  Write-Host "  ║      Phi-3.5-mini · Local LLM         ║" -ForegroundColor Blue
  Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor Blue
  Write-Host ""
}

# ── Config ────────────────────────────────────────────────────
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Import-DotEnv {
  param([string]$EnvPath)
  if (-not (Test-Path -LiteralPath $EnvPath)) { return }
  Get-Content -LiteralPath $EnvPath -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*#' -or $line -eq '') { return }
    if ($line -match '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $key = $matches[1]
      $val = $matches[2].Trim()
      if (($val.Length -ge 2) -and (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'")))) {
        $val = $val.Substring(1, $val.Length - 2)
      }
      [Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
  }
}

Import-DotEnv (Join-Path $ScriptDir '.env')

$homeModels = Join-Path $env:USERPROFILE '.cache\dashboard-models'
$script:ModelDir = if ($env:DASHBOARD_MODEL_DIR) { $env:DASHBOARD_MODEL_DIR } else { $homeModels }
$script:ModelFile = 'Phi-3.5-mini-instruct-Q4_K_M.gguf'
$script:ModelRepo = 'bartowski/Phi-3.5-mini-instruct-GGUF'
$script:ModelSha256 = 'e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5'
$script:LlmPort = 8080
$script:UiPort = 5173
$script:Context = if ($env:LLM_CONTEXT) { $env:LLM_CONTEXT } else { '4096' }
$script:Threads = if ($env:LLM_THREADS) { $env:LLM_THREADS } else { '4' }
$script:SearchPort = 8082

# PIDs we started (kill whole tree on exit)
$script:TrackedPids = [System.Collections.ArrayList]@()
$script:CleanupDone = $false

function Stop-ProcessTree {
  param([int]$ProcessId)
  if (-not $ProcessId) { return }
  $null = & taskkill.exe /T /F /PID $ProcessId 2>$null
  if ($LASTEXITCODE -ne 0) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Cleanup {
  if ($script:CleanupDone) { return }
  $script:CleanupDone = $true
  Write-Host ""
  Write-LogDash "Shutting down..."
  for ($i = $script:TrackedPids.Count - 1; $i -ge 0; $i--) {
    Stop-ProcessTree -ProcessId $script:TrackedPids[$i]
  }
  Write-Ok "Goodbye!"
}

# ── GPU Detection (Windows) ───────────────────────────────────
function Get-DashboardGpu {
  $script:GpuType = 'cpu'
  $script:Ngl = 0

  $nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if ($nvsmi) {
    try {
      $gpuName = (& nvidia-smi.exe --query-gpu=name --format=csv,noheader 2>$null | Select-Object -First 1).Trim()
      if ($gpuName) {
        $script:GpuType = 'nvidia'
        $script:Ngl = 999
        Write-Ok "NVIDIA GPU detected: $gpuName"
        return
      }
    } catch { }
  }

  $rocm = Get-Command rocm-smi -ErrorAction SilentlyContinue
  if ($rocm) {
    try {
      $line = & rocm-smi.exe --showproductname 2>$null | Where-Object { $_ -match 'GPU' } | Select-Object -First 1
      $gpuName = if ($line -match ':\s*(.+)') { $matches[1].Trim() } else { 'AMD GPU' }
      $script:GpuType = 'amd'
      $script:Ngl = 999
      Write-Ok "AMD GPU detected: $gpuName"
      return
    } catch { }
  }

  try {
    $adapters = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue
    foreach ($a in $adapters) {
      $n = $a.Name
      if ($n -match 'Radeon|AMD') {
        Write-WarnDash "AMD adapter found (ROCm not in PATH — CPU offload): $n"
        $script:GpuType = 'amd'
        $script:Ngl = 0
        return
      }
    }
  } catch { }

  Write-WarnDash "No GPU offload path detected — running on CPU (slower)"
  $script:Ngl = 0
  if (-not $env:LLM_THREADS) { $script:Threads = '8' }
}

# ── Dependency checks ─────────────────────────────────────────
function Test-DashboardDeps {
  Write-LogDash "Checking dependencies..."

  $llama = Get-Command llama-server -ErrorAction SilentlyContinue
  if (-not $llama) {
    Write-Host ""
    Write-WarnDash "llama-server not found. Install options:"
    Write-Host ""
    if ($script:GpuType -eq 'nvidia') {
      Write-Host "  NVIDIA (CUDA):" -ForegroundColor White
      Write-Host "    git clone https://github.com/ggerganov/llama.cpp"
      Write-Host "    cd llama.cpp; cmake -B build -DGGML_CUDA=ON; cmake --build build --config Release -j 8"
      Write-Host "    Copy build\bin\Release\llama-server.exe (or build\bin\llama-server.exe) to your PATH"
    } elseif ($script:GpuType -eq 'amd') {
      Write-Host "  AMD (ROCm / Vulkan builds vary on Windows):" -ForegroundColor White
      Write-Host "    See https://github.com/ggerganov/llama.cpp — build with your supported backend"
    } else {
      Write-Host "  CPU only:" -ForegroundColor White
      Write-Host "    git clone https://github.com/ggerganov/llama.cpp"
      Write-Host "    cd llama.cpp; cmake -B build; cmake --build build --config Release -j 8"
    }
    Write-Host ""
    Write-Host "  Or use WSL and run ./start.sh"
    Write-Host ""
    Write-ErrDash "Please install llama-server and re-run."
  }
  Write-Ok "llama-server found: $($llama.Source)"

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    Write-Host ""
    Write-WarnDash "Node.js not found."
    Write-Host "  Install: https://nodejs.org  (v18+)"
    Write-ErrDash "Please install Node.js and re-run."
  }
  $nodeVer = & node.exe --version
  Write-Ok "Node.js found: $nodeVer"
}

# ── Model download ────────────────────────────────────────────
function Ensure-DashboardModel {
  New-Item -ItemType Directory -Force -Path $script:ModelDir | Out-Null
  $modelPath = Join-Path $script:ModelDir $script:ModelFile

  if (-not (Test-Path -LiteralPath $modelPath)) {
    Write-LogDash "Model not found. Downloading Phi-3.5-mini-instruct Q4_K_M (~2.4GB)..."
    Write-Host "  This only happens once. Location: $($script:ModelDir)" -ForegroundColor Yellow
    Write-Host ""

    $hfCli = Get-Command huggingface-cli -ErrorAction SilentlyContinue
    $usedHf = $false
    if ($hfCli) {
      try {
        $hfExe = $hfCli.Source
        $help = & $hfExe download --help 2>&1 | Out-String
        if ($help -match 'download') {
          & $hfExe download $script:ModelRepo $script:ModelFile `
            --local-dir $script:ModelDir --local-dir-use-symlinks False
          if ($LASTEXITCODE -eq 0) { $usedHf = $true }
        }
      } catch { $usedHf = $false }
    }

    if (-not $usedHf) {
      $py = Get-Command python -ErrorAction SilentlyContinue
      if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
      if ($py) {
        $pyTmp = Join-Path ([System.IO.Path]::GetTempPath()) ("hf_dl_{0}.py" -f [Guid]::NewGuid().ToString('N'))
        @'
import sys
from huggingface_hub import hf_hub_download
print("Downloading via huggingface_hub...")
path = hf_hub_download(repo_id=sys.argv[1], filename=sys.argv[2], local_dir=sys.argv[3])
print("Saved to:", path)
'@ | Set-Content -LiteralPath $pyTmp -Encoding UTF8
        try {
          & $py.Source $pyTmp $script:ModelRepo $script:ModelFile $script:ModelDir
          if ($LASTEXITCODE -eq 0) { $usedHf = $true }
        } catch { $usedHf = $false }
        finally { Remove-Item -LiteralPath $pyTmp -Force -ErrorAction SilentlyContinue }
      }
    }

    if (-not (Test-Path -LiteralPath $modelPath)) {
      $hfUrl = "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/$($script:ModelFile)"
      Write-LogDash "Downloading via Invoke-WebRequest..."
      $progress = $ProgressPreference
      $ProgressPreference = 'SilentlyContinue'
      try {
        Invoke-WebRequest -Uri $hfUrl -OutFile $modelPath -UseBasicParsing
      } finally {
        $ProgressPreference = $progress
      }
    }

    if (-not (Test-Path -LiteralPath $modelPath)) {
      Write-ErrDash "Model download failed. Try manually placing the GGUF in: $($script:ModelDir)"
    }
    $size = (Get-Item -LiteralPath $modelPath).Length / 1MB
    Write-Ok "Model downloaded: $($script:ModelFile) (~$([math]::Round($size,1)) MB)"
  } else {
    $size = (Get-Item -LiteralPath $modelPath).Length / 1MB
    Write-Ok "Model ready: $($script:ModelFile) (~$([math]::Round($size,1)) MB)"
  }

  Write-LogDash "Verifying SHA-256..."
  $hash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $script:ModelSha256) {
    Write-ErrDash "SHA-256 mismatch — file may be corrupt. Remove it and re-run."
  }
  Write-Ok "Integrity check passed"
}

function Test-LlamaServerSupportsFlashAttn {
  try {
    $exe = (Get-Command llama-server -ErrorAction Stop).Source
    $help = & $exe --help 2>&1 | Out-String
    return ($help -match '-fa' -or $help -match 'flash')
  } catch {
    return $false
  }
}

# ── Start llama-server ────────────────────────────────────────
function Start-DashboardLlm {
  Write-LogDash "Starting llama-server on port $($script:LlmPort)..."
  Write-LogDash "  GPU: $($script:GpuType) | NGL: $($script:Ngl) | Threads: $($script:Threads) | Context: $($script:Context)"

  $llmLog = Join-Path $ScriptDir '.llm.log'
  $fa = ''
  if (Test-LlamaServerSupportsFlashAttn) { $fa = '-fa ' }

  $llamaExe = (Get-Command llama-server -ErrorAction Stop).Source
  $modelArg = Join-Path $script:ModelDir $script:ModelFile
  $argLine = @(
    "-m `"$modelArg`"",
    "-c $($script:Context)",
    "-ngl $($script:Ngl)",
    "-t $($script:Threads)",
    "--port $($script:LlmPort)",
    "--host 127.0.0.1",
    $fa.Trim(),
    "--log-disable"
  ) -join ' '

  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "`"$llamaExe`" $argLine > `"$llmLog`" 2>&1") `
    -WindowStyle Hidden -PassThru
  [void]$script:TrackedPids.Add($proc.Id)

  Write-Host -NoNewline "  Waiting for LLM server"
  for ($i = 1; $i -le 120; $i++) {
    Start-Sleep -Milliseconds 750
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$($script:LlmPort)/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -eq 200) {
        Write-Host ""
        Write-Ok "LLM server ready (pid: $($proc.Id))"
        return
      }
    } catch { }

    Write-Host -NoNewline "."
    try {
      $p = Get-Process -Id $proc.Id -ErrorAction Stop
      if ($p.HasExited) { throw 'exited' }
    } catch {
      Write-Host ""
      $tail = if (Test-Path $llmLog) { Get-Content -LiteralPath $llmLog -Tail 20 -ErrorAction SilentlyContinue } else { @() }
      Write-ErrDash "llama-server crashed. Check .llm.log:`n$($tail -join "`n")"
    }
  }
  Write-Host ""
  $tail = if (Test-Path $llmLog) { Get-Content -LiteralPath $llmLog -Tail 20 -ErrorAction SilentlyContinue } else { @() }
  Write-ErrDash "LLM server did not start within the timeout. Check .llm.log:`n$($tail -join "`n")"
}

# ── Search server ─────────────────────────────────────────────
function Start-DashboardSearch {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-WarnDash "node not found — TCD course search will be unavailable"
    return
  }
  Write-LogDash "Starting search server on port $($script:SearchPort)..."
  $searchLog = Join-Path $ScriptDir '.search.log'
  $searchScript = Join-Path $ScriptDir 'backend\search-server.mjs'
  $nodeExe = (Get-Command node -ErrorAction Stop).Source
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "set SEARCH_PORT=$($script:SearchPort)&& `"$nodeExe`" `"$searchScript`" > `"$searchLog`" 2>&1") `
    -WindowStyle Hidden -PassThru
  [void]$script:TrackedPids.Add($proc.Id)

  for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Milliseconds 400
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$($script:SearchPort)/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -eq 200) {
        Write-Ok "Search server ready (pid: $($proc.Id))"
        return
      }
    } catch { }

    try {
      $null = Get-Process -Id $proc.Id -ErrorAction Stop
    } catch {
      Write-WarnDash "Search server crashed — check .search.log"
      return
    }
  }
  Write-WarnDash "Search server slow to start — check .search.log"
}

# ── Frontend ─────────────────────────────────────────────────
function Start-DashboardFrontend {
  $frontendDir = Join-Path $ScriptDir 'frontend'
  Write-LogDash "Starting frontend..."

  Push-Location $frontendDir
  try {
    $pkg = Join-Path $frontendDir 'package.json'
    $lock = Join-Path $frontendDir 'node_modules\.package-lock.json'
    $needInstall = (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) -or
      (-not (Test-Path $lock)) -or
      ((Get-Item $pkg).LastWriteTime -gt (Get-Item $lock).LastWriteTime)
    if ($needInstall) {
      Write-LogDash "Installing npm dependencies..."
      & npm.cmd install --silent
      if ($LASTEXITCODE -ne 0) { Write-ErrDash "npm install failed." }
      Write-Ok "Dependencies installed"
    }
  } finally {
    Pop-Location
  }

  $uiLog = Join-Path $ScriptDir '.ui.log'
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "cd /d `"$frontendDir`" && npm run dev > `"$uiLog`" 2>&1") `
    -WindowStyle Hidden -PassThru
  [void]$script:TrackedPids.Add($proc.Id)

  Write-Host -NoNewline "  Waiting for UI"
  for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$($script:UiPort)/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -eq 200) {
        Write-Host ""
        Write-Ok "UI ready (pid: $($proc.Id))"
        return
      }
    } catch { }

    Write-Host -NoNewline "."
    try {
      $null = Get-Process -Id $proc.Id -ErrorAction Stop
    } catch {
      Write-Host ""
      $tail = if (Test-Path $uiLog) { Get-Content -LiteralPath $uiLog -Tail 20 -ErrorAction SilentlyContinue } else { @() }
      Write-ErrDash "Frontend process crashed. Check .ui.log:`n$($tail -join "`n")"
    }
  }
  Write-Host ""
  Write-WarnDash "UI slow to start — check .ui.log"
}

# ── Main ──────────────────────────────────────────────────────
function Main {
  Write-Banner
  Get-DashboardGpu
  if ($env:LLM_NGL) { $script:Ngl = $env:LLM_NGL }
  Test-DashboardDeps
  Ensure-DashboardModel
  Write-Host ""
  Start-DashboardLlm
  Start-DashboardSearch
  Start-DashboardFrontend
  Write-Host ""
  Write-Host "  ✨ Dashboard running!" -ForegroundColor Green
  Write-Host "  UI:     http://localhost:$($script:UiPort)" -ForegroundColor Cyan
  Write-Host "  LLM:    http://localhost:$($script:LlmPort)" -ForegroundColor Cyan
  Write-Host "  Search: http://127.0.0.1:$($script:SearchPort)  (on-device, DuckDuckGo)" -ForegroundColor Cyan
  Write-Host "  GPU:    $($script:GpuType) (ngl=$($script:Ngl))" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Press Ctrl+C to stop" -ForegroundColor White
  Write-Host ""

  $browserUrl = "http://localhost:$($script:UiPort)"
  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
    "Start-Sleep -Milliseconds 500; Start-Process '$browserUrl' -ErrorAction SilentlyContinue"
  ) | Out-Null

  $handler = [ConsoleCancelEventHandler]{
    param($sender, $e)
    $e.Cancel = $true
    Invoke-Cleanup
    [Environment]::Exit(0)
  }
  [Console]::CancelKeyPress += $handler
  try {
    while ($true) { Start-Sleep -Seconds 3600 }
  } finally {
    [Console]::CancelKeyPress -= $handler
    Invoke-Cleanup
  }
}

Main
