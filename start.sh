#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════╗
# ║         Adaptive Dashboard — Universal Launcher          ║
# ║   Auto-detects: Apple Silicon | NVIDIA | AMD | CPU      ║
# ╚══════════════════════════════════════════════════════════╝

set -eo pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}[dashboard]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }
banner() {
  echo -e "${BOLD}${BLUE}"
  echo "  ╔═══════════════════════════════════════╗"
  echo "  ║      🧠  Adaptive Dashboard           ║"
  echo "  ║      Phi-3.5-mini · Local LLM         ║"
  echo "  ╚═══════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Config ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="${DASHBOARD_MODEL_DIR:-$HOME/.cache/dashboard-models}"
MODEL_FILE="Phi-3.5-mini-instruct-Q4_K_M.gguf"
MODEL_REPO="bartowski/Phi-3.5-mini-instruct-GGUF"
LLM_PORT=8080
UI_PORT=5173
CONTEXT=4096
THREADS=4

# ── Cleanup on exit ──────────────────────────────────────────
declare -a PIDS=()
cleanup() {
  echo ""
  log "Shutting down..."
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
  fi
  wait 2>/dev/null || true
  ok "Goodbye!"
}
trap cleanup EXIT INT TERM

# ── GPU Detection ────────────────────────────────────────────
detect_gpu() {
  GPU_TYPE="cpu"
  NGL=0

  # Apple Silicon (Metal)
  if [[ "$(uname)" == "Darwin" ]]; then
    ARCH=$(uname -m)
    if [[ "$ARCH" == "arm64" ]]; then
      GPU_TYPE="apple"
      NGL=999
      CHIP=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip" | awk -F': ' '{print $2}' | xargs)
      ok "Apple Silicon detected: ${CHIP:-M-series}"
      return
    fi
  fi

  # NVIDIA
  if command -v nvidia-smi &>/dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "")
    if [[ -n "$GPU_NAME" ]]; then
      GPU_TYPE="nvidia"
      NGL=999
      ok "NVIDIA GPU detected: $GPU_NAME"
      return
    fi
  fi

  # AMD (ROCm)
  if command -v rocm-smi &>/dev/null || [[ -d /opt/rocm ]]; then
    GPU_NAME=$(rocm-smi --showproductname 2>/dev/null | grep "GPU" | head -1 | awk -F': ' '{print $2}' || echo "AMD GPU")
    GPU_TYPE="amd"
    NGL=999
    ok "AMD GPU detected: ${GPU_NAME:-AMD GPU}"
    return
  fi

  # AMD via lspci fallback
  if command -v lspci &>/dev/null; then
    AMD=$(lspci 2>/dev/null | grep -i "AMD\|Radeon" | grep -i "VGA\|3D\|Display" | head -1 || true)
    if [[ -n "$AMD" ]]; then
      GPU_TYPE="amd"
      NGL=999
      warn "AMD GPU found (ROCm not installed — using CPU offload): $AMD"
      NGL=0  # safe fallback if no ROCm
      return
    fi
  fi

  warn "No GPU detected — running on CPU (slower)"
  NGL=0
  THREADS=8
}

# ── Dependency checks ────────────────────────────────────────
check_deps() {
  log "Checking dependencies..."

  # llama-server
  if ! command -v llama-server &>/dev/null; then
    echo ""
    warn "llama-server not found. Install options:"
    echo ""
    if [[ "$(uname)" == "Darwin" ]]; then
      echo -e "  ${BOLD}Homebrew (recommended):${NC}"
      echo "    brew install llama.cpp"
      echo ""
      echo -e "  ${BOLD}Or build from source:${NC}"
      echo "    git clone https://github.com/ggerganov/llama.cpp"
      echo "    cd llama.cpp && cmake -B build -DLLAMA_METAL=ON && cmake --build build -j8"
      echo "    cp build/bin/llama-server /usr/local/bin/"
    elif [[ "$GPU_TYPE" == "nvidia" ]]; then
      echo -e "  ${BOLD}NVIDIA (CUDA):${NC}"
      echo "    git clone https://github.com/ggerganov/llama.cpp"
      echo "    cd llama.cpp && cmake -B build -DGGML_CUDA=ON && cmake --build build -j8"
      echo "    sudo cp build/bin/llama-server /usr/local/bin/"
    elif [[ "$GPU_TYPE" == "amd" ]]; then
      echo -e "  ${BOLD}AMD (ROCm):${NC}"
      echo "    git clone https://github.com/ggerganov/llama.cpp"
      echo "    cd llama.cpp && cmake -B build -DGGML_HIP=ON && cmake --build build -j8"
      echo "    sudo cp build/bin/llama-server /usr/local/bin/"
    else
      echo -e "  ${BOLD}CPU only:${NC}"
      echo "    git clone https://github.com/ggerganov/llama.cpp"
      echo "    cd llama.cpp && cmake -B build && cmake --build build -j8"
      echo "    sudo cp build/bin/llama-server /usr/local/bin/"
    fi
    echo ""
    echo "  Or run: ./scripts/install-llama.sh"
    echo ""
    err "Please install llama-server and re-run."
  fi
  ok "llama-server found: $(which llama-server)"

  # Node.js
  if ! command -v node &>/dev/null; then
    echo ""
    warn "Node.js not found."
    if [[ "$(uname)" == "Darwin" ]]; then
      echo "  Install: brew install node"
    else
      echo "  Install: https://nodejs.org  or  curl -fsSL https://fnm.vercel.app/install | bash"
    fi
    err "Please install Node.js (v18+) and re-run."
  fi
  NODE_VER=$(node --version)
  ok "Node.js found: $NODE_VER"
}

