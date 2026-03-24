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
  elif command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
    PLATFORM="linux-cuda"
  elif [[ -d /opt/rocm ]]; then
    PLATFORM="linux-rocm"
  else
    PLATFORM="cpu"
  fi

  ok "Platform: $PLATFORM"
}

check_build_deps() {
  log "Checking build dependencies..."

  local missing=()

  command -v git   &>/dev/null || missing+=(git)
  command -v cmake &>/dev/null || missing+=(cmake)
  command -v make  &>/dev/null || missing+=(build-essential)

  if [[ ${#missing[@]} -gt 0 ]]; then
    log "Installing missing deps: ${missing[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y git cmake build-essential ninja-build libcurl4-openssl-dev
  fi

  ok "Build dependencies ready"

  # Check nvcc for CUDA builds
  if [[ "$PLATFORM" == "linux-cuda" ]]; then
    if ! command -v nvcc &>/dev/null; then
      # Try common CUDA paths
      for p in /usr/local/cuda/bin /usr/local/cuda-*/bin; do
        if [[ -x "$p/nvcc" ]]; then
          export PATH="$p:$PATH"
          ok "Found nvcc at $p"
          break
        fi
      done
      if ! command -v nvcc &>/dev/null; then
        err "nvcc not found. Install CUDA Toolkit: sudo apt install nvidia-cuda-toolkit"
      fi
    fi
    ok "nvcc found: $(nvcc --version | head -1)"
  fi
}

build_from_source() {
  log "Building llama.cpp from source..."

  # macOS: use Homebrew
  if [[ "$PLATFORM" == "macos-metal" ]]; then
    if command -v brew &>/dev/null; then
      brew install llama.cpp
      ok "llama.cpp installed via Homebrew"
      return
    else
      err "Homebrew not found. Install it from https://brew.sh then re-run."
    fi
  fi

  check_build_deps

  mkdir -p "$BUILD_DIR"
  cd "$BUILD_DIR"

  if [[ -d "llama.cpp" ]]; then
    log "Existing clone found — pulling latest..."
    cd llama.cpp
    git pull --ff-only
  else
    log "Cloning llama.cpp (latest)..."
    git clone --depth 1 https://github.com/ggml-org/llama.cpp
    cd llama.cpp
  fi

  log "Configuring for platform: $PLATFORM"
  case "$PLATFORM" in
    linux-cuda)
      cmake -B build \
        -DGGML_CUDA=ON \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=OFF \
        -GNinja
      ;;
    linux-rocm)
      cmake -B build \
        -DGGML_HIP=ON \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=OFF \
        -DAMDGPU_TARGETS="$(rocminfo 2>/dev/null | grep 'gfx' | head -1 | awk '{print $2}' || echo 'gfx906')" \
        -GNinja
      ;;
    cpu)
      cmake -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=OFF \
        -GNinja
      ;;
  esac

  JOBS=$(nproc 2>/dev/null || echo 4)
  log "Compiling with $JOBS threads (this takes a few minutes)..."
  cmake --build build -j "$JOBS" --target llama-server

  # Install binary
  sudo cp build/bin/llama-server "$INSTALL_DIR/"
  sudo chmod +x "$INSTALL_DIR/llama-server"

  ok "llama-server installed to $INSTALL_DIR"
}

verify_install() {
  if ! command -v llama-server &>/dev/null; then
    err "Installation failed — llama-server not found in PATH"
  fi

  local version
  version=$(llama-server --version 2>&1 | head -1)
  ok "llama-server ready: $version"

  if [[ "$PLATFORM" == "linux-cuda" ]]; then
    if llama-server --version 2>&1 | grep -qi "cuda\|CUDA"; then
      ok "CUDA support confirmed ✓"
    else
      warn "CUDA not detected in binary — check that nvcc was found during build"
    fi
  fi
}

main() {
  echo -e "${BOLD}${CYAN}llama.cpp installer${NC}"
  echo ""

  if command -v llama-server &>/dev/null; then
    ok "llama-server already installed: $(which llama-server)"
    warn "To reinstall, remove it first: sudo rm $(which llama-server)"
    exit 0
  fi

  detect_platform
  build_from_source
  verify_install

  echo ""
  ok "All done! Run: bash start.sh"
}

main "$@"
