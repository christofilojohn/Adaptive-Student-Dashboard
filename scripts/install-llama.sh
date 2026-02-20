#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════╗
# ║   llama.cpp auto-installer for all GPU types      ║
# ╚═══════════════════════════════════════════════════╝

set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}[install]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

INSTALL_DIR="/usr/local/bin"
BUILD_DIR="/tmp/llama-cpp-build"

detect_platform() {
  OS=$(uname)
  ARCH=$(uname -m)

  if [[ "$OS" == "Darwin" && "$ARCH" == "arm64" ]]; then
    PLATFORM="macos-metal"
  elif command -v nvidia-smi &>/dev/null 2>&1; then
    PLATFORM="linux-cuda"
  elif [[ -d /opt/rocm ]]; then
    PLATFORM="linux-rocm"
  else
    PLATFORM="cpu"
  fi

  ok "Platform: $PLATFORM"
}

# Try pre-built binary first (fast path)
try_prebuilt() {
  log "Checking for pre-built binary..."

  # macOS homebrew
  if [[ "$PLATFORM" == "macos-metal" ]] && command -v brew &>/dev/null; then
    log "Installing via Homebrew..."
    brew install llama.cpp
    ok "llama.cpp installed via Homebrew"
    exit 0
  fi

  # GitHub release (Linux CUDA)
  if [[ "$PLATFORM" == "linux-cuda" ]]; then
    CUDA_VER=$(nvidia-smi | grep "CUDA Version" | awk '{print $9}' | cut -d'.' -f1 || echo "12")
    log "Fetching latest llama.cpp release for CUDA $CUDA_VER..."
    LATEST=$(curl -s https://api.github.com/repos/ggerganov/llama.cpp/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
    BINARY_URL="https://github.com/ggerganov/llama.cpp/releases/download/${LATEST}/llama-${LATEST}-bin-ubuntu-x64-cuda-cu${CUDA_VER}.tar.gz"
    if curl --head -sf "$BINARY_URL" &>/dev/null; then
      log "Downloading pre-built binary: $BINARY_URL"
      mkdir -p "$BUILD_DIR"
      curl -L "$BINARY_URL" | tar xz -C "$BUILD_DIR"
      sudo cp "$BUILD_DIR"/llama-server "$INSTALL_DIR/"
      sudo chmod +x "$INSTALL_DIR/llama-server"
      ok "llama-server installed to $INSTALL_DIR"
      exit 0
    fi
    warn "Pre-built binary not found, will build from source..."
  fi
}

# Build from source
build_from_source() {
  log "Building llama.cpp from source..."

  if ! command -v cmake &>/dev/null; then
    err "cmake not found. Install: sudo apt install cmake  or  brew install cmake"
  fi
  if ! command -v git &>/dev/null; then
    err "git not found."
  fi

  mkdir -p "$BUILD_DIR" && cd "$BUILD_DIR"

  if [[ ! -d "llama.cpp" ]]; then
    log "Cloning llama.cpp..."
    git clone --depth 1 https://github.com/ggerganov/llama.cpp
  fi
  cd llama.cpp

  log "Building for platform: $PLATFORM"
  case "$PLATFORM" in
    macos-metal)
      cmake -B build -DLLAMA_METAL=ON -DCMAKE_BUILD_TYPE=Release
      ;;
    linux-cuda)
      cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release
      ;;
    linux-rocm)
      cmake -B build -DGGML_HIP=ON -DCMAKE_BUILD_TYPE=Release \
        -DAMDGPU_TARGETS="$(rocminfo 2>/dev/null | grep 'gfx' | head -1 | awk '{print $2}' || echo 'gfx906')"
      ;;
    cpu)
      cmake -B build -DCMAKE_BUILD_TYPE=Release
      ;;
  esac

  JOBS=$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)
  log "Compiling with $JOBS threads..."
  cmake --build build --config Release -j "$JOBS" --target llama-server

  sudo cp build/bin/llama-server "$INSTALL_DIR/"
  sudo chmod +x "$INSTALL_DIR/llama-server"
  ok "llama-server built and installed to $INSTALL_DIR"
}

main() {
  echo -e "${BOLD}${CYAN}llama.cpp installer${NC}"
  echo ""

  if command -v llama-server &>/dev/null; then
    ok "llama-server already installed: $(which llama-server)"
    exit 0
  fi

  detect_platform
  try_prebuilt
  build_from_source
}

main "$@"