# ── Model download ───────────────────────────────────────────
ensure_model() {
  mkdir -p "$MODEL_DIR"
  MODEL_PATH="$MODEL_DIR/$MODEL_FILE"

  if [[ -f "$MODEL_PATH" ]]; then
    SIZE=$(du -sh "$MODEL_PATH" | awk '{print $1}')
    ok "Model ready: $MODEL_FILE ($SIZE)"
    return
  fi

  log "Model not found. Downloading Phi-3.5-mini-instruct Q4_K_M (~2.4GB)..."
  echo -e "${YELLOW}  This only happens once. Location: $MODEL_DIR${NC}"
  echo ""

  # Try huggingface-cli (only if it supports 'download' subcommand — v0.16+)
  if command -v huggingface-cli &>/dev/null && huggingface-cli download --help &>/dev/null 2>&1; then
    huggingface-cli download "$MODEL_REPO" "$MODEL_FILE" \
      --local-dir "$MODEL_DIR" --local-dir-use-symlinks False
  # Try python hf_hub
  elif command -v python3 &>/dev/null && python3 -c "import huggingface_hub" 2>/dev/null; then
    python3 -c "
from huggingface_hub import hf_hub_download
print('Downloading via huggingface_hub...')
path = hf_hub_download(
  repo_id='$MODEL_REPO',
  filename='$MODEL_FILE',
  local_dir='$MODEL_DIR'
)
print(f'Saved to: {path}')
"
  # Fallback: curl (macOS always has it) or wget
  else
    HF_URL="https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/$MODEL_FILE"
    if command -v curl &>/dev/null; then
      log "Downloading via curl..."
      curl -L --progress-bar -o "$MODEL_PATH" "$HF_URL"
    elif command -v wget &>/dev/null; then
      wget --show-progress -O "$MODEL_PATH" "$HF_URL"
    else
      err "No download tool found. Run: pip install huggingface-hub  then re-run this script."
    fi
  fi

  if [[ -f "$MODEL_PATH" ]]; then
    SIZE=$(du -sh "$MODEL_PATH" | awk '{print $1}')
    ok "Model downloaded: $MODEL_FILE ($SIZE)"
  else
    err "Model download failed. Try manually placing the GGUF in: $MODEL_DIR"
  fi
}

# ── Start llama-server ───────────────────────────────────────
start_llm() {
  log "Starting llama-server on port $LLM_PORT..."
  log "  GPU: $GPU_TYPE | NGL: $NGL | Threads: $THREADS | Context: $CONTEXT"

  # Build flash-attention flag (supported in recent llama.cpp builds)
  FA_FLAG=""
  if llama-server --help 2>&1 | grep -q "\-fa\|flash.attn"; then
    FA_FLAG="-fa"
  fi

  llama-server \
    -m "$MODEL_DIR/$MODEL_FILE" \
    -c $CONTEXT \
    -ngl $NGL \
    -t $THREADS \
    --port $LLM_PORT \
    --host 0.0.0.0 \
    $FA_FLAG \
    --log-disable \
    > "$SCRIPT_DIR/.llm.log" 2>&1 &

  LLM_PID=$!
  PIDS+=($LLM_PID)

  # Wait for server to be ready
  echo -n "  Waiting for LLM server"
  for i in $(seq 1 40); do
    sleep 0.75
    if curl -sf "http://localhost:$LLM_PORT/health" &>/dev/null; then
      echo ""
      ok "LLM server ready (pid: $LLM_PID)"
      return
    fi
    echo -n "."
    # Check if process died
    if ! kill -0 "$LLM_PID" 2>/dev/null; then
      echo ""
      err "llama-server crashed. Check .llm.log:\n$(tail -20 "$SCRIPT_DIR/.llm.log")"
    fi
  done
  echo ""
  warn "LLM server slow to start — check .llm.log if UI doesn't work"
}

# ── Start frontend ───────────────────────────────────────────
start_frontend() {
  FRONTEND_DIR="$SCRIPT_DIR/frontend"
  log "Starting frontend..."

  cd "$FRONTEND_DIR"

  if [[ ! -d "node_modules" ]]; then
    log "Installing npm dependencies (first run)..."
    npm install --silent
    ok "Dependencies installed"
  fi

  npm run dev > "$SCRIPT_DIR/.ui.log" 2>&1 &
  UI_PID=$!
  PIDS+=($UI_PID)

  # Wait for UI
  echo -n "  Waiting for UI"
  for i in $(seq 1 30); do
    sleep 0.5
    if curl -sf "http://localhost:$UI_PORT" &>/dev/null; then
      echo ""
      ok "UI ready (pid: $UI_PID)"
      return
    fi
    echo -n "."
  done
  echo ""
  warn "UI slow to start — check .ui.log"
}

# ── Open browser ─────────────────────────────────────────────
open_browser() {
  sleep 0.5
  URL="http://localhost:$UI_PORT"
  if [[ "$(uname)" == "Darwin" ]]; then
    open "$URL" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$URL" 2>/dev/null || true
  elif command -v wslview &>/dev/null; then
    wslview "$URL" 2>/dev/null || true
  fi
}

# ── Main ─────────────────────────────────────────────────────
main() {
  banner
  detect_gpu
  check_deps
  ensure_model
  echo ""
  start_llm
  start_frontend
  echo ""
  echo -e "${BOLD}${GREEN}  ✨ Dashboard running!${NC}"
  echo -e "  ${CYAN}UI:${NC}  http://localhost:$UI_PORT"
  echo -e "  ${CYAN}LLM:${NC} http://localhost:$LLM_PORT"
  echo -e "  ${CYAN}GPU:${NC} $GPU_TYPE (ngl=$NGL)"
  echo ""
  echo -e "  Press ${BOLD}Ctrl+C${NC} to stop"
  echo ""

  open_browser &

  # Keep alive and tail logs on error
  wait
}

main "$@"
